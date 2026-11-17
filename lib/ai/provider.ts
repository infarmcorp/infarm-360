/**
 * Pemilih penyedia AI untuk "Ringkas otomatis": model berawalan `claude-` → Anthropic, selain itu → Gemini.
 * Pengaturan AI tetap SATU model untuk semua ringkasan; perbandingan antarmodel dilakukan bergantian.
 */
import { listGeminiModels, summarizeWithGemini, type GeminiModelInfo, type SummaryResult } from './gemini';
import { CLAUDE_MODELS, isClaudeModel, summarizeWithClaude } from './claude';
import { thinkingFor } from './settings';

type Env = Record<string, string | undefined>;

export type AiProvider = 'claude' | 'gemini';
export const providerOf = (model: string): AiProvider => (model.startsWith('claude-') ? 'claude' : 'gemini');

export function summarize(prompt: string, material: string, keys: string[], maxLen: number, model: string): Promise<SummaryResult> {
  return isClaudeModel(model)
    ? summarizeWithClaude(prompt, material, keys, maxLen, { model })
    : summarizeWithGemini(prompt, material, keys, maxLen, { model, thinking: thinkingFor(model) });
}

/**
 * Daftar model yang bisa dipilih: tiga model Claude (bila ANTHROPIC_API_KEY ada) + model Gemini dari Google
 * (bila GEMINI_API_KEY ada). Daftar Gemini gagal dimuat → model Claude tetap tersedia, `warning` menjelaskan.
 */
export async function listAiModels(env: Env = process.env): Promise<{ models: GeminiModelInfo[]; warning: string | null }> {
  const claude = env.ANTHROPIC_API_KEY?.trim() ? CLAUDE_MODELS : [];
  // Hanya kunci Claude yang terpasang → tak perlu menghubungi Google.
  if (claude.length && !env.GEMINI_API_KEY?.trim()) return { models: claude, warning: null };
  const g = await listGeminiModels(env);
  if (!g.ok) return { models: claude, warning: `Daftar model Gemini tidak bisa dimuat: ${g.error}` };
  return { models: [...claude, ...g.models], warning: null };
}
