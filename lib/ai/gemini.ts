/**
 * Klien Gemini untuk "Ringkas otomatis" — EKSPERIMEN, HANYA dev/staging.
 *
 * GERBANG (gagal tertutup, `aiSummaryEnabled`):
 *  - GEMINI_API_KEY wajib ada (env server; JANGAN pernah NEXT_PUBLIC_*),
 *  - VERCEL_ENV bukan 'production',
 *  - URL Supabase bukan project production — komentar production tak pernah dikirim dari
 *    instalasi mana pun (termasuk `npm run dev` lokal yang kebetulan menunjuk production).
 *
 * Model, harga, kurs, dan prompt diambil dari Pengaturan AI (lib/ai/settings.ts, satu untuk semua).
 * Biaya = token × harga per 1 juta token (USD) × kurs. Token "thinking" ditagih sebagai output.
 */

const PROD_SUPABASE_REF = 'beajoczjpywozavatzmf';

type Env = Record<string, string | undefined>;

export function aiSummaryEnabled(env: Env = process.env): boolean {
  if (!env.GEMINI_API_KEY?.trim()) return false;
  if (env.VERCEL_ENV === 'production') return false;
  const url = env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  if (!url || url.includes(PROD_SUPABASE_REF)) return false;
  return true;
}

export type AiUsage = { inputTokens: number; outputTokens: number; thoughtTokens: number };
export type AiCost = { usd: number; idr: number; priceIn: number; priceOut: number; usdIdr: number };

/** Perkiraan biaya: output yang ditagih = token jawaban + token thinking. */
export function costOf(usage: AiUsage, prices: { priceIn: number; priceOut: number; usdIdr: number }): AiCost {
  const { priceIn, priceOut, usdIdr } = prices;
  const usd = (usage.inputTokens * priceIn + (usage.outputTokens + usage.thoughtTokens) * priceOut) / 1_000_000;
  return { usd, idr: usd * usdIdr, priceIn, priceOut, usdIdr };
}

export type SummaryResult =
  | { ok: true; summaries: Record<string, string>; usage: AiUsage; model: string }
  | { ok: false; error: string; usage?: AiUsage; model?: string };

type GeminiResponse = {
  candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number };
  promptFeedback?: { blockReason?: string };
  error?: { message?: string };
};

export function usageOf(r: GeminiResponse): AiUsage {
  const u = r.usageMetadata ?? {};
  return { inputTokens: u.promptTokenCount ?? 0, outputTokens: u.candidatesTokenCount ?? 0, thoughtTokens: u.thoughtsTokenCount ?? 0 };
}

/** Ambil {kunci → ringkasan} dari teks JSON model; hanya kunci yang diminta, dipotong `maxLen`. */
export function parseSummaries(text: string, keys: string[], maxLen: number): Record<string, string> | null {
  let arr: unknown;
  try { arr = JSON.parse(text); } catch { return null; }
  if (!Array.isArray(arr)) return null;
  const wanted = new Set(keys);
  const out: Record<string, string> = {};
  for (const it of arr) {
    if (!it || typeof it !== 'object') continue;
    const k = (it as Record<string, unknown>).kunci;
    const v = (it as Record<string, unknown>).ringkasan;
    if (typeof k !== 'string' || typeof v !== 'string' || !wanted.has(k.trim())) continue;
    const s = v.trim();
    if (s) out[k.trim()] = s.slice(0, maxLen);
  }
  return out;
}

/** Panggil Gemini (REST generateContent) dengan keluaran JSON terstruktur per kunci. */
export async function summarizeWithGemini(
  prompt: string, material: string, keys: string[], maxLen: number,
  opts: { model: string; thinking: 'off' | 'auto' }, env: Env = process.env,
): Promise<SummaryResult> {
  const key = env.GEMINI_API_KEY?.trim();
  if (!key) return { ok: false, error: 'Ringkas otomatis belum diaktifkan.' };
  const { model, thinking } = opts;

  const body = {
    contents: [{
      role: 'user',
      parts: [{ text: `${prompt}\n\nKembalikan satu entri untuk setiap KUNCI berikut, dengan teks kunci persis sama:\n${keys.map((k) => `- ${k}`).join('\n')}\n\nBAHAN:\n${material}` }],
    }],
    generationConfig: {
      temperature: 0.3,
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: { kunci: { type: 'STRING' }, ringkasan: { type: 'STRING' } },
          required: ['kunci', 'ringkasan'],
        },
      },
      // 'off' = matikan thinking (hemat token); 'auto' = bawaan model (model yang tak bisa mematikannya).
      ...(thinking === 'off' ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
    },
  };

  let res: Response;
  try {
    res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
    });
  } catch {
    return { ok: false, error: 'Gagal menghubungi Gemini (koneksi / waktu habis).', model };
  }
  let json: GeminiResponse;
  try { json = (await res.json()) as GeminiResponse; } catch { json = {}; }
  const usage = usageOf(json);
  // Pesan error Google tak memuat isi permintaan; aman ditampilkan ke HRD untuk diagnosis.
  if (!res.ok) return { ok: false, error: `Gemini menolak permintaan (${res.status}): ${json.error?.message ?? 'tanpa pesan'}`, usage, model };
  if (json.promptFeedback?.blockReason) return { ok: false, error: `Gemini memblokir bahan (${json.promptFeedback.blockReason}).`, usage, model };

  const text = (json.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('');
  const summaries = parseSummaries(text, keys, maxLen);
  if (!summaries) {
    const reason = json.candidates?.[0]?.finishReason;
    return { ok: false, error: `Jawaban Gemini tidak terbaca${reason ? ` (${reason})` : ''}. Coba lagi.`, usage, model };
  }
  return { ok: true, summaries, usage, model };
}

export type GeminiModelInfo = { id: string; label: string; description: string; inputTokenLimit: number | null };

type ModelsResponse = {
  models?: { name?: string; displayName?: string; description?: string; inputTokenLimit?: number; supportedGenerationMethods?: string[] }[];
  nextPageToken?: string;
  error?: { message?: string };
};

// Model yang bukan untuk menulis teks ringkasan (embedding, gambar, suara, realtime).
const NON_TEXT = /(embedding|embed|imagen|image|tts|audio|live|veo|aqa|robotics|computer-use)/i;

/**
 * Daftar model Gemini yang tersedia untuk kunci ini & bisa generateContent (teks). Kunci lewat header.
 * Gagal → { ok:false } (halaman menampilkan pesan; simpan pengaturan ditolak karena tak bisa divalidasi).
 */
export async function listGeminiModels(env: Env = process.env): Promise<{ ok: true; models: GeminiModelInfo[] } | { ok: false; error: string }> {
  const key = env.GEMINI_API_KEY?.trim();
  if (!key) return { ok: false, error: 'Kunci API Gemini belum dipasang.' };
  const out: GeminiModelInfo[] = [];
  let token = '';
  for (let page = 0; page < 10; page++) {
    let json: ModelsResponse;
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000${token ? `&pageToken=${encodeURIComponent(token)}` : ''}`, {
        headers: { 'x-goog-api-key': key }, signal: AbortSignal.timeout(20_000), cache: 'no-store',
      });
      json = (await res.json().catch(() => ({}))) as ModelsResponse;
      if (!res.ok) return { ok: false, error: `Google menolak permintaan daftar model (${res.status}): ${json.error?.message ?? 'tanpa pesan'}` };
    } catch {
      return { ok: false, error: 'Gagal menghubungi Google untuk daftar model.' };
    }
    for (const m of json.models ?? []) {
      const id = (m.name ?? '').replace(/^models\//, '');
      if (!id || NON_TEXT.test(id)) continue;
      if (!(m.supportedGenerationMethods ?? []).includes('generateContent')) continue;
      out.push({ id, label: m.displayName?.trim() || id, description: m.description?.trim() ?? '', inputTokenLimit: m.inputTokenLimit ?? null });
    }
    if (!json.nextPageToken) break;
    token = json.nextPageToken;
  }
  out.sort((a, b) => b.id.localeCompare(a.id, 'en', { numeric: true })); // versi terbaru di atas
  return { ok: true, models: out };
}
