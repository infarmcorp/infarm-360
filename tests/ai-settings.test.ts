import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeClient, type MockClient } from './helpers/mock-supabase';

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(), createAdminClient: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/audit/log', () => ({ logHrdAction: vi.fn(async () => {}), logAuditAsService: vi.fn(async () => {}) }));
const cookieMode = { value: 'admin' };
vi.mock('next/headers', () => ({ cookies: vi.fn(async () => ({ get: () => cookieMode })) }));
vi.mock('@/lib/ai/gemini', async (orig) => ({
  ...(await orig<typeof import('@/lib/ai/gemini')>()),
  aiSummaryEnabled: vi.fn(() => true),
  listGeminiModels: vi.fn(async () => ({ ok: true, models: [
    { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash', description: '', inputTokenLimit: null },
    { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', description: '', inputTokenLimit: null },
  ] })),
}));

import { createClient, createAdminClient } from '@/lib/supabase/server';
import { aiSummaryEnabled, listGeminiModels } from '@/lib/ai/gemini';
import { logHrdAction } from '@/lib/audit/log';
import { loadAiSettings, defaultAiSettings, thinkingFor } from '@/lib/ai/settings';
import { ASPECT_PROMPT } from '@/lib/ai/summary-prompt';
import { saveAiSettings } from '@/app/(app)/admin/ai/actions';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const use = (c: MockClient) => vi.mocked(createClient).mockResolvedValue(c as any);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const useAdmin = (c: MockClient) => vi.mocked(createAdminClient).mockReturnValue(c as any);

const UID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const HRD = { role: 'hrd', is_hrd_admin: false, hrd_sections: null, name: 'HRD Uji' };
const ROW = {
  model: 'gemini-2.5-flash', price_input_usd: '0.3000', price_output_usd: '2.5000', usd_idr: '16500.00',
  aspect_prompt: 'Prompt aspek tersimpan cukup panjang', qual_prompt: 'Prompt kualitatif tersimpan panjang', version: 3,
  updated_by_name: 'HRD Uji', updated_at: '2026-11-12T03:00:00Z',
};
const VALID = {
  model: 'gemini-3.8-flash', priceIn: 0.1, priceOut: 0.4, usdIdr: 16000,
  aspectPrompt: 'Prompt aspek tersimpan cukup panjang', qualPrompt: 'Prompt kualitatif tersimpan panjang',
};

beforeEach(() => { vi.clearAllMocks(); cookieMode.value = 'admin'; vi.mocked(aiSummaryEnabled).mockReturnValue(true); });

describe('loadAiSettings', () => {
  it('tabel belum ada (migrasi 0060) → bawaan, source missing', async () => {
    const s = await loadAiSettings(makeClient({ tables: { ai_settings: [{ data: null, error: { code: 'PGRST205', message: "Could not find the table 'public.ai_settings'" } }] } }));
    expect(s.source).toBe('missing');
    expect(s.model).toBe(''); // tak ada model bawaan — HRD wajib memilih
    expect(s.aspectPrompt).toBe(ASPECT_PROMPT);
  });
  it('belum ada baris → bawaan', async () => {
    const s = await loadAiSettings(makeClient({ tables: { ai_settings: [{ data: null }] } }));
    expect(s).toEqual(defaultAiSettings('default'));
  });
  it('baris tersimpan → angka numerik dari string', async () => {
    const s = await loadAiSettings(makeClient({ tables: { ai_settings: [{ data: ROW }] } }));
    expect(s).toMatchObject({ source: 'db', model: 'gemini-2.5-flash', priceIn: 0.3, priceOut: 2.5, usdIdr: 16500, version: 3 });
  });
  it('id model tersimpan berbentuk tak sah → dianggap belum dipilih (prompt tetap)', async () => {
    const s = await loadAiSettings(makeClient({ tables: { ai_settings: [{ data: { ...ROW, model: '../evil?x=1' } }] } }));
    expect(s.model).toBe('');
    expect(s.aspectPrompt).toBe(ROW.aspect_prompt);
  });
  it('model baru (tak dikenal kode) diterima apa adanya', async () => {
    const s = await loadAiSettings(makeClient({ tables: { ai_settings: [{ data: { ...ROW, model: 'gemini-3.8-flash' } }] } }));
    expect(s.model).toBe('gemini-3.8-flash');
  });
  it('thinking: hanya model yang diketahui bisa dimatikan; lainnya bawaan model', () => {
    expect(thinkingFor('gemini-2.5-flash')).toBe('off');
    expect(thinkingFor('gemini-2.5-pro')).toBe('auto');
    expect(thinkingFor('gemini-3.8-flash')).toBe('auto');
  });
});

describe('saveAiSettings', () => {
  it('fitur nonaktif → tolak', async () => {
    vi.mocked(aiSummaryEnabled).mockReturnValue(false);
    expect((await saveAiSettings(VALID)).ok).toBe(false);
    expect(createClient).not.toHaveBeenCalled();
  });
  it('id model tak sah / prompt terlalu pendek → tolak', async () => {
    expect((await saveAiSettings({ ...VALID, model: '../x' })).ok).toBe(false);
    expect((await saveAiSettings({ ...VALID, aspectPrompt: 'pendek' })).ok).toBe(false);
  });
  it('model tak ada di daftar Google untuk kunci ini → tolak', async () => {
    use(makeClient({ user: { id: UID }, tables: { employees: [{ data: HRD }] } }));
    const r = await saveAiSettings({ ...VALID, model: 'gemini-9-imajiner' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/tidak tersedia/);
  });
  it('daftar model gagal dimuat → tolak (tak bisa divalidasi)', async () => {
    vi.mocked(listGeminiModels).mockResolvedValueOnce({ ok: false, error: 'Gagal menghubungi Google untuk daftar model.' });
    use(makeClient({ user: { id: UID }, tables: { employees: [{ data: HRD }] } }));
    const r = await saveAiSettings(VALID);
    expect(r.ok).toBe(false);
  });
  it('HRD di Mode SPV → tolak', async () => {
    cookieMode.value = 'spv';
    use(makeClient({ user: { id: UID }, tables: { employees: [{ data: HRD }] } }));
    const r = await saveAiSettings(VALID);
    expect(r.ok).toBe(false);
  });
  it('bukan HRD → tolak', async () => {
    use(makeClient({ user: { id: UID }, tables: { employees: [{ data: { role: 'spv', is_hrd_admin: false, hrd_sections: null } }] } }));
    expect((await saveAiSettings(VALID)).ok).toBe(false);
  });
  it('tabel belum ada → pesan migrasi 0060', async () => {
    use(makeClient({ user: { id: UID }, tables: { employees: [{ data: HRD }] } }));
    useAdmin(makeClient({ tables: { ai_settings: [{ data: null, error: { code: 'PGRST205', message: 'x' } }] } }));
    const r = await saveAiSettings(VALID);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/0060/);
  });
  it('model berubah → versi naik, ditulis via service_role, dicatat', async () => {
    use(makeClient({ user: { id: UID }, tables: { employees: [{ data: HRD }] } }));
    const admin = makeClient({ tables: { ai_settings: [{ data: ROW }, { data: null }] } });
    useAdmin(admin);
    const r = await saveAiSettings(VALID);
    expect(r).toEqual({ ok: true, version: 4 });
    const w = admin.calls.find((c) => c.op === 'upsert');
    expect(w?.payload).toMatchObject({ id: 1, model: 'gemini-3.8-flash', version: 4, updated_by: UID });
    expect(logHrdAction).toHaveBeenCalledWith(expect.objectContaining({ action: 'ai.settings_save' }));
  });
  it('hanya harga/kurs berubah → versi tetap', async () => {
    use(makeClient({ user: { id: UID }, tables: { employees: [{ data: HRD }] } }));
    useAdmin(makeClient({ tables: { ai_settings: [{ data: ROW }, { data: null }] } }));
    const r = await saveAiSettings({ ...VALID, model: 'gemini-2.5-flash', usdIdr: 17000 });
    expect(r).toEqual({ ok: true, version: 3 });
  });
});
