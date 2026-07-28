// ============================================================================
// UI: RIWAYAT TRANSAKSI
// Kasir hanya melihat transaksi miliknya sendiri (dibatasi RLS di database);
// admin melihat semua transaksi dari seluruh kasir.
// ============================================================================

import { state, isAdmin } from './state.js';
import * as api from './api.js';
import { formatRupiah, formatTanggal, showToast } from './utils.js';
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
          <button data-id="${t.id}" class="history-item w-full text-left p-4 flex items-center justify-between gap-3 hover:bg-slate-50 touch-target">
            <div class="min-w-0">
              <p class="font-semibold text-slate-800 text-sm">${t.code}</p>
              <p class="text-xs text-slate-400">${formatTanggal(t.created_at)} • ${t.transaction_items.length} item ${isAdmin() ? `• ${t.profiles?.full_name || '-'}` : ''}</p>
            </div>
            <p class="font-bold text-brand-700 font-mono-num shrink-0">${formatRupiah(t.total)}</p>
          </button>
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
}
