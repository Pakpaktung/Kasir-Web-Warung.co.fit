# Kasir Toko — Web POS v2.2 (Production-Ready + Installable di Android)

Backend terpusat (Supabase), login & role (Admin/Kasir), manajemen shift,
laporan penjualan + grafik, cetak cepat ESC/POS, bisa diinstal sebagai
aplikasi Android (PWA), HPP & laporan keuntungan, diskon manual per-transaksi,
logo kustom di struk — dan sekarang: **nama pelanggan di struk & pembayaran
QRIS**.

> ⚠️ **Upgrade dari versi sebelumnya?** Jalankan ulang `sql/schema.sql` di
> Supabase SQL Editor Anda — file ini aman dijalankan berkali-kali (memakai
> `if not exists`/`add column if not exists`/`or replace` di semua bagian)
> dan akan menambahkan kolom-kolom baru tanpa menghapus data yang sudah ada.
> Lalu ganti seluruh isi folder `js/`, `index.html`, dan file lain dengan
> versi baru ini.

## 1. Fitur Baru di v2.2

### a. Nama Pelanggan di Struk
- Layar Pembayaran (POS) sekarang punya kolom **Nama Pelanggan (opsional)**.
- Jika diisi, nama tersebut tercetak di struk (baris "Pelanggan: ...") baik
  di jalur cetak browser maupun ESC/POS, dan ditampilkan di daftar Riwayat
  Transaksi.

### b. Pembayaran QRIS
- Metode pembayaran sekarang bisa dipilih: **💵 Tunai** (seperti sebelumnya)
  atau **📱 QRIS**.
- Admin mengunggah gambar kode QRIS statis toko (dari bank/e-wallet Anda)
  lewat **Pengaturan → 📱 Kode QRIS**. Kode ini otomatis ditampilkan di
  layar Pembayaran saat kasir memilih QRIS, untuk dipindai pelanggan.
- Kasir mencentang **"Saya konfirmasi pembayaran QRIS sudah diterima"**
  sebelum tombol Konfirmasi aktif — mencegah transaksi tersimpan sebelum
  pembayaran benar-benar masuk.
- Struk mencantumkan metode pembayaran yang dipakai (Tunai/QRIS).
- **Ini BUKAN integrasi payment gateway.** Aplikasi menampilkan kode QRIS
  statis dan mengandalkan konfirmasi manual kasir — tidak ada verifikasi
  otomatis ke bank/e-wallet bahwa dana benar-benar masuk. Untuk verifikasi
  otomatis (QRIS dinamis dengan nominal & status pembayaran real-time), Anda
  perlu berlangganan payment gateway seperti Midtrans/Xendit dan
  mengintegrasikan API/webhook mereka — di luar cakupan aplikasi statis ini.

## 2. Fitur dari Versi Sebelumnya (Ringkas)

- **HPP & Laporan Keuntungan**: form produk punya HPP + Harga Jual dengan
  preview margin; laporan menampilkan Total Keuntungan, grafik Omzet vs
  Keuntungan, dan kontribusi laba per produk terlaris. HPP disalin ke tiap
  item transaksi saat checkout agar laporan laba historis tetap akurat.
- **Diskon Manual per Transaksi**: toggle %/Rp di layar Pembayaran, divalidasi
  ulang di server (clamp ke rentang subtotal) agar tidak bisa dimanipulasi
  dari DevTools.
- **Logo Struk**: unggah logo toko di Pengaturan (maks. 300px, tersimpan
  sebagai base64), tampil di struk saat cetak browser. Belum tampil di
  cetak cepat ESC/POS (butuh perintah bitmap printer yang belum diimplementasikan).
- **PWA/Instalasi Android**: `manifest.json` + `service-worker.js` + ikon,
  bisa diinstal dari Chrome Android setelah di-deploy HTTPS.
- **Cetak ESC/POS**: cetak cepat via Web Bluetooth, terpisah dari `window.print()`.

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
│   ├── api.js                 # Semua pemanggilan Supabase terpusat di sini
│   ├── auth.js                # Layar login/registrasi, cek sesi
│   ├── state.js               # State in-memory aplikasi
│   ├── utils.js               # Helper: format rupiah, toast, modal, resize gambar
│   ├── ui-pos.js              # Layar kasir: shift, keranjang, diskon, nama pelanggan, metode bayar (Tunai/QRIS)
│   ├── ui-products.js         # Manajemen produk (CRUD + HPP/margin, khusus admin)
│   ├── ui-history.js          # Riwayat transaksi (+ badge metode bayar & nama pelanggan)
│   ├── ui-reports.js          # Dashboard laporan: omzet, HPP, keuntungan, grafik
│   ├── ui-settings.js         # Pengaturan toko, logo struk, kode QRIS, printer, manajemen user
│   ├── ui-receipt.js          # Render & cetak struk (browser + ESC/POS): logo, pelanggan, metode bayar
│   └── escpos.js              # Cetak cepat via Web Bluetooth (ESC/POS)
└── sql/
    └── schema.sql             # Skema database lengkap (tabel, RLS, function) - AMAN DI-RE-RUN
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

Sudah dilengkapi `manifest.json`, `service-worker.js`, dan ikon (termasuk
versi *maskable*). **Wajib deploy ke hosting HTTPS** (Netlify/Vercel/
Cloudflare Pages, gratis & tanpa build) agar bisa diinstal di luar
`localhost`. Setelah itu, buka URL di Chrome Android → tombol **"📲 Instal
Aplikasi"** muncul otomatis di header, atau lewat menu ⋮ Chrome → "Instal
aplikasi".

## 7. Skema Database (Ringkasan)

| Tabel | Fungsi |
|---|---|
| `profiles` | Data user: nama & role (`admin`/`kasir`) |
| `products` | Produk: nama, **HPP (`cost_price`)**, harga jual, stok, kategori |
| `store_settings` | Pengaturan toko: nama, pajak, diskon default, **logo**, **kode QRIS** |
| `shifts` | Jam kerja kasir: modal awal, saldo akhir |
| `transactions` | Transaksi: subtotal, diskon, pajak, total, total HPP, **nama pelanggan**, **metode bayar** |
| `transaction_items` | Item transaksi: harga jual & HPP saat itu (snapshot) |

**Checkout tidak insert langsung dari browser.** Semua lewat RPC function
`create_transaction` (lihat `sql/schema.sql`): harga & HPP dihitung ulang
dari data produk terbaru di server, diskon manual (jika ada) divalidasi &
dibatasi ke rentang `[0, subtotal]`, metode pembayaran divalidasi hanya
`'cash'`/`'qris'`, stok divalidasi & dikurangi dalam satu transaksi database
atomik.

**Row Level Security (RLS)** aktif di semua tabel: kasir hanya melihat
transaksi/shift miliknya sendiri; admin melihat semua; hanya admin bisa
mengubah data produk & pengaturan toko (termasuk logo & QRIS).

## 8. Alur Kerja Kasir

1. **Login** → **Buka Shift** (isi modal awal kas).
2. Tambah produk ke keranjang → klik **Bayar**.
3. Di layar Pembayaran: isi **nama pelanggan** (opsional), sesuaikan
   **diskon** (opsional), pilih **metode pembayaran**:
   - **Tunai**: masukkan uang dibayar, lihat kembalian.
   - **QRIS**: tunjukkan kode QRIS ke pelanggan untuk dipindai, centang
     konfirmasi pembayaran diterima.
4. **Konfirmasi & Cetak**.
5. **Tutup Shift** di akhir giliran kerja.

## 9. Laporan Penjualan

Tab **Laporan**: Total Omzet, Total Keuntungan (+ HPP), Jumlah Transaksi,
Rata-rata per Transaksi, grafik tren Omzet vs Keuntungan (Chart.js), dan
Top 5 Produk Terlaris beserta kontribusi keuntungannya — bisa difilter
Hari Ini / 7 Hari / 30 Hari / Bulan Ini.

## 10. Cetak Struk: Browser vs ESC/POS

**A. `window.print()`** — tombol "🖨️ Cetak (Browser)", mendukung logo &
nama pelanggan, format 58mm/80mm via CSS `@media print`.

**B. ESC/POS via Web Bluetooth** — Pengaturan → Printer Thermal → Hubungkan
→ tombol "⚡ Cetak Cepat" muncul di modal struk. Mendukung nama pelanggan &
metode bayar, **belum** mendukung logo (butuh perintah bitmap raster
tersendiri). Sesuaikan `PRINTER_SERVICE_UUID`/`PRINTER_CHARACTERISTIC_UUID`
di `js/escpos.js` jika printer Anda tidak terdeteksi.

## 11. Peran & Batasan Akses (Role)

| Fitur | Admin | Kasir |
|---|---|---|
| Transaksi kasir + diskon + nama pelanggan + metode bayar | ✅ | ✅ |
| Buka/tutup shift sendiri | ✅ | ✅ |
| Lihat produk (termasuk HPP & margin) | ✅ | ✅ |
| Tambah/edit/hapus produk | ✅ | ❌ |
| Lihat riwayat transaksi | Semua kasir | Milik sendiri |
| Lihat laporan (omzet/keuntungan) | ✅ | ❌ |
| Ubah pengaturan toko, logo, kode QRIS | ✅ | ❌ |
| Ubah role user lain | ✅ | ❌ |

Dua lapis: disembunyikan di UI **dan** ditegakkan ulang lewat RLS di
database.

## 12. Checklist Sebelum Live

- [ ] Jalankan/perbarui `sql/schema.sql` di project Supabase Anda.
- [ ] Isi `js/supabase-client.js` dengan URL & anon key project Anda.
- [ ] Buat akun admin pertama.
- [ ] Isi HPP untuk semua produk yang sudah ada (default 0 jika belum diisi).
- [ ] Unggah logo toko & kode QRIS toko lewat Pengaturan (opsional).
- [ ] Sosialisasikan ke kasir: transaksi QRIS WAJIB dicentang konfirmasi
      manual setelah dana benar-benar diterima, bukan sebelum/berbarengan.
- [ ] Ganti UUID printer di `escpos.js` sesuai printer fisik (jika pakai ESC/POS).
- [ ] Deploy ke hosting statis **HTTPS** agar bisa diinstal di Android & Web Bluetooth berfungsi.
