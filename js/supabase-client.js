// ============================================================================
// KONFIGURASI SUPABASE
// ----------------------------------------------------------------------------
// Ganti dua nilai di bawah ini dengan milik project Supabase Anda sendiri.
// Lokasi: Supabase Dashboard -> Project Settings -> API
//   - Project URL      -> SUPABASE_URL
//   - anon / public key -> SUPABASE_ANON_KEY  (BUKAN service_role key!)
//
// "anon key" AMAN ditaruh di kode frontend (memang didesain untuk itu),
// karena akses data tetap dibatasi oleh Row Level Security (RLS) di database.
// JANGAN PERNAH menaruh "service_role key" di kode frontend/browser.
// ============================================================================

export const SUPABASE_URL = 'https://tnarvzfkclrbvjyiyviq.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_DYfq0rehXQ-z66pEaU7deQ_gda2gYBQ';

// Supabase JS SDK dimuat via CDN esm.sh (tanpa perlu npm/bundler)
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,   // sesi login tetap tersimpan walau tab ditutup & dibuka lagi
    autoRefreshToken: true, // token diperbarui otomatis sebelum kedaluwarsa
  },
});
