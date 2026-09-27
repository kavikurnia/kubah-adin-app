# Hosting Kubah Nabawi di VPS

Paket ini memindahkan hosting statis. Firebase `kubah-admin-app` tetap menangani login dan database; Supabase `lejkvtobwlknztolzjqk` tetap menangani berkas. Tidak diperlukan backend Node, database lokal, atau container baru. Hasil pemasangan dan batas pengujian tercatat di CHECKPOINT-TERBARU.md.

## Sumber dan perlindungan versi

Repository: https://github.com/kavikurnia/kubah-adin-app, branch `master`. Baseline lengkap r23: `086e634589f6abed28d04cdff61a2a7a6dd9843a`. Sebanyak 81 file lokal, manifest, repository, dan GitHub Pages cocok sebelum migrasi. R24 hanya menyesuaikan tautan katalog pada host baru, penanda versi, dan konfigurasi hosting. Fitur payroll, produk, varian, katalog, dan modul lain tetap menggunakan sumber yang sama.

Sebelum pembaruan, fetch repository dan periksa HEAD, perubahan lokal, manifest, serta versi aktif. Jangan menimpa dengan ZIP payroll atau rilis lama. Jangan memasukkan dump database, akun uji, kredensial, node_modules, atau folder kerja ke document root.

## Kondisi server yang telah diperiksa

- Host: `srv2013282.hstgr.cloud`, IPv4 `31.97.187.187`.
- OS langsung dari server: Ubuntu 26.04.1 LTS, 2 CPU, RAM 7,7 GiB, disk 96 GiB.
- Docker tersedia tetapi belum memiliki container atau volume sebelum pekerjaan.
- Port 80/443 belum dipakai. Nginx dan Certbot dipasang dari repository Ubuntu. Layanan lainnya dipertahankan.
- Hosting uji: `https://srv2013282.hstgr.cloud/admin` dan `/katalog`.
- Domain `kubahnabawistore.com` belum terdaftar saat diperiksa pada 27 September 2026. Tidak dibeli otomatis.

Untuk server lain atau pembaruan, jalankan `bash preflight.sh` kembali. Jangan mengasumsikan port, virtual host, atau layanan masih kosong.

## Cadangan

Cadangan sebelum pemasangan berada di `/var/backups/kubah-nabawi/20260927-before-hosting` dengan akses root. Berisi konfigurasi yang tersedia, daftar paket, layanan, listener, dan inventaris Docker. Rilis sebelumnya tetap disimpan di `/srv/kubah-nabawi/releases`.

Cadangan privat Firebase dan Supabase disimpan terpisah dari arsip kode. Snapshot 27 September berisi 609 dokumen Firestore, konfigurasi dan akun Auth, rules/index, serta 217 foto. Supabase mencakup delapan tabel aplikasi, fungsi, kebijakan, metadata bucket dan objek; pada snapshot hanya terdapat satu penanda folder kosong dan tidak ada unggahan privat berisi data. Uji pemulihan lokal dan checksum harus dicatat terpisah; jangan memulihkan database hanya untuk membatalkan perubahan hosting.

Jangan menaruh cadangan atau private key di repo/webroot. Cadangan terbaru tetap perlu dibuat lagi sebelum perubahan data berikutnya.

## Membuat rilis

```sh
python3 build-release.py --source /path/frontend --manifest /path/MANIFEST-FILE.json --output /path/packages
```

Script memeriksa hash dan hanya memasukkan file frontend yang disebut dalam manifest. Simpan manifest dan commit sumber. Paket berisi `webroot`, `SHA256SUMS`, dan `release.json`; dua file terakhir berada di luar webroot.

Unggah paket melalui SSH/SFTP dengan host key yang sudah diverifikasi. Cocokkan SHA256 arsip, lalu ekstrak ke direktori baru di `/srv/kubah-nabawi/releases`. Gunakan direktori 0755 dan file 0644. Jangan menimpa direktori rilis yang sudah ada.

```sh
bash /srv/kubah-nabawi/deployment/activate-release.sh NAMA_RILIS NAMA_RILIS_AKTIF
# Pada pemasangan pertama gunakan NONE sebagai argumen kedua.
```

Aktivasi memeriksa semua hash, `nginx -t`, penguncian deployment, dan rilis aktif yang diharapkan. Symlink `current` diganti secara atomik; symlink `previous` menunjuk rilis terdahulu. Tidak ada impor stok atau perubahan database.

## Routing

- `/` diarahkan ke `/katalog`.
- `/admin` melayani index admin; `/katalog` melayani toko.
- `/admin/` dan `/katalog/` diarahkan tanpa slash agar jalur aset relatif tetap benar.
- `/index.html` dan `/toko.html` tetap berfungsi melalui pengalihan. Query dan fragmen dipertahankan.
- `/supplier` mengarah ke `/katalog#kerjasama`; `/reseller` ke `/katalog#reseller`; `/kurir` melayani halaman kurir.
- Semua halaman `.html` dan hash route lama tetap tersedia. Aset yang tidak ditemukan harus menghasilkan 404, bukan halaman admin.

Nginx hanya melayani folder `current/webroot`, memblokir dotfile/arsip/rahasia, dan menggunakan SAMEORIGIN agar iframe admin tetap berjalan. Membuka `/admin` tanpa akun menampilkan login; penggunaan fitur tetap diperiksa oleh aplikasi dan aturan Firebase. Tidak ada tautan Admin toko di footer publik.

## DNS dan HTTPS domain utama

Pemilik harus mendaftarkan domain terlebih dahulu. Pemeriksaan Hostinger menampilkan Rp209.900 untuk tahun pertama atau promo Rp109.900 pada durasi 3+ tahun; total, pajak, dan perpanjangan harus diperiksa saat pendaftaran. Tidak ada pembelian dari pekerjaan ini.

Setelah kepemilikan dipastikan:

1. Cadangkan DNS yang ada. Tambahkan A `@` ke `31.97.187.187`. AAAA hanya dipasang setelah IPv6 diuji. Pertahankan MX/TXT dan record layanan lain.
2. Periksa A, AAAA, NS, serta CAA dari resolver publik.
3. Sesuaikan contoh virtual host dengan domain. Pertahankan virtual host staging dan aplikasi lain.
4. Gunakan HTTP challenge pada `/var/lib/kubah-acme` untuk memperoleh sertifikat, lalu aktifkan konfigurasi HTTPS setelah berkas sertifikat benar-benar tersedia.

```sh
certbot certonly --webroot -w /var/lib/kubah-acme -d kubahnabawistore.com
nginx -t && systemctl reload nginx
certbot renew --dry-run --cert-name kubahnabawistore.com
systemctl status certbot.timer
```

Hook renewal harus menjalankan `nginx -t` lalu `systemctl reload nginx`. Sertifikat staging saat ini sudah memiliki timer dan hook tersebut; uji renewal berhasil. Jangan menyalin private key ke frontend. Jangan mengaktifkan HSTS preload sebelum perpindahan domain selesai.

## Firebase, Supabase, dan sesi

Tambahkan hanya hostname milik pengguna ke Firebase Auth authorized domains, dengan mencadangkan konfigurasi dan mempertahankan daftar lama. Hostname staging sudah ditambahkan. Domain utama ditambahkan setelah terdaftar dan DNS terverifikasi. `authDomain` aplikasi tetap `kubah-admin-app.firebaseapp.com`; alur saat ini menggunakan email/password. Jangan membuat proxy callback OAuth jika tidak diperlukan.

Firestore rules dan Supabase RLS tidak perlu dilonggarkan untuk hosting baru. Periksa login, CORS, pemuatan foto dan upload dengan akun uji yang memiliki hak sesuai. HPP, payroll, dokumen, dan data internal tidak boleh ikut dipublikasikan.

Login, keranjang, dan draf browser terikat origin. Pengguna perlu login lagi di alamat baru. Jangan menyalin cookie/token dari situs lama. Riwayat pesanan tetap berada di database yang sama; situs lama dipertahankan agar draf atau keranjang lama dapat ditinjau.

## Pengujian dan pergantian alamat utama

Periksa hash seluruh frontend, route langsung/refresh, HTTPS, halaman login, daftar dan simpan produk uji, opsi/varian/foto, katalog, keranjang, checkout tanpa pesanan nyata, Supplier, reseller, kurir, serta modul payroll. Gunakan QA dengan awalan yang jelas dan bersihkan hanya data QA milik pemeriksaan ini. Verifikasi hash produk asli sebelum/sesudah.

Periksa tampilan HP 360/390/430 dan desktop. Catat perbedaan antara tes lokal, cloud API, browser pada VPS, dan HP fisik. Jangan menyatakan satu jenis tes menggantikan semuanya.

Setelah domain utama lulus pengujian, arahkan alamat lama. GitHub Pages tidak menyediakan konfigurasi server 301 umum; gunakan pengalihan per halaman yang memetakan index ke `/admin` dan toko ke `/katalog`, dengan query/hash tetap utuh. Jangan mengaktifkannya sebelum target utama teruji.

## Pembaruan dan pemulihan

1. Cadangkan kode/config dan verifikasi commit sumber. Buat cadangan database terpisah bila diperlukan.
2. Bangun rilis dari manifest, unggah, periksa hash, dan uji staging.
3. Aktifkan symlink dengan nama rilis aktif yang tepat. Verifikasi halaman dan login setelahnya.
4. Jika gagal, aktifkan kembali rilis sebelumnya menggunakan script yang sama, dengan rilis baru sebagai `expected-current`.
5. Jika konfigurasi berubah, pulihkan hanya virtual host/snippet Kubah dari cadangan, lalu `nginx -t` dan reload. Jangan mengganti konfigurasi layanan lain.
6. Jangan melakukan restore database untuk rollback hosting. Jangan menghapus rilis, volume Docker, atau foto.

Folder rilis, konfigurasi, dan sertifikat tetap tersimpan setelah restart. Data bisnis tetap berada di Firebase/Supabase. Tidak ada layanan berbayar baru yang dibutuhkan.
