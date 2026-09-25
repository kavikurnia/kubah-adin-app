import {Fault} from './manual-domain.js?v=picker-20260923-r21';
import {variantNumber} from './variant-draft.js?v=picker-20260923-r21';

const blank=value=>value==null||typeof value==='string'&&!value.trim();
const zero=value=>blank(value)||value===0||value==='0';
// Only an unsaved, entirely empty form row is disposable. Unknown metadata,
// option identities, zero prices and every persisted ID are deliberately kept.
export function isEmptyUnsavedVariant(v,persistedIds=new Set()){
 if(persistedIds.has(v.id))return false;
 const known=new Set(['id','stock','reserved','sku','color','size','name','image','hpp','weight','pricing','optionArchived','colorOptionId','sizeOptionId','imageOverride']);
 return Object.keys(v).every(k=>known.has(k))&&zero(v.stock)&&zero(v.reserved)&&
  ['sku','color','size','name','image','hpp','weight','colorOptionId','sizeOptionId'].every(k=>blank(v[k]))&&
  !v.imageOverride&&Object.values(v.pricing||{}).every(blank);
}
export function fieldFault(field,label,reason,variantId){
 return Object.assign(new Fault(label+': '+reason,'invalid-argument'),{field,variantId});
}
export const variantLabel=v=>[v.color,v.size].filter(Boolean).join(' / ')||v.sku||'kombinasi tanpa nama';
export function productText(value,field,label,max,required=false,variantId){
 if(typeof value!=='string'||required&&!value.trim())throw fieldFault(field,label,'wajib diisi. Lengkapi kolom ini.',variantId);
 if(value.length>max)throw fieldFault(field,label,'maksimal '+max+' karakter; saat ini '+value.length+'. Pendekkan isian ini.',variantId);
 return value.trim();
}
const labels={stock:'Stok/Qty',retail:'Harga Eceran',wholesale:'Harga Grosir',hpp:'HPP',weight:'Berat (gram)'};
export function productVariantNumber(v,key,value,{optional=false}={}){
 try{return variantNumber(value,key,{optional});}
 catch{throw fieldFault(key,labels[key]+' — '+variantLabel(v),(blank(value)?'wajib diisi. ':'')+'Gunakan bilangan bulat '+(['retail','wholesale'].includes(key)?'1':'0')+'–'+(key==='weight'?'1.000.000':'1.000.000.000')+(optional?'; kosong mengikuti aturan induk.':'.'),v.id);}
}
// Add field context to the existing product constraints; normalizeProduct and
// Firestore permissions still validate the final write inside the transaction.
export function validateProductFields(p){
 productText(p.name,'name','Nama produk',250,true);
 productText(p.sku,'sku','SKU induk',100,true);
 productText(p.description||'','description','Deskripsi',10000);
 productText(p.website?.group||'','group','Kode kelompok grosir',80);
 const number=(value,field,label,min=0,max=1000000000)=>{if(!Number.isSafeInteger(value)||value<min||value>max)throw fieldFault(field,label,'gunakan bilangan bulat '+min.toLocaleString('id-ID')+'–'+max.toLocaleString('id-ID')+'.');};
 number(p.weight||0,'weight','Berat per satuan jual',0,1000000);
 if(p.website){const w=p.website;number(w.retail,'retail','Harga Eceran',1);number(w.packPcs,'packPcs','Pcs per satuan jual',1,10000);for(const t of w.tiers||[]){number(t.price,'wholesale','Harga Grosir',1);number(t.minPcs,'minPcs','Minimum Grosir',1,1000000);}if(w.reseller){number(w.reseller.price||0,'resellerPrice','Harga reseller');number(w.reseller.minPcs||20,'resellerMin','Minimum reseller',1,1000000);}}
 const skus=new Set();
 for(const v of p.variants||[]){
  const label=variantLabel(v),sku=productText(v.sku,'sku','SKU — '+label+(v.optionArchived?' (arsip)':''),100,true,v.id).toUpperCase();
  if(skus.has(sku))throw fieldFault('sku','SKU — '+label,'sudah digunakan kombinasi lain. Gunakan SKU yang unik.',v.id);
  skus.add(sku);
  for(const key of ['color','size'])productText(v[key]||'',key,(key==='color'?'Warna/nama':'Ukuran')+' — '+label,100,false,v.id);
 }
 return p;
}
