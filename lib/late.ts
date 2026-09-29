/**
 * Logika murni KETERLAMBATAN penilaian 360° (migrasi 0036) — diuji `tests/late.test.ts`.
 *
 * Kebijakan (keputusan pengguna 2026-09-18, diperluas 2026-09-28):
 *  - Form tak ditutup otomatis; status On Time / Late = WAKTU KIRIM PERTAMA vs deadline periode.
 *  - Penilaian terlambat TETAP dihitung untuk yang dinilai (rumus skor tak disentuh).
 *  - Penilai dengan ≥1 kewajiban "belum selesai saat deadline" → potongan FLAT `LATE_PENALTY_360`
 *    pada Skor 360° miliknya sendiri (bukan per penilaian, bukan Skor Akhir). Tak punya Skor
 *    360° sendiri → diabaikan (pemanggil hanya menerapkan pada baris result_360 yang ada).
 *  - "Belum selesai saat deadline" mencakup DUA kondisi (2026-09-28 — sebelumnya hanya yang
 *    pertama, celah yang membuat "tidak pernah mengirim" lebih untung daripada telat mengirim):
 *      a) TERKIRIM tapi kirim PERTAMA-nya sesudah deadline (submitTimingOf = 'late'), ATAU
 *      b) BELUM terkirim sama sekali (draft/belum mulai) DAN deadline sudah lewat SAAT INI.
 *  - Yang DIHITUNG: penilaian WAJIB, dan (2026-09-29) penilaian OPSIONAL hasil PERMOHONAN pegawai
 *    yang disetujui HRD ("ajuan") — ia sendiri yang meminta menilai, jadi wajib menuntaskannya.
 *  - Yang TIDAK dihitung terlambat: Opsional biasa, Ad-Hoc Mandiri lama (is_adhoc), Paksa Selesai
 *    oleh HRD, dan pemetaan yang baru dibuat SESUDAH deadline (tak mungkin tepat waktu).
 *  - Potongan OTOMATIS −3; HRD dapat MENGUBAH nilainya per pegawai (alasan wajib), 0 = dikecualikan.
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
  /** assessment_status ('draft'|'submitted'), ATAU 'not_started' bila baris assessments
   *  belum pernah dibuat sama sekali (penilai belum menyentuh form ini). */
  status: string;
  forcedByHrd: boolean;
  mandatory: boolean;           // mappings.mandatory
  isAdhoc: boolean;             // mappings.is_adhoc (Ad-Hoc Mandiri lama — tak dihitung)
  /** Opsional hasil PERMOHONAN pegawai yang disetujui HRD ("ajuan") — ikut dihitung (2026-09-29). */
  requested?: boolean;
  mappingCreatedAt: string | null;
};

/**
 * Kewajiban ini "belum selesai saat deadline" DAN dihitung untuk potongan penilainya?
 * `nowMs` WAJIB diberikan eksplisit (bukan default Date.now()) — kondisi (b) di bawah
 * bergantung waktu SAAT DICEK, jadi hasilnya harus deterministik & bisa diuji, bukan diam-diam
 * berubah seiring jam berjalan di dalam fungsi murni ini.
 */
export function isPenalizableLate(a: LateCandidate, deadline: string | null | undefined, nowMs: number): boolean {
  if (a.isAdhoc || a.forcedByHrd) return false;
  if (!a.mandatory && !a.requested) return false; // Opsional biasa tak ditagih
  const d = ts(deadline);
  if (d == null) return false; // tanpa deadline → tak ada yang "terlambat"
  // Pemetaan dibuat sesudah deadline (koreksi/tambahan HRD) → tak mungkin tepat waktu, dikecualikan.
  const m = ts(a.mappingCreatedAt);
  if (m != null && m > d) return false;
  if (a.status === 'submitted') {
    return submitTimingOf(a.firstSubmittedAt, deadline) === 'late';
  }
  // draft / not_started: belum selesai — terhitung terlambat begitu deadline sudah lewat SAAT INI.
  return nowMs > d;
}

/**
 * Potongan untuk seorang penilai: OTOMATIS `LATE_PENALTY_360` bila ada ≥1 keterlambatan terhitung.
 * `override` = nilai yang DITETAPKAN HRD (late_penalty_waivers.points, 0 = dikecualikan) — bila ada,
 * menggantikan nilai otomatis (keputusan HRD 2026-09-29: "−3 otomatis, HRD tetap bisa mengedit").
 */
export function latePenaltyOf(lateCount: number, override: number | null = null): number {
  if (override != null) return override;
  return lateCount > 0 ? LATE_PENALTY_360 : 0;
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
