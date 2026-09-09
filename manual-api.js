import {commerce} from './manual-service.js?v=checkout-cloud-20260909-r5';
import {config,validateConfig,check,id,str,num,hash,cartInput,address,priceCart,validateSlot} from './manual-domain.js?v=checkout-cloud-20260909-r5';
import {manualStore} from './manual-store.js?v=admin-supplier-20260909-r3';
import {manualAccess} from './manual-access.js?v=admin-supplier-20260909-r3';

import {catalogEstimate} from './catalog-domain.js?v=checkout-cloud-20260909-r5';
const iso=()=>new Date().toISOString();
const adminActions=new Set(['adminData','savePayroll','saveConfig','saveProduct','saveSlot','saveCourier','reviewReseller','confirmShipping','verifyPayment','orderAction','reschedule','cancellationRefund','createManualOrder','legacyManualOrder','confirmRequest','rejectRequest','confirmClaimRequest','rejectClaimRequest','expireOrder']);
export function publicSettings(raw){const c=config(raw||{});return {enabled:c.enabled,whatsapp:c.whatsapp,categories:c.categories,promos:c.promos,warehouse:c.warehouse,shipping:c.shipping,payments:c.payments,banks:c.banks,freeShipping:c.freeShipping,returnPolicy:c.returnPolicy,returnDays:c.returnDays,operatingDays:c.operatingDays,holidays:c.holidays};}
function payload(raw){const p={orderOrigin:raw.orderOrigin==='reseller'?'reseller':'website',items:cartInput(raw.items),address:address(raw.address),mode:raw.mode,shippingMethod:raw.shippingMethod,paymentMethod:raw.paymentMethod,slotId:raw.slotId||'',voucher:str(raw.voucher||'',40),note:str(raw.note||'',1000)};check(['eceran','grosir'].includes(p.mode),'Mode belanja tidak valid.');check(['store','instant','regular','cargo','pickup'].includes(p.shippingMethod),'Metode pengiriman tidak valid.');check(['transfer','cash_store','cash_pickup'].includes(p.paymentMethod),'Pembayaran otomatis belum aktif.');if(p.slotId)id(p.slotId);check(p.paymentMethod!=='cash_store'||p.shippingMethod==='store','Tunai kurir untuk kurir toko.');check(p.paymentMethod!=='cash_pickup'||p.shippingMethod==='pickup','Tunai ambil sendiri untuk pengambilan.');return p;}
function requestView(r,products=[],rates=[]){const p=r.payload,a=p.address;let estimate;try{estimate=catalogEstimate(p.items,products,p.mode,{},rates);}catch{}return {id:r.id,requestPending:true,invoiceNo:r.id,requestNumber:r.id,shippingState:'pending_admin',estimateOnly:true,salesChannel:p.orderOrigin||'website',customerId:r.customerId,customerName:a.name,phone:a.phone,address:a.text,addressData:a,createdAt:r.createdAt?.toDate?.().toISOString()||r.createdAt,status:r.status==='ditolak'?'dibatalkan':'menunggu_konfirmasi_admin',detailStatus:r.status==='ditolak'?'Ditolak admin: '+r.reviewNote:'Menunggu konfirmasi admin — harga, stok, jadwal, dan ongkir belum disetujui',items:estimate?.items||p.items.map(i=>({...i,productName:'Produk '+i.productId,variant:i.variantId,price:null,pcs:i.qty,lineTotal:null})),subtotal:estimate?.subtotal??null,discount:0,pcs:estimate?.pcs??p.items.reduce((s,i)=>s+i.qty,0),shippingCost:null,total:null,totalAccepted:false,paymentStatus:'belum_dibayar',paymentMethod:p.paymentMethod,shippingMethod:p.shippingMethod,cashStatus:'belum_dibayar',paidAmount:0,statusHistory:[],claims:[]};}
async function once(store,path,data){return store.run(async tx=>{const old=await tx.get(path);if(old){check(old.customerId===data.customerId&&old.requestHash===data.requestHash,'Kunci permintaan telah digunakan untuk rincian berbeda.');return {id:path.split('/').pop()};}tx.set(path,data);return {id:path.split('/').pop()};});}
export async function manualApi(c,action,d={}){
  const store=manualStore(c),user=c.a.currentUser;
  const core=commerce(store);
  if(action==='catalog'){return {products:await store.list('catalog'),settings:publicSettings(await store.get('publicSettings/store'))};}
  if(action==='reviews')return store.list('reviews',[['productId','==',id(d.productId)]]);
  check(user,'Silakan masuk.','unauthenticated');const uid=user.uid,ctx={uid,role:'buyer'};
  if(adminActions.has(action)||['cash','courierAction','courierTasks','claimAction','cancel'].includes(action)){
    try{await manualAccess(c,user);ctx.role='admin';}catch(e){if(e.code!=='free/permission-denied')throw e;}
    if(ctx.role!=='admin'&&['cash','courierAction','courierTasks'].includes(action)){const p=await store.get('courierProfiles/'+uid);check(p?.active,'Izin kurir tidak tersedia.','permission-denied');ctx.role='courier';}
    if(adminActions.has(action))check(ctx.role==='admin','Akses hanya untuk admin.','permission-denied');
    if(action==='savePayroll'){
      const p=d.payroll,lock=hash([id(p.employeeId),str(p.period,30,true)]),pid=d.payrollId?id(d.payrollId):'PAY-'+lock;
      num(p.netSalary);const prior=await store.list('payrolls',[['employeeId','==',p.employeeId]]);check(!prior.some(x=>x.period===p.period&&x.id!==pid),'Payroll periode ini sudah ada.');
      return store.run(async tx=>{const key='payrollPeriods/'+lock,held=await tx.get(key),old=await tx.get('payrolls/'+pid),journal=await tx.get('transactions/payroll_'+pid);check(!held||held.payrollId===pid,'Payroll periode ini sudah dibuat.');
        if(old?.status==='Dibayar')check(p.status==='Dibayar'&&p.netSalary===old.netSalary&&p.employeeId===old.employeeId&&p.period===old.period,'Payroll yang sudah dibayar tidak boleh diubah nominal/periode/statusnya.');
        if(p.status==='Dibayar')check(p.netSalary>0&&str(p.paymentDate,40,true),'Tanggal dan nominal pembayaran diperlukan.');
        tx.set(key,{payrollId:pid,employeeId:p.employeeId,period:p.period});tx.set('payrolls/'+pid,{...old,...p,createdAt:old?.createdAt||iso()});
        if(p.status==='Dibayar'&&old?.status!=='Dibayar'&&!journal)tx.set('transactions/payroll_'+pid,{type:'keluar',amount:p.netSalary,date:p.paymentDate,createdAt:iso(),category:'Gaji Karyawan',description:'Gaji '+p.employeeName+' / '+p.period,payrollId:pid,managed:true,verifiedBy:uid});
        return {id:pid};});
    }
    if(action==='saveConfig'){const v=validateConfig(d.settings),batch=c.fs.writeBatch(c.db);batch.set(c.fs.doc(c.db,'settings/ecommerce'),v);batch.set(c.fs.doc(c.db,'publicSettings/store'),publicSettings(v));await batch.commit();return {ok:true};}
    if(action==='adminData'){
      const result=await core.dispatch(ctx,{action});
      const [requests,claimRequests,paymentNotices,orderChanges,messages]=await Promise.all(['orderRequests','claimRequests','paymentNotices','orderChanges','claimMessages'].map(p=>store.list(p)));
      for(const claim of result.claims)claim.messages=[...(claim.messages||[]),...messages.filter(m=>m.claimId===claim.id).map(m=>({text:m.text,by:'Pembeli',at:m.createdAt?.toDate?.().toISOString()||m.createdAt}))];
      return {...result,requests,claimRequests,paymentNotices,orderChanges};
    }
    if(ctx.role==='admin'||ctx.role==='courier')return core.dispatch(ctx,{...d,action});
  }
  if(action==='myAccount')return {profile:await store.get('profiles/'+uid),reseller:await store.get('resellers/'+uid)};
  if(action==='resellerPrices'){const r=await store.get('resellers/'+uid);return r?.status==='disetujui'?store.list('resellerPrices'):[];}
  if(action==='slots'){const cfg=config(await store.get('publicSettings/store')||{});return (await store.list('deliverySlots')).filter(s=>{try{validateSlot(s,cfg);return true;}catch{return false;}}).map(s=>({id:s.id,startAt:s.startAt,endAt:s.endAt,remaining:s.capacity-s.used}));}
  if(action==='profile'||action==='reseller')return core.dispatch(ctx,{...d,action});
  if(action==='quote'){
    const p=payload(d),[products,settings]=await Promise.all([store.list('catalog'),store.get('publicSettings/store')]);check(settings?.enabled,'Toko belum menerima permintaan pesanan.');
    const reseller=await store.get('resellers/'+uid),rates=reseller?.status==='disetujui'?await store.list('resellerPrices'):[];
    const q=catalogEstimate(p.items,products,p.mode,settings,rates);
    return {...q,shippingCost:null,total:null,shippingState:'pending_admin',estimateOnly:true,address:p.address};
  }
  if(action==='createOrder'){
    const p=payload(d),key=id(d.key),rid='REQ-'+hash([uid,key]).slice(0,40),settings=await store.get('publicSettings/store');
    check(settings?.enabled&&settings.shipping?.[p.shippingMethod]&&settings.payments?.[p.paymentMethod],'Toko atau metode belum aktif.');
    const result=await once(store,'orderRequests/'+rid,{customerId:uid,key,payload:p,requestHash:hash(p),status:'menunggu_konfirmasi_admin',createdAt:c.fs.serverTimestamp()});
    return {...result,invoiceNo:rid,requestPending:true};
  }
  if(action==='myOrders'){
    const [orders,requests]=await Promise.all([store.list('orders',[['customerId','==',uid]]),store.list('orderRequests',[['customerId','==',uid]])]);const products=await store.list('catalog'),reseller=await store.get('resellers/'+uid),rates=reseller?.status==='disetujui'?await store.list('resellerPrices'):[];return [...orders,...requests.filter(r=>r.status!=='dikonfirmasi').map(r=>requestView(r,products,rates))];
  }
  if(action==='getOrder'){
    let oid=id(d.orderId);if(oid.startsWith('REQ-')){const r=await store.get('orderRequests/'+oid);check(r?.customerId===uid,'Permintaan tidak tersedia.');if(r.status!=='dikonfirmasi')return requestView({...r,id:oid},await store.list('catalog'),(await store.get('resellers/'+uid))?.status==='disetujui'?await store.list('resellerPrices'):[]);oid=r.orderId;}
    const o=await store.get('orders/'+oid);check(o?.customerId===uid,'Pesanan tidak tersedia.','permission-denied');
    const [claims,requests,messages]=await Promise.all([store.list('claims',[['customerId','==',uid]]),store.list('claimRequests',[['customerId','==',uid]]),store.list('claimMessages',[['customerId','==',uid]])]);
    const own=claims.filter(r=>r.orderId===oid);for(const r of own)r.messages=[...(r.messages||[]),...messages.filter(m=>m.claimId===r.id).map(m=>({text:m.text,by:'Pembeli',at:m.createdAt?.toDate?.().toISOString()||m.createdAt}))];
    return {...o,id:oid,claims:own,claimRequests:requests.filter(r=>r.payload.orderId===oid&&r.status!=='dikonfirmasi')};
  }
  if(action==='acceptTotal')return store.run(async tx=>{const p='orders/'+id(d.orderId),o=await tx.get(p);check(o?.customerId===uid&&o.status!=='dibatalkan'&&o.shippingState==='confirmed'&&o.total===d.total&&o.quoteVersion===d.quoteVersion,'Total berubah. Segarkan pesanan.');tx.update(p,{totalAccepted:true,acceptedQuoteVersion:d.quoteVersion,acceptedAt:c.fs.serverTimestamp()});return {ok:true};});
  if(action==='proof'){
    const orderId=id(d.orderId),o=await store.get('orders/'+orderId);check(o?.customerId===uid&&o.totalAccepted&&o.paymentMethod==='transfer'&&o.paidAmount===0,'Pemberitahuan transfer tidak tersedia.');
    await store.set('paymentNotices/'+orderId,{customerId:uid,orderId,amount:num(d.amount,1),reference:str(d.reference,300,true),createdAt:c.fs.serverTimestamp()});return {ok:true};
  }
  if(action==='cancel'){
    const orderId=id(d.orderId),path='orderChanges/cancel_'+orderId,o=await store.get('orders/'+orderId);check(o?.customerId===uid,'Pesanan tidak tersedia.');
    const reason=str(d.reason,500,true);return once(store,path,{customerId:uid,orderId,reason,requestHash:hash([orderId,reason]),type:'cancel',createdAt:c.fs.serverTimestamp()});
  }
  if(action==='claim'){
    const p={orderId:id(d.orderId),items:cartInput(d.items),reason:str(d.reason,100,true),description:str(d.description,3000,true)},key=id(d.key),rid='CR-'+hash([uid,key]).slice(0,40);
    const o=await store.get('orders/'+p.orderId);check(o?.customerId===uid&&['dikirim','selesai'].includes(o.status),'Komplain tersedia setelah dikirim.');
    return once(store,'claimRequests/'+rid,{customerId:uid,key,payload:p,requestHash:hash(p),status:'menunggu',createdAt:c.fs.serverTimestamp()});
  }
  if(action==='claimAction'&&d.operation==='reply'){
    const claimId=id(d.claimId),claim=await store.get('claims/'+claimId);check(claim?.customerId===uid,'Komplain tidak tersedia.');const text=str(d.text,3000,true),key=id(d.key||crypto.randomUUID());
    return once(store,'claimMessages/'+hash([uid,claimId,key]),{customerId:uid,claimId,text,requestHash:hash(text),createdAt:c.fs.serverTimestamp()});
  }
  if(action==='review'){
    const orderId=id(d.orderId),productId=id(d.productId),rid=hash([orderId,productId]);const old=await store.get('reviews/'+rid);if(old)return {ok:true};
    await store.set('reviews/'+rid,{customerId:uid,orderId,productId,rating:num(d.rating,1,5),text:str(d.text,2000,true),buyerLabel:'Pembeli terverifikasi',createdAt:c.fs.serverTimestamp()});return {ok:true};
  }
  throw Object.assign(new Error('Tindakan belum tersedia dalam pemasangan tanpa Blaze.'),{code:'manual/unavailable'});
}
