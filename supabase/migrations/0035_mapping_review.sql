-- ============================================================================
-- 0035 — FASE TINJAU PEMETAAN oleh pegawai (sebelum form 360° dibuka)
--
-- Latar: sesudah periode diaktifkan, HRD menyusun pemetaan (siapa menilai siapa).
-- Sebelumnya pegawai TIDAK bisa melihat apa pun sampai form dibuka, sehingga
-- pemetaan yang keliru baru ketahuan setelah pengisian berjalan.
--
-- Perubahan:
--  1) periods.mapping_published — saklar "Umumkan Pemetaan ke Pegawai".
--     SENGAJA terpisah dari `form_open` karena `form_open=false` dipakai DUA fase:
--     (a) sebelum form dibuka, dan (b) pembekuan di akhir siklus saat hasil
--     difinalisasi. Tanpa kolom ini, tombol pengajuan pegawai akan ikut muncul
--     pada fase (b) — saat pemetaan justru tak boleh diubah lagi.
--
--  2) relation_correction_requests diperluas jadi kotak masuk SATU PINTU untuk
--     tiga jenis permohonan pemetaan (kolom & RLS-nya sudah pas: pengaju wajib
--     assessor_id = auth.uid(), HRD yang meninjau):
--        kind='relation' → koreksi garis hubungan (perilaku lama, jadi DEFAULT
--                          agar baris lama tetap sah)
--        kind='remove'   → minta pemetaan dihapus (tidak relevan bagi pengaju)
--        kind='add'      → minta menilai rekan lain; relasi yang diminta
--                          disimpan di new_relation
--  3) reject_reason — alasan HRD menolak, supaya penolakan tak terasa sepihak.
--     (Alasan PENGAJU sudah ada di kolom `reason`, NOT NULL sejak 0001.)
--
-- Aditif & aman: semua kolom baru punya default / nullable, tak ada data lama
-- yang berubah arti. Tanpa perubahan RLS.
-- ============================================================================

alter table periods
  add column if not exists mapping_published boolean not null default false;

comment on column periods.mapping_published is
  'Pemetaan 360° sudah diumumkan ke pegawai untuk ditinjau (boleh mengajukan hapus/tambah), meski form penilaian belum dibuka.';

alter table relation_correction_requests
  add column if not exists kind text not null default 'relation',
  add column if not exists reject_reason text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'rcr_kind_check'
  ) then
    alter table relation_correction_requests
      add constraint rcr_kind_check check (kind in ('relation', 'remove', 'add'));
  end if;
end $$;

comment on column relation_correction_requests.kind is
  'Jenis permohonan: relation (ubah garis hubungan) | remove (hapus pemetaan) | add (minta menilai rekan lain, relasi diminta di new_relation).';
comment on column relation_correction_requests.reject_reason is
  'Alasan HRD menolak permohonan. Wajib diisi saat menolak (ditegakkan di server action).';

-- Kotak masuk HRD & daftar "permohonan saya" selalu difilter per pengaju + status.
create index if not exists rcr_assessor_status_idx
  on relation_correction_requests (assessor_id, period_id, status);
