# Panduan PDF per Peran (lampiran email onboarding)

Letakkan file PDF panduan **dengan nama persis** berikut di folder ini. Saat HRD
menekan **"Undangan"** / **"Kirim Undangan Massal"** di Progress 360, sistem otomatis
melampirkan PDF yang sesuai peran penerima.

| Peran penerima | Nama file (WAJIB persis) |
|---|---|
| Pegawai (employee) | `panduan-pegawai.pdf` |
| Supervisor (spv) | `panduan-spv.pdf` |
| HRD Admin (role `hrd` ATAU pemegang grant `is_hrd_admin`) | `panduan-hrd.pdf` |
| Direksi | `panduan-direksi.pdf` |

Catatan:
- Nama file **harus sama persis** (huruf kecil, tanda hubung). Nama yang tampil di email
  penerima diatur terpisah di `lib/email/mailer.ts` (mis. "Panduan Pegawai - Infarm 360.pdf").
- Bila salah satu file **belum ada**, email tetap terkirim **tanpa** lampiran untuk peran
  itu (tidak memblokir onboarding) — sistem memeriksa keberadaan file lebih dulu.
- File di folder `public/` **dapat diunduh siapa pun** yang tahu tautannya
  (mis. `https://<domain>/panduan/panduan-pegawai.pdf`). Karena ini manual penggunaan
  (bukan data sensitif), umumnya aman. Jangan menaruh dokumen rahasia di sini.
- Setelah menamb/mengganti PDF, **commit & push** (atau redeploy) agar file ikut ter-deploy.
