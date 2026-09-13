import {caseId} from './return-domain.js?v=dokumen-privat-20260913-r8b';
import {policyDraft} from './return-domain.js?v=dokumen-privat-20260913-r8b';
import {commerce} from './manual-service.js?v=dokumen-privat-20260913-r8b';
import {config,validateConfig,check,id,str,num,hash,cartInput,address,priceCart,validateSlot} from './manual-domain.js?v=katalog-pembeli-20260909-r7';
import {manualStore} from './manual-store.js?v=admin-supplier-20260909-r3';
import {manualAccess} from './manual-access.js?v=admin-supplier-20260909-r3';

import {catalogEstimate,quoteSignature} from './catalog-domain.js?v=katalog-pembeli-20260909-r7';
import {claimInput,claimEvidence} from './buyer-domain.js?v=dokumen-privat-20260913-r8b';
const iso=()=>new Date().toISOString();
const adminActions=new Set(['savePolicyDraft','adminData','savePayroll','saveConfig','saveProduct','saveSlot','saveCourier','reviewReseller','confirmShipping','verifyPayment','orderAction','reschedule','cancellationRefund','createManualOrder','legacyManualOrder','confirmRequest','rejectRequest','confirmClaimRequest','rejectClaimRequest','expireOrder']);
export function publicSettings(raw){const c=config(raw||{});return {enabled:c.enabled,whatsapp:c.whatsapp,categories:c.categories,promos:c.promos,warehouse:c.warehouse,shipping:c.shipping,payments:c.payments,banks:c.banks,freeShipping:c.freeShipping,returnPolicy:c.returnPolicy,returnDays:c.returnDays,returnPolicyConfirmed:c.returnPolicyConfirmed===true,operatingDays:c.operatingDays,holidays:c.holidays};}
function payload(raw){const p={orderOrigin:raw.orderOrigin==='reseller'?'reseller':'website',items:cartInput(raw.items),address:address(raw.address),mode:raw.mode,shippingMethod:raw.shippingMethod,paymentMethod:raw.paymentMethod,slotId:raw.slotId||'',voucher:str(raw.voucher||'',40),note:str(raw.note||'',1000)};check(['eceran','grosir'].includes(p.mode),'Mode belanja tidak valid.');check(['store','instant','regular','cargo','pickup'].includes(p.shippingMethod),'Metode pengiriman tidak valid.');check(['transfer','cash_store','cash_pickup'].includes(p.paymentMethod),'Pembayaran otomatis belum aktif.');if(p.slotId)id(p.slotId);check(p.paymentMethod!=='cash_store'||p.shippingMethod==='store','Tunai kurir untuk kurir toko.');check(p.paymentMethod!=='cash_pickup'||p.shippingMethod==='pickup','Tunai ambil sendiri untuk pengambilan.');return p;}
function requestView(r,products=[],rates=[]){const p=r.payload,a=p.address;let estimate;try{estimate=catalogEstimate(p.items,products,p.mode,{},rates);}catch{}return {id:r.id,requestPending:true,invoiceNo:r.id,requestNumber:r.id,shippingState:'pending_admin',estimateOnly:true,salesChannel:p.orderOrigin||'website',customerId:r.customerId,customerName:a.name,phone:a.phone,address:a.text,addressData:a,createdAt:r.createdAt?.toDate?.().toISOString()||r.createdAt,status:r.status==='ditolak'?'dibatalkan':'menunggu_konfirmasi_admin',detailStatus:r.status==='ditolak'?'Ditolak admin: '+r.reviewNote:'Menunggu konfirmasi admin — harga, stok, jadwal, dan ongkir belum disetujui',items:estimate?.items||p.items.map(i=>({...i,productName:'Produk '+i.productId,variant:i.variantId,price:null,pcs:i.qty,lineTotal:null})),subtotal:estimate?.subtotal??null,discount:0,pcs:estimate?.pcs??p.items.reduce((s,i)=>s+i.qty,0),shippingCost:null,total:null,totalAccepted:false,paymentStatus:'belum_dibayar',paymentMethod:p.paymentMethod,shippingMethod:p.shippingMethod,cashStatus:'belum_dibayar',paidAmount:0,statusHistory:[],claims:[]};}
async function once(store,path,data,validate=async()=>{}){return store.run(async tx=>{const old=await tx.get(path);if(old){check(old.customerId===data.customerId&&old.requestHash===data.requestHash,'Kunci permintaan telah digunakan untuk rincian berbeda.');return {id:path.split('/').pop()};}await validate(tx);tx.set(path,data);return {id:path.split('/').pop()};});}
async function checkoutReview(reader,p,uid){
 const [settings,reseller]=await Promise.all([reader.get('publicSettings/store'),reader.get('resellers/'+uid)]);
 check(settings?.enabled&&settings.shipping?.[p.shippingMethod]&&settings.payments?.[p.paymentMethod],'Toko atau metode belum aktif.');
 check(p.orderOrigin!=='reseller'||reseller?.status==='disetujui','Asal pesanan reseller memerlukan persetujuan akun.');
 const ids=[...new Set(p.items.map(i=>i.productId))],products=await Promise.all(ids.map(async id=>{const v=await reader.get('catalog/'+id);return v?{...v,id}:null;}));
 const rates=reseller?.status==='disetujui'?(await Promise.all(ids.map(id=>reader.get('resellerPrices/'+id)))).filter(Boolean):[];
 if(p.shippingMethod==='store'){check(p.slotId,'Pilih jadwal kurir toko yang tersedia.');validateSlot(await reader.get('deliverySlots/'+p.slotId),config(settings));}
 const q=catalogEstimate(p.items,products.filter(Boolean),p.mode,settings,rates,true);
 return {...q,pricingSignature:quoteSignature(q)};
}
export async function manualApi(c,action,d={}){
  const store=manualStore(c),user=c.a.currentUser;
  const core=commerce(store,{verifyFile:async file=>{const {documentStorage}=await import('./document-storage.js?v=dokumen-privat-20260913-r8b');await documentStorage(c).read(file);}});
  if(action==='catalog'){return {products:await store.list('catalog'),settings:publicSettings(await store.get('publicSettings/store'))};}
  if(action==='reviews')return store.list('reviews',[['productId','==',id(d.productId)]]);
  check(user,'Silakan masuk.','unauthenticated');const uid=user.uid,ctx={uid,role:'buyer'};
  if(adminActions.has(action)||['cash','courierAction','courierTasks','claimAction','cancel'].includes(action)){
    try{await manualAccess(c,user);ctx.role='admin';}catch(e){if(e.code!=='free/permission-denied')throw e;}
    if(ctx.role!=='admin'&&['cash','courierAction','courierTasks'].includes(action)){const p=await store.get('courierProfiles/'+uid);check(p?.active,'Izin kurir tidak tersedia.','permission-denied');ctx.role='courier';}
    if(adminActions.has(action))check(ctx.role==='admin','Akses hanya untuk admin.','permission-denied');
    if(action==='savePolicyDraft'){const draft=policyDraft(d.draft);return store.run(async tx=>{const old=await tx.get('settings/ecommerce');check(old,'Pengaturan toko belum tersedia.');tx.update('settings/ecommerce',{returnDraft:draft});tx.set('policyDraftHistory/'+crypto.randomUUID(),{...draft,by:uid});return {ok:true};});}
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
      const revisions=await store.list('claimEvidenceRevisions');for(const claim of result.claims)claim.evidenceRevisions=revisions.filter(r=>r.claimId===claim.id);
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
    const p=payload(d),q=await checkoutReview(store,p,uid);
    return {...q,shippingCost:null,total:null,shippingState:'pending_admin',estimateOnly:true,address:p.address};
  }
  if(action==='createOrder'){
    const p=payload(d),key=id(d.key),rid='REQ-'+hash([uid,key]).slice(0,40);
    const result=await once(store,'orderRequests/'+rid,{customerId:uid,key,payload:p,requestHash:hash(p),status:'menunggu_konfirmasi_admin',createdAt:c.fs.serverTimestamp()},async tx=>{const q=await checkoutReview(tx,p,uid);check(!d.pricingSignature||d.pricingSignature===q.pricingSignature,'Harga atau isi paket berubah. Hitung ulang rincian sebelum mengirim pesanan.');});
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
    const evidenceRevisions=await store.list('claimEvidenceRevisions',[['customerId','==',uid]]);for(const claim of own)claim.evidenceRevisions=evidenceRevisions.filter(r=>r.claimId===claim.id);
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
  if(action==='claimEvidenceRevision'){
   const claim=await store.get('claims/'+id(d.claimId));check(claim?.customerId===uid&&claim.stage==='perlu_informasi'&&claim.requestId,'Perbaikan belum diminta admin.');
   const evidence=claimEvidence(d.evidence,uid,claim.orderId),revision=evidence[0]?.revision;check(evidence.length>0&&revision>1&&evidence.every(f=>f.requestId===claim.requestId&&f.revision===revision),'Gunakan bukti dari revisi yang sama.');
   const body={customerId:uid,claimId:d.claimId,orderId:claim.orderId,requestId:claim.requestId,revision,evidence,note:str(d.note,1000,true)};
   return once(store,'claimEvidenceRevisions/'+claim.requestId+'_r'+revision,{...body,requestHash:hash(body),createdAt:c.fs.serverTimestamp()});
  }
  if(action==='claim'){
    const o=await store.get('orders/'+id(d.orderId)),p=claimInput(d,o,uid),rid=caseId(uid,d.orderId,p.orderItemIndex),lock=d.orderId+'_'+p.orderItemIndex;
    check(p.evidence.every(f=>f.requestId===rid),'Gunakan bukti dari pengajuan ini.');
    return store.run(async tx=>{const old=await tx.get('claimRequests/'+rid),held=await tx.get('claimLocks/'+lock);
      if(old){check(old.customerId===uid&&old.requestHash===hash(p),'Pengajuan barang ini sudah tersimpan. Lanjutkan melalui tanggapan/perbaikan bukti, jangan membuat kasus ganda.');return {id:rid};}
      check(!held,'Kasus barang ini sudah tercatat. Hubungi admin untuk melanjutkan.');
      tx.set('claimLocks/'+lock,{customerId:uid,orderId:d.orderId,itemIndex:p.orderItemIndex,requestId:rid,createdAt:c.fs.serverTimestamp()});
      tx.set('claimRequests/'+rid,{customerId:uid,key:rid,payload:p,requestHash:hash(p),status:'menunggu',createdAt:c.fs.serverTimestamp()});return {id:rid};});
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

