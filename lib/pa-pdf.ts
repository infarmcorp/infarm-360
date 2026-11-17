/**
 * PDF PEGAWAI (format "Laporan Performance Appraisal", mengikuti paket templat PDF HRD Q3 2026) — helper murni.
 * PDF dibuat di server (lib/pdf/pa-report.tsx, route .../pdf-pegawai/unduh), HRD Mode Admin saja.
 * Tanpa komentar mentah & tanpa nama penilai: hanya skor + ringkasan HRD.
 *
 * Pengaturan per periode (migrasi 0063, periods.pa_pdf): tanggal laporan + baris tabel tindak lanjut.
 * Bila belum diisi HRD, bawaan dihitung dari tanggal akhir periode (pola Q3 2026: laporan +12 hari,
 * pelajari +16..+20, sesi +21..+27, dua mingguan mulai +41, bulanan bulan ke-2..3).
 */
import { z } from 'zod';

export const COMPANY_NAME = 'CV Wira Jaya Nusantara (Infarm)';
export const CONFIDENTIAL_NOTE = 'Hanya untuk pegawai dan atasan langsung';

/** Kunci isian tambahan HRD di final_reports.content.pdfNotes (dipakai editor & halaman PDF). */
export const NOTE_CONCLUSION = 'Kesimpulan';
export const NOTE_OTHER = 'Masukan Lain dari Penilai';
export const PDF_NOTE_KEYS = [NOTE_CONCLUSION, NOTE_OTHER] as const;

const MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

const parseIso = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);
const toIso = (d: Date) => d.toISOString().slice(0, 10);

/** "12 Oktober 2026". */
export function fmtDateId(iso: string): string {
  const d = parseIso(iso);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** Rentang tanggal: "16—20 Oktober 2026" · "29 Oktober — 2 November 2026" · lintas tahun lengkap. */
export function fmtRangeId(a: Date, b: Date): string {
  const sameYear = a.getUTCFullYear() === b.getUTCFullYear();
  if (sameYear && a.getUTCMonth() === b.getUTCMonth()) {
    return `${a.getUTCDate()}—${b.getUTCDate()} ${MONTHS[b.getUTCMonth()]} ${b.getUTCFullYear()}`;
  }
  const left = sameYear ? `${a.getUTCDate()} ${MONTHS[a.getUTCMonth()]}` : fmtDateId(toIso(a));
  return `${left} — ${fmtDateId(toIso(b))}`;
}

/** "Juli—September 2026" (lintas tahun: "November 2026—Januari 2027"). */
export function periodMonthsText(startIso: string, endIso: string): string {
  const a = parseIso(startIso), b = parseIso(endIso);
  if (a.getUTCFullYear() === b.getUTCFullYear()) {
    return a.getUTCMonth() === b.getUTCMonth()
      ? `${MONTHS[a.getUTCMonth()]} ${a.getUTCFullYear()}`
      : `${MONTHS[a.getUTCMonth()]}—${MONTHS[b.getUTCMonth()]} ${b.getUTCFullYear()}`;
  }
  return `${MONTHS[a.getUTCMonth()]} ${a.getUTCFullYear()}—${MONTHS[b.getUTCMonth()]} ${b.getUTCFullYear()}`;
}

/** Label periode berikutnya ("Q3 2026" → "Q4 2026", "Q4 2026" → "Q1 2027"); label bebas → "Periode Berikutnya". */
export function nextPeriodLabel(label: string): string {
  const m = /^Q([1-4])\s+(\d{4})$/i.exec(label.trim());
  if (!m) return 'Periode Berikutnya';
  const q = Number(m[1]), y = Number(m[2]);
  return q === 4 ? `Q1 ${y + 1}` : `Q${q + 1} ${y}`;
}

/** Metode penilaian sesuai komponen yang ada. */
export function methodText(hasKpi: boolean, has360: boolean): string {
  if (hasKpi && has360) return 'KPI dan Umpan Balik 360°';
  if (has360) return 'Umpan Balik 360°';
  return 'KPI';
}

// ── Pengaturan per periode ────────────────────────────────────────────────────────────────────────

export type FollowRow = { aksi: string; target: string; tenggat: string; pendamping: string; selesai: string };
export type PaPdfSettings = { reportDate: string; rows: FollowRow[] };
export const FOLLOW_MAX_ROWS = 8;

const cell = (max: number) => z.string().trim().max(max, `Maksimal ${max} karakter`);
export const FollowRowSchema = z.object({
  aksi: cell(120).min(1, 'Kolom Aksi wajib diisi'),
  target: cell(200),
  tenggat: cell(120),
  pendamping: cell(120),
  selesai: cell(200),
});
export const PaPdfSettingsSchema = z.object({
  reportDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Tanggal laporan tidak valid'),
  rows: z.array(FollowRowSchema).min(1, 'Minimal satu baris tindak lanjut').max(FOLLOW_MAX_ROWS, `Maksimal ${FOLLOW_MAX_ROWS} baris`),
});

/** Nomor bagian dokumen yang dirujuk teks tindak lanjut bawaan ("isi bagian 5", "bagian 5 dan 7"). */
export type SectionRefs = { plan: number; comment: number };

/** Baris tindak lanjut bawaan (templat HRD Q3 2026) dengan tenggat dari tanggal akhir periode. */
export function defaultFollowRows(periodEndIso: string, nextLabel: string, sec: SectionRefs = { plan: 5, comment: 7 }): FollowRow[] {
  const end = parseIso(periodEndIso);
  const m2 = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 2, 1));
  const m3 = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 3, 1));
  const monthly = m2.getUTCFullYear() === m3.getUTCFullYear()
    ? `${MONTHS[m2.getUTCMonth()]} sampai ${MONTHS[m3.getUTCMonth()]} ${m3.getUTCFullYear()}`
    : `${MONTHS[m2.getUTCMonth()]} ${m2.getUTCFullYear()} sampai ${MONTHS[m3.getUTCMonth()]} ${m3.getUTCFullYear()}`;
  return [
    { aksi: 'Pelajari laporan ini', target: 'Memahami hasil penilaian serta mencatat pertanyaan dan ide perbaikan', tenggat: fmtRangeId(addDays(end, 16), addDays(end, 20)), pendamping: 'Mandiri (Tim HRD bila ada pertanyaan)', selesai: 'Catatan siap dibawa ke sesi empat mata' },
    { aksi: `Sesi empat mata, lalu isi bagian ${sec.plan} bersama atasan`, target: `Prioritas dan rencana pengembangan ${nextLabel} disepakati`, tenggat: fmtRangeId(addDays(end, 21), addDays(end, 27)), pendamping: 'Atasan langsung', selesai: `Bagian ${sec.plan} dan ${sec.comment} terisi, laporan ditandatangani kedua pihak` },
    { aksi: 'Tinjauan kemajuan dua mingguan', target: 'Kemajuan rencana aksi terpantau dan hasil IDP diserahkan ke Tim HRD', tenggat: `Mulai ${fmtDateId(toIso(addDays(end, 41)))}, setiap dua minggu`, pendamping: 'Atasan langsung', selesai: 'Catatan kemajuan setiap sesi' },
    { aksi: 'Tinjauan bulanan dengan HRD', target: 'Dukungan pengembangan dari HR', tenggat: monthly, pendamping: 'Tim HRD', selesai: 'Rekap perkembangan bulanan' },
  ];
}

/** Pengaturan bawaan dari tanggal akhir periode (tanggal laporan = akhir periode + 12 hari). */
export function defaultPaPdfSettings(periodEndIso: string, nextLabel: string, sec?: SectionRefs): PaPdfSettings {
  return { reportDate: toIso(addDays(parseIso(periodEndIso), 12)), rows: defaultFollowRows(periodEndIso, nextLabel, sec) };
}

/** Isi tersimpan (bila valid) atau bawaan. Data rusak/kosong tak pernah menggagalkan PDF. */
export function resolvePaPdfSettings(
  stored: unknown, periodEndIso: string, nextLabel: string, sec?: SectionRefs,
): { settings: PaPdfSettings; isDefault: boolean } {
  const p = PaPdfSettingsSchema.safeParse(stored);
  if (p.success) return { settings: p.data, isDefault: false };
  return { settings: defaultPaPdfSettings(periodEndIso, nextLabel, sec), isDefault: true };
}

/** Nama berkas seperti paket HRD: "Divisi - Nama - Q3 2026.pdf" (karakter terlarang di nama berkas dibuang). */
export function pdfFileName(dept: string | null, name: string, periodLabel: string): string {
  const clean = (s: string) => s.replace(/[\\/:*?"<>|\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
  return `${[dept, name, periodLabel].filter(Boolean).map((x) => clean(x as string)).join(' - ')}.pdf`;
}

// ── Ringkasan kualitatif → kolom Kekuatan Utama / Perlu Dikembangkan ───────────────────────────────

/**
 * Petakan pertanyaan esai periode ke dua kolom templat menurut kata kunci. Pertanyaan yang tak cocok
 * (atau tambahan) ditampilkan terpisah dengan teks pertanyaannya sebagai judul.
 */
export function classifyQualQuestions(questions: readonly string[]): { strength: string | null; growth: string | null; others: string[] } {
  const strength = questions.find((q) => /kekuatan/i.test(q)) ?? null;
  const growth = questions.find((q) => q !== strength && /kembang|perbaik|tingkatkan/i.test(q)) ?? null;
  return { strength, growth, others: questions.filter((q) => q !== strength && q !== growth) };
}

/** Nomor bagian dokumen: periode tanpa 360° tak punya bagian umpan balik (2–4), nomor sesudahnya maju. */
export function sectionNumbers(has360: boolean) {
  let n = 0;
  return {
    score: ++n,
    qual: has360 ? ++n : 0,
    aspects: has360 ? ++n : 0,
    narr: has360 ? ++n : 0,
    plan: ++n,
    follow: ++n,
    comment: ++n,
    sign: ++n,
  };
}
