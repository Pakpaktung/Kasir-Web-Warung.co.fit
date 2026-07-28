// ============================================================================
// UI: LAYAR KASIR (POS) + MANAJEMEN SHIFT
// ============================================================================

import { state } from './state.js';
import * as api from './api.js';
import { formatRupiah, escapeHtml, showToast, openModal, closeModal, withLoading } from './utils.js';
import { showReceiptModal } from './ui-receipt.js';

export async function renderPOS() {
  const container = document.getElementById('tab-pos');

  // Kasir wajib membuka shift sebelum bisa mulai transaksi.
  if (!state.currentShift) {
    container.innerHTML = renderNoShiftScreen();
    document.getElementById('btn-open-shift').addEventListener('click', openShiftModal);
    return;
  }

  const categories = ['Semua', ...new Set(state.products.map(p => p.category).filter(Boolean))];

  container.innerHTML = `
    <!-- Banner status shift aktif -->
    <div class="flex items-center justify-between bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2 mb-3 text-xs">
      <span class="text-emerald-700 font-medium">
        🟢 Shift aktif sejak ${new Date(state.currentShift.started_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
        &middot; Modal awal ${formatRupiah(state.currentShift.starting_cash)}
      </span>
      <button id="btn-close-shift" class="text-red-500 font-semibold hover:underline">Tutup Shift</button>
    </div>

    <div class="flex flex-col lg:flex-row gap-4 lg:h-[calc(100vh-11rem)]">
      <div class="flex-1 flex flex-col min-h-0">
        <div class="flex flex-col sm:flex-row gap-2 mb-3">
          <div class="relative flex-1">
            <input id="pos-search" type="text" placeholder="Cari nama produk..." value="${escapeHtml(state.productSearch)}"
              class="w-full h-11 pl-10 pr-3 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 touch-target" />
            <span class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
          </div>
        </div>

        <div class="flex gap-2 overflow-x-auto pb-2 mb-2 -mx-1 px-1">
          ${categories.map(cat => `
            <button data-cat="${escapeHtml(cat)}" class="cat-filter-btn shrink-0 px-4 py-2 rounded-full text-sm font-medium border touch-target transition
              ${state.productCategory === cat ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-slate-600 border-slate-200 hover:border-brand-300'}">
              ${escapeHtml(cat)}
            </button>`).join('')}
        </div>

        <div id="pos-product-grid" class="flex-1 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3 content-start pb-2">
          ${renderProductGridItems()}
        </div>
      </div>

      <div class="w-full lg:w-96 shrink-0 bg-white rounded-2xl border border-slate-200 flex flex-col shadow-sm lg:h-full">
        <div class="p-4 border-b border-slate-100 flex items-center justify-between">
          <h2 class="font-bold text-slate-800">🛒 Keranjang</h2>
          ${state.cart.length ? `<button id="btn-clear-cart" class="text-xs text-red-500 font-medium hover:underline">Kosongkan</button>` : ''}
        </div>
        <div id="cart-items" class="flex-1 overflow-y-auto max-h-[40vh] lg:max-h-none p-3 space-y-2">
          ${renderCartItems()}
        </div>
        <div class="p-4 border-t border-slate-100 space-y-3">
          ${renderCartSummary()}
          <button id="btn-checkout" ${state.cart.length === 0 ? 'disabled' : ''}
            class="w-full h-12 rounded-xl bg-brand-600 hover:bg-brand-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-white font-bold transition touch-target">
            Bayar
          </button>
        </div>
      </div>
    </div>
  `;

  document.getElementById('btn-close-shift').addEventListener('click', openCloseShiftModal);

  document.getElementById('pos-search').addEventListener('input', (e) => {
    state.productSearch = e.target.value;
    document.getElementById('pos-product-grid').innerHTML = renderProductGridItems();
    attachProductGridEvents();
  });

  container.querySelectorAll('.cat-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => { state.productCategory = btn.dataset.cat; renderPOS(); });
  });

  const clearBtn = document.getElementById('btn-clear-cart');
  if (clearBtn) clearBtn.addEventListener('click', () => { state.cart = []; renderPOS(); });

  const checkoutBtn = document.getElementById('btn-checkout');
  if (checkoutBtn) checkoutBtn.addEventListener('click', openPaymentModal);

  attachProductGridEvents();
  attachCartItemEvents();
}

function renderNoShiftScreen() {
  return `
    <div class="flex flex-col items-center justify-center text-center py-20">
      <div class="text-4xl mb-3">🕒</div>
      <h2 class="font-bold text-slate-800 mb-1">Shift Belum Dibuka</h2>
      <p class="text-sm text-slate-400 mb-5 max-w-xs">Anda perlu membuka shift (mencatat modal awal kas) sebelum bisa mulai melayani transaksi.</p>
      <button id="btn-open-shift" class="h-12 px-6 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-bold touch-target">Buka Shift</button>
    </div>
  `;
}

function openShiftModal() {
  openModal(`
    <div class="p-5">
      <h3 class="text-lg font-bold text-slate-800 mb-4">Buka Shift</h3>
      <label class="text-sm font-medium text-slate-600">Modal Awal Kas</label>
      <input id="input-starting-cash" type="number" min="0" placeholder="0"
        class="w-full h-12 mt-1 mb-5 px-4 rounded-xl border border-slate-200 text-lg font-bold focus:outline-none focus:ring-2 focus:ring-brand-500 touch-target" />
      <div class="flex gap-2">
        <button id="btn-cancel-shift" class="flex-1 h-12 rounded-xl border border-slate-200 font-semibold text-slate-600 touch-target">Batal</button>
        <button id="btn-confirm-open-shift" class="flex-1 h-12 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-bold touch-target">Mulai</button>
      </div>
    </div>
  `, { size: 'sm' });

  document.getElementById('btn-cancel-shift').addEventListener('click', closeModal);
  document.getElementById('btn-confirm-open-shift').addEventListener('click', async () => {
    const startingCash = Number(document.getElementById('input-starting-cash').value) || 0;
    const shift = await withLoading(api.openShift(state.profile.id, startingCash), 'Gagal membuka shift');
    if (!shift) return;
    state.currentShift = shift;
    closeModal();
    showToast('Shift dibuka', 'success');
    renderPOS();
  });
}

function openCloseShiftModal() {
  openModal(`
    <div class="p-5">
      <h3 class="text-lg font-bold text-slate-800 mb-4">Tutup Shift</h3>
      <p class="text-xs text-slate-400 mb-4">Modal awal: ${formatRupiah(state.currentShift.starting_cash)}</p>
      <label class="text-sm font-medium text-slate-600">Jumlah Kas Akhir (fisik di laci)</label>
      <input id="input-ending-cash" type="number" min="0" placeholder="0"
        class="w-full h-12 mt-1 mb-3 px-4 rounded-xl border border-slate-200 text-lg font-bold focus:outline-none focus:ring-2 focus:ring-brand-500 touch-target" />
      <label class="text-sm font-medium text-slate-600">Catatan (opsional)</label>
      <textarea id="input-shift-notes" rows="2" class="w-full mt-1 mb-5 px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500"></textarea>
      <div class="flex gap-2">
        <button id="btn-cancel-close-shift" class="flex-1 h-12 rounded-xl border border-slate-200 font-semibold text-slate-600 touch-target">Batal</button>
        <button id="btn-confirm-close-shift" class="flex-1 h-12 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold touch-target">Tutup Shift</button>
      </div>
    </div>
  `, { size: 'sm' });

  document.getElementById('btn-cancel-close-shift').addEventListener('click', closeModal);
  document.getElementById('btn-confirm-close-shift').addEventListener('click', async () => {
    const endingCash = Number(document.getElementById('input-ending-cash').value) || 0;
    const notes = document.getElementById('input-shift-notes').value.trim();
    await withLoading(api.closeShift(state.currentShift.id, endingCash, notes), 'Gagal menutup shift');
    state.currentShift = null;
    closeModal();
    showToast('Shift ditutup. Sampai jumpa!', 'success');
    renderPOS();
  });
}

/* ------------------------------ PRODUK & GRID ------------------------------ */

function renderProductGridItems() {
  const q = state.productSearch.trim().toLowerCase();
  const filtered = state.products.filter(p => {
    const matchSearch = !q || p.name.toLowerCase().includes(q);
    const matchCat = state.productCategory === 'Semua' || p.category === state.productCategory;
    return matchSearch && matchCat;
  });

  if (filtered.length === 0) {
    return `<div class="col-span-full text-center text-slate-400 py-10 text-sm">Produk tidak ditemukan.</div>`;
  }

  return filtered.map(p => `
    <button data-id="${p.id}" ${p.stock <= 0 ? 'disabled' : ''}
      class="pos-product-card ${p.stock <= 0 ? 'opacity-40 cursor-not-allowed' : ''} touch-target
        bg-white rounded-xl border border-slate-200 p-3 text-left hover:border-brand-400 hover:shadow-md active:scale-95 transition flex flex-col">
      <div class="w-full aspect-square rounded-lg bg-brand-50 text-brand-400 flex items-center justify-center text-2xl mb-2">
        ${p.category === 'Minuman' ? '🥤' : p.category === 'Makanan' ? '🍽️' : '🍪'}
      </div>
      <p class="text-sm font-semibold text-slate-800 leading-tight line-clamp-2">${escapeHtml(p.name)}</p>
      <p class="text-xs text-slate-400 mb-1">Stok: ${p.stock}</p>
      <p class="text-sm font-bold text-brand-700 mt-auto font-mono-num">${formatRupiah(p.price)}</p>
    </button>
  `).join('');
}

function attachProductGridEvents() {
  document.querySelectorAll('.pos-product-card').forEach(card => {
    card.addEventListener('click', () => addToCart(card.dataset.id));
  });
}

/* -------------------------------- KERANJANG -------------------------------- */

function renderCartItems() {
  if (state.cart.length === 0) {
    return `<div class="text-center text-slate-400 text-sm py-10">Keranjang masih kosong.<br>Klik produk untuk menambahkan.</div>`;
  }
  return state.cart.map(item => `
    <div class="flex items-center gap-2 bg-slate-50 rounded-xl p-2">
      <div class="flex-1 min-w-0">
        <p class="text-sm font-medium text-slate-800 truncate">${escapeHtml(item.name)}</p>
        <p class="text-xs text-slate-400 font-mono-num">${formatRupiah(item.price)}</p>
      </div>
      <div class="flex items-center gap-1 shrink-0">
        <button data-action="dec" data-id="${item.productId}" class="cart-qty-btn touch-target w-8 h-8 rounded-lg bg-white border border-slate-200 font-bold text-slate-600">-</button>
        <span class="w-6 text-center text-sm font-semibold font-mono-num">${item.qty}</span>
        <button data-action="inc" data-id="${item.productId}" class="cart-qty-btn touch-target w-8 h-8 rounded-lg bg-white border border-slate-200 font-bold text-slate-600">+</button>
      </div>
      <button data-action="remove" data-id="${item.productId}" class="cart-qty-btn touch-target w-8 h-8 shrink-0 rounded-lg text-red-400 hover:bg-red-50">🗑</button>
    </div>
  `).join('');
}

function attachCartItemEvents() {
  document.querySelectorAll('.cart-qty-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      if (btn.dataset.action === 'inc') changeCartQty(id, 1);
      else if (btn.dataset.action === 'dec') changeCartQty(id, -1);
      else removeFromCart(id);
    });
  });
}

function renderCartSummary() {
  const totals = computeCartTotals();
  return `
    <div class="space-y-1 text-sm">
      <div class="flex justify-between text-slate-500"><span>Subtotal</span><span class="font-mono-num">${formatRupiah(totals.subtotal)}</span></div>
      ${state.settings.discount_percent > 0 ? `<div class="flex justify-between text-slate-500"><span>Diskon (${state.settings.discount_percent}%)</span><span class="font-mono-num text-red-500">-${formatRupiah(totals.discountAmount)}</span></div>` : ''}
      ${state.settings.tax_percent > 0 ? `<div class="flex justify-between text-slate-500"><span>Pajak (${state.settings.tax_percent}%)</span><span class="font-mono-num">${formatRupiah(totals.taxAmount)}</span></div>` : ''}
      <div class="flex justify-between text-base font-bold text-slate-800 pt-1 border-t border-dashed border-slate-200"><span>Total</span><span class="font-mono-num">${formatRupiah(totals.total)}</span></div>
    </div>
  `;
}

function computeCartTotals() {
  const subtotal = state.cart.reduce((sum, i) => sum + i.price * i.qty, 0);
  const discountAmount = Math.round(subtotal * (state.settings.discount_percent / 100));
  const afterDiscount = subtotal - discountAmount;
  const taxAmount = Math.round(afterDiscount * (state.settings.tax_percent / 100));
  return { subtotal, discountAmount, taxAmount, total: afterDiscount + taxAmount };
}

function addToCart(productId) {
  const product = state.products.find(p => p.id === productId);
  if (!product || product.stock <= 0) return showToast('Stok produk habis', 'error');

  const existing = state.cart.find(i => i.productId === productId);
  const qtyInCart = existing ? existing.qty : 0;
  if (qtyInCart + 1 > product.stock) return showToast(`Stok "${product.name}" tidak mencukupi`, 'error');

  if (existing) existing.qty += 1;
  else state.cart.push({ productId: product.id, name: product.name, price: Number(product.price), qty: 1 });
  refreshCartUI();
}

function changeCartQty(productId, delta) {
  const item = state.cart.find(i => i.productId === productId);
  if (!item) return;
  const product = state.products.find(p => p.id === productId);
  const newQty = item.qty + delta;
  if (newQty <= 0) return removeFromCart(productId);
  if (product && newQty > product.stock) return showToast(`Stok "${product.name}" tidak mencukupi`, 'error');
  item.qty = newQty;
  refreshCartUI();
}

function removeFromCart(productId) {
  state.cart = state.cart.filter(i => i.productId !== productId);
  refreshCartUI();
}

function refreshCartUI() {
  document.getElementById('cart-items').innerHTML = renderCartItems();
  attachCartItemEvents();
  const btn = document.getElementById('btn-checkout');
  btn.parentElement.querySelector('div').outerHTML = renderCartSummary();
  document.getElementById('btn-checkout').disabled = state.cart.length === 0;

  const header = document.querySelector('#tab-pos h2')?.parentElement;
  const existingClearBtn = document.getElementById('btn-clear-cart');
  if (header && state.cart.length > 0 && !existingClearBtn) {
    header.insertAdjacentHTML('beforeend', `<button id="btn-clear-cart" class="text-xs text-red-500 font-medium hover:underline">Kosongkan</button>`);
    document.getElementById('btn-clear-cart').addEventListener('click', () => { state.cart = []; renderPOS(); });
  } else if (existingClearBtn && state.cart.length === 0) {
    existingClearBtn.remove();
  }
}

/* -------------------------------- PEMBAYARAN -------------------------------- */

function openPaymentModal() {
  const totals = computeCartTotals();

  openModal(`
    <div class="p-5">
      <h3 class="text-lg font-bold text-slate-800 mb-4">Pembayaran</h3>
      <div class="bg-slate-50 rounded-xl p-4 mb-4 text-center">
        <p class="text-xs text-slate-500 mb-1">Total Belanja</p>
        <p class="text-3xl font-extrabold text-brand-700 font-mono-num">${formatRupiah(totals.total)}</p>
      </div>
      <label class="text-sm font-medium text-slate-600">Uang Dibayar</label>
      <input id="input-paid" type="number" inputmode="numeric" placeholder="0"
        class="w-full h-14 mt-1 mb-2 px-4 rounded-xl border border-slate-200 text-2xl font-bold font-mono-num focus:outline-none focus:ring-2 focus:ring-brand-500 touch-target" />
      <div class="grid grid-cols-4 gap-2 mb-4">
        ${[totals.total, 20000, 50000, 100000].map(n => `
          <button class="quick-pay-btn touch-target h-10 rounded-lg bg-slate-100 hover:bg-brand-100 text-xs font-semibold text-slate-600" data-amount="${n}">
            ${n === totals.total ? 'Pas' : formatRupiah(n)}
          </button>`).join('')}
      </div>
      <div class="flex justify-between items-center bg-emerald-50 rounded-xl p-4 mb-5">
        <span class="text-sm font-medium text-emerald-700">Kembalian</span>
        <span id="change-display" class="text-xl font-bold text-emerald-700 font-mono-num">Rp0</span>
      </div>
      <div class="flex gap-2">
        <button id="btn-cancel-pay" class="flex-1 h-12 rounded-xl border border-slate-200 font-semibold text-slate-600 touch-target">Batal</button>
        <button id="btn-confirm-pay" class="flex-1 h-12 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-bold touch-target" disabled>Konfirmasi & Cetak</button>
      </div>
    </div>
  `, { size: 'sm' });

  const input = document.getElementById('input-paid');
  const changeDisplay = document.getElementById('change-display');
  const confirmBtn = document.getElementById('btn-confirm-pay');

  function updateChange() {
    const paid = Number(input.value) || 0;
    const change = paid - totals.total;
    changeDisplay.textContent = formatRupiah(Math.max(change, 0));
    changeDisplay.parentElement.classList.toggle('bg-emerald-50', change >= 0);
    changeDisplay.parentElement.classList.toggle('bg-red-50', change < 0);
    confirmBtn.disabled = paid < totals.total;
  }

  input.addEventListener('input', updateChange);
  document.querySelectorAll('.quick-pay-btn').forEach(btn => {
    btn.addEventListener('click', () => { input.value = btn.dataset.amount; updateChange(); });
  });

  document.getElementById('btn-cancel-pay').addEventListener('click', closeModal);
  confirmBtn.addEventListener('click', async () => {
    const paid = Number(input.value) || 0;
    if (paid < totals.total) return;
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Memproses...';

    try {
      // Checkout diproses di server (function create_transaction) supaya
      // harga & stok tervalidasi ulang di database, bukan hanya dipercaya dari client.
      const result = await api.checkout(state.cart, paid, state.currentShift.id);
      state.cart = [];
      closeModal();
      showToast('Transaksi berhasil disimpan', 'success');

      // Muat ulang detail transaksi lengkap (termasuk item) untuk ditampilkan di struk
      const fullTrx = await api.fetchTransactionById(result.id);
      renderPOS();
      showReceiptModal(fullTrx);
    } catch (err) {
      showToast('Checkout gagal: ' + (err.message || err), 'error');
      confirmBtn.disabled = false;
      confirmBtn.textContent = 'Konfirmasi & Cetak';
    }
  });

  input.focus();
}
