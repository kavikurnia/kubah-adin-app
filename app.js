// BEGIN BUNDLED ADMIN CLIENT
const {connect:connectShop,api:shopApi,ensureAdminAccess}=(()=>{
const VERSION='10.12.2';
const money=n=>n===null||n===undefined?'Menunggu konfirmasi':new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(n);
const date=n=>n?new Date(n?.toDate?n.toDate():n).toLocaleString('id-ID',{timeZone:'Asia/Jakarta',dateStyle:'medium',timeStyle:'short'})+' WIB':'—';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeURL=v=>{try{const u=new URL(v);return u.protocol==='https:'?u.href:'';}catch{return '';}};
const $=s=>document.querySelector(s);
const label=s=>({belum_dibayar:'Belum dibayar',perlu_verifikasi:'Menunggu verifikasi',lunas:'Lunas',menunggu_pembayaran:'Menunggu pembayaran',diproses:'Diproses',dikirim:'Dikirim',selesai:'Selesai',dibatalkan:'Dibatalkan',menunggu:'Menunggu persetujuan',disetujui:'Disetujui',ditolak:'Ditolak',dinonaktifkan:'Dinonaktifkan',diterima_kurir:'Uang diterima kurir',disetor_kurir:'Uang disetor kurir',setoran_diverifikasi:'Setoran diverifikasi',refund_menunggu:'Menunggu refund',refund_selesai:'Refund selesai',perlu_rekonsiliasi:'Pembayaran perlu ditinjau admin'}[s]||s||'Belum mengajukan');
let ready;
function connect(){return ready??=(async()=>{
  const [appSDK,auth,fs,fn,storage]=await Promise.all(['app','auth','firestore','functions','storage'].map(m=>import(`https://www.gstatic.com/firebasejs/${VERSION}/firebase-${m}.js`)));
  const app=appSDK.getApps()[0]||appSDK.initializeApp(window.FIREBASE_CONFIG);
  const a=auth.getAuth(app),db=fs.getFirestore(app),functions=fn.getFunctions(app,'asia-southeast2'),bucket=storage.getStorage(app);
  if(window.KUBAH_EMULATOR&&!window.__kubahEmulators){
    auth.connectAuthEmulator(a,'http://127.0.0.1:9099',{disableWarnings:true});fs.connectFirestoreEmulator(db,'127.0.0.1',8080);fn.connectFunctionsEmulator(functions,'127.0.0.1',5001);storage.connectStorageEmulator(bucket,'127.0.0.1',9199);window.__kubahEmulators=true;
  }
  return {app,auth,a,db,fs,functions,fn,storage,bucket};
})();}
async function api(action,data={}){const c=await connect();try{return (await c.fn.httpsCallable(c.functions,'shopApi')({action,...data})).data;}catch(e){throw new Error(e.message||'Koneksi gagal. Coba kembali.');}}
async function ensureAdminAccess(user){
  await api('adminAccess');
  const token=await user.getIdTokenResult(true);
  const c=await connect();
  if(c.a.currentUser?.uid!==user.uid)throw Error('Sesi login berubah. Silakan masuk kembali.');
  return token;
}
async function upload(orderId,file,onProgress=()=>{}){
  const c=await connect();if(!c.a.currentUser)throw Error('Silakan masuk.');
  if(!file||!['image/jpeg','image/png','image/webp','video/mp4'].includes(file.type)||file.size<=0||file.size>20*1024*1024)throw Error('Gunakan JPG, PNG, WEBP, atau MP4 maksimal 20 MB.');
  const path=`evidence/${orderId}/${c.a.currentUser.uid}/${crypto.randomUUID()}`;
  const task=c.storage.uploadBytesResumable(c.storage.ref(c.bucket,path),file,{contentType:file.type});
  await new Promise((resolve,reject)=>task.on('state_changed',s=>onProgress(Math.round(s.bytesTransferred/s.totalBytes*100)),reject,resolve));return path;
}
async function viewEvidence(path){const c=await connect();const blob=await c.storage.getBlob(c.storage.ref(c.bucket,path),20*1024*1024);const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.target='_blank';a.rel='noopener';a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);}
async function login(email,password,register=false){const c=await connect();return register?c.auth.createUserWithEmailAndPassword(c.a,email,password):c.auth.signInWithEmailAndPassword(c.a,email,password);}
async function logout(){const c=await connect();return c.auth.signOut(c.a);}
function formValues(form){return Object.fromEntries(new FormData(form));}
function message(text,error=false){const el=document.getElementById('notice');if(el){el.hidden=false;el.className=error?'notice error':'notice';el.textContent=text;}}
async function busy(button,fn){const text=button?.textContent;if(button){button.disabled=true;button.textContent='Memproses…';}try{return await fn();}catch(e){message(e.message,true);return undefined;}finally{if(button){button.disabled=false;button.textContent=text;}}}

return {connect,api,ensureAdminAccess};
})();
// END BUNDLED ADMIN CLIENT
// ============================================================
// Admin Dashboard — Prototipe Interaktif
// ============================================================
// Struktur:
//   1. Data layer   — abstraksi Firebase Firestore ATAU mode demo
//                      (localStorage) di balik fungsi yang sama,
//                      supaya kode rendering di bawah tidak perlu
//                      tahu sedang jalan di mode mana.
//   2. State        — cache lokal dari orders & products.
//   3. Render       — fungsi-fungsi yang menggambar ulang UI dari state.
//   4. Interaksi    — event listener, modal, form.
// ============================================================

const STATUS_META = {
  menunggu_pembayaran: { label: "Menunggu Pembayaran" },
  perlu_verifikasi: { label: "Perlu Verifikasi" },
  diproses: { label: "Diproses" },
  dikirim: { label: "Dikirim" },
  selesai: { label: "Selesai" },
  dibatalkan: { label: "Dibatalkan" },
};
const STATUS_ORDER = ["menunggu_pembayaran", "perlu_verifikasi", "diproses", "dikirim", "selesai", "dibatalkan"];

// Item Penilaian Umum (berlaku untuk semua posisi).
const GENERAL_REVIEW_ITEMS = ["Kedisiplinan", "Tanggung Jawab", "Kejujuran", "Kerja Sama Tim", "Komunikasi", "Ketelitian", "Kecepatan Kerja", "Inisiatif", "Sikap", "Kemampuan Belajar", "Kepatuhan SOP"];

// KPI khusus per posisi (dicocokkan dari nama posisi, case-insensitive).
// Untuk menambah KPI posisi baru di masa depan, cukup tambah entri di sini.
const KPI_BY_POSITION_NAME = {
  "HOST LIVE": ["Konsistensi Suara", "Kejelasan Bicara", "Product Knowledge", "Kemampuan Menjelaskan Produk", "Interaksi dengan Viewer", "Kemampuan Closing", "Keaktifan Menawarkan Produk", "Penguasaan Promo", "Kerapihan Saat Live", "Tanggung Jawab", "Konsistensi Performa"],
  "PACKING": ["Kecepatan Packing", "Ketelitian SKU", "Ketelitian Varian", "Ketelitian Jumlah Barang", "Minim Kesalahan Packing", "Kerapihan Packing", "Produktivitas", "Tanggung Jawab", "Kepatuhan SOP"],
  "GUDANG": ["Akurasi Stok", "Kecepatan Picking", "Ketelitian Picking", "Penataan Barang", "Stock Opname", "Minim Selisih Stok", "Kebersihan Area", "Produktivitas", "Tanggung Jawab"],
  "ADMIN MARKETPLACE": ["Kecepatan Respons", "Akurasi Input Produk", "Akurasi Pesanan", "Ketelitian Data", "Penanganan Komplain", "Akurasi Stok", "Produktivitas", "Tanggung Jawab", "Kepatuhan SOP"],
  "CUSTOMER SERVICE": ["Kecepatan Respons", "Kesopanan", "Kualitas Komunikasi", "Product Knowledge", "Kemampuan Menyelesaikan Masalah", "Penanganan Komplain", "Ketelitian", "Tanggung Jawab"],
};

function getKpiItemsForPosition(positionName) {
  if (!positionName) return [];
  return KPI_BY_POSITION_NAME[positionName.trim().toUpperCase()] || [];
}

function categoryFromScore(score) {
  if (score >= 4.51) return "Sangat Baik";
  if (score >= 3.51) return "Baik";
  if (score >= 2.51) return "Cukup";
  if (score >= 1.51) return "Kurang";
  return "Sangat Kurang";
}

function categoryBadgeClass(category) {
  switch (category) {
    case "Sangat Baik": return "tag--selesai";
    case "Baik": return "tag--diproses";
    case "Cukup": return "tag--perlu_verifikasi";
    case "Kurang": return "tag--menunggu_pembayaran";
    default: return "tag--dibatalkan"; // Sangat Kurang
  }
}

// Jenis potongan kesalahan kerja (TIDAK ada kasbon/absensi/keterlambatan, sesuai batasan modul ini).
const DEDUCTION_TYPES = ["Salah Packing", "Salah Kirim Barang", "Salah SKU", "Salah Varian", "Kesalahan Input Pesanan", "Kesalahan Input Stok", "Barang Rusak karena Kelalaian", "Kesalahan Operasional", "Lainnya"];

/** "2026-09" -> "September 2026" */
function formatPeriodLabel(periodValue) {
  if (!periodValue) return "-";
  const [y, m] = periodValue.split("-").map(Number);
  if (!y || !m) return periodValue;
  return new Date(y, m - 1, 1).toLocaleDateString("id-ID", { month: "long", year: "numeric" });
}

function normalizePayrollStatus(status) {
  return ({draft: "Draft", "menunggu pembayaran": "Menunggu Pembayaran", dibayar: "Dibayar"})[String(status || "").trim().toLowerCase()] || "Draft";
}

function payrollStatusBadgeClass(status) {
  switch (status) {
    case "Dibayar": return "tag--selesai";
    case "Menunggu Pembayaran": return "tag--perlu_verifikasi";
    default: return "tag--menunggu_pembayaran"; // Draft
  }
}

// Profil toko default — dipakai sebelum menu Pengaturan pernah diisi.
const DEFAULT_SETTINGS = {
  storeName: "Kubah Nabawi",
  tagline: "",
  address: "",
  phone: "",
  logoUrl: "",
  storeUrl: "",
};

const state = {
  view: "dashboard",
  orders: [],
  products: [],
  customers: [],
  transactions: [],
  settings: { ...DEFAULT_SETTINGS },
  orderTab: "semua",
  orderChannel: "semua",
  recentTab: "semua",
  deliverySlots: [], resellers: [], claims: [], ecommerce: null, adminIdentity: null,
  ready: {orders:false,transactions:false,slots:false,resellers:false,claims:false,ecommerce:false},
  orderSearch: "",
  productSearch: "",
  customerSearch: "",
  financeTab: "semua",
  dashPeriod: "today", // "today" | "7d" | "30d" | "custom"
  dashCustomDate: "", // "YYYY-MM-DD", dipakai saat dashPeriod === "custom"
  variantRows: [],
  previewSelectedIndex: null,
  previewPriceChannel: "offline",
  productImages: [],
  expandedProductIds: new Set(),
  orderItemRows: [],
  employees: [],
  positions: [],
  employeeSearch: "",
  employeeFilterPosition: "",
  employeeFilterWorkStatus: "",
  employeeFilterStatus: "",
  editingEmployeeId: null,
  employeePhoto: null, // { url, uploading, progress }
  karyawanTab: "dashboard", // "dashboard" | "data" | "penilaian"
  performanceReviews: [],
  reviewSearch: "",
  reviewFilterPosition: "",
  reviewFilterCategory: "",
  reviewFilterRecommendation: "",
  editingReviewId: null,
  reviewGeneralScores: {},
  reviewKpiScores: {},
  payrolls: [],
  payrollFilterPeriod: "",
  payrollFilterStatus: "",
  editingPayrollId: null,
  payrollDeductionRows: [],
  massPayrollRows: [],
  viewingSlipPayroll: null,
  viewingSlipEmployee: null,
  openOrderId: null,
  editingProductId: null,
  editingCustomerId: null,
  mode: "demo", // "demo" | "firebase"
};

const els = {};

// ============================================================
// 1. DATA LAYER
// ============================================================

const LOCAL_KEY_ORDERS = "atelier_demo_orders";
const LOCAL_KEY_PRODUCTS = "atelier_demo_products";
const LOCAL_KEY_CUSTOMERS = "atelier_demo_customers";
const LOCAL_KEY_TRANSACTIONS = "atelier_demo_transactions";
const LOCAL_KEY_SETTINGS = "atelier_demo_settings";
const LOCAL_KEY_EMPLOYEES = "atelier_demo_employees";
const LOCAL_KEY_POSITIONS = "atelier_demo_positions";
const LOCAL_KEY_REVIEWS = "atelier_demo_performance_reviews";
const LOCAL_KEY_PAYROLLS = "atelier_demo_payrolls";

let fb = null; // { db, addDoc, updateDoc, collection, doc, onSnapshot, serverTimestamp, query, orderBy, deleteDoc }
let authInstance = null;
let authFns = null; // { signInWithEmailAndPassword, signOut, onAuthStateChanged, ... }
let firestoreUnsubscribers = [];
let fbApp = null;
let storageInstance = null;
let storageFns = null; // { ref, uploadBytesResumable, getDownloadURL, deleteObject }

const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

/** Validasi file sebelum diupload: tipe & ukuran. Melempar Error dengan pesan yang bisa ditampilkan ke user. */
function validateImageFile(file) {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    throw new Error("Format file tidak didukung. Gunakan JPG, JPEG, PNG, atau WEBP.");
  }
  if (file.size > MAX_IMAGE_SIZE_BYTES) {
    throw new Error("Ukuran file maksimal 5MB.");
  }
}

/**
 * Upload satu file gambar ke Firebase Storage, kembalikan URL permanen hasil upload.
 * onProgress(percent) dipanggil berkala selama upload berlangsung.
 */
async function uploadImageFile(file, pathPrefix, onProgress) {
  validateImageFile(file);
  if (state.mode !== "firebase") {
    throw new Error("Upload foto hanya tersedia saat aplikasi terhubung ke Firebase (tidak tersedia di mode demo).");
  }
  if (!storageFns) {
    storageFns = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js");
  }
  if (!storageInstance) {
    storageInstance = storageFns.getStorage(fbApp);
  }
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${pathPrefix}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${safeName}`;
  const storageRef = storageFns.ref(storageInstance, path);
  const task = storageFns.uploadBytesResumable(storageRef, file);

  return new Promise((resolve, reject) => {
    task.on(
      "state_changed",
      (snap) => {
        if (onProgress) onProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100));
      },
      (err) => reject(err),
      async () => {
        try {
          const url = await storageFns.getDownloadURL(task.snapshot.ref);
          resolve(url);
        } catch (err) {
          reject(err);
        }
      }
    );
  });
}

async function initDataLayer() {
  state.mode = "firebase";
  try {
    const c = await connectShop();
    fbApp = c.app; fb = { db: c.db, ...c.fs }; authInstance = c.a; authFns = c.auth;
    storageInstance = c.bucket; storageFns = c.storage;
    authFns.onAuthStateChanged(authInstance, async (user) => {
      state.adminIdentity=null;state.deliverySlots=[];state.resellers=[];state.claims=[];state.ecommerce=null;
      Object.keys(state.ready).forEach(k=>state.ready[k]=false);
      document.getElementById('operational-frame').src='about:blank';toggleDrawer(false);
      firestoreUnsubscribers.forEach(unsub => unsub()); firestoreUnsubscribers = [];
      showLoginScreen();
      for (const key of ['orders','products','customers','transactions','employees','positions','performanceReviews','payrolls']) state[key] = [];
      if (!user) { renderAll(); return; }
      try {
        const token = await ensureAdminAccess(user);
        if (token.claims.role !== 'admin') { showLoginError('Akun ini bukan admin. Masuk melalui toko.html untuk belanja.'); return; }
        setConnectionBadge('connected', window.KUBAH_EMULATOR ? 'Emulator lokal — bukan produksi' : 'Terhubung ke Firebase');
        state.adminIdentity={name:user.displayName||user.email||'Admin',email:user.email||'',superAdmin:token.claims.superAdmin===true};
        showLoginError(''); enterApp(); renderAdminChrome(); subscribeFirestore();
      } catch (err) { showLoginError(err.message||'Pemeriksaan akses gagal. Muat ulang untuk mencoba lagi.'); }
    });
  } catch (err) {
    state.mode = 'offline'; showLoginScreen(); setConnectionBadge('error', 'Gagal terhubung');
    showLoginError('Firebase tidak dapat terhubung. Tidak ada mode demo otomatis. Periksa koneksi lalu muat ulang.');
  }
}


/** Tampilkan dashboard, sembunyikan layar login. */
function enterApp() {
  els.authScreen.hidden = true;
  els.appRoot.hidden = false;
}

/** Tampilkan layar login, sembunyikan dashboard. */
function showLoginScreen() {
  els.appRoot.hidden = true;
  els.authScreen.hidden = false;
  els.authChecking.hidden = true;
  els.loginForm.hidden = false;
}

function showLoginError(message) {
  if (!message) {
    els.loginError.hidden = true;
    els.loginError.textContent = "";
    return;
  }
  els.loginError.textContent = message;
  els.loginError.hidden = false;
}

/** Terjemahkan kode error Firebase Auth ke pesan yang mudah dipahami. */
function mapAuthErrorMessage(code) {
  switch (code) {
    case "auth/invalid-email":
      return "Format email tidak valid.";
    case "auth/user-not-found":
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return "Email atau password salah.";
    case "auth/user-disabled":
      return "Akun ini telah dinonaktifkan.";
    case "auth/too-many-requests":
      return "Terlalu banyak percobaan gagal. Coba lagi beberapa saat lagi.";
    case "auth/network-request-failed":
      return "Gagal terhubung ke server. Periksa koneksi internet kamu.";
    default:
      return "Gagal masuk. Periksa kembali email dan password kamu.";
  }
}

function setConnectionBadge(kind, label) {
  els.connBadge.className = "conn-badge" + (kind === "connected" ? " is-connected" : kind === "demo" ? " is-demo" : "");
  els.connLabel.textContent = label;
}

function subscribeFirestore() {
  const { collection, doc, setDoc, query, orderBy } = fb;
  const onSnapshot = (ref, next) => fb.onSnapshot(ref, next, err => {
    setConnectionBadge('error', 'Sinkronisasi gagal');
    showToast('Data gagal disinkronkan. Periksa koneksi dan izin akses.');
  });

  for(const [collectionName,stateKey,readyKey] of [['resellers','resellers','resellers'],['claims','claims','claims'],['deliverySlots','deliverySlots','slots']]){
    firestoreUnsubscribers.push(fb.onSnapshot(collection(fb.db,collectionName),snap=>{state[stateKey]=snap.docs.map(d=>({...d.data(),id:d.id}));state.ready[readyKey]=true;renderAll();},()=>{state.ready[readyKey]=false;setConnectionBadge('error','Dukungan modul belum tersedia');renderAll();}));
  }
  firestoreUnsubscribers.push(fb.onSnapshot(doc(fb.db,'settings','ecommerce'),snap=>{state.ecommerce=snap.exists()?snap.data():null;state.ready.ecommerce=true;renderAll();},()=>{state.ready.ecommerce=false;renderAll();}));

  firestoreUnsubscribers.push(onSnapshot(query(collection(fb.db, "orders"), orderBy("createdAt", "desc")), (snap) => {
    state.ready.orders=true;
    state.orders = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    // Pesanan kosong adalah kondisi sah; jangan membuat data contoh atau jurnal dari browser.
    renderAll();
  }));

  firestoreUnsubscribers.push(onSnapshot(query(collection(fb.db, "products"), orderBy("createdAt", "desc")), (snap) => {
    state.products = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderAll();
  }));

  firestoreUnsubscribers.push(onSnapshot(query(collection(fb.db, "customers"), orderBy("name")), (snap) => {
    state.customers = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderAll();
  }));

  firestoreUnsubscribers.push(onSnapshot(query(collection(fb.db, "transactions"), orderBy("date", "desc")), (snap) => {
    state.ready.transactions=true;
    state.transactions = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderAll();
  }));

  firestoreUnsubscribers.push(onSnapshot(doc(fb.db, "settings", "store"), (snap) => {
    if (snap.exists()) {
      state.settings = snap.data();
    } else {
      state.settings = { ...DEFAULT_SETTINGS };
    }
    if (state.view === "pengaturan") applySettingsToForm();
    renderAll();
  }));

  firestoreUnsubscribers.push(onSnapshot(query(collection(fb.db, "positions"), orderBy("name")), (snap) => {
    state.positions = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderAll();
  }));

  firestoreUnsubscribers.push(onSnapshot(query(collection(fb.db, "employees"), orderBy("name")), (snap) => {
    state.employees = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderAll();
  }));

  firestoreUnsubscribers.push(onSnapshot(query(collection(fb.db, "performanceReviews"), orderBy("createdAt", "desc")), (snap) => {
    state.performanceReviews = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderAll();
  }));

  firestoreUnsubscribers.push(onSnapshot(query(collection(fb.db, "payrolls"), orderBy("createdAt", "desc")), (snap) => {
    state.payrolls = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    syncFinanceFromPayrolls();
    renderAll();
  }));
}

async function seedFirestore() { throw new Error('Pengisian data contoh produksi dinonaktifkan.'); }


async function loadDemoData() {
  let orders = JSON.parse(localStorage.getItem(LOCAL_KEY_ORDERS) || "null");
  let products = JSON.parse(localStorage.getItem(LOCAL_KEY_PRODUCTS) || "null");
  const customers = JSON.parse(localStorage.getItem(LOCAL_KEY_CUSTOMERS) || "null");
  const transactions = JSON.parse(localStorage.getItem(LOCAL_KEY_TRANSACTIONS) || "null");
  const settings = JSON.parse(localStorage.getItem(LOCAL_KEY_SETTINGS) || "null");
  const employees = JSON.parse(localStorage.getItem(LOCAL_KEY_EMPLOYEES) || "null");
  const positions = JSON.parse(localStorage.getItem(LOCAL_KEY_POSITIONS) || "null");
  const performanceReviews = JSON.parse(localStorage.getItem(LOCAL_KEY_REVIEWS) || "null");
  const payrolls = JSON.parse(localStorage.getItem(LOCAL_KEY_PAYROLLS) || "null");

  if (!orders || !products) {
    const seed = buildSeedData();
    orders = seed.orders.map((o, i) => ({ ...o, id: "demo-order-" + i, createdAt: o.createdAt }));
    products = seed.products.map((p, i) => ({ ...p, id: "demo-product-" + i, createdAt: p.createdAt }));
  }

  state.orders = orders;
  state.products = products;
  state.customers = customers || [];
  state.transactions = transactions || [];
  state.settings = settings || { ...DEFAULT_SETTINGS };
  state.employees = employees || [];
  state.positions = positions || [];
  state.performanceReviews = performanceReviews || [];
  state.payrolls = payrolls || [];

  // Bangun data pelanggan & pemasukan dari pesanan yang sudah ada (juga jalan tiap kali pesanan berubah).
  await syncCustomersFromOrders();
  await syncIncomeFromOrders();
  await syncFinanceFromPayrolls();
  saveDemoData();
}

function saveDemoData() {
  localStorage.setItem(LOCAL_KEY_ORDERS, JSON.stringify(state.orders));
  localStorage.setItem(LOCAL_KEY_PRODUCTS, JSON.stringify(state.products));
  localStorage.setItem(LOCAL_KEY_CUSTOMERS, JSON.stringify(state.customers));
  localStorage.setItem(LOCAL_KEY_TRANSACTIONS, JSON.stringify(state.transactions));
  localStorage.setItem(LOCAL_KEY_SETTINGS, JSON.stringify(state.settings));
  localStorage.setItem(LOCAL_KEY_EMPLOYEES, JSON.stringify(state.employees));
  localStorage.setItem(LOCAL_KEY_POSITIONS, JSON.stringify(state.positions));
  localStorage.setItem(LOCAL_KEY_REVIEWS, JSON.stringify(state.performanceReviews));
  localStorage.setItem(LOCAL_KEY_PAYROLLS, JSON.stringify(state.payrolls));
}

/** Update satu order (status + field lain) — dipakai untuk semua aksi alur kerja. */
async function updateOrder(orderId, patch, historyLabel) {
  const order = state.orders.find(o => o.id === orderId);
  if (order?.schemaVersion === 2) {
    window.location.href = 'admin-website.html#orders/' + encodeURIComponent(orderId); return;
  }
  await shopApi('orderAction', { orderId, operation: 'legacy', ...patch });
}


/** Buat pesanan baru secara manual (dipakai form "Buat pesanan"). */
async function addOrder(order) {
  state.manualOrderKey ||= crypto.randomUUID();
  const result = await shopApi('legacyManualOrder', { ...order, key: state.manualOrderKey });
  order.invoiceNo = result.invoiceNo; state.manualOrderKey = null;
}


/** Hapus pesanan — dipakai untuk membersihkan data contoh/dummy setelah ada pesanan asli. */
async function deleteOrder(orderId) {
  throw new Error('Pesanan tidak dihapus permanen. Batalkan dari detail agar stok dan riwayat tetap konsisten.');
}


/** No. invoice otomatis, lanjutan dari nomor terbesar yang sudah ada. */
function generateInvoiceNo() {
  const nums = state.orders.map((o) => {
    const m = /INV-(\d+)/.exec(o.invoiceNo || "");
    return m ? Number(m[1]) : 0;
  });
  const next = (nums.length ? Math.max(...nums) : 1000) + 1;
  return `INV-${next}`;
}

/** Tambah produk baru. */
async function addProduct(product) { return shopApi('saveProduct', {product}); }


async function deleteProduct(productId) {
  const product = state.products.find(p => p.id === productId);
  await shopApi('saveProduct', {productId, expectedRevision: product.revision || 0, product: {...product, status:'nonaktif'}});
}


/** Update produk yang sudah ada (dipakai oleh form Edit). */
async function updateProduct(productId, patch) {
  return shopApi('saveProduct', {productId, expectedRevision: state.editingProductRevision || 0, product: patch});
}


/** Tambah pelanggan baru (manual ATAU otomatis dari sinkronisasi pesanan). */
/**
 * Tambah pelanggan BARU, atau perbarui data yang sudah ada jika no. HP/WhatsApp
 * sudah terdaftar. No. HP jadi kunci unik agar tidak ada data ganda.
 * Di mode Firebase, pengecekan dilakukan lewat query langsung ke Firestore
 * (bukan hanya cache lokal) supaya aman dari race condition saat data baru dimuat.
 */
async function upsertCustomer(customerData) {
  const phone = (customerData.phone || "").trim();

  if (state.mode === "firebase") {
    const { collection, query, where, limit, getDocs, addDoc, updateDoc, doc, serverTimestamp } = fb;
    if (phone) {
      const existingSnap = await getDocs(query(collection(fb.db, "customers"), where("phone", "==", phone), limit(1)));
      if (!existingSnap.empty) {
        const existingId = existingSnap.docs[0].id;
        await updateDoc(doc(fb.db, "customers", existingId), customerData);
        return { id: existingId, updated: true };
      }
    }
    const ref = await addDoc(collection(fb.db, "customers"), { ...customerData, createdAt: serverTimestamp() });
    return { id: ref.id, updated: false };
  } else {
    const existing = phone ? state.customers.find((c) => (c.phone || "").trim() === phone) : null;
    if (existing) {
      Object.assign(existing, customerData);
      saveDemoData();
      renderAll();
      return { id: existing.id, updated: true };
    }
    const newCustomer = { ...customerData, id: "demo-customer-" + Date.now() + Math.random().toString(36).slice(2, 6), createdAt: new Date().toISOString() };
    state.customers.push(newCustomer);
    saveDemoData();
    renderAll();
    return { id: newCustomer.id, updated: false };
  }
}

async function updateCustomer(customerId, patch) {
  if (state.mode === "firebase") {
    const { doc, updateDoc } = fb;
    await updateDoc(doc(fb.db, "customers", customerId), patch);
  } else {
    const customer = state.customers.find((c) => c.id === customerId);
    Object.assign(customer, patch);
    saveDemoData();
    renderAll();
  }
}

/** Hapus data pelanggan dari koleksi customers. */
async function deleteCustomer(customerId) {
  if (state.mode === "firebase") {
    const { doc, deleteDoc } = fb;
    await deleteDoc(doc(fb.db, "customers", customerId));
  } else {
    state.customers = state.customers.filter((c) => c.id !== customerId);
    saveDemoData();
    renderAll();
  }
}

/** Catat satu transaksi kas (manual ATAU otomatis dari pesanan selesai). */
async function addTransaction(tx) {
  if (state.mode === "firebase") {
    const { addDoc, collection, serverTimestamp } = fb;
    await addDoc(collection(fb.db, "transactions"), { ...tx, createdAt: serverTimestamp() });
  } else {
    const newTx = { ...tx, id: "demo-tx-" + Date.now() + Math.random().toString(36).slice(2, 6), createdAt: new Date().toISOString() };
    state.transactions.push(newTx);
    saveDemoData();
    renderAll();
  }
}

/** Simpan profil toko (dipakai form Pengaturan). */
async function saveSettings(patch) {
  if(patch.storeUrl?.trim()&&!safeStoreUrl(patch.storeUrl))throw Error('Alamat Website Pembeli harus URL http/https tanpa kredensial atau token.');
  if('storeUrl' in patch)patch.storeUrl=safeStoreUrl(patch.storeUrl);
  const merged = { ...DEFAULT_SETTINGS, ...(state.settings || {}), ...patch };
  if (state.mode === "firebase") {
    const { doc, setDoc } = fb;
    await setDoc(doc(fb.db, "settings", "store"), merged, { merge: true });
  } else {
    state.settings = merged;
    saveDemoData();
    renderAll();
  }
}

// ------------------------------------------------------------
// Karyawan & Posisi (Fase 1)
// ------------------------------------------------------------

/** No. ID karyawan otomatis, lanjutan dari nomor terbesar yang sudah ada (format KRY-0001). */
function generateEmployeeId() {
  const nums = state.employees.map((e) => {
    const m = /KRY-(\d+)/.exec(e.employeeId || "");
    return m ? Number(m[1]) : 0;
  });
  const next = (nums.length ? Math.max(...nums) : 0) + 1;
  return `KRY-${String(next).padStart(4, "0")}`;
}

async function addPosition(position) {
  if (state.mode === "firebase") {
    const { addDoc, collection, serverTimestamp } = fb;
    const ref = await addDoc(collection(fb.db, "positions"), { ...position, createdAt: serverTimestamp() });
    return ref.id;
  } else {
    const newPosition = { ...position, id: "demo-position-" + Date.now(), createdAt: new Date().toISOString() };
    state.positions.push(newPosition);
    saveDemoData();
    renderAll();
    return newPosition.id;
  }
}

async function addEmployee(employee) {
  if (state.mode === "firebase") {
    const { addDoc, collection, serverTimestamp } = fb;
    await addDoc(collection(fb.db, "employees"), { ...employee, createdAt: serverTimestamp() });
  } else {
    const newEmployee = { ...employee, id: "demo-employee-" + Date.now(), createdAt: new Date().toISOString() };
    state.employees.push(newEmployee);
    saveDemoData();
    renderAll();
  }
}

async function updateEmployee(employeeId, patch) {
  if (state.mode === "firebase") {
    const { doc, updateDoc } = fb;
    await updateDoc(doc(fb.db, "employees", employeeId), patch);
  } else {
    const employee = state.employees.find((e) => e.id === employeeId);
    Object.assign(employee, patch);
    saveDemoData();
    renderAll();
  }
}

async function addPerformanceReview(review) {
  if (state.mode === "firebase") {
    const { addDoc, collection, serverTimestamp } = fb;
    await addDoc(collection(fb.db, "performanceReviews"), { ...review, createdAt: serverTimestamp() });
  } else {
    const newReview = { ...review, id: "demo-review-" + Date.now(), createdAt: new Date().toISOString() };
    state.performanceReviews.push(newReview);
    saveDemoData();
    renderAll();
  }
}

async function updatePerformanceReview(reviewId, patch) {
  if (state.mode === "firebase") {
    const { doc, updateDoc } = fb;
    await updateDoc(doc(fb.db, "performanceReviews", reviewId), patch);
  } else {
    const review = state.performanceReviews.find((r) => r.id === reviewId);
    Object.assign(review, patch);
    saveDemoData();
    renderAll();
  }
}

async function addPayroll(payroll) {
  if (state.mode === "firebase") {
    const { addDoc, collection, serverTimestamp } = fb;
    await addDoc(collection(fb.db, "payrolls"), { ...payroll, createdAt: serverTimestamp() });
  } else {
    const newPayroll = { ...payroll, id: "demo-payroll-" + Date.now() + Math.random().toString(36).slice(2, 6), createdAt: new Date().toISOString() };
    state.payrolls.push(newPayroll);
    saveDemoData();
    await syncFinanceFromPayrolls();
    renderAll();
  }
}

async function updatePayroll(payrollId, patch) {
  if (state.mode === "firebase") {
    const { doc, updateDoc } = fb;
    await updateDoc(doc(fb.db, "payrolls", payrollId), patch);
  } else {
    const payroll = state.payrolls.find((p) => p.id === payrollId);
    Object.assign(payroll, patch);
    saveDemoData();
    await syncFinanceFromPayrolls();
    renderAll();
  }
}

/** Cegah 2 payroll aktif untuk employeeId + periode yang sama. */
function findExistingPayroll(employeeId, period, excludeId) {
  return state.payrolls.find((p) => p.employeeId === employeeId && p.period === period && p.id !== excludeId);
}

// ------------------------------------------------------------
// Sinkronisasi otomatis: Pesanan → Pelanggan & Pesanan → Keuangan
// ------------------------------------------------------------
const customerSyncInFlight = new Set(); // no. HP yang sedang dalam proses dibuatkan data pelanggan
const incomeSyncInFlight = new Set(); // id pesanan yang sedang dalam proses dicatat sebagai pemasukan

function toDateInputValue(input) {
  const d = input?.toDate ? input.toDate() : new Date(input || Date.now());
  if (Number.isNaN(d.getTime())) return new Date().toISOString().slice(0, 10);
  return d.toISOString().slice(0, 10);
}

/** Pastikan setiap nomor HP unik di daftar pesanan punya data pelanggan di koleksi customers. */
async function syncCustomersFromOrders() {
  if (state.mode !== "demo") return;
  const seenPhones = new Set();
  for (const o of state.orders) {
    const phone = (o.phone || "").trim();
    if (!phone || seenPhones.has(phone)) continue;
    seenPhones.add(phone);
    const alreadyExists = state.customers.some((c) => (c.phone || "").trim() === phone);
    if (alreadyExists || customerSyncInFlight.has(phone)) continue;
    customerSyncInFlight.add(phone);
    try {
      await upsertCustomer({ name: o.customerName, phone, address: o.address || "" });
    } finally {
      customerSyncInFlight.delete(phone);
    }
  }
}

/** Pastikan setiap pesanan berstatus "selesai" punya satu baris pemasukan di koleksi transactions. */
async function syncIncomeFromOrders() {
  if (state.mode !== "demo") return;
  for (const o of state.orders) {
    if (o.status !== "selesai") continue;
    const alreadyExists = state.transactions.some((t) => t.orderId === o.id);
    if (alreadyExists || incomeSyncInFlight.has(o.id)) continue;
    incomeSyncInFlight.add(o.id);
    try {
      const completedEntry = (o.statusHistory || []).find((h) => h.status === "selesai");
      await addTransaction({
        date: toDateInputValue(completedEntry ? completedEntry.at : o.createdAt),
        description: `Pesanan ${escapeHtml(o.invoiceNo)} — ${escapeHtml(o.customerName)}`,
        category: "Penjualan",
        type: "masuk",
        amount: o.total,
        orderId: o.id,
      });
    } finally {
      incomeSyncInFlight.delete(o.id);
    }
  }
}

// ------------------------------------------------------------
// Seed data lama dinonaktifkan; gunakan emulator untuk pengujian
// ------------------------------------------------------------
function buildSeedData() {
  // Data contoh bernama/alamat tidak disertakan dalam paket distribusi.
  // Pengujian lokal menggunakan seed-emulator.mjs secara eksplisit.
  return { orders: [], products: [] };
}

// ============================================================
// 2. HELPERS
// ============================================================
const formatRupiah = (n) => "Rp " + Number(n || 0).toLocaleString("id-ID");
const formatDate = (iso) => {
  if (!iso) return "-";
  const d = iso?.toDate ? iso.toDate() : new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("id-ID", { timeZone:"Asia/Jakarta", day: "numeric", month: "short", year: "numeric" });
};
/** Konversi Firestore Timestamp atau string ISO menjadi objek Date JS. */
const toJsDate = (input) => (input?.toDate ? input.toDate() : new Date(input));
const isToday = (input) => jakartaDay(input) === jakartaDay();
function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[c]));
}

/** Label tampilan varian: "Warna - Ukuran". Kompatibel mundur dengan data lama berformat {name}. */
function variantLabel(v) {
  const combo = [v.color, v.size].filter(Boolean).join(" - ");
  return combo || v.name || v.sku || "Varian";
}

/** Normalisasi satu varian (dari Firestore, format lama ATAU baru) ke bentuk baris form yang baru. */
/** Normalisasi harga varian (HPP/Offline/Online). Kompatibel mundur dengan skema lama {price}. */
function normalizeVariantPricing(v) {
  return {
    hpp: v.hpp ?? 0,
    priceOffline: v.priceOffline ?? v.price ?? 0,
    priceOnline: v.priceOnline ?? v.price ?? 0,
  };
}

/**
 * Daftar foto produk terurut. Kompatibel mundur: produk lama yang cuma punya
 * `photoUrl` tunggal otomatis dibungkus jadi array 1 elemen.
 */
function getProductImages(p) {
  if (Array.isArray(p.images) && p.images.length > 0) {
    return [...p.images].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }
  if (p.photoUrl) {
    return [{ url: p.photoUrl, isPrimary: true, order: 0 }];
  }
  return [];
}

/** URL foto utama produk (dipakai untuk thumbnail tabel, fallback foto varian, dll). */
function getPrimaryImageUrl(p) {
  const images = getProductImages(p);
  const primary = images.find((i) => i.isPrimary) || images[0];
  return primary ? primary.url : "";
}

/** Normalisasi harga dasar produk (HPP/Offline/Online). Kompatibel mundur dengan skema lama {price}. */
function getProductBasePricing(p) {
  return {
    hpp: p.hpp ?? 0,
    priceOffline: p.priceOffline ?? p.price ?? 0,
    priceOnline: p.priceOnline ?? p.price ?? 0,
  };
}

function normalizeVariantForEdit(v) {
  const pricing = normalizeVariantPricing(v);
  return {
    id: v.id || crypto.randomUUID(),
    image: v.image || "",
    color: v.color !== undefined ? v.color : (v.name || ""),
    size: v.size || "",
    hpp: pricing.hpp || null,
    priceOffline: pricing.priceOffline || null,
    priceOnline: pricing.priceOnline || null,
    stock: v.stock ?? 0,
    sku: v.sku || "",
  };
}

function showToast(msg) {
  els.toast.textContent = msg;
  els.toast.hidden = false;
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => (els.toast.hidden = true), 2600);
}

// ============================================================
// 3. RENDER
// ============================================================
function renderAll() {
  renderNavBadge(); renderAdminChrome();
  if (state.view === "pencarian") renderSearchResults();
  if (state.view === "dashboard") renderDashboard();
  if (state.view === "pesanan") renderOrdersView();
  if (state.view === "produk") renderProductsView();
  if (state.view === "pelanggan") renderPelangganView();
  if (state.view === "karyawan") renderKaryawanView();
  if (state.view === "keuangan") renderKeuanganView();
  if (state.openOrderId) renderOrderModalBody(state.openOrderId);
}

const DASHBOARD_ZONE='Asia/Jakarta';
function jakartaDay(input=new Date()) { const d=toJsDate(input);return Number.isNaN(+d)?'':new Date(+d+7*3600000).toISOString().slice(0,10); }
function jakartaDateLabel(input,options={day:'numeric',month:'long',year:'numeric'}) {return toJsDate(input).toLocaleDateString('id-ID',{...options,timeZone:DASHBOARD_ZONE});}
function safeStoreUrl(value) {
  try {const u=new URL(String(value||'').trim());if(!['http:','https:'].includes(u.protocol)||u.username||u.password)return '';for(const key of u.searchParams.keys())if(/^(token|access_token|id_token|password|auth)$/i.test(key))return '';return u.href;}catch{return '';}
}
function claimNeedsAction(c) {
  if(['ditolak','selesai','ditutup'].includes(c.status))return false;
  if(c.status==='refund')return c.refundPaid!==true;
  if(c.status==='retur')return !c.returnInspected||c.refundAmount>0&&!c.refundPaid;
  if(c.status==='penggantian')return !c.returnInspected||!c.fulfilled||c.refundAmount>0&&!c.refundPaid;
  if(c.status==='kirim_kekurangan')return !c.fulfilled||c.refundAmount>0&&!c.refundPaid;
  return true;
}
function readyToShip(o){return o.status==='diproses'&&o.shippingMethod!=='pickup'&&(o.schemaVersion!==2||(['Dikemas','Menunggu kurir','Siap dikirim'].includes(o.detailStatus)&&(o.paymentStatus==='lunas'||o.cashConfirmed&&String(o.paymentMethod).startsWith('cash_'))));}
function outstandingCourierCash(orders){return orders.filter(o=>o.paymentMethod==='cash_store'&&['diterima_kurir','disetor_kurir'].includes(o.cashStatus)&&o.paidAmount>0).reduce((n,o)=>n+Number(o.paidAmount),0);}
function orderChannel(o){return o.source==='website'?'website':o.source==='admin'?'admin':'historis';}
function salesEntries(orders,transactions) {
  const lookup=new Map();orders.forEach(o=>{lookup.set(o.id,o);if(o.invoiceNo)lookup.set(o.invoiceNo,o);});
  const result=new Map();
  const sorted=[...transactions].sort((a,b)=>Number(String(b.id).startsWith('income_'))-Number(String(a.id).startsWith('income_')));
  for(const t of sorted){
    if(t.type!=='masuk'||!(Number(t.amount)>0)||(!t.orderId&&t.category!=='Penjualan'))continue;
    const o=lookup.get(t.orderId);if(o?.status==='dibatalkan')continue;
    const key=t.orderId?'order:'+(o?.id||t.orderId):'manual:'+t.id;
    if(!result.has(key))result.set(key,{amount:Number(t.amount),at:t.createdAt||t.date,orderId:t.orderId});
  }
  return [...result.values()];
}
function getDashboardDateRange(now=new Date()) {
  const today=jakartaDay(now),selected=state.dashPeriod==='custom'&&/^\d{4}-\d{2}-\d{2}$/.test(state.dashCustomDate)?state.dashCustomDate:today;
  const dayStart=new Date(selected+'T00:00:00+07:00'),end=new Date(+dayStart+86400000);
  const count=state.dashPeriod==='7d'?7:state.dashPeriod==='30d'?30:1,start=new Date(+dayStart-(count-1)*86400000);
  const label=count===1?jakartaDateLabel(start):`${jakartaDateLabel(start)} – ${jakartaDateLabel(new Date(+end-1))}`;
  return {start,end,label};
}
function isWithinRange(input,start,end){const date=typeof input==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(input)?new Date(input+'T00:00:00+07:00'):toJsDate(input);return date>=start&&date<end;}
function activityCounts(){return {reseller:state.resellers.filter(r=>r.status==='menunggu').length,claims:state.claims.filter(claimNeedsAction).length,payment:state.orders.filter(o=>o.status==='perlu_verifikasi').length};}
function renderNavBadge() {
  const counts=activityCounts();
  for(const [key,value,ready] of [['pesanan',state.orders.filter(o=>!['selesai','dibatalkan'].includes(o.status)).length,state.ready.orders],['reseller',counts.reseller,state.ready.resellers],['retur',counts.claims,state.ready.claims]]){
    const badge=document.getElementById('nav-badge-'+key);badge.textContent=value;badge.hidden=!ready||!value;badge.style.removeProperty('display');
  }
}
function renderAdminChrome() {
  const s=state.settings||{},u=state.adminIdentity;
  document.getElementById('sidebar-store-name').textContent=s.storeName||'KUBAH NABAWI';
  const logo=document.getElementById('sidebar-logo'),url=safeStoreUrl(s.logoUrl);if(url&&logo.getAttribute('src')!==url)logo.src=url;logo.hidden=!url;document.getElementById('sidebar-monogram').hidden=!!url;
  logo.onerror=()=>{logo.hidden=true;document.getElementById('sidebar-monogram').hidden=false;};
  document.getElementById('admin-display-name').textContent=u?.name||'Admin';document.getElementById('admin-display-name').title=u?.email||'';
  document.getElementById('admin-initial').textContent=(u?.name||'A').trim().slice(0,1).toUpperCase();document.getElementById('admin-role').textContent=u?.superAdmin?'Super Admin':'Administrator';
  const storeLink=document.getElementById('view-store'),storeUrl=safeStoreUrl(s.storeUrl);storeLink.href=storeUrl||'#pengaturan';storeLink.dataset.configured=storeUrl?'true':'false';
  const counts=activityCounts(),rows=[['reseller',counts.reseller,'pengajuan reseller menunggu',state.ready.resellers],['retur',counts.claims,'komplain belum selesai',state.ready.claims],['payment',counts.payment,'pembayaran perlu verifikasi',state.ready.orders]];
  document.getElementById('notification-dot').hidden=!rows.some(r=>r[3]&&r[1]>0);
  const panel=document.getElementById('notification-items');panel.innerHTML=rows.filter(r=>r[3]&&r[1]>0).map(r=>`<button data-activity="${r[0]}"><strong>${r[1]}</strong> ${r[2]} <span aria-hidden="true">›</span></button>`).join('')||'<p>Tidak ada tindak lanjut pada data yang sudah tersinkron.</p>';
  panel.querySelectorAll('[data-activity]').forEach(b=>b.onclick=()=>followActivity(b.dataset.activity));
}
function followActivity(target){document.getElementById('notification-panel').hidden=true;document.getElementById('notifications-toggle').setAttribute('aria-expanded','false');if(target==='payment'){state.orderTab='perlu_verifikasi';state.orderChannel='semua';document.getElementById('order-channel').value='semua';navigateTo('pesanan');}else navigateTo(target);}
function renderDashboard() {
  const {start,end,label}=getDashboardDateRange(),orders=state.orders,counts=activityCounts();
  const money=salesEntries(orders,state.transactions).filter(t=>isWithinRange(t.at,start,end)).reduce((n,t)=>n+t.amount,0);
  els.statRevenue.textContent=state.ready.orders&&state.ready.transactions?formatRupiah(money):'Belum tersedia';
  document.getElementById('sales-period-label').textContent=state.dashPeriod==='today'?'Penjualan Hari Ini':'Penjualan Periode Ini';
  els.statNewOrders.textContent=state.ready.orders?orders.filter(o=>isWithinRange(o.createdAt,start,end)).length:'—';
  document.getElementById('stat-ready').textContent=state.ready.orders?orders.filter(readyToShip).length:'—';
  const cashReady=state.ready.orders&&state.ready.ecommerce&&!!state.ecommerce;
  const cash=outstandingCourierCash(orders);
  document.getElementById('stat-cash').textContent=cashReady?formatRupiah(cash):'Belum tersedia';
  document.getElementById('stat-cash').title=cashReady?'Dana diterima kurir dan belum diverifikasi setorannya, seluruh tanggal.':'Data penerimaan dan setoran kurir belum tersedia.';
  els.statVerify.textContent=state.ready.orders?counts.payment:'—';els.statLowstock.textContent=state.products.filter(p=>p.status==='aktif'&&Number(p.totalStock)<=5).length;
  document.getElementById('follow-resellers').textContent=state.ready.resellers?counts.reseller:'—';document.getElementById('follow-claims').textContent=state.ready.claims?counts.claims:'—';
  els.todayDate.textContent=label+' · WIB';
  document.querySelector('#dash-period-select option[value="today"]').textContent=jakartaDateLabel(new Date());
  document.getElementById('dashboard-definition').textContent='Penjualan: penerimaan penjualan tercatat pada periode terpilih, sebelum refund; jurnal pesanan dihitung sekali dan pesanan batal dikecualikan. Pesanan Baru: dibuat dalam periode. Siap Dikirim: pesanan dikemas/menunggu kurir (pesanan lama: diproses), di seluruh tanggal. Tunai: dana yang telah diterima kurir dan belum diverifikasi setorannya, di seluruh tanggal.';
  const recent=orders.filter(o=>isWithinRange(o.createdAt,start,end)&&(state.recentTab==='semua'||o.status===state.recentTab)).sort((a,b)=>toJsDate(b.createdAt)-toJsDate(a.createdAt)).slice(0,5);
  const tbody=els.tableRecentOrders.querySelector('tbody');tbody.innerHTML=recent.map(o=>{
    const shipping={store:'Kurir Toko',pickup:'Ambil di Gudang',regular:'Reguler',instant:'Instan',cargo:'Kargo'}[o.shippingMethod]||o.courier||'Belum diatur';
    const badge=o.promoApplied===true&&o.shippingMethod==='store'&&o.shippingState==='confirmed'&&o.shippingCost===0?'<span class="promo-badge">Gratis ongkir</span>':'';
    const status=o.detailStatus==='Menunggu kurir'?'Menunggu Kurir':o.shippingMethod==='pickup'&&o.status==='diproses'?'Siap Diambil':STATUS_META[o.status]?.label||o.status||'Belum tersedia';
    return `<tr data-recent-order="${escapeHtml(o.id)}"><td><button class="invoice-link" data-order-detail="${escapeHtml(o.id)}" title="${escapeHtml(o.invoiceNo)}">${escapeHtml(o.invoiceNo||o.id)}</button></td><td>${escapeHtml(o.customerName)}${o.usesReseller?'<small class="reseller-label">Reseller</small>':''}</td><td>${escapeHtml(shipping)} ${badge}</td><td>${o.total==null?'Menunggu konfirmasi':formatRupiah(o.total)}</td><td><span class="tag tag--${escapeHtml(o.status)}">${escapeHtml(status)}</span></td><td><button class="row-more" data-order-detail="${escapeHtml(o.id)}" aria-label="Detail pesanan ${escapeHtml(o.invoiceNo||o.id)}">⋮</button></td></tr>`;
  }).join('')||`<tr><td colspan="6" class="table-empty">${state.ready.orders?'Belum ada pesanan pada periode dan status ini.':'Data pesanan belum tersedia.'}</td></tr>`;
  tbody.querySelectorAll('[data-recent-order]').forEach(row=>row.onclick=()=>openOrderModal(row.dataset.recentOrder));
  document.querySelectorAll('[data-recent]').forEach(b=>{const active=b.dataset.recent===state.recentTab;b.classList.toggle('is-active',active);b.setAttribute('aria-pressed',String(active));});
  document.getElementById('schedule-date').textContent=(state.dashPeriod==='today'?'Hari ini, ':'')+label;
  const slots=state.deliverySlots.filter(s=>s.enabled&&isWithinRange(s.startAt,start,end)).sort((a,b)=>Date.parse(a.startAt)-Date.parse(b.startAt));
  const time=v=>new Date(v).toLocaleTimeString('id-ID',{timeZone:DASHBOARD_ZONE,hour:'2-digit',minute:'2-digit'}).replace(':','.');
  document.getElementById('delivery-slots').innerHTML=state.ready.slots?(slots.map((slot,i)=>{const used=Number(slot.used)||0,cap=Number(slot.capacity)||0;return `<article class="slot-card"><div><strong>${state.dashPeriod==='7d'||state.dashPeriod==='30d'?escapeHtml(jakartaDateLabel(slot.startAt,{day:'numeric',month:'short'}))+' · ':''}${time(slot.startAt)} – ${time(slot.endAt)}</strong><small>${used}/${cap} pengiriman</small></div><progress class="slot-progress tone-${i%3}" value="${Math.min(used,cap)}" max="${Math.max(cap,1)}" aria-label="Kuota ${time(slot.startAt)}: ${used} dari ${cap}"></progress></article>`;}).join('')||'<div class="dashboard-empty"><p>Belum ada jadwal aktif pada periode ini.</p><button class="btn btn--outline" id="add-empty-slot">Tambah Jadwal</button></div>'):'<p class="dashboard-empty">Jadwal belum tersedia. Periksa koneksi dan izin Firebase.</p>';
  document.getElementById('add-empty-slot')?.addEventListener('click',()=>navigateTo('jadwal'));
  const c=state.ecommerce,free=c?.freeShipping;
  document.getElementById('free-shipping-summary').innerHTML=state.ready.ecommerce&&free?`${free.enabled===false?'<p class="promo-disabled">Promo nonaktif</p>':''}<p>Minimal ${Number(free.minPcs)===20?'1 kodi (20 pcs)':escapeHtml(free.minPcs)+' pcs'}</p><p>Maksimal ${escapeHtml(free.maxKm)} km dari gudang</p><small>${c.routeProvider==='google'?'Jarak diverifikasi backend Google Routes.':'Jarak rute memerlukan verifikasi admin.'}</small>`:'<p>Konfigurasi promo belum tersedia.</p>';
  const pending=orders.filter(o=>o.schemaVersion===2&&o.shippingState!=='confirmed'&&o.status!=='dibatalkan').length;
  els.actionList.innerHTML=pending?`<li>${pending} pesanan masih menunggu konfirmasi ongkir.</li>`:'<li>Tidak ada ongkir yang menunggu konfirmasi pada data tersinkron.</li>';
  renderSalesChart();
}
function renderSalesChart(){
  const {end}=getDashboardDateRange(),count=state.dashPeriod==='30d'?30:7,entries=salesEntries(state.orders,state.transactions),days=Array.from({length:count},(_,i)=>new Date(+end-(count-i)*86400000));
  const totals=days.map(d=>entries.filter(t=>isWithinRange(t.at,d,new Date(+d+86400000))).reduce((n,t)=>n+t.amount,0)),max=Math.max(...totals,1),width=320/count;
  els.chartTitle.textContent=`Penerimaan penjualan — ${count} hari hingga ${jakartaDateLabel(new Date(+end-1))}`;
  els.salesChart.innerHTML=totals.map((total,i)=>{const height=total/max*110;return `<rect x="${i*width+2}" y="${115-height}" width="${Math.max(1,width-4)}" height="${height}" rx="2" fill="#7C2D3B"><title>${jakartaDateLabel(days[i])}: ${formatRupiah(total)}</title></rect>${i%Math.ceil(count/7)===0?`<text x="${i*width+width/2}" y="135" font-size="8" text-anchor="middle" fill="#69645b">${jakartaDateLabel(days[i],{day:'numeric',month:'short'})}</text>`:''}`;}).join('');
}
function showOperational(module){
  const allowed=['orders','couriers','slots','resellers','pricing','claims','settings','reconcile'];if(!allowed.includes(module.split('/')[0]))return;
  const view={resellers:'reseller',couriers:'pengiriman',slots:'jadwal',claims:'retur',orders:'pesanan',reconcile:'keuangan',pricing:'pengaturan',settings:'pengaturan'}[module.split('/')[0]];
  state.view='operasional';document.querySelectorAll('.view').forEach(v=>v.hidden=true);document.getElementById('view-operasional').hidden=false;
  document.querySelectorAll('.nav-item[data-view]').forEach(b=>b.classList.toggle('is-active',b.dataset.view===view));
  document.getElementById('breadcrumb-title').textContent=({reseller:'Reseller',pengiriman:'Pengiriman & Kurir',jadwal:'Jadwal Pengiriman',retur:'Retur & Komplain',pesanan:'Pesanan Website',keuangan:'Rekonsiliasi',pengaturan:'Pengaturan operasional'})[view];
  document.getElementById('operational-frame').src='admin-website.html?embed=1#'+module;toggleDrawer(false);
}
function toggleDrawer(open){
  const wasOpen=document.body.classList.contains('drawer-open');
  document.body.classList.toggle('drawer-open',open);
  document.querySelector('main.main').inert=open;
  document.getElementById('drawer-backdrop').hidden=!open;
  document.getElementById('open-menu').setAttribute('aria-expanded',String(open));
  if(open)document.getElementById('close-menu').focus();
  else if(wasOpen)document.getElementById('open-menu').focus();
}

function renderSearchResults(){
  const query=document.getElementById('global-search').value.trim().toLowerCase();
  const orders=query?state.orders.filter(o=>[o.invoiceNo,o.customerName].some(v=>String(v||'').toLowerCase().includes(query))):[];
  const products=query?state.products.filter(p=>[p.name,p.sku,...(p.variants||[]).flatMap(v=>[v.sku,v.color,v.size])].some(v=>String(v||'').toLowerCase().includes(query))):[];
  document.getElementById('search-summary').textContent=query?`${orders.length} pesanan · ${products.length} produk untuk “${document.getElementById('global-search').value.trim()}”`:'Masukkan nomor pesanan, nama pelanggan, nama produk, warna, atau SKU.';
  document.getElementById('global-search-results').innerHTML=`<section class="panel"><h2>Pesanan</h2>${orders.slice(0,30).map(o=>`<button class="search-result" data-result-order="${escapeHtml(o.id)}"><strong>${escapeHtml(o.invoiceNo)}</strong><span>${escapeHtml(o.customerName)}</span></button>`).join('')||'<p>Tidak ada pesanan yang cocok.</p>'}</section><section class="panel"><h2>Produk</h2>${products.slice(0,30).map(p=>`<button class="search-result" data-result-product="${escapeHtml(p.id)}"><strong>${escapeHtml(p.name)}</strong><span>${escapeHtml(p.sku||'Lihat varian & stok')}</span></button>`).join('')||'<p>Tidak ada produk yang cocok.</p>'}</section>`;
  document.querySelectorAll('[data-result-order]').forEach(b=>b.onclick=()=>openOrderModal(b.dataset.resultOrder));document.querySelectorAll('[data-result-product]').forEach(b=>b.onclick=()=>{navigateTo('produk');openProductModal(state.products.find(p=>p.id===b.dataset.resultProduct));});
}
function bindAdminDashboard(){
  window.addEventListener('resize',()=>{if(window.innerWidth>900&&document.body.classList.contains('drawer-open'))toggleDrawer(false);});
  document.getElementById('dash-create-order').onclick=openCreateOrderModal;
  document.getElementById('dash-period-select').onchange=e=>{state.dashPeriod=e.target.value;els.dashCustomDate.hidden=state.dashPeriod!=='custom';if(!state.dashCustomDate){state.dashCustomDate=jakartaDay();els.dashCustomDate.value=state.dashCustomDate;}renderDashboard();};
  document.querySelectorAll('[data-recent]').forEach(b=>b.onclick=()=>{state.recentTab=b.dataset.recent;renderDashboard();});
  document.querySelectorAll('[data-follow]').forEach(b=>b.onclick=()=>followActivity(b.dataset.follow));document.querySelectorAll('[data-module]').forEach(b=>b.onclick=()=>showOperational(b.dataset.module));
  document.getElementById('global-search-form').onsubmit=e=>{e.preventDefault();navigateTo('pencarian');};
  document.getElementById('order-channel').onchange=e=>{state.orderChannel=e.target.value;renderOrdersView();};
  document.getElementById('view-store').onclick=e=>{if(!safeStoreUrl(state.settings.storeUrl)){e.preventDefault();navigateTo('pengaturan');showToast('Isi Alamat Website Pembeli terlebih dahulu.');els.settingsForm.elements.storeUrl.focus();}};
  document.getElementById('open-menu').onclick=()=>toggleDrawer(true);document.getElementById('close-menu').onclick=()=>toggleDrawer(false);document.getElementById('drawer-backdrop').onclick=()=>toggleDrawer(false);
  document.getElementById('notifications-toggle').onclick=()=>{const panel=document.getElementById('notification-panel');panel.hidden=!panel.hidden;document.getElementById('notifications-toggle').setAttribute('aria-expanded',String(!panel.hidden));};
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){const wasOpen=document.body.classList.contains('drawer-open');toggleDrawer(false);document.getElementById('notification-panel').hidden=true;document.getElementById('notifications-toggle').setAttribute('aria-expanded','false');if(wasOpen)document.getElementById('open-menu').focus();}});
}


function renderOrderRows(tbody, orders, withAction) {
  tbody.innerHTML = "";
  if (orders.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="table-empty">Tidak ada pesanan.</td></tr>`;
    return;
  }
  orders.forEach((o) => {
    const tr = document.createElement("tr");
    tr.className = "is-clickable";
    tr.innerHTML = `
      <td>${escapeHtml(o.invoiceNo)}</td>
      <td>${escapeHtml(o.customerName)}</td>
      <td>${(o.total == null ? "Menunggu konfirmasi" : formatRupiah(o.total))}</td>
      <td><span class="tag tag--${escapeHtml(o.status)}">${(STATUS_META[o.status]?.label || "Status tidak dikenal")}</span></td>
      ${withAction ? `<td></td>` : ""}
    `;
    tr.addEventListener("click", (e) => {
      if (e.target.closest(".mini-btn")) return;
      openOrderModal(o.id);
    });
    if (withAction) {
      const actionTd = tr.querySelector("td:last-child");
      actionTd.classList.add("row-actions");
      const btn = document.createElement("button");
      btn.className = "mini-btn";
      btn.textContent = actionLabelFor(o.status);
      btn.addEventListener("click", () => openOrderModal(o.id));
      const printBtn = document.createElement("button");
      printBtn.className = "mini-btn mini-btn--outline";
      printBtn.textContent = "Cetak nota";
      printBtn.addEventListener("click", () => printInvoice(o));
      const delBtn = document.createElement("button");
      delBtn.className = "mini-btn mini-btn--outline";
      delBtn.textContent = "Nonaktifkan";
      delBtn.addEventListener("click", async () => {
        if (confirm(`Hapus pesanan ${escapeHtml(o.invoiceNo)}? Tindakan ini tidak bisa dibatalkan.`)) {
          await deleteOrder(o.id);
          showToast(`${escapeHtml(o.invoiceNo)} dihapus.`);
        }
      });
      actionTd.appendChild(btn);
      actionTd.appendChild(printBtn);
      // Pesanan tetap tersimpan untuk audit.
    }
    tbody.appendChild(tr);
  });
}

function actionLabelFor(status) {
  if (status === "perlu_verifikasi") return "Verifikasi";
  if (status === "diproses") return "Input resi";
  return "Detail";
}

// ------------------------------------------------------------
// Cetak nota / invoice
// ------------------------------------------------------------
function buildInvoiceHtml(o) {
  const store = { ...DEFAULT_SETTINGS, ...(state.settings || {}) };
  const subtotal = o.items.reduce((s, it) => s + it.price * it.qty, 0);
  const itemRows = o.items
    .map(
      (it, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${escapeHtml(it.productName)}</td>
        <td>${escapeHtml(it.variant || "-")}</td>
        <td class="num">${it.qty}</td>
        <td class="num">${formatRupiah(it.price)}</td>
        <td class="num">${formatRupiah(it.price * it.qty)}</td>
      </tr>`
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8" />
<title>Nota ${escapeHtml(o.invoiceNo)}</title>
<style>
  @page { size: A4; margin: 16mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #1B1F2A; margin: 0; padding: 0; font-size: 13px; }
  .sheet { max-width: 720px; margin: 0 auto; padding: 24px; }
  .inv-head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #1B1F2A; padding-bottom: 16px; margin-bottom: 20px; }
  .store-name { font-size: 20px; font-weight: 700; margin: 0 0 4px; }
  .store-meta { font-size: 12px; color: #555; line-height: 1.5; margin: 0; }
  .inv-title { text-align: right; }
  .inv-title h2 { margin: 0; font-size: 22px; letter-spacing: 1px; }
  .inv-title p { margin: 4px 0 0; font-size: 12.5px; }
  .inv-cols { display: flex; justify-content: space-between; margin-bottom: 22px; gap: 20px; }
  .inv-cols h4 { margin: 0 0 6px; font-size: 11px; text-transform: uppercase; letter-spacing: .5px; color: #777; }
  .inv-cols p { margin: 0 0 2px; }
  table.items { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
  table.items th { text-align: left; font-size: 11.5px; text-transform: uppercase; letter-spacing: .3px; color: #555; border-bottom: 1.5px solid #1B1F2A; padding: 6px 8px; }
  table.items td { padding: 8px; border-bottom: 1px solid #ddd; }
  table.items td.num, table.items th.num { text-align: right; }
  .totals { width: 260px; margin-left: auto; }
  .totals-row { display: flex; justify-content: space-between; padding: 5px 8px; font-size: 13px; }
  .totals-row.grand { border-top: 2px solid #1B1F2A; font-weight: 700; font-size: 15px; margin-top: 4px; }
  .status-badge { display: inline-block; margin-top: 4px; padding: 3px 10px; border: 1px solid #1B1F2A; border-radius: 3px; font-size: 11.5px; font-weight: 600; }
  .footer-note { margin-top: 32px; font-size: 12px; color: #555; text-align: center; border-top: 1px dashed #ccc; padding-top: 14px; }
  .print-bar { text-align: center; padding: 12px; background: #F1EAD9; }
  .print-bar button { padding: 8px 18px; font-size: 13px; font-weight: 600; border-radius: 4px; border: none; background: #7C2D3B; color: #fff; cursor: pointer; }
  @media print {
    .no-print { display: none !important; }
  }
</style>
</head>
<body>
  <div class="print-bar no-print">
    <button onclick="window.print()">Cetak sekarang</button>
  </div>
  <div class="sheet">
    <div class="inv-head">
      <div style="display:flex;gap:12px;align-items:flex-start;">
        ${store.logoUrl ? `<img src="${escapeHtml(store.logoUrl)}" alt="logo" style="width:48px;height:48px;object-fit:contain;" onerror="this.style.display='none'" />` : ""}
        <div>
          <p class="store-name">${escapeHtml(store.storeName)}</p>
          <p class="store-meta">${store.tagline ? escapeHtml(store.tagline) + "<br/>" : ""}${escapeHtml(store.address)}<br/>WhatsApp: ${escapeHtml(store.phone)}</p>
        </div>
      </div>
      <div class="inv-title">
        <h2>NOTA</h2>
        <p><strong>${escapeHtml(o.invoiceNo)}</strong></p>
        <p>${formatDate(o.createdAt)}</p>
      </div>
    </div>

    <div class="inv-cols">
      <div>
        <h4>Ditagihkan kepada</h4>
        <p><strong>${escapeHtml(o.customerName)}</strong></p>
        <p>${escapeHtml(o.phone)}</p>
        <p>${escapeHtml(o.address)}</p>
      </div>
      <div style="text-align:right;">
        <h4>Status pesanan</h4>
        <span class="status-badge">${escapeHtml(STATUS_META[o.status]?.label || o.status)}</span>
        ${(o.status === "dikirim" || o.status === "selesai") && o.courier ? `<p style="margin-top:8px;">${escapeHtml(o.courier)}${o.trackingNumber ? " — " + escapeHtml(o.trackingNumber) : ""}</p>` : ""}
      </div>
    </div>

    <table class="items">
      <thead>
        <tr><th>No</th><th>Produk</th><th>Varian</th><th class="num">Qty</th><th class="num">Harga</th><th class="num">Subtotal</th></tr>
      </thead>
      <tbody>${itemRows}</tbody>
    </table>

    <div class="totals">
      <div class="totals-row"><span>Subtotal</span><span>${formatRupiah(subtotal)}</span></div>
      <div class="totals-row"><span>Ongkos kirim</span><span>${(o.shippingCost == null ? "Menunggu konfirmasi" : formatRupiah(o.shippingCost))}</span></div>
      <div class="totals-row grand"><span>Total</span><span>${(o.total == null ? "Menunggu konfirmasi" : formatRupiah(o.total))}</span></div>
    </div>

    <p class="footer-note">Terima kasih atas pesanan Anda. Nota ini dicetak otomatis oleh sistem admin.</p>
  </div>
</body>
</html>`;
}

/** Buka jendela baru berisi nota siap cetak, lalu otomatis memicu dialog print browser. */
function printInvoice(order) {
  const printWindow = window.open("", "_blank", "width=850,height=1000");
  if (!printWindow) {
    showToast("Popup diblokir browser — izinkan pop-up untuk situs ini agar bisa mencetak nota.");
    return;
  }
  printWindow.document.open();
  printWindow.document.write(buildInvoiceHtml(order));
  printWindow.document.close();

  let hasPrinted = false;
  const triggerPrint = () => {
    if (hasPrinted) return;
    hasPrinted = true;
    printWindow.focus();
    printWindow.print();
  };
  printWindow.onload = triggerPrint;
  setTimeout(triggerPrint, 500); // fallback untuk browser yang tidak konsisten memicu onload
}

function renderOrdersView() {
  // tabs
  els.orderTabs.innerHTML = "";
  const tabs = [{ key: "semua", label: "Semua" }, ...STATUS_ORDER.map((s) => ({ key: s, label: STATUS_META[s].label }))];
  tabs.forEach((t) => {
    const channelOrders=state.orders.filter(o=>state.orderChannel==='semua'||orderChannel(o)===state.orderChannel);
    const count=t.key==='semua'?channelOrders.length:channelOrders.filter(o=>o.status===t.key).length;
    const btn = document.createElement("button");
    btn.className = "tab" + (state.orderTab === t.key ? " is-active" : "");
    btn.textContent = `${t.label} (${count})`;
    btn.addEventListener("click", () => { state.orderTab = t.key; renderOrdersView(); });
    els.orderTabs.appendChild(btn);
  });

  const q = state.orderSearch.trim().toLowerCase();
  let filtered = state.orders.filter(o=>state.orderChannel==='semua'||orderChannel(o)===state.orderChannel);
  if (state.orderTab !== "semua") filtered = filtered.filter((o) => o.status === state.orderTab);
  if (q) filtered = filtered.filter((o) => (o.invoiceNo || "").toLowerCase().includes(q) || (o.customerName || "").toLowerCase().includes(q));

  els.orderCount.textContent = `${filtered.length} pesanan`;
  renderOrderRows(els.tableOrders.querySelector("tbody"), filtered, true);
}

function renderProductsView() {
  const q = state.productSearch.trim().toLowerCase();
  const filtered = state.products.filter((p) => (p.name || "").toLowerCase().includes(q));
  const tbody = els.tableProducts.querySelector("tbody");
  tbody.innerHTML = "";
  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="12" class="table-empty">Belum ada produk.</td></tr>`;
    return;
  }
  filtered.forEach((p) => {
    try {
      const tr = document.createElement("tr");
      const variants = Array.isArray(p.variants) ? p.variants : [];
      // Fallback: kalau dokumen lama tidak punya totalStock, hitung ulang dari varian.
      const totalStock = p.totalStock ?? variants.reduce((s, v) => s + (v.stock ?? 0), 0);
      const status = p.status || "aktif";
      const lowStock = totalStock <= 5;
      const initials = escapeHtml((p.name || "?").charAt(0).toUpperCase());
      const primaryUrl = getPrimaryImageUrl(p);
      const thumbHtml = `
        <div class="table-thumb-wrap">
          <span class="table-thumb-fallback">${initials}</span>
          ${primaryUrl ? `<img src="${escapeHtml(primaryUrl)}" alt="${escapeHtml(p.name)}" class="table-thumb-img" onerror="this.style.display='none'" />` : ""}
        </div>`;
      const basePricing = getProductBasePricing(p);
      const isExpanded = state.expandedProductIds.has(p.id);

      tr.innerHTML = `
        <td data-label="Foto">${thumbHtml}</td>
        <td data-label="Produk"><strong>${escapeHtml(p.name || "(tanpa nama)")}</strong><br/><span style="color:var(--text-muted);font-size:12px;">${variants.length} varian</span></td>
        <td data-label="SKU">${escapeHtml(p.sku || "-")}</td>
        <td data-label="Kategori">${escapeHtml(p.category || "-")}</td>
        <td data-label="HPP">${formatRupiah(basePricing.hpp)}</td>
        <td data-label="Offline">${formatRupiah(basePricing.priceOffline)}</td>
        <td data-label="Online">${formatRupiah(basePricing.priceOnline)}</td>
        <td data-label="Berat">${Number(p.weight || 0)} g</td>
        <td data-label="Total stok">${lowStock ? `<span class="tag tag--dibatalkan">${totalStock} unit</span>` : `${totalStock} unit`}</td>
        <td data-label="Varian"></td>
        <td data-label="Status"><span class="tag tag--${status === "aktif" ? "selesai" : status === "draft" ? "menunggu_pembayaran" : "dibatalkan"}">${escapeHtml(status)}</span></td>
        <td data-label="Aksi"></td>
      `;

      const variantToggleTd = tr.children[9];
      const toggleBtn = document.createElement("button");
      toggleBtn.type = "button";
      toggleBtn.className = "variant-toggle-btn";
      toggleBtn.textContent = isExpanded ? "▲ Sembunyikan" : `▼ Lihat Semua (${variants.length} Varian)`;
      toggleBtn.addEventListener("click", () => {
        if (isExpanded) state.expandedProductIds.delete(p.id);
        else state.expandedProductIds.add(p.id);
        renderProductsView();
      });
      variantToggleTd.appendChild(toggleBtn);

      const actionTd = tr.children[11];
      const editBtn = document.createElement("button");
      editBtn.className = "btn btn--ghost";
      editBtn.style.padding = "5px 10px";
      editBtn.style.fontSize = "12px";
      editBtn.style.marginRight = "6px";
      editBtn.textContent = "Edit";
      editBtn.addEventListener("click", () => openProductModal(p));
      const delBtn = document.createElement("button");
      delBtn.className = "btn btn--danger";
      delBtn.style.padding = "5px 10px";
      delBtn.style.fontSize = "12px";
      delBtn.textContent = "Nonaktifkan";
      delBtn.addEventListener("click", async () => {
        if (confirm(`Hapus produk "${p.name}"?`)) {
          await deleteProduct(p.id);
          showToast("Produk dihapus.");
        }
      });
      actionTd.appendChild(editBtn);
      actionTd.appendChild(delBtn);
      tbody.appendChild(tr);

      if (isExpanded) {
        const detailTr = document.createElement("tr");
        detailTr.className = "variant-expand-row";
        const detailTd = document.createElement("td");
        detailTd.colSpan = 12;
        detailTd.innerHTML = variants.length
          ? variants
              .map((v) => {
                const vp = normalizeVariantPricing(v);
                const imgUrl = v.image || primaryUrl;
                return `
                  <div class="variant-expand-item">
                    <div class="variant-expand-thumb">
                      ${imgUrl ? `<img src="${escapeHtml(imgUrl)}" alt="" onerror="this.style.display='none'" />` : escapeHtml(variantLabel(v)).charAt(0) || "?"}
                    </div>
                    <div class="variant-expand-info">
                      <strong>${escapeHtml(variantLabel(v))}</strong>
                      <span class="text-muted">SKU: ${escapeHtml(v.sku || "-")}</span>
                    </div>
                    <div class="variant-expand-specs">
                      <div><span>HPP</span><strong>${formatRupiah(vp.hpp)}</strong></div>
                      <div><span>Offline</span><strong>${formatRupiah(vp.priceOffline)}</strong></div>
                      <div><span>Online</span><strong>${formatRupiah(vp.priceOnline)}</strong></div>
                      <div><span>Stok</span><strong>${v.stock ?? 0} unit</strong></div>
                    </div>
                  </div>`;
              })
              .join("")
          : `<p class="text-muted" style="padding:6px 0;margin:0;">Belum ada varian.</p>`;
        detailTr.appendChild(detailTd);
        tbody.appendChild(detailTr);
      }
    } catch (err) {
      // Satu dokumen bermasalah tidak boleh membuat seluruh tabel kosong — lewati baris ini saja.
      console.warn("Gagal render produk, dilewati:", p?.id, err);
    }
  });
}

// ------------------------------------------------------------
// Pelanggan
// ------------------------------------------------------------
function customerStatsFor(customer) {
  const orders = state.orders.filter((o) => (o.phone || "").trim() === (customer.phone || "").trim());
  const totalOrders = orders.length;
  const totalSpent = orders.filter((o) => o.status !== "dibatalkan").reduce((s, o) => s + o.total, 0);
  return { orders, totalOrders, totalSpent };
}

function renderPelangganView() {
  const q = state.customerSearch.trim().toLowerCase();
  const filtered = state.customers.filter((c) => (c.name || "").toLowerCase().includes(q) || (c.phone || "").toLowerCase().includes(q));
  const tbody = els.tableCustomers.querySelector("tbody");
  tbody.innerHTML = "";
  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="table-empty">Belum ada pelanggan.</td></tr>`;
    return;
  }
  filtered
    .slice()
    .sort((a, b) => (a.name || "").localeCompare(b.name || ""))
    .forEach((c) => {
      const { totalOrders, totalSpent } = customerStatsFor(c);
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><strong>${escapeHtml(c.name)}</strong></td>
        <td>${escapeHtml(c.phone || "-")}</td>
        <td>${escapeHtml(c.address || "-")}</td>
        <td>${totalOrders} pesanan</td>
        <td>${formatRupiah(totalSpent)}</td>
        <td></td>
      `;
      const actionTd = tr.querySelector("td:last-child");
      const editBtn = document.createElement("button");
      editBtn.className = "btn btn--ghost";
      editBtn.style.padding = "5px 10px";
      editBtn.style.fontSize = "12px";
      editBtn.style.marginRight = "6px";
      editBtn.textContent = "Detail/Edit";
      editBtn.addEventListener("click", () => openCustomerModal(c));
      const delBtn = document.createElement("button");
      delBtn.className = "btn btn--danger";
      delBtn.style.padding = "5px 10px";
      delBtn.style.fontSize = "12px";
      delBtn.textContent = "Nonaktifkan";
      delBtn.addEventListener("click", async () => {
        if (confirm(`Yakin ingin menghapus data pelanggan "${c.name}"?`)) {
          await deleteCustomer(c.id);
          showToast(`Data pelanggan "${c.name}" dihapus.`);
        }
      });
      actionTd.appendChild(editBtn);
      actionTd.appendChild(delBtn);
      tbody.appendChild(tr);
    });
}

function resetCustomerForm() {
  els.customerForm.reset();
  state.editingCustomerId = null;
  els.customerModalTitle.textContent = "Tambah pelanggan";
  els.customerSubmitBtn.textContent = "Simpan pelanggan";
  els.customerModalStats.innerHTML = "";
  els.customerOrderHistory.innerHTML = "";
}

/** Buka modal pelanggan. Tanpa argumen = tambah baru. Dengan argumen = mode Detail/Edit, form & riwayat terisi otomatis. */
function openCustomerModal(customer) {
  resetCustomerForm();
  if (customer) {
    state.editingCustomerId = customer.id;
    els.customerModalTitle.textContent = `Edit pelanggan — ${customer.name}`;
    els.customerSubmitBtn.textContent = "Simpan perubahan";

    const f = els.customerForm.elements;
    f["name"].value = customer.name || "";
    f["phone"].value = customer.phone || "";
    f["address"].value = customer.address || "";

    const { orders, totalOrders, totalSpent } = customerStatsFor(customer);
    els.customerModalStats.innerHTML = `
      <div class="od-action-block" style="margin-top:0;margin-bottom:18px;">
        <div class="od-action-row" style="justify-content:space-between;">
          <span><strong>${totalOrders}</strong> total pesanan</span>
          <span><strong>${formatRupiah(totalSpent)}</strong> total belanja</span>
        </div>
      </div>`;

    if (orders.length > 0) {
      const rows = orders
        .slice()
        .sort((a, b) => new Date(b.createdAt?.toDate?.() || b.createdAt) - new Date(a.createdAt?.toDate?.() || a.createdAt))
        .map((o) => `<li><span>${escapeHtml(o.invoiceNo)} — <span class="tag tag--${escapeHtml(o.status)}">${(STATUS_META[o.status]?.label || "Status tidak dikenal")}</span></span><span>${(o.total == null ? "Menunggu konfirmasi" : formatRupiah(o.total))}</span></li>`)
        .join("");
      els.customerOrderHistory.innerHTML = `<h3 style="font-size:12px;color:var(--text-muted);margin:18px 0 8px;">Riwayat pesanan</h3><ul class="od-items">${rows}</ul>`;
    }
  }
  els.customerModal.hidden = false;
}

// ------------------------------------------------------------
// Keuangan
// ------------------------------------------------------------
function renderKeuanganView() {
  const income = state.transactions.filter((t) => t.type === "masuk").reduce((s, t) => s + Number(t.amount || 0), 0);
  const expense = state.transactions.filter((t) => t.type === "keluar").reduce((s, t) => s + Number(t.amount || 0), 0);
  els.finIncome.textContent = formatRupiah(income);
  els.finExpense.textContent = formatRupiah(expense);
  els.finBalance.textContent = formatRupiah(income - expense);

  els.financeTabs.innerHTML = "";
  const tabs = [
    { key: "semua", label: "Semua" },
    { key: "masuk", label: "Pemasukan" },
    { key: "keluar", label: "Pengeluaran" },
  ];
  tabs.forEach((t) => {
    const count = t.key === "semua" ? state.transactions.length : state.transactions.filter((x) => x.type === t.key).length;
    const btn = document.createElement("button");
    btn.className = "tab" + (state.financeTab === t.key ? " is-active" : "");
    btn.textContent = `${t.label} (${count})`;
    btn.addEventListener("click", () => { state.financeTab = t.key; renderKeuanganView(); });
    els.financeTabs.appendChild(btn);
  });

  let filtered = state.transactions;
  if (state.financeTab !== "semua") filtered = filtered.filter((t) => t.type === state.financeTab);
  filtered = filtered.slice().sort((a, b) => (b.date || "").localeCompare(a.date || ""));

  els.financeCount.textContent = `${filtered.length} transaksi`;

  const tbody = els.tableTransactions.querySelector("tbody");
  tbody.innerHTML = "";
  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="table-empty">Belum ada transaksi.</td></tr>`;
    return;
  }
  filtered.forEach((t) => {
    const isIncome = t.type === "masuk";
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${formatDate(t.date)}</td>
      <td>${escapeHtml(t.description)}</td>
      <td>${escapeHtml(t.category)}</td>
      <td><span class="tag ${isIncome ? "tag--selesai" : "tag--dibatalkan"}">${isIncome ? "Masuk" : "Keluar"}</span></td>
      <td style="color:${isIncome ? "var(--green)" : "var(--red)"};font-weight:600;">${isIncome ? "+" : "-"} ${formatRupiah(t.amount)}</td>
    `;
    tbody.appendChild(tr);
  });
}

// ------------------------------------------------------------
// Karyawan (Fase 1): dashboard ringkas, data karyawan, posisi
// ------------------------------------------------------------
function daysUntil(dateStr) {
  if (!dateStr) return null;
  const target = new Date(dateStr);
  const now = new Date();
  const diffMs = new Date(target.getFullYear(), target.getMonth(), target.getDate()) - new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round(diffMs / 86400000);
}

function positionLabel(positionId) {
  const p = state.positions.find((pos) => pos.id === positionId);
  return p ? p.name : "-";
}

function renderKaryawanView() {
  renderKaryawanDashboard();
  renderEmployeeFilterOptions();
  renderEmployeeTable();
  renderReviewListView();
  renderContractView();
  renderPayrollView();
  renderLaporanView();
}

function getCurrentPeriodValue() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function getEmployeesNeedingReview() {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 90);
  return state.employees
    .filter((e) => (e.employeeStatus || "Aktif") === "Aktif")
    .map((e) => ({ employee: e, latest: getLatestReviewForEmployee(e.id) }))
    .filter(({ latest }) => !latest || toJsDate(latest.createdAt) < cutoff);
}

function getAverageLatestReviewScore() {
  const latestReviews = state.employees.map((e) => getLatestReviewForEmployee(e.id)).filter(Boolean);
  if (latestReviews.length === 0) return null;
  return latestReviews.reduce((s, r) => s + Number(r.finalScore || 0), 0) / latestReviews.length;
}

function renderKaryawanDashboard() {
  const employees = state.employees;
  const active = employees.filter((e) => (e.employeeStatus || "Aktif") === "Aktif").length;

  const expiringSoon = employees
    .filter((e) => e.workStatus === "Kontrak" && e.contractEnd)
    .map((e) => ({ ...e, _daysLeft: daysUntil(e.contractEnd) }))
    .filter((e) => e._daysLeft !== null && e._daysLeft <= 30)
    .sort((a, b) => a._daysLeft - b._daysLeft);

  const needReview = getEmployeesNeedingReview();
  const avgScore = getAverageLatestReviewScore();
  const payrollThisMonth = state.payrolls.filter((p) => p.period === getCurrentPeriodValue()).reduce((s, p) => s + (p.netSalary || 0), 0);

  els.empStatTotal.textContent = employees.length;
  els.empStatActive.textContent = active;
  els.empStatExpiring.textContent = expiringSoon.length;
  els.empStatNeedReview.textContent = needReview.length;
  els.empStatAvgScore.textContent = avgScore === null ? "-" : `${avgScore.toFixed(2)} / 5`;
  els.empStatPayrollMonth.textContent = formatRupiah(payrollThisMonth);

  els.empContractAlertList.innerHTML = "";
  if (expiringSoon.length === 0) {
    els.empContractAlertList.innerHTML = `<li class="action-empty"><span>Tidak ada kontrak yang akan berakhir dalam 30 hari.</span></li>`;
  } else {
    expiringSoon.forEach((e) => {
      const urgencyClass = e._daysLeft <= 7 ? "tag--dibatalkan" : "tag--perlu_verifikasi";
      const li = document.createElement("li");
      li.innerHTML = `<span><strong>${escapeHtml(e.name)}</strong> — ${escapeHtml(positionLabel(e.positionId))} · berakhir ${formatDate(e.contractEnd)} <span class="tag ${urgencyClass}">${e._daysLeft} hari lagi</span></span>`;
      const btn = document.createElement("button");
      btn.className = "mini-btn";
      btn.textContent = "Review";
      btn.addEventListener("click", () => openContractReviewModal(e));
      li.appendChild(btn);
      els.empContractAlertList.appendChild(li);
    });
  }

  els.empReviewAlertList.innerHTML = "";
  if (needReview.length === 0) {
    els.empReviewAlertList.innerHTML = `<li class="action-empty"><span>Semua karyawan aktif sudah dinilai dalam 90 hari terakhir.</span></li>`;
  } else {
    needReview.forEach(({ employee, latest }) => {
      const li = document.createElement("li");
      const lastInfo = latest ? `Penilaian terakhir: ${formatDate(latest.createdAt)}` : "Belum pernah dinilai";
      li.innerHTML = `<span><strong>${escapeHtml(employee.name)}</strong> — ${escapeHtml(positionLabel(employee.positionId))} · ${lastInfo}</span>`;
      const btn = document.createElement("button");
      btn.className = "mini-btn";
      btn.textContent = "Nilai Sekarang";
      btn.addEventListener("click", () => openReviewModalForEmployee(employee));
      li.appendChild(btn);
      els.empReviewAlertList.appendChild(li);
    });
  }

  els.empRecentReviewsList.innerHTML = "";
  const recentReviews = state.performanceReviews.slice().sort((a, b) => toJsDate(b.createdAt) - toJsDate(a.createdAt)).slice(0, 5);
  if (recentReviews.length === 0) {
    els.empRecentReviewsList.innerHTML = `<li class="action-empty"><span>Belum ada penilaian kinerja.</span></li>`;
  } else {
    recentReviews.forEach((r) => {
      const li = document.createElement("li");
      li.innerHTML = `<span><strong>${escapeHtml(r.employeeName)}</strong> — ${escapeHtml(r.positionName || "-")} · <span class="tag ${categoryBadgeClass(r.category)}">${Number(r.finalScore).toFixed(2)} (${escapeHtml(r.category)})</span></span>`;
      els.empRecentReviewsList.appendChild(li);
    });
  }
}

function renderEmployeeFilterOptions() {
  const current = els.employeeFilterPosition.value;
  els.employeeFilterPosition.innerHTML = `<option value="">Semua posisi</option>` + state.positions.map((p) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join("");
  els.employeeFilterPosition.value = current;
}

function renderEmployeeTable() {
  const q = state.employeeSearch.trim().toLowerCase();
  let filtered = state.employees.filter((e) => (e.name || "").toLowerCase().includes(q) || (e.employeeId || "").toLowerCase().includes(q));
  if (state.employeeFilterPosition) filtered = filtered.filter((e) => e.positionId === state.employeeFilterPosition);
  if (state.employeeFilterWorkStatus) filtered = filtered.filter((e) => e.workStatus === state.employeeFilterWorkStatus);
  if (state.employeeFilterStatus) filtered = filtered.filter((e) => (e.employeeStatus || "Aktif") === state.employeeFilterStatus);

  const tbody = els.tableEmployees.querySelector("tbody");
  tbody.innerHTML = "";
  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="10" class="table-empty">Belum ada karyawan.</td></tr>`;
    return;
  }

  filtered
    .slice()
    .sort((a, b) => (a.name || "").localeCompare(b.name || ""))
    .forEach((e) => {
      const tr = document.createElement("tr");
      const initials = escapeHtml((e.name || "?").charAt(0).toUpperCase());
      const thumbHtml = `
        <div class="table-thumb-wrap">
          <span class="table-thumb-fallback">${initials}</span>
          ${e.photoUrl ? `<img src="${escapeHtml(e.photoUrl)}" alt="${escapeHtml(e.name)}" class="table-thumb-img" onerror="this.style.display='none'" />` : ""}
        </div>`;

      let contractInfo = `<span class="text-muted">-</span>`;
      if (e.workStatus === "Kontrak" && e.contractEnd) {
        const d = daysUntil(e.contractEnd);
        const cls = d < 0 ? "tag--dibatalkan" : d <= 7 ? "tag--dibatalkan" : d <= 30 ? "tag--perlu_verifikasi" : "tag--selesai";
        contractInfo = `<span class="tag ${cls}">${d < 0 ? "Berakhir" : d + " hari lagi"}</span>`;
      }

      const empStatus = e.employeeStatus || "Aktif";
      const statusTagClass = empStatus === "Aktif" ? "tag--selesai" : empStatus === "Resign" || empStatus === "Nonaktif" ? "tag--dibatalkan" : "tag--menunggu_pembayaran";

      tr.innerHTML = `
        <td>${thumbHtml}</td>
        <td><strong>${escapeHtml(e.name || "-")}</strong></td>
        <td>${escapeHtml(e.employeeId || "-")}</td>
        <td>${escapeHtml(positionLabel(e.positionId))}</td>
        <td>${formatDate(e.joinDate)}</td>
        <td>${escapeHtml(e.workStatus || "-")}</td>
        <td>${formatRupiah(e.baseSalary)}</td>
        <td>${contractInfo}</td>
        <td><span class="tag ${statusTagClass}">${escapeHtml(empStatus)}</span></td>
        <td></td>
      `;
      const actionTd = tr.querySelector("td:last-child");
      const editBtn = document.createElement("button");
      editBtn.className = "btn btn--ghost";
      editBtn.style.cssText = "padding:5px 10px;font-size:12px;margin-right:6px;";
      editBtn.textContent = "Edit";
      editBtn.addEventListener("click", () => openEmployeeModal(e));
      actionTd.appendChild(editBtn);

      const decisionBtn = document.createElement("button");
      decisionBtn.className = "btn btn--ghost";
      decisionBtn.style.cssText = "padding:5px 10px;font-size:12px;margin-right:6px;";
      decisionBtn.textContent = "Keputusan";
      decisionBtn.addEventListener("click", () => openDecisionModal(e));
      actionTd.appendChild(decisionBtn);

      if (empStatus === "Aktif") {
        const deactivateBtn = document.createElement("button");
        deactivateBtn.className = "btn btn--danger";
        deactivateBtn.style.cssText = "padding:5px 10px;font-size:12px;";
        deactivateBtn.textContent = "Nonaktifkan";
        deactivateBtn.addEventListener("click", async () => {
          if (confirm(`Nonaktifkan karyawan "${e.name}"? Data & riwayatnya tetap tersimpan.`)) {
            await updateEmployee(e.id, { employeeStatus: "Nonaktif" });
            showToast(`${e.name} dinonaktifkan.`);
          }
        });
        actionTd.appendChild(deactivateBtn);
      }
      tbody.appendChild(tr);
    });
}

function populateEmployeeFormDropdowns(excludeEmployeeId) {
  const currentPos = els.employeePositionSelect.value;
  els.employeePositionSelect.innerHTML =
    `<option value="">Pilih posisi</option>` +
    state.positions.map((p) => `<option value="${p.id}">${escapeHtml(p.name)}${p.department ? " — " + escapeHtml(p.department) : ""}</option>`).join("");
  els.employeePositionSelect.value = currentPos;

  const currentSup = els.employeeSupervisorSelect.value;
  els.employeeSupervisorSelect.innerHTML =
    `<option value="">- Tidak ada -</option>` +
    state.employees.filter((e) => e.id !== excludeEmployeeId).map((e) => `<option value="${e.id}">${escapeHtml(e.name)}</option>`).join("");
  els.employeeSupervisorSelect.value = currentSup;
}

function toggleEmployeeContractSection() {
  els.employeeContractSection.hidden = els.employeeWorkStatusSelect.value !== "Kontrak";
}

function renderEmployeePhotoPreview() {
  const box = els.employeePhotoPreview;
  const imgEl = box.querySelector("img");
  const fallbackEl = box.querySelector(".variant-photo-fallback");
  if (state.employeePhoto?.uploading) {
    imgEl.hidden = true;
    fallbackEl.hidden = false;
    fallbackEl.textContent = (state.employeePhoto.progress ?? 0) + "%";
  } else if (state.employeePhoto?.url) {
    imgEl.src = state.employeePhoto.url;
    imgEl.hidden = false;
    imgEl.onerror = () => { imgEl.hidden = true; fallbackEl.hidden = false; fallbackEl.textContent = "+"; };
    fallbackEl.hidden = true;
  } else {
    imgEl.hidden = true;
    fallbackEl.hidden = false;
    fallbackEl.textContent = "+";
  }
}

function resetEmployeeForm() {
  els.employeeForm.reset();
  state.editingEmployeeId = null;
  state.employeePhoto = null;
  els.employeeModalTitle.textContent = "Tambah karyawan";
  els.employeeSubmitBtn.textContent = "Simpan karyawan";
  els.employeeIdDisplay.value = "";
  renderEmployeePhotoPreview();
  populateEmployeeFormDropdowns();
  toggleEmployeeContractSection();
}

/** Buka modal karyawan. Tanpa argumen = tambah baru. Dengan argumen = edit, form terisi otomatis. */
function openEmployeeModal(employee) {
  resetEmployeeForm();
  if (employee) {
    state.editingEmployeeId = employee.id;
    els.employeeModalTitle.textContent = `Edit karyawan — ${employee.name}`;
    els.employeeSubmitBtn.textContent = "Simpan perubahan";
    els.employeeIdDisplay.value = employee.employeeId || "";

    const f = els.employeeForm.elements;
    f["name"].value = employee.name || "";
    f["gender"].value = employee.gender || "";
    f["birthPlace"].value = employee.birthPlace || "";
    f["birthDate"].value = employee.birthDate || "";
    f["phone"].value = employee.phone || "";
    f["email"].value = employee.email || "";
    f["address"].value = employee.address || "";
    f["joinDate"].value = employee.joinDate || "";
    f["workStatus"].value = employee.workStatus || "Tetap";
    f["employeeStatus"].value = employee.employeeStatus || "Aktif";
    f["contractStart"].value = employee.contractStart || "";
    f["contractEnd"].value = employee.contractEnd || "";
    f["contractNumber"].value = employee.contractNumber || "";
    f["contractNote"].value = employee.contractNote || "";
    f["baseSalary"].value = employee.baseSalary ?? "";
    f["salaryNote"].value = employee.salaryNote || "";

    populateEmployeeFormDropdowns(employee.id);
    f["positionId"].value = employee.positionId || "";
    f["supervisorId"].value = employee.supervisorId || "";

    if (employee.photoUrl) state.employeePhoto = { url: employee.photoUrl };
    renderEmployeePhotoPreview();
    toggleEmployeeContractSection();
  }
  els.employeeModal.hidden = false;
}

// ------------------------------------------------------------
// Penilaian Kinerja
// ------------------------------------------------------------
function renderReviewFilterOptions() {
  const current = els.reviewFilterPosition.value;
  els.reviewFilterPosition.innerHTML = `<option value="">Semua posisi</option>` + state.positions.map((p) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join("");
  els.reviewFilterPosition.value = current;
}

function renderReviewListView() {
  renderReviewFilterOptions();
  const q = state.reviewSearch.trim().toLowerCase();
  let filtered = state.performanceReviews.filter((r) => (r.employeeName || "").toLowerCase().includes(q) || (r.employeeCode || "").toLowerCase().includes(q));
  if (state.reviewFilterPosition) filtered = filtered.filter((r) => r.positionId === state.reviewFilterPosition);
  if (state.reviewFilterCategory) filtered = filtered.filter((r) => r.category === state.reviewFilterCategory);
  if (state.reviewFilterRecommendation) filtered = filtered.filter((r) => r.recommendation === state.reviewFilterRecommendation);
  filtered = filtered.slice().sort((a, b) => toJsDate(b.createdAt) - toJsDate(a.createdAt));

  const tbody = els.tableReviews.querySelector("tbody");
  tbody.innerHTML = "";
  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="table-empty">Belum ada penilaian kinerja.</td></tr>`;
    return;
  }
  filtered.forEach((r) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><strong>${escapeHtml(r.employeeName)}</strong></td>
      <td>${escapeHtml(r.positionName || "-")}</td>
      <td>${formatDate(r.periodStart)} – ${formatDate(r.periodEnd)}</td>
      <td>${Number(r.finalScore || 0).toFixed(2)} / 5</td>
      <td><span class="tag ${categoryBadgeClass(r.category)}">${escapeHtml(r.category)}</span></td>
      <td>${escapeHtml(r.recommendation || "-")}</td>
      <td>${formatDate(r.createdAt)}</td>
      <td></td>
    `;
    const actionTd = tr.querySelector("td:last-child");
    const viewBtn = document.createElement("button");
    viewBtn.className = "btn btn--ghost";
    viewBtn.style.cssText = "padding:5px 10px;font-size:12px;margin-right:6px;";
    viewBtn.textContent = "Lihat";
    viewBtn.addEventListener("click", () => openReviewDetailModal(r));
    const editBtn = document.createElement("button");
    editBtn.className = "btn btn--ghost";
    editBtn.style.cssText = "padding:5px 10px;font-size:12px;";
    editBtn.textContent = "Edit";
    editBtn.addEventListener("click", () => openReviewModal(r));
    actionTd.appendChild(viewBtn);
    actionTd.appendChild(editBtn);
    tbody.appendChild(tr);
  });
}

/** Bangun grup tombol rating 1-5 untuk satu daftar item (dipakai untuk Penilaian Umum & KPI). */
function renderRatingGroup(container, items, scoreMap, onChange) {
  container.innerHTML = "";
  items.forEach((item) => {
    const row = document.createElement("div");
    row.className = "rating-item";
    row.innerHTML = `
      <span class="rating-item-label">${escapeHtml(item)}</span>
      <div class="rating-buttons">
        ${[1, 2, 3, 4, 5].map((n) => `<button type="button" class="rating-btn ${scoreMap[item] === n ? "is-selected" : ""}" data-score="${n}">${n}</button>`).join("")}
      </div>
    `;
    row.querySelectorAll(".rating-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        scoreMap[item] = Number(btn.dataset.score);
        row.querySelectorAll(".rating-btn").forEach((b) => b.classList.toggle("is-selected", Number(b.dataset.score) === scoreMap[item]));
        onChange();
      });
    });
    container.appendChild(row);
  });
}

function populateReviewEmployeeSelect() {
  els.reviewEmployeeSelect.innerHTML =
    `<option value="">Pilih karyawan</option>` +
    state.employees.map((e) => `<option value="${e.id}">${escapeHtml(e.name)} - ${escapeHtml(positionLabel(e.positionId))}</option>`).join("");
}

function computeReviewScores() {
  const generalValues = Object.values(state.reviewGeneralScores);
  const generalScore = generalValues.length ? generalValues.reduce((s, v) => s + v, 0) / generalValues.length : 0;
  const kpiValues = Object.values(state.reviewKpiScores);
  const hasKpi = kpiValues.length > 0;
  const kpiScore = hasKpi ? kpiValues.reduce((s, v) => s + v, 0) / kpiValues.length : null;
  const finalScore = hasKpi ? generalScore * 0.4 + kpiScore * 0.6 : generalScore;
  return { generalScore, kpiScore, finalScore, category: categoryFromScore(finalScore), hasKpi };
}

function updateReviewScores() {
  const { generalScore, kpiScore, finalScore, category, hasKpi } = computeReviewScores();
  els.reviewGeneralScoreDisplay.textContent = `${generalScore.toFixed(2)} / 5`;
  els.reviewKpiScoreDisplay.textContent = hasKpi ? `${kpiScore.toFixed(2)} / 5` : "-";
  els.reviewFinalScoreDisplay.textContent = `${finalScore.toFixed(2)} / 5`;
  els.reviewCategoryBadge.innerHTML = `<span class="tag ${categoryBadgeClass(category)}">${category}</span>`;
}

/** Saat karyawan dipilih: tampilkan info otomatis + siapkan KPI sesuai posisinya. */
function handleReviewEmployeeChange() {
  const employee = state.employees.find((e) => e.id === els.reviewEmployeeSelect.value);

  if (!employee) {
    els.reviewEmployeeInfo.hidden = true;
    els.reviewKpiBlock.hidden = true;
    els.reviewNoKpiHint.hidden = true;
    els.reviewKpiScoreRow.hidden = true;
    state.reviewKpiScores = {};
    renderRatingGroup(els.reviewKpiItems, [], {}, updateReviewScores);
    updateReviewScores();
    return;
  }

  const positionName = positionLabel(employee.positionId);
  const contractInfo = employee.workStatus === "Kontrak" && employee.contractEnd ? `s/d ${formatDate(employee.contractEnd)}` : "-";

  els.reviewEmployeeInfo.hidden = false;
  els.reviewEmployeeInfo.innerHTML = `
    <div class="od-action-row" style="justify-content:space-between;flex-wrap:wrap;gap:14px;">
      <div><span class="text-muted" style="font-size:11px;">Nama</span><br/><strong>${escapeHtml(employee.name)}</strong></div>
      <div><span class="text-muted" style="font-size:11px;">ID Karyawan</span><br/><strong>${escapeHtml(employee.employeeId || "-")}</strong></div>
      <div><span class="text-muted" style="font-size:11px;">Posisi</span><br/><strong>${escapeHtml(positionName)}</strong></div>
      <div><span class="text-muted" style="font-size:11px;">Tanggal Masuk</span><br/><strong>${formatDate(employee.joinDate)}</strong></div>
      <div><span class="text-muted" style="font-size:11px;">Status Kerja</span><br/><strong>${escapeHtml(employee.workStatus || "-")}</strong></div>
      <div><span class="text-muted" style="font-size:11px;">Status Kontrak</span><br/><strong>${contractInfo}</strong></div>
      <div><span class="text-muted" style="font-size:11px;">Gaji Pokok</span><br/><strong>${formatRupiah(employee.baseSalary)}</strong></div>
    </div>
  `;

  const kpiItems = getKpiItemsForPosition(positionName);
  if (kpiItems.length > 0) {
    els.reviewKpiBlock.hidden = false;
    els.reviewNoKpiHint.hidden = true;
    els.reviewKpiScoreRow.hidden = false;
    renderRatingGroup(els.reviewKpiItems, kpiItems, state.reviewKpiScores, updateReviewScores);
  } else {
    els.reviewKpiBlock.hidden = true;
    els.reviewNoKpiHint.hidden = false;
    els.reviewKpiScoreRow.hidden = true;
    state.reviewKpiScores = {};
  }
  updateReviewScores();
}

/** Isi otomatis Tanggal Selesai berdasarkan Jenis Periode + Tanggal Mulai (kecuali Custom). */
function handlePeriodTypeChange() {
  const type = els.reviewPeriodType.value;
  const start = els.reviewPeriodStart.value;
  if (!start || type === "Custom") return;
  const d = new Date(start);
  if (type === "Bulanan") d.setMonth(d.getMonth() + 1);
  else if (type === "3 Bulan") d.setMonth(d.getMonth() + 3);
  else if (type === "6 Bulan") d.setMonth(d.getMonth() + 6);
  else if (type === "Tahunan") d.setFullYear(d.getFullYear() + 1);
  d.setDate(d.getDate() - 1);
  els.reviewPeriodEnd.value = toDateInputValue(d);
}

function resetReviewForm() {
  els.reviewForm.reset();
  state.editingReviewId = null;
  state.reviewGeneralScores = {};
  state.reviewKpiScores = {};
  els.reviewModalTitle.textContent = "Buat penilaian";
  els.reviewSubmitBtn.textContent = "Simpan Penilaian";
  els.reviewEmployeeSelect.disabled = false;
  populateReviewEmployeeSelect();
  renderRatingGroup(els.reviewGeneralItems, GENERAL_REVIEW_ITEMS, state.reviewGeneralScores, updateReviewScores);
  handleReviewEmployeeChange();
}

/** Buka modal penilaian. Tanpa argumen = buat baru. Dengan argumen = edit, form terisi otomatis. */
/** Buka form Buat Penilaian dengan karyawan sudah terpilih (dipakai tombol "Nilai Sekarang" di dashboard). */
function openReviewModalForEmployee(employee) {
  resetReviewForm();
  els.reviewEmployeeSelect.value = employee.id;
  handleReviewEmployeeChange();
  els.reviewModal.hidden = false;
}

function openReviewModal(review) {
  resetReviewForm();
  if (review) {
    state.editingReviewId = review.id;
    els.reviewModalTitle.textContent = `Edit penilaian — ${review.employeeName}`;
    els.reviewSubmitBtn.textContent = "Simpan perubahan";
    els.reviewEmployeeSelect.value = review.employeeId;
    els.reviewEmployeeSelect.disabled = true; // karyawan yang dinilai tidak diganti saat edit
    handleReviewEmployeeChange();

    els.reviewPeriodType.value = review.periodType || "Bulanan";
    els.reviewPeriodStart.value = review.periodStart || "";
    els.reviewPeriodEnd.value = review.periodEnd || "";

    state.reviewGeneralScores = { ...(review.generalScores || {}) };
    state.reviewKpiScores = { ...(review.kpiScores || {}) };
    renderRatingGroup(els.reviewGeneralItems, GENERAL_REVIEW_ITEMS, state.reviewGeneralScores, updateReviewScores);
    const kpiItems = getKpiItemsForPosition(review.positionName);
    if (kpiItems.length > 0) renderRatingGroup(els.reviewKpiItems, kpiItems, state.reviewKpiScores, updateReviewScores);

    const f = els.reviewForm.elements;
    f["strengths"].value = review.strengths || "";
    f["improvements"].value = review.improvements || "";
    f["managerNotes"].value = review.managerNotes || "";
    f["nextTargets"].value = review.nextTargets || "";
    f["recommendation"].value = review.recommendation || "Pertahankan";
    updateReviewScores();
  }
  els.reviewModal.hidden = false;
}

/** Tampilan detail penilaian read-only ("Lihat"), dengan tombol lanjut ke Edit. */
function openReviewDetailModal(review) {
  const generalRows = GENERAL_REVIEW_ITEMS.map((item) => `<tr><td>${escapeHtml(item)}</td><td style="text-align:right;">${review.generalScores?.[item] ?? "-"}</td></tr>`).join("");
  const kpiItems = getKpiItemsForPosition(review.positionName);
  const kpiRows = kpiItems.map((item) => `<tr><td>${escapeHtml(item)}</td><td style="text-align:right;">${review.kpiScores?.[item] ?? "-"}</td></tr>`).join("");

  els.reviewDetailBody.innerHTML = `
    <div class="od-head">
      <div>
        <h2>${escapeHtml(review.employeeName)}</h2>
        <p class="view-sub" style="margin:0;">${escapeHtml(review.positionName || "-")} · ${formatDate(review.periodStart)} – ${formatDate(review.periodEnd)}</p>
      </div>
    </div>

    <div class="od-cols">
      <div class="od-block">
        <h3>Penilaian Umum</h3>
        <table class="table table--compact"><tbody>${generalRows}</tbody></table>
      </div>
      <div class="od-block">
        <h3>KPI Posisi</h3>
        ${kpiItems.length ? `<table class="table table--compact"><tbody>${kpiRows}</tbody></table>` : `<p class="text-muted">Tidak ada KPI khusus untuk posisi ini.</p>`}
      </div>
    </div>

    <div class="od-action-block">
      <div class="od-action-row" style="justify-content:space-between;"><span>Nilai Umum</span><strong>${Number(review.generalScore || 0).toFixed(2)} / 5</strong></div>
      ${review.kpiScore !== null && review.kpiScore !== undefined ? `<div class="od-action-row" style="justify-content:space-between;"><span>Nilai KPI</span><strong>${Number(review.kpiScore).toFixed(2)} / 5</strong></div>` : ""}
      <div class="od-action-row" style="justify-content:space-between;font-weight:700;font-size:15px;margin-top:6px;"><span>Nilai Akhir</span><strong>${Number(review.finalScore || 0).toFixed(2)} / 5</strong></div>
      <div style="margin-top:8px;"><span class="tag ${categoryBadgeClass(review.category)}">${escapeHtml(review.category)}</span></div>
    </div>

    <div class="od-block" style="margin-top:16px;"><h3>Kelebihan</h3><p>${escapeHtml(review.strengths || "-")}</p></div>
    <div class="od-block"><h3>Yang Perlu Diperbaiki</h3><p>${escapeHtml(review.improvements || "-")}</p></div>
    <div class="od-block"><h3>Catatan Manager</h3><p>${escapeHtml(review.managerNotes || "-")}</p></div>
    <div class="od-block"><h3>Target Berikutnya</h3><p>${escapeHtml(review.nextTargets || "-")}</p></div>
    <div class="od-block"><h3>Rekomendasi</h3><p><strong>${escapeHtml(review.recommendation || "-")}</strong></p></div>

    <div class="form-actions">
      <button type="button" class="btn btn--primary" id="review-detail-edit-btn">Edit Penilaian</button>
    </div>
  `;
  els.reviewDetailBody.querySelector("#review-detail-edit-btn").addEventListener("click", () => {
    els.reviewDetailModal.hidden = true;
    openReviewModal(review);
  });
  els.reviewDetailModal.hidden = false;
}

// ------------------------------------------------------------
// Kontrak
// ------------------------------------------------------------
/** Status kontrak: turunan tanggal, kecuali ada keputusan eksplisit "Tidak Diperpanjang". */
function getContractStatus(employee) {
  if (employee.contractDecision === "tidak_diperpanjang") return "Tidak Diperpanjang";
  if (!employee.contractEnd) return "Aktif";
  const days = daysUntil(employee.contractEnd);
  if (days < 0) return "Berakhir";
  if (days <= 30) return "Akan Berakhir";
  if (employee.contractDecision === "diperpanjang") return "Diperpanjang";
  return "Aktif";
}

function contractStatusBadgeClass(status) {
  switch (status) {
    case "Aktif":
    case "Diperpanjang":
      return "tag--selesai";
    case "Akan Berakhir":
      return "tag--perlu_verifikasi";
    default:
      return "tag--dibatalkan"; // Berakhir / Tidak Diperpanjang
  }
}

function getLatestReviewForEmployee(employeeId) {
  const reviews = state.performanceReviews.filter((r) => r.employeeId === employeeId);
  if (reviews.length === 0) return null;
  return reviews.slice().sort((a, b) => toJsDate(b.createdAt) - toJsDate(a.createdAt))[0];
}

function renderContractView() {
  const contractEmployees = state.employees.filter((e) => e.workStatus === "Kontrak" && e.contractEnd);
  const tbody = els.tableContracts.querySelector("tbody");
  tbody.innerHTML = "";
  if (contractEmployees.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" class="table-empty">Belum ada karyawan berstatus kontrak.</td></tr>`;
    return;
  }

  contractEmployees
    .slice()
    .sort((a, b) => daysUntil(a.contractEnd) - daysUntil(b.contractEnd))
    .forEach((e) => {
      const days = daysUntil(e.contractEnd);
      const status = getContractStatus(e);
      const latestReview = getLatestReviewForEmployee(e.id);
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><strong>${escapeHtml(e.name)}</strong></td>
        <td>${escapeHtml(positionLabel(e.positionId))}</td>
        <td>${formatDate(e.contractStart)}</td>
        <td>${formatDate(e.contractEnd)}</td>
        <td>${days < 0 ? "Berakhir" : days + " hari"}</td>
        <td><span class="tag ${contractStatusBadgeClass(status)}">${escapeHtml(status)}</span></td>
        <td>${latestReview ? Number(latestReview.finalScore).toFixed(2) + " / 5" : "-"}</td>
        <td>${latestReview ? escapeHtml(latestReview.recommendation) : "-"}</td>
        <td></td>
      `;
      const actionTd = tr.querySelector("td:last-child");
      const reviewBtn = document.createElement("button");
      reviewBtn.className = "mini-btn";
      reviewBtn.textContent = "Review";
      reviewBtn.addEventListener("click", () => openContractReviewModal(e));
      actionTd.appendChild(reviewBtn);
      tbody.appendChild(tr);
    });
}

function openContractReviewModal(employee) {
  renderContractReviewBody(employee);
  els.contractReviewModal.hidden = false;
}

function renderContractReviewBody(employee) {
  const latestReview = getLatestReviewForEmployee(employee.id);
  const days = daysUntil(employee.contractEnd);
  const status = getContractStatus(employee);

  const reviewInfoHtml = latestReview
    ? `
      <div class="od-block">
        <h3>Penilaian terakhir</h3>
        <p><strong>${Number(latestReview.finalScore).toFixed(2)} / 5</strong> — <span class="tag ${categoryBadgeClass(latestReview.category)}">${escapeHtml(latestReview.category)}</span></p>
        <p class="text-muted">Rekomendasi: <strong>${escapeHtml(latestReview.recommendation)}</strong></p>
        ${latestReview.managerNotes ? `<p class="text-muted">Catatan: ${escapeHtml(latestReview.managerNotes)}</p>` : ""}
      </div>`
    : `<div class="od-block"><h3>Penilaian terakhir</h3><p class="text-muted">Belum ada penilaian kinerja untuk karyawan ini.</p></div>`;

  const historyHtml = (employee.contractHistory || []).length
    ? `<div class="od-history"><strong>Riwayat kontrak</strong><ul>${employee.contractHistory
        .slice()
        .reverse()
        .map((h) => `<li>${formatDate(h.startDate)} – ${formatDate(h.endDate)} · ${escapeHtml(h.decision || "-")}${h.decisionNote ? " — " + escapeHtml(h.decisionNote) : ""}</li>`)
        .join("")}</ul></div>`
    : "";

  els.contractReviewBody.innerHTML = `
    <div class="od-head">
      <div>
        <h2>${escapeHtml(employee.name)}</h2>
        <span class="tag ${contractStatusBadgeClass(status)}">${escapeHtml(status)}</span>
      </div>
    </div>

    <div class="od-cols">
      <div class="od-block">
        <h3>Data kontrak</h3>
        <p><strong>${escapeHtml(positionLabel(employee.positionId))}</strong></p>
        <p>Mulai: ${formatDate(employee.contractStart)}</p>
        <p>Berakhir: ${formatDate(employee.contractEnd)} (${days < 0 ? "sudah berakhir" : days + " hari lagi"})</p>
        <p>Gaji sekarang: ${formatRupiah(employee.baseSalary)}</p>
      </div>
      ${reviewInfoHtml}
    </div>

    <div class="od-action-block">
      <h3 style="margin:0 0 10px;font-size:13px;">Keputusan</h3>
      <div class="od-action-row">
        <button type="button" class="btn btn--primary" data-decision="perpanjang">Perpanjang Kontrak</button>
        <button type="button" class="btn btn--ghost" data-decision="tidak_perpanjang">Tidak Perpanjang</button>
        <button type="button" class="btn btn--ghost" data-decision="evaluasi_lagi">Evaluasi Lagi</button>
      </div>
      <div id="contract-decision-form"></div>
    </div>

    ${historyHtml}
  `;

  els.contractReviewBody.querySelectorAll("[data-decision]").forEach((btn) => {
    btn.addEventListener("click", () => renderContractDecisionForm(employee, btn.dataset.decision));
  });
}

function renderContractDecisionForm(employee, decision) {
  const container = document.getElementById("contract-decision-form");

  if (decision === "evaluasi_lagi") {
    container.innerHTML = "";
    showToast("Baik — karyawan ini akan dievaluasi lagi nanti. Tidak ada perubahan kontrak.");
    return;
  }

  if (decision === "perpanjang") {
    container.innerHTML = `
      <div class="form-grid" style="margin-top:14px;">
        <label class="field">
          <span>Durasi</span>
          <select id="cd-duration">
            <option value="3">3 Bulan</option>
            <option value="6">6 Bulan</option>
            <option value="12">12 Bulan</option>
            <option value="custom">Custom</option>
          </select>
        </label>
        <label class="field"><span>Tanggal Mulai Baru</span><input type="date" id="cd-new-start" value="${employee.contractEnd || ""}" /></label>
        <label class="field"><span>Tanggal Berakhir Baru</span><input type="date" id="cd-new-end" /></label>
        <label class="field field--wide"><span>Catatan</span><textarea id="cd-note" rows="2"></textarea></label>
      </div>
      <button type="button" class="btn btn--primary" id="cd-confirm-btn" style="margin-top:10px;">Konfirmasi Perpanjangan</button>
    `;
    const durationSelect = document.getElementById("cd-duration");
    const startInput = document.getElementById("cd-new-start");
    const endInput = document.getElementById("cd-new-end");
    const recalcEnd = () => {
      if (durationSelect.value === "custom" || !startInput.value) return;
      const d = new Date(startInput.value);
      d.setMonth(d.getMonth() + Number(durationSelect.value));
      d.setDate(d.getDate() - 1);
      endInput.value = toDateInputValue(d);
    };
    durationSelect.addEventListener("change", recalcEnd);
    startInput.addEventListener("change", recalcEnd);
    recalcEnd();

    document.getElementById("cd-confirm-btn").addEventListener("click", async () => {
      const newStart = startInput.value;
      const newEnd = endInput.value;
      if (!newStart || !newEnd) { showToast("Tanggal mulai dan berakhir wajib diisi."); return; }
      if (new Date(newEnd) < new Date(newStart)) { showToast("Tanggal berakhir tidak boleh sebelum tanggal mulai."); return; }

      const historyEntry = {
        startDate: employee.contractStart || "",
        endDate: employee.contractEnd || "",
        contractNumber: employee.contractNumber || "",
        note: employee.contractNote || "",
        decision: "Diperpanjang",
        decisionNote: document.getElementById("cd-note").value.trim(),
        decidedAt: new Date().toISOString(),
        decidedBy: authInstance?.currentUser?.email || "admin",
      };
      await updateEmployee(employee.id, {
        contractStart: newStart,
        contractEnd: newEnd,
        contractDecision: "diperpanjang",
        employeeStatus: "Aktif",
        contractHistory: [...(employee.contractHistory || []), historyEntry],
      });
      els.contractReviewModal.hidden = true;
      showToast(`Kontrak ${employee.name} diperpanjang sampai ${formatDate(newEnd)}.`);
    });
  }

  if (decision === "tidak_perpanjang") {
    container.innerHTML = `
      <div class="form-grid" style="margin-top:14px;">
        <label class="field"><span>Tanggal Berakhir</span><input type="date" id="cd-end-date" value="${employee.contractEnd || ""}" /></label>
        <label class="field field--wide"><span>Alasan *</span><input type="text" id="cd-reason" required /></label>
        <label class="field field--wide"><span>Catatan</span><textarea id="cd-note2" rows="2"></textarea></label>
      </div>
      <button type="button" class="btn btn--danger" id="cd-confirm-btn2" style="margin-top:10px;">Konfirmasi Tidak Perpanjang</button>
    `;
    document.getElementById("cd-confirm-btn2").addEventListener("click", async () => {
      const reason = document.getElementById("cd-reason").value.trim();
      if (!reason) { showToast("Alasan wajib diisi."); return; }
      const noteVal = document.getElementById("cd-note2").value.trim();
      const endDate = document.getElementById("cd-end-date").value || employee.contractEnd;

      const historyEntry = {
        startDate: employee.contractStart || "",
        endDate,
        contractNumber: employee.contractNumber || "",
        note: employee.contractNote || "",
        decision: "Tidak Diperpanjang",
        decisionNote: noteVal ? `${reason} — ${noteVal}` : reason,
        decidedAt: new Date().toISOString(),
        decidedBy: authInstance?.currentUser?.email || "admin",
      };
      await updateEmployee(employee.id, {
        contractEnd: endDate,
        contractDecision: "tidak_diperpanjang",
        contractEndReason: reason,
        contractHistory: [...(employee.contractHistory || []), historyEntry],
      });
      els.contractReviewModal.hidden = true;
      showToast(`Keputusan tidak memperpanjang kontrak ${employee.name} disimpan.`);
    });
  }
}

// ------------------------------------------------------------
// Keputusan Karyawan: Naik Gaji, Promosi/Pindah Posisi, Timeline
// ------------------------------------------------------------
/** Gabungkan seluruh riwayat penting karyawan (gaji, posisi, kontrak, penilaian) jadi satu timeline terurut. */
function buildEmployeeTimeline(employee) {
  const events = [];
  if (employee.joinDate) {
    events.push({ date: employee.joinDate, text: `Mulai bekerja sebagai ${positionLabel(employee.positionId)}` });
  }
  (employee.salaryHistory || []).forEach((h) => {
    events.push({ date: h.date, text: `Gaji berubah ${formatRupiah(h.oldSalary)} → ${formatRupiah(h.newSalary)}${h.reason ? " — " + h.reason : ""}` });
  });
  (employee.positionHistory || []).forEach((h) => {
    events.push({ date: h.date, text: `Posisi berubah ${escapeHtml(h.oldPositionName)} → ${escapeHtml(h.newPositionName)}${h.note ? " — " + h.note : ""}` });
  });
  (employee.contractHistory || []).forEach((h) => {
    events.push({ date: h.decidedAt, text: `Kontrak: ${h.decision}${h.decisionNote ? " — " + h.decisionNote : ""}` });
  });
  state.performanceReviews
    .filter((r) => r.employeeId === employee.id)
    .forEach((r) => {
      events.push({ date: r.createdAt, text: `Penilaian kinerja: ${Number(r.finalScore).toFixed(2)}/5 (${r.category}) — rekomendasi ${r.recommendation}` });
    });
  return events.filter((ev) => ev.date).sort((a, b) => toJsDate(b.date) - toJsDate(a.date));
}

function renderEmployeeTimeline(employee) {
  const events = buildEmployeeTimeline(employee);
  if (events.length === 0) return `<p class="text-muted">Belum ada riwayat aktivitas.</p>`;
  return `<ul class="od-items">${events.map((ev) => `<li><span>${formatDate(ev.date)}</span><span>${escapeHtml(ev.text)}</span></li>`).join("")}</ul>`;
}

function openDecisionModal(employee) {
  renderDecisionBody(employee);
  els.decisionModal.hidden = false;
}

function renderDecisionBody(employee) {
  els.decisionBody.innerHTML = `
    <div class="od-head">
      <div>
        <h2>${escapeHtml(employee.name)}</h2>
        <p class="view-sub" style="margin:0;">${escapeHtml(positionLabel(employee.positionId))} · Gaji sekarang: ${formatRupiah(employee.baseSalary)}</p>
      </div>
    </div>

    <div class="od-action-block">
      <h3 style="margin:0 0 10px;font-size:13px;">Keputusan</h3>
      <div class="od-action-row">
        <button type="button" class="btn btn--primary" data-emp-decision="naik_gaji">Naik Gaji</button>
        <button type="button" class="btn btn--ghost" data-emp-decision="pindah_posisi">Promosi / Pindah Posisi</button>
      </div>
      <div id="emp-decision-form"></div>
    </div>

    <div class="od-history" style="margin-top:18px;">
      <strong>Riwayat / Timeline</strong>
      <div style="margin-top:8px;">${renderEmployeeTimeline(employee)}</div>
    </div>
  `;

  els.decisionBody.querySelectorAll("[data-emp-decision]").forEach((btn) => {
    btn.addEventListener("click", () => renderEmployeeDecisionForm(employee, btn.dataset.empDecision));
  });
}

function renderEmployeeDecisionForm(employee, decision) {
  const container = document.getElementById("emp-decision-form");

  if (decision === "naik_gaji") {
    container.innerHTML = `
      <div class="form-grid" style="margin-top:14px;">
        <label class="field"><span>Gaji Sekarang</span><input type="text" value="${formatRupiah(employee.baseSalary)}" disabled /></label>
        <label class="field"><span>Gaji Baru (Rp) *</span><input type="number" min="0" id="ed-new-salary" /></label>
        <label class="field"><span>Efektif Mulai *</span><input type="date" id="ed-effective-date" value="${toDateInputValue(new Date())}" /></label>
        <label class="field field--wide"><span>Alasan *</span><textarea id="ed-reason" rows="2"></textarea></label>
      </div>
      <button type="button" class="btn btn--primary" id="ed-confirm-btn" style="margin-top:10px;">Simpan Keputusan</button>
    `;
    document.getElementById("ed-confirm-btn").addEventListener("click", async () => {
      const newSalary = Number(document.getElementById("ed-new-salary").value);
      const effectiveDate = document.getElementById("ed-effective-date").value;
      const reason = document.getElementById("ed-reason").value.trim();
      if (!newSalary || newSalary <= 0) { showToast("Gaji baru wajib diisi dan lebih dari 0."); return; }
      if (!effectiveDate) { showToast("Tanggal efektif wajib diisi."); return; }
      if (!reason) { showToast("Alasan wajib diisi."); return; }

      const historyEntry = {
        date: effectiveDate,
        oldSalary: employee.baseSalary || 0,
        newSalary,
        reason,
        changedBy: authInstance?.currentUser?.email || "admin",
      };
      await updateEmployee(employee.id, {
        baseSalary: newSalary,
        salaryHistory: [...(employee.salaryHistory || []), historyEntry],
      });
      els.decisionModal.hidden = true;
      showToast(`Gaji ${employee.name} diperbarui menjadi ${formatRupiah(newSalary)}.`);
    });
  }

  if (decision === "pindah_posisi") {
    const positionOptions = state.positions
      .filter((p) => p.id !== employee.positionId)
      .map((p) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`)
      .join("");
    container.innerHTML = `
      <div class="form-grid" style="margin-top:14px;">
        <label class="field"><span>Posisi Lama</span><input type="text" value="${escapeHtml(positionLabel(employee.positionId))}" disabled /></label>
        <label class="field">
          <span>Posisi Baru *</span>
          <select id="ed-new-position"><option value="">Pilih posisi</option>${positionOptions}</select>
        </label>
        <label class="field"><span>Tanggal Efektif *</span><input type="date" id="ed-position-date" value="${toDateInputValue(new Date())}" /></label>
        <label class="field field--wide"><span>Catatan</span><textarea id="ed-position-note" rows="2"></textarea></label>
      </div>
      <button type="button" class="btn btn--primary" id="ed-confirm-btn2" style="margin-top:10px;">Simpan Keputusan</button>
    `;
    document.getElementById("ed-confirm-btn2").addEventListener("click", async () => {
      const newPositionId = document.getElementById("ed-new-position").value;
      const effectiveDate = document.getElementById("ed-position-date").value;
      const note = document.getElementById("ed-position-note").value.trim();
      if (!newPositionId) { showToast("Posisi baru wajib dipilih."); return; }
      if (!effectiveDate) { showToast("Tanggal efektif wajib diisi."); return; }

      const historyEntry = {
        date: effectiveDate,
        oldPositionId: employee.positionId || "",
        oldPositionName: positionLabel(employee.positionId),
        newPositionId,
        newPositionName: positionLabel(newPositionId),
        note,
        changedBy: authInstance?.currentUser?.email || "admin",
      };
      await updateEmployee(employee.id, {
        positionId: newPositionId,
        positionHistory: [...(employee.positionHistory || []), historyEntry],
      });
      els.decisionModal.hidden = true;
      showToast(`Posisi ${employee.name} diperbarui menjadi ${positionLabel(newPositionId)}.`);
    });
  }
}

// ------------------------------------------------------------
// Payroll / Gaji
// ------------------------------------------------------------
function renderPayrollView() {
  let filtered = state.payrolls.map((p) => ({ ...p, status: normalizePayrollStatus(p.status) }));
  if (state.payrollFilterPeriod) filtered = filtered.filter((p) => p.period === state.payrollFilterPeriod);
  if (state.payrollFilterStatus) filtered = filtered.filter((p) => p.status === state.payrollFilterStatus);
  filtered.sort((a, b) => (b.period || "").localeCompare(a.period || "") || (a.employeeName || "").localeCompare(b.employeeName || ""));

  const tbody = els.tablePayrolls.querySelector("tbody");
  tbody.innerHTML = "";
  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="table-empty"><p>${state.payrolls.length ? "Tidak ada payroll sesuai filter." : "Belum ada data payroll."}</p><button type="button" class="btn btn--primary">${state.payrolls.length ? "+ Buat Payroll" : "+ Buat Payroll Pertama"}</button></td></tr>`;
    tbody.querySelector("button").addEventListener("click", () => openPayrollModal());
    return;
  }
  filtered.forEach((p) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><strong>${escapeHtml(p.employeeName)}</strong></td>
      <td>${escapeHtml(p.positionName || "-")}</td>
      <td>${formatPeriodLabel(p.period)}</td>
      <td>${formatRupiah(p.totalIncome)}</td>
      <td>${formatRupiah(p.totalDeduction)}</td>
      <td><strong>${formatRupiah(p.netSalary)}</strong></td>
      <td><span class="tag ${payrollStatusBadgeClass(p.status)}">${escapeHtml(p.status)}</span></td>
      <td></td>
    `;
    const actionTd = tr.querySelector("td:last-child");
    const editBtn = document.createElement("button");
    editBtn.className = "mini-btn";
    editBtn.textContent = "Edit";
    editBtn.addEventListener("click", () => openPayrollModal(p));
    actionTd.className = "payroll-actions";
    if (p.status !== "Dibayar") actionTd.appendChild(editBtn);
    const detailBtn = document.createElement("button");
    detailBtn.className = "mini-btn";
    detailBtn.textContent = p.status === "Dibayar" ? "Lihat" : "Lihat Detail";
    detailBtn.addEventListener("click", () => openPayrollModal(p, true));
    actionTd.appendChild(detailBtn);

    if (p.status === "Dibayar") {
      const slipBtn = document.createElement("button");
      slipBtn.className = "mini-btn mini-btn--outline";
      slipBtn.textContent = "Slip Gaji";
      slipBtn.addEventListener("click", () => openSlipModal(p));
      actionTd.appendChild(slipBtn);
    }
    tbody.appendChild(tr);
  });
}

function populatePayrollEmployeeSelect() {
  els.payrollEmployeeSelect.innerHTML =
    `<option value="">Pilih karyawan</option>` +
    state.employees
      .filter((e) => (e.employeeStatus || "Aktif") === "Aktif")
      .map((e) => `<option value="${e.id}">${escapeHtml(e.name)} - ${escapeHtml(positionLabel(e.positionId))}</option>`)
      .join("");
}

function renderDeductionRows() {
  const container = els.payrollDeductionsList;
  container.innerHTML = "";
  els.payrollDeductionsEmptyHint.hidden = state.payrollDeductionRows.length > 0;
  state.payrollDeductionRows.forEach((row, i) => {
    const div = document.createElement("div");
    div.className = "deduction-row";
    div.innerHTML = `
      <select data-field="type" class="stock-input" style="flex:1.4;min-width:150px;">
        ${DEDUCTION_TYPES.map((t) => `<option value="${t}" ${row.type === t ? "selected" : ""}>${t}</option>`).join("")}
      </select>
      <input type="date" data-field="date" class="stock-input" value="${row.date || ""}" style="width:140px;" />
      <input type="text" data-field="description" class="stock-input" placeholder="Keterangan" value="${escapeHtml(row.description || "")}" style="flex:1.6;min-width:150px;" />
      <input type="number" min="0" data-field="amount" class="stock-input" placeholder="Nominal" value="${row.amount || ""}" style="width:120px;" />
      <button type="button" class="btn btn--ghost" style="padding:5px 9px;font-size:12px;" aria-label="Hapus potongan">&times;</button>
    `;
    div.querySelectorAll("[data-field]").forEach((input) => {
      input.addEventListener("input", (e) => {
        const field = e.target.dataset.field;
        row[field] = field === "amount" ? Number(e.target.value) || 0 : e.target.value;
        updatePayrollTotals();
      });
    });
    div.querySelector("button").addEventListener("click", () => {
      state.payrollDeductionRows.splice(i, 1);
      renderDeductionRows();
      updatePayrollTotals();
    });
    container.appendChild(div);
  });
}

function computePayrollTotals() {
  const baseSalary = Number(els.payrollBaseSalaryDisplay.dataset.raw || 0);
  const allowance = Number(els.payrollAllowance.value) || 0;
  const bonus = Number(els.payrollBonus.value) || 0;
  const incentive = Number(els.payrollIncentive.value) || 0;
  const totalIncome = baseSalary + allowance + bonus + incentive;
  const totalDeduction = state.payrollDeductionRows.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  return { baseSalary, allowance, bonus, incentive, totalIncome, totalDeduction, netSalary: totalIncome - totalDeduction };
}

function updatePayrollTotals() {
  const t = computePayrollTotals();
  els.payrollTotalIncome.textContent = formatRupiah(t.totalIncome);
  els.payrollTotalDeduction.textContent = formatRupiah(t.totalDeduction);
  els.payrollNetSalary.textContent = formatRupiah(t.netSalary);
}

function handlePayrollEmployeeChange() {
  const employee = state.employees.find((e) => e.id === els.payrollEmployeeSelect.value);
  els.payrollBaseSalaryDisplay.value = employee ? formatRupiah(employee.baseSalary) : "";
  els.payrollBaseSalaryDisplay.dataset.raw = String(employee?.baseSalary || 0);
  updatePayrollTotals();
}

function resetPayrollForm() {
  els.payrollForm.reset();
  els.payrollForm.querySelectorAll("input, select, button").forEach((el) => { el.disabled = false; });
  els.payrollBaseSalaryDisplay.disabled = true;
  els.payrollSubmitBtn.hidden = false;
  state.editingPayrollId = null;
  state.payrollDeductionRows = [];
  els.payrollModalTitle.textContent = "Buat payroll";
  els.payrollSubmitBtn.textContent = "Simpan Payroll";
  els.payrollPeriod.value = getCurrentPeriodValue();
  els.payrollEmployeeSelect.disabled = false;
  populatePayrollEmployeeSelect();
  renderDeductionRows();
  handlePayrollEmployeeChange();
}

/** Buka modal payroll. Tanpa argumen = buat baru. Dengan argumen = edit, form terisi otomatis. */
function openPayrollModal(payroll, readOnly = false) {
  resetPayrollForm();
  if (payroll) {
    state.editingPayrollId = payroll.id;
    els.payrollModalTitle.textContent = `Edit payroll — ${payroll.employeeName}`;
    els.payrollSubmitBtn.textContent = "Simpan perubahan";
    els.payrollEmployeeSelect.innerHTML = `<option value="${payroll.employeeId}">${escapeHtml(payroll.employeeName)} - ${escapeHtml(payroll.positionName)}</option>`;
    els.payrollEmployeeSelect.value = payroll.employeeId;
    els.payrollEmployeeSelect.disabled = true;
    els.payrollBaseSalaryDisplay.value = formatRupiah(payroll.baseSalary);
    els.payrollBaseSalaryDisplay.dataset.raw = String(payroll.baseSalary || 0);
    els.payrollPeriod.value = payroll.period || "";
    els.payrollAllowance.value = payroll.allowance || 0;
    els.payrollBonus.value = payroll.bonus || 0;
    els.payrollIncentive.value = payroll.incentive || 0;
    state.payrollDeductionRows = (payroll.deductions || []).map((d) => ({ ...d }));
    renderDeductionRows();
    els.payrollStatus.value = normalizePayrollStatus(payroll.status);
    els.payrollPaymentDate.value = payroll.paymentDate || "";
    els.payrollPaymentMethod.value = payroll.paymentMethod || "Transfer";
  }
  updatePayrollTotals();
  if (readOnly) {
    els.payrollModalTitle.textContent = `Detail payroll — ${payroll.employeeName}`;
    els.payrollForm.querySelectorAll("input, select, button:not([data-close-modal])").forEach((el) => { el.disabled = true; });
    els.payrollSubmitBtn.hidden = true;
  }
  els.payrollPaymentDate.required = !readOnly && els.payrollStatus.value === "Dibayar";
  els.payrollModal.hidden = false;
}

// ------------------------------------------------------------
// Payroll massal
// ------------------------------------------------------------
function openMassPayrollModal() {
  els.massPayrollPeriod.value = "";
  state.massPayrollRows = [];
  els.tableMassPayroll.querySelector("tbody").innerHTML = "";
  els.massPayrollModal.hidden = false;
}

function handleMassCalculate() {
  const period = els.massPayrollPeriod.value;
  if (!period) {
    showToast("Pilih periode dulu.");
    return;
  }
  const activeEmployees = state.employees.filter((e) => (e.employeeStatus || "Aktif") === "Aktif");
  state.massPayrollRows = activeEmployees.map((e) => ({
    employeeId: e.id,
    employeeName: e.name,
    positionName: positionLabel(e.positionId),
    baseSalary: e.baseSalary || 0,
    allowance: 0,
    bonus: 0,
    incentive: 0,
    deductionTotal: 0,
    alreadyExists: !!findExistingPayroll(e.id, period),
  }));
  renderMassPayrollTable();
}

function renderMassPayrollTable() {
  const tbody = els.tableMassPayroll.querySelector("tbody");
  tbody.innerHTML = "";
  if (state.massPayrollRows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" class="table-empty">Tidak ada karyawan aktif.</td></tr>`;
    return;
  }
  state.massPayrollRows.forEach((row) => {
    const total = row.baseSalary + row.allowance + row.bonus + row.incentive - row.deductionTotal;
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(row.employeeName)}</td>
      <td>${escapeHtml(row.positionName)}</td>
      <td>${formatRupiah(row.baseSalary)}</td>
      <td><input type="number" min="0" class="stock-input" style="width:90px;" value="${row.allowance}" data-field="allowance" /></td>
      <td><input type="number" min="0" class="stock-input" style="width:90px;" value="${row.bonus}" data-field="bonus" /></td>
      <td><input type="number" min="0" class="stock-input" style="width:90px;" value="${row.incentive}" data-field="incentive" /></td>
      <td><input type="number" min="0" class="stock-input" style="width:90px;" value="${row.deductionTotal}" data-field="deductionTotal" /></td>
      <td><strong>${formatRupiah(total)}</strong></td>
      <td>${row.alreadyExists ? `<span class="tag tag--dibatalkan">Sudah ada</span>` : `<span class="tag tag--selesai">Siap</span>`}</td>
    `;
    tr.querySelectorAll("[data-field]").forEach((input) => {
      input.addEventListener("input", (e) => {
        row[e.target.dataset.field] = Number(e.target.value) || 0;
        const totalCell = tr.children[7];
        totalCell.innerHTML = `<strong>${formatRupiah(row.baseSalary + row.allowance + row.bonus + row.incentive - row.deductionTotal)}</strong>`;
      });
    });
    tbody.appendChild(tr);
  });
}

async function handleMassProcess() {
  const period = els.massPayrollPeriod.value;
  if (!period || state.massPayrollRows.length === 0) {
    showToast("Klik \"Hitung Semua\" dulu.");
    return;
  }
  let created = 0;
  let skipped = 0;
  for (const row of state.massPayrollRows) {
    if (row.alreadyExists) { skipped++; continue; }
    const totalIncome = row.baseSalary + row.allowance + row.bonus + row.incentive;
    const netSalary = totalIncome - row.deductionTotal;
    await addPayroll({
      employeeId: row.employeeId,
      employeeName: row.employeeName,
      employeeCode: state.employees.find((e) => e.id === row.employeeId)?.employeeId || "",
      positionName: row.positionName,
      period,
      baseSalary: row.baseSalary,
      allowance: row.allowance,
      bonus: row.bonus,
      incentive: row.incentive,
      totalIncome,
      deductions: row.deductionTotal > 0 ? [{ type: "Lainnya", date: "", description: "Potongan payroll massal", amount: row.deductionTotal }] : [],
      totalDeduction: row.deductionTotal,
      netSalary,
      status: "Draft",
      paymentDate: "",
      paymentMethod: "Transfer",
    });
    created++;
  }
  els.massPayrollModal.hidden = true;
  navigateTo("karyawan");
  showToast(`${created} payroll dibuat, ${skipped} dilewati (sudah ada untuk periode ini).`);
}

// ------------------------------------------------------------
// Slip Gaji
// ------------------------------------------------------------
function getStoreSettings() {
  return { ...DEFAULT_SETTINGS, ...(state.settings || {}) };
}

/** Bangun HTML lembar slip gaji (dipakai untuk preview, capture PNG, dan capture PDF — satu sumber tampilan yang sama). */
function buildPayslipHtml(payroll) {
  const store = getStoreSettings();
  const deductionRows = (payroll.deductions || [])
    .filter((d) => (d.amount || 0) > 0)
    .map(
      (d) => `
      <div class="slip-deduction-item">
        <div class="slip-row"><span>${escapeHtml(d.type)}</span><span>${formatRupiah(d.amount)}</span></div>
        ${d.description ? `<div class="slip-deduction-desc">${escapeHtml(d.description)}</div>` : ""}
      </div>`
    )
    .join("");

  return `
    <div class="slip-header">
      <p class="slip-store-name">${escapeHtml(store.storeName)}</p>
      <p class="slip-title">SLIP GAJI</p>
      <p class="slip-period">${formatPeriodLabel(payroll.period)}</p>
    </div>

    <div class="slip-employee-block">
      <div class="slip-row"><span>Nama</span><strong>${escapeHtml(payroll.employeeName)}</strong></div>
      <div class="slip-row"><span>ID Karyawan</span><strong>${escapeHtml(payroll.employeeCode || "-")}</strong></div>
      <div class="slip-row"><span>Posisi</span><strong>${escapeHtml(payroll.positionName || "-")}</strong></div>
    </div>

    <div class="slip-section">
      <p class="slip-section-title">Pendapatan</p>
      <div class="slip-row"><span>Gaji Pokok</span><span>${formatRupiah(payroll.baseSalary)}</span></div>
      <div class="slip-row"><span>Tunjangan</span><span>${formatRupiah(payroll.allowance)}</span></div>
      <div class="slip-row"><span>Bonus</span><span>${formatRupiah(payroll.bonus)}</span></div>
      <div class="slip-row"><span>Insentif</span><span>${formatRupiah(payroll.incentive)}</span></div>
      <div class="slip-row slip-row--total"><span>Total Pendapatan</span><span>${formatRupiah(payroll.totalIncome)}</span></div>
    </div>

    ${
      (payroll.deductions || []).length > 0
        ? `<div class="slip-section">
      <p class="slip-section-title">Potongan Kesalahan Kerja</p>
      ${deductionRows}
      <div class="slip-row slip-row--total"><span>Total Potongan</span><span>${formatRupiah(payroll.totalDeduction)}</span></div>
    </div>`
        : ""
    }

    <div class="slip-net-block">
      <span>Total Diterima</span>
      <strong>${formatRupiah(payroll.netSalary)}</strong>
    </div>

    <div class="slip-footer-info">
      <div class="slip-row"><span>Tanggal Pembayaran</span><span>${payroll.paymentDate ? formatDate(payroll.paymentDate) : "-"}</span></div>
      <div class="slip-row"><span>Metode</span><span>${escapeHtml(payroll.paymentMethod || "-")}</span></div>
      <div class="slip-row"><span>Status</span><span class="slip-status-lunas">LUNAS</span></div>
    </div>

    <p class="slip-brand-footer">${escapeHtml(store.storeName)}</p>
  `;
}

function openSlipModal(payroll) {
  if (!payroll || normalizePayrollStatus(payroll.status) !== "Dibayar") return;
  const employee = state.employees.find((e) => e.id === payroll.employeeId);
  state.viewingSlipPayroll = payroll;
  state.viewingSlipEmployee = employee || null;
  els.slipSheet.innerHTML = buildPayslipHtml(payroll);
  const hasPhone = !!normalizeWhatsAppNumber(employee?.phone);
  els.btnSlipShareEmployee.hidden = !hasPhone;
  els.slipShareHint.textContent = hasPhone ? "WhatsApp membuka pesan siap kirim. Lampirkan PDF/PNG yang telah diunduh." : "Nomor WhatsApp karyawan belum tersedia.";
  els.slipModal.hidden = false;
}

/** "0812..." atau "+62812..." -> "62812..." untuk link wa.me. Nomor asli di Data Karyawan tidak diubah. */
function normalizeWhatsAppNumber(phone) {
  let digits = String(phone || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("0")) digits = "62" + digits.slice(1);
  else if (!digits.startsWith("62")) digits = "62" + digits;
  return digits;
}

function buildPayslipWhatsAppMessage(payroll, employee) {
  const store = getStoreSettings();
  return `Halo ${employee?.name || payroll.employeeName},\n\nBerikut slip gaji Anda untuk periode ${formatPeriodLabel(payroll.period)}.\n\nTotal diterima:\n${formatRupiah(payroll.netSalary)}\n\nStatus:\nLUNAS\n\n${store.storeName}`;
}

async function capturePayslipCanvas() {
  if (typeof html2canvas === "undefined") {
    showToast("Library gagal dimuat — cek koneksi internet lalu coba lagi.");
    return null;
  }
  return html2canvas(els.slipSheet, { scale: 2, backgroundColor: "#ffffff" });
}

function payslipFileNameBase(payroll) {
  const namePart = (payroll.employeeName || "Karyawan").replace(/\s+/g, "-");
  const periodPart = formatPeriodLabel(payroll.period).replace(/\s+/g, "-");
  return `Slip-Gaji-${namePart}-${periodPart}`;
}

async function downloadSlipPdf(payroll) {
  const canvas = await capturePayslipCanvas();
  if (!canvas) return;
  if (typeof window.jspdf === "undefined") {
    showToast("Library PDF gagal dimuat — cek koneksi internet lalu coba lagi.");
    return;
  }
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ unit: "px", format: [canvas.width, canvas.height] });
  pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, canvas.width, canvas.height);
  pdf.save(`${payslipFileNameBase(payroll)}.pdf`);
}

async function downloadSlipPng(payroll) {
  const canvas = await capturePayslipCanvas();
  if (!canvas) return;
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${payslipFileNameBase(payroll)}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, "image/png");
}

function generatePayslipPngBlob() {
  return new Promise(async (resolve) => {
    const canvas = await capturePayslipCanvas();
    if (!canvas) { resolve(null); return; }
    canvas.toBlob((blob) => resolve(blob), "image/png");
  });
}

/**
 * Share slip gaji. Tanpa targetPhone = tombol "Share WhatsApp" generik (native share / wa.me tanpa nomor).
 * Dengan targetPhone = tombol "Kirim ke WhatsApp Karyawan" (buka chat spesifik nomor tsb).
 */
function sharePayslip(payroll, employee, targetPhone) {
  if (!payroll || normalizePayrollStatus(payroll.status) !== "Dibayar") return;
  const message = buildPayslipWhatsAppMessage(payroll, employee);
  const number = targetPhone ? normalizeWhatsAppNumber(targetPhone) : "";
  window.open(`https://wa.me/${number}?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
  showToast("WhatsApp dibuka. Lampirkan PDF/PNG yang telah diunduh sebelum mengirim.");
}

// ------------------------------------------------------------
// Laporan HR
// ------------------------------------------------------------
function matchesReportPeriod(period) {
  if (!period) return false;
  const [y, m] = period.split("-");
  if (els.reportFilterYear.value && y !== String(els.reportFilterYear.value)) return false;
  if (els.reportFilterMonth.value && m !== els.reportFilterMonth.value) return false;
  return true;
}

function renderReportFilterOptions() {
  const current = els.reportFilterPosition.value;
  els.reportFilterPosition.innerHTML = `<option value="">Semua posisi</option>` + state.positions.map((p) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join("");
  els.reportFilterPosition.value = current;
}

function renderLaporanView() {
  renderReportFilterOptions();
  const posFilter = els.reportFilterPosition.value;
  const workStatusFilter = els.reportFilterWorkStatus.value;

  let employees = state.employees;
  if (posFilter) employees = employees.filter((e) => e.positionId === posFilter);
  if (workStatusFilter) employees = employees.filter((e) => e.workStatus === workStatusFilter);

  const employeeIds = new Set(employees.map((e) => e.id));
  const activeEmployees = employees.filter((e) => (e.employeeStatus || "Aktif") === "Aktif");
  const contractEmployees = employees.filter((e) => e.workStatus === "Kontrak");
  const avgSalary = employees.length ? employees.reduce((s, e) => s + (e.baseSalary || 0), 0) / employees.length : 0;

  const latestReviews = employees.map((e) => getLatestReviewForEmployee(e.id)).filter(Boolean);
  const avgScore = latestReviews.length ? latestReviews.reduce((s, r) => s + Number(r.finalScore || 0), 0) / latestReviews.length : null;
  const countByCategory = (cat) => latestReviews.filter((r) => r.category === cat).length;

  const contractStatuses = contractEmployees.map((e) => getContractStatus(e));
  const countStatus = (status) => contractStatuses.filter((s) => s === status).length;

  const relevantPayrolls = state.payrolls.filter((p) => employeeIds.has(p.employeeId) && matchesReportPeriod(p.period));
  const totalPayroll = relevantPayrolls.reduce((s, p) => s + (p.netSalary || 0), 0);
  const totalBonus = relevantPayrolls.reduce((s, p) => s + (p.bonus || 0), 0);
  const totalIncentive = relevantPayrolls.reduce((s, p) => s + (p.incentive || 0), 0);
  const totalDeduction = relevantPayrolls.reduce((s, p) => s + (p.totalDeduction || 0), 0);

  els.reportTotalEmployees.textContent = employees.length;
  els.reportActiveEmployees.textContent = activeEmployees.length;
  els.reportContractEmployees.textContent = contractEmployees.length;
  els.reportAvgSalary.textContent = formatRupiah(avgSalary);
  els.reportTotalPayroll.textContent = formatRupiah(totalPayroll);
  els.reportTotalBonus.textContent = formatRupiah(totalBonus);
  els.reportTotalIncentive.textContent = formatRupiah(totalIncentive);
  els.reportTotalDeduction.textContent = formatRupiah(totalDeduction);
  els.reportAvgScore.textContent = avgScore === null ? "-" : `${avgScore.toFixed(2)} / 5`;
  els.reportCountSangatBaik.textContent = countByCategory("Sangat Baik");
  els.reportCountBaik.textContent = countByCategory("Baik");
  els.reportCountCukup.textContent = countByCategory("Cukup");
  els.reportCountExpiring.textContent = countStatus("Akan Berakhir");
  els.reportCountExtended.textContent = countStatus("Diperpanjang");
  els.reportCountNotExtended.textContent = countStatus("Tidak Diperpanjang");
}

// ------------------------------------------------------------
// Export Excel
// ------------------------------------------------------------
function exportToExcel(filename, sheetName, rows) {
  if (typeof XLSX === "undefined") {
    showToast("Library Excel belum termuat — cek koneksi internet lalu coba lagi.");
    return;
  }
  if (rows.length === 0) {
    showToast("Tidak ada data untuk diekspor.");
    return;
  }
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, filename);
}

function exportEmployeesToExcel() {
  const rows = state.employees.map((e) => ({
    "ID Karyawan": e.employeeId || "",
    "Nama": e.name || "",
    "Posisi": positionLabel(e.positionId),
    "Departemen": state.positions.find((p) => p.id === e.positionId)?.department || "",
    "No. HP": e.phone || "",
    "Email": e.email || "",
    "Tanggal Masuk": e.joinDate || "",
    "Status Kerja": e.workStatus || "",
    "Status Karyawan": e.employeeStatus || "Aktif",
    "Gaji Pokok": e.baseSalary || 0,
  }));
  exportToExcel("Data-Karyawan.xlsx", "Karyawan", rows);
}

function exportReviewsToExcel() {
  const rows = state.performanceReviews.map((r) => ({
    "Nama": r.employeeName,
    "Posisi": r.positionName,
    "Periode Mulai": r.periodStart,
    "Periode Selesai": r.periodEnd,
    "Nilai Umum": Number(r.generalScore || 0).toFixed(2),
    "Nilai KPI": r.kpiScore != null ? Number(r.kpiScore).toFixed(2) : "-",
    "Nilai Akhir": Number(r.finalScore || 0).toFixed(2),
    "Kategori": r.category,
    "Rekomendasi": r.recommendation,
    "Tanggal Penilaian": formatDate(r.createdAt),
  }));
  exportToExcel("Penilaian-Kinerja.xlsx", "Penilaian", rows);
}

function exportContractsToExcel() {
  const rows = state.employees
    .filter((e) => e.workStatus === "Kontrak" && e.contractEnd)
    .map((e) => ({
      "Nama": e.name,
      "Posisi": positionLabel(e.positionId),
      "Mulai": e.contractStart || "",
      "Berakhir": e.contractEnd || "",
      "Sisa Hari": daysUntil(e.contractEnd),
      "Status": getContractStatus(e),
    }));
  exportToExcel("Kontrak-Karyawan.xlsx", "Kontrak", rows);
}

function exportPayrollToExcel() {
  const rows = state.payrolls.map((p) => ({
    "Nama": p.employeeName,
    "Posisi": p.positionName,
    "Periode": formatPeriodLabel(p.period),
    "Gaji Pokok": p.baseSalary,
    "Tunjangan": p.allowance,
    "Bonus": p.bonus,
    "Insentif": p.incentive,
    "Total Pendapatan": p.totalIncome,
    "Total Potongan": p.totalDeduction,
    "Total Diterima": p.netSalary,
    "Status": p.status,
  }));
  exportToExcel("Payroll.xlsx", "Payroll", rows);
}

// ------------------------------------------------------------
// Integrasi Keuangan: payroll Dibayar -> transaksi pengeluaran otomatis
// ------------------------------------------------------------
const payrollFinanceSyncInFlight = new Set();

/** Setiap payroll berstatus Dibayar dipastikan punya 1 transaksi pengeluaran di Keuangan (dicek via payrollId, anti-duplikat). */
async function syncFinanceFromPayrolls() {
  if (state.mode !== "demo") return;
  for (const p of state.payrolls) {
    if (p.status !== "Dibayar") continue;
    const alreadyExists = state.transactions.some((t) => t.payrollId === p.id);
    if (alreadyExists || payrollFinanceSyncInFlight.has(p.id)) continue;
    payrollFinanceSyncInFlight.add(p.id);
    try {
      await addTransaction({
        date: p.paymentDate || toDateInputValue(new Date()),
        description: `Gaji Karyawan - ${p.employeeName} - ${formatPeriodLabel(p.period)}`,
        category: "Gaji Karyawan",
        type: "keluar",
        amount: p.netSalary || 0,
        payrollId: p.id,
      });
    } finally {
      payrollFinanceSyncInFlight.delete(p.id);
    }
  }
}

// ------------------------------------------------------------
function applySettingsToForm() {
  const s = { ...DEFAULT_SETTINGS, ...(state.settings || {}) };
  const f = els.settingsForm.elements;
  f["storeName"].value = s.storeName || "";
  f["tagline"].value = s.tagline || "";
  f["address"].value = s.address || "";
  f["phone"].value = s.phone || "";
  f["logoUrl"].value = s.logoUrl || "";
  f["storeUrl"].value = s.storeUrl || "";
}

// ------------------------------------------------------------
// Import produk massal via Excel/CSV
// ------------------------------------------------------------
const IMPORT_TEMPLATE_HEADERS = ["Nama Produk", "Kategori", "SKU Induk", "Berat (gram)", "URL Foto Produk", "Warna/Nama Varian", "Ukuran", "URL Foto Varian", "SKU Varian", "HPP Varian", "Harga Offline Varian", "Harga Online Varian", "Stok Varian"];

function downloadProductTemplate() {
  if (typeof XLSX === "undefined") {
    showToast("Library Excel belum termuat — cek koneksi internet lalu coba lagi.");
    return;
  }
  const sampleRows = [
    ["Kemeja Flanel", "Atasan", "KMJ-FLN", 300, "https://picsum.photos/seed/kmjfln/120", "Hitam", "M", "", "KMJ-FLN-M-HTM", 147000, 235000, 235000, 8],
    ["Kemeja Flanel", "Atasan", "KMJ-FLN", 300, "https://picsum.photos/seed/kmjfln/120", "Hitam", "L", "", "KMJ-FLN-L-HTM", 147000, 235000, 235000, 3],
    ["Blouse Katun", "Atasan", "BLS-KTN", 150, "", "Putih", "S", "", "BLS-KTN-S-PTH", 56000, 90000, 90000, 12],
    ["Aksesoris Bros", "Aksesoris", "AKS-BRS", 50, "", "", "", "", "AKS-BRS-001", 15000, 25000, 25000, 15],
  ];
  const ws = XLSX.utils.aoa_to_sheet([IMPORT_TEMPLATE_HEADERS, ...sampleRows]);
  ws["!cols"] = IMPORT_TEMPLATE_HEADERS.map(() => ({ wch: 18 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Produk");
  XLSX.writeFile(wb, "template-import-produk.xlsx");
}

/** Baris mentah dari sheet → produk yang sudah dikelompokkan (baris varian dengan Nama Produk + SKU Induk sama digabung jadi 1 dokumen). */
function groupImportRows(rows) {
  const groups = new Map();
  const errors = [];
  const DEFAULT_COLOR = "Standar";
  const DEFAULT_SIZE = "All Size";

  rows.forEach((row, idx) => {
    const rowNum = idx + 2; // baris 1 di file = header
    const name = String(row["Nama Produk"] || "").trim();

    if (!name) {
      errors.push({ row: rowNum, reason: "Kolom Nama Produk kosong — baris dilewati." });
      return;
    }

    // Kolom Warna/Nama Varian atau Ukuran yang kosong TIDAK membuat baris dilewati —
    // otomatis diisi nilai default supaya data tetap masuk.
    const variantColor = String(row["Warna/Nama Varian"] || "").trim() || DEFAULT_COLOR;
    const variantSize = String(row["Ukuran"] || "").trim() || DEFAULT_SIZE;

    const category = String(row["Kategori"] || "").trim() || "Umum";
    const sku = String(row["SKU Induk"] || "").trim() || slug(name);
    const weight = Number(row["Berat (gram)"]) || 0;
    const photoUrl = String(row["URL Foto Produk"] || "").trim();
    const variantImage = String(row["URL Foto Varian"] || "").trim();
    const variantSku = String(row["SKU Varian"] || "").trim() || `${sku}-${slug(variantColor)}-${slug(variantSize)}`;
    const variantHpp = Number(row["HPP Varian"]) || 0;
    const variantPriceOffline = Number(row["Harga Offline Varian"]) || 0;
    const variantPriceOnline = Number(row["Harga Online Varian"]) || 0;
    const variantStock = Number(row["Stok Varian"]) || 0;

    const key = `${name.toLowerCase()}|${sku.toLowerCase()}`;
    if (!groups.has(key)) {
      groups.set(key, { name, category, description: "", hpp: variantHpp, priceOffline: variantPriceOffline, priceOnline: variantPriceOnline, weight, sku, status: "aktif", photoUrl, variants: [] });
    }
    const product = groups.get(key);
    if (!product.photoUrl && photoUrl) product.photoUrl = photoUrl;
    product.variants.push({ image: variantImage, color: variantColor, size: variantSize, sku: variantSku, hpp: variantHpp, priceOffline: variantPriceOffline, priceOnline: variantPriceOnline, stock: variantStock });
  });

  const products = Array.from(groups.values()).map((p) => ({ ...p, totalStock: p.variants.reduce((s, v) => s + v.stock, 0) }));
  return { products, errors };
}

/** Simpan produk hasil import. Firebase: writeBatch berkelompok (maks. 400/batch, aman di bawah limit 500 Firestore). */
async function saveImportedProducts(products, onProgress) {
  let done = 0;
  for (const product of products) { await addProduct(product); done++; onProgress({done,total:products.length}); }
}


function openImportModal() {
  els.importLog.innerHTML = "";
  els.importModalClose.hidden = true;
  setImportStatus("Membaca file…", 5);
  els.importModal.hidden = false;
}
function setImportStatus(text, percent) {
  els.importStatusText.textContent = text;
  els.importProgressBar.style.width = Math.max(0, Math.min(100, percent)) + "%";
}
function showImportDone(products, errors) {
  const summary = document.createElement("p");
  summary.style.cssText = "margin-top:14px;font-size:13.5px;";
  summary.innerHTML = `<strong>${products.length}</strong> produk berhasil diimpor` + (errors.length ? `, <strong>${errors.length}</strong> baris dilewati.` : ".");
  els.importLog.appendChild(summary);

  if (errors.length > 0) {
    const list = document.createElement("ul");
    list.className = "import-error-list";
    errors.slice(0, 20).forEach((e) => {
      const li = document.createElement("li");
      li.textContent = `Baris ${e.row}: ${e.reason}`;
      list.appendChild(li);
    });
    if (errors.length > 20) {
      const li = document.createElement("li");
      li.textContent = `…dan ${errors.length - 20} baris lainnya dilewati.`;
      list.appendChild(li);
    }
    els.importLog.appendChild(list);
  }
  els.importModalClose.hidden = false;
}

async function handleImportExcel(file) {
  if (typeof XLSX === "undefined") {
    showToast("Library Excel belum termuat — cek koneksi internet lalu coba lagi.");
    return;
  }
  openImportModal();

  let rows;
  try {
    const data = await file.arrayBuffer();
    const wb = XLSX.read(data, { type: "array" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
  } catch (err) {
    setImportStatus("Gagal membaca file. Pastikan formatnya .xlsx/.csv sesuai template.", 0);
    showImportDone([], [{ row: "-", reason: "File tidak terbaca: " + err.message }]);
    return;
  }

  if (rows.length === 0) {
    setImportStatus("File kosong — tidak ada baris data.", 0);
    showImportDone([], []);
    return;
  }

  setImportStatus(`Mengelompokkan ${rows.length} baris menjadi produk…`, 20);
  const { products, errors } = groupImportRows(rows);

  if (products.length === 0) {
    setImportStatus("Tidak ada produk valid untuk diimpor.", 0);
    showImportDone([], errors);
    return;
  }

  setImportStatus(`Menyimpan 0/${products.length} produk…`, 40);
  try {
    await saveImportedProducts(products, (p) => {
      setImportStatus(`Menyimpan ${p.done}/${p.total} produk…`, 40 + Math.round((p.done / p.total) * 55));
    });
  } catch (err) {
    setImportStatus("Terjadi kesalahan saat menyimpan ke database.", 0);
    showImportDone([], [...errors, { row: "-", reason: err.message }]);
    return;
  }

  setImportStatus("Selesai.", 100);
  showImportDone(products, errors);
  navigateTo("produk");
}

// ------------------------------------------------------------
// Buat pesanan manual
// ------------------------------------------------------------
function addOrderItemRow() {
  state.orderItemRows.push({ productId: "", productName: "", variantId: "", variantName: "", variantSku: "", price: 0, qty: 1 });
  renderOrderItemRowsTable();
}

function removeOrderItemRow(idx) {
  state.orderItemRows.splice(idx, 1);
  renderOrderItemRowsTable();
  updateCreateOrderTotals();
}

function renderOrderItemRowsTable() {
  const tbody = els.orderItemRowsTable.querySelector("tbody");
  tbody.innerHTML = "";
  els.orderItemEmptyHint.hidden = state.orderItemRows.length > 0;

  state.orderItemRows.forEach((row, i) => {
    const tr = document.createElement("tr");
    const selectedProduct = state.products.find((p) => p.id === row.productId);

    const productOptions = state.products.map((p) => `<option value="${p.id}" ${row.productId === p.id ? "selected" : ""}>${escapeHtml(p.name)}</option>`).join("");
    const variantOptions = selectedProduct
      ? (selectedProduct.variants || []).filter(v => v.id).map((v) => `<option value="${escapeHtml(v.id)}" ${row.variantId === v.id ? "selected" : ""}>${escapeHtml(variantLabel(v))} (stok ${v.stock ?? 0})</option>`).join("")
      : "";

    tr.innerHTML = `
      <td>
        <select class="stock-input" style="width:170px;" data-field="product">
          <option value="">Pilih produk</option>
          ${productOptions}
        </select>
      </td>
      <td>
        <select class="stock-input" style="width:160px;" data-field="variant" ${selectedProduct ? "" : "disabled"}>
          <option value="">Pilih varian</option>
          ${variantOptions}
        </select>
      </td>
      <td><input type="number" min="1" class="stock-input" style="width:60px;" value="${row.qty}" data-field="qty" /></td>
      <td class="oi-price">${formatRupiah(row.price)}</td>
      <td class="oi-subtotal">${formatRupiah(row.price * row.qty)}</td>
      <td><button type="button" class="btn btn--ghost" style="padding:5px 9px;font-size:12px;" aria-label="Hapus item">&times;</button></td>
    `;

    tr.querySelector('[data-field="product"]').addEventListener("change", (e) => {
      const product = state.products.find((p) => p.id === e.target.value);
      row.productId = e.target.value;
      row.productName = product ? product.name : "";
      row.variantId = "";
      row.variantName = "";
      row.variantSku = "";
      row.price = 0;
      row.qty = row.qty || 1;
      renderOrderItemRowsTable();
      updateCreateOrderTotals();
    });

    tr.querySelector('[data-field="variant"]').addEventListener("change", (e) => {
      const product = state.products.find((p) => p.id === row.productId);
      const variant = product?.variants?.find(v => v.id === e.target.value);
      row.variantId = e.target.value;
      row.variantName = variant ? variantLabel(variant) : "";
      row.variantSku = variant ? variant.sku : "";
      row.price = variant ? Number(variant.priceOffline ?? variant.priceOnline ?? variant.price ?? product.priceOffline ?? product.price ?? 0) : 0;
      renderOrderItemRowsTable();
      updateCreateOrderTotals();
    });

    tr.querySelector('[data-field="qty"]').addEventListener("input", (e) => {
      row.qty = Math.max(1, Number(e.target.value) || 1);
      tr.querySelector(".oi-subtotal").textContent = formatRupiah(row.price * row.qty);
      updateCreateOrderTotals();
    });

    tr.querySelector("button[aria-label='Hapus item']").addEventListener("click", () => removeOrderItemRow(i));

    tbody.appendChild(tr);
  });
}

function updateCreateOrderTotals() {
  const subtotal = state.orderItemRows.reduce((s, r) => s + r.price * r.qty, 0);
  const shipping = Number(els.createOrderForm.elements["shippingCost"].value) || 0;
  els.createOrderSubtotal.textContent = formatRupiah(subtotal);
  els.createOrderTotal.textContent = formatRupiah(subtotal + shipping);
}

function resetCreateOrderForm() {
  els.createOrderForm.reset();
  state.manualOrderKey = null;
  state.orderItemRows = [];
  renderOrderItemRowsTable();
  updateCreateOrderTotals();
}

function openCreateOrderModal() {
  resetCreateOrderForm();
  els.createOrderModal.hidden = false;
}

// ------------------------------------------------------------
// Kalkulator Pintar
// ------------------------------------------------------------
const CALC_MARKUP_SAFE_THRESHOLD = 60; // % — sesuai ketentuan: markup >= 60% dianggap aman

/** Hitung semua angka turunan kalkulator dari HPP, harga offline/online, dan % potongan platform. */
function computeCalc() {
  const hpp = Number(els.calcHpp.value) || 0;
  const cutPct = Number(els.calcCutPct.value) || 0;
  const priceOffline = Number(els.calcPriceOffline.value) || 0;
  const priceOnline = Number(els.calcPriceOnline.value) || 0;

  const platformFee = priceOnline * (cutPct / 100);
  const netOnlineRevenue = priceOnline - platformFee;
  const netProfitOnline = netOnlineRevenue - hpp;
  const netProfitOffline = priceOffline - hpp;

  const markupOnlinePct = hpp > 0 ? ((priceOnline - hpp) / hpp) * 100 : 0;
  const marginOnlinePctOfHpp = hpp > 0 ? (netProfitOnline / hpp) * 100 : 0;
  const marginOfflinePctOfHpp = hpp > 0 ? (netProfitOffline / hpp) * 100 : 0;

  return { hpp, cutPct, priceOffline, priceOnline, platformFee, netOnlineRevenue, netProfitOnline, netProfitOffline, markupOnlinePct, marginOnlinePctOfHpp, marginOfflinePctOfHpp };
}

function renderKalkulatorCompare() {
  const c = computeCalc();

  els.calcCompareTable.querySelector("tbody").innerHTML = `
    <tr><td>Harga jual</td><td>${formatRupiah(c.priceOffline)}</td><td>${formatRupiah(c.priceOnline)}</td></tr>
    <tr><td>Potongan platform (${c.cutPct}%)</td><td>—</td><td>- ${formatRupiah(c.platformFee)}</td></tr>
    <tr><td>Dana diterima</td><td>${formatRupiah(c.priceOffline)}</td><td>${formatRupiah(c.netOnlineRevenue)}</td></tr>
    <tr><td>HPP / Modal</td><td>- ${formatRupiah(c.hpp)}</td><td>- ${formatRupiah(c.hpp)}</td></tr>
    <tr class="calc-result-row-highlight"><td>Laba bersih</td><td>${formatRupiah(c.netProfitOffline)}</td><td>${formatRupiah(c.netProfitOnline)}</td></tr>
    <tr><td>Margin dari HPP</td><td>${c.marginOfflinePctOfHpp.toFixed(1)}%</td><td>${c.marginOnlinePctOfHpp.toFixed(1)}%</td></tr>
  `;

  const isSafe = c.markupOnlinePct >= CALC_MARKUP_SAFE_THRESHOLD;
  els.calcMarginBadge.innerHTML = c.hpp > 0
    ? `<span class="calc-margin-badge ${isSafe ? "is-safe" : "is-risky"}">
        ${isSafe ? "✓ Margin Aman" : "⚠ Perhatian: Margin Rentan"}
        <span class="badge-sub">Markup online ${c.markupOnlinePct.toFixed(1)}% dari HPP · laba bersih online ${c.marginOnlinePctOfHpp.toFixed(1)}% dari HPP</span>
      </span>`
    : "";
}

function applyCalcPreset(multiplier) {
  const hpp = Number(els.calcHpp.value) || 0;
  if (hpp <= 0) {
    showToast("Isi HPP / Modal dulu sebelum pakai preset.");
    return;
  }
  const suggestedPrice = Math.round(hpp * multiplier);
  els.calcPriceOnline.value = suggestedPrice;
  els.calcPriceOffline.value = suggestedPrice;
  renderKalkulatorCompare();
}

// ------------------------------------------------------------
// Order detail modal
// ------------------------------------------------------------
function openOrderModal(orderId) {
  if (state.orders.find(o=>o.id===orderId)?.schemaVersion === 2) { showOperational('orders/'+encodeURIComponent(orderId)); return; }
  state.openOrderId = orderId;
  renderOrderModalBody(orderId);
  els.orderModal.hidden = false;
}
function closeModals() {
  els.orderModal.hidden = true;
  els.productModal.hidden = true;
  els.customerModal.hidden = true;
  els.transactionModal.hidden = true;
  els.createOrderModal.hidden = true;
  els.employeeModal.hidden = true;
  els.positionModal.hidden = true;
  els.reviewModal.hidden = true;
  els.reviewDetailModal.hidden = true;
  els.contractReviewModal.hidden = true;
  els.decisionModal.hidden = true;
  els.payrollModal.hidden = true;
  els.massPayrollModal.hidden = true;
  els.slipModal.hidden = true;
  state.openOrderId = null;
  resetProductForm();
  resetCustomerForm();
  resetCreateOrderForm();
  resetEmployeeForm();
  resetReviewForm();
  resetPayrollForm();
}

function renderOrderModalBody(orderId) {
  const o = state.orders.find((x) => x.id === orderId);
  if (!o) return;
  const itemsHtml = o.items.map((it) => `<li><span>${escapeHtml(it.productName)} — ${escapeHtml(it.variant)} × ${it.qty}</span><span>${formatRupiah(it.price * it.qty)}</span></li>`).join("");

  let actionHtml = "";
  if (o.status === "perlu_verifikasi") {
    actionHtml = `
      <div class="od-action-block">
        <h3>Verifikasi pembayaran</h3>
        <p style="font-size:13px;color:var(--text-muted);margin:0 0 12px;">Cocokkan nominal transfer (${(o.total == null ? "Menunggu konfirmasi" : formatRupiah(o.total))}) dan nama pengirim dengan mutasi rekening toko sebelum menyetujui.</p>
        <div class="od-action-row">
          <button class="btn btn--primary" data-act="verify-ok">Verifikasi valid</button>
          <button class="btn btn--ghost" data-act="verify-reject">Tolak, minta ulang</button>
        </div>
      </div>`;
  } else if (o.status === "diproses") {
    actionHtml = `
      <div class="od-action-block">
        <h3>Input pengiriman</h3>
        <div class="od-action-row">
          <select id="od-courier" class="stock-input" style="width:170px;">
            <option value="JNE">JNE</option>
            <option value="SiCepat">SiCepat</option>
            <option value="J&T">J&T</option>
            <option value="J&T KARGO">J&T KARGO</option>
            <option value="AnterAja">AnterAja</option>
            <option value="Kurir Toko">Kurir Toko</option>
            <option value="Diambil di Tempat">Diambil di Tempat</option>
          </select>
          <input id="od-tracking" class="stock-input" style="width:200px;" placeholder="Nomor resi" />
          <button class="btn btn--primary" id="od-ship-btn" data-act="ship">Simpan &amp; tandai dikirim</button>
        </div>
        <p id="od-courier-hint" class="field-hint" style="margin-top:8px;"></p>
      </div>`;
  } else if (o.status === "menunggu_pembayaran") {
    actionHtml = `
      <div class="od-action-block">
        <h3>Menunggu bukti transfer dari pelanggan</h3>
        <div class="od-action-row">
          <button class="btn btn--ghost" data-act="cancel">Batalkan pesanan</button>
        </div>
      </div>`;
  } else if (o.status === "dikirim") {
    actionHtml = `
      <div class="od-action-block">
        <h3>Dalam pengiriman</h3>
        <p style="font-size:13px;margin:0 0 12px;">${escapeHtml(o.courier || "-")}${o.trackingNumber ? " — " + escapeHtml(o.trackingNumber) : ""}</p>
        <div class="od-action-row">
          <button class="btn btn--primary" data-act="complete">Tandai selesai</button>
        </div>
      </div>`;
  }
  if (["menunggu_pembayaran", "perlu_verifikasi", "diproses"].includes(o.status)) {
    actionHtml += `<div class="od-action-row" style="margin-top:10px;"><button class="btn btn--ghost" data-act="cancel">Batalkan pesanan</button></div>`;
  }

  const shippingInfoHtml = o.courier && o.status !== "dikirim"
    ? `<div class="od-block" style="margin-bottom:16px;"><h3>Metode pengiriman</h3><p>${escapeHtml(o.courier)}${o.trackingNumber ? " — " + escapeHtml(o.trackingNumber) : o.courier === "Diambil di Tempat" ? " (tanpa resi)" : ""}</p></div>`
    : "";

  const historyHtml = (o.statusHistory || []).map((h) => `<li>${escapeHtml(STATUS_META[h.status]?.label || h.status)} — ${formatDate(h.at)}</li>`).join("");

  els.orderModalBody.innerHTML = `
    <div class="od-head">
      <div>
        <h2>${escapeHtml(o.invoiceNo)}</h2>
        <span class="tag tag--${escapeHtml(o.status)}">${(STATUS_META[o.status]?.label || "Status tidak dikenal")}</span>
      </div>
    </div>
    <div class="od-cols">
      <div class="od-block">
        <h3>Pelanggan</h3>
        <p><strong>${escapeHtml(o.customerName)}</strong></p>
        <p>${escapeHtml(o.phone)}</p>
        <p>${escapeHtml(o.address)}</p>
      </div>
      <div class="od-block">
        <h3>Item pesanan</h3>
        <ul class="od-items">${itemsHtml}</ul>
        <div class="od-total-row"><span>Ongkir</span><span>${(o.shippingCost == null ? "Menunggu konfirmasi" : formatRupiah(o.shippingCost))}</span></div>
        <div class="od-total-row"><span>Total</span><span>${(o.total == null ? "Menunggu konfirmasi" : formatRupiah(o.total))}</span></div>
      </div>
    </div>
    ${shippingInfoHtml}
    ${actionHtml}
    <div class="od-history">
      <strong>Riwayat status</strong>
      <ul>${historyHtml}</ul>
    </div>
  `;

  els.orderModalBody.querySelectorAll("[data-act]").forEach((btn) => {
    btn.addEventListener("click", () => handleOrderAction(o, btn.dataset.act));
  });

  const courierSelect = document.getElementById("od-courier");
  if (courierSelect) {
    courierSelect.addEventListener("change", () => updateShippingFieldsForCourier(courierSelect.value));
    updateShippingFieldsForCourier(courierSelect.value);
  }
}

/** Sesuaikan kolom resi & label tombol berdasarkan kurir yang dipilih. */
function updateShippingFieldsForCourier(courier) {
  const trackingInput = document.getElementById("od-tracking");
  const shipBtn = document.getElementById("od-ship-btn");
  const hint = document.getElementById("od-courier-hint");
  if (!trackingInput || !shipBtn) return;

  if (courier === "Diambil di Tempat") {
    trackingInput.value = "";
    trackingInput.disabled = true;
    trackingInput.placeholder = "Tanpa resi";
    shipBtn.textContent = "Tandai diambil";
    if (hint) hint.textContent = "Pesanan akan langsung ditandai Selesai — tidak perlu nomor resi.";
  } else if (courier === "Kurir Toko") {
    trackingInput.disabled = false;
    trackingInput.placeholder = "Nama kurir internal / no. kontak (opsional)";
    shipBtn.textContent = "Simpan & tandai dikirim";
    if (hint) hint.textContent = "Nomor resi opsional untuk kurir toko sendiri.";
  } else {
    trackingInput.disabled = false;
    trackingInput.placeholder = "Nomor resi";
    shipBtn.textContent = "Simpan & tandai dikirim";
    if (hint) hint.textContent = "";
  }
}

async function handleOrderAction(order, act) {
  if (act === "verify-ok") {
    await updateOrder(order.id, { status: "diproses" });
    showToast(`Pembayaran ${order.invoiceNo} diverifikasi.`);
  } else if (act === "verify-reject") {
    await updateOrder(order.id, { status: "menunggu_pembayaran" });
    showToast(`Pelanggan diminta upload ulang bukti transfer.`);
  } else if (act === "ship") {
    const courier = document.getElementById("od-courier").value;
    const trackingInput = document.getElementById("od-tracking");
    const tracking = trackingInput.disabled ? "" : trackingInput.value.trim();

    if (courier === "Diambil di Tempat") {
      await updateOrder(order.id, { status: "selesai", courier, trackingNumber: "" });
      showToast(`${order.invoiceNo} ditandai diambil & selesai.`);
    } else {
      if (courier !== "Kurir Toko" && !tracking) {
        showToast("Nomor resi wajib diisi untuk kurir ini.");
        return;
      }
      await updateOrder(order.id, { status: "dikirim", courier, trackingNumber: tracking });
      showToast(`${order.invoiceNo} ditandai dikirim.`);
    }
  } else if (act === "complete") {
    await updateOrder(order.id, { status: "selesai" });
    showToast(`${order.invoiceNo} ditandai selesai.`);
  } else if (act === "cancel") {
    if (!confirm(`Batalkan pesanan ${order.invoiceNo}?`)) return;
    await updateOrder(order.id, { status: "dibatalkan" });
    showToast(`${order.invoiceNo} dibatalkan.`);
  }
  renderOrderModalBody(order.id);
}

// ------------------------------------------------------------
// Product form / variant matrix
// ------------------------------------------------------------
// ------------------------------------------------------------
// Galeri foto produk (multi-foto, upload sungguhan ke Firebase Storage)
// ------------------------------------------------------------
const MAX_PRODUCT_PHOTOS = 9;

function renderProductPhotoGallery() {
  const container = els.productPhotoGallery;
  container.innerHTML = "";
  const sorted = [...state.productImages].sort((a, b) => a.order - b.order);

  sorted.forEach((img, idx) => {
    const item = document.createElement("div");
    item.className = "photo-thumb-item" + (img.isPrimary ? " is-primary" : "");

    if (img.uploading) {
      item.innerHTML = `<div class="photo-thumb-uploading"><span>${img.progress ?? 0}%</span></div>`;
    } else {
      item.innerHTML = `
        <img src="${escapeHtml(img.url)}" alt="" onerror="this.style.opacity='0.3'" />
        ${img.isPrimary ? `<span class="photo-primary-badge">Utama</span>` : ""}
        <div class="photo-thumb-actions">
          <button type="button" data-act="primary" title="Jadikan foto utama">★</button>
          <button type="button" data-act="left" title="Geser kiri" ${idx === 0 ? "disabled" : ""}>←</button>
          <button type="button" data-act="right" title="Geser kanan" ${idx === sorted.length - 1 ? "disabled" : ""}>→</button>
          <button type="button" data-act="remove" title="Hapus">&times;</button>
        </div>
      `;
      item.querySelector('[data-act="primary"]').addEventListener("click", () => setPrimaryProductImage(img.tempId));
      item.querySelector('[data-act="left"]').addEventListener("click", () => moveProductImage(img.tempId, -1));
      item.querySelector('[data-act="right"]').addEventListener("click", () => moveProductImage(img.tempId, 1));
      item.querySelector('[data-act="remove"]').addEventListener("click", () => removeProductImage(img.tempId));
    }
    container.appendChild(item);
  });

  els.btnUploadProductPhotoLabel.style.display = state.productImages.length >= MAX_PRODUCT_PHOTOS ? "none" : "";
  updatePreview();
}

function setPrimaryProductImage(tempId) {
  state.productImages.forEach((img) => { img.isPrimary = img.tempId === tempId; });
  renderProductPhotoGallery();
}

function moveProductImage(tempId, dir) {
  const sorted = [...state.productImages].sort((a, b) => a.order - b.order);
  const idx = sorted.findIndex((i) => i.tempId === tempId);
  const swapIdx = idx + dir;
  if (idx === -1 || swapIdx < 0 || swapIdx >= sorted.length) return;
  const tmp = sorted[idx].order;
  sorted[idx].order = sorted[swapIdx].order;
  sorted[swapIdx].order = tmp;
  renderProductPhotoGallery();
}

function removeProductImage(tempId) {
  const removed = state.productImages.find((i) => i.tempId === tempId);
  state.productImages = state.productImages.filter((i) => i.tempId !== tempId);
  if (removed?.isPrimary && state.productImages.length > 0) {
    state.productImages.sort((a, b) => a.order - b.order)[0].isPrimary = true;
  }
  renderProductPhotoGallery();
}

async function handleProductPhotoFiles(fileList) {
  const files = Array.from(fileList);
  const remainingSlots = MAX_PRODUCT_PHOTOS - state.productImages.length;
  if (remainingSlots <= 0) {
    showToast(`Maksimal ${MAX_PRODUCT_PHOTOS} foto produk.`);
    return;
  }
  for (const file of files.slice(0, remainingSlots)) {
    const tempId = "img-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6);
    const placeholder = { tempId, url: "", isPrimary: state.productImages.length === 0, order: state.productImages.length, uploading: true, progress: 0 };
    state.productImages.push(placeholder);
    renderProductPhotoGallery();
    try {
      const url = await uploadImageFile(file, "products", (pct) => {
        placeholder.progress = pct;
        renderProductPhotoGallery();
      });
      placeholder.url = url;
      placeholder.uploading = false;
      renderProductPhotoGallery();
    } catch (err) {
      showToast(err.message || "Gagal upload foto.");
      state.productImages = state.productImages.filter((i) => i.tempId !== tempId);
      renderProductPhotoGallery();
    }
  }
}

function resetProductForm() {
  els.productForm.reset();
  state.variantRows = [];
  state.editingProductId = null;
  state.previewSelectedIndex = null;
  state.previewPriceChannel = "offline";
  state.productImages = [];
  els.previewPriceToggle.querySelectorAll(".price-toggle-btn").forEach((b) => b.classList.toggle("is-active", b.dataset.channel === "offline"));
  els.productModalTitle.textContent = "Tambah produk baru";
  els.productSubmitBtn.textContent = "Simpan produk";
  renderVariantRowsTable();
  renderProductPhotoGallery();
}

/** Buka modal produk. Tanpa argumen = mode tambah baru. Dengan argumen produk = mode edit, form terisi otomatis. */
function openProductModal(product) {
  resetProductForm();
  if (product) {
    state.editingProductId = product.id;
    state.editingProductRevision = product.revision || 0;
    els.productModalTitle.textContent = `Edit produk — ${product.name}`;
    els.productSubmitBtn.textContent = "Simpan perubahan";

    const f = els.productForm.elements;
    f["name"].value = product.name || "";
    f["category"].value = product.category || "";
    f["description"].value = product.description || "";
    const basePricing = getProductBasePricing(product);
    f["hpp"].value = basePricing.hpp || "";
    f["priceOffline"].value = basePricing.priceOffline || "";
    f["priceOnline"].value = basePricing.priceOnline || "";
    f["weight"].value = product.weight ?? "";
    f["sku"].value = product.sku || "";
    f["status"].value = product.status || "aktif";

    state.productImages = getProductImages(product).map((img, i) => ({ ...img, tempId: "existing-" + i }));
    renderProductPhotoGallery();

    state.variantRows = (product.variants || []).map(normalizeVariantForEdit);
    renderVariantRowsTable();
  }
  els.productModal.hidden = false;
}

function slug(str) {
  return (str || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 3) || "GEN";
}

/** Tambah satu baris varian kosong (atau terisi, jika dipanggil dengan data awal). */
function addVariantRow(initial) {
  state.variantRows.push({ id: crypto.randomUUID(), image: "", color: "", size: "", hpp: null, priceOffline: null, priceOnline: null, stock: 0, sku: "", ...initial });
  renderVariantRowsTable();
}

function removeVariantRow(idx) {
  state.variantRows.splice(idx, 1);
  if (state.previewSelectedIndex === idx) state.previewSelectedIndex = null;
  renderVariantRowsTable();
}

function renderVariantRowsTable() {
  const container = els.variantCardsContainer;
  container.innerHTML = "";
  els.variantEmptyHint.hidden = state.variantRows.length > 0;

  state.variantRows.forEach((row, i) => {
    const card = document.createElement("div");
    card.className = "variant-card";
    card.innerHTML = `
      <div class="variant-card-head">
        <span>Varian ${i + 1}</span>
        <button type="button" class="variant-remove-btn" aria-label="Hapus varian">&times;</button>
      </div>
      <div class="variant-card-body">
        <div class="variant-photo-upload">
          <div class="variant-photo-preview">
            <span class="variant-photo-fallback">+</span>
            <img alt="" hidden />
          </div>
          <label class="btn btn--ghost variant-photo-upload-btn">
            Upload Foto
            <input type="file" accept="image/jpeg,image/jpg,image/png,image/webp" hidden />
          </label>
        </div>
        <div class="variant-card-fields">
          <label class="field"><span>Warna / Nama Varian</span><input type="text" data-field="color" value="${escapeHtml(row.color)}" placeholder="mis. Hitam" /></label>
          <label class="field"><span>Ukuran</span><input type="text" data-field="size" value="${escapeHtml(row.size)}" placeholder="mis. M" /></label>
          <label class="field"><span>SKU Varian</span><input type="text" data-field="sku" value="${escapeHtml(row.sku)}" placeholder="SKU" /></label>
          <label class="field"><span>HPP (Rp)</span><input type="number" min="0" data-field="hpp" value="${row.hpp ?? ""}" placeholder="Ikut dasar" /></label>
          <label class="field"><span>Harga Offline (Rp)</span><input type="number" min="0" data-field="priceOffline" value="${row.priceOffline ?? ""}" placeholder="Ikut dasar" /></label>
          <label class="field"><span>Harga Online (Rp)</span><input type="number" min="0" data-field="priceOnline" value="${row.priceOnline ?? ""}" placeholder="Ikut dasar" /></label>
          <label class="field"><span>Stok</span><input type="number" min="0" data-field="stock" value="${row.stock}" /></label>
        </div>
      </div>
    `;

    const preview = card.querySelector(".variant-photo-preview");
    const imgEl = preview.querySelector("img");
    const fallbackEl = preview.querySelector(".variant-photo-fallback");
    const syncPreview = () => {
      if (row.image) {
        imgEl.src = row.image;
        imgEl.hidden = false;
        imgEl.onerror = () => { imgEl.hidden = true; fallbackEl.hidden = false; };
        fallbackEl.hidden = true;
      } else {
        imgEl.hidden = true;
        fallbackEl.hidden = false;
      }
    };
    syncPreview();

    card.querySelector('input[type="file"]').addEventListener("change", async (e) => {
      const file = e.target.files[0];
      e.target.value = "";
      if (!file) return;
      fallbackEl.hidden = false;
      imgEl.hidden = true;
      fallbackEl.textContent = "…";
      try {
        const url = await uploadImageFile(file, "variants", (pct) => { fallbackEl.textContent = pct + "%"; });
        row.image = url;
        syncPreview();
        updatePreview();
      } catch (err) {
        showToast(err.message || "Gagal upload foto varian.");
        fallbackEl.textContent = "+";
      }
    });

    card.querySelectorAll("[data-field]").forEach((input) => {
      input.addEventListener("input", (e) => {
        const field = e.target.dataset.field;
        if (["hpp", "priceOffline", "priceOnline"].includes(field)) row[field] = e.target.value === "" ? null : Number(e.target.value);
        else if (field === "stock") row.stock = Number(e.target.value) || 0;
        else row[field] = e.target.value;
        updatePreview();
      });
    });

    card.querySelector(".variant-remove-btn").addEventListener("click", () => removeVariantRow(i));
    container.appendChild(card);
  });

  updatePreview();
}

/** Perbarui panel pratinjau kartu produk (judul, rentang harga, thumbnail, foto utama) — dipanggil setiap ada perubahan input. */
function updatePreview() {
  const f = els.productForm.elements;
  const name = f["name"].value.trim();
  const description = f["description"].value.trim();
  const primaryGalleryImg = state.productImages.find((i) => i.isPrimary && !i.uploading) || state.productImages.find((i) => !i.uploading);
  const mainPhotoUrl = primaryGalleryImg ? primaryGalleryImg.url : "";

  els.previewTitle.textContent = name || "Nama produk akan tampil di sini";
  els.previewDesc.textContent = description;
  els.previewDesc.hidden = !description;

  // Sumber harga preview mengikuti channel yang dipilih di toggle (default: Offline).
  const channel = state.previewPriceChannel; // "offline" | "online"
  const priceField = channel === "online" ? "priceOnline" : "priceOffline";
  const variantField = channel === "online" ? "priceOnline" : "priceOffline";
  const basePrice = Number(f[priceField].value) || 0;

  const prices = state.variantRows.map((r) => (r[variantField] === null || r[variantField] === undefined || r[variantField] === "" ? basePrice : Number(r[variantField])));
  if (prices.length === 0) {
    els.previewPrice.textContent = formatRupiah(basePrice);
  } else {
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    els.previewPrice.textContent = min === max ? formatRupiah(min) : `${formatRupiah(min)} - ${formatRupiah(max)}`;
  }

  const filledVariants = state.variantRows.map((r, i) => ({ ...r, _idx: i })).filter((r) => r.color || r.size || r.image);
  els.previewThumbs.innerHTML = "";
  filledVariants.forEach((v) => {
    const thumb = document.createElement("div");
    thumb.className = "shopee-thumb" + (state.previewSelectedIndex === v._idx ? " is-active" : "");
    thumb.innerHTML = v.image
      ? `<img src="${escapeHtml(v.image)}" alt="" onerror="this.style.display='none'" />`
      : `<span class="shopee-thumb-fallback">${escapeHtml(variantLabel(v)).slice(0, 12)}</span>`;
    thumb.addEventListener("click", () => {
      state.previewSelectedIndex = v._idx;
      updatePreview();
    });
    els.previewThumbs.appendChild(thumb);
  });

  let mainImage = "";
  if (state.previewSelectedIndex !== null && state.variantRows[state.previewSelectedIndex]?.image) {
    mainImage = state.variantRows[state.previewSelectedIndex].image;
  } else if (mainPhotoUrl) {
    mainImage = mainPhotoUrl;
  } else {
    const firstWithImage = state.variantRows.find((r) => r.image);
    if (firstWithImage) mainImage = firstWithImage.image;
  }

  if (mainImage) {
    els.previewMainImg.src = mainImage;
    els.previewMainImg.hidden = false;
    els.previewMainImg.onerror = () => { els.previewMainImg.hidden = true; els.previewMainFallback.hidden = false; };
    els.previewMainFallback.hidden = true;
  } else {
    els.previewMainImg.hidden = true;
    els.previewMainFallback.hidden = false;
  }
}

// ============================================================
// 4. NAVIGATION & EVENTS
// ============================================================
function navigateTo(view) {
  const module={reseller:'resellers',pengiriman:'couriers',jadwal:'slots',retur:'claims'}[view];
  if(module){showOperational(module);return;}
  const destination=document.getElementById('view-'+view);if(!destination)return;
  document.getElementById('operational-frame').src='about:blank';toggleDrawer(false);
  document.getElementById('breadcrumb-title').textContent=view==='dashboard'?'Ringkasan toko':destination.querySelector('h1')?.textContent||'Admin';
  state.view = view;
  document.querySelectorAll(".view").forEach((v) => (v.hidden = true));
  document.getElementById("view-" + view).hidden = false;
  document.querySelectorAll(".nav-item[data-view]").forEach((btn) => btn.classList.toggle("is-active", btn.dataset.view === view));
  if (view === "pengaturan") applySettingsToForm();
  if (view === "kalkulator") renderKalkulatorCompare();
  renderAll();
}

function bindEvents() {
  bindAdminDashboard();
  els.loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    showLoginError("");
    const f = new FormData(els.loginForm);
    const email = f.get("email").trim();
    const password = f.get("password");

    els.loginSubmitBtn.disabled = true;
    els.loginSubmitBtn.textContent = "Memproses…";
    try {
      await authFns.signInWithEmailAndPassword(authInstance, email, password);
      // onAuthStateChanged yang akan menangani transisi ke dashboard.
    } catch (err) {
      showLoginError(mapAuthErrorMessage(err.code));
    } finally {
      els.loginSubmitBtn.disabled = false;
      els.loginSubmitBtn.textContent = "Masuk";
    }
  });

  els.btnLogout.addEventListener("click", async () => {
    if (!authInstance || !authFns) return;
    await authFns.signOut(authInstance);
    // onAuthStateChanged yang akan menampilkan kembali layar login.
  });

  document.querySelectorAll(".nav-item[data-view]:not(.is-disabled)").forEach((btn) => {
    btn.addEventListener("click", () => navigateTo(btn.dataset.view));
  });
  document.querySelectorAll("[data-goto]").forEach((btn) => {
    btn.addEventListener("click", () => navigateTo(btn.dataset.goto));
  });

  els.dashCustomDate.addEventListener("change", (e) => {
    state.dashCustomDate = e.target.value;
    renderDashboard();
  });

  els.orderSearch.addEventListener("input", (e) => { state.orderSearch = e.target.value; renderOrdersView(); });

  els.btnAddOrder.addEventListener("click", openCreateOrderModal);
  els.btnAddOrderItem.addEventListener("click", addOrderItemRow);
  els.createOrderForm.elements["shippingCost"].addEventListener("input", updateCreateOrderTotals);

  els.createOrderForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = new FormData(els.createOrderForm);

    const items = state.orderItemRows
      .filter((r) => r.productId && r.variantId)
      .map((r) => ({ productId:r.productId, variantId:r.variantId, productName: r.productName, variant: r.variantName, qty: r.qty, price: r.price }));

    if (items.length === 0) {
      showToast("Tambahkan minimal 1 item dengan produk & varian yang valid.");
      return;
    }

    const shippingCost = Number(f.get("shippingCost")) || 0;
    const subtotal = items.reduce((s, it) => s + it.price * it.qty, 0);
    const status = f.get("status");

    const order = {
      invoiceNo: generateInvoiceNo(),
      customerName: f.get("customerName").trim(),
      phone: f.get("phone").trim(),
      address: f.get("address").trim(),
      items,
      shippingCost,
      total: subtotal + shippingCost,
      status,
      courier: "",
      trackingNumber: "",
      statusHistory: [{ status, at: new Date().toISOString() }],
    };

    await addOrder(order);
    closeModals();
    navigateTo("pesanan");
    showToast(`Pesanan ${order.invoiceNo} tersimpan.`);
  });
  els.productSearch.addEventListener("input", (e) => { state.productSearch = e.target.value; renderProductsView(); });

  document.querySelectorAll("[data-close-modal]").forEach((btn) => btn.addEventListener("click", closeModals));
  [els.orderModal, els.productModal, els.customerModal, els.transactionModal, els.createOrderModal, els.employeeModal, els.positionModal, els.reviewModal, els.reviewDetailModal, els.contractReviewModal, els.decisionModal, els.payrollModal, els.massPayrollModal, els.slipModal].forEach((overlay) => {
    overlay.addEventListener("click", (e) => { if (e.target === overlay) closeModals(); });
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModals(); });

  els.btnAddProduct.addEventListener("click", () => openProductModal());

  els.btnDownloadTemplate.addEventListener("click", downloadProductTemplate);
  els.importExcelInput.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = ""; // reset supaya file yang sama bisa dipilih lagi nanti
    await handleImportExcel(file);
  });
  els.importModalClose.addEventListener("click", () => { els.importModal.hidden = true; });

  // ---- Kalkulator Pintar ----
  [els.calcHpp, els.calcCutPct, els.calcPriceOffline, els.calcPriceOnline].forEach((input) => {
    input.addEventListener("input", renderKalkulatorCompare);
  });
  document.querySelectorAll(".calc-preset-btn").forEach((btn) => {
    btn.addEventListener("click", () => applyCalcPreset(Number(btn.dataset.multiplier)));
  });

  els.btnAddVariantRow.addEventListener("click", () => addVariantRow());
  ["name", "description", "priceOffline", "priceOnline"].forEach((fieldName) => {
    els.productForm.elements[fieldName].addEventListener("input", updatePreview);
  });
  els.productPhotoInput.addEventListener("change", async (e) => {
    if (e.target.files.length > 0) await handleProductPhotoFiles(e.target.files);
    e.target.value = "";
  });
  els.previewPriceToggle.querySelectorAll(".price-toggle-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.previewPriceChannel = btn.dataset.channel;
      els.previewPriceToggle.querySelectorAll(".price-toggle-btn").forEach((b) => b.classList.toggle("is-active", b === btn));
      updatePreview();
    });
  });

  els.productForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = new FormData(els.productForm);

    if (state.productImages.some((i) => i.uploading)) {
      showToast("Tunggu proses upload foto sampai selesai sebelum menyimpan.");
      return;
    }
    if (state.productImages.length === 0) {
      showToast("Tambahkan minimal 1 foto produk utama.");
      return;
    }

    const baseHpp = Number(f.get("hpp")) || 0;
    const basePriceOffline = Number(f.get("priceOffline")) || 0;
    const basePriceOnline = Number(f.get("priceOnline")) || 0;

    // Baris tanpa Warna maupun Ukuran diabaikan, bukan dianggap error.
    const variants = state.variantRows
      .filter((r) => r.color.trim() !== "" || r.size.trim() !== "")
      .map((r) => ({
        id: r.id || crypto.randomUUID(),
        image: r.image.trim(),
        color: r.color.trim(),
        size: r.size.trim(),
        sku: r.sku.trim(),
        hpp: r.hpp === null || r.hpp === "" ? baseHpp : Number(r.hpp),
        priceOffline: r.priceOffline === null || r.priceOffline === "" ? basePriceOffline : Number(r.priceOffline),
        priceOnline: r.priceOnline === null || r.priceOnline === "" ? basePriceOnline : Number(r.priceOnline),
        stock: Number(r.stock) || 0,
      }));

    if (variants.length === 0) {
      showToast("Tambahkan minimal 1 varian (isi Warna atau Ukuran) sebelum menyimpan.");
      return;
    }

    const images = state.productImages
      .slice()
      .sort((a, b) => a.order - b.order)
      .map(({ url, isPrimary }, order) => ({ url, isPrimary, order }));
    const primaryImage = images.find((i) => i.isPrimary) || images[0];

    const totalStock = variants.reduce((s, v) => s + v.stock, 0);
    const product = {
      name: f.get("name").trim(),
      category: f.get("category").trim(),
      description: f.get("description").trim(),
      hpp: baseHpp,
      priceOffline: basePriceOffline,
      priceOnline: basePriceOnline,
      weight: Number(f.get("weight")) || 0,
      sku: f.get("sku").trim() || slug(f.get("name")),
      status: f.get("status"),
      images,
      photoUrl: primaryImage.url, // cermin foto utama, dipakai kode lama yang masih baca photoUrl tunggal
      variants,
      totalStock,
    };

    if (state.editingProductId) {
      await updateProduct(state.editingProductId, product);
      closeModals();
      navigateTo("produk");
      showToast(`Produk "${product.name}" diperbarui.`);
    } else {
      await addProduct(product);
      closeModals();
      navigateTo("produk");
      showToast(`Produk "${product.name}" tersimpan.`);
    }
  });

  // ---- Pelanggan ----
  els.customerSearch.addEventListener("input", (e) => { state.customerSearch = e.target.value; renderPelangganView(); });

  // ---- Karyawan ----
  els.karyawanTabs.querySelectorAll(".tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.karyawanTab = btn.dataset.karyawanTab;
      els.karyawanTabs.querySelectorAll(".tab").forEach((t) => t.classList.toggle("is-active", t === btn));
      els.karyawanTabDashboard.hidden = state.karyawanTab !== "dashboard";
      els.karyawanTabData.hidden = state.karyawanTab !== "data";
      els.karyawanTabPenilaian.hidden = state.karyawanTab !== "penilaian";
      els.karyawanTabKontrak.hidden = state.karyawanTab !== "kontrak";
      els.karyawanTabPayroll.hidden = state.karyawanTab !== "payroll";
      els.karyawanTabLaporan.hidden = state.karyawanTab !== "laporan";
      renderKaryawanView();
    });
  });

  els.employeeSearch.addEventListener("input", (e) => { state.employeeSearch = e.target.value; renderEmployeeTable(); });
  els.employeeFilterPosition.addEventListener("change", (e) => { state.employeeFilterPosition = e.target.value; renderEmployeeTable(); });
  els.employeeFilterWorkStatus.addEventListener("change", (e) => { state.employeeFilterWorkStatus = e.target.value; renderEmployeeTable(); });
  els.employeeFilterStatus.addEventListener("change", (e) => { state.employeeFilterStatus = e.target.value; renderEmployeeTable(); });

  els.btnAddEmployee.addEventListener("click", () => openEmployeeModal());
  els.employeeWorkStatusSelect.addEventListener("change", toggleEmployeeContractSection);

  els.employeePhotoInput.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    state.employeePhoto = { uploading: true, progress: 0 };
    renderEmployeePhotoPreview();
    try {
      const url = await uploadImageFile(file, "employees", (pct) => {
        state.employeePhoto.progress = pct;
        renderEmployeePhotoPreview();
      });
      state.employeePhoto = { url };
      renderEmployeePhotoPreview();
    } catch (err) {
      showToast(err.message || "Gagal upload foto karyawan.");
      state.employeePhoto = null;
      renderEmployeePhotoPreview();
    }
  });

  els.btnAddPosition.addEventListener("click", () => {
    els.positionForm.reset();
    els.positionModal.hidden = false;
  });

  els.positionForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = new FormData(els.positionForm);
    const position = { name: f.get("name").trim(), department: f.get("department").trim() };
    const newId = await addPosition(position);
    els.positionModal.hidden = true;
    populateEmployeeFormDropdowns(state.editingEmployeeId);
    els.employeePositionSelect.value = newId;
    showToast(`Posisi "${position.name}" ditambahkan.`);
  });

  // ---- Penilaian Kinerja ----
  els.reviewSearch.addEventListener("input", (e) => { state.reviewSearch = e.target.value; renderReviewListView(); });
  els.reviewFilterPosition.addEventListener("change", (e) => { state.reviewFilterPosition = e.target.value; renderReviewListView(); });
  els.reviewFilterCategory.addEventListener("change", (e) => { state.reviewFilterCategory = e.target.value; renderReviewListView(); });
  els.reviewFilterRecommendation.addEventListener("change", (e) => { state.reviewFilterRecommendation = e.target.value; renderReviewListView(); });
  els.btnAddReview.addEventListener("click", () => openReviewModal());

  els.reviewEmployeeSelect.addEventListener("change", handleReviewEmployeeChange);
  els.reviewPeriodType.addEventListener("change", handlePeriodTypeChange);
  els.reviewPeriodStart.addEventListener("change", handlePeriodTypeChange);

  els.reviewForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const employee = state.employees.find((emp) => emp.id === els.reviewEmployeeSelect.value);
    if (!employee) {
      showToast("Pilih karyawan yang akan dinilai.");
      return;
    }
    const periodStart = els.reviewPeriodStart.value;
    const periodEnd = els.reviewPeriodEnd.value;
    if (!periodStart || !periodEnd) {
      showToast("Tanggal mulai dan selesai periode wajib diisi.");
      return;
    }
    if (new Date(periodEnd) < new Date(periodStart)) {
      showToast("Tanggal selesai tidak boleh sebelum tanggal mulai.");
      return;
    }
    if (Object.keys(state.reviewGeneralScores).length < GENERAL_REVIEW_ITEMS.length) {
      showToast("Lengkapi semua nilai Penilaian Umum (1-5).");
      return;
    }
    const positionName = positionLabel(employee.positionId);
    const kpiItems = getKpiItemsForPosition(positionName);
    if (kpiItems.length > 0 && Object.keys(state.reviewKpiScores).length < kpiItems.length) {
      showToast("Lengkapi semua nilai KPI Posisi (1-5).");
      return;
    }

    const { generalScore, kpiScore, finalScore, category } = computeReviewScores();
    const f = new FormData(els.reviewForm);

    const review = {
      employeeId: employee.id,
      employeeName: employee.name,
      employeeCode: employee.employeeId || "",
      positionId: employee.positionId || "",
      positionName,
      periodType: els.reviewPeriodType.value,
      periodStart,
      periodEnd,
      generalScores: { ...state.reviewGeneralScores },
      kpiScores: kpiItems.length > 0 ? { ...state.reviewKpiScores } : {},
      generalScore,
      kpiScore: kpiItems.length > 0 ? kpiScore : null,
      finalScore,
      category,
      strengths: f.get("strengths").trim(),
      improvements: f.get("improvements").trim(),
      managerNotes: f.get("managerNotes").trim(),
      nextTargets: f.get("nextTargets").trim(),
      recommendation: f.get("recommendation"),
      createdBy: authInstance?.currentUser?.email || "admin",
    };

    if (state.editingReviewId) {
      await updatePerformanceReview(state.editingReviewId, review);
      closeModals();
      navigateTo("karyawan");
      showToast(`Penilaian ${employee.name} diperbarui.`);
    } else {
      await addPerformanceReview(review);
      closeModals();
      navigateTo("karyawan");
      showToast(`Penilaian ${employee.name} tersimpan.`);
    }
  });

  els.employeeForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (state.employeePhoto?.uploading) {
      showToast("Tunggu upload foto selesai sebelum menyimpan.");
      return;
    }
    const f = new FormData(els.employeeForm);
    if (!f.get("positionId")) {
      showToast("Posisi/Jabatan wajib dipilih.");
      return;
    }
    const workStatus = f.get("workStatus");
    if (workStatus === "Kontrak") {
      const start = f.get("contractStart");
      const end = f.get("contractEnd");
      if (start && end && new Date(end) < new Date(start)) {
        showToast("Tanggal berakhir kontrak tidak boleh sebelum tanggal mulai.");
        return;
      }
    }

    const employee = {
      name: f.get("name").trim(),
      gender: f.get("gender"),
      birthPlace: f.get("birthPlace").trim(),
      birthDate: f.get("birthDate"),
      phone: f.get("phone").trim(),
      email: f.get("email").trim(),
      address: f.get("address").trim(),
      positionId: f.get("positionId"),
      supervisorId: f.get("supervisorId") || "",
      joinDate: f.get("joinDate"),
      workStatus,
      employeeStatus: f.get("employeeStatus"),
      contractStart: workStatus === "Kontrak" ? f.get("contractStart") : "",
      contractEnd: workStatus === "Kontrak" ? f.get("contractEnd") : "",
      contractNumber: workStatus === "Kontrak" ? f.get("contractNumber").trim() : "",
      contractNote: workStatus === "Kontrak" ? f.get("contractNote").trim() : "",
      baseSalary: Number(f.get("baseSalary")) || 0,
      salaryNote: f.get("salaryNote").trim(),
      photoUrl: state.employeePhoto?.url || "",
    };

    if (state.editingEmployeeId) {
      await updateEmployee(state.editingEmployeeId, employee);
      closeModals();
      navigateTo("karyawan");
      showToast(`Data karyawan "${employee.name}" diperbarui.`);
    } else {
      employee.employeeId = generateEmployeeId();
      await addEmployee(employee);
      closeModals();
      navigateTo("karyawan");
      showToast(`Karyawan "${employee.name}" ditambahkan (${employee.employeeId}).`);
    }
  });

  // ---- Payroll ----
  els.payrollFilterPeriod.addEventListener("input", (e) => { state.payrollFilterPeriod = e.target.value; renderPayrollView(); });
  els.payrollFilterStatus.addEventListener("change", (e) => { state.payrollFilterStatus = e.target.value; renderPayrollView(); });
  els.btnAddPayroll.addEventListener("click", () => openPayrollModal());
  els.btnMassPayroll.addEventListener("click", () => openMassPayrollModal());

  els.payrollStatus.addEventListener("change", () => { els.payrollPaymentDate.required = els.payrollStatus.value === "Dibayar"; });
  els.payrollEmployeeSelect.addEventListener("change", handlePayrollEmployeeChange);
  els.payrollAllowance.addEventListener("input", updatePayrollTotals);
  els.payrollBonus.addEventListener("input", updatePayrollTotals);
  els.payrollIncentive.addEventListener("input", updatePayrollTotals);
  els.btnAddDeduction.addEventListener("click", () => {
    state.payrollDeductionRows.push({ type: DEDUCTION_TYPES[0], date: toDateInputValue(new Date()), description: "", amount: 0 });
    renderDeductionRows();
    updatePayrollTotals();
  });

  els.payrollForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const employee = state.employees.find((emp) => emp.id === els.payrollEmployeeSelect.value);
    if (!employee) { showToast("Pilih karyawan."); return; }
    const period = els.payrollPeriod.value;
    if (!period) { showToast("Periode wajib diisi."); return; }

    const dup = findExistingPayroll(employee.id, period, state.editingPayrollId);
    if (dup) {
      showToast("Payroll karyawan ini untuk periode tersebut sudah tersedia.");
      return;
    }

    const t = computePayrollTotals();
    const payroll = {
      employeeId: employee.id,
      employeeName: employee.name,
      employeeCode: employee.employeeId || "",
      positionName: positionLabel(employee.positionId),
      period,
      baseSalary: t.baseSalary,
      allowance: t.allowance,
      bonus: t.bonus,
      incentive: t.incentive,
      totalIncome: t.totalIncome,
      deductions: state.payrollDeductionRows.filter((r) => (r.amount || 0) > 0 || r.description).map((r) => ({ ...r })),
      totalDeduction: t.totalDeduction,
      netSalary: t.netSalary,
      status: els.payrollStatus.value,
      paymentDate: els.payrollPaymentDate.value,
      paymentMethod: els.payrollPaymentMethod.value,
    };

    els.payrollSubmitBtn.disabled = true;
    try {
    state.payrollFilterPeriod = "";
    state.payrollFilterStatus = "";
    els.payrollFilterPeriod.value = "";
    els.payrollFilterStatus.value = "";
    if (state.editingPayrollId) {
      await updatePayroll(state.editingPayrollId, payroll);
      closeModals();
      navigateTo("karyawan");
      showToast(`Payroll ${employee.name} diperbarui.`);
    } else {
      await addPayroll(payroll);
      closeModals();
      navigateTo("karyawan");
      showToast(`Payroll ${employee.name} untuk ${formatPeriodLabel(period)} tersimpan.`);
    }
    } catch (err) {
      console.error("Gagal menyimpan payroll", err);
      showToast("Payroll gagal disimpan. Periksa koneksi dan izin akses, lalu coba lagi.");
    } finally {
      els.payrollSubmitBtn.disabled = false;
    }
  });

  els.btnMassCalculate.addEventListener("click", handleMassCalculate);
  els.btnMassProcess.addEventListener("click", handleMassProcess);

  els.btnSlipPdf.addEventListener("click", () => downloadSlipPdf(state.viewingSlipPayroll));
  els.btnSlipPng.addEventListener("click", () => downloadSlipPng(state.viewingSlipPayroll));
  els.btnSlipShare.addEventListener("click", () => sharePayslip(state.viewingSlipPayroll, state.viewingSlipEmployee));
  els.btnSlipShareEmployee.addEventListener("click", () => sharePayslip(state.viewingSlipPayroll, state.viewingSlipEmployee, state.viewingSlipEmployee?.phone));

  // ---- Export Excel ----
  els.btnExportEmployees.addEventListener("click", exportEmployeesToExcel);
  els.btnExportReviews.addEventListener("click", exportReviewsToExcel);
  els.btnExportContracts.addEventListener("click", exportContractsToExcel);
  els.btnExportPayroll.addEventListener("click", exportPayrollToExcel);

  // ---- Laporan HR ----
  els.reportFilterMonth.addEventListener("change", renderLaporanView);
  els.reportFilterYear.addEventListener("input", renderLaporanView);
  els.reportFilterPosition.addEventListener("change", renderLaporanView);
  els.reportFilterWorkStatus.addEventListener("change", renderLaporanView);

  els.btnAddCustomer.addEventListener("click", () => openCustomerModal());

  els.customerForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = new FormData(els.customerForm);
    const customer = {
      name: f.get("name").trim(),
      phone: f.get("phone").trim(),
      address: f.get("address").trim(),
    };
    if (state.editingCustomerId) {
      await updateCustomer(state.editingCustomerId, customer);
      showToast(`Pelanggan "${customer.name}" diperbarui.`);
    } else {
      const result = await upsertCustomer(customer);
      showToast(result.updated ? `No. HP sudah terdaftar — data "${customer.name}" diperbarui.` : `Pelanggan "${customer.name}" ditambahkan.`);
    }
    closeModals();
    navigateTo("pelanggan");
  });

  // ---- Keuangan ----
  els.btnAddTransaction.addEventListener("click", () => {
    els.transactionForm.reset();
    els.transactionForm.elements["date"].value = toDateInputValue(new Date());
    els.transactionModal.hidden = false;
  });

  els.transactionForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = new FormData(els.transactionForm);
    const tx = {
      date: f.get("date"),
      description: f.get("description").trim(),
      category: f.get("category").trim(),
      type: f.get("type"),
      amount: Number(f.get("amount")) || 0,
    };
    await addTransaction(tx);
    els.transactionForm.reset();
    closeModals();
    navigateTo("keuangan");
    showToast("Transaksi tersimpan.");
  });

  // ---- Pengaturan ----
  els.settingsForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = new FormData(els.settingsForm);
    const button=e.submitter;button.disabled=true;
    try { await saveSettings({
      storeName: f.get("storeName").trim(),
      tagline: f.get("tagline").trim(),
      address: f.get("address").trim(),
      phone: f.get("phone").trim(),
      logoUrl: f.get("logoUrl").trim(),
      storeUrl: f.get("storeUrl").trim(),
    });
    showToast("Pengaturan toko disimpan.");
    }catch(error){showToast(error.message||'Pengaturan gagal disimpan.');}finally{button.disabled=false;}
  });
}

// ============================================================
// INIT
// ============================================================
function cacheEls() {
  els.authScreen = document.getElementById("auth-screen");
  els.authChecking = document.getElementById("auth-checking");
  els.loginForm = document.getElementById("login-form");
  els.loginError = document.getElementById("login-error");
  els.loginSubmitBtn = document.getElementById("login-submit-btn");
  els.appRoot = document.getElementById("app-root");
  els.btnLogout = document.getElementById("btn-logout");

  els.connBadge = document.getElementById("conn-badge");
  els.connLabel = document.getElementById("conn-label");
  els.navBadgePesanan = document.getElementById("nav-badge-pesanan");

  els.todayDate = document.getElementById("today-date");
  els.periodFilter = document.getElementById("period-filter");
  els.dashCustomDate = document.getElementById("dash-custom-date");
  els.statNewOrders = document.getElementById("stat-new-orders");
  els.statVerify = document.getElementById("stat-verify");
  els.statRevenue = document.getElementById("stat-revenue");
  els.statLowstock = document.getElementById("stat-lowstock");
  els.actionList = document.getElementById("action-list");
  els.chartTitle = document.getElementById("chart-title");
  els.salesChart = document.getElementById("sales-chart");
  els.tableRecentOrders = document.getElementById("table-recent-orders");

  els.orderTabs = document.getElementById("order-tabs");
  els.orderSearch = document.getElementById("order-search");
  els.orderCount = document.getElementById("order-count");
  els.tableOrders = document.getElementById("table-orders");
  els.btnAddOrder = document.getElementById("btn-add-order");
  els.createOrderModal = document.getElementById("create-order-modal");
  els.createOrderForm = document.getElementById("create-order-form");
  els.btnAddOrderItem = document.getElementById("btn-add-order-item");
  els.orderItemRowsTable = document.getElementById("order-item-rows-table");
  els.orderItemEmptyHint = document.getElementById("order-item-empty-hint");
  els.createOrderSubtotal = document.getElementById("create-order-subtotal");
  els.createOrderTotal = document.getElementById("create-order-total");

  els.productSearch = document.getElementById("product-search");
  els.tableProducts = document.getElementById("table-products");
  els.btnAddProduct = document.getElementById("btn-add-product");
  els.btnDownloadTemplate = document.getElementById("btn-download-template");
  els.importExcelInput = document.getElementById("import-excel-input");
  els.importModal = document.getElementById("import-modal");
  els.importModalClose = document.getElementById("import-modal-close");
  els.importStatusText = document.getElementById("import-status-text");
  els.importProgressBar = document.getElementById("import-progress-bar");
  els.importLog = document.getElementById("import-log");

  els.calcHpp = document.getElementById("calc-hpp");
  els.calcCutPct = document.getElementById("calc-cut-pct");
  els.calcPriceOffline = document.getElementById("calc-price-offline");
  els.calcPriceOnline = document.getElementById("calc-price-online");
  els.calcMarginBadge = document.getElementById("calc-margin-badge");
  els.calcCompareTable = document.getElementById("calc-compare-table");

  els.orderModal = document.getElementById("order-modal");
  els.orderModalBody = document.getElementById("order-modal-body");

  els.productModal = document.getElementById("product-modal");
  els.productModalTitle = document.getElementById("product-modal-title");
  els.productSubmitBtn = document.getElementById("product-submit-btn");
  els.productForm = document.getElementById("product-form");
  els.variantCardsContainer = document.getElementById("variant-cards");
  els.btnAddVariantRow = document.getElementById("btn-add-variant-row");
  els.variantEmptyHint = document.getElementById("variant-empty-hint");
  els.productPhotoGallery = document.getElementById("product-photo-gallery");
  els.productPhotoInput = document.getElementById("product-photo-input");
  els.btnUploadProductPhotoLabel = document.getElementById("btn-upload-product-photo");
  els.previewMainPhoto = document.getElementById("preview-main-photo");
  els.previewMainImg = document.getElementById("preview-main-img");
  els.previewMainFallback = document.getElementById("preview-main-fallback");
  els.previewThumbs = document.getElementById("preview-thumbs");
  els.previewTitle = document.getElementById("preview-title");
  els.previewPrice = document.getElementById("preview-price");
  els.previewDesc = document.getElementById("preview-desc");
  els.previewPriceToggle = document.getElementById("preview-price-toggle");

  els.customerSearch = document.getElementById("customer-search");
  els.btnAddCustomer = document.getElementById("btn-add-customer");
  els.tableCustomers = document.getElementById("table-customers");

  els.karyawanTabs = document.getElementById("karyawan-tabs");
  els.karyawanTabDashboard = document.getElementById("karyawan-tab-dashboard");
  els.karyawanTabData = document.getElementById("karyawan-tab-data");
  els.empStatTotal = document.getElementById("emp-stat-total");
  els.empStatActive = document.getElementById("emp-stat-active");
  els.empStatExpiring = document.getElementById("emp-stat-expiring");
  els.empStatNeedReview = document.getElementById("emp-stat-need-review");
  els.empStatAvgScore = document.getElementById("emp-stat-avg-score");
  els.empStatPayrollMonth = document.getElementById("emp-stat-payroll-month");
  els.empContractAlertList = document.getElementById("emp-contract-alert-list");
  els.empReviewAlertList = document.getElementById("emp-review-alert-list");
  els.empRecentReviewsList = document.getElementById("emp-recent-reviews-list");
  els.employeeSearch = document.getElementById("employee-search");
  els.employeeFilterPosition = document.getElementById("employee-filter-position");
  els.employeeFilterWorkStatus = document.getElementById("employee-filter-workstatus");
  els.employeeFilterStatus = document.getElementById("employee-filter-status");
  els.btnAddEmployee = document.getElementById("btn-add-employee");
  els.tableEmployees = document.getElementById("table-employees");
  els.employeeModal = document.getElementById("employee-modal");
  els.employeeModalTitle = document.getElementById("employee-modal-title");
  els.employeeSubmitBtn = document.getElementById("employee-submit-btn");
  els.employeeForm = document.getElementById("employee-form");
  els.employeeIdDisplay = document.getElementById("employee-id-display");
  els.employeePhotoPreview = document.getElementById("employee-photo-preview");
  els.employeePhotoInput = document.getElementById("employee-photo-input");
  els.employeePositionSelect = document.getElementById("employee-position-select");
  els.employeeSupervisorSelect = document.getElementById("employee-supervisor-select");
  els.employeeWorkStatusSelect = document.getElementById("employee-workstatus-select");
  els.employeeContractSection = document.getElementById("employee-contract-section");
  els.btnAddPosition = document.getElementById("btn-add-position");
  els.positionModal = document.getElementById("position-modal");
  els.positionForm = document.getElementById("position-form");

  els.karyawanTabPenilaian = document.getElementById("karyawan-tab-penilaian");
  els.reviewSearch = document.getElementById("review-search");
  els.reviewFilterPosition = document.getElementById("review-filter-position");
  els.reviewFilterCategory = document.getElementById("review-filter-category");
  els.reviewFilterRecommendation = document.getElementById("review-filter-recommendation");
  els.btnAddReview = document.getElementById("btn-add-review");
  els.tableReviews = document.getElementById("table-reviews");
  els.reviewModal = document.getElementById("review-modal");
  els.reviewModalTitle = document.getElementById("review-modal-title");
  els.reviewSubmitBtn = document.getElementById("review-submit-btn");
  els.reviewForm = document.getElementById("review-form");
  els.reviewEmployeeSelect = document.getElementById("review-employee-select");
  els.reviewEmployeeInfo = document.getElementById("review-employee-info");
  els.reviewPeriodType = document.getElementById("review-period-type");
  els.reviewPeriodStart = document.getElementById("review-period-start");
  els.reviewPeriodEnd = document.getElementById("review-period-end");
  els.reviewGeneralItems = document.getElementById("review-general-items");
  els.reviewKpiBlock = document.getElementById("review-kpi-block");
  els.reviewKpiItems = document.getElementById("review-kpi-items");
  els.reviewNoKpiHint = document.getElementById("review-no-kpi-hint");
  els.reviewGeneralScoreDisplay = document.getElementById("review-general-score-display");
  els.reviewKpiScoreRow = document.getElementById("review-kpi-score-row");
  els.reviewKpiScoreDisplay = document.getElementById("review-kpi-score-display");
  els.reviewFinalScoreDisplay = document.getElementById("review-final-score-display");
  els.reviewCategoryBadge = document.getElementById("review-category-badge");
  els.reviewDetailModal = document.getElementById("review-detail-modal");
  els.reviewDetailBody = document.getElementById("review-detail-body");

  els.karyawanTabKontrak = document.getElementById("karyawan-tab-kontrak");
  els.tableContracts = document.getElementById("table-contracts");
  els.contractReviewModal = document.getElementById("contract-review-modal");
  els.contractReviewBody = document.getElementById("contract-review-body");
  els.decisionModal = document.getElementById("decision-modal");
  els.decisionBody = document.getElementById("decision-body");

  els.karyawanTabPayroll = document.getElementById("karyawan-tab-payroll");
  els.payrollFilterPeriod = document.getElementById("payroll-filter-period");
  els.payrollFilterStatus = document.getElementById("payroll-filter-status");
  els.btnMassPayroll = document.getElementById("btn-mass-payroll");
  els.btnAddPayroll = document.getElementById("btn-add-payroll");
  els.tablePayrolls = document.getElementById("table-payrolls");
  els.payrollModal = document.getElementById("payroll-modal");
  els.payrollModalTitle = document.getElementById("payroll-modal-title");
  els.payrollSubmitBtn = document.getElementById("payroll-submit-btn");
  els.payrollForm = document.getElementById("payroll-form");
  els.payrollEmployeeSelect = document.getElementById("payroll-employee-select");
  els.payrollPeriod = document.getElementById("payroll-period");
  els.payrollBaseSalaryDisplay = document.getElementById("payroll-base-salary-display");
  els.payrollAllowance = document.getElementById("payroll-allowance");
  els.payrollBonus = document.getElementById("payroll-bonus");
  els.payrollIncentive = document.getElementById("payroll-incentive");
  els.btnAddDeduction = document.getElementById("btn-add-deduction");
  els.payrollDeductionsList = document.getElementById("payroll-deductions-list");
  els.payrollDeductionsEmptyHint = document.getElementById("payroll-deductions-empty-hint");
  els.payrollTotalIncome = document.getElementById("payroll-total-income");
  els.payrollTotalDeduction = document.getElementById("payroll-total-deduction");
  els.payrollNetSalary = document.getElementById("payroll-net-salary");
  els.payrollStatus = document.getElementById("payroll-status");
  els.payrollPaymentDate = document.getElementById("payroll-payment-date");
  els.payrollPaymentMethod = document.getElementById("payroll-payment-method");
  els.massPayrollModal = document.getElementById("mass-payroll-modal");
  els.massPayrollPeriod = document.getElementById("mass-payroll-period");
  els.btnMassCalculate = document.getElementById("btn-mass-calculate");
  els.tableMassPayroll = document.getElementById("table-mass-payroll");
  els.btnMassProcess = document.getElementById("btn-mass-process");

  els.slipModal = document.getElementById("slip-modal");
  els.slipSheet = document.getElementById("slip-sheet");
  els.slipShareHint = document.getElementById("slip-share-hint");
  els.btnSlipPdf = document.getElementById("btn-slip-pdf");
  els.btnSlipPng = document.getElementById("btn-slip-png");
  els.btnSlipShare = document.getElementById("btn-slip-share");
  els.btnSlipShareEmployee = document.getElementById("btn-slip-share-employee");

  els.btnExportEmployees = document.getElementById("btn-export-employees");
  els.btnExportReviews = document.getElementById("btn-export-reviews");
  els.btnExportContracts = document.getElementById("btn-export-contracts");
  els.btnExportPayroll = document.getElementById("btn-export-payroll");

  els.karyawanTabLaporan = document.getElementById("karyawan-tab-laporan");
  els.reportFilterMonth = document.getElementById("report-filter-month");
  els.reportFilterYear = document.getElementById("report-filter-year");
  els.reportFilterPosition = document.getElementById("report-filter-position");
  els.reportFilterWorkStatus = document.getElementById("report-filter-workstatus");
  els.reportTotalEmployees = document.getElementById("report-total-employees");
  els.reportActiveEmployees = document.getElementById("report-active-employees");
  els.reportContractEmployees = document.getElementById("report-contract-employees");
  els.reportAvgSalary = document.getElementById("report-avg-salary");
  els.reportTotalPayroll = document.getElementById("report-total-payroll");
  els.reportTotalBonus = document.getElementById("report-total-bonus");
  els.reportTotalIncentive = document.getElementById("report-total-incentive");
  els.reportTotalDeduction = document.getElementById("report-total-deduction");
  els.reportAvgScore = document.getElementById("report-avg-score");
  els.reportCountSangatBaik = document.getElementById("report-count-sangat-baik");
  els.reportCountBaik = document.getElementById("report-count-baik");
  els.reportCountCukup = document.getElementById("report-count-cukup");
  els.reportCountExpiring = document.getElementById("report-count-expiring");
  els.reportCountExtended = document.getElementById("report-count-extended");
  els.reportCountNotExtended = document.getElementById("report-count-not-extended");
  els.customerModal = document.getElementById("customer-modal");
  els.customerModalTitle = document.getElementById("customer-modal-title");
  els.customerSubmitBtn = document.getElementById("customer-submit-btn");
  els.customerModalStats = document.getElementById("customer-modal-stats");
  els.customerOrderHistory = document.getElementById("customer-order-history");
  els.customerForm = document.getElementById("customer-form");

  els.finIncome = document.getElementById("fin-income");
  els.finExpense = document.getElementById("fin-expense");
  els.finBalance = document.getElementById("fin-balance");
  els.financeTabs = document.getElementById("finance-tabs");
  els.financeCount = document.getElementById("finance-count");
  els.tableTransactions = document.getElementById("table-transactions");
  els.btnAddTransaction = document.getElementById("btn-add-transaction");
  els.transactionModal = document.getElementById("transaction-modal");
  els.transactionForm = document.getElementById("transaction-form");

  els.settingsForm = document.getElementById("settings-form");

  els.toast = document.getElementById("toast");
}

async function init() {
  cacheEls();
  bindEvents();
  await initDataLayer();
  renderAll();
}

init();

window.addEventListener('unhandledrejection', event => { showToast(event.reason?.message || 'Penyimpanan gagal. Periksa koneksi lalu coba lagi.'); });
