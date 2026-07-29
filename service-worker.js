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

const CACHE_VERSION = 'kasir-pos-v1';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './js/main.js',
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

  // 2) Navigasi halaman (buka/refresh app): coba network dulu, fallback ke cache
  //    kalau offline, supaya app-shell tetap bisa terbuka tanpa internet.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('./index.html'))
    );
    return;
  }

  // 3) Aset statis milik aplikasi sendiri (same-origin): cache-first.
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request).then((res) => {
        const resClone = res.clone();
        caches.open(CACHE_VERSION).then((cache) => cache.put(request, resClone));
        return res;
      }))
    );
    return;
  }

  // 4) Aset CDN pihak ketiga (Tailwind, Chart.js, Google Fonts): stale-while-revalidate
  //    - langsung tampilkan versi cache (kalau ada) biar cepat, sambil diam-diam
  //      mengambil versi terbaru di background untuk kunjungan berikutnya.
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
