# CLAUDE.md — Infarm 360° Performance Appraisal System

Pegangan Claude Code di repo ini: aturan tetap, invariant, pola kerja, perintah. Status, riwayat, dan
langkah operasional **tidak** ada di sini — lihat peta dokumen.

## 1. Apa ini
Aplikasi web **penilaian kinerja 360° internal** Infarm (KPI bulanan + umpan balik 360° → Skor Akhir →
klasifikasi talenta → laporan bertahap). **Bukan e-commerce** — tak ada pembayaran, keranjang, stok, pengiriman.

Peran (`employees.role`, logika di `lib/auth/roles.ts`):
- **Employee** — mengisi 360°, melihat laporan sendiri saat Final.
- **SPV** — input KPI tim + diri, ACC laporan tim, monitor tim.
- **HRD Admin** — **izin** (`is_hrd_admin`), bukan posisi. Cek via `canAdmin()`/`canSection()` atau RLS
  `is_hrd()` (= `role='hrd' OR is_hrd_admin`), **jangan** `role === 'hrd'` mentah. Mode ganda: cookie
  `hrd_mode` = `admin` | `spv` (base); **default login = base**.
- **Direksi** — Dashboard Organisasi, ACC suksesi, ACC laporan **SPV saja** (laporan non-SPV ditolak),
  Tinjauan Hasil Akhir (read-only).
- Tambahan sebagai **izin**, bukan peran baru: **Koordinator** (`is_coordinator` + `coordinator_team_members`)
  dan **grant halaman berlingkup** (`page_grants`).

Acuan fungsional: `PANDUAN Infarm 360 Portal.pdf` dan [docs/PANDUAN.md](docs/PANDUAN.md).

## 2. Peta dokumen
| File | Isi |
|---|---|
| [docs/RENCANA.md](docs/RENCANA.md) | status terkini, pekerjaan terbuka (🔑 = butuh pengguna), ide opsional, catatan operasional |
| [docs/CHANGELOG.md](docs/CHANGELOG.md) | riwayat & alasan keputusan, fitur yang dicabut |
| [docs/TEKNIS.md](docs/TEKNIS.md) | alur branch/staging/migrasi, env var, aktivasi (email, Lupa Sandi, Mode Maintenance, cron), rumus & tabel klasifikasi, model akses, daftar migrasi, pengujian, backup, PDF |
| [docs/PANDUAN.md](docs/PANDUAN.md) | panduan pengguna per peran + tombol + SOP HRD (bahasa awam) |
| `docs/pengembangan/DESAIN-MANAJEMEN-AKSES.md` | catatan keputusan izin 3 tingkat (dirujuk migrasi 0032/0033) |
| `docs/panduan/REVISI-PANDUAN-PDF.md` | sementara — teks revisi 4 PDF; hapus setelah PDF direvisi |
| [docs/UJI-RILIS-Q3.md](docs/UJI-RILIS-Q3.md) | sementara — daftar uji manual rilis Q3 (gelombang 1, 2, 2b); hapus setelah rilis |

Selalu perbarui RENCANA/CHANGELOG saat status fitur bergeser, dan file ini hanya bila aturan berubah.
PANDUAN/RENCANA/CHANGELOG ditulis **bahasa Indonesia awam** (tanpa RLS, nama fungsi, path, nomor migrasi).

## 3. Stack & struktur
- Next.js 16 App Router (Turbopack, React 19, TS strict), Tailwind v4, Supabase (Postgres + Auth `@supabase/ssr`
  + RLS), Zod, `xlsx` (parse di klien), `nodemailer`/Resend, `@vercel/edge-config`, `motion`, `lucide-react`,
  Vitest. Deploy Vercel (auto dari `main`, preview tiap branch). CI `.github/workflows/ci.yml` (test +
  typecheck + build). Backup harian `.github/workflows/backup.yml`. npm.
- Supabase production ref `beajoczjpywozavatzmf`; ada project staging terpisah. 25 tabel publik, migrasi
  `supabase/migrations/0001`–`0051`.
- `app/` — `login/`, `maintenance/`, `auth/` (callback, lupa-sandi, perbarui-sandi, signout),
  `api/cron/late-penalty/` (nonaktif), `(app)/` = shell persisten (`layout.tsx`, `app-shell.tsx` menu,
  `mode-actions.ts`) dengan `penilaian/ kpi/ monitor/ laporan/ laporan-tim/ review-hasil/ suksesi/ akun/` dan
  `admin/` (`periode/ pertanyaan/ pemetaan/ bobot/ 360/ progress/ kepatuhan/ laporan/ dashboard/ monitor/
  struktur/ ekspor/ akses/ pegawai/ audit/`; gate per bagian `canSection`).
  `/` = gerbang auth → landing per peran (tak ada Beranda). **Tak ada `src/`** (SPA legacy sudah dihapus).
- `lib/` — rumus (`scoring.ts`, `score360.ts`, `late.ts`, `trend.ts`), `report.ts` (loader laporan),
  `auth/roles.ts`, `supabase/` (`server.ts`: `createClient` user/RLS vs `createAdminClient` service_role;
  `paginate`), `maintenance.ts`, `panduan.ts`, `email/mailer.ts`, `audit/log.ts`, `database.types.ts`.
- `proxy.ts` (cek maintenance → session), `components/` (primitif UI), `scripts/`, `tests/`, `public/panduan/` (4 PDF).
- Fitur memakai sub-tab `?tab=`. Tombol per halaman → PANDUAN.md.

## 4. Keputusan arsitektur terkunci
- **Selalu** taruh logika sensitif (kalkulasi Skor Akhir, finalisasi, aktivasi/kunci periode, bobot) di Server
  Action / Route Handler + validasi **Zod di server** — RLS ditegakkan di DB, bukan cek UI.
- **Pola referensi** = vertical slice Input KPI (auth → Server Action + Zod → tulis skor + audit → uji RLS).
  Fitur baru mereplikasi pola ini. `result_360` & `final_reports` skor hanya ditulis server.
- **Paritas legacy yang disengaja:** edit KPI wajib komentar; input KPI pertama boleh tanpa komentar.
- **Jangan** membuat "page-builder" untuk HRD (2026-06-30): grant hanya membuka halaman dari **katalog tetap**
  (`GRANTABLE_PAGES`). Variasi per mandat = **lingkup/parameter** pada halaman existing. Kebutuhan tampilan baru
  = pekerjaan developer (kode + RLS + uji). Reframe tiap permintaan jadi "halaman existing mana + lingkup apa".
- **Aplikasi menegakkan kebijakan, bukan menambal kelalaian** (2026-06-25): jangan usulkan pengaman keteledoran
  (mis. penegasan "wajib tekan Kirim") tanpa permintaan eksplisit. Pengecualian yang sudah diminta: konfirmasi
  hapus Ad-Hoc = modal in-app `app/(app)/penilaian/modal.tsx` (alasan konsistensi design system).
- **Progress 360** (`admin/progress`, pemantauan) dan **Flag Kepatuhan** (`admin/kepatuhan`, potongan
  keterlambatan −3) **sengaja terpisah** — bukan duplikasi, jangan digabung.
- **Kebijakan mutlak:** semua rating + evidence (≥ 20 karakter) + semua esai wajib sebelum Kirim.
- **Jangan** dorong aksesibilitas ke pembaca layar (`aria-*`/`role`/uji NVDA) tanpa diminta — basis pengguna tak
  membutuhkannya; percobaan sebelumnya di-revert. Keterbacaan (kontras, ukuran ≥ 10px) tetap dijaga.

## 5. Keamanan & privasi
- **Jangan** expose `SUPABASE_SERVICE_ROLE_KEY` ke client; hanya `NEXT_PUBLIC_*` yang boleh.
- Lapis informasi laporan (dipakai di kode & komentar): **L1** Skor Akhir · **L2** agregat (radar/aspek +
  ringkasan HRD) · **raw anonim** (`byAspect`/`essays`, komentar & rating verbatim tanpa identitas) ·
  **L3** `assessors` (umpan balik **bernama** per penilai).
- **Jangan pernah** kirim L3 ke non-HRD — **buang di server**, bukan disembunyikan di layar (`ReportDoc` komponen
  klien). Loader tim (`loadTeamReportForSpv`/`ForCoordinator`/`loadSpvReportForDireksi`/`loadTeamReportForHrdSpv`/
  `loadReportForDireksiReview`) dan jalur grant Review (`reportForGrantViewer`) membuangnya. Di layar laporan mana
  pun komentar tampil anonim (juga untuk HRD); siapa-menilai-siapa hanya di Pemetaan/Progress 360 (HRD).
- RLS raw 360° (`asmt_read`/`ais_read`/`aqa_read`, `map_read`, `corr_read`) hanya HRD (+ penilai atas miliknya);
  tanpa `is_my_member`, tanpa cabang target/Direksi. Paparan raw anonim ke SPV/Koordinator/Direksi =
  **app-level** via `service_role`, hanya saat laporan `in_review`/`finalized`. ⚠️ Risiko de-anonimisasi pada
  kelas penilai kecil; mudah dibalik. **Pengecualian tanpa gerbang status (disengaja):**
  - Grant "Review & Finalisasi" melihat raw anonim **sejak draf** — tugasnya membantu menyusun ringkasan aspek.
    L3 tetap dilarang.
  - Tinjauan Hasil Akhir Direksi (`/review-hasil`, `loadReportForDireksiReview`): semua pegawai, semua status
    termasuk draf, read-only; L3 dibuang.
  - Monitor boleh menampilkan skor 360° **berjalan** sebelum laporan dirilis. Setelah dirilis/Final, angkanya
    harus sama dengan laporan.
- Lingkup raw SPV = seluruh pegawai **sedivisi** (`inSpvDivisionScope`) — hanya untuk detail laporan; KPI/Monitor/
  ACC/RLS `is_my_member` tetap `spv_team_members`. Laporan **diri sendiri tanpa raw** (`withoutRaw`) kecuali HRD
  Mode Admin & Direksi. Anggota tim koordinator wajib sedivisi.
- Employee hanya membaca laporannya saat `finalized` (dimuat via service_role). Direksi read-only + ACC.
- **KPI hanya lewat Server Action** (`kpi_write` RLS dicabut): lingkup `assertKpiScope` (HRD = divisinya sendiri
  + diri, apa pun modenya · SPV tim+diri · Koordinator tim), tulis atomik `kpi_save_with_audit`/`kpi_delete_with_audit`. Audit KPI tak boleh
  diubah/dihapus dari client.
- Periode terkunci & form tertutup ditolak server (`assessment_writable`, trigger). Kirim ulang hanya sampai
  deadline (`assessment_locked_after_deadline`).
- `?next=` login/callback lewat `safeNext` (cegah open redirect).
- Repo **publik**: jangan commit data pegawai, backup mentah, email, kredensial, atau CSV `BACKFILL-*`.

## 6. Invariant akses
- **Paritas SPV ↔ HRD Mode-SPV (wajib):** tiap perubahan perilaku SPV (lingkup tim, menu Supervisor, RLS/scope
  KPI, Laporan Kinerja Tim, Monitor, aturan ACC) **harus** berlaku identik untuk HRD Mode-SPV. Titik sentuh:
  `app-shell.tsx` (menu base), `kpi/` (`riwayat-view`/`rekap-view`/`InputTab`), `monitor/`, `laporan-tim/`,
  `laporan/[employeeId]` (jalur `asSpv` + `loadTeamReportForHrdSpv`). Jangan tinggalkan cabang `role==='hrd'`.
  Paritas yang sama berlaku ke jalur grant halaman.
- Pegawai berkoordinator: ACC & input KPI oleh **koordinator**; SPV/HRD Mode-SPV hanya lihat status.
- **ACC (`setSpvAcc`) lingkupnya ditegakkan server** lalu ditulis via service_role (RLS tak cukup: `hrd_can('laporan')`
  lolos untuk laporan siapa pun): tak ada yang meng-ACC laporannya sendiri (+ trigger 0049); SPV = `spv_team_members`;
  HRD posisi = sedivisi (bukan Direksi/eksternal), juga HRD tanpa bagian Laporan (paritas). Log ACC dicatat app.
- Izin HRD Admin (`is_hrd_admin`) hanya boleh diberikan ke pegawai divisi **HRD-GA** (`isHrdDept`); pencabutan
  selalu boleh. Ubah izin & akun HRD/Direksi
  hanya HRD penuh (`isFullHrd`); tak ada yang mengubah izin dirinya (`employees_guard_privileges`).
- `hrd_sections` (Atur Akses): menu + **tulis** dibatasi (`canSection`, DB `hrd_can`); **baca** tetap `is_hrd()`.
- **Grant halaman (`page_grants`) — model beku:** 1 grant = orang + halaman + lingkup (multi) + izin 3 tingkat
  (Lihat / Meringkas=`can_edit` / Finalisasi=`can_finalize`; halaman pemantauan selalu Lihat). Tiap halaman yang
  di-grant **wajib**: (1) gate sadar-mode `isHrdFull = canSection(page) && hrdMode==='admin'`; (2) baca jalur grant
  via service_role berlingkup (`grantedScope`/`grantedAccess`/`deptScopeFilter`/`applyDeptScope`/
  `employeeInScopes`, diuji `tests/page-scope.test.ts`); (3) `?dept=` tak boleh menembus lingkup (`resolveDept`);
  (4) tulis non-HRD ditegakkan server (`resolveReportWriteActor`) via service_role. Untuk pemegang `is_hrd()`
  batas izin = tampilan saja. Rincian → TEKNIS.md §5.
- Finalisasi = HRD **atau** grant Review tingkat Finalisasi berlingkup. Peninjau Lintas Divisi = grant Review +
  `other_divisions` + Meringkas (`is_cross_reviewer`/`/peninjau` sudah dipensiunkan; jangan hidupkan lagi).

## 7. Aturan skor (terkunci — `lib/scoring.ts`, `lib/score360.ts`, `lib/late.ts`)
Kode BR-xx = nomor aturan bisnis dari HRD (keputusan 2026-10-01).
- **Selalu** pakai helper, **jangan** hitung Skor Akhir/rerata KPI manual di halaman: `finalScoreOf(kpi, s360,
  has360)` (tanpa KPI → 360° saja; 2 desimal = `numeric(5,2)`), `kpiAvgOf` (presisi penuh, bulatkan di akhir),
  `roundScore`/`fmt2` (bukan `toFixed`), klasifikasi atas nilai terbulat. Angka tampil = `displayedFinalOf`
  (Final → `final_reports.final_score`; selain itu hidup). Selisih hanya di Review & Finalisasi (`hasScoreDrift` ≥ 0.01).
- Skor Akhir = blend KPI + 360 **tanpa** pengurang lain. Fitur Punishment manual **dihapus** (2026-10-01); tabel
  `compliance_penalties` dorman — jangan dibaca/ditulis.
- **Selalu** lewat `schemeFor`/`effectiveModel` sebelum `weightedScore360` — jangan suapkan model DB langsung.
  BR-10: model 2 kelas pada periode ≥ `AUTO_WEIGHT_FROM` (2026-07-01) = bobot otomatis 40/60 · 60/40 · 100%;
  4 kelas & bobot khusus pegawai apa adanya; Q1–Q2 bobot tersimpan. Self selalu dikecualikan.
- Skor 360° resmi `result_360.score` = `score_raw` − `late_penalty` (flat −3, min 0; kewajiban = Wajib + AJUAN
  sejak `AJUAN_PENALTY_FROM`; nilai bisa ditetapkan HRD `late_penalty_waivers.points`). `first_submitted_at`/
  `forced_by_hrd` diisi **trigger DB** — jangan tulis/andalkan dari app. Potongan diterapkan otomatis saat HRD
  membuka Kepatuhan/Review & sebelum `computeFinal`; cron nonaktif (`vercel.json` sengaja tak ada).
- **Jangan** ganti filter `status='submitted'` menjadi "bukan draft" — `invalidated` (penilaian dibatalkan) =
  arsip, tak pernah masuk skor, kewajiban rater gugur. Penilaian Terkirim tak boleh dihapus.
- BR-07 status (`progressStatusOf`), BR-09 "No Score" (`NO_SCORE_LABEL`), BR-11 `playerClassOf` → `HRD_REVIEW`
  bila satu sumbu kosong (termasuk kuartal tanpa 360°). 4-Box = KPI × 360° ambang 80, **tanpa D**.
- 9-Box dihapus dari UI, tetapi **jangan** hapus `talentBoxOf`/`kpiBandOf`/`s360BandOf` (terkunci & diuji).
- Klasifikasi Dashboard dikunci ke satu kuartal lewat filter periode (KPI, 360°, Skor Akhir dari periode yang sama). Standar KPI (`kpi_standard`) dan
  semua dashboard = pelaporan, bukan ambang rumus.
- Direksi = subjek 360° terbatas: tampil di Review & Ekspor (Skor Akhir = 360°); `.neq('role','direksi')` di
  Dashboard/4-Box/KPI/kepatuhan/monitor/laporan-tim **sengaja dipertahankan**.
- **Laporan Final terkunci** (keputusan 2026-10-12, `lib/final-lock.ts`): angka laporan Final tak boleh berubah
  kecuali HRD menekan **Buka Kembali (ke Draf)** dulu. Jalur satu pegawai → tolak (`finalLockError`; KPI per bulan
  lintas periode → `finalLockErrorForMonths`); proses massal (Hitung Ulang, `refreshLatePenalties`) → lewati pegawai
  Final & laporkan jumlahnya; pengaturan seluruh periode (bobot, pertanyaan, `has_360`, hapus periode) → tolak bila
  ada laporan Final (`periodLockError`). Gagal membaca status = tolak. Jalur baru yang mengubah angka WAJIB lewat sini.
- Periode terkunci **boleh dibuka kembali** (laporan Final aman; selisih ditandai). Karena itu pengaman Q1 wajib
  di server: `lib/backfill-guard.ts` (`backfillLockReason`, **gagal tertutup**) menolak Hitung Ulang & potongan telat
  periode hasil impor (`score360.backfill`) — jangan
  Hitung Ulang Q1 2026.
- `lib/score360.ts` diekstrak dari `app/(app)/admin/360/actions.ts` — jaga sinkron.
- **Mengubah rumus atau ambang** = ubah kode + tes + tabel TEKNIS.md §4 sekaligus.

## 8. Design System — token (acuan tetap)
- Sumber tunggal `app/globals.css` (`@theme` + `.data-value`). **Selalu** pakai utilitas token (`bg-brand`,
  `text-ink-soft`, `border-line`, `rounded-panel`, …); **jangan** hex mentah / palet Tailwind default
  (`emerald-*`, `gray-*`, `indigo-*`, `amber-*`, `rose-*`, `slate-*`, `rounded-lg`, `shadow-sm`).
  Acuan: Kelola Siklus Periode (`app/(app)/admin/periode/`) + sidebar (`app-shell.tsx`).
- **Brand** `--color-brand #00843b` (+ `brand-ink #006B31`, `brand-tint #E4F3E9`) **hanya** untuk primary action
  & elemen aktif (tombol utama, item sidebar aktif, ring fokus).
- Status/badge = **soft-tint** via `StatusChip` (`components/status-chip.tsx`, tone `neutral|brand|warn|danger`);
  solid hanya primary button.
- Pemetaan semantik (invariant): **brand** = primary/aktif/positif (terpilih, "Terkirim") · **warn** =
  peringatan/pending/obligasi ("Wajib", draf, skor basi, "Lengkapi") · **danger** = error/destruktif/wajib-isi ·
  **neutral** = nonaktif/info. Chart 2 seri: utama = brand, pembanding = warn (radar Rekan vs Self; hex SVG =
  nilai `--color-*`).
- Border `--color-line #E4E6E2`; radius `--radius-panel 10px` / `--radius-control 7px`; **tanpa shadow** kecuali
  elemen mengambang. Kartu = `Panel` (flat, kurangi nested card). Tombol = `Button` (`primary|ghost|danger`);
  aksi sekunder di tabel → `OverflowMenu` (⋯), satu primary per baris. Microcopy panjang → footnote/tooltip.
  Kanvas `bg-bg` + `px-5 py-7`, tanpa wrapper putih besar.
- Font Montserrat untuk teks; IBM Plex Mono via `.data-value` (alias `.mono`, `tabular-nums`) untuk **semua**
  angka/data/ID — jangan untuk kalimat.
- **Pengecualian (permintaan pengguna):** `admin/dashboard/dashboard-visual.tsx` (sub-tab + chart) dan analitik
  Monitor (`monitor-trends`, `extremes-heatmap`, `per-employee-heatmap`, `dist-bars`, `team-aspect`,
  `section-header`) **tetap berwarna** — jangan di-token-kan. Palet diskrit skor dashboard: ≥90 biru · 80–89
  hijau · 70–79 kuning · <70 merah (selaras `perfCategoryOf`); badge 4-Box & Trend memakai warna dari `lib/`.
- ⚠️ `laporan-tim/team-table.tsx` & `scorecards.tsx` dipakai bersama Monitor — mengubahnya mengubah Monitor.
- **Tabel berpager wajib stabil** (2026-10-15): `table-fixed` + `<colgroup>` (`colPercents`), kelas `table-1line`
  (isi sel 1 baris, keputusan pengguna), dan tabel + pager dibungkus `StableHeight` (`components/table-controls.tsx`)
  — ukuran tak boleh bergeser saat paging/filter/tab. Daftar yang barisnya bisa dibuka-tutup (Progress 360) dikecualikan.
- Audit kontras (2026-06-19): teks harus lulus WCAG AA (dulu `text-gray-400` → `gray-500`) dan ≥ 10px; label di dalam SVG chart (radar `report-doc`,
  `monitor-chart`) dikecualikan agar grafik tak berdesakan.

## 9. Konvensi & pengujian
- TS strict; hindari `any`. Komentar & label UI bahasa Indonesia mengikuti istilah PANDUAN ("Mulai Nilai",
  "Final Report", "Garis Hubungan").
- Tipe skema di `lib/database.types.ts`; tipe per-fitur inline/di lib terkait — jangan duplikasi.
- **Selalu** paginasi (`.range()` / `fetchAllPaged`/`fetchAllByIds`, chunk id ~150) untuk query yang bisa
  > 1000 baris — PostgREST memotong diam-diam (bug 2026-07-08: 51/52 Skor 360° salah).
- **Jangan** `npm audit fix --force` (menurunkan Next 16 → 9). `xlsx@0.20.3` dari CDN SheetJS.
- Rumus menentukan keputusan SDM nyata dan salahnya tak memunculkan error → `npm test` wajib hijau saat kode
  disentuh (±900 tes / 47 file). Server Action diuji dengan mock `tests/helpers/mock-supabase.ts`.
- `npm run verify:rls` (56 pemeriksaan, fixture `RLSTEST-*` self-cleaning) manual pra-rilis & tiap ubah RLS.
- Migrasi baru: idempoten, nomor urut, terapkan ke staging dulu; urutan rilis → TEKNIS.md §1. Kode yang memanggil
  fungsi database baru WAJIB punya cadangan cara lama bila fungsinya belum ada (`rpcMissing`, `lib/supabase/rpc.ts`),
  dan `scripts/check-migrations.sql` diperbarui.
- **Aturan merge (pemilik, 2026-10-14):**
  - Claude Code **TIDAK BOLEH** merge PR atau push langsung ke `dev`/`main`. Merge hanya dilakukan pemilik.
    Claude Code bekerja di branch sendiri, push branch itu, lalu menyiapkan PR.
  - Semua perubahan masuk lewat **PR ke `dev`** dulu; `dev` → `main` hanya saat rilis yang **disetujui pemilik**.
  - PR yang membawa migrasi **wajib** mencantumkan nomor migrasinya dan bahwa migrasi itu harus dijalankan di
    **staging & production** sebelum fiturnya dipakai.

## 10. Perintah
```bash
npm install
npm run dev        # Next.js dev :3000
npm run build      # validasi tipe & prerender — jalankan sebelum push
npm run typecheck  # tsc --noEmit
npm run lint       # eslint . (flat config) — temuan lama belum dibersihkan; belum di CI
npm test           # vitest run
npm run test:watch
npm run verify:rls # butuh anon + service role key di .env.local
```
