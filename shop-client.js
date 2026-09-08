const VERSION='10.12.2';
export const money=n=>n===null||n===undefined?'Menunggu konfirmasi':new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(n);
export const date=n=>n?new Date(n?.toDate?n.toDate():n).toLocaleString('id-ID',{timeZone:'Asia/Jakarta',dateStyle:'medium',timeStyle:'short'})+' WIB':'—';
export const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const safeURL=v=>{try{const u=new URL(v);return u.protocol==='https:'?u.href:'';}catch{return '';}};
export const $=s=>document.querySelector(s);
export const label=s=>({belum_dibayar:'Belum dibayar',perlu_verifikasi:'Menunggu verifikasi',lunas:'Lunas',menunggu_pembayaran:'Menunggu pembayaran',diproses:'Diproses',dikirim:'Dikirim',selesai:'Selesai',dibatalkan:'Dibatalkan',menunggu:'Menunggu persetujuan',disetujui:'Disetujui',ditolak:'Ditolak',dinonaktifkan:'Dinonaktifkan',diterima_kurir:'Uang diterima kurir',disetor_kurir:'Uang disetor kurir',setoran_diverifikasi:'Setoran diverifikasi',refund_menunggu:'Menunggu refund',refund_selesai:'Refund selesai',perlu_rekonsiliasi:'Pembayaran perlu ditinjau admin'}[s]||s||'Belum mengajukan');
let ready;
export function connect(){return ready??=(async()=>{
  const [appSDK,auth,fs,fn,storage]=await Promise.all(['app','auth','firestore','functions','storage'].map(m=>import(`https://www.gstatic.com/firebasejs/${VERSION}/firebase-${m}.js`)));
  const app=appSDK.getApps()[0]||appSDK.initializeApp(window.FIREBASE_CONFIG);
  const a=auth.getAuth(app),db=fs.getFirestore(app),functions=fn.getFunctions(app,'asia-southeast2'),bucket=storage.getStorage(app);
  if(window.KUBAH_EMULATOR&&!window.__kubahEmulators){
    auth.connectAuthEmulator(a,'http://127.0.0.1:9099',{disableWarnings:true});fs.connectFirestoreEmulator(db,'127.0.0.1',8080);fn.connectFunctionsEmulator(functions,'127.0.0.1',5001);storage.connectStorageEmulator(bucket,'127.0.0.1',9199);window.__kubahEmulators=true;
  }
  return {app,auth,a,db,fs,functions,fn,storage,bucket};
})();}
export async function api(action,data={}){const c=await connect();try{return (await c.fn.httpsCallable(c.functions,'shopApi')({action,...data})).data;}catch(e){throw new Error(e.message||'Koneksi gagal. Coba kembali.');}}
export async function upload(orderId,file,onProgress=()=>{}){
  const c=await connect();if(!c.a.currentUser)throw Error('Silakan masuk.');
  if(!file||!['image/jpeg','image/png','image/webp','video/mp4'].includes(file.type)||file.size<=0||file.size>20*1024*1024)throw Error('Gunakan JPG, PNG, WEBP, atau MP4 maksimal 20 MB.');
  const path=`evidence/${orderId}/${c.a.currentUser.uid}/${crypto.randomUUID()}`;
  const task=c.storage.uploadBytesResumable(c.storage.ref(c.bucket,path),file,{contentType:file.type});
  await new Promise((resolve,reject)=>task.on('state_changed',s=>onProgress(Math.round(s.bytesTransferred/s.totalBytes*100)),reject,resolve));return path;
}
export async function viewEvidence(path){const c=await connect();const blob=await c.storage.getBlob(c.storage.ref(c.bucket,path),20*1024*1024);const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.target='_blank';a.rel='noopener';a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);}
export async function login(email,password,register=false){const c=await connect();return register?c.auth.createUserWithEmailAndPassword(c.a,email,password):c.auth.signInWithEmailAndPassword(c.a,email,password);}
export async function logout(){const c=await connect();return c.auth.signOut(c.a);}
export function formValues(form){return Object.fromEntries(new FormData(form));}
export function message(text,error=false){const el=document.getElementById('notice');if(el){el.hidden=false;el.className=error?'notice error':'notice';el.textContent=text;}}
export async function busy(button,fn){const text=button?.textContent;if(button){button.disabled=true;button.textContent='Memproses…';}try{return await fn();}catch(e){message(e.message,true);return undefined;}finally{if(button){button.disabled=false;button.textContent=text;}}}
