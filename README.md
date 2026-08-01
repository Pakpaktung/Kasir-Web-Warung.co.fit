# Kasir Toko — Web POS v2.5 (Production-Ready + Installable di Android)

Backend terpusat (Supabase), login & role (Admin/Kasir), manajemen shift,
laporan penjualan + grafik, cetak cepat ESC/POS (termasuk logo), bisa
diinstal sebagai aplikasi Android (PWA), HPP & laporan keuntungan, diskon
manual per-transaksi, nama pelanggan di struk, pembayaran QRIS, hapus
riwayat transaksi (khusus admin) — dan sekarang: **nomor transaksi reset
otomatis setiap hari**.

> ⚠️ **Upgrade dari versi sebelumnya?** Jalankan ulang `sql/schema.sql` di
> Supabase SQL Editor Anda — file ini aman dijalankan berkali-kali dan akan
> menambahkan kolom-kolom baru tanpa menghapus data yang sudah ada. Lalu
> ganti seluruh isi folder `js/`, `index.html`, dan file lain dengan versi
> baru ini.

## 1. Fitur Baru di v2.5: Nomor Transaksi Reset Harian

- Format kode transaksi berubah dari `TRX-000001` (urut seumur hidup toko)
  menjadi **`TRX-260801-0001`** — angka setelah tanggal kembali ke `0001`
  setiap kali tanggal berganti. Contoh: transaksi terakhir hari ini
  `TRX-260801-0047`, besok paginya transaksi pertama otomatis jadi
  `TRX-260802-0001`.
- **Zona waktu toko bisa diatur** lewat Pengaturan → Profil Toko → **Zona
  Waktu Toko** (WIB/WITA/WIT). Ini penting supaya "pergantian hari" terjadi
  tepat jam 00:00 waktu setempat toko Anda, bukan jam 00:00 UTC server
  (yang kalau dibiarkan default bisa membuat transaksi jam 7 pagi WIB
  ternomori seolah masih "hari kemarin").
- Mekanismenya memakai **tabel penghitung per-tanggal** (bukan sequence
  global seperti versi sebelumnya) yang diupdate atomik lewat
  `INSERT ... ON CONFLICT DO UPDATE` — tetap aman dari tabrakan nomor kalau
  beberapa kasir checkout bersamaan, dan sekarang malah lebih baik dari
  segi konsistensi: kalau seluruh transaksi gagal/dibatalkan, kenaikan
  nomornya ikut ter-*rollback* juga (beda dari sequence Postgres biasa yang
  tidak pernah rollback).
- **Migrasi transaksi lama**: menjalankan ulang `sql/schema.sql` akan
  menghitung ulang nomor urut & tanggal SEMUA transaksi yang sudah ada
  (berdasarkan `created_at` dan zona waktu yang sedang diset di
  Pengaturan), lalu membentuk ulang kode tampilannya ke format baru. Ini
  berarti kode transaksi lama yang tersimpan di database akan **berubah**
  ke format baru (struk kertas yang sudah tercetak sebelumnya tentu tidak
  berubah, hanya catatan digitalnya).
- Tidak ada perubahan kode frontend untuk fitur ini — begitu skema database
  diperbarui, struk/riwayat otomatis menampilkan format baru.

## 2. Fitur dari Versi Sebelumnya (Ringkas)

- **Hapus Riwayat Transaksi (khusus admin)**: ikon 🗑 di tab Riwayat, dua
  lapis proteksi (UI + RLS database), dengan peringatan bahwa stok tidak
  otomatis dikembalikan.
- **Nama Pelanggan & QRIS**: kolom nama pelanggan opsional; metode bayar
  Tunai/QRIS dengan kode QRIS statis (bukan integrasi payment gateway).
- **HPP & Laporan Keuntungan**: HPP + Harga Jual di form produk dengan
  preview margin; laporan menampilkan Total Keuntungan & grafik Omzet vs Keuntungan.
- **Diskon Manual per Transaksi**: toggle %/Rp di layar Pembayaran.
- **Logo Struk**: tampil di struk browser maupun ESC/POS, ukuran bisa
  disesuaikan lewat konstanta di `js/escpos.js`.
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
│   ├── ui-settings.js         # Pengaturan toko (termasuk zona waktu), logo, QRIS, printer, user
│   ├── ui-receipt.js          # Render & cetak struk (browser + ESC/POS)
│   └── escpos.js              # Cetak cepat via Web Bluetooth (ESC/POS), termasuk konversi logo ke bitmap
└── sql/
    └── schema.sql             # Skema database lengkap (tabel, RLS, function, penghitung harian) - AMAN DI-RE-RUN
```

## 4. Setup Backend (Supabase)

1. Buat akun & project baru di [supabase.com](https://supabase.com) (gratis), atau pakai project lama Anda.
2. Buka **SQL Editor** → **New Query** → tempel seluruh isi `sql/schema.sql` →
   **Run**. Aman dijalankan baik di project baru maupun project yang sudah
   pernah menjalankan versi skema sebelumnya.
3. Buka **Project Settings → API**, salin **Project URL** dan **anon/public
   key** (BUKAN `service_role`), lalu tempel ke `js/supabase-client.js`.
4. Buka aplikasi → **"Daftar sebagai kasir baru"** → jadikan admin lewat SQL:
   ```sql
   update profiles set role = 'admin'
   where id = (select id from auth.users where email = 'email_anda@contoh.com');
   ```
5. **Atur zona waktu toko** lewat Pengaturan → Profil Toko (default WIB/Asia
   Jakarta) sebelum mulai bertransaksi, supaya reset nomor harian pas di
   jam 00:00 waktu toko Anda.
6. (Development) Nonaktifkan "Confirm email" di **Authentication → Providers → Email**.

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
deploy ke hosting HTTPS** agar bisa diinstal di luar `localhost`. Buka URL
di Chrome Android → tombol **"📲 Instal Aplikasi"** muncul otomatis.

## 7. Skema Database (Ringkasan)

| Tabel | Fungsi |
|---|---|
| `profiles` | Data user: nama & role (`admin`/`kasir`) |
| `products` | Produk: nama, HPP, harga jual, stok, kategori |
| `store_settings` | Pengaturan toko: nama, pajak, diskon default, logo, kode QRIS, **zona waktu** |
| `shifts` | Jam kerja kasir: modal awal, saldo akhir |
| `daily_transaction_counters` | Penghitung nomor urut PER TANGGAL (1 baris per hari), dasar reset harian |
| `transactions` | Transaksi: `trx_date` + `trx_number` (dasar kode `TRX-YYMMDD-0001`), subtotal, diskon, pajak, total HPP, nama pelanggan, metode bayar |
| `transaction_items` | Item transaksi: harga jual & HPP saat itu (snapshot) |

**Checkout tidak insert langsung dari browser.** Semua lewat RPC function
`create_transaction`: harga & HPP dihitung ulang dari data produk terbaru,
diskon manual divalidasi & dibatasi ke rentang `[0, subtotal]`, nomor urut
harian diambil dari `daily_transaction_counters` **setelah** semua validasi
lolos (supaya tidak bolong), stok divalidasi & dikurangi dalam satu
transaksi database atomik.

**Row Level Security (RLS)** aktif di semua tabel: kasir hanya melihat
transaksi/shift miliknya sendiri dan tidak bisa menghapus apapun; admin
melihat semua transaksi, mengubah data produk/pengaturan toko, dan
menghapus riwayat transaksi. Tabel `daily_transaction_counters` sama sekali
tidak bisa diakses langsung dari client (hanya lewat RPC).

## 8. Alur Kerja Kasir

1. **Login** → **Buka Shift** (isi modal awal kas).
2. Tambah produk ke keranjang → klik **Bayar**.
3. Di layar Pembayaran: isi nama pelanggan (opsional), sesuaikan diskon
   (opsional), pilih metode pembayaran (Tunai/QRIS).
4. **Konfirmasi & Cetak** — transaksi otomatis mendapat nomor urut hari itu
   (`TRX-260801-0001`, `TRX-260801-0002`, ..., reset ke `0001` besok).
5. **Tutup Shift** di akhir giliran kerja.

## 9. Laporan Penjualan

Tab **Laporan**: Total Omzet, Total Keuntungan (+ HPP), Jumlah Transaksi,
Rata-rata per Transaksi, grafik tren Omzet vs Keuntungan, Top 5 Produk
Terlaris — bisa difilter Hari Ini / 7 Hari / 30 Hari / Bulan Ini.

## 10. Cetak Struk: Browser vs ESC/POS

**A. `window.print()`** — selalu tersedia di semua browser/perangkat.

**B. ESC/POS via Web Bluetooth** — hanya Chrome/Edge (Desktop & Android).
Ukuran logo & nama toko bisa disesuaikan lewat konstanta di
`js/escpos.js`. Error "Web Bluetooth API globally disabled" adalah
pengaturan browser/OS, bukan bug aplikasi (lihat komentar di kode/riwayat
chat sebelumnya untuk cara mengaktifkannya di Brave/Linux/dsb).

## 11. Peran & Batasan Akses (Role)

| Fitur | Admin | Kasir |
|---|---|---|
| Transaksi kasir + diskon + nama pelanggan + metode bayar | ✅ | ✅ |
| Buka/tutup shift sendiri | ✅ | ✅ |
| Lihat produk (termasuk HPP & margin) | ✅ | ✅ |
| Tambah/edit/hapus produk | ✅ | ❌ |
| Lihat riwayat transaksi | Semua kasir | Milik sendiri |
| Hapus riwayat transaksi | ✅ | ❌ |
| Lihat laporan (omzet/keuntungan) | ✅ | ❌ |
| Ubah pengaturan toko (termasuk zona waktu), logo, kode QRIS | ✅ | ❌ |
| Ubah role user lain | ✅ | ❌ |

Dua lapis: disembunyikan di UI **dan** ditegakkan ulang lewat RLS di database.

## 12. Checklist Sebelum Live

- [ ] Jalankan/perbarui `sql/schema.sql` di project Supabase Anda.
- [ ] Isi `js/supabase-client.js` dengan URL & anon key project Anda.
- [ ] Buat akun admin pertama.
- [ ] **Atur zona waktu toko** di Pengaturan sebelum mulai bertransaksi.
- [ ] Isi HPP untuk semua produk yang sudah ada.
- [ ] Unggah logo toko & kode QRIS toko lewat Pengaturan.
- [ ] Sosialisasikan ke admin: menghapus transaksi tidak mengembalikan
      stok otomatis.
- [ ] Deploy ke hosting statis **HTTPS**.
