# Kasir Toko — Web POS v2 (Production-Ready + Installable di Android)

Versi ini menggantikan penyimpanan LocalStorage pada MVP dengan **backend
terpusat (Supabase)**, menambahkan **login & role (Admin/Kasir)**, **manajemen
shift**, **laporan penjualan + grafik**, **cetak cepat ESC/POS**, dan sekarang
**bisa diinstal sebagai aplikasi di Android** (PWA - Progressive Web App).

> ⚠️ **Jika Anda upgrade dari versi sebelumnya:** gunakan folder ini secara
> utuh, jangan campur dengan file `app.js` versi lama (single-file
> LocalStorage) — strukturnya sudah sepenuhnya berbeda (modular ES Modules +
> database terpusat + PWA).

## 1. Struktur Proyek

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
│   ├── utils.js               # Helper: format rupiah, toast, modal
│   ├── ui-pos.js              # Layar kasir: shift, keranjang, pembayaran
│   ├── ui-products.js         # Manajemen produk (CRUD, khusus admin)
│   ├── ui-history.js          # Riwayat transaksi
│   ├── ui-reports.js          # Dashboard laporan + grafik (Chart.js)
│   ├── ui-settings.js         # Pengaturan toko, printer, manajemen user
│   ├── ui-receipt.js          # Render & cetak struk (browser + ESC/POS)
│   └── escpos.js              # Cetak cepat via Web Bluetooth (ESC/POS)
└── sql/
    └── schema.sql             # Skema database lengkap (tabel, RLS, function)
```

## 2. Setup Backend (Supabase)

1. Buat akun & project baru di [supabase.com](https://supabase.com) (gratis).
2. Buka **SQL Editor** → **New Query** → tempel seluruh isi `sql/schema.sql` →
   **Run**. Ini membuat semua tabel, Row Level Security (RLS), trigger, dan
   RPC function checkout sekaligus.
3. Buka **Project Settings → API**, salin **Project URL** dan **anon/public
   key** (BUKAN `service_role`), lalu tempel ke `js/supabase-client.js`:
   ```js
   export const SUPABASE_URL = 'https://xxxxxxxx.supabase.co';
   export const SUPABASE_ANON_KEY = 'eyJ...';
   ```
4. Buka aplikasi → klik **"Daftar sebagai kasir baru"** → isi nama, email,
   password. Akun baru otomatis dapat role **kasir**.
5. Jadikan admin lewat SQL Editor:
   ```sql
   update profiles set role = 'admin'
   where id = (select id from auth.users where email = 'email_anda@contoh.com');
   ```
6. (Development) Di **Authentication → Providers → Email**, nonaktifkan
   "Confirm email" agar bisa langsung login tanpa verifikasi dulu.

## 3. Cara Menjalankan (Development)

```bash
cd kasir-pos-web-v2
python3 -m http.server 8000
# buka http://localhost:8000
```

Wajib lewat server (bukan `file://`) karena aplikasi memakai ES Modules,
Service Worker, dan Web Bluetooth API — ketiganya diblokir browser pada
halaman yang dibuka langsung dari file lokal.

## 4. Menjadikan Aplikasi Bisa Diinstal di Android (PWA)

Aplikasi ini **sudah dilengkapi** ketiga syarat wajib agar Chrome Android
menawarkan opsi instal:
1. **`manifest.json`** — nama aplikasi, ikon, warna tema, `display: standalone`.
2. **`service-worker.js`** — meng-cache app-shell (HTML/JS/ikon) untuk load
   cepat; **data transaksi/produk tetap selalu real-time dari Supabase, TIDAK
   di-cache** — aplikasi ini online-first, bukan aplikasi offline penuh.
3. **Ikon** dalam berbagai ukuran (192px, 512px) termasuk versi *maskable*
   (`icons/icon-maskable-*.png`) supaya tampil rapi sebagai ikon adaptif di
   launcher Android.

### Langkah deploy agar instalasi berfungsi

**PWA hanya bisa diinstal lewat HTTPS** (`localhost` saat development
dikecualikan, tapi untuk dipakai sungguhan di HP Android harus HTTPS).
Paling mudah, deploy ke hosting statis gratis:

- **Netlify**: drag & drop folder `kasir-pos-web-v2` ke [app.netlify.com/drop](https://app.netlify.com/drop), atau `netlify deploy`.
- **Vercel**: `vercel --prod` di dalam folder proyek.
- **Cloudflare Pages** / **GitHub Pages**: hubungkan repo, deploy folder ini sebagai root.

Semua opsi di atas otomatis menyediakan HTTPS gratis, dan tidak perlu proses
build apa pun (murni file statis).

### Cara instal di HP Android (setelah di-deploy)

1. Buka URL aplikasi Anda (mis. `https://kasir-toko-anda.netlify.app`) di
   **Chrome Android**.
2. Login seperti biasa. Setelah beberapa detik, tombol **"📲 Instal
   Aplikasi"** akan otomatis muncul di pojok kanan atas header.
3. Tap tombol tersebut → Chrome menampilkan dialog konfirmasi instal → tap
   **Instal**.
4. Ikon "Kasir Toko" akan muncul di layar utama/app drawer Android, terbuka
   dalam jendela sendiri **tanpa address bar** (mode `standalone`), seperti
   aplikasi native.

**Kalau tombol "Instal Aplikasi" tidak muncul:**
- Pastikan diakses lewat **HTTPS** (bukan `http://`, kecuali `localhost`).
- Chrome hanya menawarkan instal jika app **belum pernah** ditolak/diinstal
  sebelumnya di sesi tersebut, dan hanya di **Chrome/Edge Android** (bukan
  in-app browser seperti WebView Instagram/Facebook).
- Sebagai alternatif manual, buka menu **⋮ (titik tiga) Chrome → "Instal
  aplikasi"** atau **"Tambahkan ke Layar Utama"** — ini selalu tersedia
  begitu `manifest.json` & service worker terdeteksi valid, bahkan kalau
  tombol kustom di header tidak sempat muncul.
- Untuk mengecek proyek Anda memenuhi semua syarat PWA, jalankan audit
  **Lighthouse** (tab "Application"/"Lighthouse" di Chrome DevTools →
  kategori "Installable").

### Update ikon / warna tema

Ikon dibuat otomatis (huruf "K" di atas warna brand `#4f46e5`). Untuk ganti
dengan logo asli toko Anda: siapkan gambar persegi minimal 512x512px, lalu
timpa file-file di folder `icons/` dengan nama yang sama persis (`icon-192.png`,
`icon-512.png`, `icon-maskable-192.png`, `icon-maskable-512.png`,
`apple-touch-icon.png`, `favicon-48.png`). Untuk versi *maskable*, pastikan
elemen penting logo berada di 80% area tengah gambar (area luar bisa terpotong
saat Android menampilkannya sebagai lingkaran/rounded-square).

## 5. Skema Database (Ringkasan)

| Tabel | Fungsi |
|---|---|
| `profiles` | Data user: nama & role (`admin`/`kasir`), terhubung ke `auth.users` bawaan Supabase |
| `products` | Produk: nama, harga, stok, kategori |
| `store_settings` | Satu baris pengaturan toko (nama, pajak, diskon, dst) |
| `shifts` | Jam kerja kasir: modal awal, saldo akhir, waktu buka/tutup |
| `transactions` + `transaction_items` | Transaksi & item, tercatat `cashier_id` & `shift_id` |

**Checkout tidak insert langsung ke tabel dari browser.** Semua checkout
lewat **RPC function `create_transaction`** (lihat `sql/schema.sql`): harga
dihitung ulang dari data produk terbaru di server, stok divalidasi & dikurangi
dalam satu transaksi database atomik — mencegah manipulasi harga dari browser
dan stok "kebobolan" saat dua kasir checkout produk yang sama bersamaan.

**Row Level Security (RLS)** aktif di semua tabel: kasir hanya melihat
transaksi & shift miliknya sendiri; admin melihat semua; hanya admin yang bisa
mengubah data produk & pengaturan toko.

## 6. Alur Kerja Kasir

1. **Login** dengan akun yang didaftarkan admin (atau daftar sendiri sebagai kasir).
2. **Buka Shift** — isi modal awal kas sebelum bisa mulai transaksi.
3. Lakukan transaksi seperti biasa di layar Kasir.
4. **Tutup Shift** di akhir hari/giliran kerja — mencatat kas akhir fisik untuk dicocokkan dengan sistem.

Setiap transaksi otomatis tercatat `cashier_id` & `shift_id`, ditampilkan di struk & bisa dilaporkan.

## 7. Laporan Penjualan

Tab **Laporan**: Total Omzet, Jumlah Transaksi, Rata-rata per Transaksi,
grafik tren penjualan harian (Chart.js), dan Top 5 Produk Terlaris — bisa
difilter Hari Ini / 7 Hari / 30 Hari / Bulan Ini.

> Agregasi dihitung di browser dari data mentah transaksi (cukup cepat untuk
> skala toko kecil-menengah). Untuk volume sangat besar, pindahkan agregasi
> ke SQL VIEW/RPC — cukup ubah `js/api.js`, file UI lain tidak perlu disentuh.

## 8. Cetak Struk: Browser vs ESC/POS

**A. `window.print()` (default, selalu tersedia)** — klik "🖨️ Cetak
(Browser)" di modal struk, memakai CSS `@media print` untuk format 58mm/80mm.

**B. ESC/POS via Web Bluetooth (cetak cepat, tanpa dialog print)**
1. Tab **Pengaturan → 🖨️ Printer Thermal → Hubungkan Printer** (Chrome/Edge
   saja — Safari/iOS tidak didukung).
2. Pilih printer thermal Anda dari daftar Bluetooth.
3. Tombol **"⚡ Cetak Cepat via Printer Thermal"** akan muncul di modal
   struk setelah terhubung.

Jika printer tidak terdeteksi, sesuaikan `PRINTER_SERVICE_UUID` &
`PRINTER_CHARACTERISTIC_UUID` di `js/escpos.js` dengan spesifikasi printer
Anda. Web Bluetooth **juga mensyaratkan HTTPS** di luar `localhost` — deploy
seperti langkah bagian 4 sekaligus mengaktifkan fitur ini di HP Android.

## 9. Peran & Batasan Akses (Role)

| Fitur | Admin | Kasir |
|---|---|---|
| Transaksi kasir | ✅ | ✅ |
| Buka/tutup shift sendiri | ✅ | ✅ |
| Lihat produk | ✅ | ✅ |
| Tambah/edit/hapus produk | ✅ | ❌ |
| Lihat riwayat transaksi | Semua kasir | Milik sendiri |
| Ubah pengaturan toko | ✅ | ❌ (read-only) |
| Ubah role user lain | ✅ | ❌ |

Pembatasan ini dua lapis: disembunyikan di UI **dan** ditegakkan ulang lewat
RLS di database — walau ada yang mengutak-atik JavaScript di browser,
database tetap menolak akses yang tidak diizinkan.

## 10. Checklist Sebelum Live

- [ ] Isi `js/supabase-client.js` dengan URL & anon key project Anda sendiri.
- [ ] Jalankan `sql/schema.sql` di project Supabase Anda.
- [ ] Buat akun admin pertama.
- [ ] Ganti UUID printer di `escpos.js` sesuai printer fisik Anda (jika pakai ESC/POS).
- [ ] Deploy ke hosting statis **HTTPS** (Netlify/Vercel/Cloudflare Pages) —
      wajib agar bisa diinstal di Android & Web Bluetooth berfungsi.
- [ ] (Opsional) Ganti ikon di folder `icons/` dengan logo asli toko Anda.
- [ ] Pertimbangkan menonaktifkan self-registration setelah tim inti
      terdaftar; biarkan admin membuat akun kasir baru lewat Supabase
      Dashboard → Authentication.
