import {MAX_DOCUMENT_BYTES,need,filePath} from './reseller-service.js?v=admin-supplier-20260909-r3';
import {buyerFilePath} from './buyer-domain.js?v=dokumen-privat-20260913-r8b';
export async function blobHash(blob){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer())),x=>x.toString(16).padStart(2,'0')).join('');}
export async function detectedMime(file){
 const b=new Uint8Array(await file.slice(0,12).arrayBuffer());
 if(b[0]===0x25&&b[1]===0x50&&b[2]===0x44&&b[3]===0x46&&b[4]===0x2d)return 'application/pdf';
 if(b[0]===0xff&&b[1]===0xd8&&b[2]===0xff)return 'image/jpeg';
 if([137,80,78,71,13,10,26,10].every((v,i)=>b[i]===v))return 'image/png';
 throw Error('Isi berkas bukan PDF, JPG, atau PNG yang didukung.');
}
export async function prepareDocument(file){
 need(file?.size>0&&file.size<=12*1024*1024,'Pilih berkas. Foto sumber maksimal 12 MB; hasil upload tetap maksimal 2 MB.');
 const mime=await detectedMime(file);let blob=file,compressed=false;
 if(mime==='application/pdf')need(file.size<=MAX_DOCUMENT_BYTES,'PDF maksimal 2 MB. Simpan PDF dengan ukuran lebih kecil.');
 else {
  const bitmap=await createImageBitmap(file);
  try {
   need(bitmap.width*bitmap.height<=40000000,'Resolusi foto terlalu besar.');
   let result;const long=Math.max(bitmap.width,bitmap.height);
   // Jangan terus menurunkan kualitas sampai tulisan/barcode rusak. Pengguna memeriksa pratinjau.
   for(const limit of [2400,2000,1600]){
    const scale=Math.min(1,limit/long),canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);
    const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
    if(mime==='image/png'){const png=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(png&&png.size<=MAX_DOCUMENT_BYTES){result=png;break;}}
    for(const quality of [.94,.90,.86]){const jpg=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',quality));if(jpg&&jpg.size<=MAX_DOCUMENT_BYTES){result=jpg;break;}}
    if(result)break;
   }
   need(result,'Foto masih terlalu besar. Ambil ulang lebih dekat atau kurangi area kosong.');blob=result;compressed=true;
  } finally {bitmap.close();}
 }
 return {blob,mime:mime==='application/pdf'?mime:blob.type||mime,size:blob.size,sha256:await blobHash(blob),compressed};
}
export function storageConfiguration(config=globalThis.SUPABASE_DOCUMENTS,project=globalThis.FIREBASE_CONFIG?.projectId){
 if(!config?.enabled||!config.url||!config.publishableKey)return {ready:false,message:'Upload belum aktif: proyek Supabase Free dan konfigurasi dokumen belum dipasang.'};
 if(config.emulator===true){const local=['localhost','127.0.0.1'].includes(globalThis.location?.hostname);return local&&/^http:\/\/127\.0\.0\.1:\d+$/.test(config.url)&&project?.startsWith('demo-')&&config.firebaseProjectId===project?{ready:true,message:'Penyimpanan uji lokal — bukan Supabase cloud.'}:{ready:false,message:'Penyimpanan uji hanya boleh digunakan di localhost dengan Firebase demo.'};}
 if(!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(config.url)||config.bucket!=='reseller-documents'||config.firebaseProjectId!==project)return {ready:false,message:'Konfigurasi penyimpanan tidak cocok dengan proyek Firebase ini.'};
 const key=config.publishableKey;
 if(key.startsWith('sb_secret_'))return {ready:false,message:'Konfigurasi ditolak: secret key tidak boleh berada di frontend.'};
 if(!key.startsWith('sb_publishable_')){try{const claims=JSON.parse(atob(key.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));if(claims.role!=='anon')throw Error();}catch{return {ready:false,message:'Gunakan publishable key atau anon key publik yang benar.'};}}
 return {ready:true,message:'Supabase dikonfigurasi. Hak akses dan koneksi diperiksa ketika dokumen dibuka atau diunggah.'};
}
export function documentStorage(c,{config=globalThis.SUPABASE_DOCUMENTS,fetcher=fetch,xhrFactory=()=>new XMLHttpRequest(),configuration=storageConfiguration}={}){
 async function headers(){const status=configuration(config,c.app.options.projectId);need(status.ready,status.message);const u=c.a.currentUser;need(u,'Silakan masuk.');const token=await u.getIdTokenResult();need(token.claims.role==='authenticated','Akses dokumen belum diaktifkan. Admin perlu menjalankan skrip claim lalu muat ulang akses.');return {apikey:config.publishableKey,Authorization:'Bearer '+token.token};}
 function path(name){return name.split('/').map(encodeURIComponent).join('/');}
 async function read(file){const h=await headers(),r=await fetcher(`${config.url}/storage/v1/object/authenticated/${config.bucket}/${path(file.objectName)}`,{headers:h,cache:'no-store',signal:AbortSignal.timeout(20000)});need(r.ok,'Dokumen tidak dapat diakses. Periksa hak akses, sinkronisasi, atau koneksi Supabase.');const b=await r.blob();need(b.size===file.size&&await blobHash(b)===file.sha256,'Isi dokumen tidak cocok. Pemeriksaan dibatalkan.');return new Blob([b],{type:file.mime});}
 async function access(oid){const h=await headers(),r=await fetcher(`${config.url}/rest/v1/kn_doc_orders?order_id=eq.${encodeURIComponent(oid)}&select=order_id,invoice_no,reseller_uid`,{headers:h,signal:AbortSignal.timeout(15000)});need(r.ok,'Akses dokumen belum tersedia. Periksa integrasi Firebase dan SQL Supabase.');const rows=await r.json();need(rows.length===1,'Akses upload pesanan belum diaktifkan. Admin perlu menjalankan sinkronisasi akses dokumen.');return rows[0];}
 async function upload(prepared,{uid,orderId,invoiceNo,kind,onProgress=()=>{}}){
  const grant=await access(orderId);need(grant.reseller_uid===uid&&grant.invoice_no===invoiceNo,'Pemilik atau invoice pada penyimpanan belum cocok. Sinkronkan dahulu.');
  need(prepared.size<=MAX_DOCUMENT_BYTES,'Berkas maksimal 2 MB.');const file={objectName:filePath(uid,orderId,kind,prepared.sha256,prepared.mime),sha256:prepared.sha256,mime:prepared.mime,size:prepared.size};
  return put(prepared,file,onProgress);
 }
 async function uploadSupplier(prepared,{supplierId,documentId,kind,onProgress=()=>{}}){
  need(/^[A-Za-z0-9_-]{1,128}$/.test(supplierId)&&/^[A-Za-z0-9_-]{1,128}$/.test(documentId)&&['receipt','invoice','payment'].includes(kind),'Identitas dokumen Supplier tidak valid.');
  const h=await headers(),r=await fetcher(`${config.url}/rest/v1/kn_doc_suppliers?supplier_id=eq.${encodeURIComponent(supplierId)}&active=eq.true&select=supplier_id`,{headers:h,signal:AbortSignal.timeout(15000)});need(r.ok,'Izin dokumen Supplier belum tersedia.');const grants=await r.json();need(grants.length===1,'Jalankan sinkronisasi akses dokumen untuk Supplier ini.');
  const ext={'application/pdf':'pdf','image/jpeg':'jpg','image/png':'png'}[prepared.mime];need(ext&&prepared.size<=MAX_DOCUMENT_BYTES,'PDF/JPG/PNG maksimal 2 MB.');
  return put(prepared,{objectName:`supplier/${supplierId}/${documentId}/${kind}/${prepared.sha256}.${ext}`,sha256:prepared.sha256,mime:prepared.mime,size:prepared.size},onProgress);
 }
 async function put(prepared,file,onProgress){
  const h=await headers();onProgress(0,'Mengunggah');
  const status=await new Promise((resolve,reject)=>{const xhr=xhrFactory();xhr.open('POST',`${config.url}/storage/v1/object/${config.bucket}/${path(file.objectName)}`);xhr.timeout=45000;for(const [k,v]of Object.entries(h))xhr.setRequestHeader(k,v);xhr.setRequestHeader('Content-Type',file.mime);xhr.setRequestHeader('x-upsert','false');xhr.setRequestHeader('Cache-Control','no-cache');xhr.upload.onprogress=e=>onProgress(e.lengthComputable?Math.min(95,Math.round(e.loaded/e.total*95)):0,'Mengunggah');xhr.onload=()=>resolve(xhr.status);xhr.onerror=()=>reject(Error('Upload terputus. Klik Coba lagi; path yang sama digunakan kembali.'));xhr.ontimeout=()=>reject(Error('Upload melewati batas waktu. Klik Coba lagi; berkas tidak digandakan.'));xhr.onabort=()=>reject(Error('Upload dibatalkan.'));xhr.send(prepared.blob);});
  // 400/409 dapat berarti path dari percobaan sebelumnya sudah tersimpan. Verifikasi isinya dahulu.
  need(status>=200&&status<300||status===400||status===409,'Upload ditolak ('+status+'). Periksa ukuran, tipe, aturan akses, dan kapasitas Supabase.');
  onProgress(97,'Memeriksa hasil tersimpan');await read(file);onProgress(100,'Berkas tersimpan dan terverifikasi');return file;
 }
 async function checkAdminAccess(){const h=await headers(),r=await fetcher(config.url+'/rest/v1/rpc/kn_document_admin',{method:'POST',headers:{...h,'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(15000)});need(r.ok&&await r.json()===true,'Akses admin Supabase belum terverifikasi. Periksa integrasi Firebase, claim, dan sinkronisasi izin.');return true;}
 async function buyerAccess(orderId){const h=await headers(),r=await fetcher(`${config.url}/rest/v1/kn_doc_buyer_orders?order_id=eq.${encodeURIComponent(orderId)}&select=order_id,invoice_no,customer_uid,active`,{headers:h});need(r.ok,'Upload komplain belum tersedia. Admin perlu memasang aturan dokumen pembeli.');const rows=await r.json();need(rows.length===1&&rows[0].active,'Upload komplain pesanan ini belum diaktifkan admin. Pengajuan tanpa lampiran tetap dapat disimpan.');return rows[0];}
 async function buyerRPC(name,data){const h=await headers(),r=await fetcher(config.url+'/rest/v1/rpc/'+name,{method:'POST',headers:{...h,'Content-Type':'application/json'},body:JSON.stringify(data)});const result=await r.json();need(r.ok,result.message||'Akses bukti belum siap. Hubungi admin.');return result;}
 async function uploadBuyer(prepared,{uid,orderId,invoiceNo,requestId,itemIndex,onProgress=()=>{}}){const grant=await buyerAccess(orderId);need(grant.customer_uid===uid&&grant.invoice_no===invoiceNo,'Pemilik/invoice bukti tidak sesuai.');need(prepared.size<=MAX_DOCUMENT_BYTES,'Berkas maksimal 2 MB.');const file=await buyerRPC('kn_reserve_buyer_file',{oid:orderId,idx:itemIndex,cid:requestId,digest:prepared.sha256,media:prepared.mime,bytes:prepared.size});need(file.buyerId===uid&&file.orderId===orderId&&file.requestId===requestId,'Reservasi bukti tidak cocok.');return put(prepared,file,onProgress);}
 async function requestBuyerRevision(requestId,revision,note){return buyerRPC('kn_request_buyer_revision',{cid:requestId,expected_revision:revision,note});}
 return {read,upload,uploadSupplier,access,checkAdminAccess,buyerAccess,uploadBuyer,requestBuyerRevision};
}
