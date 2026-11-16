-- 0062 — Tindak lanjut Laporkan Pelanggaran + "Laporan Saya" untuk pelapor (keputusan pemilik 2026-11-16).
--
-- HRD ingin memberi kabar ke pelapor bila laporannya sudah ditindaklanjuti. Kode laporan per laporan ditolak
-- (merepotkan, pelapor bisa mengirim banyak laporan), jadi dipilih PENANDA TERSEMBUNYI:
--   - reporter_ref : HMAC-SHA256(kunci rahasia server VIOLATION_REPORTER_SECRET, id pelapor), hex. Hanya dipakai
--                    server untuk menampilkan "Laporan Saya" kepada pelapornya sendiri. TIDAK pernah dikirim ke
--                    halaman/ekspor HRD/Direksi. Bukan id/email/nama; tanpa kunci rahasia tak bisa dicocokkan.
--                    ⚠️ Anonimitas kini "tersembunyi", bukan mutlak: pemegang akses database + kunci rahasia
--                    secara teori bisa melacak pelapor (risiko diterima pemilik 2026-11-16). Kunci tak boleh diganti
--                    (laporan lama akan hilang dari Laporan Saya pelapornya).
--   - status       : received (Diterima) → in_progress (Sedang ditindaklanjuti) → done (Selesai). Diubah HRD.
--   - hrd_response : tanggapan HRD untuk pelapor (satu arah, ≤ 2000 karakter).
--   - responded_at : kapan HRD terakhir mengubah tindak lanjut (waktu HRD, BUKAN waktu kirim pelapor).
-- Tetap TANPA waktu kirim. Laporan sebelum 0062 tak punya penanda → tak tampil di Laporan Saya (diterima pemilik).
--
-- Idempoten. Terapkan ke STAGING dulu (TEKNIS.md §1). Tanpa migrasi ini laporan tetap terkirim (tanpa penanda),
-- Laporan Saya & tindak lanjut HRD menampilkan "belum aktif".

alter table outside_mapping_notes add column if not exists reporter_ref text;
alter table outside_mapping_notes add column if not exists status text not null default 'received';
alter table outside_mapping_notes add column if not exists hrd_response text;
alter table outside_mapping_notes add column if not exists responded_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'outside_mapping_notes_status') then
    alter table outside_mapping_notes add constraint outside_mapping_notes_status
      check (status in ('received', 'in_progress', 'done'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'outside_mapping_notes_response_len') then
    alter table outside_mapping_notes add constraint outside_mapping_notes_response_len
      check (hrd_response is null or char_length(btrim(hrd_response)) between 1 and 2000);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'outside_mapping_notes_reporter_ref_fmt') then
    alter table outside_mapping_notes add constraint outside_mapping_notes_reporter_ref_fmt
      check (reporter_ref is null or reporter_ref ~ '^[0-9a-f]{64}$');
  end if;
end $$;

create index if not exists outside_mapping_notes_reporter on outside_mapping_notes (reporter_ref) where reporter_ref is not null;
