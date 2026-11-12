import { describe, it, expect, vi, afterEach } from 'vitest';
import { aiSummaryEnabled, costOf, parseSummaries, summarizeWithGemini } from '@/lib/ai/gemini';
import { buildAspectMaterial, buildQualMaterial } from '@/lib/ai/summary-prompt';

const STG = 'https://twgdlhmsoifvmiqpkqsr.supabase.co';
const PROD = 'https://beajoczjpywozavatzmf.supabase.co';

describe('aiSummaryEnabled — gerbang dev saja (gagal tertutup)', () => {
  it('aktif hanya dengan kunci + bukan production + DB bukan production', () => {
    expect(aiSummaryEnabled({ GEMINI_API_KEY: 'k', NEXT_PUBLIC_SUPABASE_URL: STG, VERCEL_ENV: 'preview' })).toBe(true);
    expect(aiSummaryEnabled({ GEMINI_API_KEY: 'k', NEXT_PUBLIC_SUPABASE_URL: STG })).toBe(true);
  });
  it('mati tanpa kunci', () => {
    expect(aiSummaryEnabled({ NEXT_PUBLIC_SUPABASE_URL: STG })).toBe(false);
    expect(aiSummaryEnabled({ GEMINI_API_KEY: '  ', NEXT_PUBLIC_SUPABASE_URL: STG })).toBe(false);
  });
  it('mati di deploy production', () => {
    expect(aiSummaryEnabled({ GEMINI_API_KEY: 'k', NEXT_PUBLIC_SUPABASE_URL: STG, VERCEL_ENV: 'production' })).toBe(false);
  });
  it('mati bila database = production (mis. dev lokal menunjuk production) atau URL kosong', () => {
    expect(aiSummaryEnabled({ GEMINI_API_KEY: 'k', NEXT_PUBLIC_SUPABASE_URL: PROD })).toBe(false);
    expect(aiSummaryEnabled({ GEMINI_API_KEY: 'k' })).toBe(false);
  });
});

describe('costOf — perkiraan biaya', () => {
  it('pakai harga bawaan; thinking ditagih sebagai output', () => {
    const c = costOf({ inputTokens: 1_000_000, outputTokens: 500_000, thoughtTokens: 500_000 }, {});
    expect(c.usd).toBeCloseTo(0.3 + 2.5, 10);
    expect(c.idr).toBeCloseTo((0.3 + 2.5) * 16500, 6);
  });
  it('harga & kurs bisa diatur env; nilai rusak → bawaan', () => {
    const c = costOf({ inputTokens: 2_000_000, outputTokens: 1_000_000, thoughtTokens: 0 },
      { GEMINI_PRICE_INPUT_USD: '0.1', GEMINI_PRICE_OUTPUT_USD: '0.4', USD_IDR_RATE: '10000' });
    expect(c.usd).toBeCloseTo(0.6, 10);
    expect(c.idr).toBeCloseTo(6000, 6);
    expect(costOf({ inputTokens: 1_000_000, outputTokens: 0, thoughtTokens: 0 }, { GEMINI_PRICE_INPUT_USD: 'abc' }).usd).toBeCloseTo(0.3, 10);
  });
});

describe('parseSummaries', () => {
  it('hanya kunci yang diminta, dipangkas & dipotong', () => {
    const text = JSON.stringify([
      { kunci: 'Jujur', ringkasan: '  Konsisten jujur.  ' },
      { kunci: 'Asing', ringkasan: 'abaikan' },
      { kunci: 'Gigih', ringkasan: 'x'.repeat(50) },
      { kunci: 'Kosong', ringkasan: '   ' },
    ]);
    expect(parseSummaries(text, ['Jujur', 'Gigih', 'Kosong'], 10)).toEqual({ Jujur: 'Konsisten ', Gigih: 'x'.repeat(10) });
  });
  it('bukan JSON / bukan array → null', () => {
    expect(parseSummaries('bukan json', ['a'], 10)).toBeNull();
    expect(parseSummaries('{"a":1}', ['a'], 10)).toBeNull();
  });
});

describe('bahan prompt — tanpa identitas', () => {
  it('aspek: hanya kunci diminta, lewati indikator/aspek kosong', () => {
    const m = buildAspectMaterial([
      { name: 'Jujur', indicators: [
        { num: 1, text: 'Menepati komitmen', ratings: [4], entries: [{ rating: 4, comment: 'Selalu tepat waktu' }, { rating: null, comment: '  ' }] },
        { num: 2, text: 'Kosong', ratings: [], entries: [] },
      ] },
      { name: 'Gigih', indicators: [{ num: 3, text: 'x', ratings: [], entries: [] }] },
      { name: 'Lain', indicators: [{ num: 4, text: 'y', ratings: [5], entries: [{ rating: 5, comment: 'z' }] }] },
    ], ['Jujur', 'Gigih']);
    expect(m.keys).toEqual(['Jujur']);
    expect(m.text).toContain('### KUNCI: Jujur');
    expect(m.text).toContain('- [rating 4] Selalu tepat waktu');
    expect(m.text).not.toContain('Kosong');
    expect(m.text).not.toContain('Lain');
  });
  it('kualitatif: jawaban kosong dibuang', () => {
    const m = buildQualMaterial([{ question: 'Q1', answers: ['  A  ', ''] }, { question: 'Q2', answers: [' '] }], ['Q1', 'Q2']);
    expect(m.keys).toEqual(['Q1']);
    expect(m.text).toBe('### KUNCI: Q1\n- A');
  });
});

describe('summarizeWithGemini', () => {
  afterEach(() => vi.unstubAllGlobals());
  const env = { GEMINI_API_KEY: 'kunci-uji', GEMINI_MODEL: 'gemini-uji' };

  it('kirim kunci lewat header (bukan URL), baca usage & ringkasan', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: JSON.stringify([{ kunci: 'Jujur', ringkasan: 'Baik.' }]) }] } }],
      usageMetadata: { promptTokenCount: 120, candidatesTokenCount: 30, thoughtsTokenCount: 5 },
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const r = await summarizeWithGemini('P', 'BAHAN', ['Jujur'], 2000, env);
    expect(r).toEqual({ ok: true, summaries: { Jujur: 'Baik.' }, usage: { inputTokens: 120, outputTokens: 30, thoughtTokens: 5 }, model: 'gemini-uji' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/models/gemini-uji:generateContent');
    expect(String(url)).not.toContain('kunci-uji');
    expect((init as RequestInit).headers).toMatchObject({ 'x-goog-api-key': 'kunci-uji' });
    const body = JSON.parse(String((init as RequestInit).body));
    expect(body.generationConfig.thinkingConfig).toEqual({ thinkingBudget: 0 });
  });

  it('error HTTP → gagal dengan pesan + usage', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { message: 'API key not valid' } }), { status: 400 })));
    const r = await summarizeWithGemini('P', 'B', ['a'], 100, env);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('API key not valid');
  });

  it('koneksi gagal → pesan, tanpa melempar', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('net')));
    const r = await summarizeWithGemini('P', 'B', ['a'], 100, env);
    expect(r).toMatchObject({ ok: false });
  });

  it('tanpa kunci → tak memanggil fetch', async () => {
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    const r = await summarizeWithGemini('P', 'B', ['a'], 100, {});
    expect(r.ok).toBe(false);
    expect(f).not.toHaveBeenCalled();
  });
});
