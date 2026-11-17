/**
 * PDF PEGAWAI (format "Laporan Performance Appraisal") — helper murni untuk halaman cetak
 * `/laporan/[employeeId]/pdf-pegawai` (HRD Mode Admin). Mengikuti templat paket PDF HRD Q3 2026.
 * Tanpa komentar mentah & tanpa nama penilai: hanya skor + ringkasan HRD.
 *
 * Pengaturan per periode (migrasi 0063, `periods.pa_pdf`): tanggal laporan + tenggat 4 langkah
 * tindak lanjut. Bila belum diisi HRD → bawaan dihitung dari tanggal akhir periode (pola Q3 2026:
 * laporan +12 hari, pelajari +16..+20, sesi +21..+27, dua mingguan mulai +41, bulanan bulan ke-2..3).
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

export type PaPdfSettings = { reportDate: string; tenggat: [string, string, string, string] };

export const PaPdfSettingsSchema = z.object({
  reportDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Tanggal laporan tidak valid'),
  tenggat: z.array(z.string().trim().min(1, 'Tenggat wajib diisi').max(80, 'Tenggat maksimal 80 karakter')).length(4),
});

/** Bawaan dari tanggal akhir periode (pola templat Q3 2026). */
export function defaultPaPdfSettings(periodEndIso: string): PaPdfSettings {
  const end = parseIso(periodEndIso);
  const m2 = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 2, 1));
  const m3 = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 3, 1));
  const monthly = m2.getUTCFullYear() === m3.getUTCFullYear()
    ? `${MONTHS[m2.getUTCMonth()]} sampai ${MONTHS[m3.getUTCMonth()]} ${m3.getUTCFullYear()}`
    : `${MONTHS[m2.getUTCMonth()]} ${m2.getUTCFullYear()} sampai ${MONTHS[m3.getUTCMonth()]} ${m3.getUTCFullYear()}`;
  return {
    reportDate: toIso(addDays(end, 12)),
    tenggat: [
      fmtRangeId(addDays(end, 16), addDays(end, 20)),
      fmtRangeId(addDays(end, 21), addDays(end, 27)),
      `Mulai ${fmtDateId(toIso(addDays(end, 41)))}, setiap dua minggu`,
      monthly,
    ],
  };
}

/** Isi tersimpan (bila valid) atau bawaan. Data rusak/kosong tak pernah menggagalkan halaman. */
export function resolvePaPdfSettings(stored: unknown, periodEndIso: string): { settings: PaPdfSettings; isDefault: boolean } {
  const p = PaPdfSettingsSchema.safeParse(stored);
  if (p.success) return { settings: { reportDate: p.data.reportDate, tenggat: p.data.tenggat as PaPdfSettings['tenggat'] }, isDefault: false };
  return { settings: defaultPaPdfSettings(periodEndIso), isDefault: true };
}

/** Baris tetap tabel "Tindak Lanjut" (templat HRD); tenggat diambil dari pengaturan periode. */
export function followUpRows(nextLabel: string, tenggat: readonly string[], sec: { plan: number; comment: number } = { plan: 5, comment: 7 }) {
  return [
    { aksi: 'Pelajari laporan ini', target: 'Memahami hasil penilaian serta mencatat pertanyaan dan ide perbaikan', pendamping: 'Mandiri (Tim HRD bila ada pertanyaan)', selesai: 'Catatan siap dibawa ke sesi empat mata' },
    { aksi: `Sesi empat mata, lalu isi bagian ${sec.plan} bersama atasan`, target: `Prioritas dan rencana pengembangan ${nextLabel} disepakati`, pendamping: 'Atasan langsung', selesai: `Bagian ${sec.plan} dan ${sec.comment} terisi, laporan ditandatangani kedua pihak` },
    { aksi: 'Tinjauan kemajuan dua mingguan', target: 'Kemajuan rencana aksi terpantau dan hasil IDP diserahkan ke Tim HRD', pendamping: 'Atasan langsung', selesai: 'Catatan kemajuan setiap sesi' },
    { aksi: 'Tinjauan bulanan dengan HRD', target: 'Dukungan pengembangan dari HR', pendamping: 'Tim HRD', selesai: 'Rekap perkembangan bulanan' },
  ].map((r, i) => ({ no: i + 1, ...r, tenggat: tenggat[i] ?? '' }));
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

// ── CSS @page (kepala & kaki halaman cetak) ────────────────────────────────────────────────────────

/** String CSS aman untuk `content:` — kutip/backslash di-escape, baris baru dibuang, `<` di-escape (tak bisa menutup <style>). */
export function cssString(s: string): string {
  return '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[\r\n]+/g, ' ').replace(/</g, '\\3c ') + '"';
}

/** Aturan @page: A4, kaki halaman bernomor di semua halaman, kepala berjalan mulai halaman 2. */
export function pageCss(runningTitle: string, employeeName: string): string {
  const box = 'font-family: Arial, Helvetica, sans-serif; font-size: 7.5pt; color: #6b7280;';
  return `@media print {
  @page {
    size: A4;
    margin: 16mm 14mm 15mm 14mm;
    @top-left { content: ${cssString(runningTitle)}; ${box} font-weight: 700; color: #006B31; }
    @top-right { content: ${cssString(employeeName)}; ${box} }
    @bottom-left { content: ${cssString(`KONFIDENSIAL · ${CONFIDENTIAL_NOTE} · ${COMPANY_NAME}`)}; ${box} }
    @bottom-right { content: "Halaman " counter(page) " dari " counter(pages); ${box} }
  }
  @page :first {
    @top-left { content: none; }
    @top-right { content: none; }
  }
}`;
}
