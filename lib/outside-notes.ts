import type { createClient } from '@/lib/supabase/server';
import { fetchAllPaged } from '@/lib/supabase/paginate';
import { canSection, type ActorRow } from '@/lib/auth/roles';
import { tableMissing } from '@/lib/report-folder';

type SB = Awaited<ReturnType<typeof createClient>>;

/**
 * LAPORKAN PELANGGARAN (tabel `outside_mapping_notes`, migrasi 0054 + 0058 + 0061) — sisi BACA & aturan bersama.
 * Sejak 0061 lepas dari 360°: gerbang kirim = periode aktif + saklar `periods.violation_open` (`loadViolationPeriod`),
 * kategori = NAMA aspek budaya (`loadViolationCategories`), tak terikat ke aspek periode tertentu.
 * Di layar dulu bernama "Catatan di Luar Pemetaan"; nama tabel & aturan anonimitas tidak berubah.
 *
 * Anonim secara skema: tabel TANPA kolom penulis dan TANPA waktu kirim. `incident_date` = tanggal KEJADIAN
 * yang ditulis pelapor, bukan waktu kirim. Urutan tampil tak boleh memakai id atau urutan masuk.
 *
 * Baca HANYA dua jalur (pembaca juga melihat laporan tentang dirinya sendiri — tetap anonim):
 *  - halaman "Laporan Pelanggaran" (app/(app)/admin/pelanggaran) → `violationPageAllowed` = HRD Mode Admin
 *    berbagian Review & Finalisasi, ATAU Direksi (keputusan pemilik 2026-11-11: semua laporan, hanya baca);
 *  - ekspor Bahan Laporan per Pegawai (lembar 4), cookie `hrd_mode='admin'` (HRD saja).
 * Sejak 0058 laporan TIDAK lagi ditempel ke rincian komentar laporan (keputusan pemilik 2026-11-10).
 */

/** Batas isi laporan (sama dengan Zod di Server Action & check database). */
export const OUTSIDE_NOTE_MIN = 20;
export const OUTSIDE_NOTE_MAX = 2000;
/** Batas catatan opsional (check database 0058). */
export const OUTSIDE_NOTE_EXTRA_MAX = 1000;
/** Label kategori "Lainnya" (laporan di luar budaya kerja). */
export const OTHER_CATEGORY_LABEL = 'Lainnya';

/**
 * Halaman Laporan Pelanggaran: HRD berbagian Review & Finalisasi di Mode Admin, atau Direksi (semua laporan, termasuk
 * tentang dirinya sendiri; hanya baca — keputusan pemilik 2026-11-11). Direksi tak punya mode, jadi cookie diabaikan.
 */
export function violationPageAllowed(m: ActorRow | null | undefined, hrdMode: 'admin' | 'spv'): boolean {
  if (m?.role === 'direksi') return true;
  return canSection(m, 'laporan') && hrdMode === 'admin';
}

/**
 * Periode aktif + saklar Laporkan Pelanggaran (0061: `periods.violation_open`, keputusan pemilik 2026-11-16) — lepas
 * dari 360°: cukup periode aktif + saklar terbuka. `formOpen` tetap dibaca karena aturan "rekan di daftar penilaian
 * → lewat formulir" hanya berlaku selama formulir 360° terbuka. Kolom 0061 belum ada → gerbang lama
 * (360° aktif + formulir dibuka). Null = tak ada periode aktif.
 */
export type ViolationPeriod = { id: string; label: string; formOpen: boolean; open: boolean };
export async function loadViolationPeriod(sb: SB): Promise<ViolationPeriod | null> {
  const { data, error } = await sb.from('periods')
    .select('id, label, has_360, form_open, violation_open').eq('status', 'active').limit(1).maybeSingle();
  if (!error) {
    if (!data) return null;
    return { id: data.id, label: data.label, formOpen: !!(data.has_360 && data.form_open), open: data.violation_open === true };
  }
  if (!columnMissing(error.message ?? '') && error.code !== '42703' && error.code !== 'PGRST204') return null;
  const { data: old } = await sb.from('periods')
    .select('id, label, has_360, form_open').eq('status', 'active').limit(1).maybeSingle();
  if (!old) return null;
  const formOpen = !!(old.has_360 && old.form_open);
  return { id: old.id, label: old.label, formOpen, open: formOpen };
}

/**
 * Pilihan kategori budaya kerja = NAMA aspek budaya dari periode TERBARU yang punya aspek (urutan order_idx).
 * Aspek sama antarperiode (hanya indikatornya berganti — pemilik 2026-11-16), jadi kategori tak dikunci ke aspek
 * periode aktif; periode tanpa 360° / belum menginput aspek tetap punya pilihan. Nama kembar dibuang.
 */
export async function loadViolationCategories(sb: SB): Promise<string[]> {
  const [{ data: periods }, { data: aspects }] = await Promise.all([
    sb.from('periods').select('id, start_date').order('start_date', { ascending: false }),
    sb.from('culture_aspects').select('period_id, name, order_idx').order('order_idx'),
  ]);
  const byPeriod = new Map<string, string[]>();
  (aspects ?? []).forEach((a) => {
    const name = String(a.name ?? '').trim();
    if (!name) return;
    byPeriod.set(a.period_id, [...(byPeriod.get(a.period_id) ?? []), name]);
  });
  for (const p of periods ?? []) {
    const names = byPeriod.get(p.id);
    if (names?.length) return dedupeNames(names);
  }
  return [];
}

const dedupeNames = (names: string[]) => {
  const seen = new Set<string>();
  return names.filter((n) => { const k = n.toLocaleLowerCase('id'); if (seen.has(k)) return false; seen.add(k); return true; });
};

/** Nama kategori kiriman pelapor → nama baku dari daftar (tanpa beda huruf besar/kecil & spasi tepi); tak ada → null. */
export function matchCategory(list: string[], raw: string): string | null {
  const k = raw.trim().toLocaleLowerCase('id');
  return list.find((n) => n.toLocaleLowerCase('id') === k) ?? null;
}

/** Label kategori satu laporan: Lainnya · nama tersimpan (0061) · nama aspek rujukan (laporan lama) · '—'. */
export function violationCategoryLabel(r: Pick<ViolationRow, 'is_other' | 'category' | 'aspect_id'>, aspectName: Map<string, string>): string {
  if (r.is_other) return OTHER_CATEGORY_LABEL;
  if (r.category) return r.category;
  return (r.aspect_id ? aspectName.get(r.aspect_id) : undefined) ?? '—';
}

export type ViolationRow = {
  period_id: string;
  target_id: string;
  aspect_id: string | null;
  /** Nama kategori budaya kerja (0061). Null = Lainnya, atau laporan lama yang memakai aspect_id. */
  category: string | null;
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
    let q = admin.from('outside_mapping_notes').select('period_id, target_id, aspect_id, category, is_other, incident_date, body, note');
    if (periodId) q = q.eq('period_id', periodId);
    return q.order('id').range(from, to);
  });
  // Kolom 0061 (category) belum ada → kolom 0058.
  const read0058 = () => fetchAllPaged<Omit<ViolationRow, 'category'>>((from, to) => {
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
  const isColumnMissing = (msg: string) => columnMissing(msg) && !/table/i.test(msg);
  try {
    raw = await readFull();
  } catch (e) {
    const msg = e instanceof Error ? e.message : '';
    if (isColumnMissing(msg)) {
      try {
        raw = await read0058();
      } catch (e2) {
        const msg2 = e2 instanceof Error ? e2.message : '';
        if (!isColumnMissing(msg2)) throw e2;
        raw = await readLegacy();
      }
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
    category: typeof r.category === 'string' && r.category.trim() ? r.category.trim() : null,
    is_other: r.is_other === true,
    incident_date: r.incident_date ?? null,
    body: String(r.body ?? '').trim(),
    note: typeof r.note === 'string' && r.note.trim() ? r.note.trim() : null,
  }));
}
