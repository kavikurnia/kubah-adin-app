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
// 5. Aktifkan Firebase Authentication: buka menu "Authentication" →
//    tab "Sign-in method" → aktifkan provider "Email/Password".
// 6. Buat minimal satu akun admin secara manual: menu "Authentication"
//    → tab "Users" → "Add user" → isi email & password. Aplikasi ini
//    TIDAK punya form daftar akun sendiri (by design, ini panel admin
//    internal) — akun dibuat dari Firebase Console, bukan dari app.
//
// Selama nilai masih "YOUR_API_KEY" (placeholder), prototipe ini
// otomatis berjalan dalam MODE DEMO — data tersimpan sementara di
// browser (localStorage), tanpa perlu Firebase sama sekali. Ini
// supaya kamu bisa langsung mencoba semua alur kerja tanpa setup
// apa pun. Begitu kamu mengisi konfigurasi asli, app otomatis
// pindah ke Firestore sungguhan saat halaman di-refresh.
// ============================================================

window.FIREBASE_CONFIG = {
  apiKey: "AIzaSyC6ea0-3QFnFR3ZUfv4fKYSIX4vTD-ZCwA",
  authDomain: "kubah-admin-app.firebaseapp.com",
  projectId: "kubah-admin-app",
  storageBucket: "kubah-admin-app.firebasestorage.app",
  messagingSenderId: "477747088600",
  appId: "1:477747088600:web:9d6d6e6e3fc56bfbab9bad"
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
//     price: number,           // harga dasar
//     weight: number,          // gram
//     sku: string,             // SKU induk
//     status: "aktif" | "draft" | "nonaktif",
//     photoUrl: string,        // URL foto produk
//     variants: [{ image, color, size, sku, price, stock }],
//     totalStock: number,      // = jumlah stock semua varian
//     createdAt: timestamp
//   }
