/**
 * Impor Ringkasan Naratif (Aspek 360° & Pertanyaan Kualitatif) dari Excel — logika MURNI (tanpa
 * React/DOM/xlsx), diuji di tests/import-summaries.test.ts. Format = lembar "Ringkasan Naratif" hasil
 * Ekspor (kolom periode · kode · nama · divisi · status_laporan · jenis · aspek_atau_pertanyaan ·
 * ringkasan) agar HRD bisa unduh → sunting di Excel → unggah lagi.
 *
 * Aturan (keputusan pengguna 2026-10-13):
 *  - TIMPA per (pegawai × jenis): bila file memuat ≥1 ringkasan berisi untuk pasangan itu, seluruh
 *    ringkasan jenis tsb diganti isi file — item yang tak tercantum di file TERHAPUS.
 *  - SEL KOSONG dilewati: item tercantum dgn ringkasan kosong TIDAK menghapus isi lama (server
 *    mempertahankan nilai lamanya — dikirim sebagai `null`).
 *  - Satu baris bermasalah (item tak dikenal, terlalu panjang, duplikat) MEMBLOKIR seluruh grup
 *    (pegawai × jenis) — kalau tidak, salah ketik nama aspek akan diam-diam menghapus ringkasan
 *    aspek yang benar.
 */
import { pickField } from './parse';

export const SUMMARY_SHEET = 'Ringkasan Naratif';
export const SUMMARY_MAX_LEN = 2000; // selaras SummariesInput di admin/laporan/actions.ts

export type SummaryKind = 'aspect' | 'qual';
export const SUMMARY_KIND_LABEL: Record<SummaryKind, string> = { aspect: 'Aspek', qual: 'Pertanyaan Kualitatif' };

export type SummaryEmp = {
  id: string; code: string; name: string;
  /** Status laporan periode aktif (null = belum ada laporan). */
  status: string | null;
};

export type SummaryContext = {
  employees: SummaryEmp[];
  aspects: string[];       // nama aspek periode aktif (kunci aspectSummaries)
  questions: string[];     // teks pertanyaan kualitatif periode aktif (kunci qualSummaries)
  periodLabel: string;
  /** Id pengimpor bila ia pemegang grant (tak boleh meringkas laporannya sendiri); null untuk HRD penuh. */
  selfId: string | null;
};

export type SummaryRowStatus = 'ok' | 'empty' | 'skip' | 'invalid' | 'blocked';
export type SummaryRow = {
  line: number;            // nomor baris Excel (header = baris 1)
  code: string;
  emp: SummaryEmp | null;
  kind: SummaryKind | null;
  item: string;            // kunci kanonik (nama aspek / teks pertanyaan) bila cocok; teks mentah bila tidak
  text: string;
  status: SummaryRowStatus;
  reason: string;
};

const CODE_KEYS = ['kode', 'emp_code', 'kode pegawai', 'kode_pegawai'];
const KIND_KEYS = ['jenis'];
const ITEM_KEYS = ['aspek_atau_pertanyaan', 'aspek atau pertanyaan', 'aspek/pertanyaan', 'item'];
const TEXT_KEYS = ['ringkasan', 'rangkuman'];
const PERIOD_KEYS = ['periode'];

/** Normalisasi untuk pencocokan: huruf kecil + spasi dirapatkan. */
const norm = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();

export function normKind(s: string): SummaryKind | null {
  const v = norm(s);
  if (v === 'aspek' || v === 'aspek 360' || v === 'aspek 360°') return 'aspect';
  if (v === 'pertanyaan kualitatif' || v === 'kualitatif' || v === 'pertanyaan' || v === 'esai') return 'qual';
  return null;
}

/**
 * Parse + klasifikasi baris impor ringkasan. Baris tanpa kode, jenis, item & ringkasan (baris kosong)
 * dibuang. Urutan status per baris: invalid (data salah) → skip (sengaja dilewati: periode lain /
 * Final / laporan sendiri) → empty (ringkasan kosong) → ok; lalu grup yang memuat baris invalid
 * di-`blocked`.
 */
export function classifySummaryRows(raw: Record<string, unknown>[], ctx: SummaryContext): SummaryRow[] {
  const byCode = new Map(ctx.employees.map((e) => [e.code.toUpperCase(), e]));
  const aspectBy = new Map(ctx.aspects.map((a) => [norm(a), a]));
  const qualBy = new Map(ctx.questions.map((q) => [norm(q), q]));
  const seen = new Map<string, number>(); // `${empId}|${kind}|${item}` → baris pertama

  const rows: SummaryRow[] = [];
  raw.forEach((r, i) => {
    const code = pickField(r, CODE_KEYS).toUpperCase();
    const kindRaw = pickField(r, KIND_KEYS);
    const itemRaw = pickField(r, ITEM_KEYS);
    const text = pickField(r, TEXT_KEYS);
    const period = pickField(r, PERIOD_KEYS);
    if (!code && !kindRaw && !itemRaw && !text) return;

    const line = i + 2;
    const emp = code ? byCode.get(code) ?? null : null;
    const kind = normKind(kindRaw);
    const canon = kind === 'aspect' ? aspectBy.get(norm(itemRaw)) : kind === 'qual' ? qualBy.get(norm(itemRaw)) : undefined;
    const row: SummaryRow = { line, code, emp, kind, item: canon ?? itemRaw, text, status: 'ok', reason: '' };
    const set = (status: SummaryRowStatus, reason: string) => { row.status = status; row.reason = reason; };

    if (!code) set('invalid', 'Kode pegawai kosong');
    else if (!emp) set('invalid', `Kode "${code}" tak dikenal atau di luar lingkup Anda`);
    else if (!kind) set('invalid', `Jenis "${kindRaw || '?'}" tak valid (Aspek / Pertanyaan Kualitatif)`);
    else if (!itemRaw) set('invalid', `Nama ${kind === 'aspect' ? 'aspek' : 'pertanyaan'} kosong`);
    else if (!canon) set('invalid', `${kind === 'aspect' ? 'Aspek' : 'Pertanyaan'} tidak ada di periode ${ctx.periodLabel}`);
    else if (text.length > SUMMARY_MAX_LEN) set('invalid', `Ringkasan ${text.length} karakter (maks ${SUMMARY_MAX_LEN})`);
    else if (period && norm(period) !== norm(ctx.periodLabel)) set('skip', `Periode "${period}" bukan periode aktif`);
    else if (emp.status === 'finalized') set('skip', 'Laporan sudah Final — Buka Kembali (ke Draf) dulu');
    else if (ctx.selfId && emp.id === ctx.selfId) set('skip', 'Tidak dapat meringkas laporan Anda sendiri');
    else {
      const key = `${emp.id}|${kind}|${canon}`;
      if (seen.has(key)) set('invalid', `Duplikat — item sama dengan baris ${seen.get(key)}`);
      else {
        seen.set(key, line);
        if (!text) set('empty', 'Ringkasan kosong — isi lama dipertahankan');
      }
    }
    rows.push(row);
  });

  // Blokir grup (pegawai × jenis) yang memuat baris invalid — lihat catatan di atas.
  const badGroups = new Map<string, number>();
  for (const r of rows) {
    if (r.status === 'invalid' && r.emp && r.kind) badGroups.set(`${r.emp.id}|${r.kind}`, r.line);
  }
  for (const r of rows) {
    if ((r.status === 'ok' || r.status === 'empty') && r.emp && r.kind) {
      const bad = badGroups.get(`${r.emp.id}|${r.kind}`);
      if (bad != null) { r.status = 'blocked'; r.reason = `Tidak diimpor — ada masalah di baris ${bad} untuk pegawai & jenis yang sama`; }
    }
  }
  return rows;
}

/** Payload per pegawai: kunci → teks baru, atau `null` = sel kosong (pertahankan isi lama). */
export type SummaryImportItem = {
  employeeId: string;
  aspect?: Record<string, string | null>;
  qual?: Record<string, string | null>;
};

/**
 * Kelompokkan baris 'ok'/'empty' menjadi payload server. Grup (pegawai × jenis) hanya dikirim bila
 * memuat ≥1 ringkasan berisi — grup yang semuanya kosong tak menimpa apa pun.
 */
export function buildSummaryPayload(rows: SummaryRow[]): SummaryImportItem[] {
  const by = new Map<string, SummaryImportItem>();
  const hasText = new Set<string>();
  for (const r of rows) {
    if ((r.status !== 'ok' && r.status !== 'empty') || !r.emp || !r.kind) continue;
    const it = by.get(r.emp.id) ?? { employeeId: r.emp.id };
    const map = (it[r.kind] ??= {});
    map[r.item] = r.status === 'ok' ? r.text : null;
    if (r.status === 'ok') hasText.add(`${r.emp.id}|${r.kind}`);
    by.set(r.emp.id, it);
  }
  const out: SummaryImportItem[] = [];
  for (const it of by.values()) {
    if (!hasText.has(`${it.employeeId}|aspect`)) delete it.aspect;
    if (!hasText.has(`${it.employeeId}|qual`)) delete it.qual;
    if (it.aspect || it.qual) out.push(it);
  }
  return out;
}

/**
 * Terapkan TIMPA + sel-kosong-dilewati ke isi lama: hasil = item berisi dari file + isi lama untuk
 * item yang selnya kosong. Item yang tak tercantum di file terhapus.
 */
export function mergeSummaryOverwrite(
  existing: Record<string, string> | undefined,
  incoming: Record<string, string | null>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(incoming)) {
    const val = v != null ? v.trim() : (existing?.[k] ?? '').trim();
    if (val) out[k] = val;
  }
  return out;
}
