// ============================================================================
// UI: PENGATURAN - profil toko, printer thermal, manajemen user
// ============================================================================

import { state, isAdmin } from './state.js';
import * as api from './api.js';
import { escapeHtml, showToast, withLoading, openModal, closeModal, resizeImageToDataUrl } from './utils.js';
import { connectPrinter, disconnectPrinter, isPrinterConnected, getPrinterName } from './escpos.js';
import { logout } from './auth.js';

export async function renderSettings() {
  const container = document.getElementById('tab-settings');
  const s = state.settings;
  const canEdit = isAdmin();

  container.innerHTML = `
    <div class="flex items-center justify-between mb-4">
      <h2 class="text-xl font-bold text-slate-800">Pengaturan</h2>
      <button id="btn-logout" class="text-sm text-red-500 font-semibold hover:underline">Keluar</button>
    </div>

    <div class="bg-white rounded-2xl border border-slate-200 p-4 max-w-lg mb-4">
      <p class="text-xs text-slate-400">Masuk sebagai</p>
      <p class="font-bold text-slate-800">${escapeHtml(state.profile.full_name)}</p>
      <p class="text-xs text-brand-600 font-semibold uppercase">${state.profile.role}</p>
    </div>

    <!-- ============ LOGO STRUK (khusus admin) ============ -->
    ${canEdit ? `
    <div class="bg-white rounded-2xl border border-slate-200 p-5 max-w-lg mb-4">
      <h3 class="font-bold text-slate-800 mb-1 text-sm">🖼️ Logo Struk</h3>
      <p class="text-xs text-slate-400 mb-3">Logo akan tampil di bagian atas struk saat dicetak lewat browser. Gunakan gambar persegi/landscape sederhana untuk hasil terbaik.</p>
      <div id="logo-preview-area" class="flex items-center gap-4">
        ${renderLogoPreview()}
      </div>
    </div>

    <div class="bg-white rounded-2xl border border-slate-200 p-5 max-w-lg mb-4">
      <h3 class="font-bold text-slate-800 mb-1 text-sm">📱 Kode QRIS</h3>
      <p class="text-xs text-slate-400 mb-3">Unggah gambar kode QRIS statis toko Anda (dari QRIS bank/e-wallet Anda). Kode ini akan ditampilkan di layar Pembayaran saat kasir memilih metode QRIS, untuk dipindai pelanggan. <b>Catatan:</b> ini bukan integrasi payment gateway - aplikasi tidak memverifikasi pembayaran secara otomatis, kasir mengonfirmasi manual setelah dana diterima.</p>
      <div id="qris-preview-area" class="flex items-center gap-4">
        ${renderQrisPreview()}
      </div>
    </div>` : ''}

    <!-- ============ PRINTER THERMAL ============ -->
    <div class="bg-white rounded-2xl border border-slate-200 p-5 max-w-lg mb-4">
      <h3 class="font-bold text-slate-800 mb-1 text-sm">🖨️ Printer Thermal (ESC/POS)</h3>
      <p class="text-xs text-slate-400 mb-3">Hubungkan printer Bluetooth untuk cetak cepat tanpa dialog print browser. Hanya didukung di Chrome/Edge (Desktop & Android). Catatan: logo struk saat ini hanya tampil pada cetak via browser, belum pada cetak cepat ESC/POS.</p>
      <div id="printer-status" class="flex items-center justify-between bg-slate-50 rounded-xl p-3">
        ${renderPrinterStatus()}
      </div>
    </div>

    <!-- ============ PROFIL TOKO (read-only utk kasir) ============ -->
    <form id="settings-form" class="bg-white rounded-2xl border border-slate-200 p-5 max-w-lg space-y-4 ${!canEdit ? 'opacity-60 pointer-events-none' : ''}">
      <h3 class="font-bold text-slate-800 text-sm">🏪 Profil Toko ${!canEdit ? '(hanya admin yang bisa mengubah)' : ''}</h3>
      <div>
        <label class="text-sm font-medium text-slate-600">Nama Toko</label>
        <input name="store_name" value="${escapeHtml(s.store_name)}" required
          class="w-full h-11 mt-1 px-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500 touch-target" />
      </div>
      <div>
        <label class="text-sm font-medium text-slate-600">Alamat</label>
        <input name="address" value="${escapeHtml(s.address || '')}"
          class="w-full h-11 mt-1 px-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500 touch-target" />
      </div>
      <div>
        <label class="text-sm font-medium text-slate-600">No. Telepon</label>
        <input name="phone" value="${escapeHtml(s.phone || '')}"
          class="w-full h-11 mt-1 px-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500 touch-target" />
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="text-sm font-medium text-slate-600">Pajak (%)</label>
          <input name="tax_percent" type="number" min="0" max="100" value="${s.tax_percent}"
            class="w-full h-11 mt-1 px-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500 touch-target" />
        </div>
        <div>
          <label class="text-sm font-medium text-slate-600">Diskon Global (%)</label>
          <input name="discount_percent" type="number" min="0" max="100" value="${s.discount_percent}"
            class="w-full h-11 mt-1 px-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500 touch-target" />
        </div>
      </div>
      <div>
        <label class="text-sm font-medium text-slate-600">Ukuran Kertas Struk</label>
        <select name="receipt_width" class="w-full h-11 mt-1 px-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500 touch-target">
          <option value="58mm" ${s.receipt_width === '58mm' ? 'selected' : ''}>58mm (thermal kecil)</option>
          <option value="80mm" ${s.receipt_width === '80mm' ? 'selected' : ''}>80mm (thermal standar)</option>
        </select>
      </div>
      <div>
        <label class="text-sm font-medium text-slate-600">Catatan Kaki Struk</label>
        <textarea name="footer_note" rows="2" class="w-full mt-1 px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500">${escapeHtml(s.footer_note || '')}</textarea>
      </div>
      ${canEdit ? `<button type="submit" class="w-full h-12 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-bold touch-target">Simpan Pengaturan</button>` : ''}
    </form>

    ${canEdit ? `
    <!-- ============ MANAJEMEN USER (khusus admin) ============ -->
    <div class="bg-white rounded-2xl border border-slate-200 p-5 max-w-lg mt-4">
      <h3 class="font-bold text-slate-800 mb-3 text-sm">👥 Manajemen User</h3>
      <div id="user-list" class="space-y-2">${`<p class="text-xs text-slate-400">Memuat...</p>`}</div>
    </div>` : ''}
  `;

  document.getElementById('btn-logout').addEventListener('click', confirmLogout);
  wirePrinterButtons();
  if (canEdit) { wireLogoButtons(); wireQrisButtons(); }

  if (canEdit) {
    document.getElementById('settings-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const payload = {
        store_name: fd.get('store_name').trim() || 'Toko Saya',
        address: fd.get('address').trim(),
        phone: fd.get('phone').trim(),
        footer_note: fd.get('footer_note').trim(),
        tax_percent: Number(fd.get('tax_percent')) || 0,
        discount_percent: Number(fd.get('discount_percent')) || 0,
        receipt_width: fd.get('receipt_width'),
      };
      await withLoading(api.updateSettings(payload), 'Gagal menyimpan pengaturan');
      state.settings = { ...state.settings, ...payload };
      document.getElementById('app-store-name').textContent = state.settings.store_name;
      showToast('Pengaturan disimpan', 'success');
    });

    loadUserList();
  }
}

function renderLogoPreview() {
  const logo = state.settings.logo_base64;
  return `
    <div class="w-20 h-20 rounded-xl border border-dashed border-slate-300 flex items-center justify-center bg-slate-50 shrink-0 overflow-hidden">
      ${logo ? `<img src="${logo}" class="w-full h-full object-contain" alt="Logo toko" />` : `<span class="text-xs text-slate-300 text-center px-1">Belum ada logo</span>`}
    </div>
    <div class="flex flex-col gap-2">
      <label class="h-10 px-3 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold flex items-center justify-center cursor-pointer touch-target">
        ${logo ? 'Ganti Logo' : 'Unggah Logo'}
        <input id="input-logo-file" type="file" accept="image/*" class="hidden" />
      </label>
      ${logo ? `<button id="btn-remove-logo" class="h-9 px-3 rounded-lg bg-red-50 text-red-500 text-xs font-semibold touch-target">Hapus Logo</button>` : ''}
    </div>
  `;
}

function wireLogoButtons() {
  const fileInput = document.getElementById('input-logo-file');
  if (fileInput) fileInput.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) return showToast('File harus berupa gambar', 'error');

    try {
      const dataUrl = await resizeImageToDataUrl(file, 300);
      await withLoading(api.updateSettings({ logo_base64: dataUrl }), 'Gagal menyimpan logo');
      state.settings.logo_base64 = dataUrl;
      showToast('Logo struk disimpan', 'success');
      document.getElementById('logo-preview-area').innerHTML = renderLogoPreview();
      wireLogoButtons();
    } catch (err) {
      showToast('Gagal memproses gambar: ' + (err.message || err), 'error');
    }
  });

  const removeBtn = document.getElementById('btn-remove-logo');
  if (removeBtn) removeBtn.addEventListener('click', async () => {
    await withLoading(api.updateSettings({ logo_base64: null }), 'Gagal menghapus logo');
    state.settings.logo_base64 = null;
    showToast('Logo struk dihapus', 'success');
    document.getElementById('logo-preview-area').innerHTML = renderLogoPreview();
    wireLogoButtons();
  });
}

function renderQrisPreview() {
  const qris = state.settings.qris_image_base64;
  return `
    <div class="w-20 h-20 rounded-xl border border-dashed border-slate-300 flex items-center justify-center bg-slate-50 shrink-0 overflow-hidden">
      ${qris ? `<img src="${qris}" class="w-full h-full object-contain" alt="Kode QRIS" />` : `<span class="text-xs text-slate-300 text-center px-1">Belum ada QRIS</span>`}
    </div>
    <div class="flex flex-col gap-2">
      <label class="h-10 px-3 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold flex items-center justify-center cursor-pointer touch-target">
        ${qris ? 'Ganti Kode QRIS' : 'Unggah Kode QRIS'}
        <input id="input-qris-file" type="file" accept="image/*" class="hidden" />
      </label>
      ${qris ? `<button id="btn-remove-qris" class="h-9 px-3 rounded-lg bg-red-50 text-red-500 text-xs font-semibold touch-target">Hapus QRIS</button>` : ''}
    </div>
  `;
}

function wireQrisButtons() {
  const fileInput = document.getElementById('input-qris-file');
  if (fileInput) fileInput.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) return showToast('File harus berupa gambar', 'error');

    try {
      // Kode QRIS pakai resolusi sedikit lebih besar (600px) daripada logo agar tetap
      // mudah dipindai kamera HP walau ditampilkan di layar yang cukup kecil.
      const dataUrl = await resizeImageToDataUrl(file, 600);
      await withLoading(api.updateSettings({ qris_image_base64: dataUrl }), 'Gagal menyimpan kode QRIS');
      state.settings.qris_image_base64 = dataUrl;
      showToast('Kode QRIS disimpan', 'success');
      document.getElementById('qris-preview-area').innerHTML = renderQrisPreview();
      wireQrisButtons();
    } catch (err) {
      showToast('Gagal memproses gambar: ' + (err.message || err), 'error');
    }
  });

  const removeBtn = document.getElementById('btn-remove-qris');
  if (removeBtn) removeBtn.addEventListener('click', async () => {
    await withLoading(api.updateSettings({ qris_image_base64: null }), 'Gagal menghapus kode QRIS');
    state.settings.qris_image_base64 = null;
    showToast('Kode QRIS dihapus', 'success');
    document.getElementById('qris-preview-area').innerHTML = renderQrisPreview();
    wireQrisButtons();
  });
}

function renderPrinterStatus() {
  if (isPrinterConnected()) {
    return `
      <div class="text-sm"><span class="text-emerald-600 font-semibold">🟢 Terhubung</span><p class="text-xs text-slate-400">${escapeHtml(getPrinterName() || '')}</p></div>
      <button id="btn-disconnect-printer" class="text-xs text-red-500 font-semibold hover:underline">Putuskan</button>
    `;
  }
  return `
    <span class="text-sm text-slate-500">Belum terhubung</span>
    <button id="btn-connect-printer" class="h-9 px-3 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold touch-target">Hubungkan Printer</button>
  `;
}

function wirePrinterButtons() {
  const connectBtn = document.getElementById('btn-connect-printer');
  if (connectBtn) connectBtn.addEventListener('click', async () => {
    try {
      const name = await connectPrinter();
      showToast(`Printer "${name}" terhubung`, 'success');
      document.getElementById('printer-status').innerHTML = renderPrinterStatus();
      wirePrinterButtons();
    } catch (err) {
      showToast('Gagal menghubungkan printer: ' + err.message, 'error');
    }
  });

  const disconnectBtn = document.getElementById('btn-disconnect-printer');
  if (disconnectBtn) disconnectBtn.addEventListener('click', () => {
    disconnectPrinter();
    showToast('Printer diputuskan', 'info');
    document.getElementById('printer-status').innerHTML = renderPrinterStatus();
    wirePrinterButtons();
  });
}

async function loadUserList() {
  const listEl = document.getElementById('user-list');
  try {
    const profiles = await api.listProfiles();
    listEl.innerHTML = profiles.map(p => `
      <div class="flex items-center justify-between text-sm border-b border-slate-50 pb-2 last:border-0">
        <div class="min-w-0">
          <p class="font-medium text-slate-800 truncate">${escapeHtml(p.full_name)}</p>
          <p class="text-xs text-slate-400">${p.id === state.profile.id ? '(Anda)' : ''}</p>
        </div>
        <select data-user-id="${p.id}" class="role-select text-xs border border-slate-200 rounded-lg px-2 py-1.5" ${p.id === state.profile.id ? 'disabled' : ''}>
          <option value="kasir" ${p.role === 'kasir' ? 'selected' : ''}>Kasir</option>
          <option value="admin" ${p.role === 'admin' ? 'selected' : ''}>Admin</option>
        </select>
      </div>
    `).join('');

    listEl.querySelectorAll('.role-select').forEach(sel => {
      sel.addEventListener('change', async () => {
        await withLoading(api.updateProfileRole(sel.dataset.userId, sel.value), 'Gagal mengubah role');
        showToast('Role user diperbarui', 'success');
      });
    });
  } catch (err) {
    listEl.innerHTML = `<p class="text-xs text-red-400">Gagal memuat daftar user: ${err.message}</p>`;
  }
}

function confirmLogout() {
  openModal(`
    <div class="p-5">
      <h3 class="text-lg font-bold text-slate-800 mb-2">Keluar?</h3>
      <p class="text-sm text-slate-500 mb-5">Anda perlu login kembali untuk mengakses aplikasi.</p>
      <div class="flex gap-2">
        <button id="btn-cancel-logout" class="flex-1 h-12 rounded-xl border border-slate-200 font-semibold text-slate-600 touch-target">Batal</button>
        <button id="btn-confirm-logout" class="flex-1 h-12 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold touch-target">Keluar</button>
      </div>
    </div>
  `, { size: 'sm' });
  document.getElementById('btn-cancel-logout').addEventListener('click', closeModal);
  document.getElementById('btn-confirm-logout').addEventListener('click', logout);
}
