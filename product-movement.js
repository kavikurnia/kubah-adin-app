import {check,id} from './manual-domain.js?v=katalog-pembeli-20260909-r7';
export const MOVEMENTS=[['fast','Fast Moving'],['medium','Medium'],['slow','Slow Moving'],['dead','Dead Stok']];
export const movementOptions=[['','Belum dinilai'],...MOVEMENTS];
export const movementStatus=m=>MOVEMENTS.some(([key])=>key===m?.status)?m.status:'';
export const movementLabel=m=>movementOptions.find(([key])=>key===movementStatus(m))[1];
export function movementRows(products,movements,filter={}){
 const q=String(filter.query||'').trim().toLowerCase();
 return products.filter(p=>(!q||[p.name,p.sku,...(p.variants||[]).map(v=>v.sku)].some(v=>String(v||'').toLowerCase().includes(q)))&&(!filter.category||p.category===filter.category)&&(!filter.status||p.status===filter.status)&&(!filter.publication||(filter.publication==='published')===!!p.website?.enabled)&&(!filter.movement||(filter.movement==='unrated'?'':filter.movement)===movementStatus(movements.get(p.id))));
}
export const movementCounts=(products,m)=>Object.fromEntries(movementOptions.map(([key])=>[key,products.filter(p=>movementStatus(m.get(p.id))===key).length]));
export function movementRecord(ctx,productId,status,previous,expectedRevision,stamp){
 check(ctx.role==='admin'&&ctx.uid,'Izin admin diperlukan.','permission-denied');
 check(movementOptions.some(([key])=>key===status),'Status pergerakan tidak valid.');
 check((previous?.revision||0)===expectedRevision,'Status diubah admin lain. Muat ulang sebelum menyimpan.');
 return {productId:id(productId),status,revision:(previous?.revision||0)+1,updatedBy:ctx.uid,updatedAt:stamp()};
}
export function movementService(store){return {save:async(ctx,d)=>store.run(async tx=>{
 const pid=id(d.productId),p=await tx.get('products/'+pid),old=await tx.get('productMovements/'+pid);
 check(p,'Produk tidak ditemukan.');
 const record=movementRecord(ctx,pid,d.status,old,d.expectedRevision,store.serverTimestamp);
 tx.set('productMovements/'+pid,record);return {id:pid};
})};}
