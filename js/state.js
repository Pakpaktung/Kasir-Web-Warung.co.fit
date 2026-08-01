// ============================================================================
// STATE GLOBAL APLIKASI (in-memory, di-refresh dari Supabase saat load/realtime)
// ============================================================================

export const state = {
  // --- Sesi & user ---
  session: null,        // objek session dari Supabase Auth
  profile: null,         // { id, full_name, role, is_active } dari tabel profiles
  currentShift: null,    // shift yang sedang berjalan milik user ini (atau null)

  // --- Data utama ---
  products: [],
  settings: {
    store_name: 'Toko Saya',
    address: '',
    phone: '',
    footer_note: 'Terima kasih telah berbelanja!',
    tax_percent: 0,
    discount_percent: 0,
    receipt_width: '80mm',
    logo_base64: null,
    qris_image_base64: null,
  },

  // --- UI ---
  currentTab: 'pos',
  cart: [],              // { productId, name, price, qty }
  productSearch: '',
  productCategory: 'Semua',
};

export function isAdmin() {
  return state.profile?.role === 'admin';
}
