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
 * dari 360°: cukup periode aktif + saklar terbuka. Kolom 0061 belum ada → gerbang lama (360° aktif + formulir
 * dibuka). Null = tak ada periode aktif.
 */
export type ViolationPeriod = { id: string; label: string; open: boolean };
export async function loadViolationPeriod(sb: SB): Promise<ViolationPeriod | null> {
  const { data, error } = await sb.from('periods')
    .select('id, label, violation_open').eq('status', 'active').limit(1).maybeSingle();
  if (!error) {
    if (!data) return null;
    return { id: data.id, label: data.label, open: data.violation_open === true };
  }
  if (!columnMissing(error.message ?? '') && error.code !== '42703' && error.code !== 'PGRST204') return null;
  const { data: old } = await sb.from('periods')
    .select('id, label, has_360, form_open').eq('status', 'active').limit(1).maybeSingle();
  if (!old) return null;
  return { id: old.id, label: old.label, open: !!(old.has_360 && old.form_open) };
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


/** Status tindak lanjut HRD (0062). Laporan sebelum 0062 dibaca sebagai 'received'. */
export const VIOLATION_STATUSES = ['received', 'in_progress', 'done'] as const;
export type ViolationStatus = typeof VIOLATION_STATUSES[number];
export const VIOLATION_STATUS_LABEL: Record<ViolationStatus, string> = {
  received: 'Diterima', in_progress: 'Sedang ditindaklanjuti', done: 'Selesai',
};
/** Nada chip status (Design System: neutral = info, warn = pending, brand = selesai). */
export const VIOLATION_STATUS_TONE: Record<ViolationStatus, 'neutral' | 'warn' | 'brand'> = {
  received: 'neutral', in_progress: 'warn', done: 'brand',
};
/** Batas tanggapan HRD untuk pelapor (check database 0062). */
export const VIOLATION_RESPONSE_MAX = 2000;
const asStatus = (v: unknown): ViolationStatus =>
  (VIOLATION_STATUSES as readonly string[]).includes(String(v)) ? (v as ViolationStatus) : 'received';

export type ViolationRow = {
  /** uuid acak — hanya untuk menyimpan tindak lanjut; JANGAN dipakai mengurutkan. */
  id: string;
  period_id: string;
  target_id: string;
  aspect_id: string | null;
  /** Nama kategori budaya kerja (0061). Null = Lainnya, atau laporan lama yang memakai aspect_id. */
  category: string | null;
  is_other: boolean;
  incident_date: string | null; // null = laporan sebelum 0058
  body: string;
  note: string | null;
  /** Tindak lanjut HRD (0062). */
  status: ViolationStatus;
  hrd_response: string | null;
  responded_at: string | null;
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

/** Kolom baru (0058/0061/0062) belum ada di database ini. */
const columnMissing = (msg: string) => /column|could not find the '.*' column|42703|PGRST204/i.test(msg);
const isColumnMissing = (msg: string) => columnMissing(msg) && !/table/i.test(msg);

/**
 * Kolom yang dibaca, dari skema terbaru ke terlama (0062 → 0061 → 0058 → 0054). `reporter_ref` SENGAJA tak pernah
 * ada di daftar ini: penanda pelapor tak boleh keluar dari server ke halaman/ekspor mana pun.
 */
const READ_COLUMNS = [
  'id, period_id, target_id, aspect_id, category, is_other, incident_date, body, note, status, hrd_response, responded_at',
  'id, period_id, target_id, aspect_id, category, is_other, incident_date, body, note',
  'id, period_id, target_id, aspect_id, is_other, incident_date, body, note',
  'id, period_id, target_id, aspect_id, body',
] as const;

/** Baca dengan cadangan kolom lama; tabel belum ada → kosong; gangguan lain dilempar. */
async function readViolations(admin: SB, filter: (q: any) => any): Promise<ViolationRow[]> { // eslint-disable-line @typescript-eslint/no-explicit-any
  let raw: Partial<ViolationRow>[] | null = null;
  for (const cols of READ_COLUMNS) {
    try {
      // id hanya untuk paginasi stabil; tampilan diurutkan ulang (sortViolations).
      raw = await fetchAllPaged<Partial<ViolationRow>>((from, to) =>
        filter(admin.from('outside_mapping_notes').select(cols)).order('id').range(from, to));
      break;
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (isColumnMissing(msg)) continue;
      if (tableMissing({ message: msg })) return [];
      throw e;
    }
  }
  return raw ? readViolationsFromRows(raw) : [];
}

/**
 * Semua laporan (opsional satu periode). Hanya isian pelapor + periode + pegawai yang dilaporkan + tindak lanjut HRD —
 * tanpa penanda pelapor & tanpa waktu kirim. Dipanggil SETELAH gerbang (`violationPageAllowed` / Mode Admin ekspor),
 * dengan klien service_role. Gangguan baca dilempar (halaman/ekspor gagal utuh, bukan data terpotong diam-diam).
 */
export async function loadViolationReports(admin: SB, periodId?: string | null): Promise<ViolationRow[]> {
  return readViolations(admin, (q) => (periodId ? q.eq('period_id', periodId) : q));
}

/**
 * "Laporan Saya" — laporan milik pelapor, dicari lewat penanda tersembunyi (lib/violation-ref.ts, server saja).
 * Kolom penanda belum ada (0062) → kosong. Hanya dipanggil halaman pegawai untuk dirinya sendiri.
 */
export async function loadMyViolationReports(admin: SB, ref: string): Promise<ViolationRow[]> {
  try {
    const rows = await fetchAllPaged<Partial<ViolationRow>>((from, to) =>
      admin.from('outside_mapping_notes').select(READ_COLUMNS[0]).eq('reporter_ref', ref).order('id').range(from, to));
    return readViolationsFromRows(rows);
  } catch (e) {
    const msg = e instanceof Error ? e.message : '';
    if (isColumnMissing(msg) || tableMissing({ message: msg })) return [];
    throw e;
  }
}

function readViolationsFromRows(raw: Partial<ViolationRow>[]): ViolationRow[] {
  return raw.map((r) => ({
    id: String(r.id ?? ''),
    period_id: String(r.period_id),
    target_id: String(r.target_id),
    aspect_id: r.aspect_id ?? null,
    category: typeof r.category === 'string' && r.category.trim() ? r.category.trim() : null,
    is_other: r.is_other === true,
    incident_date: r.incident_date ?? null,
    body: String(r.body ?? '').trim(),
    note: typeof r.note === 'string' && r.note.trim() ? r.note.trim() : null,
    status: asStatus(r.status),
    hrd_response: typeof r.hrd_response === 'string' && r.hrd_response.trim() ? r.hrd_response.trim() : null,
    responded_at: r.responded_at ?? null,
  }));
}

/** Pegawai terlapor satu laporan (untuk menolak HRD menindaklanjuti laporan tentang dirinya). Tak ada → null. */
export async function loadViolationTarget(admin: SB, id: string): Promise<string | null> {
  const { data } = await admin.from('outside_mapping_notes').select('target_id').eq('id', id).maybeSingle();
  return data?.target_id ? String(data.target_id) : null;
}

/**
 * Simpan tindak lanjut HRD (status + tanggapan untuk pelapor). Dipanggil Server Action SETELAH gerbang HRD
 * (bukan Direksi), dengan klien service_role. Hanya kolom tindak lanjut yang diubah — isian pelapor tak tersentuh.
 */
export async function saveViolationFollowUp(
  admin: SB, id: string, status: ViolationStatus, response: string | null,
): Promise<{ ok: true } | { ok: false; missing: boolean }> {
  const { data, error } = await admin.from('outside_mapping_notes')
    .update({ status, hrd_response: response, responded_at: new Date().toISOString() })
    .eq('id', id).select('id');
  if (error) return { ok: false, missing: isColumnMissing(error.message ?? '') || error.code === '42703' || error.code === 'PGRST204' };
  if (!data || data.length === 0) return { ok: false, missing: false };
  return { ok: true };
}
