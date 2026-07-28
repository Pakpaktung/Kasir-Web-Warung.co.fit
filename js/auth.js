// ============================================================================
// MODUL AUTENTIKASI - login/registrasi, cek sesi, dan render halaman login
// ============================================================================

import { state } from './state.js';
import * as api from './api.js';
import { showToast, escapeHtml } from './utils.js';

// Mencoba memulihkan sesi yang tersimpan (jika user sebelumnya sudah login).
// Mengembalikan `true` jika berhasil login, `false` jika perlu menampilkan layar login.
export async function tryRestoreSession() {
  const session = await api.getSession();
  if (!session) return false;

  try {
    state.session = session;
    state.profile = await api.getMyProfile(session.user.id);
    if (!state.profile.is_active) {
      showToast('Akun Anda dinonaktifkan. Hubungi admin.', 'error');
      await api.signOut();
      state.session = null;
      state.profile = null;
      return false;
    }
    return true;
  } catch (err) {
    console.error('Gagal memuat profil:', err);
    return false;
  }
}

// Merender layar login penuh (menggantikan seluruh isi <body> #auth-root)
export function renderLoginScreen(onSuccess) {
  const root = document.getElementById('auth-root');
  root.classList.remove('hidden');
  document.getElementById('app-root').classList.add('hidden');

  root.innerHTML = `
    <div class="min-h-screen flex items-center justify-center bg-slate-100 px-4">
      <div class="w-full max-w-sm bg-white rounded-2xl shadow-lg p-6">
        <div class="text-center mb-6">
          <div class="w-12 h-12 rounded-xl bg-brand-600 text-white flex items-center justify-center font-bold text-xl mx-auto mb-2">K</div>
          <h1 class="text-lg font-bold text-slate-800">Masuk ke Kasir Toko</h1>
          <p class="text-xs text-slate-400">Gunakan akun yang diberikan admin toko Anda</p>
        </div>

        <form id="login-form" class="space-y-3">
          <div>
            <label class="text-sm font-medium text-slate-600">Email</label>
            <input name="email" type="email" required autocomplete="username"
              class="w-full h-11 mt-1 px-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
          <div>
            <label class="text-sm font-medium text-slate-600">Kata Sandi</label>
            <input name="password" type="password" required autocomplete="current-password"
              class="w-full h-11 mt-1 px-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
          <p id="login-error" class="text-xs text-red-500 hidden"></p>
          <button type="submit" id="btn-login" class="w-full h-11 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-bold">
            Masuk
          </button>
        </form>

        <button id="btn-show-register" class="w-full text-center text-xs text-brand-600 mt-4 hover:underline">
          Belum punya akun? Daftar sebagai kasir baru
        </button>
      </div>
    </div>
  `;

  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const btn = document.getElementById('btn-login');
    const errorEl = document.getElementById('login-error');
    errorEl.classList.add('hidden');
    btn.disabled = true;
    btn.textContent = 'Memproses...';

    try {
      await api.signIn(fd.get('email'), fd.get('password'));
      const ok = await tryRestoreSession();
      if (ok) onSuccess();
    } catch (err) {
      errorEl.textContent = 'Login gagal: email atau kata sandi salah.';
      errorEl.classList.remove('hidden');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Masuk';
    }
  });

  document.getElementById('btn-show-register').addEventListener('click', () => renderRegisterScreen(onSuccess));
}

function renderRegisterScreen(onSuccess) {
  const root = document.getElementById('auth-root');
  root.innerHTML = `
    <div class="min-h-screen flex items-center justify-center bg-slate-100 px-4">
      <div class="w-full max-w-sm bg-white rounded-2xl shadow-lg p-6">
        <h1 class="text-lg font-bold text-slate-800 mb-1">Daftar Akun Kasir</h1>
        <p class="text-xs text-slate-400 mb-5">Akun baru mendapat role "Kasir" secara default. Admin dapat mengubah role lewat menu Pengaturan &rarr; Manajemen User.</p>

        <form id="register-form" class="space-y-3">
          <div>
            <label class="text-sm font-medium text-slate-600">Nama Lengkap</label>
            <input name="fullName" required class="w-full h-11 mt-1 px-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
          <div>
            <label class="text-sm font-medium text-slate-600">Email</label>
            <input name="email" type="email" required class="w-full h-11 mt-1 px-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
          <div>
            <label class="text-sm font-medium text-slate-600">Kata Sandi (min. 6 karakter)</label>
            <input name="password" type="password" minlength="6" required class="w-full h-11 mt-1 px-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
          <p id="register-error" class="text-xs text-red-500 hidden"></p>
          <button type="submit" class="w-full h-11 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-bold">Daftar</button>
        </form>

        <button id="btn-back-login" class="w-full text-center text-xs text-brand-600 mt-4 hover:underline">
          Sudah punya akun? Masuk
        </button>
      </div>
    </div>
  `;

  document.getElementById('register-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const errorEl = document.getElementById('register-error');
    try {
      await api.signUp(fd.get('email'), fd.get('password'), fd.get('fullName'));
      showToast('Pendaftaran berhasil! Silakan cek email untuk verifikasi (jika diaktifkan), lalu masuk.', 'success');
      renderLoginScreen(onSuccess);
    } catch (err) {
      errorEl.textContent = 'Pendaftaran gagal: ' + escapeHtml(err.message || 'terjadi kesalahan');
      errorEl.classList.remove('hidden');
    }
  });

  document.getElementById('btn-back-login').addEventListener('click', () => renderLoginScreen(onSuccess));
}

export async function logout() {
  await api.signOut();
  state.session = null;
  state.profile = null;
  state.currentShift = null;
  window.location.reload(); // cara paling aman untuk membersihkan seluruh state UI
}
