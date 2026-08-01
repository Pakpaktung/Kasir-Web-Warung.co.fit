-- ============================================================================
-- KASIR TOKO - SKEMA DATABASE (Supabase / PostgreSQL)
-- ----------------------------------------------------------------------------
-- Cara pakai: buka Supabase Dashboard -> SQL Editor -> New Query -> tempel
-- seluruh isi file ini -> Run.
--
-- AMAN DIJALANKAN ULANG: file ini memakai "if not exists" / "or replace" /
-- "add column if not exists" di semua bagian, jadi kalau Anda sudah pernah
-- menjalankan versi sebelumnya dari skema ini, menjalankan ulang file yang
-- sudah diperbarui (mis. setelah update fitur HPP/diskon/logo) TIDAK akan
-- menghapus data yang ada -- hanya menambahkan kolom/fungsi yang belum ada.
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
  price numeric(12,2) not null check (price >= 0),        -- harga jual
  cost_price numeric(12,2) not null default 0 check (cost_price >= 0), -- HPP (harga pokok/modal)
  stock integer not null default 0 check (stock >= 0),
  category text not null default 'Lainnya',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_products_category on products(category);

-- Migrasi aman untuk database yang sudah pernah dibuat sebelum kolom HPP ditambahkan
alter table products add column if not exists cost_price numeric(12,2) not null default 0;


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
  logo_base64 text, -- logo struk dalam format Data URL base64 (mis. "data:image/png;base64,...."), NULL = tanpa logo
  qris_image_base64 text, -- gambar kode QRIS statis toko (Data URL base64), ditampilkan di layar pembayaran saat metode QRIS dipilih
  constraint single_row check (id = 1)
);
insert into store_settings (id) values (1) on conflict (id) do nothing;

-- Migrasi aman untuk database yang sudah pernah menjalankan versi skema sebelumnya
alter table store_settings add column if not exists logo_base64 text;
alter table store_settings add column if not exists qris_image_base64 text;


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
  trx_number bigint, -- nomor urut transaksi (urutan ke berapa sejak toko ini dibuat), diisi via sequence di RPC create_transaction
  code text not null unique, -- kode tampilan, format "TRX-000001" dibentuk dari trx_number (lihat RPC create_transaction)
  cashier_id uuid not null references profiles(id),
  shift_id uuid references shifts(id),
  customer_name text, -- nama pelanggan (opsional), ditampilkan di struk
  payment_method text not null default 'cash' check (payment_method in ('cash', 'qris')),
  subtotal numeric(12,2) not null,
  total_cost numeric(12,2) not null default 0, -- total HPP (modal) transaksi ini, untuk laporan laba
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
  price numeric(12,2) not null, -- harga JUAL saat transaksi (bukan harga produk saat ini)
  cost_price numeric(12,2) not null default 0, -- HPP saat transaksi, disalin dari products.cost_price (untuk laporan laba historis yang akurat)
  qty integer not null check (qty > 0)
);

-- Sequence untuk penomoran urut transaksi (dimulai dari 1, naik terus, tidak
-- pernah diulang -- ini adalah cara yang aman-dari-race-condition untuk memberi
-- nomor urut, jauh lebih aman daripada menghitung count(*) manual saat checkout
-- yang bisa "tabrakan" kalau 2 kasir checkout bersamaan).
create sequence if not exists transactions_trx_number_seq;

-- Migrasi aman untuk database yang sudah pernah dibuat sebelum kolom-kolom ini ditambahkan
alter table transactions add column if not exists total_cost numeric(12,2) not null default 0;
alter table transactions add column if not exists customer_name text;
alter table transactions add column if not exists payment_method text not null default 'cash';
alter table transactions add column if not exists trx_number bigint;
alter table transaction_items add column if not exists cost_price numeric(12,2) not null default 0;

-- Isi nomor urut untuk transaksi LAMA yang belum punya trx_number (diurutkan
-- berdasarkan waktu transaksi dibuat), lalu majukan sequence supaya transaksi
-- BARU melanjutkan dari nomor terakhir tanpa tabrakan.
do $$
begin
  update transactions t
    set trx_number = sub.rn
    from (
      select id, row_number() over (order by created_at, id) as rn
      from transactions
      where trx_number is null
    ) sub
    where t.id = sub.id;

  perform setval('transactions_trx_number_seq', coalesce((select max(trx_number) from transactions), 0));
end $$;

do $$
begin
  alter table transactions add constraint transactions_trx_number_key unique (trx_number);
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table transactions add constraint transactions_payment_method_check check (payment_method in ('cash', 'qris'));
exception when duplicate_object then null;
end $$;

create index if not exists idx_transactions_created_at on transactions(created_at desc);
create index if not exists idx_transactions_cashier on transactions(cashier_id);
create index if not exists idx_transaction_items_trx on transaction_items(transaction_id);


-- ============================================================================
-- 6. RPC FUNCTION: create_transaction
-- ----------------------------------------------------------------------------
-- Checkout dilakukan lewat function ini (bukan INSERT langsung dari client) agar:
--   a) Harga & HPP produk dihitung ulang di server (klien tidak bisa memanipulasi harga)
--   b) Pengurangan stok & pembuatan transaksi terjadi dalam SATU transaksi DB
--      (atomik) sehingga tidak ada kondisi stok "kebobolan" saat race condition
--   c) RLS bisa menutup akses insert langsung ke tabel transactions/products
--      dari client, seluruh proses checkout wajib lewat function ini
--
-- Diskon: secara default memakai discount_percent dari store_settings (perilaku
-- lama). Jika kasir memasukkan diskon manual di layar pembayaran (nominal Rp
-- atau %), kirim `p_discount_amount` (nilai Rp final hasil hitungan di client)
-- untuk MENIMPA diskon default tersebut. Server tetap membatasi nilainya agar
-- tidak melebihi subtotal ataupun negatif, sehingga tidak bisa dimanipulasi
-- jadi diskon > 100% dari DevTools.
--
-- `p_customer_name` opsional, murni untuk dicetak di struk (tidak divalidasi
-- ketat). `p_payment_method` adalah 'cash' atau 'qris' -- ini juga hanya untuk
-- pencatatan, aplikasi TIDAK melakukan verifikasi otomatis ke penyedia QRIS
-- manapun (lihat catatan di README bagian pembayaran QRIS).
-- ============================================================================
create or replace function create_transaction(
  p_items jsonb,              -- format: [{"product_id": "...", "qty": 2}, ...]
  p_paid numeric,
  p_shift_id uuid default null,
  p_discount_amount numeric default null,  -- diskon manual (Rp), opsional; null = pakai discount_percent dari store_settings
  p_customer_name text default null,
  p_payment_method text default 'cash'
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
  v_total_cost numeric(12,2) := 0;
  v_discount_percent numeric(5,2);
  v_discount_amount numeric(12,2);
  v_tax_amount numeric(12,2);
  v_total numeric(12,2);
  v_trx_id uuid := gen_random_uuid();
  v_trx_number bigint;  -- diisi belakangan, SETELAH semua validasi lolos (lihat catatan di bawah)
  v_trx_code text;
begin
  if v_cashier_id is null then
    raise exception 'Unauthorized: harus login untuk membuat transaksi';
  end if;

  if p_payment_method not in ('cash', 'qris') then
    raise exception 'Metode pembayaran tidak dikenal: %', p_payment_method;
  end if;

  select * into v_settings from store_settings where id = 1;

  -- Validasi & hitung subtotal + total HPP berdasarkan HARGA/HPP/STOK DI DATABASE (bukan dari client)
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
    v_total_cost := v_total_cost + (coalesce(v_product.cost_price, 0) * (v_item->>'qty')::int);
  end loop;

  -- Diskon: pakai nilai manual dari client jika dikirim, kalau tidak pakai default dari pengaturan toko.
  -- Nilainya tetap DIBATASI (clamp) ke rentang [0, subtotal] di sini, di server -- bukan dipercaya mentah dari client.
  if p_discount_amount is not null then
    v_discount_amount := least(greatest(p_discount_amount, 0), v_subtotal);
    v_discount_percent := case when v_subtotal > 0 then round((v_discount_amount / v_subtotal) * 100, 2) else 0 end;
  else
    v_discount_percent := v_settings.discount_percent;
    v_discount_amount := round(v_subtotal * (v_settings.discount_percent / 100), 2);
  end if;

  v_tax_amount := round((v_subtotal - v_discount_amount) * (v_settings.tax_percent / 100), 2);
  v_total := v_subtotal - v_discount_amount + v_tax_amount;

  if p_paid < v_total then
    raise exception 'Nominal bayar (%) kurang dari total (%)', p_paid, v_total;
  end if;

  -- Ambil nomor urut di sini, SETELAH semua validasi di atas lolos (bukan di
  -- bagian "declare" di awal function). Sequence Postgres tidak ikut rollback
  -- kalau transaksi gagal/dibatalkan -- kalau nextval() dipanggil terlalu awal,
  -- percobaan checkout yang gagal (mis. stok kurang) tetap "membakar" satu
  -- nomor urut dan membuat nomor jadi bolong (mis. TRX-000001 lompat ke
  -- TRX-000003). Dengan memanggilnya di sini, nomor urut hanya naik untuk
  -- transaksi yang benar-benar berhasil tersimpan.
  v_trx_number := nextval('transactions_trx_number_seq');
  v_trx_code := 'TRX-' || lpad(v_trx_number::text, 6, '0');

  insert into transactions (
    id, trx_number, code, cashier_id, shift_id, customer_name, payment_method, subtotal, total_cost, discount_percent, discount_amount,
    tax_percent, tax_amount, total, paid, change
  ) values (
    v_trx_id, v_trx_number, v_trx_code, v_cashier_id, p_shift_id, nullif(trim(p_customer_name), ''), p_payment_method, v_subtotal, v_total_cost, v_discount_percent,
    v_discount_amount, v_settings.tax_percent, v_tax_amount, v_total, p_paid, p_paid - v_total
  );

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    select * into v_product from products where id = (v_item->>'product_id')::uuid;

    insert into transaction_items (transaction_id, product_id, product_name, price, cost_price, qty)
    values (v_trx_id, v_product.id, v_product.name, v_product.price, coalesce(v_product.cost_price, 0), (v_item->>'qty')::int);

    update products set stock = stock - (v_item->>'qty')::int, updated_at = now()
      where id = v_product.id;
  end loop;

  return jsonb_build_object('id', v_trx_id, 'code', v_trx_code, 'trx_number', v_trx_number, 'total', v_total, 'change', p_paid - v_total);
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
drop policy if exists "profiles_select_authenticated" on profiles;
create policy "profiles_select_authenticated" on profiles for select to authenticated using (true);
-- hanya admin yang boleh mengubah role/status user lain
drop policy if exists "profiles_update_admin" on profiles;
create policy "profiles_update_admin" on profiles for update to authenticated using (is_admin());

-- PRODUCTS: semua user login boleh melihat; hanya admin boleh ubah data produk
-- (pengurangan stok saat checkout terjadi lewat function create_transaction di atas, bukan lewat policy ini)
drop policy if exists "products_select_authenticated" on products;
create policy "products_select_authenticated" on products for select to authenticated using (true);
drop policy if exists "products_insert_admin" on products;
create policy "products_insert_admin" on products for insert to authenticated with check (is_admin());
drop policy if exists "products_update_admin" on products;
create policy "products_update_admin" on products for update to authenticated using (is_admin());
drop policy if exists "products_delete_admin" on products;
create policy "products_delete_admin" on products for delete to authenticated using (is_admin());

-- STORE SETTINGS: semua user login boleh membaca; hanya admin boleh mengubah
drop policy if exists "settings_select_authenticated" on store_settings;
create policy "settings_select_authenticated" on store_settings for select to authenticated using (true);
drop policy if exists "settings_update_admin" on store_settings;
create policy "settings_update_admin" on store_settings for update to authenticated using (is_admin());

-- SHIFTS: kasir hanya boleh lihat & buka/tutup shift miliknya sendiri; admin boleh lihat semua
drop policy if exists "shifts_select_own_or_admin" on shifts;
create policy "shifts_select_own_or_admin" on shifts for select to authenticated using (cashier_id = auth.uid() or is_admin());
drop policy if exists "shifts_insert_own" on shifts;
create policy "shifts_insert_own" on shifts for insert to authenticated with check (cashier_id = auth.uid());
drop policy if exists "shifts_update_own_or_admin" on shifts;
create policy "shifts_update_own_or_admin" on shifts for update to authenticated using (cashier_id = auth.uid() or is_admin());

-- TRANSACTIONS & ITEMS: hanya bisa DIBACA (insert wajib lewat RPC create_transaction di atas)
-- kasir hanya melihat transaksinya sendiri; admin melihat semua (untuk laporan)
drop policy if exists "transactions_select_own_or_admin" on transactions;
create policy "transactions_select_own_or_admin" on transactions for select to authenticated using (cashier_id = auth.uid() or is_admin());
drop policy if exists "transaction_items_select_via_trx" on transaction_items;
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

-- HAPUS RIWAYAT TRANSAKSI: khusus admin. transaction_items ikut terhapus otomatis
-- lewat "on delete cascade" di foreign key-nya saat baris transactions dihapus.
-- Policy delete pada transaction_items tetap dibuat eksplisit sebagai lapisan
-- pengaman tambahan (berjaga-jaga terhadap perubahan perilaku RLS pada cascade).
drop policy if exists "transactions_delete_admin" on transactions;
create policy "transactions_delete_admin" on transactions for delete to authenticated using (is_admin());
drop policy if exists "transaction_items_delete_admin" on transaction_items;
create policy "transaction_items_delete_admin" on transaction_items for delete to authenticated using (is_admin());


-- ============================================================================
-- 8. REALTIME (opsional tapi direkomendasikan)
-- ----------------------------------------------------------------------------
-- Aktifkan Realtime supaya perubahan stok/produk di satu perangkat langsung
-- terlihat di perangkat lain tanpa refresh manual.
-- Bisa juga diaktifkan lewat Dashboard -> Database -> Replication -> pilih tabel.
-- Dibungkus blok DO + exception agar tidak error kalau tabel sudah pernah
-- ditambahkan sebelumnya (ALTER PUBLICATION tidak mendukung "if not exists"
-- di semua versi Postgres).
-- ============================================================================
do $$
begin
  alter publication supabase_realtime add table products;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table transactions;
exception when duplicate_object then null;
end $$;


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
