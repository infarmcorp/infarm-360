# DEVELOPMENT — Alur Dev/Staging

Panduan ringkas supaya pengembangan fitur baru **tidak pernah menyentuh** aplikasi
production yang sedang dipakai user nyata. Untuk konteks fitur/arsitektur lengkap, lihat
`CLAUDE.md`. Untuk status kerja saat ini, lihat `STATUS.md`.

## 1. Kenapa perlu dipisah

Project ini punya **satu** Supabase project untuk production, berisi **data pegawai
nyata** (bukan data uji). Mengembangkan fitur baru langsung ke production berisiko:
mengubah skema secara tidak sengaja, menjalankan skrip reset/migrasi ke data nyata, atau
membuat pengguna melihat fitur setengah jadi. Solusinya: branch terpisah + database
Supabase terpisah untuk dev/staging.

## 2. Branch strategy

- **`main`** = production. Vercel deploy `main` → domain production. **Jangan pernah
  push langsung ke `main`.**
- **`dev`** = branch kerja utama untuk fitur baru. Vercel otomatis membuat **Preview
  deployment** untuk setiap push ke branch non-`main` (termasuk `dev` dan branch turunan
  seperti `dev/nama-fitur`).
- Alur: kerja di `dev` (atau feature branch dari `dev`) → push → cek di URL Preview Vercel
  → setelah yakin benar → buka **Pull Request `dev` → `main`** → review → merge → Vercel
  deploy ke production.
- Jangan merge langsung tanpa PR, walau kecil — PR adalah titik terakhir untuk memastikan
  CI (test + typecheck + build, `.github/workflows/ci.yml`) hijau sebelum menyentuh
  production.

## 3. Dua environment Supabase

| | Production | Dev/Staging |
|---|---|---|
| Project ref | `beajoczjpywozavatzmf` (existing) | Project baru, akun Supabase **berbeda** |
| Data | Nyata (pegawai, penilaian, KPI asli) | Bebas — data uji, boleh direset kapan saja |
| Dipakai oleh | Vercel env scope **Production** | `.env.local` developer + Vercel env scope **Preview** |
| Migrasi | Diterapkan manual, hati-hati, setelah teruji di dev | Tempat pertama menguji migrasi baru |

> Catatan: akun Supabase free tier dibatasi 2 project **per akun**, bukan global — project
> dev dibuat dengan **akun/email Supabase yang berbeda** dari akun production.

### Setup awal project dev (sekali saja)
1. Buat project baru di [supabase.com](https://supabase.com) dengan akun kedua.
2. Catat dari **Project Settings → API**: `Project URL`, `anon public key`,
   `service_role key` (rahasia). Dari **Project Settings → Database**: connection string
   (`SUPABASE_DB_URL`, untuk migrasi manual — lihat §4).
3. Isi `.env.local` lokal (JANGAN commit) dengan nilai-nilai ini — salin dari
   `.env.example` sebagai template.
4. Terapkan semua migrasi di `supabase/migrations/` ke project dev (lihat §4).
5. `npm install && npm run dev` — aplikasi lokal sekarang jalan melawan database dev.

## 4. Migrasi skema — dua jalur

Repo ini **tidak** memakai `supabase init`/`supabase db push` secara baku — catatan di
`scripts/apply-migration.mjs` menyebut Supabase CLI sempat tak cocok di platform yang
dipakai untuk mengembangkan project ini. Karena itu tersedia dua jalur; keduanya memakai
sumber migrasi yang sama di `supabase/migrations/*.sql` (bernomor urut, idempoten):

**Jalur A — kalau Supabase CLI bisa jalan di mesin Anda:**
```bash
supabase init                          # sekali saja, generate supabase/config.toml
supabase link --project-ref <dev-ref>  # hubungkan ke project DEV, bukan production
supabase db push                       # terapkan semua migrations/*.sql ke project dev
```
Cek dulu dengan `supabase db diff` sebelum push bila ragu ada perbedaan skema.

**Jalur B — fallback yang sudah terbukti jalan di repo ini** (dipakai selama ini untuk
production, kini dipakai juga untuk dev):
```bash
npm install --no-save pg
node scripts/apply-migration.mjs supabase/migrations/0001_init.sql
node scripts/apply-migration.mjs supabase/migrations/0002_policies.sql
# ...lanjutkan berurutan sampai file terbaru...
npm uninstall --no-save pg
```
Skrip ini membaca `SUPABASE_DB_URL` dari `.env.local` — pastikan itu menunjuk ke project
**dev**, bukan production, sebelum menjalankan.

**Menambah migrasi baru saat mengembangkan fitur:**
1. Buat `supabase/migrations/00XX_nama-fitur.sql` baru (lanjutkan penomoran urut).
2. Terapkan ke project **dev** dulu (Jalur A/B), uji fitur di sana.
3. Setelah PR `dev → main` di-merge, terapkan **file SQL yang sama** ke project
   **production** secara manual (Jalur B, `SUPABASE_DB_URL` production) — tidak ada
   auto-migrate di CI, jadi ini langkah manual yang wajib tidak dilupakan.

**Kalau perubahan skema dilakukan dulu di dashboard/Studio dev (belum ada file migrasi):**
Sering terjadi saat eksplorasi cepat ("coba tambah kolom ini dulu"). Sebelum bisa merge ke
`main`, perubahan itu **wajib** dituliskan jadi file `00XX_*.sql` — kolom/tabel/policy baru
di dev **tidak sah** kalau belum ada file `.sql`-nya, walau sudah "berhasil" di dashboard.
- Kalau CLI jalan: `supabase db diff` bisa men-generate draft SQL dari selisih skema; review
  manual sebelum simpan (terutama RLS policy).
- Kalau Jalur B: tulis SQL-nya manual, ikuti pola **idempoten** migrasi yang sudah ada
  (`drop ... if exists` / `create or replace`), lalu jalankan file itu ke dev sekali lagi
  untuk memastikan benar-benar valid dijalankan dari nol — bukan cuma kebetulan cocok dengan
  perubahan manual yang sudah ada di dashboard.
- Alasan: production HARUS dibangun dari file migrasi yang sama persis dengan yang tervalidasi
  di dev — bukan dari mengingat-ingat apa yang diklik di dashboard. Perubahan yang hanya hidup
  di dashboard hilang tanpa jejak bila project dev di-reset.

## 5. Mekanisme merge saat kode DAN skema sama-sama berubah

Kode dan database adalah **dua rel terpisah**: `git merge` menangani kode otomatis, tapi
database **tidak** ikut ter-migrate otomatis. File migrasi (`supabase/migrations/*.sql`)
adalah file biasa di git, jadi mereka ikut terbawa saat merge — yang terbawa cuma *file*-nya,
bukan *eksekusi*-nya ke database production. Menerapkan ke production selalu langkah manual
yang disengaja.

Alur lengkap satu siklus:
```
Di dev:                              Di main (setelah merge):
1. ubah kode + tulis 00XX.sql
2. jalankan 00XX.sql ke DB dev
3. test di Preview (pakai DB dev)
4. PR dev → main  ──── merge ───►    5. file 00XX.sql kini ada di main
                                     6. JALANKAN 00XX.sql ke DB production  ← manual
                                     7. Vercel auto-deploy kode ke production
```
Karena kedua DB dibangun dari file `.sql` yang sama & berurutan, skema keduanya dijamin
identik — tak perlu menebak selisihnya; file migrasi *adalah* catatan resmi selisih itu.

### Titik rawan: urutan langkah 6 vs 7
Setelah merge, Vercel deploy kode **otomatis** (7), tapi migrasi DB **manual** (6). Kalau
kode baru sudah live tapi skema belum diubah → error (kode mencari kolom yang belum ada).
Aturan urutan tergantung sifat perubahan:
- **Aditif** (tambah kolom/tabel/policy — mayoritas kasus): **migrasi production DULU**, baru
  merge kode. Kolom baru yang belum dipakai kode lama tidak mengganggu. Urutan paling aman.
- **Destruktif** (hapus/rename kolom, ubah tipe): pola 2 tahap (expand-then-contract) — deploy
  kode yang kompatibel dengan skema lama & baru dulu → migrasi → baru bersihkan sisa lama.
  Jarang; rancang saat kasusnya muncul.

Praktisnya: jalankan migrasi production **tepat sebelum atau segera setelah** merge, jangan
ada jeda lama. Traffic internal kecil (~100 user) → jendela beberapa detik ini praktis
tak berisiko.

### Konflik penomoran migrasi antar-branch
Kalau dua branch sama-sama membuat `0019_*.sql`, git tidak menandainya konflik (nama file
sama, isi beda / dua file 0019 berdampingan). Sebelum merge, **rename** salah satunya jadi
`0020_*.sql` agar urutan tetap linear. Untuk pengembang tunggal ini jarang terjadi.

## 6. Setup Vercel — Environment Variables per scope

Vercel mendukung nilai berbeda untuk variabel nama sama, dibedakan per scope
(Production/Preview/Development). Langkah manual di Vercel Dashboard:

1. **Project Settings → Environment Variables.**
2. Untuk `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY` — pastikan entri **Production** sudah berisi nilai project
   production (biasanya sudah ada).
3. Tambahkan entri baru untuk masing-masing variabel dengan scope **Preview** saja, isi
   nilai project **dev**. (Kosongkan/lewati scope Development bila hanya jalan lokal via
   `.env.local`.)
4. Redeploy branch `dev` (push commit baru atau trigger redeploy manual) agar Preview
   deployment memuat env var dev yang baru disetel.
5. Verifikasi: buka URL Preview dari deployment `dev` terbaru → login → pastikan data yang
   muncul adalah data dev (bukan nama pegawai nyata) sebagai tanda environment sudah benar.

## 7. Checklist sebelum merge `dev` → `main`

- [ ] `npm run build`, `npm test`, `npm run typecheck` semua hijau.
- [ ] Migrasi baru (jika ada) sudah diuji di project **dev** dan berjalan tanpa error.
- [ ] Fitur sudah dicoba di URL Preview Vercel (bukan hanya `localhost`).
- [ ] `git status` bersih dari file `.env*` — tidak ada secret ter-stage
      (`.gitignore` sudah mengecualikan `.env*` kecuali `.env.example`, tapi tetap cek).
- [ ] Setelah merge & deploy ke production: terapkan migrasi baru (jika ada) ke project
      **production** secara manual (lihat §4), lalu verifikasi cepat di production.
- [ ] Update `STATUS.md` + `TODO.md`/`BACKLOG.md`/`CHANGELOG.md` bila perubahan ini menggeser
      status fitur (dan `CLAUDE.md` bila menyentuh arsitektur/keputusan terkunci).
