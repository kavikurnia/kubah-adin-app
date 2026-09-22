import {manualAccess} from './manual-access.js?v=launch-20260915-r14';
import {identityGuard} from './buyer-session.js?v=launch-20260915-r14';
const VERSION='10.12.2';
export const money=n=>n===null||n===undefined?'Menunggu konfirmasi':new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(n);
export const date=n=>n?new Date(n?.toDate?n.toDate():n).toLocaleString('id-ID',{timeZone:'Asia/Jakarta',dateStyle:'medium',timeStyle:'short'})+' WIB':'—';
export const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const safeURL=v=>{try{const u=new URL(v);return u.protocol==='https:'?u.href:'';}catch{return '';}};
export const $=s=>document.querySelector(s);
export const label=s=>({belum_dibayar:'Belum dibayar',perlu_verifikasi:'Menunggu verifikasi',lunas:'Lunas',menunggu_konfirmasi_admin:'Menunggu konfirmasi admin',menunggu_pembayaran:'Menunggu pembayaran',diproses:'Diproses',dikirim:'Dikirim',selesai:'Selesai',dibatalkan:'Dibatalkan',menunggu:'Menunggu persetujuan',disetujui:'Disetujui',ditolak:'Ditolak',dinonaktifkan:'Dinonaktifkan',diterima_kurir:'Uang diterima kurir',disetor_kurir:'Uang disetor kurir',setoran_diverifikasi:'Setoran diverifikasi',refund_menunggu:'Menunggu refund',refund_selesai:'Refund selesai',perlu_rekonsiliasi:'Pembayaran perlu ditinjau admin'}[s]||s||'Belum mengajukan');
export function withDeadline(promise,ms=15000,code='functions/deadline-exceeded'){
  let timer;return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Object.assign(new Error('Batas waktu koneksi terlampaui.'),{code})),ms);})]).finally(()=>clearTimeout(timer));
}
let ready;
export function connect(){return ready??=(async()=>{
  const [appSDK,auth,fs]=await withDeadline(Promise.all(['app','auth','firestore'].map(m=>import(`https://www.gstatic.com/firebasejs/${VERSION}/firebase-${m}.js`))),15000,'auth/network-request-failed');
  if(!window.FIREBASE_CONFIG?.apiKey||!window.FIREBASE_CONFIG?.projectId)throw Object.assign(new Error('Konfigurasi Firebase belum lengkap.'),{code:'auth/invalid-api-key'});
  const local=['localhost','127.0.0.1','[::1]'].includes(location.hostname);
  if(!local&&(window.KUBAH_EMULATOR||window.FIREBASE_CONFIG.projectId.startsWith('demo-')))throw Object.assign(new Error('Konfigurasi emulator tidak boleh dipakai pada website live.'),{code:'auth/emulator-config-on-live'});
  const app=appSDK.getApps()[0]||appSDK.initializeApp(window.FIREBASE_CONFIG);
  const a=auth.getAuth(app),db=fs.getFirestore(app);
  if(window.KUBAH_EMULATOR&&!window.__kubahEmulators){
    auth.connectAuthEmulator(a,'http://127.0.0.1:9103',{disableWarnings:true});fs.connectFirestoreEmulator(db,'127.0.0.1',8084);window.__kubahEmulators=true;
  }
  return {app,auth,a,db,fs};
})().catch(error=>{ready=undefined;throw error;});}
export async function api(action,data={}){
 const c=await connect(),guard=['catalog','reviews'].includes(action)?()=>{}:identityGuard(c);
 try{const result=await withDeadline(import('./manual-api.js?v=variant-options-20260923-r20').then(m=>{guard();return m.manualApi(c,action,data);}),30000,'manual/unavailable');guard();return result;}
 catch(error){guard();if(['auth/user-token-expired','auth/invalid-user-token','unauthenticated'].includes(error?.code)&&typeof window!=='undefined')window.dispatchEvent(new Event('kubah-session-expired'));throw error;}
}
export async function ensureAdminAccess(user){return withDeadline(manualAccess(await connect(),user),15000,'free/unavailable');}
export async function upload(){throw Object.assign(new Error('Unggah berkas belum aktif: penyimpanan privat belum dikonfigurasi. Foto produk dapat memakai URL HTTPS; bukti dikirim manual ke admin.'),{code:'free/unavailable'});}
export async function viewEvidence(raw){if(typeof raw==='object'||String(raw).startsWith('{')){const {openBuyerDocument}=await import('./buyer-document-ui.js?v=variant-options-20260923-r20');return openBuyerDocument(raw);}throw Object.assign(new Error('Bukti lama tersimpan pada layanan versi lengkap. Versi gratis tidak mengunduh bukti pembayaran.'),{code:'free/unavailable'});}
export async function login(email,password,register=false){const c=await connect();return register?c.auth.createUserWithEmailAndPassword(c.a,email,password):c.auth.signInWithEmailAndPassword(c.a,email,password);}
export async function logout(){const c=await connect();return c.auth.signOut(c.a);}
export function formValues(form){return Object.fromEntries(new FormData(form));}
export function message(text,error=false){const el=document.getElementById('notice');if(el){el.hidden=!String(text||'').trim();el.className=error?'notice error':'notice';el.textContent=text;}}
export function actionError(error){const code=String(error?.code||'').split('/').pop();if(code==='permission-denied')return 'Akses ditolak. Periksa hak akses akun Anda, lalu coba lagi.';if(['unauthenticated','user-token-expired','invalid-user-token'].includes(code))return 'Sesi telah berakhir. Masuk kembali dengan akun yang berwenang, lalu coba lagi.';if(['unavailable','deadline-exceeded','network-request-failed'].includes(code))return 'Koneksi bermasalah. Hasil penyimpanan belum dapat dipastikan; periksa data tersimpan sebelum mencoba lagi.';return error?.message||'Proses gagal. Periksa isian dan coba lagi.';}
export async function busy(button,fn){const text=button?.textContent;if(button){button.disabled=true;button.textContent='Memproses…';}try{return await fn();}catch(e){message(actionError(e),true);return undefined;}finally{if(button){button.disabled=false;button.textContent=text;}}}
