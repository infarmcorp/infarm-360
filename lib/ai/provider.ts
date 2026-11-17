/**
 * Pemilih penyedia AI untuk "Ringkas otomatis": model berawalan `claude-` → Anthropic, selain itu → Gemini.
 * Pengaturan AI tetap SATU model untuk semua ringkasan; perbandingan antarmodel dilakukan bergantian.
 */
import { listGeminiModels, summarizeWithGemini, type GeminiModelInfo, type SummaryResult } from './gemini';
import { CLAUDE_MODELS, isClaudeModel, summarizeWithClaude } from './claude';
import { thinkingFor } from './settings';

type Env = Record<string, string | undefined>;

/**
 * Model Gemini yang boleh dipilih (keputusan pemilik 2026-11-17): hanya empat model teks yang harganya dikenal
 * (KNOWN_PRICES), dan hanya bila masih tersedia dari Google untuk kunci ini. Model lain dari Google
 * (Gemma, pratinjau/eksperimen, seri lama) tidak ditampilkan. Ganti daftar ini bila Google merilis/menarik model.
 */
export const GEMINI_ALLOWED = ['gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-3.5-flash-lite', 'gemini-3.1-pro-preview'];

export type AiProvider = 'claude' | 'gemini';
export const providerOf = (model: string): AiProvider => (model.startsWith('claude-') ? 'claude' : 'gemini');

export function summarize(prompt: string, material: string, keys: string[], maxLen: number, model: string): Promise<SummaryResult> {
  return isClaudeModel(model)
    ? summarizeWithClaude(prompt, material, keys, maxLen, { model })
    : summarizeWithGemini(prompt, material, keys, maxLen, { model, thinking: thinkingFor(model) });
}

/**
 * Daftar model yang bisa dipilih: tiga model Claude (bila ANTHROPIC_API_KEY ada) + model Gemini GEMINI_ALLOWED
 * yang masih tersedia dari Google (bila GEMINI_API_KEY ada). Daftar Gemini gagal dimuat → model Claude tetap tersedia, `warning` menjelaskan.
 */
export async function listAiModels(env: Env = process.env): Promise<{ models: GeminiModelInfo[]; warning: string | null }> {
  const claude = env.ANTHROPIC_API_KEY?.trim() ? CLAUDE_MODELS : [];
  // Hanya kunci Claude yang terpasang → tak perlu menghubungi Google.
  if (claude.length && !env.GEMINI_API_KEY?.trim()) return { models: claude, warning: null };
  const g = await listGeminiModels(env);
  if (!g.ok) return { models: claude, warning: `Daftar model Gemini tidak bisa dimuat: ${g.error}` };
  const gemini = GEMINI_ALLOWED.map((id) => g.models.find((m) => m.id === id)).filter((m): m is GeminiModelInfo => !!m);
  return { models: [...claude, ...gemini], warning: null };
}
