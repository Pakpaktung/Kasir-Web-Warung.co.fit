// ============================================================================
// SERVICE WORKER
// ----------------------------------------------------------------------------
// Tugasnya HANYA meng-cache "app shell" (HTML/JS/ikon aplikasi) supaya:
//   1. Aplikasi memenuhi syarat "installable" di Chrome Android (wajib ada
//      service worker dengan fetch handler + manifest + HTTPS).
//   2. Load kedua-dst jadi jauh lebih cepat (aset statis diambil dari cache).
//
// PENTING: Permintaan ke Supabase (data produk/transaksi/auth) SENGAJA TIDAK
// di-cache - selalu lewat network. Aplikasi ini BUKAN aplikasi offline-first;
// transaksi tetap butuh koneksi internet ke database. Cache di sini hanya
// untuk file statis, bukan untuk data.
// ============================================================================

const CACHE_VERSION = 'kasir-pos-v2'; // dinaikkan agar cache lama (versi bermasalah) dibuang paksa di semua perangkat
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './js/main.js',
  './js/pwa.js',
  './js/supabase-client.js',
  './js/api.js',
  './js/auth.js',
  './js/state.js',
  './js/utils.js',
  './js/ui-pos.js',
  './js/ui-products.js',
  './js/ui-history.js',
  './js/ui-reports.js',
  './js/ui-settings.js',
  './js/ui-receipt.js',
  './js/escpos.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // 1) JANGAN pernah cache permintaan ke Supabase (data harus selalu real-time/terbaru).
  if (url.hostname.endsWith('.supabase.co')) {
    return; // biarkan browser menangani seperti biasa (langsung ke network)
  }

  // Hanya proses request GET; POST/PUT/dll (jarang terjadi di luar Supabase) dilewatkan.
  if (request.method !== 'GET') return;

  // 2) HTML & aset milik aplikasi sendiri (navigasi, JS, manifest, ikon): NETWORK-FIRST.
  //    ----------------------------------------------------------------------------
  //    Sebelumnya bagian ini pakai "cache-first" (langsung pakai cache tanpa cek
  //    jaringan) untuk file JS/aset -- efeknya, begitu sebuah perangkat pernah
  //    membuka aplikasi sekali, ia bisa "terjebak" di versi kode yang sudah usang
  //    untuk waktu lama, walau server sudah punya update, sampai CACHE_VERSION di
  //    atas dinaikkan manual. Ini pernah menyebabkan tablet menampilkan fitur lama
  //    padahal laptop (yang cache-nya belum sempat tersimpan) sudah menampilkan versi baru.
  //
  //    Sekarang: SELALU coba ambil dari jaringan dulu (supaya update kode terbaru
  //    langsung kepakai kapan pun perangkat online), cache HANYA dipakai sebagai
  //    cadangan darurat kalau benar-benar offline. Aplikasi ini tetap butuh koneksi
  //    internet untuk Supabase, jadi tidak ada kerugian berarti dari sisi "kecepatan
  //    offline" dibanding risiko menampilkan kode usang tanpa disadari.
  if (request.mode === 'navigate' || url.origin === self.location.origin) {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const resClone = res.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(request, resClone));
          return res;
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match('./index.html')))
    );
    return;
  }

  // 3) Aset CDN pihak ketiga (Tailwind, Chart.js, Google Fonts): stale-while-revalidate
  //    - langsung tampilkan versi cache (kalau ada) biar cepat, sambil diam-diam
  //      mengambil versi terbaru di background untuk kunjungan berikutnya. Ini masih
  //      aman dipakai di sini karena file-file CDN ini (bukan kode aplikasi sendiri)
  //      jarang berubah dan biasanya sudah punya versi di URL-nya.
  event.respondWith(
    caches.open(CACHE_VERSION).then(async (cache) => {
      const cached = await cache.match(request);
      const networkFetch = fetch(request).then((res) => {
        cache.put(request, res.clone());
        return res;
      }).catch(() => cached);
      return cached || networkFetch;
    })
  );
});
