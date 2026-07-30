// ============================================================================
// UI: MANAJEMEN PRODUK (CRUD) - hanya role admin yang boleh tambah/edit/hapus.
// Kasir tetap bisa MELIHAT daftar produk (read-only) untuk referensi stok.
// ============================================================================

import { state, isAdmin } from './state.js';
import * as api from './api.js';
import { formatRupiah, escapeHtml, showToast, openModal, closeModal, withLoading } from './utils.js';

export function renderProducts() {
  const container = document.getElementById('tab-products');
  const canEdit = isAdmin();

  container.innerHTML = `
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
      <h2 class="text-xl font-bold text-slate-800">Manajemen Produk</h2>
      ${canEdit ? `<button id="btn-add-product" class="h-11 px-4 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-semibold text-sm touch-target">+ Tambah Produk</button>` : ''}
    </div>
    ${!canEdit ? `<p class="text-xs text-slate-400 mb-3">Anda login sebagai Kasir - hanya admin yang bisa mengubah data produk.</p>` : ''}

    <div class="bg-white rounded-2xl border border-slate-200 overflow-hidden">
      <table class="w-full text-sm hidden sm:table">
        <thead class="bg-slate-50 text-slate-500 text-left">
          <tr>
            <th class="px-4 py-3 font-medium">Nama Produk</th>
            <th class="px-4 py-3 font-medium">Kategori</th>
            <th class="px-4 py-3 font-medium text-right">HPP</th>
            <th class="px-4 py-3 font-medium text-right">Harga Jual</th>
            <th class="px-4 py-3 font-medium text-right">Margin</th>
            <th class="px-4 py-3 font-medium text-right">Stok</th>
            ${canEdit ? `<th class="px-4 py-3 font-medium text-center">Aksi</th>` : ''}
          </tr>
        </thead>
        <tbody id="product-table-body" class="divide-y divide-slate-100">
          ${renderProductRows(canEdit)}
        </tbody>
      </table>
      <div id="product-card-list" class="sm:hidden divide-y divide-slate-100">
        ${renderProductCardsMobile(canEdit)}
      </div>
    </div>
  `;

  if (canEdit) {
    document.getElementById('btn-add-product').addEventListener('click', () => openProductForm(null));
    attachProductActionEvents();
  }
}

function renderProductRows(canEdit) {
  if (state.products.length === 0) {
    return `<tr><td colspan="7" class="text-center text-slate-400 py-8">Belum ada produk.</td></tr>`;
  }
  return state.products.map(p => {
    const margin = Number(p.price) - Number(p.cost_price || 0);
    const marginPct = p.price > 0 ? Math.round((margin / p.price) * 100) : 0;
    return `
    <tr>
      <td class="px-4 py-3 font-medium text-slate-800">${escapeHtml(p.name)}</td>
      <td class="px-4 py-3 text-slate-500">${escapeHtml(p.category || '-')}</td>
      <td class="px-4 py-3 text-right font-mono-num text-slate-500">${formatRupiah(p.cost_price || 0)}</td>
      <td class="px-4 py-3 text-right font-mono-num">${formatRupiah(p.price)}</td>
      <td class="px-4 py-3 text-right font-mono-num text-xs ${margin < 0 ? 'text-red-500' : 'text-emerald-600'}">${formatRupiah(margin)} <span class="text-slate-400">(${marginPct}%)</span></td>
      <td class="px-4 py-3 text-right font-mono-num ${p.stock <= 5 ? 'text-red-500 font-semibold' : ''}">${p.stock}</td>
      ${canEdit ? `
      <td class="px-4 py-3 text-center">
        <button data-action="edit" data-id="${p.id}" class="product-action-btn text-brand-600 hover:underline text-xs font-semibold mr-3">Edit</button>
        <button data-action="delete" data-id="${p.id}" class="product-action-btn text-red-500 hover:underline text-xs font-semibold">Hapus</button>
      </td>` : ''}
    </tr>
  `;
  }).join('');
}

function renderProductCardsMobile(canEdit) {
  if (state.products.length === 0) return `<div class="text-center text-slate-400 py-8">Belum ada produk.</div>`;
  return state.products.map(p => `
    <div class="p-4 flex items-center justify-between gap-3">
      <div class="min-w-0">
        <p class="font-semibold text-slate-800 truncate">${escapeHtml(p.name)}</p>
        <p class="text-xs text-slate-400">${escapeHtml(p.category || '-')} • Stok: <span class="${p.stock <= 5 ? 'text-red-500 font-semibold' : ''}">${p.stock}</span></p>
        <p class="text-sm font-bold text-brand-700 font-mono-num mt-0.5">${formatRupiah(p.price)} <span class="text-xs font-normal text-slate-400">(HPP ${formatRupiah(p.cost_price || 0)})</span></p>
      </div>
      ${canEdit ? `
      <div class="flex flex-col gap-1 shrink-0">
        <button data-action="edit" data-id="${p.id}" class="product-action-btn touch-target px-3 py-1.5 rounded-lg bg-brand-50 text-brand-600 text-xs font-semibold">Edit</button>
        <button data-action="delete" data-id="${p.id}" class="product-action-btn touch-target px-3 py-1.5 rounded-lg bg-red-50 text-red-500 text-xs font-semibold">Hapus</button>
      </div>` : ''}
    </div>
  `).join('');
}

function attachProductActionEvents() {
  document.querySelectorAll('.product-action-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      if (btn.dataset.action === 'edit') openProductForm(id);
      else confirmDeleteProduct(id);
    });
  });
}

function openProductForm(productId) {
  const isEdit = !!productId;
  const product = isEdit ? state.products.find(p => p.id === productId) : null;

  openModal(`
    <form id="product-form" class="p-5">
      <h3 class="text-lg font-bold text-slate-800 mb-4">${isEdit ? 'Edit Produk' : 'Tambah Produk'}</h3>
      <div class="space-y-3">
        <div>
          <label class="text-sm font-medium text-slate-600">Nama Produk</label>
          <input name="name" required value="${escapeHtml(product?.name || '')}"
            class="w-full h-11 mt-1 px-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500 touch-target" />
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="text-sm font-medium text-slate-600">HPP / Modal (Rp)</label>
            <input name="cost_price" id="input-cost-price" type="number" min="0" required value="${product?.cost_price ?? 0}"
              class="w-full h-11 mt-1 px-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500 touch-target" />
          </div>
          <div>
            <label class="text-sm font-medium text-slate-600">Harga Jual (Rp)</label>
            <input name="price" id="input-price" type="number" min="0" required value="${product?.price ?? ''}"
              class="w-full h-11 mt-1 px-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500 touch-target" />
          </div>
        </div>
        <p id="margin-preview" class="text-xs text-slate-400 -mt-1"></p>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="text-sm font-medium text-slate-600">Stok</label>
            <input name="stock" type="number" min="0" required value="${product?.stock ?? ''}"
              class="w-full h-11 mt-1 px-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500 touch-target" />
          </div>
          <div>
            <label class="text-sm font-medium text-slate-600">Kategori</label>
            <input name="category" list="category-options" value="${escapeHtml(product?.category || '')}" placeholder="cth: Minuman"
              class="w-full h-11 mt-1 px-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500 touch-target" />
            <datalist id="category-options">
              ${[...new Set(state.products.map(p => p.category).filter(Boolean))].map(c => `<option value="${escapeHtml(c)}">`).join('')}
            </datalist>
          </div>
        </div>
      </div>
      <div class="flex gap-2 mt-6">
        <button type="button" id="btn-cancel-product" class="flex-1 h-12 rounded-xl border border-slate-200 font-semibold text-slate-600 touch-target">Batal</button>
        <button type="submit" class="flex-1 h-12 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-bold touch-target">Simpan</button>
      </div>
    </form>
  `, { size: 'sm' });

  document.getElementById('btn-cancel-product').addEventListener('click', closeModal);

  // Live preview margin (harga jual - HPP) saat kedua input diisi/diubah
  const costInput = document.getElementById('input-cost-price');
  const priceInput = document.getElementById('input-price');
  const marginPreview = document.getElementById('margin-preview');
  function updateMarginPreview() {
    const cost = Number(costInput.value) || 0;
    const price = Number(priceInput.value) || 0;
    const margin = price - cost;
    const marginPct = price > 0 ? Math.round((margin / price) * 100) : 0;
    marginPreview.textContent = `Margin: ${formatRupiah(margin)} (${marginPct}% dari harga jual)`;
    marginPreview.className = `text-xs -mt-1 ${margin < 0 ? 'text-red-500' : 'text-emerald-600'}`;
  }
  costInput.addEventListener('input', updateMarginPreview);
  priceInput.addEventListener('input', updateMarginPreview);
  updateMarginPreview();

  document.getElementById('product-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const payload = {
      name: fd.get('name').trim(),
      cost_price: Number(fd.get('cost_price')),
      price: Number(fd.get('price')),
      stock: Number(fd.get('stock')),
      category: fd.get('category').trim() || 'Lainnya',
    };
    if (!payload.name || payload.price < 0 || payload.cost_price < 0 || payload.stock < 0) {
      return showToast('Mohon lengkapi data dengan benar', 'error');
    }

    if (isEdit) await withLoading(api.updateProduct(productId, payload), 'Gagal memperbarui produk');
    else await withLoading(api.createProduct(payload), 'Gagal menambah produk');

    showToast(isEdit ? 'Produk berhasil diperbarui' : 'Produk berhasil ditambahkan', 'success');
    closeModal();
    await reloadProductsAndRerender();
  });
}

function confirmDeleteProduct(productId) {
  const product = state.products.find(p => p.id === productId);
  if (!product) return;

  openModal(`
    <div class="p-5">
      <h3 class="text-lg font-bold text-slate-800 mb-2">Hapus Produk?</h3>
      <p class="text-sm text-slate-500 mb-5">Yakin ingin menghapus <b>${escapeHtml(product.name)}</b>? Produk akan disembunyikan dari daftar, namun riwayat transaksi lama tetap tersimpan.</p>
      <div class="flex gap-2">
        <button id="btn-cancel-delete" class="flex-1 h-12 rounded-xl border border-slate-200 font-semibold text-slate-600 touch-target">Batal</button>
        <button id="btn-confirm-delete" class="flex-1 h-12 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold touch-target">Hapus</button>
      </div>
    </div>
  `, { size: 'sm' });

  document.getElementById('btn-cancel-delete').addEventListener('click', closeModal);
  document.getElementById('btn-confirm-delete').addEventListener('click', async () => {
    await withLoading(api.deactivateProduct(productId), 'Gagal menghapus produk');
    closeModal();
    showToast('Produk dihapus', 'success');
    await reloadProductsAndRerender();
  });
}

async function reloadProductsAndRerender() {
  state.products = await api.fetchProducts();
  renderProducts();
}
