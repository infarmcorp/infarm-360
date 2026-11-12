import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeClient, type MockClient } from './helpers/mock-supabase';

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(), createAdminClient: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/audit/log', () => ({ logHrdAction: vi.fn(async () => {}), logAuditAsService: vi.fn(async () => {}) }));
vi.mock('@/lib/late-server', () => ({ refreshLatePenalties: vi.fn(async () => 0) }));
vi.mock('next/headers', () => ({ cookies: vi.fn(async () => ({ get: () => ({ value: 'admin' }) })) }));
vi.mock('@/lib/report', async (orig) => ({ ...(await orig<typeof import('@/lib/report')>()), loadReport: vi.fn() }));
vi.mock('@/lib/ai/settings', async (orig) => {
  const m = await orig<typeof import('@/lib/ai/settings')>();
  return { ...m, loadAiSettings: vi.fn(async () => ({ ...m.defaultAiSettings('db'), aspectPrompt: 'PROMPT ASPEK UJI', version: 7 })) };
});
vi.mock('@/lib/ai/gemini', async (orig) => ({
  ...(await orig<typeof import('@/lib/ai/gemini')>()),
  aiSummaryEnabled: vi.fn(() => true),
  summarizeWithGemini: vi.fn(),
}));

import { createClient, createAdminClient } from '@/lib/supabase/server';
import { loadReport, type ReportData } from '@/lib/report';
import { aiSummaryEnabled, summarizeWithGemini } from '@/lib/ai/gemini';
import { logHrdAction } from '@/lib/audit/log';
import { suggestSummariesAI } from '@/app/(app)/admin/laporan/actions';

const mockCreate = vi.mocked(createClient);
const mockAdmin = vi.mocked(createAdminClient);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const use = (c: MockClient) => mockCreate.mockResolvedValue(c as any);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const useAdmin = (c: MockClient) => mockAdmin.mockReturnValue(c as any);

const UID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const EMP = '11111111-1111-1111-1111-111111111111';
const HRD = { role: 'hrd', is_hrd_admin: false, name: 'HRD' };

const REPORT: ReportData = {
  emp: { id: EMP, name: 'Pegawai Rahasia', dept: 'Sales' },
  periodLabel: 'Q3 2026', has360: true, status: 'draft', finalScore: null, kpiAvg: null, s360: null, latePenalty360: 0,
  aspects: [{ name: 'Jujur', score: 4, self: null }, { name: 'Gigih', score: null, self: null }],
  assessors: [{ assessorId: 'x', assessorName: 'Nama Penilai Rahasia', relation: 'Atasan', isSelf: false,
    comments: [{ indicator: 'Menepati komitmen', rating: 4, comment: 'komentar bernama' }], answers: [] }],
  byAspect: [{ name: 'Jujur', indicators: [{ num: 1, text: 'Menepati komitmen', ratings: [4], entries: [{ rating: 4, comment: 'Selalu tepat waktu' }] }] }],
  essays: [], aspectSummaries: {}, qualSummaries: {}, qualQuestions: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(aiSummaryEnabled).mockReturnValue(true);
  vi.mocked(loadReport).mockResolvedValue(REPORT);
});

describe('suggestSummariesAI', () => {
  it('nonaktif (production / tanpa kunci) → tolak sebelum menyentuh DB', async () => {
    vi.mocked(aiSummaryEnabled).mockReturnValue(false);
    const r = await suggestSummariesAI({ employeeId: EMP, kind: 'aspect' });
    expect(r.ok).toBe(false);
    expect(mockCreate).not.toHaveBeenCalled();
    expect(summarizeWithGemini).not.toHaveBeenCalled();
  });

  it('input tidak valid ditolak', async () => {
    const r = await suggestSummariesAI({ employeeId: 'bukan-uuid', kind: 'aspect' });
    expect(r.ok).toBe(false);
  });

  it('bukan penulis ringkasan → tolak, Gemini tak dipanggil', async () => {
    use(makeClient({ user: { id: UID }, tables: { employees: [{ data: { role: 'spv' } }], page_grants: [{ data: [] }] } }));
    const r = await suggestSummariesAI({ employeeId: EMP, kind: 'aspect' });
    expect(r.ok).toBe(false);
    expect(summarizeWithGemini).not.toHaveBeenCalled();
  });

  it('laporan Final → tolak', async () => {
    use(makeClient({ user: { id: UID }, tables: { employees: [{ data: HRD }] } }));
    useAdmin(makeClient({ tables: {
      periods: [{ data: { id: 'p1', label: 'Q3 2026', has_360: true } }],
      final_reports: [{ data: { status: 'finalized' } }],
    } }));
    const r = await suggestSummariesAI({ employeeId: EMP, kind: 'aspect' });
    expect(r.ok).toBe(false);
    expect(summarizeWithGemini).not.toHaveBeenCalled();
  });

  it('sukses: bahan anonim (tanpa nama pegawai/penilai), biaya dihitung, saran tak disimpan', async () => {
    const admin = makeClient({ tables: {
      periods: [{ data: { id: 'p1', label: 'Q3 2026', has_360: true } }],
      final_reports: [{ data: { status: 'draft' } }],
    } });
    use(makeClient({ user: { id: UID }, tables: { employees: [{ data: HRD }] } }));
    useAdmin(admin);
    vi.mocked(summarizeWithGemini).mockResolvedValue({
      ok: true, summaries: { Jujur: 'Konsisten.' }, model: 'm', usage: { inputTokens: 1000, outputTokens: 200, thoughtTokens: 0 },
    });
    const r = await suggestSummariesAI({ employeeId: EMP, kind: 'aspect' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.summaries).toEqual({ Jujur: 'Konsisten.' });
    expect(r.skipped).toEqual(['Gigih']);
    expect(r.version).toBe(7);
    expect(r.model).toBe('Gemini 2.5 Flash');
    expect(r.cost.idr).toBeGreaterThan(0);

    const [prompt, material, keys, , opts] = vi.mocked(summarizeWithGemini).mock.calls[0];
    expect(prompt).toBe('PROMPT ASPEK UJI'); // prompt dari Pengaturan AI, bukan bawaan kode
    expect(opts).toEqual({ model: 'gemini-2.5-flash', thinking: 'off' });
    expect(keys).toEqual(['Jujur']);
    expect(material).toContain('Selalu tepat waktu');
    expect(material).not.toContain('Nama Penilai Rahasia');
    expect(material).not.toContain('komentar bernama');
    expect(material).not.toContain('Pegawai Rahasia');
    expect(material).not.toContain('Sales');
    // Saran saja — final_reports tak ditulis.
    expect(admin.calls.filter((c) => c.op !== 'select')).toEqual([]);
    expect(logHrdAction).toHaveBeenCalledWith(expect.objectContaining({ action: 'report.ai_summary' }));
  });

  it('tanpa komentar → tolak tanpa memanggil Gemini', async () => {
    vi.mocked(loadReport).mockResolvedValue({ ...REPORT, byAspect: [] });
    use(makeClient({ user: { id: UID }, tables: { employees: [{ data: HRD }] } }));
    useAdmin(makeClient({ tables: {
      periods: [{ data: { id: 'p1', label: 'Q3 2026', has_360: true } }],
      final_reports: [{ data: null }],
    } }));
    const r = await suggestSummariesAI({ employeeId: EMP, kind: 'aspect' });
    expect(r.ok).toBe(false);
    expect(summarizeWithGemini).not.toHaveBeenCalled();
  });
});
