-- 0060 — Pengaturan AI "Ringkas otomatis" (ai_settings). EKSPERIMEN, dipakai hanya di dev/staging.
--
-- Satu baris (id = 1) berisi pengaturan yang BERLAKU UNTUK SEMUA ringkasan otomatis — agar hasil antarpegawai
-- seragam (keputusan pemilik 2026-11-12: diatur di halaman terpisah "Pengaturan AI", bukan per laporan):
--   model (id dari daftar model Google, divalidasi server saat simpan) · harga per 1 juta token (perkiraan biaya) · kurs ·
--   prompt aspek & prompt kualitatif · version (naik tiap prompt/model berubah; dicatat di tiap hasil & audit).
-- Kunci API TIDAK disimpan di sini (tetap env server GEMINI_API_KEY).
--
-- Akses: hanya server (service_role) — RLS aktif TANPA policy, jadi anon/authenticated tak bisa membaca
-- maupun menulis. Aplikasi tetap jalan tanpa migrasi ini, tetapi model belum bisa dipilih sehingga
-- Ringkas otomatis menolak (halaman Pengaturan AI menampilkan peringatan).
--
-- Idempoten. Terapkan ke STAGING dulu (TEKNIS.md §1). Production cukup saat fitur dirilis.

create table if not exists ai_settings (
  id               smallint primary key default 1 check (id = 1),
  model            text not null,
  price_input_usd  numeric(10,4) not null check (price_input_usd >= 0),
  price_output_usd numeric(10,4) not null check (price_output_usd >= 0),
  usd_idr          numeric(10,2) not null check (usd_idr > 0),
  aspect_prompt    text not null check (char_length(aspect_prompt) between 1 and 8000),
  qual_prompt      text not null check (char_length(qual_prompt) between 1 and 8000),
  version          integer not null default 1 check (version >= 1),
  updated_by       uuid references employees(id) on delete set null,
  updated_by_name  text,
  updated_at       timestamptz not null default now()
);

alter table ai_settings enable row level security;
-- Sengaja tanpa policy: hanya service_role.
