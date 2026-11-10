import type { createClient } from '@/lib/supabase/server';
import { fetchAllPaged } from '@/lib/supabase/paginate';
import { canSection, type ActorRow } from '@/lib/auth/roles';
import { tableMissing } from '@/lib/report-folder';

type SB = Awaited<ReturnType<typeof createClient>>;

/**
 * LAPORKAN PELANGGARAN (tabel `outside_mapping_notes`, migrasi 0054 + 0058) — sisi BACA & aturan bersama.
 * Di layar dulu bernama "Catatan di Luar Pemetaan"; nama tabel & aturan anonimitas tidak berubah.
 *
 * Anonim secara skema: tabel TANPA kolom penulis dan TANPA waktu kirim. `incident_date` = tanggal KEJADIAN
 * yang ditulis pelapor, bukan waktu kirim. Urutan tampil tak boleh memakai id atau urutan masuk.
 *
 * Baca HANYA dua jalur, keduanya HRD di Mode Admin (termasuk laporan tentang dirinya sendiri — tetap anonim):
 *  - halaman "Laporan Pelanggaran" (app/(app)/admin/pelanggaran) → `violationPageAllowed`;
 *  - ekspor Bahan Laporan per Pegawai (lembar 4), cookie `hrd_mode='admin'`.
 * Sejak 0058 laporan TIDAK lagi ditempel ke rincian komentar laporan (keputusan pemilik 2026-11-10).
 */

/** Batas isi laporan (sama dengan Zod di Server Action & check database). */
export const OUTSIDE_NOTE_MIN = 20;
export const OUTSIDE_NOTE_MAX = 2000;
/** Batas catatan opsional (check database 0058). */
export const OUTSIDE_NOTE_EXTRA_MAX = 1000;
/** Label kategori "Lainnya" (laporan di luar budaya kerja). */
export const OTHER_CATEGORY_LABEL = 'Lainnya';

/** Halaman Laporan Pelanggaran: HRD berbagian Review & Finalisasi, di Mode Admin (gerbang yang sama dengan jalur baca lama). */
export function violationPageAllowed(m: ActorRow | null | undefined, hrdMode: 'admin' | 'spv'): boolean {
  return canSection(m, 'laporan') && hrdMode === 'admin';
}

export type ViolationRow = {
  period_id: string;
  target_id: string;
  aspect_id: string | null;
  is_other: boolean;
  incident_date: string | null; // null = laporan sebelum 0058
  body: string;
  note: string | null;
};

/**
 * Urutan tampil: tanggal kejadian terbaru dulu (tanpa tanggal paling bawah), lalu abjad isi.
 * Bukan id (acak, tak boleh dipakai mengurutkan) dan bukan urutan kirim.
 */
export function sortViolations<T extends Pick<ViolationRow, 'incident_date' | 'body'>>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const da = a.incident_date ?? '', db = b.incident_date ?? '';
    if (da !== db) return da < db ? 1 : -1;
    return a.body.localeCompare(b.body, 'id', { sensitivity: 'base' }) || (a.body < b.body ? -1 : a.body > b.body ? 1 : 0);
  });
}

/** Kolom baru 0058 belum ada di database ini. */
const columnMissing = (msg: string) => /column|could not find the '.*' column|42703|PGRST204/i.test(msg);

/**
 * Semua laporan (opsional satu periode). Hanya isian pelapor + periode + pegawai yang dilaporkan — tabel memang
 * tak menyimpan penulis/waktu kirim. Dipanggil SETELAH gerbang HRD Mode Admin, dengan klien service_role.
 * Tabel belum ada (0054) → kosong. Kolom 0058 belum ada → baca kolom lama (tanpa tanggal/Lainnya/catatan).
 * Gangguan baca lain dilempar (halaman/ekspor gagal utuh, bukan data terpotong diam-diam).
 */
export async function loadViolationReports(admin: SB, periodId?: string | null): Promise<ViolationRow[]> {
  // id hanya untuk paginasi stabil; tampilan diurutkan ulang (sortViolations).
  const readFull = () => fetchAllPaged<ViolationRow>((from, to) => {
    let q = admin.from('outside_mapping_notes').select('period_id, target_id, aspect_id, is_other, incident_date, body, note');
    if (periodId) q = q.eq('period_id', periodId);
    return q.order('id').range(from, to);
  });
  const readLegacy = () => fetchAllPaged<Pick<ViolationRow, 'period_id' | 'target_id' | 'aspect_id' | 'body'>>((from, to) => {
    let q = admin.from('outside_mapping_notes').select('period_id, target_id, aspect_id, body');
    if (periodId) q = q.eq('period_id', periodId);
    return q.order('id').range(from, to);
  });
  let raw: Partial<ViolationRow>[];
  try {
    raw = await readFull();
  } catch (e) {
    const msg = e instanceof Error ? e.message : '';
    if (columnMissing(msg) && !/table/i.test(msg)) {
      raw = await readLegacy();
    } else if (tableMissing({ message: msg })) {
      return [];
    } else {
      throw e;
    }
  }
  return raw.map((r) => ({
    period_id: String(r.period_id),
    target_id: String(r.target_id),
    aspect_id: r.aspect_id ?? null,
    is_other: r.is_other === true,
    incident_date: r.incident_date ?? null,
    body: String(r.body ?? '').trim(),
    note: typeof r.note === 'string' && r.note.trim() ? r.note.trim() : null,
  }));
}
