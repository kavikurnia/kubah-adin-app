import {check} from './manual-domain.js?v=picker-20260923-r21';
const key=v=>String(v||'').trim().toLocaleLowerCase('id-ID');
const pair=(color,size)=>JSON.stringify([key(color),key(size)]);
const values=text=>[...new Map(String(text).split(/[,\n]/).map(v=>v.trim()).filter(Boolean).map(v=>[key(v),v])).values()];
export function combinationPlan(rows,colorsText,sizesText){
 const colors=values(colorsText),sizes=values(sizesText);
 check(colors.length&&sizes.length,'Isi warna dan ukuran, dipisahkan koma atau baris baru.');
 check(colors.every(v=>v.length<=100)&&sizes.every(v=>v.length<=100),'Warna/ukuran maksimal 100 karakter.');
 check(colors.length*sizes.length<=100,'Maksimal 100 kombinasi dalam satu produk.');
 const existing=new Set(rows.map(v=>pair(v.color,v.size))),add=[];
 for(const color of colors)for(const size of sizes)if(!existing.has(pair(color,size)))add.push({color,size});
 check(rows.length+add.length<=100,'Jumlah seluruh varian akan melebihi 100.');
 return {add,kept:colors.length*sizes.length-add.length};
}
export function addCombinations(rows,plan,sku,uuid=()=>crypto.randomUUID()){
 const next=structuredClone(rows),existing=new Set(rows.map(v=>pair(v.color,v.size))),skus=new Set(rows.map(v=>key(v.sku)));
 const slug=v=>String(v).trim().toUpperCase().replace(/[^A-Z0-9]+/g,'-').replace(/^-|-$/g,'');
 for(const value of plan.add){if(existing.has(pair(value.color,value.size)))continue;const id='V-'+uuid(),prefix=[slug(sku)||'VAR',slug(value.color),slug(value.size)].filter(Boolean).join('-').slice(0,85);let candidate=prefix;let n=2;while(skus.has(key(candidate)))candidate=prefix+'-'+n++;
  next.push({id,sku:candidate,color:value.color,size:value.size,stock:'',image:'',hpp:null,weight:null,pricing:{retail:null,wholesale:null}});existing.add(pair(value.color,value.size));skus.add(key(candidate));
 }
 check(next.length<=100,'Maksimal 100 varian.');return next;
}
