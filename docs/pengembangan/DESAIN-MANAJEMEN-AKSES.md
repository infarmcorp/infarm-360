# DESAIN — Manajemen Akses (catatan keputusan)

> File ini dipertahankan karena dirujuk komentar migrasi `0032_page_grants_can_finalize.sql` dan
> `0033_retire_cross_reviewer_to_grant.sql` ("§10.5"). Model akses yang **berlaku** dan pola penegakannya ada di
> [TEKNIS.md](../TEKNIS.md) §5; aturan tetap di [CLAUDE.md](../../CLAUDE.md); riwayat lengkap di
> [CHANGELOG.md](../CHANGELOG.md) (Juli 2026). Spesifikasi awal (§1–§9, §10.1–§10.4, diagram lama) ada di
> riwayat git.

## Ringkasan keputusan sebelum §10.5
- **Augment, bukan replace** (2026-07-17): akses bawaan peran tetap; konsol hanya menambah atau mencabut.
- **Audit Akses = status + riwayat** (2026-07-17).
- **Katalog halaman tetap**, variasi lewat lingkup/parameter — sejalan keputusan "tidak ada page-builder".
- **Keamanan nyata untuk data sensitif**: lingkup ditegakkan di RLS/`service_role`, bukan sembunyi menu;
  grant tidak menyalakan `is_hrd()`.
- **2026-07-21/22:** "Supervisor" = "SPV"; Koordinator target sah dengan lingkup **per daftar tim**
  (`coordinator_team`); lingkup **multi-pilih**; izin edit ke peran luas boleh dengan konfirmasi; grant per
  peran = materialisasi ke anggota saat ini (pegawai baru tidak otomatis; kartu "Pegawai Baru").
- **2026-07-24 (§10):** satu alur **penerima-dulu** menggantikan dua pintu (grant halaman vs kapabilitas peran);
  Peninjau Lintas Divisi = kombinasi grant Review + "selain divisinya". Nuansa: izin biner (lihat vs edit)
  memberi Peninjau lebih (termasuk finalisasi) → diputuskan lewat §10.5.

---

## 10.5 Keputusan B (2026-07-24) — level izin ke-3 "Boleh meringkas"

Pilihan pengguna: **pertahankan peran "meringkas saja, tanpa finalisasi"** (seperti Peninjau lama). Izin grant
halaman diperluas dari **biner** → **3 tingkat**, baru setelah itu `is_cross_reviewer` + `/peninjau` dipensiunkan.

| Tingkat | Boleh | Contoh peran |
|---|---|---|
| 1 · **Lihat** | baca daftar + detail (berlingkup) | penonton read-only |
| 2 · **Meringkas** | + tulis Ringkasan Aspek / Ringkasan Kualitatif; **tidak** finalisasi/rilis/kembalikan-draf | Peninjau Lintas Divisi |
| 3 · **Finalisasi** | + finalisasi, rilis ke SPV, kembalikan ke draf | wakil HRD berlingkup |

Halaman jenis `pemantauan` tetap Lihat saja.

**Model data (additif):** `page_grants.can_finalize boolean default false` di samping `can_edit`.
Lihat = `(edit false)` · Meringkas = `(edit true, finalize false)` · Finalisasi = `(edit true, finalize true)`.
**Backfill:** `can_finalize = can_edit` untuk baris lama, agar grant edit yang sudah ada tidak kehilangan
kemampuan finalisasi. Alternatif yang **ditolak**: mengubah `can_edit` menjadi enum 3 nilai (menyentuh semua
pengecekan `can_edit`, migrasi lebih berisiko).

**Titik penegakan (`admin/laporan/actions.ts`):** `resolveReportWriteActor` cek `can_edit` + lingkup + tulis via
`service_role`, dan mengembalikan `canFinalize`.
- `saveAspectSummaries` / `saveQualSummaries` → butuh ≥ Meringkas.
- `saveOrFinalizeReport(finalize=true)`, `releaseToSpv`, kembalikan ke draf → butuh Finalisasi.

**UI:** 3 radio (Lihat / Meringkas / Finalisasi) hanya untuk halaman administrator; peringatan saat memberi
Finalisasi ke banyak orang lewat peran.

**Pensiun Peninjau (migrasi 0033):** tiap `is_cross_reviewer=true` → `page_grants` (review, `other_divisions`,
`can_edit=true`, `can_finalize=false`), flag diset false; route `/peninjau` + toggle + `canCrossReview`/
`setCrossReviewer`/`loadCrossDivisionReport` dicabut. Kolom `is_cross_reviewer` dibiarkan vestigial. Invarian
"finalisasi tetap HRD" berubah menjadi "finalisasi = HRD **atau** grant Finalisasi berlingkup".

**Status:** ✅ selesai 2026-07-24 (F1 migrasi 0032 · F2 penegakan server + UI · F3 migrasi 0033 + pensiun route).
Alur penerima-dulu terbangun di `app/(app)/admin/akses/akses-client.tsx` (diagram di [PANDUAN.md](../PANDUAN.md) §5.2).
