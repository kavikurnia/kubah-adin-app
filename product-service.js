import {AVAILABILITY_PATH,writeAvailability} from './product-lifecycle.js?v=picker-20260923-r21';
import {check,id,hash,normalizeProduct,publicProduct,safeURL} from './manual-domain.js?v=picker-20260923-r21';
import {CATEGORIES,skuKey,skuId} from './planning-domain.js?v=picker-20260923-r21';
import {movementRecord} from './product-movement.js?v=picker-20260923-r21';
import {mergeProductEdits,imageList,same} from './variant-draft.js?v=picker-20260923-r21';
import {validateProductFields,fieldFault} from './product-validation.js?v=product-validation-20260925-r23';
export function productService(store,{stamp=()=>new Date().toISOString()}={}){
 return {async save(ctx,d){check(ctx.role==='admin'&&ctx.uid,'Izin admin diperlukan.','permission-denied');const pid=id(d.id),eid='product-'+hash([pid,d.key]),fingerprint=d.importHash||hash({product:d.product,stock:!!d.stock,...(d.movement?{movement:d.movement}:{})});
  const commit=()=>store.run(async tx=>{const event=await tx.get('productEvents/'+eid);if(event){check(event.fingerprint===fingerprint,'Kunci perubahan sudah dipakai.');return {id:pid,reused:true};}const old=await tx.get('products/'+pid);check(!old?.deleted,'Pulihkan produk dari Sampah sebelum mengeditnya.');const availability=await tx.get(AVAILABILITY_PATH);if(!d.base)check((old?.revision||0)===d.expectedRevision,'Produk/stok berubah sejak pratinjau. Muat ulang dan tinjau kembali.');
   const raw={...(d.base?mergeProductEdits(d.base,d.product,old):d.product),pricingVersion:2};check(CATEGORIES.includes(raw.category),'Kategori belum dipetakan.');check(raw.website?.retail>0,'Harga Eceran wajib ditetapkan.');validateProductFields(raw);raw.sku=skuKey(raw.sku);raw.variants=raw.variants.map(v=>({...v,sku:skuKey(v.sku)}));check(new Set(raw.variants.map(v=>v.sku)).size===raw.variants.length,'SKU varian duplikat.');
   if(old&&!d.stock)for(const v of raw.variants){const previous=old.variants.find(p=>p.id===v.id);if(previous)v.stock=previous.stock;}
   const locks=['parent/'+raw.sku,...raw.variants.map(v=>'variant/'+v.sku)];for(const key of locks){const held=await tx.get('productSkus/'+hash(key).slice(0,32));if(held&&held.productId!==pid){const variant=key.startsWith('variant/')?raw.variants.find(v=>'variant/'+v.sku===key):null;throw fieldFault('sku',variant?'SKU varian '+variant.sku:'SKU induk','sudah dipakai produk lain. Gunakan SKU yang berbeda.',variant?.id);}}
   const movement=d.movement?movementRecord(ctx,pid,d.movement.status,await tx.get('productMovements/'+pid),d.movement.expectedRevision,store.serverTimestamp):null;
 const p=normalizeProduct({...raw,images:imageList(raw.images)},old||{});
 // Keep untouched legacy photo metadata exactly as it is in the latest record.
 const imagesChanged=!same(imageList(raw.images),imageList(old?.images));
 if(old&&!imagesChanged)p.images=old.images||[];
 if(imagesChanged)p.photoUrl=imageList(raw.images).find(i=>i.isPrimary)?.url||'';
 else if(Object.hasOwn(raw,'photoUrl'))p.photoUrl=safeURL(raw.photoUrl);
 for(const v of p.variants){const prev=old?.variants.find(x=>x.id===v.id);if(v.optionArchived&&!prev?.optionArchived){v.optionArchivedAt=stamp();v.optionArchivedBy=ctx.uid;}else if(!v.optionArchived&&prev?.optionArchived){v.optionArchivedAt=null;v.optionRestoredAt=stamp();v.optionRestoredBy=ctx.uid;}}
 if(!same(raw.variationOptions,old?.variationOptions)){p.optionsUpdatedAt=store.serverTimestamp();p.optionsUpdatedBy=ctx.uid;}
 p.createdAt=old?.createdAt||stamp();p.updatedAt=stamp();p.updatedBy=ctx.uid;
   for(const key of locks)tx.set('productSkus/'+hash(key).slice(0,32),{productId:pid,sku:key});
   if(old){const patch=Object.fromEntries(Object.entries(p).filter(([field,value])=>!same(value,old[field])&&(field!=='images'||imagesChanged)));tx.update('products/'+pid,patch);}else tx.set('products/'+pid,p);
   if(movement)tx.set('productMovements/'+pid,movement);const pub=publicProduct({...p,images:imageList(p.images)},pid);writeAvailability(tx,availability,pid,!!pub,ctx,store.serverTimestamp);if(pub){tx.set('catalog/'+pid,pub);tx.set('resellerPrices/'+pid,{productId:pid,...p.website.reseller});}else{tx.delete('catalog/'+pid);tx.delete('resellerPrices/'+pid);}
   tx.set('productEvents/'+eid,{productId:pid,fingerprint,before:old||null,afterRevision:p.revision,actor:ctx.uid,at:stamp(),reason:d.reason||'Pemetaan harga / impor terkonfirmasi',stockUpdated:!!d.stock});return {id:pid};});
  try{return await commit();}catch(e){if(!String(e.code).includes('permission-denied'))throw e;return commit();}
 },
 async verify(ctx,d){
  check(ctx.role==='admin'&&ctx.uid,'Izin admin diperlukan.','permission-denied');const pid=id(d.id);
  return store.run(async tx=>{
   const event=await tx.get('productEvents/product-'+hash([pid,d.key]));
   check(event&&event.fingerprint===(d.importHash||hash({product:d.product,stock:!!d.stock,...(d.movement?{movement:d.movement}:{})})),'Hasil penyimpanan belum dapat dipastikan. Coba periksa lagi.','save-unverified');
   const product=await tx.get('products/'+pid),catalog=await tx.get('catalog/'+pid),reseller=await tx.get('resellerPrices/'+pid),movement=await tx.get('productMovements/'+pid);
   check(product&&product.revision>=event.afterRevision,'Data tersimpan belum dapat dibaca ulang.','save-unverified');
   const expected=publicProduct({...product,images:imageList(product.images)},pid);
   return {id:pid,product,movement,catalogSynced:same(expected,catalog)&&same(expected?{productId:pid,...product.website.reseller}:null,reseller)};
  });
 },
 async syncCatalog(ctx,productId){
  check(ctx.role==='admin'&&ctx.uid,'Izin admin diperlukan.','permission-denied');const pid=id(productId);
  return store.run(async tx=>{const p=await tx.get('products/'+pid);check(p,'Produk tidak tersedia.');const catalog=await tx.get('catalog/'+pid),reseller=await tx.get('resellerPrices/'+pid),availability=await tx.get(AVAILABILITY_PATH),pub=publicProduct({...p,images:imageList(p.images)},pid),prices=pub?{productId:pid,...p.website.reseller}:null;
   if(same(pub,catalog)&&same(prices,reseller))return {id:pid,reused:true};
   writeAvailability(tx,availability,pid,!!pub,ctx,store.serverTimestamp);
   if(pub){tx.set('catalog/'+pid,pub);tx.set('resellerPrices/'+pid,prices);}else{tx.delete('catalog/'+pid);tx.delete('resellerPrices/'+pid);}
   return {id:pid};
  });
 }};
}
