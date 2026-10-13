/**
 * Format sederhana untuk Ringkasan Aspek / Kualitatif (keputusan pengguna 2026-10-13) — teks tetap
 * disimpan polos (final_reports.content), tampilan dirapikan saat dirender (SummaryText):
 *   - `**teks**`            → tebal
 *   - baris diawali `- ` / `• ` → poin (indentasi menggantung)
 *   - baris tanpa `- ` setelah poin → lanjutan poin itu (mis. judul poin tebal + penjelasan)
 *   - baris kosong          → akhir paragraf / akhir daftar poin
 * Teks lama tanpa tanda tampil seperti dulu (paragraf + pindah baris). Pengurai MURNI & tak pernah
 * menghasilkan HTML — dirender sebagai elemen React (aman dari injeksi).
 */

export type SummaryInline = { text: string; bold: boolean };
export type SummaryLine = SummaryInline[];
export type SummaryBlock =
  | { kind: 'p'; lines: SummaryLine[] }
  | { kind: 'ul'; items: SummaryLine[][] };

// `- ` atau `• ` (juga `* ` tunggal — bukan `**` pembuka tebal).
const BULLET = /^\s*(?:[-•–]|\*(?!\*))\s+/;

/** Pecah satu baris menjadi potongan biasa/tebal. `**` tanpa pasangan dibiarkan apa adanya. */
export function parseInline(line: string): SummaryLine {
  const out: SummaryLine = [];
  const re = /\*\*(.+?)\*\*/g;
  let last = 0;
  for (let m = re.exec(line); m; m = re.exec(line)) {
    if (m.index > last) out.push({ text: line.slice(last, m.index), bold: false });
    out.push({ text: m[1], bold: true });
    last = m.index + m[0].length;
  }
  if (last < line.length) out.push({ text: line.slice(last), bold: false });
  return out;
}

export function parseSummary(text: string): SummaryBlock[] {
  const blocks: SummaryBlock[] = [];
  let cur: SummaryBlock | null = null;
  for (const raw of text.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trimEnd();
    if (!line.trim()) { cur = null; continue; }
    if (BULLET.test(line)) {
      if (cur?.kind !== 'ul') { cur = { kind: 'ul', items: [] }; blocks.push(cur); }
      cur.items.push([parseInline(line.replace(BULLET, ''))]);
    } else if (cur?.kind === 'ul') {
      cur.items[cur.items.length - 1].push(parseInline(line.trim()));
    } else {
      if (!cur) { cur = { kind: 'p', lines: [] }; blocks.push(cur); }
      cur.lines.push(parseInline(line.trim()));
    }
  }
  return blocks;
}

/** Apakah teks memakai tanda format (untuk menampilkan pratinjau di editor). */
export function hasSummaryMarkup(text: string): boolean {
  return /\*\*.+?\*\*/.test(text) || text.split(/\r?\n/).some((l) => BULLET.test(l));
}
