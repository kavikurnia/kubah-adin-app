import {sha256} from './sha256.js?v=manual-20260908-2';
const randomUUID=()=>crypto.randomUUID();
export class Fault extends Error { constructor(message, code='failed-precondition') {super(message);this.code=code;} }
export function check(ok, message, code) {if(!ok) throw new Fault(message,code);}
export function str(v, max=500, required=false) {check(typeof v==='string' && v.length<=max && (!required || v.trim()),'Teks tidak valid.','invalid-argument');return v.trim();}
export function num(v,min=0,max=1000000000) {check(Number.isSafeInteger(v)&&v>=min&&v<=max,'Angka tidak valid.','invalid-argument');return v;}
export function id(v) {check(typeof v==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(v),'ID tidak valid.','invalid-argument');return v;}
export const hash = v=>sha256(JSON.stringify(v));
export const nowISO = ()=>new Date().toISOString();
export function safeURL(v) {try {const u=new URL(v);return u.protocol==='https:'?u.href:'';} catch{return '';}}
export const DEFAULTS = {
  enabled:false, whatsapp:'', categories:[], promos:[], warehouse:{address:'',lat:null,lng:null},
  shipping:{store:true,instant:false,regular:false,cargo:false,pickup:true},
  freeShipping:{enabled:true,minPcs:20,maxKm:25,combine:'all',allowReseller:false},
  storeDelivery:{baseFee:15000,perKm:2000,maxKm:40},
  payments:{transfer:false,cash_store:false,cash_pickup:true,gateway:false},
  banks:[], cashLimit:2000000,cashNeedsConfirmation:true, returnDays:7, returnPolicy:'Hubungi toko dan ajukan bukti melalui detail pesanan.',
  reservationMinutes:120, operatingDays:[1,2,3,4,5,6], holidays:[], resellerVoucher:false,
  vouchers:[], slots:[], routeProvider:'manual', gatewayProvider:'midtrans'
};
export function config(raw={}) {
  raw=raw??{};
  return {...DEFAULTS,...raw,routeProvider:'manual',warehouse:{...DEFAULTS.warehouse,...raw.warehouse},shipping:{...DEFAULTS.shipping,...raw.shipping},freeShipping:{...DEFAULTS.freeShipping,...raw.freeShipping,minPcs:20,maxKm:25},storeDelivery:{...DEFAULTS.storeDelivery,...raw.storeDelivery},payments:{...DEFAULTS.payments,...raw.payments,gateway:false}};
}
export function validateConfig(raw) {
  const c=config(raw); check(typeof c.enabled==='boolean','Status toko tidak valid.');
  str(c.whatsapp,30);str(c.warehouse.address,1000);str(c.returnPolicy,4000);
  for(const k of Object.keys(DEFAULTS.shipping)) check(typeof c.shipping[k]==='boolean','Layanan kirim tidak valid.');
  for(const k of Object.keys(DEFAULTS.payments)) check(typeof c.payments[k]==='boolean','Pembayaran tidak valid.');
  check(typeof c.freeShipping.enabled==='boolean','Status promo tidak valid.');
  num(c.cashLimit);num(c.returnDays,1,90);num(c.reservationMinutes,15,1440);num(c.freeShipping.minPcs,1,100000);
  for(const n of [c.freeShipping.maxKm,c.storeDelivery.maxKm])check(Number.isFinite(n)&&n>=0&&n<=1000,'Radius tidak valid.');
  num(c.storeDelivery.baseFee);num(c.storeDelivery.perKm);check(['all','product','variant'].includes(c.freeShipping.combine),'Gabungan promo tidak valid.');
  check(['manual','google'].includes(c.routeProvider),'Penyedia rute tidak valid.');
  if(c.routeProvider==='google') location(c.warehouse);
  check(Array.isArray(c.operatingDays)&&c.operatingDays.every(v=>Number.isInteger(v)&&v>=0&&v<=6),'Hari kerja tidak valid.');
  check(Array.isArray(c.holidays)&&c.holidays.every(v=>/^\d{4}-\d{2}-\d{2}$/.test(v)),'Hari libur tidak valid.');
  check(Array.isArray(c.banks)&&c.banks.length<=10,'Rekening tidak valid.');c.banks=c.banks.map(b=>({bank:str(b.bank,100,true),number:str(b.number,60,true),name:str(b.name,150,true)}));
  check(!c.payments.transfer||c.banks.length,'Tambahkan rekening sebelum mengaktifkan transfer.');
  check(Array.isArray(c.promos)&&c.promos.length<=10,'Promo terlalu banyak.');c.promos=c.promos.map(p=>({title:str(p.title,120,true),text:str(p.text,500),image:safeURL(p.image)}));
  check(Array.isArray(c.categories)&&c.categories.length<=50,'Kategori tidak valid.');c.categories=c.categories.map(v=>str(v,80,true));
  check(Array.isArray(c.vouchers)&&c.vouchers.length<=50,'Voucher tidak valid.');
  c.vouchers=c.vouchers.map(v=>({code:str(v.code,40,true).toUpperCase(),amount:num(v.amount),minSubtotal:num(v.minSubtotal),expiresAt:validDate(v.expiresAt),enabled:v.enabled===true}));
  return c;
}
export function validDate(v) {check(typeof v==='string'&&Number.isFinite(Date.parse(v)),'Tanggal tidak valid.');return new Date(v).toISOString();}
export function location(a) {check(a && Number.isFinite(a.lat)&&Math.abs(a.lat)<=90&&Number.isFinite(a.lng)&&Math.abs(a.lng)<=180,'Pin lokasi wajib diisi.','invalid-argument');return {lat:a.lat,lng:a.lng};}
export function address(a) {return {name:str(a?.name,150,true),phone:str(a?.phone,30,true),text:str(a?.text,1000,true),...location(a)};}
export function normalizeProduct(raw, old={}) {
  check(Array.isArray(raw.variants)&&raw.variants.length>0&&raw.variants.length<=100,'Isi 1–100 varian.');
  const p={...old,...raw,name:str(raw.name,250,true),category:str(raw.category||'',100),description:str(raw.description||'',10000)};
  check(['aktif','nonaktif','draft'].includes(p.status),'Status produk tidak valid.');
  const previous=new Map((old.variants||[]).map(v=>[v.id,v]));
  p.variants=raw.variants.map(v=>{
    const prev=previous.get(v.id)||{};
    const out={...prev,...v,id:v.id?id(v.id):randomUUID(),stock:num(v.stock),reserved:prev.reserved||0};
    for(const k of ['hpp','priceOffline','priceOnline']) if(out[k]!=null) num(out[k]);
    for(const k of ['color','size','sku']) out[k]=str(out[k]||'',100);
    out.image=safeURL(out.image);return out;
  });
  check(new Set(p.variants.map(v=>v.id)).size===p.variants.length,'ID varian duplikat.');
  for(const v of old.variants||[])check(!v.reserved||p.variants.some(x=>x.id===v.id),'Varian masih dicadangkan oleh pesanan.');
  p.website=validatePricing({...old.website,...raw.website});
  p.weight=num(p.weight||0,0,1000000);p.sku=str(p.sku||'',100);
  p.images=(raw.images||old.images||[]).slice(0,9).map((i,order)=>({url:safeURL(i.url),order,isPrimary:i.isPrimary===true})).filter(i=>i.url);
  p.photoUrl=safeURL(raw.photoUrl||old.photoUrl);p.totalStock=p.variants.reduce((s,v)=>s+v.stock,0);p.revision=(old.revision||0)+1;
  delete p.id;delete p.expectedRevision;return p;
}
export function validatePricing(raw={}) {
  const w={enabled:false,retail:0,packPcs:1,promo:false,combine:'product',group:'',tiers:[],reseller:{price:0,minPcs:20},...raw};
  num(w.retail);num(w.packPcs,1,10000);check(['all','product','variant'].includes(w.combine),'Gabungan grosir tidak valid.');
  str(w.group,80);check(Array.isArray(w.tiers)&&w.tiers.length<=10,'Tingkat grosir tidak valid.');
  w.tiers=w.tiers.map(t=>({minPcs:num(t.minPcs,1,1000000),price:num(t.price,1)})).sort((a,b)=>a.minPcs-b.minPcs);
  w.reseller={price:num(w.reseller?.price||0),minPcs:num(w.reseller?.minPcs||20,1,1000000)};
  if(w.enabled)check(w.retail>0,'Harga website harus diatur secara eksplisit.');return w;
}
// Explicit allowlist: never spread an internal product/variant into a public document.
export function publicProduct(p,productId) {
  const w=validatePricing(p.website);if(p.status!=='aktif'||!w.enabled)return null;
  return {id:productId,name:p.name,category:p.category||'',description:p.description||'',specifications:String(p.specifications||''),sku:p.sku||'',weight:p.weight||0,
    images:(p.images?.length?p.images:[{url:p.photoUrl}]).filter(i=>safeURL(i.url)).map(i=>({url:safeURL(i.url),isPrimary:!!i.isPrimary})),
    price:w.retail,packPcs:w.packPcs,promo:!!w.promo,tiers:w.tiers,combine:w.combine,group:w.group,
    variants:p.variants.map(v=>({id:v.id,color:v.color||v.name||'',size:v.size||'',sku:v.sku||'',image:safeURL(v.image),stock:v.stock}))};
}
export function cartInput(items) {
  check(Array.isArray(items)&&items.length>0&&items.length<=60,'Isi 1–60 baris keranjang.','invalid-argument');
  const m=new Map();for(const x of items) {const k=id(x.productId)+'/'+id(x.variantId);const qty=num(x.qty,1,10000);const prev=m.get(k);m.set(k,{productId:x.productId,variantId:x.variantId,qty:(prev?.qty||0)+qty});}
  return [...m.values()].sort((a,b)=>(a.productId+a.variantId).localeCompare(b.productId+b.variantId));
}
function groupKey(line,w,combine) {return combine==='all'?'all:'+w.group:combine==='product'?line.productId:line.productId+'/'+line.variantId;}
export function priceCart(input,products,mode,reseller,c,voucherCode='',time=Date.now(),stockCheck=true) {
  check(['eceran','grosir'].includes(mode),'Mode belanja tidak valid.');
  const rows=cartInput(input).map(x=>{
    const p=products.get(x.productId);check(p&&p.status==='aktif','Produk sudah tidak aktif.');const w=validatePricing(p.website);
    check(w.enabled,'Produk belum tersedia di website.');const v=p.variants.find(v=>v.id===x.variantId);check(v,'Varian sudah tidak tersedia.');
    check(!stockCheck||v.stock>=x.qty,`Stok ${p.name} / ${v.color||v.size||v.sku} tidak cukup.`);
    return {...x,p,v,w,pcs:x.qty*w.packPcs};
  });
  const groups=new Map();for(const r of rows) {const k=groupKey(r,r.w,r.w.combine);groups.set(k,(groups.get(k)||0)+r.pcs);}
  let usesReseller=false;
  const items=rows.map(r=>{
    const n=groups.get(groupKey(r,r.w,r.w.combine));let price=r.w.retail,priceKind='eceran';
    if(mode==='grosir')for(const tier of r.w.tiers)if(n>=tier.minPcs){price=tier.price;priceKind='grosir';}
    if(reseller?.status==='disetujui'&&r.w.reseller.price>0&&n>=r.w.reseller.minPcs){price=r.w.reseller.price;priceKind='reseller';usesReseller=true;}
    const next=r.w.tiers.find(t=>t.minPcs>n);
    return {productId:r.productId,variantId:r.variantId,productName:r.p.name,variant:[r.v.color||r.v.name,r.v.size].filter(Boolean).join(' / '),sku:r.v.sku||'',qty:r.qty,packPcs:r.w.packPcs,pcs:r.pcs,price,priceKind,lineTotal:price*r.qty,weight:r.p.weight||0,promo:!!r.w.promo,extraWholesalePcs:next?next.minPcs-n:0};
  });
  const subtotal=items.reduce((s,i)=>s+i.lineTotal,0);num(subtotal);
  let discount=0;const code=String(voucherCode||'').trim().toUpperCase();
  if(code){const v=c.vouchers.find(v=>v.code===code&&v.enabled);check(v&&Date.parse(v.expiresAt)>time&&subtotal>=v.minSubtotal,'Voucher tidak berlaku.');check(!usesReseller||c.resellerVoucher,'Voucher tidak dapat digabung dengan harga reseller.');discount=Math.min(subtotal,v.amount);}
  const promoGroups=new Map();for(const r of rows.filter(r=>r.w.promo)){const k=groupKey(r,{group:''},c.freeShipping.combine);promoGroups.set(k,(promoGroups.get(k)||0)+r.pcs);}
  const eligiblePcs=Math.max(0,...promoGroups.values());
  return {items,subtotal,discount,pcs:items.reduce((s,i)=>s+i.pcs,0),eligiblePcs,usesReseller,extraFreeShippingPcs:Math.max(0,c.freeShipping.minPcs-eligiblePcs)};
}
export function shipping(price,method,route,c) {
  check(c.shipping[method]===true,'Metode kirim tidak aktif.');
  if(method==='pickup')return {shippingCost:0,shippingState:'confirmed',distanceKm:null,promoApplied:false};
  if(method!=='store'||!route||!Number.isFinite(route.km))return {shippingCost:null,shippingState:'pending_admin',distanceKm:null,promoApplied:false};
  check(route.km>=0,'Jarak tidak valid.');check(route.km<=c.storeDelivery.maxKm,'Alamat di luar area layanan kurir toko.');
  const free=c.freeShipping.enabled&&price.eligiblePcs>=c.freeShipping.minPcs&&route.km<=c.freeShipping.maxKm&&(!price.usesReseller||c.freeShipping.allowReseller);
  return {shippingCost:free?0:c.storeDelivery.baseFee+Math.ceil(route.km)*c.storeDelivery.perKm,shippingState:'confirmed',distanceKm:route.km,promoApplied:!!free};
}
export function validateSlot(s,c,time=Date.now()) {
  check(s&&s.enabled,'Jadwal tidak tersedia.');const start=Date.parse(s.startAt),end=Date.parse(s.endAt),cutoff=Date.parse(s.cutoffAt);
  check(Number.isFinite(start)&&Number.isFinite(end)&&end>start&&Number.isFinite(cutoff)&&cutoff<=start,'Waktu slot tidak valid.');
  const local=new Date(start+7*3600000),date=local.toISOString().slice(0,10);
  check(start>time&&cutoff>time&&!c.holidays.includes(date)&&c.operatingDays.includes(local.getUTCDay()),'Jadwal sudah tutup / hari libur.');
  check(num(s.capacity,1,10000)>num(s.used||0),'Kuota jadwal habis.');return s;
}
export function canPay(o,time=Date.now()) {check(o.status!=='dibatalkan'&&o.shippingState==='confirmed'&&o.totalAccepted&&o.total!=null,'Total final belum disetujui / pesanan dibatalkan.');check(!o.expiresAt||Date.parse(o.expiresAt)>time,'Pesanan kedaluwarsa.');}
