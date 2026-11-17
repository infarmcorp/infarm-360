import { describe, it, expect, vi, beforeEach } from 'vitest';

const create = vi.fn();
// Galat dipicu lewat fungsi biasa: Vitest melaporkan galat yang dilempar vi.fn sebagai kegagalan uji walau sudah ditangkap kode.
const hooks: { fail: Error | null } = { fail: null };
vi.mock('@anthropic-ai/sdk', async (orig) => {
  const real = (await orig<typeof import('@anthropic-ai/sdk')>()).default;
  class FakeAnthropic {
    static APIError = real.APIError;
    static APIConnectionError = real.APIConnectionError;
    static APIConnectionTimeoutError = real.APIConnectionTimeoutError;
    static AuthenticationError = real.AuthenticationError;
    static RateLimitError = real.RateLimitError;
    opts: unknown;
    beta = { messages: { create: (body: unknown) => (hooks.fail ? Promise.reject(hooks.fail) : create(body)) } };
    constructor(opts: unknown) { this.opts = opts; }
  }
  return { default: FakeAnthropic };
});

import { summarizeWithClaude, claudeUsageOf, parseClaudeSummaries, CLAUDE_MODELS, isClaudeModel } from '@/lib/ai/claude';
import { aiSummaryEnabled, costOf } from '@/lib/ai/gemini';
import { listAiModels, providerOf } from '@/lib/ai/provider';
import { KNOWN_PRICES } from '@/lib/ai/settings';

const STG = 'https://twgdlhmsoifvmiqpkqsr.supabase.co';
const PROD = 'https://beajoczjpywozavatzmf.supabase.co';
const ENV = { ANTHROPIC_API_KEY: 'k' };

const reply = (text: string, extra: Record<string, unknown> = {}) => ({
  model: 'claude-sonnet-5-5', stop_reason: 'end_turn',
  content: [{ type: 'thinking', thinking: '' }, { type: 'text', text }],
  usage: { input_tokens: 1000, output_tokens: 300, output_tokens_details: { thinking_tokens: 100 } },
  ...extra,
});

beforeEach(() => { create.mockReset(); hooks.fail = null; });

describe('daftar model Claude — dibatasi tiga model', () => {
  it('hanya Haiku, Sonnet, Opus 5.5, semuanya punya harga resmi', () => {
    expect(CLAUDE_MODELS.map((m) => m.id)).toEqual(['claude-haiku-5-5', 'claude-sonnet-5-5', 'claude-opus-5-5']);
    for (const m of CLAUDE_MODELS) expect(KNOWN_PRICES[m.id]).toBeDefined();
    expect(isClaudeModel('claude-fable-5-2')).toBe(false);
  });
  it('penyedia dipilih dari nama model', () => {
    expect(providerOf('claude-haiku-5-5')).toBe('claude');
    expect(providerOf('gemini-2.5-flash')).toBe('gemini');
  });
  it('hanya kunci Claude → tiga model Claude tanpa menghubungi Google', async () => {
    const r = await listAiModels({ ANTHROPIC_API_KEY: 'k' });
    expect(r.models.map((m) => m.id)).toHaveLength(3);
    expect(r.warning).toBeNull();
  });
});

describe('aiSummaryEnabled — kunci Claude saja cukup, pengaman production tetap', () => {
  it('aktif dengan kunci Claude di staging', () => {
    expect(aiSummaryEnabled({ ANTHROPIC_API_KEY: 'k', NEXT_PUBLIC_SUPABASE_URL: STG })).toBe(true);
  });
  it('mati di production', () => {
    expect(aiSummaryEnabled({ ANTHROPIC_API_KEY: 'k', NEXT_PUBLIC_SUPABASE_URL: STG, VERCEL_ENV: 'production' })).toBe(false);
    expect(aiSummaryEnabled({ ANTHROPIC_API_KEY: 'k', NEXT_PUBLIC_SUPABASE_URL: PROD })).toBe(false);
  });
});

describe('claudeUsageOf — thinking dipisah agar tak terhitung dua kali', () => {
  it('output_tokens sudah termasuk thinking', () => {
    const u = claudeUsageOf({ input_tokens: 1000, output_tokens: 300, output_tokens_details: { thinking_tokens: 100 } });
    expect(u).toEqual({ inputTokens: 1000, outputTokens: 200, thoughtTokens: 100 });
    // costOf menagih output + thinking = 300 token output
    const c = costOf(u, { priceIn: 2, priceOut: 10, usdIdr: 16500 });
    expect(c.usd).toBeCloseTo((1000 * 2 + 300 * 10) / 1_000_000, 10);
  });
});

describe('parseClaudeSummaries', () => {
  it('hanya kunci yang diminta, dipotong maxLen', () => {
    const s = parseClaudeSummaries(JSON.stringify({ items: [{ kunci: 'Jujur', ringkasan: 'abcdef' }, { kunci: 'Lain', ringkasan: 'x' }] }), ['Jujur'], 3);
    expect(s).toEqual({ Jujur: 'abc' });
  });
  it('bukan JSON / tanpa items → null', () => {
    expect(parseClaudeSummaries('bukan json', ['A'], 10)).toBeNull();
    expect(parseClaudeSummaries('[]', ['A'], 10)).toBeNull();
  });
});

describe('summarizeWithClaude', () => {
  it('tanpa kunci → tolak tanpa memanggil API', async () => {
    const r = await summarizeWithClaude('p', 'm', ['A'], 100, { model: 'claude-haiku-5-5' }, {});
    expect(r.ok).toBe(false);
    expect(create).not.toHaveBeenCalled();
  });
  it('model di luar tiga pilihan → tolak', async () => {
    const r = await summarizeWithClaude('p', 'm', ['A'], 100, { model: 'claude-fable-5-2' }, ENV);
    expect(r.ok).toBe(false);
    expect(create).not.toHaveBeenCalled();
  });
  it('sukses: JSON terstruktur, effort low, tanpa temperature, fallback untuk Sonnet', async () => {
    create.mockResolvedValue(reply(JSON.stringify({ items: [{ kunci: 'Jujur', ringkasan: 'Konsisten.' }] })));
    const r = await summarizeWithClaude('PROMPT', 'BAHAN', ['Jujur'], 100, { model: 'claude-sonnet-5-5' }, ENV);
    expect(r).toMatchObject({ ok: true, summaries: { Jujur: 'Konsisten.' }, model: 'claude-sonnet-5-5', usage: { inputTokens: 1000, outputTokens: 200, thoughtTokens: 100 } });
    const body = create.mock.calls[0][0];
    expect(body.model).toBe('claude-sonnet-5-5');
    expect(body.output_config.effort).toBe('low');
    expect(body.output_config.format.type).toBe('json_schema');
    expect(body.temperature).toBeUndefined();
    expect(body.thinking).toBeUndefined();
    expect(body.fallbacks).toBe('default');
    expect(body.messages[0].content).toContain('PROMPT');
    expect(body.messages[0].content).toContain('- Jujur');
    expect(body.messages[0].content).toContain('BAHAN');
  });
  it('Haiku tanpa fallback server', async () => {
    create.mockResolvedValue(reply(JSON.stringify({ items: [] })));
    await summarizeWithClaude('p', 'm', ['A'], 100, { model: 'claude-haiku-5-5' }, ENV);
    expect(create.mock.calls[0][0].fallbacks).toBeUndefined();
    expect(create.mock.calls[0][0].betas).toBeUndefined();
  });
  it('ditolak model (refusal) → pesan jelas, pemakaian tetap tercatat', async () => {
    create.mockResolvedValue(reply('', { stop_reason: 'refusal', content: [] }));
    const r = await summarizeWithClaude('p', 'm', ['A'], 100, { model: 'claude-opus-5-5' }, ENV);
    expect(r.ok).toBe(false);
    if (!r.ok) { expect(r.error).toMatch(/menolak/); expect(r.usage?.inputTokens).toBe(1000); }
  });
  it('jawaban tak terbaca → gagal', async () => {
    create.mockResolvedValue(reply('bukan json', { stop_reason: 'max_tokens' }));
    const r = await summarizeWithClaude('p', 'm', ['A'], 100, { model: 'claude-haiku-5-5' }, ENV);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/terpotong/);
  });
  it('galat jaringan/API → pesan, bukan lemparan', async () => {
    hooks.fail = new Error('putus');
    const r = await summarizeWithClaude('p', 'm', ['A'], 100, { model: 'claude-haiku-5-5' }, ENV);
    expect(r).toMatchObject({ ok: false, model: 'claude-haiku-5-5' });
    expect(JSON.stringify(r)).toContain('Gagal memanggil Claude (putus)');
  });
});
