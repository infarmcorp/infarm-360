# DESAIN — Halaman Manajemen Akses (RBAC) — Infarm 360°

> **Status:** spec desain (belum dibangun). Konsolidasi diskusi 2026-07-17. Acuan saat membangun.
> Panduan durable: [CLAUDE.md](../../CLAUDE.md) · backlog: [BACKLOG.md](../perencanaan/BACKLOG.md).

Dokumen ini menyatukan visi RBAC yang dibahas bertahap: dari "akses HRD granular per-halaman"
menjadi **halaman Manajemen Akses** yang mengatur siapa boleh mengakses halaman/data apa & sejauh mana.

---

## 1. Tujuan

Memberi HRD Admin **satu tempat** untuk mengatur akses secara **fleksibel & data-driven** (aktif/
nonaktif per orang), tanpa deploy — atas **katalog halaman TETAP** (bukan page-builder; lihat
keputusan terkunci CLAUDE.md). Termasuk memberi **SPV/Koordinator** akses melihat **kinerja pegawai
naungannya** yang belum mereka punya (mis. Dashboard berlingkup tim).

## 2. Keputusan terkunci (hasil diskusi)

- **AUGMENT, bukan replace** (dikonfirmasi 2026-07-17): akses default per-peran **tetap** (SPV/
  Koordinator otomatis lihat timnya lewat Monitor/Laporan Kinerja Tim/Input KPI). Halaman akses hanya
  **MENAMBAH** akses ekstra (mis. Dashboard berlingkup) atau **MENCABUT** bila perlu. Tak mengubah
  perilaku yang sudah jalan.
- **Audit Akses = status + riwayat** (dikonfirmasi 2026-07-17): sub-tab menampilkan **matriks status
  sekarang** (siapa punya apa + lingkup) **dan** **riwayat perubahan** (kapan diberi/dicabut, oleh siapa).
- **Katalog halaman TETAP** (bukan URL bebas): sejalan keputusan "tak ada page-builder". Variasi
  per-mandat lewat **SCOPE/parameter** pada halaman existing, bukan menggandakan halaman.
- **Keamanan NYATA (Jalur B)** untuk data sensitif: akses berlingkup (tim/divisi) ditegakkan di
  **RLS/service_role**, bukan sekadar sembunyi menu. Pola: grant yang **tidak** menyalakan `is_hrd()`
  penuh + baca via `service_role` berfilter (pola Peninjau/Koordinator yang sudah ada).

## 3. Sudah ada vs baru

**Sudah ada (jangan bangun ulang):**
- Akses HRD granular per-HALAMAN (Jalur A, menu) — `hrd_sections` + `canSection` (migrasi 0023). SELESAI.
- SPV: Monitor Kinerja, Laporan Kinerja Tim, Input KPI (berlingkup `spv_team_members`).
- Koordinator: Laporan Kinerja Tim, Input KPI, ACC (berlingkup `coordinator_team_members`).
- Peninjau Lintas Divisi (`is_cross_reviewer`) — pola grant-tanpa-`is_hrd()` + `service_role` berfilter.
- Overview Struktur Organisasi (`/admin/struktur`) — SELESAI 2026-07-17.
- Grant changes SUDAH tercatat di `hrd_audit_log` (`logHrdAction`, kategori 'pegawai').

**Baru (yang dibangun halaman ini):**
- **Dashboard berlingkup tim** untuk SPV/Koordinator (satu halaman Dashboard yang **scope** menurut
  penonton — org-wide utk HRD, tim-saja utk SPV/Koord). Butuh RLS/service_role scoping (Jalur B).
- **Toggle akses** per orang (aktif/nonaktif) di satu halaman.
- **Sub-tab Audit Akses** (status matriks + riwayat).

## 4. Struktur halaman (usulan)

`/admin/akses` (bagian katalog baru `akses`; gerbang: HANYA HRD **tak-terbatas** — rekan HRD terbatas
tak boleh membuka, agar tak bisa menaikkan aksesnya sendiri).

- **Sub-tab "Kelola Akses"** — matriks/daftar: baris = orang (HRD/SPV/Koordinator yang relevan),
  kolom = kapabilitas yang bisa di-toggle + **lingkup** (mis. Semua / Divisi sendiri / Tim naungan).
  Contoh kapabilitas: "Dashboard (berlingkup tim)", "Ekspor tim", dsb — dari katalog tetap.
- **Sub-tab "Audit Akses"** — (a) **Status**: snapshot siapa punya akses apa + lingkup, dihitung dari
  data (`employees` grants + tabel scope); (b) **Riwayat**: log perubahan akses, difilter dari
  `hrd_audit_log` ke aksi-akses (grant/revoke/set_sections/set_scope).

## 5. Model data (arah, belum final)

- Kapabilitas ekstra sebagai **grant boolean** atau kolom **text[]** per orang (pola `hrd_sections`).
- **Lingkup** per grant: `all` / `own_division` / `own_team` — ditegakkan RLS/service_role.
- Hindari role baru — pakai **grant/kapabilitas** (pola terbukti: HRD Admin, Koordinator, Peninjau
  semua grant, bukan role). Role hanya untuk posisi kepegawaian eksklusif.

## 6. Keamanan (wajib)

- Bagian **konfigurasi** (tak bocorkan data pribadi) → app-level `canSection` cukup.
- Bagian **data sensitif** (kinerja/laporan/dashboard/ekspor) → **RLS/service_role berfilter** wajib;
  grant TIDAK menyalakan `is_hrd()` penuh. Lingkup "tim/divisi sendiri" hanya berarti bila ditegakkan DB.
- Tambah assertion di `npm run verify:rls` untuk skenario baru (mis. SPV-berscope tak bisa baca tim lain).

## 7. Pentahapan & risiko

1. **(SELESAI)** Overview Struktur Organisasi — fondasi visual.
2. Halaman Manajemen Akses **kerangka + Jalur A** (toggle + audit status/riwayat untuk grant yang sudah
   ada; belum sentuh RLS).
3. **Jalur B**: Dashboard berlingkup + lingkup tim/divisi (RLS/service_role) — **butuh DB terisolasi
   untuk uji** (free tier: local dev = DB production; menerapkan migrasi RLS ke DB bersama = langsung
   memengaruhi app live). Backup + jendela sepi bila terpaksa di production.

## 8. Pertanyaan terbuka

- Daftar pasti kapabilitas ekstra yang bisa di-toggle (mulai dari: Dashboard berlingkup tim).
- Apakah "lingkup tim naungan" untuk SPV = `spv_team_members`, dan untuk Koordinator =
  `coordinator_team_members` (kemungkinan ya).
- Field **jabatan spesifik** (mis. "Koordinator Gudang") — fitur terpisah, lihat catatan memori.
