import {check,id,hash} from './manual-domain.js?v=picker-20260923-r21';

export const AVAILABILITY_PATH='catalogState/availability';

// One shared index lets security rules check all 60 cart lines with one document read.
// A stock-only change never changes membership in this index.
export function writeAvailability(tx,current,productId,published,ctx,stamp){
 const ids=new Set(current?.ids||[]),had=ids.has(productId);
 published?ids.add(productId):ids.delete(productId);
 if(current&&had===published)return;
 tx.set(AVAILABILITY_PATH,{ids:[...ids].sort(),revision:(current?.revision||0)+1,updatedAt:stamp(),updatedBy:ctx.uid});
}

export function productLifecycle(store){
 return {async setTrashed(ctx,{productId,deleted,key,expectedTrashVersion}){
  check(ctx.role==='admin'&&ctx.uid,'Izin pengelolaan produk diperlukan.','permission-denied');
  check(typeof deleted==='boolean','Tindakan produk tidak valid.');
  const pid=id(productId),eventId='trash-'+hash([pid,id(key)]),action=deleted?'trash':'restore';
  const commit=()=>store.run(async tx=>{
   const product=await tx.get('products/'+pid),event=await tx.get('productTrashEvents/'+eventId);
   check(product,'Produk tidak tersedia.');
   if(event){check(event.productId===pid&&event.action===action,'Kunci tindakan sudah dipakai.');return {id:pid,reused:true,deleted:product.deleted===true};}
   if((product.deleted===true)===deleted)return {id:pid,reused:true,deleted};
   check(expectedTrashVersion==null||expectedTrashVersion===(product.trashVersion||0),'Status Sampah berubah di sesi lain. Muat ulang daftar sebelum melanjutkan.','product-conflict');
   const availability=await tx.get(AVAILABILITY_PATH),version=(product.trashVersion||0)+1;
   const patch={deleted,status:deleted?'nonaktif':'draft',website:{...product.website,enabled:false},trashVersion:version,trashEventId:eventId,revision:(product.revision||0)+1,updatedAt:store.serverTimestamp(),updatedBy:ctx.uid};
   if(deleted){patch.deletedAt=store.serverTimestamp();patch.deletedBy=ctx.uid;}
   else {patch.restoredAt=store.serverTimestamp();patch.restoredBy=ctx.uid;}
   // Update metadata only: never restore stock, prices or variants from an old snapshot.
   tx.update('products/'+pid,patch);
   tx.delete('catalog/'+pid);tx.delete('freeCatalog/'+pid);tx.delete('resellerPrices/'+pid);
   writeAvailability(tx,availability,pid,false,ctx,store.serverTimestamp);
   tx.set('productTrashEvents/'+eventId,{productId:pid,action,version,actor:ctx.uid,at:store.serverTimestamp(),name:product.name,sku:product.sku||''});
   return {id:pid,deleted,reused:false};
  });
  // Competing commits may be reported by dependent rules before a transaction retry.
  // Re-read the immutable event once; a real permission denial still fails.
  try{return await commit();}catch(error){if(!String(error.code).includes('permission-denied'))throw error;return commit();}
 }};
}
