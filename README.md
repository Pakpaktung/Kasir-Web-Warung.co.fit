# Kasir Toko — Web POS v2.1 (Production-Ready + Installable di Android)

Backend terpusat (Supabase), login & role (Admin/Kasir), manajemen shift,
laporan penjualan + grafik, cetak cepat ESC/POS, bisa diinstal sebagai
aplikasi Android (PWA) — dan sekarang: **HPP & laporan keuntungan, diskon
manual per-transaksi, dan logo kustom di struk**.

> ⚠️ **Upgrade dari versi sebelumnya?** Jalankan ulang `sql/schema.sql` di
> Supabase SQL Editor Anda — file ini aman dijalankan berkali-kali (memakai
> `if not exists`/`add column if not exists`/`or replace` di semua bagian)
> dan akan menambahkan kolom-kolom baru (HPP, HPP transaksi, logo) tanpa
> menghapus data yang sudah ada. Lalu ganti seluruh isi folder `js/`,
> `index.html`, dan file lain dengan versi baru ini.

## 1. Fitur Baru di v2.1

### a. HPP (Harga Pokok Penjualan) & Laporan Keuntungan
- Form produk (`Menu Produk`) sekarang punya 2 kolom harga: **HPP/Modal**
  dan **Harga Jual**, dengan preview margin (Rp & %) langsung saat mengetik.
- Tabel/daftar produk menampilkan HPP dan margin tiap produk.
- **HPP setiap produk disalin ke setiap item transaksi saat checkout** (kolom
  `transaction_items.cost_price`) — supaya laporan laba tetap akurat secara
  historis walau Anda mengubah HPP produk di kemudian hari.
- Tab **Laporan** sekarang menampilkan kartu **Total Keuntungan** (+ total
  HPP sebagai sub-info), dan grafik tren dengan 2 garis: **Omzet** (ungu)
  dan **Keuntungan** (hijau). Daftar Produk Terlaris juga menampilkan
  kontribusi keuntungan tiap produk.
- Rumus: `Keuntungan = Subtotal − Diskon − Total HPP` (pajak tidak dihitung
  sebagai keuntungan toko, karena itu titipan yang disetor ke negara).

### b. Diskon Manual per Transaksi
- Di layar **Pembayaran** (POS), sekarang ada panel **Diskon** dengan
  toggle **% / Rp** dan kolom input — kasir bisa memberi diskon berbeda
  untuk tiap transaksi (mis. diskon member, promo dadakan), terpisah dari
  diskon default di Pengaturan.
- Semua angka (subtotal, diskon, pajak, total, kembalian) update otomatis
  saat diskon diubah.
- **Validasi tetap di server**: nilai diskon akhir yang dikirim ke database
  dibatasi (clamp) ke rentang `[0, subtotal]` di dalam function
  `create_transaction` — kasir tidak bisa membuat diskon negatif atau lebih
  besar dari subtotal walau memodifikasi request dari DevTools.

### c. Logo Struk
- Menu **Pengaturan → 🖼️ Logo Struk** (khusus admin): unggah gambar logo
  toko, otomatis diperkecil (maks. 300px) & disimpan sebagai `logo_base64`
  di `store_settings` — tanpa perlu setup Supabase Storage terpisah.
- Logo otomatis tampil di bagian atas struk (preview modal & cetak lewat
  `window.print()`).
- **Keterbatasan yang perlu diketahui:** cetak cepat ESC/POS (Bluetooth)
  saat ini **belum** mencetak logo — printer thermal butuh perintah bitmap
  raster (`GS v 0`) yang berbeda dari teks biasa dan belum diimplementasikan
  di `escpos.js`. Untuk logo di struk, gunakan jalur cetak **"🖨️ Cetak
  (Browser)"**.

## 2. Struktur Proyek

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
│   ├── ui-pos.js              # Layar kasir: shift, keranjang, diskon, pembayaran
│   ├── ui-products.js         # Manajemen produk (CRUD + HPP/margin, khusus admin)
│   ├── ui-history.js          # Riwayat transaksi
│   ├── ui-reports.js          # Dashboard laporan: omzet, HPP, keuntungan, grafik
│   ├── ui-settings.js         # Pengaturan toko, logo struk, printer, manajemen user
│   ├── ui-receipt.js          # Render & cetak struk (browser + ESC/POS), termasuk logo
│   └── escpos.js              # Cetak cepat via Web Bluetooth (ESC/POS)
└── sql/
    └── schema.sql             # Skema database lengkap (tabel, RLS, function) - AMAN DI-RE-RUN
```

## 3. Setup Backend (Supabase)

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

## 4. Cara Menjalankan (Development)

```bash
cd kasir-pos-web-v2
python3 -m http.server 8000
# buka http://localhost:8000
```

Wajib lewat server (bukan `file://`) karena aplikasi memakai ES Modules,
Service Worker, dan Web Bluetooth API.

## 5. Instal di Android (PWA)

Sudah dilengkapi `manifest.json`, `service-worker.js`, dan ikon (termasuk
versi *maskable*). **Wajib deploy ke hosting HTTPS** (Netlify/Vercel/
Cloudflare Pages, gratis & tanpa build) agar bisa diinstal di luar
`localhost`. Setelah itu, buka URL di Chrome Android → tombol **"📲 Instal
Aplikasi"** muncul otomatis di header, atau lewat menu ⋮ Chrome → "Instal
aplikasi". Detail & troubleshooting ada di bagian bawah dokumen ini.

## 6. Skema Database (Ringkasan)

| Tabel | Fungsi |
|---|---|
| `profiles` | Data user: nama & role (`admin`/`kasir`) |
| `products` | Produk: nama, **HPP (`cost_price`)**, harga jual, stok, kategori |
| `store_settings` | Pengaturan toko: nama, pajak, diskon default, **logo (`logo_base64`)** |
| `shifts` | Jam kerja kasir: modal awal, saldo akhir |
| `transactions` | Transaksi: subtotal, diskon, pajak, total, **total HPP (`total_cost`)** |
| `transaction_items` | Item transaksi: harga jual & **HPP saat itu (`cost_price`)** (snapshot, bukan harga produk saat ini) |

**Checkout tidak insert langsung dari browser.** Semua lewat RPC function
`create_transaction` (lihat `sql/schema.sql`): harga & HPP dihitung ulang
dari data produk terbaru di server, diskon manual (jika ada) divalidasi &
dibatasi ke rentang `[0, subtotal]`, stok divalidasi & dikurangi dalam satu
transaksi database atomik.

**Row Level Security (RLS)** aktif di semua tabel: kasir hanya melihat
transaksi/shift miliknya sendiri; admin melihat semua; hanya admin bisa
mengubah data produk & pengaturan toko (termasuk logo).

## 7. Alur Kerja Kasir

1. **Login** → **Buka Shift** (isi modal awal kas).
2. Tambah produk ke keranjang → klik **Bayar**.
3. Di layar Pembayaran, sesuaikan **diskon** (opsional, % atau Rp) → masukkan
   uang dibayar → **Konfirmasi & Cetak**.
4. **Tutup Shift** di akhir giliran kerja.

## 8. Laporan Penjualan

Tab **Laporan**: Total Omzet, Total Keuntungan (+ HPP), Jumlah Transaksi,
Rata-rata per Transaksi, grafik tren Omzet vs Keuntungan (Chart.js), dan
Top 5 Produk Terlaris beserta kontribusi keuntungannya — bisa difilter
Hari Ini / 7 Hari / 30 Hari / Bulan Ini.

> Agregasi dihitung di browser dari data mentah transaksi. Untuk volume
> sangat besar, pindahkan agregasi ke SQL VIEW/RPC — cukup ubah `js/api.js`.

## 9. Cetak Struk: Browser vs ESC/POS

**A. `window.print()`** — tombol "🖨️ Cetak (Browser)", mendukung logo,
format 58mm/80mm via CSS `@media print`.

**B. ESC/POS via Web Bluetooth** — Pengaturan → Printer Thermal → Hubungkan
→ tombol "⚡ Cetak Cepat" muncul di modal struk. **Belum mendukung logo**
(lihat bagian 1c). Sesuaikan `PRINTER_SERVICE_UUID`/`PRINTER_CHARACTERISTIC_UUID`
di `js/escpos.js` jika printer Anda tidak terdeteksi.

## 10. Peran & Batasan Akses (Role)

| Fitur | Admin | Kasir |
|---|---|---|
| Transaksi kasir + diskon manual | ✅ | ✅ |
| Buka/tutup shift sendiri | ✅ | ✅ |
| Lihat produk (termasuk HPP & margin) | ✅ | ✅ |
| Tambah/edit/hapus produk | ✅ | ❌ |
| Lihat riwayat transaksi | Semua kasir | Milik sendiri |
| Lihat laporan (omzet/keuntungan) | ✅ | ❌ |
| Ubah pengaturan toko & logo struk | ✅ | ❌ |
| Ubah role user lain | ✅ | ❌ |

Dua lapis: disembunyikan di UI **dan** ditegakkan ulang lewat RLS di
database.

## 11. Checklist Sebelum Live

- [ ] Jalankan/perbarui `sql/schema.sql` di project Supabase Anda.
- [ ] Isi `js/supabase-client.js` dengan URL & anon key project Anda.
- [ ] Buat akun admin pertama.
- [ ] Isi HPP untuk semua produk yang sudah ada (default 0 jika belum diisi
      — laporan keuntungan akan meleset kalau HPP belum diisi).
- [ ] Unggah logo toko lewat Pengaturan (opsional).
- [ ] Ganti UUID printer di `escpos.js` sesuai printer fisik (jika pakai ESC/POS).
- [ ] Deploy ke hosting statis **HTTPS** agar bisa diinstal di Android & Web Bluetooth berfungsi.
