// ============================================================================
// PWA: registrasi Service Worker + tombol "Instal Aplikasi" kustom
// ----------------------------------------------------------------------------
// Chrome Android TIDAK langsung menampilkan popup instal otomatis begitu
// syarat PWA terpenuhi - ia hanya menyiapkan event `beforeinstallprompt` yang
// bisa kita tangkap, lalu kita panggil manual lewat tombol sendiri di UI
// (lebih ramah pengguna daripada menunggu ikon kecil di address bar).
// ============================================================================

let deferredInstallPrompt = null;
let onPromptAvailable = null; // callback opsional untuk memberi tahu UI saat tombol instal boleh muncul

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js')
      .catch((err) => console.warn('Gagal mendaftarkan service worker:', err));
  });
}

export function listenForInstallPrompt(callback) {
  onPromptAvailable = callback;

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault(); // cegah mini-infobar otomatis dari Chrome
    deferredInstallPrompt = event;
    if (onPromptAvailable) onPromptAvailable(true);
  });

  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    if (onPromptAvailable) onPromptAvailable(false);
  });
}

export function isInstallable() {
  return !!deferredInstallPrompt;
}

// Menampilkan dialog instal native Android. HARUS dipanggil langsung dari
// event klik tombol (browser menolak memanggilnya secara terprogram tanpa interaksi user).
export async function triggerInstallPrompt() {
  if (!deferredInstallPrompt) return null;
  deferredInstallPrompt.prompt();
  const { outcome } = await deferredInstallPrompt.userChoice; // 'accepted' | 'dismissed'
  deferredInstallPrompt = null;
  return outcome;
}

// Deteksi sederhana: apakah aplikasi SUDAH berjalan dalam mode "terinstal"
// (dibuka dari ikon Home Screen, bukan dari tab browser biasa).
export function isRunningAsInstalledApp() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}
