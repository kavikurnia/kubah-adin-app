import {check,num,Fault} from './manual-domain.js?v=variant-options-20260923-r20';

export const VARIANT_FIELDS=['sku','color','size','stock','retail','wholesale','hpp','weight','image'];
export const variantValue=(v,k)=>['retail','wholesale'].includes(k)?v.pricing?.[k]:v[k];
export function setVariantValue(v,k,value){if(['retail','wholesale'].includes(k))v.pricing={...v.pricing,[k]:value};else v[k]=value;}
// Firestore map key order is not an edit. Array order (including photos) is.
export function same(a,b){
 if(Object.is(a,b))return true;
 if(!a||!b||typeof a!=='object'||typeof b!=='object')return false;
 if(Array.isArray(a)||Array.isArray(b))return Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((v,i)=>same(v,b[i]));
 const keys=Object.keys(a);return keys.length===Object.keys(b).length&&keys.every(k=>Object.hasOwn(b,k)&&same(a[k],b[k]));
}
export function imageList(value){
 const rows=(Array.isArray(value)?value:[]).map(i=>typeof i==='string'?{url:i}:i).filter(i=>i?.url);
 const primary=rows.some(i=>i.isPrimary===true);
 return rows.map((i,index)=>({url:String(i.url).trim(),isPrimary:primary?i.isPrimary===true:index===0}));
}
const sameField=(a,b,path)=>path.at(-1)==='images'?same(imageList(a),imageList(b)):same(a,b);
const blank=v=>v==null||String(v).trim()==='';
export function variantNumber(value,field,{optional=false}={}){
 if(blank(value)){check(optional,field+' wajib diisi.','invalid-argument');return null;}
 const text=String(value).trim();
 check(/^\d+$/.test(text)||/^\d{1,3}(\.\d{3})+$/.test(text),field+' harus bilangan bulat yang valid.','invalid-argument');
 return num(Number(text.replaceAll('.','')),['retail','wholesale'].includes(field)?1:0,field==='weight'?1000000:1000000000);
}
export function applyVariantBulk(rows,values,target='all',selected=new Set()){
 check(['all','selected'].includes(target),'Target varian tidak valid.');
 const fields=Object.entries(values).filter(([k,v])=>['stock','retail','wholesale'].includes(k)&&!blank(v)).map(([k,v])=>[k,variantNumber(v,k)]);
 check(fields.length,'Isi minimal satu nilai.');
 const next=structuredClone(rows),undo=[];let count=0;
 for(const row of next)if(target==='all'||selected.has(row.id)){count++;for(const [field,value] of fields){const before=variantValue(row,field);if(!same(before,value)){undo.push({id:row.id,field,before,after:value});setVariantValue(row,field,value);}}}
 check(count,'Pilih minimal satu varian.');return {rows:next,undo,count};
}
export function undoVariantBulk(rows,undo,edited=new Set()){
 const next=structuredClone(rows);let restored=0;
 for(const entry of undo){const row=next.find(v=>v.id===entry.id);if(row&&!edited.has(entry.id+'/'+entry.field)&&same(variantValue(row,entry.field),entry.after)){setVariantValue(row,entry.field,entry.before);restored++;}}
 return {rows:next,restored};
}

const preserveClone=v=>Array.isArray(v)?v.map(preserveClone):v&&Object.getPrototypeOf(v)===Object.prototype?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,preserveClone(x)])):v;
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
function differences(a,b,path=[],out=[]){
 if(sameField(a,b,path))return out;
 if(object(a)&&object(b)){for(const key of Object.keys(b))differences(a[key],b[key],[...path,key],out);}
 else out.push({path,value:b});return out;
}
const get=(obj,path)=>path.reduce((v,k)=>v?.[k],obj);
function put(obj,path,value){let at=obj;for(const k of path.slice(0,-1))at=at[k]??={};at[path.at(-1)]=value;}
// Form defaults and inherited placeholders must never become unintended edits.
export function applyFormChanges(original,initial,current){
 const next=structuredClone(original);
 for(const edit of differences(initial,current).filter(e=>e.path[0]!=='variants'))put(next,edit.path,edit.value);
 // An old product has no option schema. Its first option edit must include
 // the derived names/enabled flags, not just the nested field that changed.
 if(!original.variationOptions&&!same(initial.variationOptions,current.variationOptions))next.variationOptions=structuredClone(current.variationOptions);
 const originalRows=new Map((original.variants||[]).map(v=>[v.id,v]));
 next.variants=current.variants.map(v=>{const old=originalRows.get(v.id),first=initial.variants.find(x=>x.id===v.id);if(!old||!first)return v;const row=structuredClone(old);for(const edit of differences(first,v))put(row,edit.path,edit.value);return row;});
 return next;
}
// Three-way merge: untouched fields (especially transaction stock/reservations) use the latest DB values.
export function mergeProductEdits(base,desired,current){
 check(current,'Produk sudah tidak tersedia. Muat ulang formulir.','product-conflict');
 const next=preserveClone(current),stockConflicts=[],fieldConflicts=[];
 const apply=(before,wanted,latest,destination,prefix)=>{for(const edit of differences(before,wanted)){
  const was=get(before,edit.path),now=get(latest,edit.path);
  if(!sameField(was,now,edit.path)&&!sameField(edit.value,now,edit.path))fieldConflicts.push({field:prefix+edit.path.join('.'),variantId:prefix?prefix.slice(0,-1):null,path:edit.path,previous:was,current:now,requested:edit.value});
  else put(destination,edit.path,edit.value);
 }};
 const {variants:baseRows,...baseFields}=base,{variants:desiredRows,...desiredFields}=desired,{variants:currentRows,...currentFields}=current;
 // photoUrl mirrors the primary image for legacy readers. Resolve the actual
 // image list once; the service rebuilds the mirror from that chosen list.
 if(!sameField(baseFields.images,desiredFields.images,['images'])){delete baseFields.photoUrl;delete desiredFields.photoUrl;delete currentFields.photoUrl;}
 apply(baseFields,desiredFields,currentFields,next,'');
 const existing=new Map(currentRows.map(v=>[v.id,v]));
 for(const wanted of desiredRows){const before=baseRows.find(v=>v.id===wanted.id),latest=existing.get(wanted.id);
  if(!before){check(!latest,'ID varian baru sudah dipakai.','product-conflict');next.variants.push(structuredClone(wanted));continue;}
  check(latest,'Varian berubah atau dihapus. Muat ulang formulir.','product-conflict');
  const row=next.variants.find(v=>v.id===wanted.id);
  const {stock:beforeStock,...b}=before,{stock:wantedStock,...w}=wanted,{stock:latestStock,...c}=latest;
  apply(b,w,c,row,wanted.id+'/');
  if(!same(beforeStock,wantedStock)){
   if((base.revision||0)!==(current.revision||0)||!same(beforeStock,latestStock)||(before.reserved||0)!==(latest.reserved||0))stockConflicts.push({id:wanted.id,sku:latest.sku,previous:beforeStock,current:latestStock,requested:wantedStock,reserved:latest.reserved||0});
   else row.stock=wantedStock;
  }
 }
 if(stockConflicts.length){const error=new Fault('Data produk atau stok berubah sejak formulir dibuka. Tinjau stok terbaru sebelum menetapkan stok akhir.','stock-conflict');error.conflicts=stockConflicts;throw error;}
 if(fieldConflicts.length){const error=new Fault('Ada perubahan pada kolom yang sama. Bandingkan dan pilih nilai yang ingin disimpan. Draf Anda tetap tersedia.','product-conflict');error.conflicts=fieldConflicts;throw error;}
 return next;
}

// A resolution acknowledges only the value just reviewed, never a whole document.
// A later concurrent edit will therefore still conflict in the transaction.
export function resolveProductConflict(base,desired,conflict,choice){
 check(['mine','latest'].includes(choice),'Pilih penyelesaian konflik.');
 const nextBase=preserveClone(base),nextDesired=preserveClone(desired);
 const target=p=>conflict.variantId?p.variants.find(v=>v.id===conflict.variantId):p;
 check(target(nextBase)&&target(nextDesired),'Varian tidak tersedia untuk peninjauan.');
 put(target(nextBase),conflict.path,preserveClone(conflict.current));
 if(choice==='latest')put(target(nextDesired),conflict.path,preserveClone(conflict.current));
 return {base:nextBase,desired:nextDesired};
}
