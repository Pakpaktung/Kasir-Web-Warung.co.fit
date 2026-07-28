// ============================================================================
// UTILITAS UMUM - dipakai oleh semua modul UI
// ============================================================================

export function formatRupiah(number) {
  const n = Math.round(Number(number) || 0);
  return 'Rp' + n.toLocaleString('id-ID');
}

export function formatTanggal(isoString) {
  const d = new Date(isoString);
  const tgl = d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
  const jam = d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  return `${tgl}, ${jam}`;
}

export function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

export function showToast(message, type = 'success') {
  const root = document.getElementById('toast-root');
  if (!root) return;
  const colors = { success: 'bg-emerald-600', error: 'bg-red-600', info: 'bg-slate-800' };
  const el = document.createElement('div');
  el.className = `anim-slide ${colors[type] || colors.info} text-white text-sm font-medium px-4 py-2.5 rounded-lg shadow-lg`;
  el.textContent = message;
  root.appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity .3s';
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 300);
  }, 2500);
}

export function openModal(innerHtml, { size = 'md' } = {}) {
  const sizes = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-lg', xl: 'max-w-2xl' };
  const root = document.getElementById('modal-root');
  root.innerHTML = `
    <div id="modal-backdrop" class="fixed inset-0 bg-black/50 z-40 flex items-end sm:items-center justify-center anim-fade">
      <div class="bg-white w-full ${sizes[size]} sm:rounded-2xl rounded-t-2xl shadow-2xl anim-slide max-h-[92vh] overflow-y-auto">
        ${innerHtml}
      </div>
    </div>`;
  document.getElementById('modal-backdrop').addEventListener('click', (e) => {
    if (e.target.id === 'modal-backdrop') closeModal();
  });
}

export function closeModal() {
  const root = document.getElementById('modal-root');
  if (root) root.innerHTML = '';
}

// Wrapper sederhana untuk memanggil fungsi async dan otomatis menampilkan
// toast error yang mudah dibaca jika terjadi kegagalan (mis. RLS menolak, network error, dst).
export async function withLoading(promise, errorMessagePrefix = 'Gagal') {
  try {
    return await promise;
  } catch (err) {
    console.error(err);
    showToast(`${errorMessagePrefix}: ${err.message || err}`, 'error');
    throw err;
  }
}
