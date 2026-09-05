// ============================================================
// KONFIGURASI FIREBASE
// ============================================================
// 1. Buka https://console.firebase.google.com → buat project baru
//    (atau pakai project yang sudah ada).
// 2. Di project itu, tambahkan "Web App" → Firebase akan
//    menampilkan objek konfigurasi seperti di bawah ini.
// 3. Ganti semua nilai "YOUR_..." di bawah dengan nilai asli dari
//    project kamu, lalu simpan file ini.
// 4. Aktifkan Firestore Database (mode "test" dulu untuk uji coba,
//    lalu atur security rules yang sesuai sebelum go-live).
//
// Selama nilai masih "YOUR_API_KEY" (placeholder), prototipe ini
// otomatis berjalan dalam MODE DEMO — data tersimpan sementara di
// browser (localStorage), tanpa perlu Firebase sama sekali. Ini
// supaya kamu bisa langsung mencoba semua alur kerja tanpa setup
// apa pun. Begitu kamu mengisi konfigurasi asli, app otomatis
// pindah ke Firestore sungguhan saat halaman di-refresh.
// ============================================================

window.FIREBASE_CONFIG = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID",
};

// ------------------------------------------------------------
// Struktur data Firestore yang dipakai app.js
// (dibuat otomatis oleh Firestore saat data pertama disimpan,
// tidak perlu dibuat manual — ini hanya referensi struktur)
// ------------------------------------------------------------
//
// koleksi "orders":
//   {
//     invoiceNo: string,
//     customerName: string,
//     phone: string,
//     address: string,
//     items: [{ productName, variant, qty, price }],
//     shippingCost: number,
//     total: number,
//     status: "menunggu_pembayaran" | "perlu_verifikasi" | "diproses"
//             | "dikirim" | "selesai" | "dibatalkan",
//     courier: string,
//     trackingNumber: string,
//     statusHistory: [{ status, at }],
//     createdAt: timestamp
//   }
//
// koleksi "products":
//   {
//     name: string,
//     category: string,
//     description: string,
//     price: number,
//     weight: number,
//     sku: string,
//     status: "aktif" | "draft" | "nonaktif",
//     variants: [{ size, color, sku, stock }],
//     totalStock: number,
//     createdAt: timestamp
//   }
