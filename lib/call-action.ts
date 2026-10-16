/**
 * Pemanggil Server Action dari komponen klien yang TIDAK pernah melempar error.
 *
 * Server Action bisa gagal sebelum sampai ke server — koneksi putus, sesi habis, atau aplikasi baru
 * di-deploy saat halaman lama masih terbuka ("Failed to find Server Action"). Tanpa ini, `await` di
 * tombol melempar error, tombol diam di "…", dan pengguna mengira datanya tersimpan (kasus ACC
 * 2026-10-15: HRD yakin sudah ACC, database tak pernah menerimanya). Hasil gagal dibentuk sama
 * dengan hasil gagal biasa ({ ok: false, error }) agar pemanggil cukup menangani satu jalur.
 */
export const ACTION_UNREACHABLE =
  'Gagal terhubung ke server — perubahan TIDAK tersimpan. Muat ulang halaman lalu coba lagi.';

export async function callAction<T>(fn: () => Promise<T>): Promise<T | { ok: false; error: string }> {
  try {
    return await fn();
  } catch {
    return { ok: false, error: ACTION_UNREACHABLE };
  }
}

/** Jam:menit WIB untuk konfirmasi "tersimpan pukul …". */
export function savedAtLabel(d = new Date()): string {
  return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' });
}
