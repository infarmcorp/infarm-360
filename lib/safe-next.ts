/**
 * Tujuan pengalihan setelah login / callback auth (`?next=`). Hanya jalur INTERNAL yang diterima.
 * Audit 2026-09-30: cek lama `startsWith('/')` meloloskan `//situs-lain.com` dan `/\situs-lain.com`,
 * yang oleh browser dibaca sebagai alamat situs lain (open redirect → tautan phishing berkedok
 * tautan Infarm). Nilai tak aman → '/'.
 */
export function safeNext(v: string | null | undefined): string {
  if (!v || !v.startsWith('/') || v.startsWith('//')) return '/';
  // Backslash (dibaca browser sebagai '/') & karakter kontrol dapat menyamarkan alamat eksternal.
  if (/[\\\u0000-\u001f\u007f]/.test(v)) return '/';
  return v;
}
