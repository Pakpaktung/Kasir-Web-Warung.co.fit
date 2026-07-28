-- ============================================================================
-- KASIR TOKO - SKEMA DATABASE (Supabase / PostgreSQL)
-- ----------------------------------------------------------------------------
-- Cara pakai: buka Supabase Dashboard -> SQL Editor -> New Query -> tempel
-- seluruh isi file ini -> Run. Jalankan sekali saja pada project baru.
-- ============================================================================

-- Ekstensi untuk generate UUID (biasanya sudah aktif di Supabase, aman dijalankan ulang)
create extension if not exists "pgcrypto";


-- ============================================================================
-- 1. PROFILES  (data tambahan untuk setiap user auth: nama & role)
-- ============================================================================
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role text not null default 'kasir' check (role in ('admin', 'kasir')),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Trigger: otomatis membuat baris profile setiap kali ada user baru mendaftar.
-- full_name & role diambil dari `raw_user_meta_data` yang dikirim saat signUp().
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    coalesce(new.raw_user_meta_data->>'role', 'kasir')
  );
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();


-- ============================================================================
-- 2. PRODUCTS
-- ============================================================================
create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  price numeric(12,2) not null check (price >= 0),
  stock integer not null default 0 check (stock >= 0),
  category text not null default 'Lainnya',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_products_category on products(category);


-- ============================================================================
-- 3. STORE SETTINGS (satu baris tunggal untuk pengaturan toko)
-- ============================================================================
create table if not exists store_settings (
  id int primary key default 1,
  store_name text not null default 'Toko Saya',
  address text,
  phone text,
  footer_note text default 'Terima kasih telah berbelanja!',
  tax_percent numeric(5,2) not null default 0,
  discount_percent numeric(5,2) not null default 0,
  receipt_width text not null default '80mm' check (receipt_width in ('58mm','80mm')),
  constraint single_row check (id = 1)
);
insert into store_settings (id) values (1) on conflict (id) do nothing;


-- ============================================================================
-- 4. SHIFTS (jam kerja kasir: modal awal, saldo akhir)
-- ============================================================================
create table if not exists shifts (
  id uuid primary key default gen_random_uuid(),
  cashier_id uuid not null references profiles(id),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  starting_cash numeric(12,2) not null default 0,
  ending_cash numeric(12,2),
  status text not null default 'open' check (status in ('open','closed')),
  notes text
);

create index if not exists idx_shifts_cashier on shifts(cashier_id);


-- ============================================================================
-- 5. TRANSACTIONS & TRANSACTION_ITEMS
-- ============================================================================
create table if not exists transactions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  cashier_id uuid not null references profiles(id),
  shift_id uuid references shifts(id),
  subtotal numeric(12,2) not null,
  discount_percent numeric(5,2) not null default 0,
  discount_amount numeric(12,2) not null default 0,
  tax_percent numeric(5,2) not null default 0,
  tax_amount numeric(12,2) not null default 0,
  total numeric(12,2) not null,
  paid numeric(12,2) not null,
  change numeric(12,2) not null,
  created_at timestamptz not null default now()
);

create table if not exists transaction_items (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references transactions(id) on delete cascade,
  product_id uuid references products(id) on delete set null,
  product_name text not null,   -- disalin saat transaksi, agar riwayat tetap benar walau produk diedit/dihapus
  price numeric(12,2) not null, -- harga saat transaksi (bukan harga produk saat ini)
  qty integer not null check (qty > 0)
);

create index if not exists idx_transactions_created_at on transactions(created_at desc);
create index if not exists idx_transactions_cashier on transactions(cashier_id);
create index if not exists idx_transaction_items_trx on transaction_items(transaction_id);


-- ============================================================================
-- 6. RPC FUNCTION: create_transaction
-- ----------------------------------------------------------------------------
-- Checkout dilakukan lewat function ini (bukan INSERT langsung dari client) agar:
--   a) Harga produk dihitung ulang di server (klien tidak bisa memanipulasi harga)
--   b) Pengurangan stok & pembuatan transaksi terjadi dalam SATU transaksi DB
--      (atomik) sehingga tidak ada kondisi stok "kebobolan" saat race condition
--   c) RLS bisa menutup akses insert langsung ke tabel transactions/products
--      dari client, seluruh proses checkout wajib lewat function ini
-- ============================================================================
create or replace function create_transaction(
  p_items jsonb,              -- format: [{"product_id": "...", "qty": 2}, ...]
  p_paid numeric,
  p_shift_id uuid default null
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_cashier_id uuid := auth.uid();
  v_settings store_settings%rowtype;
  v_item jsonb;
  v_product products%rowtype;
  v_subtotal numeric(12,2) := 0;
  v_discount_amount numeric(12,2);
  v_tax_amount numeric(12,2);
  v_total numeric(12,2);
  v_trx_id uuid := gen_random_uuid();
  v_trx_code text := 'TRX-' || to_char(now(), 'YYMMDDHH24MISS');
begin
  if v_cashier_id is null then
    raise exception 'Unauthorized: harus login untuk membuat transaksi';
  end if;

  select * into v_settings from store_settings where id = 1;

  -- Validasi & hitung subtotal berdasarkan HARGA & STOK DI DATABASE (bukan dari client)
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    select * into v_product from products where id = (v_item->>'product_id')::uuid for update;

    if v_product.id is null then
      raise exception 'Produk tidak ditemukan: %', (v_item->>'product_id');
    end if;
    if v_product.stock < (v_item->>'qty')::int then
      raise exception 'Stok tidak cukup untuk produk: %', v_product.name;
    end if;

    v_subtotal := v_subtotal + (v_product.price * (v_item->>'qty')::int);
  end loop;

  v_discount_amount := round(v_subtotal * (v_settings.discount_percent / 100), 2);
  v_tax_amount := round((v_subtotal - v_discount_amount) * (v_settings.tax_percent / 100), 2);
  v_total := v_subtotal - v_discount_amount + v_tax_amount;

  if p_paid < v_total then
    raise exception 'Nominal bayar (%) kurang dari total (%)', p_paid, v_total;
  end if;

  insert into transactions (
    id, code, cashier_id, shift_id, subtotal, discount_percent, discount_amount,
    tax_percent, tax_amount, total, paid, change
  ) values (
    v_trx_id, v_trx_code, v_cashier_id, p_shift_id, v_subtotal, v_settings.discount_percent,
    v_discount_amount, v_settings.tax_percent, v_tax_amount, v_total, p_paid, p_paid - v_total
  );

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    select * into v_product from products where id = (v_item->>'product_id')::uuid;

    insert into transaction_items (transaction_id, product_id, product_name, price, qty)
    values (v_trx_id, v_product.id, v_product.name, v_product.price, (v_item->>'qty')::int);

    update products set stock = stock - (v_item->>'qty')::int, updated_at = now()
      where id = v_product.id;
  end loop;

  return jsonb_build_object('id', v_trx_id, 'code', v_trx_code, 'total', v_total, 'change', p_paid - v_total);
end;
$$;


-- ============================================================================
-- 7. ROW LEVEL SECURITY (RLS)
-- ============================================================================
alter table profiles enable row level security;
alter table products enable row level security;
alter table store_settings enable row level security;
alter table shifts enable row level security;
alter table transactions enable row level security;
alter table transaction_items enable row level security;

-- Helper: cek apakah user yang sedang login adalah admin
create or replace function is_admin()
returns boolean language sql stable as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin');
$$;

-- PROFILES: semua user login boleh membaca daftar profil (untuk menampilkan nama kasir di struk/laporan)
create policy "profiles_select_authenticated" on profiles for select to authenticated using (true);
-- hanya admin yang boleh mengubah role/status user lain
create policy "profiles_update_admin" on profiles for update to authenticated using (is_admin());

-- PRODUCTS: semua user login boleh melihat; hanya admin boleh ubah data produk
-- (pengurangan stok saat checkout terjadi lewat function create_transaction di atas, bukan lewat policy ini)
create policy "products_select_authenticated" on products for select to authenticated using (true);
create policy "products_insert_admin" on products for insert to authenticated with check (is_admin());
create policy "products_update_admin" on products for update to authenticated using (is_admin());
create policy "products_delete_admin" on products for delete to authenticated using (is_admin());

-- STORE SETTINGS: semua user login boleh membaca; hanya admin boleh mengubah
create policy "settings_select_authenticated" on store_settings for select to authenticated using (true);
create policy "settings_update_admin" on store_settings for update to authenticated using (is_admin());

-- SHIFTS: kasir hanya boleh lihat & buka/tutup shift miliknya sendiri; admin boleh lihat semua
create policy "shifts_select_own_or_admin" on shifts for select to authenticated using (cashier_id = auth.uid() or is_admin());
create policy "shifts_insert_own" on shifts for insert to authenticated with check (cashier_id = auth.uid());
create policy "shifts_update_own_or_admin" on shifts for update to authenticated using (cashier_id = auth.uid() or is_admin());

-- TRANSACTIONS & ITEMS: hanya bisa DIBACA (insert wajib lewat RPC create_transaction di atas)
-- kasir hanya melihat transaksinya sendiri; admin melihat semua (untuk laporan)
create policy "transactions_select_own_or_admin" on transactions for select to authenticated using (cashier_id = auth.uid() or is_admin());
create policy "transaction_items_select_via_trx" on transaction_items for select to authenticated using (
  exists (
    select 1 from transactions t
    where t.id = transaction_items.transaction_id
      and (t.cashier_id = auth.uid() or is_admin())
  )
);
-- Catatan: TIDAK ada policy INSERT untuk transactions/transaction_items secara langsung.
-- Function create_transaction() memakai `security definer` sehingga tetap bisa insert
-- meski client tidak diberi izin insert langsung -- ini mencegah client memalsukan transaksi.


-- ============================================================================
-- 8. REALTIME (opsional tapi direkomendasikan)
-- ----------------------------------------------------------------------------
-- Aktifkan Realtime supaya perubahan stok/produk di satu perangkat langsung
-- terlihat di perangkat lain tanpa refresh manual.
-- Bisa juga diaktifkan lewat Dashboard -> Database -> Replication -> pilih tabel.
-- ============================================================================
alter publication supabase_realtime add table products;
alter publication supabase_realtime add table transactions;


-- ============================================================================
-- 9. AKUN ADMIN PERTAMA
-- ----------------------------------------------------------------------------
-- Setelah menjalankan script ini, buat user pertama lewat:
--   Supabase Dashboard -> Authentication -> Add User (isi email & password),
--   atau lewat halaman Register di aplikasi (lihat README).
-- Lalu jadikan admin dengan menjalankan query berikut (ganti email-nya):
--
--   update profiles set role = 'admin' where id = (
--     select id from auth.users where email = 'admin@tokosaya.com'
--   );
-- ============================================================================
