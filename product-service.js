import {check,id,hash,normalizeProduct,publicProduct} from './manual-domain.js?v=admin-lengkap-20260909';
import {CATEGORIES,skuKey,skuId} from './planning-domain.js?v=admin-lengkap-20260909';
export function productService(store,{stamp=()=>new Date().toISOString()}={}){
 return {async save(ctx,d){check(ctx.role==='admin'&&ctx.uid,'Izin admin diperlukan.','permission-denied');const pid=id(d.id),eid='product-'+hash([pid,d.key]),fingerprint=d.importHash||hash({product:d.product,stock:!!d.stock});
  const commit=()=>store.run(async tx=>{const event=await tx.get('productEvents/'+eid);if(event){check(event.fingerprint===fingerprint,'Kunci perubahan sudah dipakai.');return {id:pid,reused:true};}const old=await tx.get('products/'+pid);check((old?.revision||0)===d.expectedRevision,'Produk/stok berubah sejak pratinjau. Muat ulang dan tinjau kembali.');
   const raw={...d.product,pricingVersion:2};check(CATEGORIES.includes(raw.category),'Kategori belum dipetakan.');check(raw.website?.retail>0,'Harga Eceran wajib ditetapkan.');raw.sku=skuKey(raw.sku);raw.variants=raw.variants.map(v=>({...v,sku:skuKey(v.sku)}));check(new Set(raw.variants.map(v=>v.sku)).size===raw.variants.length,'SKU varian duplikat.');
   if(old&&!d.stock)for(const v of raw.variants){const previous=old.variants.find(p=>p.id===v.id);if(previous)v.stock=previous.stock;}
   const settings=await tx.get('settings/ecommerce'),publicSettings=await tx.get('publicSettings/store');
   const locks=['parent/'+raw.sku,...raw.variants.map(v=>'variant/'+v.sku)];for(const key of locks){const held=await tx.get('productSkus/'+hash(key).slice(0,32));check(!held||held.productId===pid,'SKU telah dipakai produk lain.');}
   const p=normalizeProduct(raw,old||{});p.createdAt=old?.createdAt||stamp();p.updatedAt=stamp();p.updatedBy=ctx.uid;
   for(const key of locks)tx.set('productSkus/'+hash(key).slice(0,32),{productId:pid,sku:key});
   tx.set('products/'+pid,p);if(settings&&publicSettings){tx.update('settings/ecommerce',{categories:CATEGORIES});tx.update('publicSettings/store',{categories:CATEGORIES});}const pub=publicProduct(p,pid);if(pub){tx.set('catalog/'+pid,pub);tx.set('resellerPrices/'+pid,{productId:pid,...p.website.reseller});}else{tx.delete('catalog/'+pid);tx.delete('resellerPrices/'+pid);}
   tx.set('productEvents/'+eid,{productId:pid,fingerprint,before:old||null,afterRevision:p.revision,actor:ctx.uid,at:stamp(),reason:d.reason||'Pemetaan harga / impor terkonfirmasi',stockUpdated:!!d.stock});return {id:pid};});
  try{return await commit();}catch(e){if(!String(e.code).includes('permission-denied'))throw e;return commit();}
 }};
}
