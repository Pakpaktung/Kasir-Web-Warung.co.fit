// ============================================================================
// UI: STRUK TRANSAKSI - preview di modal, cetak via window.print(), dan
// jalur cetak cepat via ESC/POS (Bluetooth) jika printer sudah dihubungkan.
// ============================================================================

import { state } from './state.js';
import { formatRupiah, formatTanggal, escapeHtml, openModal, closeModal, showToast } from './utils.js';
import { isPrinterConnected, printReceiptESCPOS } from './escpos.js';

// Menampilkan preview struk di dalam modal, dengan tombol cetak (browser & ESC/POS).
export function showReceiptModal(transaction) {
  const hasEscposPrinter = isPrinterConnected();

  openModal(`
    <div class="p-5">
      <h3 class="text-lg font-bold text-slate-800 mb-4">Struk Transaksi</h3>
      <div class="border border-dashed border-slate-300 rounded-xl p-4 max-h-[50vh] overflow-y-auto bg-slate-50">
        ${buildReceiptInnerHTML(transaction)}
      </div>
      <div class="flex gap-2 mt-5">
        <button id="btn-close-receipt" class="flex-1 h-12 rounded-xl border border-slate-200 font-semibold text-slate-600 touch-target">Tutup</button>
        <button id="btn-print-receipt" class="flex-1 h-12 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-bold touch-target">🖨️ Cetak (Browser)</button>
      </div>
      ${hasEscposPrinter ? `
        <button id="btn-print-escpos" class="w-full h-11 mt-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm touch-target">
          ⚡ Cetak Cepat via Printer Thermal
        </button>
      ` : `
        <p class="text-center text-xs text-slate-400 mt-2">Belum ada printer thermal terhubung. Atur di menu Pengaturan &rarr; Printer.</p>
      `}
    </div>
  `, { size: 'sm' });

  document.getElementById('btn-close-receipt').addEventListener('click', closeModal);
  document.getElementById('btn-print-receipt').addEventListener('click', () => printReceiptBrowser(transaction));

  const escposBtn = document.getElementById('btn-print-escpos');
  if (escposBtn) {
    escposBtn.addEventListener('click', async () => {
      escposBtn.disabled = true;
      escposBtn.textContent = 'Mencetak...';
      try {
        await printReceiptESCPOS(transaction, state.settings);
        showToast('Struk terkirim ke printer', 'success');
      } catch (err) {
        showToast('Gagal cetak ESC/POS: ' + (err.message || err), 'error');
      } finally {
        escposBtn.disabled = false;
        escposBtn.textContent = '⚡ Cetak Cepat via Printer Thermal';
      }
    });
  }
}

// Membangun HTML isi struk (dipakai untuk preview modal maupun area cetak fisik).
export function buildReceiptInnerHTML(t) {
  const s = state.settings;
  const cashierName = t.profiles?.full_name || '-';

  return `
    <div class="font-mono-num text-xs leading-relaxed text-slate-800">
      <div class="text-center mb-2">
        ${s.logo_base64 ? `<img src="${s.logo_base64}" class="mx-auto mb-1" style="max-width:120px;max-height:70px;object-fit:contain" alt="Logo" />` : ''}
        <p class="font-bold text-sm">${escapeHtml(s.store_name)}</p>
        ${s.address ? `<p>${escapeHtml(s.address)}</p>` : ''}
        ${s.phone ? `<p>${escapeHtml(s.phone)}</p>` : ''}
      </div>
      <div class="border-t border-dashed border-slate-400 my-1"></div>
      <p>No: ${t.code}</p>
      <p>${formatTanggal(t.created_at)}</p>
      <p>Kasir: ${escapeHtml(cashierName)}</p>
      ${t.customer_name ? `<p>Pelanggan: ${escapeHtml(t.customer_name)}</p>` : ''}
      <div class="border-t border-dashed border-slate-400 my-1"></div>

      ${t.transaction_items.map(item => `
        <div class="mb-1">
          <div class="flex justify-between"><span>${escapeHtml(item.product_name)}</span></div>
          <div class="flex justify-between text-slate-500">
            <span>${item.qty} x ${formatRupiah(item.price)}</span>
            <span>${formatRupiah(item.qty * item.price)}</span>
          </div>
        </div>
      `).join('')}

      <div class="border-t border-dashed border-slate-400 my-1"></div>
      <div class="flex justify-between"><span>Subtotal</span><span>${formatRupiah(t.subtotal)}</span></div>
      ${t.discount_amount > 0 ? `<div class="flex justify-between"><span>Diskon (${t.discount_percent}%)</span><span>-${formatRupiah(t.discount_amount)}</span></div>` : ''}
      ${t.tax_amount > 0 ? `<div class="flex justify-between"><span>Pajak (${t.tax_percent}%)</span><span>${formatRupiah(t.tax_amount)}</span></div>` : ''}
      <div class="flex justify-between font-bold text-sm border-t border-dashed border-slate-400 mt-1 pt-1">
        <span>TOTAL</span><span>${formatRupiah(t.total)}</span>
      </div>
      <div class="flex justify-between mt-1"><span>Bayar</span><span>${formatRupiah(t.paid)}</span></div>
      <div class="flex justify-between"><span>Kembali</span><span>${formatRupiah(t.change)}</span></div>
      <div class="flex justify-between text-slate-500"><span>Metode</span><span>${t.payment_method === 'qris' ? 'QRIS' : 'Tunai'}</span></div>

      <div class="border-t border-dashed border-slate-400 my-1"></div>
      <p class="text-center mt-2">${escapeHtml(s.footer_note)}</p>
    </div>
  `;
}

// Cetak via dialog print bawaan browser (window.print()) - lihat CSS @media print di index.html.
function printReceiptBrowser(transaction) {
  const receiptArea = document.getElementById('receipt-print-area');
  receiptArea.innerHTML = buildReceiptInnerHTML(transaction);
  document.documentElement.style.setProperty('--receipt-width', state.settings.receipt_width);
  setTimeout(() => window.print(), 50);
}
