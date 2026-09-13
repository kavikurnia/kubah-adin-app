import {manualAccess} from './manual-access.js?v=admin-supplier-20260909-r3';
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
export async function api(action,data={}){return withDeadline(import('./manual-api.js?v=dokumen-privat-20260913-r8b').then(async m=>m.manualApi(await connect(),action,data)),30000,'manual/unavailable');}
export async function ensureAdminAccess(user){return withDeadline(manualAccess(await connect(),user),15000,'free/unavailable');}
export async function upload(){throw Object.assign(new Error('Unggah berkas belum aktif: penyimpanan privat belum dikonfigurasi. Foto produk dapat memakai URL HTTPS; bukti dikirim manual ke admin.'),{code:'free/unavailable'});}
export async function viewEvidence(raw){if(typeof raw==='object'||String(raw).startsWith('{')){const {openBuyerDocument}=await import('./buyer-document-ui.js?v=dokumen-privat-20260913-r8b');return openBuyerDocument(raw);}throw Object.assign(new Error('Bukti lama tersimpan pada layanan versi lengkap. Versi gratis tidak mengunduh bukti pembayaran.'),{code:'free/unavailable'});}
export async function login(email,password,register=false){const c=await connect();return register?c.auth.createUserWithEmailAndPassword(c.a,email,password):c.auth.signInWithEmailAndPassword(c.a,email,password);}
export async function logout(){const c=await connect();return c.auth.signOut(c.a);}
export function formValues(form){return Object.fromEntries(new FormData(form));}
export function message(text,error=false){const el=document.getElementById('notice');if(el){el.hidden=!String(text||'').trim();el.className=error?'notice error':'notice';el.textContent=text;}}
export async function busy(button,fn){const text=button?.textContent;if(button){button.disabled=true;button.textContent='Memproses…';}try{return await fn();}catch(e){message(e.message,true);return undefined;}finally{if(button){button.disabled=false;button.textContent=text;}}}
