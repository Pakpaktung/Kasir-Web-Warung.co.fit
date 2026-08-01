// ============================================================================
// UI: RIWAYAT TRANSAKSI
// Kasir hanya melihat transaksi miliknya sendiri (dibatasi RLS di database);
// admin melihat semua transaksi dari seluruh kasir.
// ============================================================================

import { state, isAdmin } from './state.js';
import * as api from './api.js';
import { formatRupiah, formatTanggal, escapeHtml, showToast, openModal, closeModal, withLoading } from './utils.js';
import { showReceiptModal } from './ui-receipt.js';

export async function renderHistory() {
  const container = document.getElementById('tab-history');
  container.innerHTML = `<div class="text-center text-slate-400 py-10 text-sm">Memuat riwayat...</div>`;

  let transactions = [];
  try {
    transactions = await api.fetchTransactions({ limit: 100 });
  } catch (err) {
    container.innerHTML = `<div class="text-center text-red-400 py-10 text-sm">Gagal memuat riwayat: ${err.message}</div>`;
    return;
  }

  container.innerHTML = `
    <h2 class="text-xl font-bold text-slate-800 mb-1">Riwayat Transaksi</h2>
    <p class="text-xs text-slate-400 mb-4">${isAdmin() ? 'Menampilkan transaksi seluruh kasir.' : 'Menampilkan transaksi Anda sendiri.'}</p>
    <div class="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100">
      ${transactions.length === 0
        ? `<div class="text-center text-slate-400 py-10">Belum ada transaksi.</div>`
        : transactions.map(t => `
          <div class="flex items-center gap-1 hover:bg-slate-50">
            <button data-id="${t.id}" class="history-item flex-1 min-w-0 text-left p-4 flex items-center justify-between gap-3 touch-target">
              <div class="min-w-0">
                <div class="flex items-center gap-1.5">
                  <p class="font-semibold text-slate-800 text-sm">${t.code}</p>
                  <span class="text-[10px] font-semibold px-1.5 py-0.5 rounded ${t.payment_method === 'qris' ? 'bg-brand-50 text-brand-600' : 'bg-slate-100 text-slate-500'}">${t.payment_method === 'qris' ? 'QRIS' : 'TUNAI'}</span>
                </div>
                <p class="text-xs text-slate-400">${formatTanggal(t.created_at)} • ${t.transaction_items.length} item ${isAdmin() ? `• ${t.profiles?.full_name || '-'}` : ''}${t.customer_name ? ` • ${escapeHtml(t.customer_name)}` : ''}</p>
              </div>
              <p class="font-bold text-brand-700 font-mono-num shrink-0">${formatRupiah(t.total)}</p>
            </button>
            ${isAdmin() ? `
            <button data-id="${t.id}" data-code="${escapeHtml(t.code)}" class="delete-history-btn shrink-0 w-10 h-10 mr-2 rounded-lg text-red-400 hover:bg-red-50 hover:text-red-600 touch-target" title="Hapus transaksi">🗑</button>
            ` : ''}
          </div>
        `).join('')}
    </div>
  `;

  document.querySelectorAll('.history-item').forEach(btn => {
    btn.addEventListener('click', async () => {
      try {
        const trx = await api.fetchTransactionById(btn.dataset.id);
        showReceiptModal(trx);
      } catch (err) {
        showToast('Gagal memuat detail transaksi: ' + err.message, 'error');
      }
    });
  });

  document.querySelectorAll('.delete-history-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      confirmDeleteTransaction(btn.dataset.id, btn.dataset.code);
    });
  });
}

// Konfirmasi hapus transaksi -- KHUSUS ADMIN (tombolnya saja sudah disembunyikan
// dari kasir biasa, dan RLS di database menolak percobaan hapus dari non-admin
// sebagai lapisan pengaman kedua).
function confirmDeleteTransaction(id, code) {
  openModal(`
    <div class="p-5">
      <h3 class="text-lg font-bold text-slate-800 mb-2">Hapus Transaksi ${escapeHtml(code)}?</h3>
      <p class="text-sm text-slate-500 mb-3">Transaksi ini akan dihapus <b>permanen</b> beserta seluruh itemnya dan tidak bisa dikembalikan.</p>
      <div class="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-5 text-xs text-amber-700">
        ⚠️ Stok produk yang sudah terjual di transaksi ini <b>TIDAK</b> otomatis dikembalikan, dan Total Omzet/Keuntungan di Laporan akan ikut berubah begitu transaksi ini dihapus. Sesuaikan stok secara manual lewat menu Produk kalau diperlukan.
      </div>
      <div class="flex gap-2">
        <button id="btn-cancel-delete-trx" class="flex-1 h-12 rounded-xl border border-slate-200 font-semibold text-slate-600 touch-target">Batal</button>
        <button id="btn-confirm-delete-trx" class="flex-1 h-12 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold touch-target">Hapus Permanen</button>
      </div>
    </div>
  `, { size: 'sm' });

  document.getElementById('btn-cancel-delete-trx').addEventListener('click', closeModal);
  document.getElementById('btn-confirm-delete-trx').addEventListener('click', async () => {
    await withLoading(api.deleteTransaction(id), 'Gagal menghapus transaksi');
    closeModal();
    showToast('Transaksi dihapus', 'success');
    renderHistory();
  });
}
