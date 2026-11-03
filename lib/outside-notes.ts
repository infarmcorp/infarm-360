import type { createClient } from '@/lib/supabase/server';
import { fetchAllPaged } from '@/lib/supabase/paginate';
import type { ReportData } from '@/lib/report';
import type { ReportDetailRoute } from '@/lib/auth/roles';

type SB = Awaited<ReturnType<typeof createClient>>;

/**
 * CATATAN DI LUAR PEMETAAN (migrasi 0054) — sisi BACA.
 *
 * Opt-in: `loadReport` dan semua loader turunan (SPV/Koordinator/HRD Mode-SPV/Direksi/Tinjauan Hasil Akhir/
 * grant Review/laporan pegawai) TIDAK memuat catatan. Hanya jalur HRD Mode Admin di detail laporan yang
 * memanggil `withOutsideNotes` di SERVER — ReportDoc/RawFeedback komponen klien, jadi data yang tak dimuat
 * tak mungkin bocor ke browser peran lain. Jangan mengandalkan `withoutRaw` untuk fitur ini.
 *
 * HRD Mode Admin juga menerima catatan tentang DIRINYA (keputusan pemilik 2026-11-03) — tetap anonim:
 * tabel memang tak menyimpan penulis maupun waktu kirim.
 */

/**
 * Satu-satunya jalur yang boleh memuat catatan: detail laporan rute 'hrd' (izin HRD + Mode Admin, lihat
 * reportDetailRoute). SPV, Koordinator, Direksi, grant Review, HRD Mode-SPV, need-admin → tidak.
 */
export function outsideNotesAllowed(route: ReportDetailRoute): boolean {
  return route === 'hrd';
}

/** Batas isi catatan (sama dengan Zod di Server Action & check database). */
export const OUTSIDE_NOTE_MIN = 20;
export const OUTSIDE_NOTE_MAX = 2000;

/**
 * Urutan tampil = abjad isi (keputusan pemilik 2026-11-03). Bukan urutan kirim (baris fisik Postgres
 * cenderung urut masuk) dan bukan id (acak, tapi tak boleh dipakai mengurutkan).
 */
export function sortOutsideNotes(bodies: string[]): string[] {
  return [...bodies].sort((a, b) => a.localeCompare(b, 'id', { sensitivity: 'base' }) || (a < b ? -1 : a > b ? 1 : 0));
}

/**
 * Tempel catatan ke `byAspect[i].outsideNotes` (hanya aspek yang punya catatan). Dipanggil dengan klien
 * service_role setelah pemanggil lolos gerbang HRD Mode Admin. Tabel belum ada (migrasi belum dijalankan)
 * atau gagal baca → laporan dikembalikan apa adanya (tanpa catatan), tak menggagalkan halaman.
 */
export async function withOutsideNotes(
  admin: SB, data: ReportData, employeeId: string, periodId: string,
): Promise<ReportData> {
  let rows: { aspect_id: string; body: string }[];
  try {
    rows = await fetchAllPaged((from, to) => admin.from('outside_mapping_notes')
      .select('aspect_id, body').eq('period_id', periodId).eq('target_id', employeeId)
      .order('id').range(from, to)); // urutan id hanya untuk paginasi stabil; tampilan diurutkan ulang
  } catch {
    return data;
  }
  if (!rows.length) return data;

  const { data: aspects } = await admin.from('culture_aspects').select('id, name').eq('period_id', periodId);
  const nameById = new Map((aspects ?? []).map((a) => [a.id, a.name]));
  const byName = new Map<string, string[]>();
  for (const r of rows) {
    const name = nameById.get(r.aspect_id);
    const body = r.body?.trim();
    if (!name || !body) continue;
    byName.set(name, [...(byName.get(name) ?? []), body]);
  }
  return {
    ...data,
    byAspect: data.byAspect.map((a) => {
      const notes = byName.get(a.name);
      return notes?.length ? { ...a, outsideNotes: sortOutsideNotes(notes) } : a;
    }),
  };
}
