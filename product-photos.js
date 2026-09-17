import {check,id} from './manual-domain.js?v=products-20260917-r16';
import {blobHash,prepareDocument,storageConfiguration} from './document-storage.js?v=products-20260917-r16';
export async function prepareProductPhoto(file){check(['image/jpeg','image/png'].includes(file?.type),'Pilih foto JPG atau PNG.');const p=await prepareDocument(file);check(p.mime.startsWith('image/'),'Berkas harus berupa foto.');return p;}
export function productPhotos(c,{config=globalThis.SUPABASE_DOCUMENTS,fetcher=fetch,xhrFactory=()=>new XMLHttpRequest(),configuration=storageConfiguration}={}){
 return {async upload(prepared,{productId,variantId,onProgress=()=>{}}){
  const cfg=configuration(config,c.app?.options?.projectId);check(cfg.ready,cfg.message);
  const user=c.a.currentUser;check(user,'Masuk sebagai admin sebelum upload.');const uid=user.uid,token=await user.getIdToken();
  check(c.a.currentUser?.uid===uid,'Sesi berubah. Masuk kembali.');
  const headers={apikey:config.publishableKey,Authorization:'Bearer '+token};
  const auth=await fetcher(config.url+'/rest/v1/rpc/kn_document_admin',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(15000)});
  check(auth.ok&&await auth.json()===true,'Akses upload foto admin belum tersedia. Periksa sinkronisasi izin Supabase.');
  check(prepared.size>0&&prepared.size<=2097152&&['image/jpeg','image/png'].includes(prepared.mime)&&/^[a-f0-9]{64}$/.test(prepared.sha256),'Foto tidak valid atau melebihi 2 MB.');
  const name=`products/${id(productId)}/${id(variantId)}/${prepared.sha256}.${prepared.mime==='image/png'?'png':'jpg'}`;
  const path=name.split('/').map(encodeURIComponent).join('/'),url=config.url+'/storage/v1/object/public/product-photos/'+path;
  const status=await new Promise((resolve,reject)=>{const xhr=xhrFactory();xhr.open('POST',config.url+'/storage/v1/object/product-photos/'+path);for(const [k,v] of Object.entries(headers))xhr.setRequestHeader(k,v);xhr.setRequestHeader('Content-Type',prepared.mime);xhr.setRequestHeader('x-upsert','false');xhr.timeout=60000;xhr.upload.onprogress=e=>{if(e.lengthComputable)onProgress(Math.round(e.loaded/e.total*90));};xhr.onload=()=>resolve(xhr.status);xhr.onerror=()=>reject(Error('Upload foto gagal karena koneksi. Pilihan foto tetap ada; coba Simpan Produk lagi.'));xhr.ontimeout=()=>reject(Error('Upload foto melewati batas waktu. Coba lagi dengan foto yang sama.'));xhr.send(prepared.blob);});
  check(status>=200&&status<300||status===400||status===409,'Upload foto ditolak. Periksa bucket product-photos, izin admin dan kapasitas Supabase Free.');
  const response=await fetcher(url,{cache:'no-store',signal:AbortSignal.timeout(20000)});check(response.ok,'Foto belum tersimpan atau bucket product-photos belum dikonfigurasi. Tidak ada data produk yang disimpan.');const bytes=await response.blob();check(bytes.size===prepared.size&&await blobHash(bytes)===prepared.sha256,'Foto tersimpan belum cocok. Coba upload kembali.');
  check(c.a.currentUser?.uid===uid,'Sesi berubah saat upload. Masuk kembali sebelum menyimpan produk.');onProgress(100);return url;
 }};
}
