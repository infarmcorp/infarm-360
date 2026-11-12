/**
 * PROMPT "Ringkas otomatis" (Gemini) — EKSPERIMEN, hanya aktif di dev/staging (lihat lib/ai/gemini.ts).
 *
 * Ganti teks di bawah dengan prompt resmi. Bahan (komentar anonim) disusun otomatis oleh
 * `buildAspectMaterial` / `buildQualMaterial` dan ditempel SETELAH instruksi ini.
 * Format keluaran (JSON per kunci) ditegakkan lewat responseSchema, jadi prompt cukup mengatur
 * ISI & GAYA ringkasan. Format teks yang dikenali editor: **tebal**, baris diawali "- " = poin.
 *
 * PRIVASI: bahan TIDAK memuat nama/divisi pegawai yang dinilai maupun nama/relasi penilai.
 */
import type { AspectRaw, EssayGroup } from '@/lib/report';

export const ASPECT_PROMPT = `Anda membantu HRD menyusun ringkasan evaluasi 360° (budaya & perilaku) seorang pegawai.
Untuk SETIAP aspek di bawah, tulis ringkasan dalam bahasa Indonesia yang netral, adil, dan ringkas (2–4 kalimat):
kekuatan yang konsisten disebut, area pengembangan, dan kecenderungan rating.
Jangan menyebut atau menebak identitas penilai. Jangan mengarang hal yang tidak ada di komentar.
Rating berskala 1–5.`;

export const QUAL_PROMPT = `Anda membantu HRD menyusun ringkasan umpan balik kualitatif 360° seorang pegawai.
Untuk SETIAP pertanyaan di bawah, rangkum jawaban-jawaban penilai dalam bahasa Indonesia yang netral dan ringkas
(2–4 kalimat): tema yang paling sering muncul lebih dulu. Jangan menyebut atau menebak identitas penilai.
Jangan mengarang hal yang tidak ada di jawaban.`;

/** Bahan per aspek: indikator + pasangan rating↔komentar (anonim). Aspek tanpa isi dilewati. */
export function buildAspectMaterial(byAspect: AspectRaw[], keys: string[]): { text: string; keys: string[] } {
  const wanted = new Set(keys);
  const parts: string[] = [];
  const used: string[] = [];
  for (const a of byAspect) {
    if (!wanted.has(a.name)) continue;
    const lines: string[] = [];
    for (const ind of a.indicators) {
      const entries = ind.entries.filter((e) => e.rating != null || (e.comment ?? '').trim());
      if (!entries.length) continue;
      lines.push(`Indikator: ${ind.text}`);
      for (const e of entries) lines.push(`- [rating ${e.rating ?? '-'}] ${(e.comment ?? '').trim() || '(tanpa komentar)'}`);
    }
    if (!lines.length) continue;
    used.push(a.name);
    parts.push(`### KUNCI: ${a.name}\n${lines.join('\n')}`);
  }
  return { text: parts.join('\n\n'), keys: used };
}

/** Bahan per pertanyaan kualitatif: daftar jawaban (anonim). Pertanyaan tanpa jawaban dilewati. */
export function buildQualMaterial(essays: EssayGroup[], keys: string[]): { text: string; keys: string[] } {
  const wanted = new Set(keys);
  const parts: string[] = [];
  const used: string[] = [];
  for (const g of essays) {
    if (!wanted.has(g.question)) continue;
    const answers = g.answers.map((s) => s.trim()).filter(Boolean);
    if (!answers.length) continue;
    used.push(g.question);
    parts.push(`### KUNCI: ${g.question}\n${answers.map((s) => `- ${s}`).join('\n')}`);
  }
  return { text: parts.join('\n\n'), keys: used };
}
