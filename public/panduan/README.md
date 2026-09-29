# Panduan PDF per Peran (lampiran email onboarding + unduhan di Akun Saya)

Letakkan file PDF panduan **dengan nama persis** berikut di folder ini. File dipakai di dua tempat:
(1) lampiran otomatis saat HRD menekan **"Undangan"** / **"Kirim Undangan Massal"** di Progress 360, dan
(2) section **"Panduan Pengguna"** di halaman **Akun Saya**. Pemetaan peran → file ada di
`lib/panduan.ts` (sumber tunggal).

| Peran penerima | Nama file (WAJIB persis) |
|---|---|
| Pegawai (employee) tanpa grant Koordinator | `panduan-pegawai.pdf` |
| Supervisor (spv) **dan** pemegang grant Koordinator | `panduan-spv-koor.pdf` |
| HRD Admin (role `hrd` ATAU pemegang grant `is_hrd_admin`) | `panduan-hrd.pdf` |
| Direksi | `panduan-direksi.pdf` |

Catatan:
- Nama file **harus sama persis** (huruf kecil, tanda hubung). Nama yang tampil saat diunduh /
  dilampirkan (mis. "Panduan Pegawai - Infarm 360.pdf") diatur di `lib/panduan.ts` (`PANDUAN_PDF`).
- Bila salah satu file **belum ada**, email tetap terkirim **tanpa** lampiran untuk peran
  itu (tidak memblokir onboarding).
- File di folder `public/` **dapat diunduh siapa pun** yang tahu tautannya
  (mis. `https://<domain>/panduan/panduan-pegawai.pdf`). Karena ini manual penggunaan
  (bukan data sensitif), umumnya aman. Jangan menaruh dokumen rahasia di sini.
- **Cara memperbarui:** sunting dokumen sumber (Word) → ekspor PDF dengan nama persis di atas → timpa
  file di folder ini → naikkan `PANDUAN_VERSION` & `PANDUAN_UPDATED_LABEL` di `lib/panduan.ts` (agar
  badge "BARU" muncul di Akun Saya) → commit & deploy. Daftar revisi isi yang tertunda:
  `docs/panduan/REVISI-PANDUAN-PDF.md`.
- Dokumen sumber (.docx) **tidak** disimpan di repo — simpan di lokasi bersama tim HRD.
