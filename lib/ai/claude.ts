/**
 * Klien Claude (Anthropic) untuk "Ringkas otomatis" — EKSPERIMEN, HANYA dev/staging (gerbang sama dengan
 * Gemini: `aiSummaryEnabled` di lib/ai/gemini.ts). Kunci = ANTHROPIC_API_KEY (env server; JANGAN NEXT_PUBLIC_*).
 *
 * Daftar model SENGAJA dibatasi ke tiga model (keputusan pemilik 2026-11-17) — bukan diambil dari Models API.
 * Perbedaan dari Gemini:
 *  - thinking tak bisa dimatikan pada model ini → kedalaman diatur `effort: 'low'` (cepat & hemat token);
 *  - `temperature` tidak dikirim (ditolak model Claude terbaru);
 *  - token thinking sudah termasuk `output_tokens` → dipisah lewat `output_tokens_details.thinking_tokens`
 *    agar costOf (output + thinking) tidak menghitung dua kali;
 *  - Sonnet/Opus memakai fallback server (`fallbacks: 'default'`): bila model menolak bahan, permintaan
 *    diulang di model lain dalam panggilan yang sama. Haiku tidak punya fallback server.
 * Coba ulang 429/5xx & batas waktu ditangani SDK (maxRetries, timeout).
 */
import Anthropic from '@anthropic-ai/sdk';
import { GEMINI_TIMEOUT_MS, parseSummaries, type AiUsage, type GeminiModelInfo, type SummaryResult } from './gemini';

type Env = Record<string, string | undefined>;

/** Tiga model Claude yang boleh dipilih di Pengaturan AI. */
export const CLAUDE_MODELS: GeminiModelInfo[] = [
  { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5', description: 'Paling cepat dan paling murah.', inputTokenLimit: 1_000_000 },
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5', description: 'Menengah — keseimbangan mutu, kecepatan, dan biaya.', inputTokenLimit: 1_000_000 },
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5', description: 'Paling teliti, paling mahal dari ketiganya.', inputTokenLimit: 1_000_000 },
];

export const isClaudeModel = (model: string) => CLAUDE_MODELS.some((m) => m.id === model);

/** Model yang punya fallback server (Haiku tidak). */
const WITH_FALLBACK = new Set(['claude-sonnet-5-5', 'claude-opus-5-5']);

const SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: { kunci: { type: 'string' }, ringkasan: { type: 'string' } },
        required: ['kunci', 'ringkasan'],
        additionalProperties: false,
      },
    },
  },
  required: ['items'],
  additionalProperties: false,
} as const;

/** Usage Anthropic → AiUsage (thinking dipisah dari output agar tak terhitung dua kali). */
export function claudeUsageOf(u: { input_tokens?: number | null; output_tokens?: number | null; cache_creation_input_tokens?: number | null; cache_read_input_tokens?: number | null; output_tokens_details?: { thinking_tokens?: number | null } | null } | null | undefined): AiUsage {
  const out = u?.output_tokens ?? 0;
  const thought = Math.min(out, u?.output_tokens_details?.thinking_tokens ?? 0);
  return {
    inputTokens: (u?.input_tokens ?? 0) + (u?.cache_creation_input_tokens ?? 0) + (u?.cache_read_input_tokens ?? 0),
    outputTokens: out - thought,
    thoughtTokens: thought,
  };
}

/** Ambil {kunci → ringkasan} dari JSON `{ items: [...] }`. */
export function parseClaudeSummaries(text: string, keys: string[], maxLen: number): Record<string, string> | null {
  let obj: unknown;
  try { obj = JSON.parse(text); } catch { return null; }
  const items = (obj as { items?: unknown } | null)?.items;
  if (!Array.isArray(items)) return null;
  return parseSummaries(JSON.stringify(items), keys, maxLen);
}

/** Pesan galat yang aman ditampilkan ke HRD (pesan API tak memuat isi permintaan). */
function errorMessage(e: unknown, elapsedMs: number): string {
  const secs = Math.round(elapsedMs / 1000);
  if (e instanceof Anthropic.APIConnectionTimeoutError) {
    return `Claude tidak menjawab dalam ${secs} detik sehingga dihentikan. Coba lagi, atau pilih model yang lebih ringan di Pengaturan AI. Token mungkin tetap ditagih.`;
  }
  if (e instanceof Anthropic.AuthenticationError) return 'Kunci API Claude ditolak (tidak sah). Periksa ANTHROPIC_API_KEY di server.';
  if (e instanceof Anthropic.RateLimitError) return 'Batas pemakaian Claude per menit tercapai — sudah dicoba ulang. Coba lagi beberapa saat lagi.';
  if (e instanceof Anthropic.APIError && typeof e.status === 'number') {
    if (e.status >= 500) return `Layanan Claude sedang bermasalah (${e.status}) — sudah dicoba ulang. Coba lagi beberapa saat lagi.`;
    return `Claude menolak permintaan (${e.status}): ${e.message}`;
  }
  if (e instanceof Anthropic.APIConnectionError) return `Gagal menghubungi Claude setelah ${secs} detik.`;
  return `Gagal memanggil Claude (${(e as { message?: string } | null)?.message ?? 'tanpa keterangan'}).`;
}

/** Panggil Claude dengan keluaran JSON terstruktur per kunci. Bentuk hasil sama dengan summarizeWithGemini. */
export async function summarizeWithClaude(
  prompt: string, material: string, keys: string[], maxLen: number,
  opts: { model: string }, env: Env = process.env,
): Promise<SummaryResult> {
  const apiKey = env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) return { ok: false, error: 'Kunci API Claude belum dipasang di server.' };
  const { model } = opts;
  if (!isClaudeModel(model)) return { ok: false, error: 'Model Claude tidak dikenal — pilih dari daftar di Pengaturan AI.', model };

  const client = new Anthropic({ apiKey, timeout: GEMINI_TIMEOUT_MS, maxRetries: 2 });
  const started = Date.now();
  let res: Anthropic.Beta.BetaMessage;
  try {
    res = await client.beta.messages.create({
      model,
      max_tokens: 16000,
      ...(WITH_FALLBACK.has(model) ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
      output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
      messages: [{
        role: 'user',
        content: `${prompt}\n\nKembalikan satu entri untuk setiap KUNCI berikut, dengan teks kunci persis sama:\n${keys.map((k) => `- ${k}`).join('\n')}\n\nBAHAN:\n${material}`,
      }],
    });
  } catch (e) {
    return { ok: false, error: errorMessage(e, Date.now() - started), model };
  }

  const usage = claudeUsageOf(res.usage);
  const served = res.model || model;
  if (res.stop_reason === 'refusal') {
    return { ok: false, error: 'Claude menolak meringkas bahan ini. Coba model lain atau ringkas manual.', usage, model: served };
  }
  const text = res.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
  const summaries = parseClaudeSummaries(text, keys, maxLen);
  if (!summaries) {
    const reason = res.stop_reason === 'max_tokens' ? ' (jawaban terpotong)' : '';
    return { ok: false, error: `Jawaban Claude tidak terbaca${reason}. Coba lagi.`, usage, model: served };
  }
  return { ok: true, summaries, usage, model: served };
}
