import {unitPrice} from './planning-domain.js?v=admin-lengkap-20260909-r2';
const randomUUID=()=>crypto.randomUUID();
import {Fault,check,str,num,id,hash,config,validateConfig,normalizeProduct,publicProduct,cartInput,priceCart,shipping,address,validateSlot,validDate,canPay} from './manual-domain.js?v=admin-lengkap-20260909-r2';

// Store contract: get/list outside a transaction; tx.get(path), tx.set/update/delete inside.
// Every transaction below completes reads before staging writes. Firestore retries conflicts.
export function commerce(store,providers={}) {
  const time=()=>providers.now?providers.now():Date.now();
  const iso=()=>new Date(time()).toISOString();
  function user(ctx){check(ctx?.uid,'Silakan masuk terlebih dahulu.','unauthenticated');return id(ctx.uid);}
  function admin(ctx){user(ctx);check(ctx.role==='admin','Akses hanya untuk admin.','permission-denied');}
  function owner(ctx,o){user(ctx);check(o&&(ctx.role==='admin'||o.customerId===ctx.uid),'Pesanan tidak tersedia.','permission-denied');}
  function history(o,status,ctx,note=''){return [...(o.statusHistory||[]),{status,at:iso(),by:ctx.actorId||ctx.uid||'system',note}];}
  const settings=async()=>config(await store.get('settings/ecommerce'));
  async function productMap(tx,items){const m=new Map();for(const pid of new Set(items.map(x=>x.productId))){const p=await tx.get('products/'+id(pid));check(p,'Produk tidak ditemukan.');m.set(pid,p);}return m;}
  function writeProducts(tx,m){for(const [pid,p] of m){p.totalStock=p.variants.reduce((s,v)=>s+v.stock,0);p.revision=(p.revision||0)+1;tx.set('products/'+pid,p);const pub=publicProduct(p,pid);if(pub){tx.set('catalog/'+pid,pub);tx.set('resellerPrices/'+pid,{productId:pid,...p.website.reseller});}else{tx.delete('catalog/'+pid);tx.delete('resellerPrices/'+pid);}}}
  function reserve(items,m,sign){for(const i of items){const p=m.get(i.productId),v=p.variants.find(x=>x.id===i.variantId);check(v,'Varian perlu diperiksa admin.');v.stock+=sign*i.qty;v.reserved=(v.reserved||0)-sign*i.qty;check(v.stock>=0&&v.reserved>=0,'Stok tidak konsisten.');}}
  async function routeFor(a,c){if(c.routeProvider!=='google'||!providers.route)return null;try{return await providers.route(a,c.warehouse);}catch{return null;}}
  async function quote(ctx,d){
    user(ctx);const c=await settings();check(c.enabled,'Toko belum menerima pesanan.');const a=address(d.address),items=cartInput(d.items);
    const m=await productMap(store,items),r=await store.get('resellers/'+ctx.uid);
    const priced=priceCart(items,m,d.mode,r,c,d.voucher,time());const route=await routeFor(a,c);const ship=shipping(priced,d.shippingMethod,route,c);
    return {...priced,...ship,total:ship.shippingCost===null?null:priced.subtotal-priced.discount+ship.shippingCost,routeSource:route?'google':'manual',address:a};
  }
  async function createOrder(ctx,d,manual=false){
    if(manual)admin(ctx);else user(ctx);
    const items=cartInput(d.items),a=address(d.address),key=id(d.key),method=d.shippingMethod;
    const payload={items,address:a,mode:d.mode,shippingMethod:method,slotId:d.slotId||'',paymentMethod:d.paymentMethod,voucher:d.voucher||'',note:str(d.note||'',1000),requestId:d.requestId||'',orderOrigin:d.orderOrigin||'website',verifiedFee:d.verifiedFee??null,verifiedDistanceKm:d.verifiedDistanceKm??null,verificationNote:d.verificationNote||''};
    const fingerprint=hash(payload),oid='KN-'+hash([ctx.uid,key]).slice(0,32),path='orders/'+oid;
    const existing=await store.get(path);if(existing){check(existing.requestHash===fingerprint,'Kunci checkout telah dipakai untuk rincian lain.');return {id:oid,invoiceNo:existing.invoiceNo};}
    const c0=await settings(),route=await routeFor(a,c0),configHash=hash(c0);
    return store.run(async tx=>{
      const prev=await tx.get(path);if(prev){check(prev.requestHash===fingerprint,'Kunci checkout berbeda.');return {id:oid,invoiceNo:prev.invoiceNo};}
      const request=d.requestId?await tx.get('orderRequests/'+id(d.requestId)):null;
      if(d.requestId)check(request&&request.customerId===ctx.uid&&request.status==='menunggu_konfirmasi_admin','Permintaan sudah diproses atau bukan milik pelanggan.');
      const c=config(await tx.get('settings/ecommerce'));check(hash(c)===configHash,'Pengaturan berubah. Hitung ulang checkout.');check(c.enabled||manual,'Toko belum menerima pesanan.');
      const r=await tx.get('resellers/'+ctx.uid),m=await productMap(tx,items);
      const channel=d.orderOrigin==='reseller'?'reseller':d.requestId?'website':manual?'manual_admin':'website';
      if(channel==='reseller')check(r?.status==='disetujui','Pesanan reseller memerlukan reseller aktif.');
      let priced=priceCart(items,m,d.mode,r,c,d.voucher,time());
      const ship=d.requestId?(method==='store'?shipping(priced,method,{km:d.verifiedDistanceKm},c):method==='pickup'?shipping(priced,method,null,c):{shippingCost:num(d.verifiedFee),shippingState:'confirmed',distanceKm:null,promoApplied:false}):shipping(priced,method,route,c);
      if(d.requestId){str(d.verificationNote,1000,true);check(ship.shippingCost!==null,'Admin harus memverifikasi ongkir/rute jalan.');}
      const total=ship.shippingCost===null?null:priced.subtotal-priced.discount+ship.shippingCost;
      check(c.payments[d.paymentMethod]===true,'Metode pembayaran belum aktif.');
      if(d.paymentMethod==='cash_store')check(method==='store','Tunai kurir hanya untuk kurir toko.');
      if(d.paymentMethod==='cash_pickup')check(method==='pickup','Tunai gudang hanya untuk ambil sendiri.');
      if(d.paymentMethod.startsWith('cash_'))check((total??priced.subtotal-priced.discount)<=c.cashLimit,'Nominal melebihi batas tunai.');
      let slot=null;if(method==='store'){slot=validateSlot(await tx.get('deliverySlots/'+id(d.slotId)),c,time());}
      // A quoted total must match current server pricing; a pending quote must remain pending.
      check(d.requestId||d.expectedTotal===total,'Harga / ongkir berubah. Tinjau ulang rincian.');
      const expiresAt=new Date(time()+c.reservationMinutes*60000).toISOString();
      const o={schemaVersion:2,salesChannel:channel,resellerId:channel==='reseller'?ctx.uid:null,channelAudit:{origin:channel,by:ctx.actorId||ctx.uid,at:iso()},source:d.requestId?'website':manual?'admin':'website',manualWorkflow:true,requestId:d.requestId||null,customerId:ctx.uid,invoiceNo:oid,requestHash:fingerprint,createdAt:iso(),expiresAt,
        customerName:a.name,phone:a.phone,address:a.text,addressData:a,items:priced.items,subtotal:priced.subtotal,discount:priced.discount,pcs:priced.pcs,
        eligiblePcs:priced.eligiblePcs,usesReseller:priced.usesReseller,shippingMethod:method,...ship,total,totalAccepted:!d.requestId&&total!==null,quoteVersion:1,productIds:[...new Set(items.map(i=>i.productId))],
        mode:d.mode,voucher:d.voucher||'',note:payload.note,paymentMethod:d.paymentMethod,paymentStatus:'belum_dibayar',paidAmount:0,refundCommitted:0,refundedAmount:0,
        cashStatus:'belum_dibayar',cashConfirmed:!d.paymentMethod.startsWith('cash_')||!c.cashNeedsConfirmation,
        status:'menunggu_pembayaran',detailStatus:d.requestId?'Menunggu persetujuan total':total===null?'Menunggu konfirmasi ongkir':'Menunggu pembayaran',courier:'',trackingNumber:'',
        slotId:slot?d.slotId:null,slot:slot?{startAt:slot.startAt,endAt:slot.endAt}:null,slotReleased:false,reservationState:'reserved',
        statusHistory:[{status:'menunggu_pembayaran',at:iso(),by:ctx.uid,note:'Pesanan dibuat; stok dicadangkan.'}]};
      reserve(priced.items,m,-1);writeProducts(tx,m);
      if(slot)tx.update('deliverySlots/'+d.slotId,{used:(slot.used||0)+1});
      if(d.requestId){o.shippingVerifiedBy=ctx.actorId;o.shippingVerificationNote=d.verificationNote;o.statusHistory=[{status:'menunggu_konfirmasi_admin',at:iso(),by:ctx.uid,note:'Permintaan pembeli diterima tanpa reservasi.'},{status:o.status,at:iso(),by:ctx.actorId,note:'Admin memvalidasi harga, stok, jadwal, dan ongkir: '+d.verificationNote}];tx.update('orderRequests/'+d.requestId,{status:'dikonfirmasi',orderId:oid,reviewedBy:ctx.actorId,reviewedAt:iso()});}
      tx.set(path,o);tx.set('customers/web_'+ctx.uid,{name:a.name,phone:a.phone,address:a.text,authUid:ctx.uid,createdAt:iso()});
      return {id:oid,invoiceNo:oid};
    });
  }
  async function cancel(ctx,d,expired=false){
    const oid=id(d.orderId);return store.run(async tx=>{
      const o=await tx.get('orders/'+oid);if(expired){check(ctx.system,'Akses sistem diperlukan.');if(!o||!o.expiresAt||Date.parse(o.expiresAt)>time()||o.paidAmount>0||o.paymentStatus==='perlu_verifikasi'||o.cashConfirmed&&o.paymentMethod.startsWith('cash_'))return {skipped:true};}
      else owner(ctx,o);
      if(o.status==='dibatalkan')return {id:oid};
      check(o.schemaVersion===2,'Pesanan historis harus ditangani melalui rekonsiliasi admin.');
      check(['menunggu_pembayaran','perlu_verifikasi','diproses'].includes(o.status)&&o.reservationState==='reserved','Pesanan sudah dikirim. Ajukan retur.');
      if(!expired&&ctx.role!=='admin')check(o.status!=='diproses','Hubungi admin untuk membatalkan pesanan yang disiapkan.');
      const m=await productMap(tx,o.items),slot=o.slotId&&!o.slotReleased?await tx.get('deliverySlots/'+o.slotId):null;
      reserve(o.items,m,1);writeProducts(tx,m);if(slot)tx.update('deliverySlots/'+o.slotId,{used:Math.max(0,slot.used-1)});
      const reason=expired?'Batas waktu pembayaran habis':str(d.reason||'',500,true);
      tx.update('orders/'+oid,{status:'dibatalkan',detailStatus:expired?'Kedaluwarsa':'Dibatalkan',cancelReason:reason,reservationState:'released',slotReleased:true,expiresAt:null,
        paymentStatus:o.paidAmount>0?'refund_menunggu':'dibatalkan',statusHistory:history(o,'dibatalkan',ctx,reason)});return {id:oid};
    });
  }
  async function confirmShipping(ctx,d){admin(ctx);return store.run(async tx=>{
    const path='orders/'+id(d.orderId),o=await tx.get(path);check(o&&o.schemaVersion===2,'Pesanan tidak tersedia.');
    check(o.shippingState!=='confirmed'&&o.paidAmount===0&&o.status!=='dibatalkan','Ongkir sudah final atau pesanan tidak dapat diubah.');
    const c=config(await tx.get('settings/ecommerce'));const note=str(d.note,1000,true);let ship;
    if(o.shippingMethod==='store'){check(Number.isFinite(d.distanceKm)&&d.distanceKm>=0,'Masukkan jarak rute jalan terverifikasi.');ship=shipping(o,'store',{km:d.distanceKm},c);}
    else ship={shippingCost:num(d.fee),distanceKm:null,shippingState:'confirmed'};
    const total=o.subtotal-o.discount+ship.shippingCost;if(o.paymentMethod.startsWith('cash_'))check(total<=c.cashLimit,'Total melebihi batas tunai. Batalkan atau ubah metode melalui pesanan baru.');
    tx.update(path,{...ship,total,totalAccepted:false,quoteVersion:o.quoteVersion+1,shippingVerifiedBy:ctx.uid,shippingVerificationNote:note,detailStatus:'Menunggu persetujuan total',statusHistory:history(o,o.status,ctx,'Ongkir dikonfirmasi: '+note)});return {total};
  });}
  async function acceptTotal(ctx,d){return store.run(async tx=>{const path='orders/'+id(d.orderId),o=await tx.get(path);owner(ctx,o);check(o.customerId===ctx.uid,'Persetujuan hanya oleh pembeli.');check(o.status!=='dibatalkan'&&o.shippingState==='confirmed'&&o.quoteVersion===d.quoteVersion&&o.total===d.total,'Total berubah / tidak tersedia.');check(!o.expiresAt||Date.parse(o.expiresAt)>time(),'Pesanan kedaluwarsa.');tx.update(path,{totalAccepted:true,detailStatus:'Menunggu pembayaran',statusHistory:history(o,o.status,ctx,'Pembeli menyetujui total final.')});return {ok:true};});}
  async function privateFile(ctx,d){user(ctx);const o=await store.get('orders/'+id(d.orderId));check(o&&(o.customerId===ctx.uid||ctx.role==='admin'||ctx.role==='courier'&&o.courierId===ctx.uid),'Bukti tidak tersedia.','permission-denied');
    check(typeof d.path==='string'&&d.path.startsWith('evidence/'+d.orderId+'/'),'Lokasi bukti tidak valid.');
    return o;
  }
  async function verifyEvidence(ctx,oid,paths){check(Array.isArray(paths)&&paths.length<=6,'Maksimal enam bukti.');for(const path of paths){check(typeof path==='string'&&path.startsWith(`evidence/${oid}/${ctx.uid}/`),'Bukti harus milik pengunggah.');check(providers.verifyFile,'Penyimpanan bukti belum tersedia.');await providers.verifyFile(path);}return paths;}
  async function proof(ctx,d){user(ctx);await verifyEvidence(ctx,id(d.orderId),[d.path]);return store.run(async tx=>{const path='orders/'+d.orderId,o=await tx.get(path);owner(ctx,o);canPay(o,time());check(o.paymentMethod==='transfer'&&o.paidAmount===0,'Pesanan tidak memerlukan bukti transfer.');tx.update(path,{proofPath:d.path,paymentStatus:'perlu_verifikasi',status:'perlu_verifikasi',statusHistory:history(o,'perlu_verifikasi',ctx,'Bukti diterima, dana belum diverifikasi.')});return {ok:true};});}
  function ledger(tx,key,o,amount,type,description,ctx){tx.set('transactions/'+key,{date:iso().slice(0,10),createdAt:iso(),type,amount,description,category:type==='masuk'?'Penjualan':'Refund',orderId:o.invoiceNo,verifiedBy:ctx.uid||'gateway',managed:true});}
  async function payment(ctx,d){admin(ctx);return store.run(async tx=>{
    const path='orders/'+id(d.orderId),o=await tx.get(path);check(o,'Pesanan tidak tersedia.');canPay(o,time());
    check(!o.resellerPaymentFlow&&o.salesChannel!=='reseller','Gunakan tab Pembayaran Reseller untuk pesanan asal reseller.');
    const key='income_'+d.orderId,old=await tx.get('transactions/'+key);
    if(o.paidAmount===o.total&&old)return {ok:true};
    check(o.paymentMethod==='transfer','Verifikasi ini hanya untuk transfer.');check(d.amount===o.total,'Nominal dana masuk harus sama dengan total.');
    str(d.reference,200,true);ledger(tx,key,o,o.total,'masuk','Transfer terverifikasi '+d.reference,ctx);
    tx.update(path,{paidAmount:o.total,paymentStatus:'lunas',status:'diproses',detailStatus:'Disiapkan',expiresAt:null,paymentReference:d.reference,statusHistory:history(o,'diproses',ctx,'Dana transfer diverifikasi.')});return {ok:true};
  });}
  async function orderAction(ctx,d){admin(ctx);if(d.action==='cancel')return cancel(ctx,d);
    return store.run(async tx=>{
      const path='orders/'+id(d.orderId),o=await tx.get(path);check(o,'Pesanan tidak tersedia.');
      if(o.schemaVersion!==2){
        check(['diproses','dikirim','selesai','dibatalkan','menunggu_pembayaran'].includes(d.status),'Status lama tidak valid.');
        tx.update(path,{status:d.status,courier:str(d.courier||o.courier||'',200),trackingNumber:str(d.trackingNumber||o.trackingNumber||'',200),statusHistory:history(o,d.status,ctx,'Perubahan pesanan historis; tidak mengubah stok atau kas otomatis.')});return {ok:true};
      }
      check(o.status!=='dibatalkan','Pesanan dibatalkan.');
      if(d.action==='rejectProof'){check(o.paymentMethod==='transfer'&&o.paidAmount===0,'Bukti tidak dapat ditolak.');tx.update(path,{status:'menunggu_pembayaran',paymentStatus:'belum_dibayar',proofPath:null,statusHistory:history(o,'menunggu_pembayaran',ctx,str(d.note,500,true))});return {ok:true};}
      canPay(o,time());const cash=o.paymentMethod.startsWith('cash_');
      if(d.action==='confirmCash'){check(cash,'Bukan pesanan tunai.');tx.update(path,{cashConfirmed:true,status:'diproses',expiresAt:null,detailStatus:'Disiapkan',statusHistory:history(o,'diproses',ctx,'Pesanan tunai dikonfirmasi.')});return {ok:true};}
      check(o.paymentStatus==='lunas'||cash&&o.cashConfirmed,'Verifikasi pembayaran / konfirmasi tunai dahulu.');
      if(d.action==='stage'){check(['Disiapkan','Dikemas','Menunggu kurir'].includes(d.stage)&&o.status==='diproses','Tahapan tidak valid.');tx.update(path,{detailStatus:d.stage,statusHistory:history(o,o.status,ctx,d.stage)});return {ok:true};}
      if(d.action==='assign'){check(o.shippingMethod==='store'&&o.status==='diproses','Penugasan hanya sebelum dikirim.');const courier=await tx.get('courierProfiles/'+id(d.courierId));check(courier?.active,'Kurir tidak aktif.');
        tx.update(path,{courierId:d.courierId,courier:courier.name,trackingNumber:courier.phone,detailStatus:'Menunggu kurir',statusHistory:history(o,o.status,ctx,'Ditugaskan kepada '+courier.name)});
        tx.set('courierTasks/'+d.orderId,taskProjection({...o,detailStatus:'Menunggu kurir'},d.orderId,d.courierId));return {ok:true};}
      if(d.action==='ship'||d.action==='complete'){
        check(d.action==='ship'?o.status==='diproses':o.status==='dikirim'||o.shippingMethod==='pickup'&&o.status==='diproses','Urutan status tidak valid.');
        if(d.action==='complete'&&cash)check(o.paidAmount===o.total,'Catat penerimaan tunai terlebih dahulu.');
        if(d.action==='ship')check(o.shippingMethod!=='pickup','Ambil sendiri ditandai selesai.');
        const m=o.reservationState==='reserved'?await productMap(tx,o.items):null,slot=d.action==='complete'&&o.slotId&&!o.slotReleased?await tx.get('deliverySlots/'+o.slotId):null;
        if(m){for(const i of o.items){const v=m.get(i.productId).variants.find(v=>v.id===i.variantId);check(v&&v.reserved>=i.qty,'Reservasi tidak konsisten.');v.reserved-=i.qty;}writeProducts(tx,m);}
        if(slot)tx.update('deliverySlots/'+o.slotId,{used:Math.max(0,slot.used-1)});
        const status=d.action==='ship'?'dikirim':'selesai';const patch={status,reservationState:'consumed',slotReleased:d.action==='complete'||o.slotReleased,detailStatus:status==='selesai'?'Diterima':'Dalam perjalanan',expiresAt:null,
          courier:str(d.courier||o.courier||'',200),trackingNumber:str(d.trackingNumber||o.trackingNumber||'',200),deliveredAt:status==='selesai'?iso():null,statusHistory:history(o,status,ctx)};
        if(d.action==='ship'&&['instant','regular','cargo'].includes(o.shippingMethod))check(patch.courier&&patch.trackingNumber,'Isi penyedia dan referensi pengiriman manual.');
        tx.update(path,patch);if(o.courierId)tx.set('courierTasks/'+d.orderId,taskProjection({...o,...patch},d.orderId,o.courierId));return {ok:true};
      }
      throw new Fault('Aksi pesanan tidak dikenali.');
    });
  }
  function taskProjection(o,oid,uid){return {id:oid,courierId:uid,invoiceNo:o.invoiceNo,customerName:o.customerName,phone:o.phone,addressData:o.addressData,
    packageCount:o.packageCount||null,packageNote:o.packageNote||'',items:o.items.map(i=>({productName:i.productName,variant:i.variant,qty:i.qty,pcs:i.pcs})),slot:o.slot,note:o.note,amountToCollect:o.paymentMethod==='cash_store'?o.total:0,cashStatus:o.cashStatus,status:o.status,detailStatus:o.detailStatus};}
  async function cash(ctx,d){user(ctx);return store.run(async tx=>{
    const path='orders/'+id(d.orderId),o=await tx.get(path);check(o,'Pesanan tidak tersedia.');canPay(o,time());check(o.paymentMethod.startsWith('cash_')&&o.cashConfirmed,'Pesanan tunai belum dikonfirmasi.');
    const isCourier=ctx.role==='courier'&&o.courierId===ctx.uid&&o.paymentMethod==='cash_store';
    check(ctx.role==='admin'||isCourier,'Akses tunai ditolak.','permission-denied');
    const key='income_'+d.orderId,prev=isCourier?null:await tx.get('transactions/'+key);let patch={};
    if(d.action==='receive'){
      if(o.paidAmount===o.total)return {ok:true};check(d.amount===o.total,'Nominal tunai harus tepat.');
      if(isCourier)check(o.status==='dikirim','Paket belum diambil kurir.');
      patch={paidAmount:o.total,paymentStatus:'lunas',cashStatus:o.paymentMethod==='cash_pickup'?'setoran_diverifikasi':'diterima_kurir',cashReceivedBy:ctx.uid,expiresAt:null};
      if(o.paymentMethod==='cash_pickup'&&!prev)ledger(tx,key,o,o.total,'masuk','Tunai diterima kasir',ctx);
    }else if(d.action==='deposit'){
      check(o.cashStatus==='diterima_kurir'||o.cashStatus==='disetor_kurir','Dana belum diterima kurir.');patch={cashStatus:'disetor_kurir',depositReference:str(d.reference,200,true),depositedBy:ctx.uid};
    }else if(d.action==='verifyDeposit'){
      admin(ctx);check(ctx.uid!==o.depositedBy&&ctx.uid!==o.cashReceivedBy,'Setoran harus diverifikasi kasir lain.');
      if(prev)return {ok:true};check(o.cashStatus==='disetor_kurir'&&d.amount===o.total,'Setoran belum sesuai.');
      ledger(tx,key,o,o.total,'masuk','Setoran tunai diverifikasi',ctx);patch={cashStatus:'setoran_diverifikasi',depositVerifiedBy:ctx.uid};
    }else throw new Fault('Aksi tunai tidak valid.');
    patch.statusHistory=history(o,o.status,ctx,patch.cashStatus);tx.update(path,patch);if(o.courierId)tx.set('courierTasks/'+d.orderId,taskProjection({...o,...patch},d.orderId,o.courierId));return {ok:true};
  });}
  async function courierAction(ctx,d){user(ctx);check(ctx.role==='courier','Akses kurir diperlukan.','permission-denied');
    if(d.action==='deliver')str(d.receiptNote,1000,true);
    return store.run(async tx=>{
      const path='orders/'+id(d.orderId),o=await tx.get(path);check(o&&o.courierId===ctx.uid,'Tugas bukan milik kurir.','permission-denied');
      check(o.status!=='dibatalkan'&&o.status!=='selesai','Tugas sudah ditutup.');let patch={};
      if(d.action==='pickup'){
        throw new Fault('Admin perlu mengonfirmasi penyerahan paket melalui Tandai dikirim.');
        check(o.status==='diproses'&&o.totalAccepted&&(o.paymentStatus==='lunas'||o.paymentMethod==='cash_store'&&o.cashConfirmed),'Paket belum siap.');
        const m=await productMap(tx,o.items);for(const i of o.items){const v=m.get(i.productId).variants.find(v=>v.id===i.variantId);check(v&&v.reserved>=i.qty,'Reservasi tidak konsisten.');v.reserved-=i.qty;}writeProducts(tx,m);
        patch={status:'dikirim',detailStatus:'Paket diambil',reservationState:'consumed',expiresAt:null};
      }else if(d.action==='travel'){check(o.status==='dikirim','Paket belum diambil.');patch={detailStatus:'Dalam perjalanan'};}
      else if(d.action==='deliver'){check(o.status==='dikirim','Paket belum diambil.');check(o.paymentMethod!=='cash_store'||o.paidAmount===o.total,'Catat uang diterima sebelum menyelesaikan.');patch={status:'selesai',detailStatus:'Diterima',deliveryReceiptNote:str(d.receiptNote,1000,true),deliveredAt:iso()};}
      else if(d.action==='fail'){check(o.status==='dikirim','Paket belum diambil.');patch={detailStatus:'Gagal antar',failureReason:str(d.reason,1000,true)};}
      else throw new Fault('Aksi kurir tidak valid.');
      // release slot only at delivery; the stock is never restored on a failed delivery.
      if(d.action==='deliver'&&o.slotId&&!o.slotReleased){const slot=await tx.get('deliverySlots/'+o.slotId);check(slot&&slot.used>0,'Kuota perlu diperiksa admin.');tx.update('deliverySlots/'+o.slotId,{used:slot.used-1,lastReleasedOrder:d.orderId});patch.slotReleased=true;}
      tx.update(path,{...patch,statusHistory:history(o,patch.status||o.status,ctx,patch.detailStatus)});tx.set('courierTasks/'+d.orderId,taskProjection({...o,...patch},d.orderId,ctx.uid));return {ok:true};
    });
  }
  async function reschedule(ctx,d){admin(ctx);return store.run(async tx=>{const path='orders/'+id(d.orderId),o=await tx.get(path);check(o?.shippingMethod==='store'&&o.status==='diproses'&&!o.slotReleased,'Jadwal tidak dapat diubah.');if(o.slotId===d.slotId)return {ok:true};
    const c=config(await tx.get('settings/ecommerce')),slot=validateSlot(await tx.get('deliverySlots/'+id(d.slotId)),c,time()),old=await tx.get('deliverySlots/'+o.slotId);
    tx.update('deliverySlots/'+d.slotId,{used:(slot.used||0)+1});if(old)tx.update('deliverySlots/'+o.slotId,{used:Math.max(0,old.used-1)});
    const patch={slotId:d.slotId,slot:{startAt:slot.startAt,endAt:slot.endAt},statusHistory:history(o,o.status,ctx,'Jadwal diubah: '+str(d.note,500,true))};tx.update(path,patch);if(o.courierId)tx.set('courierTasks/'+d.orderId,taskProjection({...o,...patch},d.orderId,o.courierId));return {ok:true};});}
  async function reseller(ctx,d){user(ctx);const path='resellers/'+ctx.uid;return store.run(async tx=>{const r=await tx.get(path);check(!r||['ditolak'].includes(r.status),'Pengajuan sudah ada / akses dinonaktifkan.');const data={name:str(d.name,150,true),phone:str(d.phone,30,true),storeName:str(d.storeName,150,true),address:str(d.address,1000,true),channel:str(d.channel,500,true),status:'menunggu',createdAt:iso(),customerId:ctx.uid,note:''};tx.set(path,data);return {ok:true};});}
  async function reviewReseller(ctx,d){admin(ctx);check(['disetujui','ditolak','dinonaktifkan'].includes(d.status),'Status reseller tidak valid.');return store.run(async tx=>{const path='resellers/'+id(d.customerId),r=await tx.get(path);check(r,'Pengajuan tidak ditemukan.');tx.update(path,{status:d.status,note:str(d.note,1000),reviewedBy:ctx.uid,reviewedAt:iso()});return {ok:true};});}
  async function claim(ctx,d){user(ctx);const oid=id(d.orderId),cid='R-'+hash([ctx.uid,id(d.key)]).slice(0,32);await verifyEvidence(ctx,oid,d.evidence||[]);
    return store.run(async tx=>{const prev=await tx.get('claims/'+cid);if(prev){check(prev.customerId===ctx.uid&&prev.orderId===oid,'Kunci pengajuan berbeda.');return {id:cid};}
      const request=d.requestId?await tx.get('claimRequests/'+id(d.requestId)):null;if(d.requestId)check(request?.customerId===ctx.uid&&request.status==='menunggu','Pengajuan sudah diproses.');
      const o=await tx.get('orders/'+oid);owner(ctx,o);const c=config(await tx.get('settings/ecommerce'));
      check(['dikirim','selesai'].includes(o.status),'Komplain tersedia setelah dikirim.');check(!o.deliveredAt||time()<=Date.parse(o.deliveredAt)+c.returnDays*86400000,'Batas pengajuan retur telah lewat.');
      const lines=cartInput(d.items),counts={...(o.claimedQuantities||{})};let maxRefund=0;
      for(const x of lines){const i=o.items.find(i=>i.productId===x.productId&&i.variantId===x.variantId);check(i,'Barang bukan bagian pesanan.');const k=x.productId+'_'+x.variantId;check((counts[k]||0)+x.qty<=i.qty,'Jumlah komplain melebihi hak pesanan.');counts[k]=(counts[k]||0)+x.qty;maxRefund+=Math.floor(i.price*x.qty*(o.subtotal-o.discount)/o.subtotal);}
      const reasons=['Barang salah','Varian salah','Jumlah kurang','Barang rusak','Barang belum diterima','Lainnya'];check(reasons.includes(d.reason),'Alasan tidak valid.');
      const data={id:cid,orderId:oid,customerId:ctx.uid,items:lines,reason:d.reason,description:str(d.description,3000,true),evidence:d.evidence||[],createdAt:iso(),status:'diajukan',maxRefund,refundAmount:0,refundPaid:false,restocked:false,messages:[]};
      if(d.requestId)tx.update('claimRequests/'+d.requestId,{status:'dikonfirmasi',claimId:cid,reviewedBy:ctx.actorId,reviewedAt:iso()});
      tx.set('claims/'+cid,data);tx.update('orders/'+oid,{claimedQuantities:counts});return {id:cid};
    });
  }
  async function claimAction(ctx,d){user(ctx);return store.run(async tx=>{
    const path='claims/'+id(d.claimId),r=await tx.get(path);check(r&&(ctx.role==='admin'||r.customerId===ctx.uid),'Pengajuan tidak tersedia.','permission-denied');
    const opath='orders/'+r.orderId,o=await tx.get(opath);check(o,'Pesanan tidak tersedia.');
    if(d.action==='reply'){check((r.messages||[]).length<200,'Riwayat tanggapan penuh.');tx.update(path,{messages:[...(r.messages||[]),{text:str(d.text,3000,true),by:ctx.role==='admin'?'Admin':'Pembeli',at:iso()}]});return {ok:true};}
    admin(ctx);
    if(d.action==='resolve'){
      check(r.status==='diajukan','Solusi sudah ditentukan.');check(['kirim_kekurangan','penggantian','retur','refund','ditolak'].includes(d.resolution),'Solusi tidak valid.');
      const amount=num(d.amount||0);check(amount<=r.maxRefund&&(o.refundCommitted||0)+amount<=o.paidAmount,'Refund melebihi hak / pembayaran diterima.');
      const counts={...(o.claimedQuantities||{})};if(d.resolution==='ditolak'){check(amount===0,'Penolakan tidak memiliki refund.');for(const i of r.items){const k=i.productId+'_'+i.variantId;counts[k]-=i.qty;}}
      tx.update(opath,{refundCommitted:(o.refundCommitted||0)+amount,claimedQuantities:counts});
      tx.update(path,{status:d.resolution,resolutionNote:str(d.note,1000,true),refundAmount:amount,refundStatus:amount?'disetujui':'tidak_ada',approvedBy:ctx.uid});return {ok:true};
    }
    if(d.action==='refundPaid'){
      if(r.refundPaid)return {ok:true};check(r.refundAmount>0,'Refund belum disetujui.');check(r.status!=='retur'||r.returnInspected,'Periksa retur dahulu.');
      const key='refund_'+d.claimId,prev=await tx.get('transactions/'+key);check((o.refundedAmount||0)+r.refundAmount<=o.paidAmount,'Refund melebihi pembayaran.');
      if(!prev)ledger(tx,key,o,r.refundAmount,'keluar','Refund '+str(d.reference,200,true),ctx);
      tx.update(path,{refundPaid:true,refundStatus:'dibayarkan',refundReference:d.reference,refundedAt:iso()});tx.update(opath,{refundedAmount:(o.refundedAmount||0)+r.refundAmount});return {ok:true};
    }
    if(d.action==='inspectReturn'){
      check(r.status==='retur'||r.status==='penggantian','Solusi bukan retur / penggantian.');if(r.returnInspected)return {ok:true};
      const m=await productMap(tx,r.items);if(d.sellable===true){for(const i of r.items){const v=m.get(i.productId).variants.find(v=>v.id===i.variantId);check(v,'Varian retur hilang.');v.stock+=i.qty;}writeProducts(tx,m);}
      tx.update(path,{returnInspected:true,restocked:d.sellable===true,inspectionNote:str(d.note,1000,true),inspectedBy:ctx.uid,inspectedAt:iso()});return {ok:true};
    }
    if(d.action==='fulfill'){check(['kirim_kekurangan','penggantian'].includes(r.status),'Solusi tidak memerlukan pengiriman.');if(r.fulfilled)return {ok:true};const m=await productMap(tx,r.items);for(const i of r.items){const v=m.get(i.productId).variants.find(v=>v.id===i.variantId);check(v&&v.stock>=i.qty,'Stok penggantian kurang.');v.stock-=i.qty;}writeProducts(tx,m);tx.update(path,{fulfilled:true,trackingNumber:str(d.reference,200,true),fulfilledAt:iso()});return {ok:true};}
    throw new Fault('Aksi retur tidak valid.');
  });}
  async function cancellationRefund(ctx,d){admin(ctx);return store.run(async tx=>{const p='orders/'+id(d.orderId),o=await tx.get(p);check(o?.status==='dibatalkan'&&o.paidAmount>0,'Refund pembatalan tidak tersedia.');
    if(d.action==='approve'){check(!o.refundCommitted,'Refund sudah diproses.');tx.update(p,{refundCommitted:o.paidAmount,refundStatus:'disetujui',refundApprovalNote:str(d.note,1000,true)});return {ok:true};}
    check(d.action==='paid'&&o.refundCommitted===o.paidAmount,'Persetujuan refund diperlukan.');if(o.refundedAmount===o.paidAmount)return {ok:true};
    const key='refund_cancel_'+d.orderId,prev=await tx.get('transactions/'+key);if(!prev)ledger(tx,key,o,o.paidAmount,'keluar','Refund pembatalan '+str(d.reference,200,true),ctx);
    tx.update(p,{refundedAmount:o.paidAmount,refundStatus:'dibayarkan',refundReference:d.reference,paymentStatus:'refund_selesai'});return {ok:true};});}
  async function review(ctx,d){user(ctx);return store.run(async tx=>{const o=await tx.get('orders/'+id(d.orderId));owner(ctx,o);check(o.status==='selesai'&&o.paidAmount===o.total,'Ulasan hanya untuk pesanan selesai yang dibayar.');check(o.items.some(i=>i.productId===d.productId),'Produk tidak dibeli.');
    const rid=hash([d.orderId,d.productId]),prev=await tx.get('reviews/'+rid);check(!prev,'Ulasan sudah dikirim.');tx.set('reviews/'+rid,{productId:id(d.productId),rating:num(d.rating,1,5),text:str(d.text,2000,true),buyerLabel:'Pembeli terverifikasi',createdAt:iso()});return {ok:true};});}
  async function saveProduct(ctx,d){admin(ctx);const pid=d.productId?id(d.productId):randomUUID();return store.run(async tx=>{const old=await tx.get('products/'+pid);check(!old||d.expectedRevision===(old.revision||0),'Produk / stok berubah. Muat ulang sebelum menyimpan.');
    const p=normalizeProduct(d.product,old||{});p.createdAt=old?.createdAt||iso();const pub=publicProduct(p,pid);tx.set('products/'+pid,p);if(pub){tx.set('catalog/'+pid,pub);tx.set('resellerPrices/'+pid,{productId:pid,...p.website.reseller});}else{tx.delete('catalog/'+pid);tx.delete('resellerPrices/'+pid);}return {id:pid};});}
  async function legacyManualOrder(ctx,d){admin(ctx);const items=cartInput(d.items),oid='ADM-'+hash([ctx.uid,id(d.key)]).slice(0,32),fingerprint=hash({items,customerName:d.customerName,phone:d.phone,address:d.address,shippingCost:d.shippingCost,mode:d.mode||'eceran',resellerId:d.resellerId||''});
    return store.run(async tx=>{const existing=await tx.get('orders/'+oid);if(existing){check(existing.requestHash===fingerprint,'Rincian berubah pada percobaan ulang. Tutup form untuk membuat pesanan lain.');return {id:oid,invoiceNo:oid};}
      const resellerId=d.resellerId?id(d.resellerId):null,r=resellerId?await tx.get('resellers/'+resellerId):null;if(resellerId)check(r?.status==='disetujui','Reseller harus aktif.');
      const m=await productMap(tx,items);const lines=items.map(i=>{const p=m.get(i.productId),v=p.variants.find(v=>v.id===i.variantId);check(p.status==='aktif'&&v&&v.stock>=i.qty,'Stok / varian tidak tersedia. Jalankan migrasi ID terlebih dahulu.');const price=unitPrice(p,v,i.qty,d.mode||'eceran',!!resellerId,items.filter(x=>p.website.combine==='variant'?x.productId===i.productId&&x.variantId===i.variantId:p.website.combine==='all'?m.get(x.productId).website.combine==='all'&&m.get(x.productId).website.group===p.website.group:x.productId===i.productId).reduce((n,x)=>n+x.qty*m.get(x.productId).website.packPcs,0)).price;return {...i,productName:p.name,variant:[v.color||v.name,v.size].filter(Boolean).join(' / '),price,lineTotal:price*i.qty,packPcs:p.website?.packPcs||1,pcs:i.qty*(p.website?.packPcs||1),promo:false};});
      const subtotal=lines.reduce((s,i)=>s+i.lineTotal,0),shippingCost=num(d.shippingCost),total=subtotal+shippingCost;
      const o={schemaVersion:2,manualWorkflow:true,source:'admin',salesChannel:resellerId?'reseller':'manual_admin',resellerId,channelAudit:{origin:resellerId?'reseller':'manual_admin',by:ctx.uid,at:iso()},productIds:[...new Set(items.map(i=>i.productId))],invoiceNo:oid,requestHash:fingerprint,customerId:resellerId||ctx.uid,customerName:str(d.customerName,150,true),phone:str(d.phone||'',30),address:str(d.address||'',1000),addressData:{name:d.customerName,phone:d.phone||'',text:d.address||'',lat:0,lng:0},items:lines,subtotal,discount:0,shippingCost,total,pcs:lines.reduce((s,i)=>s+i.pcs,0),eligiblePcs:0,usesReseller:false,shippingMethod:'regular',shippingState:'confirmed',totalAccepted:true,quoteVersion:1,paymentMethod:'transfer',paymentStatus:'belum_dibayar',paidAmount:0,refundedAmount:0,refundCommitted:0,cashStatus:'belum_dibayar',status:'menunggu_pembayaran',detailStatus:'Menunggu pembayaran',reservationState:'reserved',slotId:null,slot:null,slotReleased:true,courier:'',trackingNumber:'',note:'Pesanan dibuat admin. Pin belum diverifikasi; tidak untuk promo jarak.',createdAt:iso(),expiresAt:new Date(time()+120*60000).toISOString(),statusHistory:[{status:'menunggu_pembayaran',at:iso(),by:ctx.uid,note:'Harga Eceran/Grosir dihitung dari produk; pembayaran belum diverifikasi.'}]};
      reserve(lines,m,-1);writeProducts(tx,m);tx.set('orders/'+oid,o);return {id:oid,invoiceNo:oid};});}
  async function slotSave(ctx,d){admin(ctx);const sid=d.id?id(d.id):randomUUID();return store.run(async tx=>{const old=await tx.get('deliverySlots/'+sid);const s={id:sid,startAt:validDate(d.startAt),endAt:validDate(d.endAt),cutoffAt:validDate(d.cutoffAt),capacity:num(d.capacity,1,10000),used:old?.used||0,enabled:d.enabled===true,courierId:d.courierId?id(d.courierId):''};check(s.capacity>=s.used,'Kuota di bawah jumlah pesanan terjadwal.');if(s.used)check(s.startAt===old.startAt&&s.endAt===old.endAt,'Slot berisi pesanan: gunakan penjadwalan ulang pesanan.');check(Date.parse(s.endAt)>Date.parse(s.startAt)&&Date.parse(s.cutoffAt)<=Date.parse(s.startAt),'Waktu slot tidak valid.');tx.set('deliverySlots/'+sid,s);return {id:sid};});}
  async function profile(ctx,d){user(ctx);check(Array.isArray(d.addresses)&&d.addresses.length<=10,'Maksimal 10 alamat.');const p={name:str(d.name,150,true),phone:str(d.phone,30),addresses:d.addresses.map(address),updatedAt:iso()};await store.set('profiles/'+ctx.uid,p);return {ok:true};}
  async function gatewaySession(ctx,d){user(ctx);const oid=id(d.orderId),o=await store.get('orders/'+oid);owner(ctx,o);canPay(o,time());check(o.paymentMethod==='gateway'&&o.paidAmount===0,'Pembayaran gateway tidak tersedia.');check(providers.gatewaySession,'Gateway belum dikonfigurasi.');
    // Provider order_id is deterministic. A lost response can be reconciled without a new charge.
    const response=await providers.gatewaySession(o);check(typeof response?.redirectUrl==='string','Gateway tidak memberikan URL.');
    await store.run(async tx=>{const fresh=await tx.get('orders/'+oid);check(fresh&&fresh.total===o.total&&fresh.status!=='dibatalkan','Pesanan berubah.');tx.update('orders/'+oid,{gatewayReference:o.invoiceNo,gatewayRedirect:response.redirectUrl});});return response;
  }
  async function gatewayPaid(event){check(event.verified===true,'Webhook belum diverifikasi.','permission-denied');return store.run(async tx=>{
    const oid=id(event.orderId),path='orders/'+oid,o=await tx.get(path);check(o&&o.paymentMethod==='gateway','Pesanan gateway tidak ditemukan.');
    check(event.currency==='IDR'&&event.amount===o.total,'Nominal / mata uang tidak sesuai.');const key='income_'+oid,prev=await tx.get('transactions/'+key);if(prev)return {ok:true};
    const late=o.status==='dibatalkan'||!!o.expiresAt&&Date.parse(o.expiresAt)<=time();
    ledger(tx,key,o,o.total,'masuk','Gateway '+str(event.reference,200,true),{uid:'gateway'});
    tx.update(path,{paidAmount:o.total,paymentStatus:late?'perlu_rekonsiliasi':'lunas',status:late?o.status:'diproses',expiresAt:null,gatewayReference:event.reference,
      detailStatus:late?'Pembayaran terlambat; admin perlu meninjau':'Disiapkan',statusHistory:history(o,late?o.status:'diproses',{uid:'gateway'},late?'Pembayaran terlambat, jangan kirim otomatis.':'Pembayaran gateway terverifikasi')});return {ok:true};
  });}
  async function dispatch(ctx,d){check(d&&typeof d.action==='string','Aksi wajib diisi.','invalid-argument');
    switch(d.action){
      case 'catalog':{const c=await settings();return {products:await store.list('catalog'),settings:{enabled:c.enabled,whatsapp:c.whatsapp,categories:c.categories,promos:c.promos,shipping:c.shipping,payments:c.payments,banks:c.banks,freeShipping:c.freeShipping,warehouse:c.warehouse,returnPolicy:c.returnPolicy,returnDays:c.returnDays}};}
      case 'quote':return quote(ctx,d);
      case 'createOrder':return createOrder(ctx,d);
      case 'createManualOrder':return createOrder(ctx,d,true);
      case 'confirmRequest':{admin(ctx);const req=await store.get('orderRequests/'+id(d.requestId));check(req,'Permintaan tidak ditemukan.');if(req.status==='dikonfirmasi')return {id:req.orderId};check(req.status==='menunggu_konfirmasi_admin','Permintaan sudah ditutup.');return createOrder({uid:req.customerId,role:'admin',actorId:ctx.uid},{...req.payload,key:req.key,requestId:d.requestId,verifiedFee:d.verifiedFee,verifiedDistanceKm:d.verifiedDistanceKm,verificationNote:d.verificationNote},true);}
      case 'rejectRequest':{admin(ctx);return store.run(async tx=>{const path='orderRequests/'+id(d.requestId),r=await tx.get(path);check(r?.status==='menunggu_konfirmasi_admin','Permintaan sudah diproses.');tx.update(path,{status:'ditolak',reviewNote:str(d.note,1000,true),reviewedBy:ctx.uid,reviewedAt:iso()});return {ok:true};});}
      case 'expireOrder':admin(ctx);return cancel({...ctx,system:true},{orderId:d.orderId},true);
      case 'legacyManualOrder':return legacyManualOrder(ctx,d);
      case 'myOrders':user(ctx);return store.list('orders',[['customerId','==',ctx.uid]]);
      case 'myAccount':user(ctx);return {profile:await store.get('profiles/'+ctx.uid),reseller:await store.get('resellers/'+ctx.uid)};
      case 'getOrder':{const o=await store.get('orders/'+id(d.orderId));owner(ctx,o);return {...o,id:d.orderId,claims:await store.list('claims',[['orderId','==',d.orderId]])};}
      case 'slots':{user(ctx);const c=await settings();return (await store.list('deliverySlots')).filter(s=>{try{validateSlot(s,c,time());return true;}catch{return false;}}).map(s=>({id:s.id,startAt:s.startAt,endAt:s.endAt,remaining:s.capacity-s.used}));}
      case 'profile':return profile(ctx,d);
      case 'reseller':return reseller(ctx,d);
      case 'cancel':return cancel(ctx,d);
      case 'acceptTotal':return acceptTotal(ctx,d);
      case 'proof':return proof(ctx,d);
      case 'claim':return claim(ctx,d);
      case 'confirmClaimRequest':{admin(ctx);const r=await store.get('claimRequests/'+id(d.requestId));check(r,'Pengajuan tidak ditemukan.');if(r.status==='dikonfirmasi')return {id:r.claimId};return claim({uid:r.customerId,role:'admin',actorId:ctx.uid},{...r.payload,key:r.key,requestId:d.requestId,evidence:[]});}
      case 'rejectClaimRequest':{admin(ctx);return store.run(async tx=>{const path='claimRequests/'+id(d.requestId),r=await tx.get(path);check(r?.status==='menunggu','Pengajuan sudah diproses.');tx.update(path,{status:'ditolak',reviewNote:str(d.note,1000,true),reviewedBy:ctx.uid,reviewedAt:iso()});return {ok:true};});}
      case 'claimAction':return claimAction(ctx,{...d,action:d.operation});
      case 'review':return review(ctx,d);
      case 'reviews':return store.list('reviews',[['productId','==',id(d.productId)]]);
      case 'resellerPrices':{user(ctx);const r=await store.get('resellers/'+ctx.uid);if(r?.status!=='disetujui')return [];const products=await store.list('products');return products.filter(p=>p.status==='aktif'&&p.website?.enabled).map(p=>({productId:p.id,...p.website.reseller}));}
      case 'courierTasks':user(ctx);check(ctx.role==='courier','Akses kurir diperlukan.');return store.list('courierTasks',[['courierId','==',ctx.uid]]);
      case 'courierAction':return courierAction(ctx,{...d,action:d.operation});
      case 'cash':return cash(ctx,{...d,action:d.operation});
      case 'gatewaySession':return gatewaySession(ctx,d);
      case 'adminData':admin(ctx);return {settings:await settings(),orders:await store.list('orders'),resellers:await store.list('resellers'),claims:await store.list('claims'),slots:await store.list('deliverySlots'),couriers:await store.list('courierProfiles'),products:await store.list('products')};
      case 'saveConfig':admin(ctx);await store.set('settings/ecommerce',validateConfig(d.settings));return {ok:true};
      case 'saveProduct':return saveProduct(ctx,d);
      case 'saveSlot':return slotSave(ctx,d);
      case 'saveCourier':admin(ctx);await store.set('courierProfiles/'+id(d.uid),{name:str(d.name,150,true),phone:str(d.phone,30,true),active:d.active===true});return {ok:true};
      case 'reviewReseller':return reviewReseller(ctx,d);
      case 'confirmShipping':return confirmShipping(ctx,d);
      case 'verifyPayment':return payment(ctx,d);
      case 'orderAction':return orderAction(ctx,{...d,action:d.operation});
      case 'reschedule':return reschedule(ctx,d);
      case 'cancellationRefund':return cancellationRefund(ctx,{...d,action:d.operation});
      case 'privateFile':await privateFile(ctx,d);return {ok:true};
      default:throw new Fault('Aksi tidak dikenali.','invalid-argument');
    }
  }
  return {dispatch,gatewayPaid,expire:oid=>cancel({system:true,uid:'system'},{orderId:oid},true)};
}
