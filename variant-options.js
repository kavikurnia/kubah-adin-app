import {check,hash} from './manual-domain.js?v=picker-20260923-r21';

const key=v=>String(v||'').trim().toLocaleLowerCase('id-ID');
const clone=v=>structuredClone(v);
export const optionId=(axis,label)=>axis[0]+'-'+hash(key(label)).slice(0,20);
const ref=(row,axis,config)=>row[axis+'OptionId']||config[axis].options.find(o=>key(o.label)===key(row[axis]))?.id||'';
export function deriveOptions(rows,saved){
 const config=saved?clone(saved):{color:{name:'Warna',enabled:rows.some(v=>v.color),options:[]},size:{name:'Ukuran',enabled:rows.some(v=>v.size),options:[]}};
 for(const axis of ['color','size']){
  config[axis]={name:axis==='color'?'Warna':'Ukuran',enabled:rows.some(v=>v[axis]&&!v.optionArchived),options:[],...config[axis]};
  for(const row of rows){const label=String(row[axis]||'').trim();if(label&&!config[axis].options.some(o=>o.id===row[axis+'OptionId']||key(o.label)===key(label)))config[axis].options.push({id:row[axis+'OptionId']||optionId(axis,label),label,archived:!!row.optionArchived});}
 }
 return config;
}
export function validateOptions(config){
 for(const axis of ['color','size']){const a=config[axis];check(a&&typeof a.enabled==='boolean'&&a.name.trim()&&a.name.length<=50,'Isi nama kelompok variasi (maksimal 50 karakter).');check(a.options.length<=100,'Maksimal 100 opsi per kelompok.');const labels=new Set(),ids=new Set();for(const o of a.options){check(o.id&&o.label.trim()&&o.label.length<=100,'Nama opsi wajib diisi, maksimal 100 karakter.');check(!ids.has(o.id)&&!labels.has(key(o.label)),'Nama opsi dalam kelompok tidak boleh sama.');ids.add(o.id);labels.add(key(o.label));}}
}
export function reconcileOptions(rows,before,next,sku,uuid=()=>crypto.randomUUID()){
 validateOptions(next);const out=clone(rows),active=axis=>next[axis].enabled?next[axis].options.filter(o=>!o.archived):[{id:'',label:''}];
 const colors=active('color'),sizes=active('size');check(colors.length*sizes.length<=100,'Maksimal 100 kombinasi aktif.');
 for(const row of out){let removed=false;for(const axis of ['color','size']){const oldId=ref(row,axis,before),option=next[axis].options.find(o=>o.id===oldId);row[axis+'OptionId']=oldId;if(option)row[axis]=option.label;if(next[axis].enabled?!!oldId&&(!option||option.archived)||!oldId:!!oldId)removed=true;}row.optionArchived=removed;}
 const skus=new Set(out.map(v=>key(v.sku))),slug=v=>String(v).toUpperCase().replace(/[^A-Z0-9]+/g,'-').replace(/^-|-$/g,'');
 for(const color of colors)for(const size of sizes){const existing=out.find(v=>v.colorOptionId===color.id&&v.sizeOptionId===size.id);if(existing){existing.optionArchived=false;continue;}const prefix=[slug(sku)||'VAR',slug(color.label),slug(size.label)].filter(Boolean).join('-').slice(0,85);let candidate=prefix,n=2;while(skus.has(key(candidate)))candidate=prefix+'-'+n++;skus.add(key(candidate));out.push({id:'V-'+uuid(),sku:candidate,color:color.label,size:size.label,colorOptionId:color.id,sizeOptionId:size.id,optionArchived:false,stock:'',image:color.image||'',imageOverride:false,hpp:null,weight:null,pricing:{retail:null,wholesale:null}});}
 check(out.length<=100,'Maksimal 100 varian termasuk arsip. Data lama tidak dihapus.');return out;
}
export function optionGroups(rows,config){
 const active=rows.filter(v=>!v.optionArchived),groups=new Map();
 for(const row of active){const id=ref(row,'color',config),g=groups.get(id)||{id,label:row.color||'Tanpa '+config.color.name.toLowerCase(),rows:[]};g.rows.push(row);groups.set(id,g);}
 const order=(axis,id)=>{const i=config[axis].options.findIndex(o=>o.id===id);return i<0?-1:i;};
 return [...groups.values()].sort((a,b)=>order('color',a.id)-order('color',b.id)).map(g=>{g.rows.sort((a,b)=>order('size',ref(a,'size',config))-order('size',ref(b,'size',config)));const opt=config.color.options.find(o=>o.id===g.id),counts=new Map();for(const r of g.rows)if(r.image&&!r.imageOverride)counts.set(r.image,(counts.get(r.image)||0)+1);const ranked=[...counts].sort((a,b)=>b[1]-a[1]);g.image=opt&&Object.hasOwn(opt,'image')?opt.image:ranked.length>1&&ranked[0][1]===1?'':ranked[0]?.[0]||'';return g;});
}
export const groupPhotoTargets=g=>g.rows.filter(v=>v.imageOverride!==true&&(!v.image||v.image===g.image)).map(v=>v.id);
