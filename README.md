# Kasir Toko — Web POS v2.4 (Production-Ready + Installable di Android)

Backend terpusat (Supabase), login & role (Admin/Kasir), manajemen shift,
laporan penjualan + grafik, cetak cepat ESC/POS (termasuk logo), bisa
diinstal sebagai aplikasi Android (PWA), HPP & laporan keuntungan, diskon
manual per-transaksi, nama pelanggan di struk, pembayaran QRIS — dan
sekarang: **nomor transaksi urut** & **hapus riwayat transaksi (khusus admin)**.

> ⚠️ **Upgrade dari versi sebelumnya?** Jalankan ulang `sql/schema.sql` di
> Supabase SQL Editor Anda — file ini aman dijalankan berkali-kali dan akan
> menambahkan kolom-kolom baru tanpa menghapus data yang sudah ada. Lalu
> ganti seluruh isi folder `js/`, `index.html`, dan file lain dengan versi
> baru ini.

## 1. Fitur Baru di v2.4

### a. Nomor Transaksi Urut (bukan lagi berbasis waktu)
- Sebelumnya kode transaksi dibuat dari timestamp (`TRX-260801061234`, susah
  dibaca & tidak berurutan). Sekarang formatnya **`TRX-000001`,
  `TRX-000002`, `TRX-000003`, ...** — urut sesuai transaksi ke berapa yang
  berhasil dibuat, mencerminkan "pembeli ke berapa" sejak toko ini beroperasi.
- Nomor diberikan lewat **sequence PostgreSQL** (bukan `count(*)` manual),
  supaya tetap aman & tidak bentrok walau ada beberapa kasir checkout di
  detik yang sama.
- **Tidak akan bolong** karena transaksi gagal: nomor urut baru diambil
  **setelah** semua validasi (stok cukup, nominal bayar cukup, dsb) lolos —
  percobaan checkout yang gagal tidak ikut "membakar" satu nomor.
- **Migrasi otomatis untuk data lama**: saat Anda menjalankan ulang
  `sql/schema.sql`, transaksi-transaksi yang sudah ada sebelumnya akan
  otomatis diberi nomor urut baru berdasarkan urutan waktu transaksi
  dibuat (`created_at`), lalu transaksi baru melanjutkan dari nomor
  terakhir tersebut.
- Tidak ada perubahan di sisi tampilan/kode frontend untuk fitur ini — kode
  transaksi (`t.code`) yang sudah ditampilkan di struk & riwayat otomatis
  memakai format baru begitu skema database diperbarui.

### b. Hapus Riwayat Transaksi (Khusus Admin)
- Di tab **Riwayat**, admin sekarang melihat ikon 🗑 di setiap baris
  transaksi untuk menghapusnya. Kasir biasa tidak melihat tombol ini sama
  sekali.
- Muncul dialog konfirmasi sebelum menghapus, dengan peringatan penting:
  - Penghapusan **permanen**, tidak bisa dibatalkan.
  - Stok produk yang sudah terjual di transaksi tersebut **tidak otomatis
    dikembalikan** — kalau perlu, sesuaikan stok secara manual lewat menu
    Produk setelah menghapus.
  - Total Omzet/Keuntungan di tab Laporan akan berubah begitu transaksi
    dihapus, karena laporan dihitung dari data transaksi yang masih ada.
- **Dua lapis proteksi**: tombolnya disembunyikan dari UI kasir non-admin,
  **dan** ditegakkan ulang lewat Row Level Security di database (policy
  `transactions_delete_admin`) — walau seseorang mencoba memanggil fungsi
  hapus langsung lewat konsol browser, Supabase tetap menolak kalau
  bukan admin yang login.

## 2. Fitur dari Versi Sebelumnya (Ringkas)

- **Nama Pelanggan & QRIS**: kolom nama pelanggan opsional; metode bayar
  Tunai/QRIS dengan kode QRIS statis (bukan integrasi payment gateway,
  konfirmasi tetap manual oleh kasir).
- **HPP & Laporan Keuntungan**: HPP + Harga Jual di form produk dengan
  preview margin; laporan menampilkan Total Keuntungan & grafik Omzet vs Keuntungan.
- **Diskon Manual per Transaksi**: toggle %/Rp di layar Pembayaran,
  divalidasi ulang di server.
- **Logo Struk**: tampil di struk baik cetak browser maupun ESC/POS
  (dikonversi otomatis ke bitmap), ukurannya bisa disesuaikan lewat
  konstanta di `js/escpos.js`.
- **PWA/Instalasi Android**: bisa diinstal dari Chrome Android setelah di-deploy HTTPS.

## 3. Struktur Proyek

```
kasir-pos-web-v2/
├── index.html              # Shell HTML: login, layout app, meta tag PWA
├── manifest.json            # Metadata PWA (nama, ikon, warna) - syarat instal
├── service-worker.js        # Cache app-shell + syarat instal PWA
├── icons/                   # Ikon aplikasi (berbagai ukuran + versi maskable)
├── js/
│   ├── main.js               # Entry point: cek sesi, load data, routing, daftar SW
│   ├── pwa.js                 # Registrasi service worker & tombol "Instal Aplikasi"
│   ├── supabase-client.js    # Konfigurasi URL & anon key Supabase (WAJIB diisi)
│   ├── api.js                 # Semua pemanggilan Supabase terpusat (termasuk deleteTransaction)
│   ├── auth.js                # Layar login/registrasi, cek sesi
│   ├── state.js               # State in-memory aplikasi
│   ├── utils.js               # Helper: format rupiah, toast, modal, resize gambar
│   ├── ui-pos.js              # Layar kasir: shift, keranjang, diskon, nama pelanggan, metode bayar
│   ├── ui-products.js         # Manajemen produk (CRUD + HPP/margin, khusus admin)
│   ├── ui-history.js          # Riwayat transaksi + hapus transaksi (khusus admin)
│   ├── ui-reports.js          # Dashboard laporan: omzet, HPP, keuntungan, grafik
│   ├── ui-settings.js         # Pengaturan toko, logo struk, kode QRIS, printer, manajemen user
│   ├── ui-receipt.js          # Render & cetak struk (browser + ESC/POS)
│   └── escpos.js              # Cetak cepat via Web Bluetooth (ESC/POS), termasuk konversi logo ke bitmap
└── sql/
    └── schema.sql             # Skema database lengkap (tabel, RLS, function, sequence) - AMAN DI-RE-RUN
```

## 4. Setup Backend (Supabase)

1. Buat akun & project baru di [supabase.com](https://supabase.com) (gratis), atau pakai project lama Anda.
2. Buka **SQL Editor** → **New Query** → tempel seluruh isi `sql/schema.sql` →
   **Run**. Aman dijalankan baik di project baru maupun project yang sudah
   pernah menjalankan versi skema sebelumnya (nomor urut transaksi lama akan
   otomatis di-backfill).
3. Buka **Project Settings → API**, salin **Project URL** dan **anon/public
   key** (BUKAN `service_role`), lalu tempel ke `js/supabase-client.js`.
4. Buka aplikasi → **"Daftar sebagai kasir baru"** → jadikan admin lewat SQL:
   ```sql
   update profiles set role = 'admin'
   where id = (select id from auth.users where email = 'email_anda@contoh.com');
   ```
5. (Development) Nonaktifkan "Confirm email" di **Authentication → Providers → Email**.

## 5. Cara Menjalankan (Development)

```bash
cd kasir-pos-web-v2
python3 -m http.server 8000
# buka http://localhost:8000
```

Wajib lewat server (bukan `file://`) karena aplikasi memakai ES Modules,
Service Worker, dan Web Bluetooth API.

## 6. Instal di Android (PWA)

Sudah dilengkapi `manifest.json`, `service-worker.js`, dan ikon. **Wajib
deploy ke hosting HTTPS** (Netlify/Vercel/Cloudflare Pages) agar bisa
diinstal di luar `localhost`. Buka URL di Chrome Android → tombol **"📲
Instal Aplikasi"** muncul otomatis di header.

## 7. Skema Database (Ringkasan)

| Tabel | Fungsi |
|---|---|
| `profiles` | Data user: nama & role (`admin`/`kasir`) |
| `products` | Produk: nama, HPP, harga jual, stok, kategori |
| `store_settings` | Pengaturan toko: nama, pajak, diskon default, logo, kode QRIS |
| `shifts` | Jam kerja kasir: modal awal, saldo akhir |
| `transactions` | Transaksi: **`trx_number` (nomor urut)**, `code` (format `TRX-000001`), subtotal, diskon, pajak, total, total HPP, nama pelanggan, metode bayar |
| `transaction_items` | Item transaksi: harga jual & HPP saat itu (snapshot) |

**Checkout tidak insert langsung dari browser.** Semua lewat RPC function
`create_transaction`: harga & HPP dihitung ulang dari data produk terbaru,
diskon manual divalidasi & dibatasi ke rentang `[0, subtotal]`, nomor urut
transaksi diambil dari `transactions_trx_number_seq` **setelah** semua
validasi lolos (supaya tidak bolong), stok divalidasi & dikurangi dalam
satu transaksi database atomik.

**Row Level Security (RLS)** aktif di semua tabel: kasir hanya melihat
transaksi/shift miliknya sendiri dan tidak bisa menghapus apapun; admin
melihat semua transaksi, mengubah data produk/pengaturan toko, **dan
menghapus riwayat transaksi** (`transactions_delete_admin`,
`transaction_items_delete_admin`).

## 8. Alur Kerja Kasir

1. **Login** → **Buka Shift** (isi modal awal kas).
2. Tambah produk ke keranjang → klik **Bayar**.
3. Di layar Pembayaran: isi nama pelanggan (opsional), sesuaikan diskon
   (opsional), pilih metode pembayaran (Tunai/QRIS).
4. **Konfirmasi & Cetak** — transaksi otomatis mendapat nomor urut berikutnya
   (`TRX-000042`, dst).
5. **Tutup Shift** di akhir giliran kerja.

**Sebagai admin**, di tab Riwayat Anda juga bisa menghapus transaksi yang
salah input lewat ikon 🗑 di sisi kanan tiap baris (lihat peringatan soal
stok & laporan di bagian 1b).

## 9. Laporan Penjualan

Tab **Laporan**: Total Omzet, Total Keuntungan (+ HPP), Jumlah Transaksi,
Rata-rata per Transaksi, grafik tren Omzet vs Keuntungan, Top 5 Produk
Terlaris — bisa difilter Hari Ini / 7 Hari / 30 Hari / Bulan Ini.

## 10. Cetak Struk: Browser vs ESC/POS

**A. `window.print()`** — selalu tersedia di semua browser/perangkat,
termasuk iOS.

**B. ESC/POS via Web Bluetooth** — hanya Chrome/Edge (Desktop & Android).
Ukuran logo & nama toko bisa disesuaikan lewat konstanta
`LOGO_WIDTH_RATIO`, `STORE_NAME_WIDTH_MULT`, `STORE_NAME_HEIGHT_MULT` di
bagian atas `js/escpos.js`. Kalau muncul error "Web Bluetooth API globally
disabled", itu pengaturan browser/OS Anda (Brave mematikan Web Bluetooth
secara default, Linux butuh flag khusus, atau kebijakan organisasi) — bukan
bug aplikasi.

## 11. Peran & Batasan Akses (Role)

| Fitur | Admin | Kasir |
|---|---|---|
| Transaksi kasir + diskon + nama pelanggan + metode bayar | ✅ | ✅ |
| Buka/tutup shift sendiri | ✅ | ✅ |
| Lihat produk (termasuk HPP & margin) | ✅ | ✅ |
| Tambah/edit/hapus produk | ✅ | ❌ |
| Lihat riwayat transaksi | Semua kasir | Milik sendiri |
| **Hapus riwayat transaksi** | ✅ | ❌ |
| Lihat laporan (omzet/keuntungan) | ✅ | ❌ |
| Ubah pengaturan toko, logo, kode QRIS | ✅ | ❌ |
| Ubah role user lain | ✅ | ❌ |

Dua lapis: disembunyikan di UI **dan** ditegakkan ulang lewat RLS di database.

## 12. Checklist Sebelum Live

- [ ] Jalankan/perbarui `sql/schema.sql` di project Supabase Anda.
- [ ] Isi `js/supabase-client.js` dengan URL & anon key project Anda.
- [ ] Buat akun admin pertama.
- [ ] Isi HPP untuk semua produk yang sudah ada.
- [ ] Unggah logo toko & kode QRIS toko lewat Pengaturan.
- [ ] Sosialisasikan ke admin: menghapus transaksi tidak mengembalikan
      stok otomatis — cek & sesuaikan stok manual kalau perlu setelah hapus.
- [ ] Deploy ke hosting statis **HTTPS**.
