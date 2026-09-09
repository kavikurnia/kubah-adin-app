import {priceCart,config} from './manual-domain.js?v=katalog-pembeli-20260909-r7';
export {CATEGORIES} from './planning-domain.js?v=katalog-pembeli-20260909-r7';
// The cart, detail preview and checkout estimate share the existing order pricing engine.
export function catalogEstimate(items,products,mode,settings={},resellerPrices=[],stockCheck=false){
 const mapped=new Map(products.map(p=>[p.id,{...p,status:'aktif',website:{enabled:true,retail:p.price,packPcs:p.packPcs,promo:p.promo,combine:p.combine,group:p.group||'',tiers:p.tiers,reseller:resellerPrices.find(r=>r.productId===p.id)||{price:0,minPcs:20}}}]));
 return priceCart(items,mapped,mode,resellerPrices.length?{status:'disetujui'}:null,config(settings),'',Date.now(),stockCheck);
}
export function timestamp(value){const raw=value?.toDate?.()??(value?.seconds!=null?value.seconds*1000:value);const n=raw?new Date(raw).getTime():0;return Number.isFinite(n)?n:0;}
export function productFacts(p){
 const lines=String(p.specifications||'').split(/[\n;]+/),explicit=(keys)=>{for(const line of lines){const [name,...value]=line.split(':');if(keys.includes(name.trim().toLowerCase()))return value.join(':').trim();}return '';};
 return {material:p.material||explicit(['bahan','material']),size:p.size||explicit(['ukuran']),thickness:p.thickness||explicit(['ketebalan']),conditions:p.conditions||explicit(['ketentuan motif/warna','motif/warna','ketentuan warna','ketentuan motif'])};
}
export function productGallery(p){return [...new Set([...(p.images||[]).slice().sort((a,b)=>Number(!!b.isPrimary)-Number(!!a.isPrimary)).map(i=>i.url),...(p.variants||[]).map(v=>v.image)].filter(Boolean))];}
export function catalogOptions(products,category=''){
 const rows=products.filter(p=>!category||p.category===category),values=(fn)=>[...new Set(rows.flatMap(fn).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'id'));
 return {materials:values(p=>[productFacts(p).material]),sizes:values(p=>[productFacts(p).size,...p.variants.map(v=>v.size)])};
}
export function filterCatalog(products,f={},mode='eceran'){
 const q=String(f.query||'').trim().toLocaleLowerCase('id');
 const rows=products.filter(p=>{const facts=productFacts(p),price=cardPrice(p,mode).price,available=p.variants.some(v=>v.stock>0);return (!f.category||p.category===f.category)&&(!f.onlyWholesale||p.collections?.includes('paket-grosir'))&&(!f.availability||f.availability==='available'&&available||f.availability==='empty'&&!available)&&(!f.material||facts.material===f.material)&&(!f.size||facts.size===f.size||p.variants.some(v=>v.size===f.size))&&(f.minPrice==null||f.minPrice===''||price>=Number(f.minPrice))&&(f.maxPrice==null||f.maxPrice===''||price<=Number(f.maxPrice))&&[p.name,p.category,p.sku,...p.variants.flatMap(v=>[v.color,v.size,v.sku])].join(' ').toLocaleLowerCase('id').includes(q);});
 return rows.sort((a,b)=>(f.sort==='low'?cardPrice(a,mode).price-cardPrice(b,mode).price:f.sort==='high'?cardPrice(b,mode).price-cardPrice(a,mode).price:f.sort==='newest'?timestamp(b.createdAt)-timestamp(a.createdAt):0)||a.name.localeCompare(b.name,'id'));
}
export function quoteSignature(q){return JSON.stringify(q.items.map(i=>[i.productId,i.variantId,i.qty,i.pcs,i.price,i.priceKind,i.lineTotal]));}
export function reorderCart(order,products,cart,mode,settings={},rates=[]){
 const next=cart.map(i=>({...i})),notes=[];
 for(const old of order.items||[]){const p=products.find(p=>p.id===old.productId),v=p?.variants.find(v=>v.id===old.variantId),name=old.productName||old.productId;
  if(!p||!v){notes.push(name+': produk atau varian tidak aktif; tidak ditambahkan.');continue;}
  const existing=next.find(i=>i.productId===p.id&&i.variantId===v.id),qty=Math.min(old.qty,Math.max(0,v.stock-(existing?.qty||0)));
  if(qty<old.qty)notes.push(name+': stok hanya cukup untuk '+qty+' unit tambahan.');
  if(qty>0){if(existing)existing.qty+=qty;else next.push({productId:p.id,variantId:v.id,qty});}
 }
 // Existing invalid cart lines must remain visible for correction, without hiding valid reorder items.
 const valid=next.filter(i=>products.some(p=>p.id===i.productId&&p.variants.some(v=>v.id===i.variantId)));
 if(valid.length){const q=catalogEstimate(valid,products,mode,settings,rates);for(const old of order.items||[]){const i=q.items.find(i=>i.productId===old.productId&&i.variantId===old.variantId);if(i&&(i.price!==old.price||old.pcs&&i.pcs/i.qty!==old.pcs/old.qty))notes.push((old.productName||old.productId)+': harga atau isi paket berubah. Rincian terbaru ditampilkan di keranjang.');}}
 return {cart:next,notes};
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
