-- 0053 — Jadwal Email Rilis Laporan (release_email_schedules).
--
-- HRD (Review & Finalisasi → ③ Kabari Pegawai) bisa MENJADWALKAN email rilis laporan: pada jam yang diatur,
-- email "laporan Anda sudah bisa diunduh" terkirim sendiri. Keputusan pemilik (2026-10-16):
--   - PENERIMA DIKUNCI saat menjadwalkan (recipient_ids) — pegawai yang sengaja ditahan tak ikut terkirim.
--     Saat jam tiba, syarat dicek ULANG (laporan masih Final + Folder Laporan terisi + punya email); yang
--     tak lagi memenuhi / sudah pernah dikirimi dilewati beserta alasannya.
--   - ISI DIKUNCI bersama jadwal (content) — HRD bisa melihat/mengubah/membatalkan selama belum terkirim.
--   - Pemicu: GitHub Actions memanggil /api/cron/release-email tiap ±10 menit (dikunci CRON_SECRET).
-- Pengiriman bertahap (beberapa pegawai per panggilan); hasil terkumpul di sent_ids/skipped/failed dan juga
-- dicatat ke Log Aktivitas (aksi yang sama dengan kirim manual) → tak ada pegawai yang dikirimi dua kali.
--
-- Baca: HRD (is_hrd). Tulis: hanya server (service_role) lewat Server Action / route cron — tanpa policy
-- insert/update/delete untuk anon/authenticated. Aplikasi tetap jalan tanpa migrasi ini (fitur jadwal
-- menampilkan "belum aktif"; kirim manual tak terpengaruh).
--
-- Idempoten. Terapkan ke STAGING dulu (TEKNIS.md §1).

create table if not exists release_email_schedules (
  id              uuid primary key default gen_random_uuid(),
  period_id       uuid not null references periods(id) on delete cascade,
  send_at         timestamptz not null,
  content         jsonb not null,
  recipient_ids   uuid[] not null,
  status          text not null default 'scheduled'
                  check (status in ('scheduled', 'sending', 'done', 'cancelled')),
  created_by      uuid references employees(id) on delete set null,
  created_by_name text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  started_at      timestamptz,
  finished_at     timestamptz,
  sent_ids        uuid[] not null default '{}',
  skipped         jsonb not null default '[]'::jsonb,   -- [{id, name, reason}]
  failed          jsonb not null default '[]'::jsonb,   -- [{id, name, reason}]
  constraint release_email_schedules_recipients_nonempty check (cardinality(recipient_ids) > 0)
);

create index if not exists release_email_schedules_due
  on release_email_schedules (status, send_at);
create index if not exists release_email_schedules_period
  on release_email_schedules (period_id, created_at desc);
-- Satu jadwal AKTIF (menunggu/sedang dikirim) per periode — ubah/batalkan dulu sebelum membuat yang baru.
create unique index if not exists release_email_schedules_one_active
  on release_email_schedules (period_id) where status in ('scheduled', 'sending');

alter table release_email_schedules enable row level security;
drop policy if exists res_read on release_email_schedules;
create policy res_read on release_email_schedules for select using (is_hrd());
