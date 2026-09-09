import {sha256} from './sha256.js?v=admin-lengkap-20260909-r2';
export const MAX_DOCUMENT_BYTES=2*1024*1024;
export function need(ok,message){if(!ok)throw new Error(message);}
export function safeId(v){need(typeof v==='string'&&/^[A-Za-z0-9_-]{1,260}$/.test(v),'ID dokumen tidak valid.');return v;}
export function clean(v,max=200){return String(v??'').trim().slice(0,max);}
export function bankReference(v){const ref=clean(v,81).toUpperCase().replace(/\s/g,'');need(/^[A-Z0-9_-]{6,80}$/.test(ref),'Isi referensi mutasi bank yang unik, 6–80 huruf/angka/-/_.');return ref;}
export function filePath(uid,oid,kind,hash,mime){need(/^[A-Za-z0-9_-]{1,128}$/.test(uid)&&/^[A-Za-z0-9_-]{1,128}$/.test(oid),'Format ID akun/pesanan belum didukung penyimpanan dokumen.');need(['shipping','payment'].includes(kind),'Jenis dokumen salah.');need(/^[a-f0-9]{64}$/.test(hash),'Sidik berkas tidak valid.');const ext={'application/pdf':'pdf','image/jpeg':'jpg','image/png':'png'}[mime];need(ext,'Gunakan PDF, JPG, atau PNG.');return `${uid}/${oid}/${kind}/${hash}.${ext}`;}
export function caseKey(oid,kind,fileHash){return kind==='shipping'?'shipping_'+safeId(oid):'payment_'+safeId(oid)+'_'+fileHash;}
export function totals(order){const total=Number(order.total)||0,paid=Number(order.paidAmount)||0;return {total,paid,remaining:Math.max(0,total-paid)};}
export function resellerService(store,{stamp=()=>new Date().toISOString(),today=()=>new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Jakarta'})}={}){
 // Immutable creates can be denied when another tab wins before conflict detection.
 // Re-read once through the same authenticated transaction and all validations.
 async function runIdempotent(fn){try{return await store.run(fn);}catch(e){if(e.code!=='permission-denied')throw e;return store.run(fn);}}
 async function checkOrder(tx,ctx,oid){
  const o=await tx.get('orders/'+safeId(oid));need(o,'Pesanan tidak ditemukan.');
  const uid=o.resellerId||o.customerId;safeId(uid);const r=await tx.get('resellers/'+uid);
  need(r?.status==='disetujui','Akun reseller pesanan belum aktif.');
  need(o.customerId===uid&&o.salesChannel==='reseller'&&o.resellerId===uid,'Admin perlu menghubungkan pesanan ini ke reseller terlebih dahulu.');
  need(ctx.role==='admin'||ctx.uid===uid,'Pesanan bukan milik akun Anda.');need(o.status!=='dibatalkan','Pesanan sudah dibatalkan.');return {o,uid};
 }
 async function submit(ctx,d){
  need(ctx.uid,'Silakan masuk.');const oid=safeId(d.orderId),kind=d.kind;need(['shipping','payment'].includes(kind),'Jenis dokumen tidak valid.');
  const f=d.file;need(f&&Number.isInteger(f.size)&&f.size>0&&f.size<=MAX_DOCUMENT_BYTES,'Berkas maksimal 2 MB.');
  const key=d.caseId?safeId(d.caseId):caseKey(oid,kind,f.sha256);const path='resellerCases/'+key;
  return runIdempotent(async tx=>{
   const {o,uid}=await checkOrder(tx,ctx,oid);need(clean(d.invoiceNo)===o.invoiceNo,'Nomor invoice harus sama dengan pesanan yang dipilih.');
   need(f.objectName===filePath(uid,oid,kind,f.sha256,f.mime),'Path dokumen tidak sesuai pemilik/pesanan.');
   const old=await tx.get(path);let prior=null;if(old)prior=await tx.get('resellerRevisions/'+old.currentRevisionId);
   const content={file:f,trackingNo:kind==='shipping'?clean(d.trackingNo):'',courier:kind==='shipping'?clean(d.courier):'',transferDate:kind==='payment'?clean(d.transferDate,10):'',amount:kind==='payment'?Number(d.amount):0};
   const contentHash=sha256(JSON.stringify(content));
   if(old){need(old.orderId===oid&&old.resellerId===uid&&old.kind===kind,'Kasus dokumen tidak sesuai.');if(prior?.contentHash===contentHash)return {id:key,revisionId:old.currentRevisionId,reused:true};need(old.status==='correction','Dokumen masih diperiksa atau sudah disetujui.');}
   else need(key===caseKey(oid,kind,f.sha256),'ID pengajuan baru tidak sesuai.');
   if(kind==='shipping')need(content.trackingNo&&content.courier,'Nomor resi dan nama kurir wajib diisi.');
   else {need(/^\d{4}-\d{2}-\d{2}$/.test(content.transferDate)&&content.transferDate<=today(),'Tanggal transfer tidak valid atau di masa depan.');need(Number.isSafeInteger(content.amount)&&content.amount>0&&content.amount<=totals(o).remaining,'Nominal harus positif dan tidak melebihi sisa tagihan.');need(o.schemaVersion===2&&o.paymentMethod==='transfer'&&o.totalAccepted===true,'Pesanan baru, total final, dan transfer harus dikonfirmasi dahulu.');}
   const revision=(old?.revision||0)+1,rid=key+'_r'+revision,at=stamp();
   tx.set('resellerRevisions/'+rid,{caseId:key,orderId:oid,resellerId:uid,invoiceNo:o.invoiceNo,kind,revision,...content,contentHash,createdBy:ctx.uid,createdAt:at});
   tx.set(path,{orderId:oid,resellerId:uid,invoiceNo:o.invoiceNo,kind,revision,currentRevisionId:rid,status:'pending',createdBy:old?.createdBy||ctx.uid,createdAt:old?.createdAt||at,updatedBy:ctx.uid,updatedAt:at});
   return {id:key,revisionId:rid,reused:false};
  });
 }
 async function review(ctx,d){
  need(ctx.role==='admin','Hanya admin dapat memeriksa dokumen.');need(['approved','correction'].includes(d.decision),'Keputusan tidak valid.');
  return runIdempotent(async tx=>{
   const key=safeId(d.caseId),c=await tx.get('resellerCases/'+key);need(c,'Pengajuan tidak ditemukan.');
   need(c.currentRevisionId===d.revisionId,'Revisi sudah berubah. Muat ulang halaman.');const rid=safeId(c.currentRevisionId);
   const prior=await tx.get('resellerReviews/'+rid);if(prior){need(prior.decision===d.decision,'Revisi ini sudah diperiksa.');return {reused:true};}
   const rev=await tx.get('resellerRevisions/'+rid);need(rev&&c.status==='pending','Dokumen tidak menunggu pemeriksaan.');
   const {o,uid}=await checkOrder(tx,ctx,c.orderId);const reason=clean(d.reason,1000);need(d.decision!=='correction'||reason,'Tuliskan alasan perbaikan.');
   const at=stamp();let bankRef='';
   if(c.kind==='payment'&&d.decision==='approved'){
    need(d.fundsConfirmed===true,'Periksa dana masuk di mutasi bank terlebih dahulu.');bankRef=bankReference(d.bankReference);
    need(o.schemaVersion===2&&o.paymentMethod==='transfer'&&o.totalAccepted===true,'Pesanan belum siap menerima pembayaran.');
    need((o.paidAmount||0)===(o.resellerVerifiedAmount||0),'Pembayaran lain sudah tercatat. Rekonsiliasi dahulu, jangan mencatat ulang.');
    need(rev.amount>0&&rev.amount<=totals(o).remaining,'Nominal melebihi sisa tagihan.');
    const ev=await tx.get('resellerPaymentEvents/'+bankRef),journal=await tx.get('transactions/reseller_'+bankRef),oldJournal=await tx.get('transactions/income_'+c.orderId);
    need(!ev&&!journal&&!oldJournal,'Mutasi bank atau pembayaran ini sudah dicatat.');
    const paid=(o.paidAmount||0)+rev.amount,full=paid===o.total;
    tx.set('resellerPaymentEvents/'+bankRef,{bankReference:bankRef,caseId:key,revisionId:rid,orderId:c.orderId,resellerId:uid,amount:rev.amount,verifiedBy:ctx.uid,verifiedAt:at});
    tx.set('transactions/reseller_'+bankRef,{date:today(),createdAt:at,type:'masuk',category:'Penjualan',description:'Pembayaran reseller '+o.invoiceNo+' — '+bankRef,orderId:c.orderId,resellerEventId:bankRef,amount:rev.amount,managed:true,verifiedBy:ctx.uid});
    tx.update('orders/'+c.orderId,{paidAmount:paid,resellerVerifiedAmount:paid,resellerPaymentFlow:true,paymentStatus:full?'lunas':'sebagian',status:full?'diproses':o.status,...(full?{detailStatus:'Disiapkan'}:{}),expiresAt:null,lastResellerPaymentEvent:bankRef,statusHistory:[...(o.statusHistory||[]),{status:full?'diproses':o.status,at:new Date().toISOString(),by:ctx.uid,note:'Pembayaran reseller terverifikasi '+bankRef+': Rp '+rev.amount}]});
   }
   if(c.kind==='shipping'&&d.decision==='approved'){
    need(!o.shippingLabelCaseId||o.shippingLabelCaseId===key,'Pesanan sudah memakai label lain.');
    tx.update('orders/'+c.orderId,{shippingLabelCaseId:key,shippingLabelRevisionId:rid,trackingNumber:rev.trackingNo,courier:rev.courier});
   }
   tx.set('resellerReviews/'+rid,{caseId:key,revisionId:rid,orderId:c.orderId,resellerId:uid,kind:c.kind,decision:d.decision,reason,bankReference:bankRef,reviewedBy:ctx.uid,reviewedAt:at});
   tx.update('resellerCases/'+key,{status:d.decision,updatedAt:at,updatedBy:ctx.uid});return {reused:false};
  });
 }
 return {submit,review};
}
