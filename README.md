# Kasir Toko — Web POS v2 (Production-Ready)

Versi ini menggantikan penyimpanan LocalStorage pada MVP dengan **backend
terpusat (Supabase)**, menambahkan **login & role (Admin/Kasir)**, **manajemen
shift**, **laporan penjualan + grafik**, dan **cetak cepat ESC/POS**.

> ⚠️ **Jika Anda upgrade dari v1 (single-file `app.js` + LocalStorage):**
> jangan gabungkan file lama dengan yang baru. Gunakan **folder ini secara
> utuh** dan hapus `app.js` versi lama — struktur & cara kerjanya sudah
> sepenuhnya berbeda (modular ES Modules + database terpusat).

## 1. Struktur Proyek

```
kasir-pos-web-v2/
├── index.html              # Shell HTML: login screen, layout app, area cetak struk
├── js/
│   ├── main.js              # Entry point: cek sesi, load data awal, routing tab
│   ├── supabase-client.js   # Konfigurasi URL & anon key Supabase (WAJIB diisi)
│   ├── api.js                # Semua pemanggilan Supabase (query & RPC) terpusat di sini
│   ├── auth.js               # Layar login/registrasi, cek sesi
│   ├── state.js              # State in-memory aplikasi
│   ├── utils.js              # Helper: format rupiah, toast, modal
│   ├── ui-pos.js             # Layar kasir: shift, keranjang, pembayaran
│   ├── ui-products.js        # Manajemen produk (CRUD, khusus admin)
│   ├── ui-history.js         # Riwayat transaksi
│   ├── ui-reports.js         # Dashboard laporan + grafik (Chart.js)
│   ├── ui-settings.js        # Pengaturan toko, printer, manajemen user
│   ├── ui-receipt.js         # Render & cetak struk (browser + ESC/POS)
│   └── escpos.js             # Cetak cepat via Web Bluetooth (ESC/POS)
└── sql/
    └── schema.sql            # Skema database lengkap (tabel, RLS, function)
```

Setiap file JS adalah **ES Module** (`import`/`export`) — bukan lagi 1 file
raksasa seperti MVP v1. Ini penting untuk 2 hal:
1. Browser hanya mendukung `import` pada file yang dibuka lewat **server**
   (http/https), **bukan** dengan membuka `index.html` langsung via
   `file://`. Lihat bagian "Cara Menjalankan" di bawah.
2. Modul saling terhubung lewat `import` — jangan mengganti nama file tanpa
   menyesuaikan baris `import` yang mereferensikannya di file lain.

## 2. Setup Backend (Supabase)

1. Buat akun & project baru di [supabase.com](https://supabase.com) (gratis).
2. Buka **SQL Editor** di dashboard project Anda → **New Query** → tempel
   seluruh isi `sql/schema.sql` → **Run**. Ini akan membuat semua tabel,
   Row Level Security (RLS), trigger, dan RPC function checkout sekaligus.
3. Buka **Project Settings → API**, salin:
   - **Project URL**
   - **anon / public key** (BUKAN `service_role` key)
4. Tempelkan ke `js/supabase-client.js`:
   ```js
   export const SUPABASE_URL = 'https://xxxxxxxx.supabase.co';
   export const SUPABASE_ANON_KEY = 'eyJ...';
   ```
5. Buat akun pertama Anda: buka aplikasi → klik **"Daftar sebagai kasir
   baru"** di layar login → isi nama, email, password. Akun baru otomatis
   dapat role **kasir**.
6. Jadikan akun tersebut **admin** lewat SQL Editor:
   ```sql
   update profiles set role = 'admin'
   where id = (select id from auth.users where email = 'email_anda@contoh.com');
   ```
7. (Opsional tapi disarankan) Di **Authentication → Providers → Email**,
   nonaktifkan "Confirm email" selama masa development supaya bisa langsung
   login tanpa verifikasi email dulu.
8. (Opsional) Aktifkan Realtime bila belum otomatis lewat script: **Database
   → Replication** → centang tabel `products` dan `transactions`.

> **Kenapa Supabase (bukan Firebase/Express manual)?** Supabase memakai
> PostgreSQL biasa (SQL penuh, relasional — cocok untuk data transaksi &
> laporan), sudah menyediakan Auth + Row Level Security + Realtime out-of-
> the-box, dan API-nya bisa langsung dipanggil dari browser tanpa perlu
> menulis backend server sendiri. Kalau Anda lebih familiar dengan Firebase
> atau ingin kontrol penuh lewat Node.js/Express + PostgreSQL, seluruh
> pemanggilan database ada di **satu file saja** (`js/api.js`) — tinggal
> ganti isi fungsi-fungsi di file itu, kode UI di file lain tidak perlu
> disentuh.

## 3. Cara Menjalankan (WAJIB via server, tidak bisa double-click file)

```bash
cd kasir-pos-web-v2
python3 -m http.server 8000
# buka http://localhost:8000 di browser
```

Atau pakai `npx serve`, VS Code Live Server, atau deploy ke Netlify/Vercel/
Cloudflare Pages (semua statis, tidak perlu proses build).

> Kenapa tidak bisa `file://`? Browser memblokir `import` ES Module dan Web
> Bluetooth API pada halaman yang dibuka langsung dari file lokal (kebijakan
> keamanan CORS). Web Bluetooth juga mensyaratkan **HTTPS** di luar
> `localhost` — jadi untuk pakai fitur printer Bluetooth di produksi,
> domain hosting Anda wajib HTTPS (Netlify/Vercel otomatis HTTPS).

## 4. Skema Database (Ringkasan)

| Tabel | Fungsi |
|---|---|
| `profiles` | Data user: nama & role (`admin`/`kasir`), terhubung ke `auth.users` bawaan Supabase |
| `products` | Produk: nama, harga, stok, kategori |
| `store_settings` | Satu baris pengaturan toko (nama, pajak, diskon, dst) |
| `shifts` | Jam kerja kasir: modal awal, saldo akhir, waktu buka/tutup |
| `transactions` + `transaction_items` | Transaksi & item di dalamnya, tercatat `cashier_id` & `shift_id` |

**Checkout tidak insert langsung ke tabel dari browser.** Semua checkout
lewat **RPC function `create_transaction`** (lihat `sql/schema.sql`) yang
berjalan di sisi database: harga dihitung ulang dari data produk terbaru
(bukan dipercaya dari input client), stok divalidasi & dikurangi dalam satu
transaksi database yang atomik. Ini mencegah 2 masalah umum aplikasi kasir
DIY: harga dimanipulasi dari browser, dan stok "kebobolan" saat dua kasir
checkout produk yang sama bersamaan.

**Row Level Security (RLS)** aktif di semua tabel: kasir hanya bisa melihat
transaksi & shift miliknya sendiri; admin bisa melihat semua (untuk
laporan); hanya admin yang bisa mengubah data produk & pengaturan toko.

## 5. Alur Kerja Kasir

1. **Login** dengan akun yang didaftarkan admin (atau daftar sendiri sebagai kasir).
2. **Buka Shift** — isi modal awal kas sebelum bisa mulai transaksi (tab Kasir
   akan menampilkan layar "Buka Shift" jika belum ada shift aktif).
3. Lakukan transaksi seperti biasa di layar Kasir.
4. **Tutup Shift** di akhir hari/giliran kerja — mencatat kas akhir fisik di
   laci untuk dicocokkan dengan sistem.

Setiap transaksi otomatis tercatat `cashier_id` (siapa yang membuat) dan
`shift_id` (shift mana), yang ditampilkan di struk & bisa dilaporkan.

## 6. Laporan Penjualan

Tab **Laporan** menampilkan: Total Omzet, Jumlah Transaksi, Rata-rata per
Transaksi, grafik tren penjualan harian (Chart.js), dan Top 5 Produk
Terlaris — semua bisa difilter Hari Ini / 7 Hari / 30 Hari / Bulan Ini.

> Agregasi laporan saat ini dihitung di browser dari data mentah transaksi
> (cukup cepat untuk skala toko kecil-menengah). Jika volume transaksi Anda
> sudah sangat besar (puluhan ribu transaksi/bulan), pindahkan agregasi ini
> ke **SQL VIEW** atau **RPC function** di database agar lebih ringan —
> struktur `js/api.js` sudah didesain supaya perubahan ini tidak menyentuh
> file UI lainnya.

## 7. Cetak Struk: Browser vs ESC/POS

Ada 2 jalur cetak, keduanya sudah terpasang di aplikasi:

**A. `window.print()` (default, selalu tersedia)**
Klik "🖨️ Cetak (Browser)" di modal struk. Memakai dialog print bawaan
browser + CSS `@media print` untuk memformat lebar kertas 58mm/80mm.
Instruksi menghubungkan printer thermal fisik lewat driver OS/Bluetooth
biasa sama seperti di README versi MVP sebelumnya.

**B. ESC/POS via Web Bluetooth (cetak cepat, tanpa dialog print)**
1. Buka tab **Pengaturan → 🖨️ Printer Thermal → Hubungkan Printer**.
2. Browser (Chrome/Edge saja — Safari/iOS tidak didukung) akan menampilkan
   daftar perangkat Bluetooth di sekitar. Pilih printer thermal Anda.
3. Setelah tersambung, tombol **"⚡ Cetak Cepat via Printer Thermal"** akan
   muncul di setiap modal struk, mengirim perintah ESC/POS langsung ke
   printer tanpa dialog print sama sekali.

Detail teknis ada di `js/escpos.js`:
- UUID service/characteristic Bluetooth yang dipakai adalah UUID umum untuk
  banyak printer thermal murah (mis. seri Goojprt/Xprinter BT). **Jika
  printer Anda tidak terdeteksi**, cek dokumentasi/spek printer Anda untuk
  UUID yang tepat, lalu ganti nilai `PRINTER_SERVICE_UUID` dan
  `PRINTER_CHARACTERISTIC_UUID` di bagian atas file tersebut.
- Perintah ESC/POS disusun manual lewat class `EscposBuilder` (align, bold,
  ukuran teks, potong kertas) — tidak bergantung library eksternal.
- Data dikirim bertahap per potongan ~180 byte karena keterbatasan ukuran
  paket tulis Web Bluetooth.

**Alternatif Web Serial API** (untuk printer USB, bukan Bluetooth): polanya
mirip — `navigator.serial.requestPort()` lalu `port.open()` dan tulis byte
ESC/POS yang sama ke `port.writable`. Tidak diimplementasikan di file ini
agar kode tetap fokus, tapi bisa ditambahkan sebagai modul terpisah
(`escpos-serial.js`) dengan struktur perintah ESC/POS yang sama persis dari
`escpos.js`.

## 8. Peran & Batasan Akses (Role)

| Fitur | Admin | Kasir |
|---|---|---|
| Transaksi kasir | ✅ | ✅ |
| Buka/tutup shift sendiri | ✅ | ✅ |
| Lihat produk | ✅ | ✅ |
| Tambah/edit/hapus produk | ✅ | ❌ |
| Lihat riwayat transaksi | Semua kasir | Milik sendiri |
| Lihat laporan penjualan | ✅ | ❌ *(disembunyikan dari nav; bisa dibuka manual bila diinginkan, sesuaikan `main.js`)* |
| Ubah pengaturan toko | ✅ | ❌ (read-only) |
| Ubah role user lain | ✅ | ❌ |

Pembatasan ini **dua lapis**: disembunyikan di UI (`isAdmin()` di
`state.js`) **dan** ditegakkan ulang lewat RLS di database — jadi walau ada
yang mengutak-atik JavaScript di browser, database tetap menolak akses yang
tidak diizinkan.

## 9. Yang Perlu Disesuaikan Sebelum Benar-Benar Live

- [ ] Isi `js/supabase-client.js` dengan URL & anon key project Anda sendiri.
- [ ] Jalankan `sql/schema.sql` di project Supabase Anda.
- [ ] Buat akun admin pertama (lihat langkah 6 di bagian Setup).
- [ ] Ganti `PRINTER_SERVICE_UUID`/`PRINTER_CHARACTERISTIC_UUID` di
      `escpos.js` sesuai printer fisik Anda (jika pakai cetak ESC/POS).
- [ ] Deploy ke hosting statis HTTPS (Netlify/Vercel/Cloudflare Pages) agar
      Web Bluetooth berfungsi di luar `localhost`.
- [ ] Pertimbangkan menonaktifkan self-registration (`signUp`) di
      `auth.js`/UI setelah tim inti terdaftar, dan biarkan admin yang
      membuat akun kasir baru lewat Supabase Dashboard → Authentication.
