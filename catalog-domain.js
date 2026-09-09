import {priceCart,config} from './manual-domain.js?v=admin-supplier-20260909-r3';
export {CATEGORIES} from './planning-domain.js?v=admin-supplier-20260909-r3';
// The cart, detail preview and checkout estimate share the existing order pricing engine.
export function catalogEstimate(items,products,mode,settings={},resellerPrices=[]){
 const mapped=new Map(products.map(p=>[p.id,{...p,status:'aktif',website:{enabled:true,retail:p.price,packPcs:p.packPcs,promo:p.promo,combine:p.combine,group:p.group||'',tiers:p.tiers,reseller:resellerPrices.find(r=>r.productId===p.id)||{price:0,minPcs:20}}}]));
 return priceCart(items,mapped,mode,resellerPrices.length?{status:'disetujui'}:null,config(settings),'',Date.now(),false);
}
export function cardPrice(p,mode='eceran'){
 const tier=mode==='grosir'?p.tiers?.[0]:null;
 const values=(p.variants||[]).map(v=>tier?(v.pricing?.wholesale||tier.price):(v.pricing?.retail||p.price));
 return {price:Math.min(...(values.length?values:[p.price])),varies:new Set(values).size>1,kind:tier?'Grosir':'Eceran',minimum:tier?.minPcs||null};
}
export const shippingText=o=>o.shippingCost==null||o.shippingState==='pending_admin'?'Menunggu Konfirmasi Ongkir':o.shippingCost===0?(o.shippingMethod==='pickup'?'Ambil sendiri':o.promoApplied?'Gratis ongkir kurir toko':'Rp0 · Dikonfirmasi admin'):null;
export async function submitOrderRequest({uid,data,storage,locks,send}){
 const submit=async()=>{
  const signature=JSON.stringify(data);let pending;
  try{pending=JSON.parse(storage.getItem('kn-pending'));}catch{}
  const key=pending?.uid===uid&&pending.signature===signature?pending.key:crypto.randomUUID();
  storage.setItem('kn-pending',JSON.stringify({uid,key,signature}));
  const result=await send({...data,key});
  if(!result?.id)throw Error('Pesanan belum dikonfirmasi, keranjang tetap disimpan.');
  // Retain the key for a delayed second tab or a lost response. A cart edit starts a new purchase.
  return result;
 };
 return locks?.request?locks.request('kn-order-'+uid,submit):submit();
}
