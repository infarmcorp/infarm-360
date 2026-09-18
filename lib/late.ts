/**
 * Logika murni KETERLAMBATAN penilaian 360° (migrasi 0036) — diuji `tests/late.test.ts`.
 *
 * Kebijakan (keputusan pengguna 2026-09-18):
 *  - Form tak ditutup otomatis; status On Time / Late = WAKTU KIRIM PERTAMA vs deadline periode.
 *  - Penilaian terlambat TETAP dihitung untuk yang dinilai (rumus skor tak disentuh).
 *  - Penilai dengan ≥1 penilaian terlambat yang DIHITUNG → potongan FLAT `LATE_PENALTY_360`
 *    pada Skor 360° miliknya sendiri (bukan per penilaian, bukan Skor Akhir). Tak punya Skor
 *    360° sendiri → diabaikan (pemanggil hanya menerapkan pada baris result_360 yang ada).
 *  - Yang TIDAK dihitung terlambat: penilaian Opsional/Ad-Hoc, Paksa Selesai oleh HRD, dan
 *    pemetaan yang baru dibuat SESUDAH deadline (tak mungkin tepat waktu).
 *  - HRD dapat memberi pengecualian per pegawai (waiver) → potongan 0.
 */

/** Besar potongan keterlambatan (poin, skala Skor 360° 0–100). */
export const LATE_PENALTY_360 = 3;

export type SubmitTiming = 'on_time' | 'late' | 'none';

const ts = (s: string | null | undefined): number | null => {
  if (!s) return null;
  const n = Date.parse(s);
  return Number.isFinite(n) ? n : null;
};

/**
 * On Time / Late satu penilaian berdasarkan waktu kirim pertama. 'none' = belum terkirim
 * atau periode tanpa deadline. Tepat PADA detik deadline masih dihitung tepat waktu.
 */
export function submitTimingOf(firstSubmittedAt: string | null | undefined, deadline: string | null | undefined): SubmitTiming {
  const s = ts(firstSubmittedAt), d = ts(deadline);
  if (s == null || d == null) return 'none';
  return s > d ? 'late' : 'on_time';
}

/** Deadline sudah lewat pada saat `now` (default sekarang)? Tanpa deadline → false. */
export function isPastDeadline(deadline: string | null | undefined, now: number = Date.now()): boolean {
  const d = ts(deadline);
  return d != null && now > d;
}

export type LateCandidate = {
  firstSubmittedAt: string | null;
  status: string;               // assessment_status
  forcedByHrd: boolean;
  mandatory: boolean;           // mappings.mandatory
  isAdhoc: boolean;             // mappings.is_adhoc
  mappingCreatedAt: string | null;
};

/** Penilaian ini terlambat DAN dihitung untuk potongan penilainya? */
export function isPenalizableLate(a: LateCandidate, deadline: string | null | undefined): boolean {
  if (a.status !== 'submitted') return false;
  if (!a.mandatory || a.isAdhoc || a.forcedByHrd) return false;
  if (submitTimingOf(a.firstSubmittedAt, deadline) !== 'late') return false;
  // Pemetaan dibuat sesudah deadline (koreksi/tambahan HRD) → tak mungkin tepat waktu.
  const m = ts(a.mappingCreatedAt), d = ts(deadline);
  if (m != null && d != null && m > d) return false;
  return true;
}

/** Potongan flat untuk seorang penilai: ada ≥1 keterlambatan terhitung & tak dikecualikan. */
export function latePenaltyOf(lateCount: number, waived: boolean): number {
  return lateCount > 0 && !waived ? LATE_PENALTY_360 : 0;
}

// ── Format waktu WIB (UTC+7, tanpa DST) — independen dari zona waktu server/Vercel (UTC). ──
const WIB_MS = 7 * 3600 * 1000;
const MONTHS_ID = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const pad = (n: number) => String(n).padStart(2, '0');
const wibParts = (iso: string) => {
  const d = new Date(Date.parse(iso) + WIB_MS);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate(), h: d.getUTCHours(), i: d.getUTCMinutes() };
};

/** '2026-09-30T10:00:00Z' → '30 Sep 2026, 17:00 WIB'. null/tak valid → '—'. */
export function formatWib(iso: string | null | undefined): string {
  if (ts(iso) == null) return '—';
  const p = wibParts(iso!);
  return `${p.d} ${MONTHS_ID[p.m]} ${p.y}, ${pad(p.h)}:${pad(p.i)} WIB`;
}

/** ISO → nilai `<input type="datetime-local">` dalam WIB ('YYYY-MM-DDTHH:mm'). */
export function toWibInput(iso: string | null | undefined): string {
  if (ts(iso) == null) return '';
  const p = wibParts(iso!);
  return `${p.y}-${pad(p.m + 1)}-${pad(p.d)}T${pad(p.h)}:${pad(p.i)}`;
}

/** Skor 360° resmi = skor mentah − potongan, lantai 0, 2 desimal. null tetap null. */
export function apply360Penalty(raw: number | null, penalty: number): number | null {
  if (raw == null) return null;
  return Math.round(Math.max(0, raw - penalty) * 100) / 100;
}
