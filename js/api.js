// ============================================================================
// LAPISAN API - membungkus semua pemanggilan Supabase (query & RPC)
// Modul UI TIDAK memanggil `supabase` langsung, selalu lewat fungsi di sini.
// Tujuannya: kalau suatu saat pindah backend (mis. ke Express API sendiri),
// cukup ubah file ini tanpa menyentuh kode UI.
// ============================================================================

import { supabase } from './supabase-client.js';

/* ---------------------------- AUTH & PROFILE ---------------------------- */

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export async function getMyProfile(userId) {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single();
  if (error) throw error;
  return data;
}

// Registrasi user baru. Role default 'kasir' dari trigger DB; admin bisa
// mengubahnya lewat halaman "Manajemen User" (lihat ui-settings.js).
export async function signUp(email, password, fullName) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName, role: 'kasir' } },
  });
  if (error) throw error;
  return data;
}

export async function listProfiles() {
  const { data, error } = await supabase.from('profiles').select('*').order('full_name');
  if (error) throw error;
  return data;
}

export async function updateProfileRole(userId, role) {
  const { error } = await supabase.from('profiles').update({ role }).eq('id', userId);
  if (error) throw error;
}


/* ------------------------------- PRODUCTS -------------------------------- */

export async function fetchProducts() {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('is_active', true)
    .order('name');
  if (error) throw error;
  return data;
}

export async function createProduct(payload) {
  const { error } = await supabase.from('products').insert(payload);
  if (error) throw error;
}

export async function updateProduct(id, payload) {
  const { error } = await supabase.from('products')
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

// Soft-delete: produk ditandai nonaktif, bukan dihapus permanen, agar riwayat
// transaksi lama yang mereferensikan produk ini tetap valid & bisa dilaporkan.
export async function deactivateProduct(id) {
  const { error } = await supabase.from('products').update({ is_active: false }).eq('id', id);
  if (error) throw error;
}

// Berlangganan perubahan realtime pada tabel produk (dipakai agar stok
// otomatis update di semua perangkat kasir tanpa perlu refresh manual).
export function subscribeProducts(onChange) {
  return supabase
    .channel('products-realtime')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, onChange)
    .subscribe();
}


/* ------------------------------- SETTINGS -------------------------------- */

export async function fetchSettings() {
  const { data, error } = await supabase.from('store_settings').select('*').eq('id', 1).single();
  if (error) throw error;
  return data;
}

export async function updateSettings(payload) {
  const { error } = await supabase.from('store_settings').update(payload).eq('id', 1);
  if (error) throw error;
}


/* -------------------------------- SHIFTS --------------------------------- */

export async function getOpenShift(cashierId) {
  const { data, error } = await supabase
    .from('shifts').select('*')
    .eq('cashier_id', cashierId).eq('status', 'open')
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function openShift(cashierId, startingCash) {
  const { data, error } = await supabase
    .from('shifts')
    .insert({ cashier_id: cashierId, starting_cash: startingCash })
    .select().single();
  if (error) throw error;
  return data;
}

export async function closeShift(shiftId, endingCash, notes) {
  const { error } = await supabase.from('shifts')
    .update({ status: 'closed', ended_at: new Date().toISOString(), ending_cash: endingCash, notes })
    .eq('id', shiftId);
  if (error) throw error;
}


/* ----------------------------- TRANSACTIONS ------------------------------- */

// Checkout: memanggil RPC function `create_transaction` di database (lihat sql/schema.sql).
// Harga, HPP, & validasi stok dihitung di server, bukan dipercaya dari input client.
// `discountAmount` opsional (Rp) - diisi kalau kasir memasukkan diskon manual.
// `customerName` opsional, murni untuk dicetak di struk.
// `paymentMethod` 'cash' (default) atau 'qris'.
export async function checkout(items, paid, shiftId, discountAmount = null, customerName = null, paymentMethod = 'cash') {
  const { data, error } = await supabase.rpc('create_transaction', {
    p_items: items.map(i => ({ product_id: i.productId, qty: i.qty })),
    p_paid: paid,
    p_shift_id: shiftId || null,
    p_discount_amount: discountAmount,
    p_customer_name: customerName || null,
    p_payment_method: paymentMethod,
  });
  if (error) throw error;
  return data; // { id, code, total, change }
}

// Mengambil transaksi beserta item & nama kasirnya untuk ditampilkan di riwayat/struk.
// RLS otomatis membatasi: kasir hanya melihat miliknya sendiri, admin melihat semua.
export async function fetchTransactions({ from, to, limit = 50 } = {}) {
  let query = supabase
    .from('transactions')
    .select('*, transaction_items(*), profiles!transactions_cashier_id_fkey(full_name)')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (from) query = query.gte('created_at', from);
  if (to) query = query.lte('created_at', to);

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function fetchTransactionById(id) {
  const { data, error } = await supabase
    .from('transactions')
    .select('*, transaction_items(*), profiles!transactions_cashier_id_fkey(full_name)')
    .eq('id', id).single();
  if (error) throw error;
  return data;
}

// Menghapus SATU transaksi beserta seluruh itemnya (cascade). Dibatasi lewat
// RLS di database: hanya user dengan role admin yang bisa berhasil menghapus
// (lihat policy "transactions_delete_admin" di sql/schema.sql) -- kalau kasir
// biasa mencoba memanggil ini, Supabase akan menolak (baris tidak ditemukan/
// tidak berubah) meski tombolnya entah bagaimana bisa terpanggil dari UI.
export async function deleteTransaction(id) {
  const { error } = await supabase.from('transactions').delete().eq('id', id);
  if (error) throw error;
}


/* -------------------------------- LAPORAN --------------------------------- */

// Mengambil seluruh transaksi dalam rentang tanggal untuk diagregasi di client
// (omzet, HPP, laba, produk terlaris). Untuk skala data sangat besar, sebaiknya
// agregasi dipindah ke SQL (VIEW/RPC), tapi untuk kebutuhan toko kecil-menengah,
// agregasi di client sudah cukup cepat.
export async function fetchTransactionsForReport(fromISO, toISO) {
  const { data, error } = await supabase
    .from('transactions')
    .select('id, code, created_at, subtotal, discount_amount, total_cost, total, cashier_id, transaction_items(product_name, qty, price, cost_price)')
    .gte('created_at', fromISO)
    .lte('created_at', toISO)
    .order('created_at');
  if (error) throw error;
  return data;
}
