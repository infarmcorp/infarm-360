import { describe, it, expect, vi, afterEach } from 'vitest';
import { aiSummaryEnabled, costOf, parseSummaries, summarizeWithGemini, listGeminiModels, fetchFailMessage } from '@/lib/ai/gemini';
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
  it('thinking ditagih sebagai output; rupiah = USD × kurs', () => {
    const c = costOf({ inputTokens: 1_000_000, outputTokens: 500_000, thoughtTokens: 500_000 }, { priceIn: 0.3, priceOut: 2.5, usdIdr: 16500 });
    expect(c.usd).toBeCloseTo(0.3 + 2.5, 10);
    expect(c.idr).toBeCloseTo((0.3 + 2.5) * 16500, 6);
  });
  it('harga & kurs dari pengaturan', () => {
    const c = costOf({ inputTokens: 2_000_000, outputTokens: 1_000_000, thoughtTokens: 0 }, { priceIn: 0.1, priceOut: 0.4, usdIdr: 10000 });
    expect(c.usd).toBeCloseTo(0.6, 10);
    expect(c.idr).toBeCloseTo(6000, 6);
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
  const env = { GEMINI_API_KEY: 'kunci-uji' };
  const OFF = { model: 'gemini-uji', thinking: 'off' as const };

  it('kirim kunci lewat header (bukan URL), baca usage & ringkasan', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: JSON.stringify([{ kunci: 'Jujur', ringkasan: 'Baik.' }]) }] } }],
      usageMetadata: { promptTokenCount: 120, candidatesTokenCount: 30, thoughtsTokenCount: 5 },
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const r = await summarizeWithGemini('P', 'BAHAN', ['Jujur'], 2000, OFF, env);
    expect(r).toEqual({ ok: true, summaries: { Jujur: 'Baik.' }, usage: { inputTokens: 120, outputTokens: 30, thoughtTokens: 5 }, model: 'gemini-uji' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/models/gemini-uji:generateContent');
    expect(String(url)).not.toContain('kunci-uji');
    expect((init as RequestInit).headers).toMatchObject({ 'x-goog-api-key': 'kunci-uji' });
    const body = JSON.parse(String((init as RequestInit).body));
    expect(body.generationConfig.thinkingConfig).toEqual({ thinkingBudget: 0 });
    expect(body.contents[0].parts[0].text.startsWith('P\n')).toBe(true);
  });

  it("thinking 'auto' → tanpa thinkingConfig (model yang tak bisa mematikannya)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '[]' }] } }] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await summarizeWithGemini('P', 'B', ['a'], 100, { model: 'm', thinking: 'auto' }, env);
    const body = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body));
    expect(body.generationConfig.thinkingConfig).toBeUndefined();
  });

  it('error HTTP → gagal dengan pesan + usage', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { message: 'API key not valid' } }), { status: 400 })));
    const r = await summarizeWithGemini('P', 'B', ['a'], 100, OFF, env);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('API key not valid');
  });

  it('koneksi gagal → pesan, tanpa melempar', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('net')));
    const r = await summarizeWithGemini('P', 'B', ['a'], 100, OFF, env);
    expect(r).toMatchObject({ ok: false });
  });

  it('tanpa kunci → tak memanggil fetch', async () => {
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    const r = await summarizeWithGemini('P', 'B', ['a'], 100, OFF, {});
    expect(r.ok).toBe(false);
    expect(f).not.toHaveBeenCalled();
  });
});

describe('listGeminiModels — daftar model langsung dari Google', () => {
  afterEach(() => vi.unstubAllGlobals());
  const env = { GEMINI_API_KEY: 'kunci-uji' };

  it('hanya model teks yang bisa generateContent; terbaru di atas; kunci lewat header; ikut halaman berikutnya', async () => {
    const page1 = { models: [
      { name: 'models/gemini-2.5-flash', displayName: 'Gemini 2.5 Flash', supportedGenerationMethods: ['generateContent'] },
      { name: 'models/text-embedding-004', supportedGenerationMethods: ['embedContent'] },
      { name: 'models/gemini-2.5-flash-preview-tts', supportedGenerationMethods: ['generateContent'] },
    ], nextPageToken: 'p2' };
    const page2 = { models: [
      { name: 'models/gemini-3.8-flash', displayName: 'Gemini 3.8 Flash', description: 'Terbaru', inputTokenLimit: 1048576, supportedGenerationMethods: ['generateContent', 'countTokens'] },
    ] };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(page1), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(page2), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const r = await listGeminiModels(env);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.models.map((m) => m.id)).toEqual(['gemini-3.8-flash', 'gemini-2.5-flash']);
    expect(r.models[0]).toMatchObject({ label: 'Gemini 3.8 Flash', inputTokenLimit: 1048576 });
    expect(String(fetchMock.mock.calls[1][0])).toContain('pageToken=p2');
    expect(String(fetchMock.mock.calls[0][0])).not.toContain('kunci-uji');
  });

  it('error dari Google → ok:false dengan pesan', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { message: 'API key not valid' } }), { status: 400 })));
    const r = await listGeminiModels(env);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('API key not valid');
  });

  it('tanpa kunci → tak memanggil Google', async () => {
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    expect((await listGeminiModels({})).ok).toBe(false);
    expect(f).not.toHaveBeenCalled();
  });
});

describe('fetchFailMessage', () => {
  it('waktu habis → sebut detik & saran', () => {
    const e = Object.assign(new Error('timeout'), { name: 'TimeoutError' });
    expect(fetchFailMessage(e, 55_200)).toMatch(/tidak menjawab dalam 55 detik/);
  });
  it('koneksi gagal → sertakan kode penyebab', () => {
    const e = Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } });
    expect(fetchFailMessage(e, 300)).toBe('Gagal menghubungi Gemini setelah 0 detik (ENOTFOUND).');
  });
});
