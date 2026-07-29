// ============================================================================
// MAIN.JS - Entry point aplikasi
// Alur: cek sesi login -> jika belum login tampilkan layar login -> jika
// sudah, muat data awal (produk, pengaturan, shift aktif) -> render POS.
// ============================================================================

import { state } from './state.js';
import * as api from './api.js';
import { tryRestoreSession, renderLoginScreen } from './auth.js';
import { renderPOS } from './ui-pos.js';
import { renderProducts } from './ui-products.js';
import { renderHistory } from './ui-history.js';
import { renderReports } from './ui-reports.js';
import { renderSettings } from './ui-settings.js';
import { showToast } from './utils.js';
import { registerServiceWorker, listenForInstallPrompt, isInstallable, triggerInstallPrompt } from './pwa.js';

let productsChannel = null;

async function boot() {
  registerServiceWorker();
  setupInstallButton();
  const loggedIn = await tryRestoreSession();
  if (!loggedIn) {
    renderLoginScreen(startApp);
    return;
  }
  startApp();
}

async function startApp() {
  document.getElementById('auth-root').classList.add('hidden');
  document.getElementById('app-root').classList.remove('hidden');

  await loadInitialData();
  setupNav();
  updateClock();
  setInterval(updateClock, 30_000);
  switchTab('pos');

  // Realtime: kalau kasir lain mengurangi stok / menambah produk di perangkat
  // lain, daftar produk di layar ini ikut ter-update otomatis.
  // (boot() hanya berjalan sekali per pemuatan halaman, jadi tidak perlu unsubscribe di sini)
  productsChannel = api.subscribeProducts(async () => {
    state.products = await api.fetchProducts();
    if (state.currentTab === 'pos' || state.currentTab === 'products') {
      switchTab(state.currentTab);
    }
  });
}

async function loadInitialData() {
  try {
    const [products, settings] = await Promise.all([
      api.fetchProducts(),
      api.fetchSettings(),
    ]);
    state.products = products;
    state.settings = settings;
    document.getElementById('app-store-name').textContent = settings.store_name;

    state.currentShift = await api.getOpenShift(state.profile.id);
  } catch (err) {
    console.error(err);
    showToast('Gagal memuat data awal: ' + err.message, 'error');
  }
}

// Menampilkan tombol "Instal Aplikasi" di header HANYA saat browser
// memberi sinyal aplikasi ini memenuhi syarat & belum terinstal.
function setupInstallButton() {
  const btn = document.getElementById('btn-install-app');
  if (!btn) return;

  listenForInstallPrompt((available) => {
    btn.classList.toggle('hidden', !available);
  });

  btn.addEventListener('click', async () => {
    const outcome = await triggerInstallPrompt();
    if (outcome === 'accepted') {
      showToast('Aplikasi berhasil diinstal!', 'success');
      btn.classList.add('hidden');
    }
  });

  // Fallback: kalau event beforeinstallprompt belum sempat tertangkap
  // saat fungsi ini jalan, cek lagi sesaat kemudian.
  setTimeout(() => btn.classList.toggle('hidden', !isInstallable()), 1500);
}

function setupNav() {
  document.querySelectorAll('.nav-btn, .nav-btn-mobile').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });
}

function switchTab(tab) {
  state.currentTab = tab;
  document.querySelectorAll('.tab-panel').forEach(el => el.classList.add('hidden'));
  document.getElementById(`tab-${tab}`).classList.remove('hidden');

  document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.toggle('bg-white/15', btn.dataset.tab === tab));
  document.querySelectorAll('.nav-btn-mobile').forEach(btn => {
    const active = btn.dataset.tab === tab;
    btn.classList.toggle('text-brand-600', active);
    btn.classList.toggle('text-slate-400', !active);
  });

  if (tab === 'pos') renderPOS();
  else if (tab === 'products') renderProducts();
  else if (tab === 'history') renderHistory();
  else if (tab === 'reports') renderReports();
  else if (tab === 'settings') renderSettings();
}

function updateClock() {
  const el = document.getElementById('clock');
  if (el) el.textContent = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}

document.addEventListener('DOMContentLoaded', boot);
