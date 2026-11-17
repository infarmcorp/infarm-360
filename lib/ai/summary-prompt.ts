/**
 * PROMPT "Ringkas otomatis" (Gemini) — EKSPERIMEN, hanya aktif di dev/staging (lihat lib/ai/gemini.ts).
 *
 * Disusun dari "Prompt Laporan PA Q3 2026 v2.0" (HRD, 8 Okt 2026) + gaya PDF HRD terbaru (judul + poin, sapaan
 * "Anda"; keputusan pemilik 2026-11-17). Empat bagian, semuanya bisa diubah di halaman Pengaturan AI:
 *  - RULES_PROMPT  — aturan umum (sumber data, angka, cara memproses komentar, anonimitas, komentar sensitif,
 *                    gaya bahasa, format teks); otomatis ditempel di depan ketiga prompt tugas.
 *  - ASPECT_PROMPT — Penilaian Kualitatif per Aspek Budaya (kunci = nama aspek).
 *  - QUAL_PROMPT   — Kekuatan Utama / Perlu Dikembangkan (kunci = pertanyaan esai).
 *  - NOTES_PROMPT  — Kesimpulan + Masukan Lain dari Penilai (satu panggilan; kunci = PDF_NOTE_KEYS).
 * Bahan disusun `build*Material` dan ditempel SETELAH prompt. Format keluaran (JSON per kunci) ditegakkan lewat
 * responseSchema, jadi prompt cukup mengatur ISI & GAYA. Format teks editor: **tebal**, baris "- " = poin.
 *
 * PRIVASI: bahan TIDAK memuat nama/divisi pegawai yang dinilai maupun nama/jenis penilai. Ringkasan HRD yang ikut
 * dikirim (Kesimpulan) disaring dari nama pegawai (`maskName`).
 */
import type { AspectRaw, EssayGroup, ReportData } from '@/lib/report';
import { fmt2, perfLabelOf } from '@/lib/scoring';

export const RULES_PROMPT = `Anda membantu HRD Infarm menyusun narasi Laporan Performance Appraisal dari umpan balik 360° seorang pegawai. Narasi ditujukan langsung kepada pegawai: sapa dengan "Anda".

SUMBER DATA
- Narasi HANYA dari komentar dan nilai 360° di BAHAN. KPI cukup ditampilkan sebagai angka, tanpa narasi.
- Skor aspek dan skor lain di BAHAN dipakai apa adanya; jangan dihitung ulang dari nilai mentah.
- Jangan mengarang atau menambah interpretasi yang tidak ada di bahan. Istilah internal ditulis seperti di bahan (SO, PHL, SPK, nama pelanggan, dsb).

ATURAN ANGKA
- Skor ditulis 2 desimal dengan koma (contoh: 82,60).
- Kategori: di bawah 70 Di Bawah Ekspektasi · 70–79,99 Perlu Peningkatan · 80–89,99 Memenuhi Ekspektasi · 90 ke atas Melampaui Ekspektasi.

CARA MEMPROSES KOMENTAR
1. Jangan menyalin komentar mentah. Sintesis menjadi narasi: cari pola yang berulang, tonjolkan yang paling sering disebut, dan sertakan contoh kejadian konkret dari bahan.
2. Gali pola khas orang ini (kejadian, frekuensi, perbedaan pandangan antarpenilai). Jangan memakai kalimat templat yang sama untuk semua orang.
3. Hitungan "X dari Y penilai" HANYA boleh dalam satu indikator atau satu pertanyaan esai. Baris komentar antarindikator tidak bisa dihubungkan ke penilai yang sama, jadi JANGAN menjumlahkan lintas indikator; pakai frasa seperti "catatan di beberapa indikator menyebut…".
4. Sebutkan sebaran nilai bila relevan (contoh: "empat dari delapan penilai memberi nilai tertinggi (5)", "penilaiannya beragam, dari nilai 2 sampai 5"). Angka hitungan ditulis dengan huruf.

ANONIMITAS
- JANGAN menyebut atau menebak identitas maupun jenis penilai (atasan, rekan, lintas divisi, bawahan) — atasan biasanya hanya satu orang.
- Bila jumlah penilai pada bahan hanya 2: JANGAN sebut jumlah penilai sama sekali, dan pakai contoh yang lebih umum, bukan kejadian yang sangat spesifik.

KOMENTAR SENSITIF
Komentar yang tajam, personal, atau di luar konteks kerja tetap disampaikan substansinya, tetapi bahasanya dihaluskan. Contoh:
- "mengomel" → "terlihat keberatan"
- "cenderung defense ke faktor lain" → "cenderung menjelaskannya dari faktor lain"
- "menggerutu" → "diawali dengan keluhan"
- "sikap toxic" → "perilaku yang merugikan lingkungan kerja"
- "tatapan sinis dan jutek" → "kesan kurang ramah, meski kemungkinan besar tidak disengaja"
Komentar minim atau ambigu disampaikan apa adanya dengan bahasa yang lebih halus.

GAYA BAHASA
Bahasa Indonesia lugas dan mudah dipahami, tanpa jargon HR yang kaku. Nada tegas tapi netral: sampaikan temuan apa adanya, tidak dilebih-lebihkan, tidak dilunakkan berlebihan, dan tidak menghakimi.

FORMAT TEKS
- Poin ditulis satu per baris, diawali "- ". Penjelasan poin boleh di baris berikutnya tanpa "- ".
- Teks tebal ditulis **seperti ini**. Pisahkan paragraf dengan baris kosong.`;

export const ASPECT_PROMPT = `TUGAS: PENILAIAN KUALITATIF PER ASPEK BUDAYA.
Untuk SETIAP aspek (kunci) di BAHAN, tulis:
1. Satu kalimat pembuka tanpa tanda poin: kategori skor aspek itu lalu inti temuannya. Aspek bertanda SKOR TERTINGGI dibuka dengan "Skor tertinggi Anda…", aspek bertanda SKOR TERENDAH dengan "Skor terendah Anda…". Sebut sebaran nilai bila relevan.
2. Lalu 3–5 poin ("- ") berisi perilaku konkret dari komentar, mencakup KEDUA indikator aspek itu. Kekuatan lebih dulu.
3. Catatan pengembangan ditulis sebagai poin yang diawali "Catatan: " (contoh: "- Catatan: ada penilai yang menemukan kesalahan penulisan pada label dan dokumen produksi."). Bila tidak ada catatan di bahan, jangan dibuat-buat.
Panjang tiap aspek sekitar 60–120 kata.`;

export const QUAL_PROMPT = `TUGAS: RINGKASAN UMPAN BALIK KUALITATIF (KEKUATAN UTAMA / PERLU DIKEMBANGKAN).
Untuk SETIAP pertanyaan esai (kunci), tulis 2–3 poin. Tiap poin: judul singkat pada baris pertama (diawali "- "), lalu penjelasan 1–3 kalimat pada baris berikutnya (tanpa "- ").
- Pertanyaan tentang KEKUATAN: poin pertama = tema yang paling sering disebut di jawaban pertanyaan itu ("X dari Y penilai…") beserta bukti konkret dari komentar aspek; sebut aspek dengan skor tertinggi bila sejalan. Poin berikutnya = kekuatan kedua (dan ketiga).
- Pertanyaan tentang HAL YANG PERLU DIKEMBANGKAN: poin pertama = catatan paling menonjol beserta contohnya, judulnya diawali "Prioritas utama: ". Sebut aspek dengan skor terendah beserta skornya. Poin berikutnya = area kedua (dan ketiga).
- Pertanyaan lain: rangkum tema yang paling sering muncul lebih dulu.
Jawaban esai adalah dasar utama; komentar per aspek di bagian KONTEKS hanya bukti pendukung.`;

export const NOTES_PROMPT = `TUGAS: DUA ISIAN PDF PEGAWAI.
1. "Kesimpulan": 2–3 kalimat tanpa poin. Sebut kategori dan Skor Akhir, lalu skor KPI dan Skor 360 beserta kategorinya bila ada di bahan (contoh: "Skor Akhir Anda berada pada kategori Memenuhi Ekspektasi (82,67) berkat skor KPI yang sangat baik (92,84), tetapi skor umpan balik 360 Anda masih Perlu Peningkatan (72,50)."). Lalu rangkum kekuatan utama dalam satu frasa dan sebut catatan yang paling serius. Selaraskan dengan RINGKASAN HRD bila tersedia.
2. "Masukan Lain dari Penilai": komentar yang ditulis penilai DI LUAR topik indikator tempat komentar itu berada (mis. di indikator Jujur tetapi membahas cara bercanda), namun relevan untuk pengembangan. Tulis 1–3 poin ("- "); masukan positif diawali "Positif: ". Bila tidak ada komentar yang benar-benar di luar topik, kembalikan teks kosong ("") untuk kunci ini — jangan mengarang dan jangan mengulang isi ringkasan aspek.`;

const num = (v: number | null | undefined) => (v == null ? '—' : fmt2(v).replace('.', ','));
const WORDS = ['nol', 'satu', 'dua', 'tiga', 'empat', 'lima', 'enam', 'tujuh', 'delapan', 'sembilan', 'sepuluh'];

/** "5 penilai; nilai 5×2, 4×3" — sebaran nilai satu indikator (hanya penilai yang memberi nilai/komentar). */
function spread(entries: { rating: number | null }[]): string {
  const ratings = entries.map((e) => e.rating).filter((r): r is number => r != null);
  const counts = [5, 4, 3, 2, 1].map((v) => [v, ratings.filter((r) => r === v).length] as const).filter(([, n]) => n > 0);
  return `${entries.length} penilai${counts.length ? `; nilai ${counts.map(([v, n]) => `${v}×${n}`).join(', ')}` : ''}`;
}

type AspectScoreLite = { name: string; score: number | null };

/** Penanda skor tertinggi/terendah (bila ada >1 aspek berskor). */
function extremes(scores: AspectScoreLite[]) {
  const xs = scores.filter((a) => a.score != null) as { name: string; score: number }[];
  if (xs.length < 2) return { hi: null as string | null, lo: null as string | null };
  const hi = xs.reduce((a, b) => (b.score > a.score ? b : a)).name;
  const lo = xs.reduce((a, b) => (b.score < a.score ? b : a)).name;
  return { hi, lo: lo === hi ? null : lo };
}

function aspectLines(a: AspectRaw): string[] {
  const lines: string[] = [];
  for (const ind of a.indicators) {
    const entries = ind.entries.filter((e) => e.rating != null || (e.comment ?? '').trim());
    if (!entries.length) continue;
    lines.push(`Indikator: ${ind.text} (${spread(entries)})`);
    for (const e of entries) lines.push(`- [nilai ${e.rating ?? '-'}] ${(e.comment ?? '').trim() || '(tanpa komentar)'}`);
  }
  return lines;
}

function scoreHeader(name: string, scores: AspectScoreLite[]): string {
  const s = scores.find((x) => x.name === name)?.score ?? null;
  const { hi, lo } = extremes(scores);
  const tag = name === hi ? ' · SKOR TERTINGGI' : name === lo ? ' · SKOR TERENDAH' : '';
  return `Skor aspek: ${num(s)} (${perfLabelOf(s)})${tag}`;
}

/** Bahan per aspek: skor + penanda + indikator (sebaran nilai) + pasangan nilai↔komentar (anonim). Aspek tanpa isi dilewati. */
export function buildAspectMaterial(byAspect: AspectRaw[], keys: string[], scores: AspectScoreLite[] = []): { text: string; keys: string[] } {
  const wanted = new Set(keys);
  const parts: string[] = [];
  const used: string[] = [];
  for (const a of byAspect) {
    if (!wanted.has(a.name)) continue;
    const lines = aspectLines(a);
    if (!lines.length) continue;
    used.push(a.name);
    parts.push(`### KUNCI: ${a.name}\n${scoreHeader(a.name, scores)}\n${lines.join('\n')}`);
  }
  return { text: parts.join('\n\n'), keys: used };
}

/**
 * Bahan per pertanyaan kualitatif: jawaban (anonim, dasar utama) + KONTEKS skor & komentar per aspek (bukti pendukung,
 * bukan kunci). Pertanyaan tanpa jawaban dilewati.
 */
export function buildQualMaterial(essays: EssayGroup[], keys: string[], byAspect: AspectRaw[] = [], scores: AspectScoreLite[] = []): { text: string; keys: string[] } {
  const wanted = new Set(keys);
  const parts: string[] = [];
  const used: string[] = [];
  for (const g of essays) {
    if (!wanted.has(g.question)) continue;
    const answers = g.answers.map((s) => s.trim()).filter(Boolean);
    if (!answers.length) continue;
    used.push(g.question);
    parts.push(`### KUNCI: ${g.question}\n(${answers.length} jawaban)\n${answers.map((s) => `- ${s}`).join('\n')}`);
  }
  const ctx = byAspect
    .map((a) => ({ a, lines: aspectLines(a) }))
    .filter((x) => x.lines.length)
    .map(({ a, lines }) => `#### Aspek: ${a.name} — ${scoreHeader(a.name, scores)}\n${lines.join('\n')}`);
  const text = parts.join('\n\n') + (ctx.length && parts.length ? `\n\n=== KONTEKS (bukan kunci): skor & komentar per aspek ===\n${ctx.join('\n\n')}` : '');
  return { text, keys: used };
}

/** Ganti nama pegawai (lengkap & kata pertama ≥ 3 huruf) di teks ringkasan HRD sebelum dikirim ke AI. */
export function maskName(text: string, name: string): string {
  // Satu regex (terpanjang dulu), sekali lewat — hasil "[pegawai]" tak ikut terganti lagi.
  const tokens = [...new Set([name.trim(), name.trim().split(/\s+/)[0]])].filter((t) => t.length >= 3);
  if (!tokens.length) return text;
  const re = new RegExp(tokens.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'gi');
  return text.replace(re, '[pegawai]');
}

/**
 * Bahan "Kesimpulan + Masukan Lain": skor keseluruhan & per aspek, ringkasan HRD yang sudah ada (nama disamarkan),
 * jawaban esai, dan semua komentar per indikator (untuk mendeteksi masukan di luar topik). Kosong bila tak ada komentar.
 */
export function buildNotesMaterial(d: Pick<ReportData, 'emp' | 'finalScore' | 'kpiAvg' | 's360' | 'latePenalty360' | 'aspects' | 'byAspect' | 'essays' | 'aspectSummaries' | 'qualSummaries'>): string {
  const comments = d.byAspect.map((a) => ({ a, lines: aspectLines(a) })).filter((x) => x.lines.length);
  const essays = d.essays.map((g) => ({ q: g.question, ans: g.answers.map((s) => s.trim()).filter(Boolean) })).filter((g) => g.ans.length);
  if (!comments.length && !essays.length) return '';
  const scores = d.aspects.map((a) => ({ name: a.name, score: a.score }));
  const out: string[] = ['=== SKOR ==='];
  out.push(`Skor Akhir: ${num(d.finalScore)} (${perfLabelOf(d.finalScore)})`);
  out.push(d.kpiAvg != null ? `Skor KPI: ${num(d.kpiAvg)} (${perfLabelOf(d.kpiAvg)})` : 'Skor KPI: belum ada');
  out.push(`Skor 360: ${num(d.s360)} (${perfLabelOf(d.s360)})${d.latePenalty360 > 0 ? ` — sudah termasuk potongan keterlambatan ${num(d.latePenalty360)} poin` : ''}`);
  for (const a of scores) out.push(`- ${a.name}: ${scoreHeader(a.name, scores).replace('Skor aspek: ', '')}`);
  const hrd = [
    ...Object.entries(d.aspectSummaries).filter(([, v]) => v.trim()).map(([k, v]) => `#### Aspek: ${k}\n${maskName(v, d.emp.name)}`),
    ...Object.entries(d.qualSummaries).filter(([, v]) => v.trim()).map(([k, v]) => `#### Pertanyaan: ${k}\n${maskName(v, d.emp.name)}`),
  ];
  if (hrd.length) out.push('', '=== RINGKASAN HRD (sudah ditulis) ===', ...hrd);
  if (essays.length) out.push('', '=== JAWABAN ESAI ===', ...essays.map((g) => `#### ${g.q} (${WORDS[g.ans.length] ?? g.ans.length} jawaban)\n${g.ans.map((s) => `- ${s}`).join('\n')}`));
  if (comments.length) out.push('', '=== KOMENTAR PER INDIKATOR ===', ...comments.map(({ a, lines }) => `#### Aspek: ${a.name}\n${lines.join('\n')}`));
  return out.join('\n');
}
