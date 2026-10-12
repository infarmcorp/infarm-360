import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fakeDb } from './helpers/fake-postgrest';

// Ekspor Dataset: isi file tak boleh berubah saat normal; saat gangguan baca → pesan gagal
// berbahasa Indonesia, BUKAN file yang diam-diam terpotong.
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(), createAdminClient: vi.fn() }));

import { createClient, createAdminClient } from '@/lib/supabase/server';
import { exportAssessments, exportQualAnswers, exportHrdAuditLog, exportKpi } from '@/app/(app)/admin/ekspor/actions';

const mockCreate = vi.mocked(createClient);
const mockAdmin = vi.mocked(createAdminClient);
const U = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const id = (p: string, i: number) => `${p}0000000-0000-0000-0000-${String(i).padStart(12, '0')}`;

function asHrd() {
  const db = fakeDb({ employees: [{ id: U, role: 'hrd', is_hrd_admin: false, hrd_sections: null }] });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockCreate.mockResolvedValue(Object.assign(db, { auth: { getUser: async () => ({ data: { user: { id: U } } }) } }) as any);
}

/** nAsmt penilaian terkirim × 10 indikator (+ jawaban esai), satu periode. */
function tables(nAsmt: number) {
  const emps = [{ id: id('e', 0), emp_code: 'E0', name: 'Target', dept: 'Ops' },
    ...Array.from({ length: nAsmt }, (_, i) => ({ id: id('e', i + 1), emp_code: `E${i + 1}`, name: `Penilai ${i + 1}`, dept: 'Ops' }))];
  const asmts = Array.from({ length: nAsmt }, (_, i) => ({ id: id('a', i), period_id: 'p1', assessor_id: id('e', i + 1), target_id: id('e', 0), status: 'submitted' }));
  const inds = Array.from({ length: 10 }, (_, k) => ({ id: id('i', k), text: `Indikator ${k}`, aspect_id: 'asp1' }));
  const scores = asmts.flatMap((a, i) => inds.map((ind, k) => ({ assessment_id: a.id, indicator_id: ind.id, rating: 1 + ((i + k) % 5), comment: `c${i}-${k}` })));
  const answers = asmts.map((a, i) => ({ assessment_id: a.id, question_id: 'q1', answer: `jawaban ${i}` }));
  return {
    employees: emps, periods: [{ id: 'p1', label: 'Q3 2026' }], assessments: asmts, indicators: inds,
    culture_aspects: [{ id: 'asp1', name: 'Integritas' }],
    mappings: asmts.map((a) => ({ assessor_id: a.assessor_id, target_id: a.target_id, period_id: 'p1', relation: 'peer' })),
    assessment_indicator_scores: scores, assessment_qual_answers: answers,
    qualitative_questions: [{ id: 'q1', text: 'Saran?' }],
  };
}

beforeEach(() => { vi.clearAllMocks(); asHrd(); });

describe('Ekspor — isi file saat normal tidak berubah', () => {
  it('Penilaian 360° (data kecil): isi persis sama', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockAdmin.mockReturnValue(fakeDb(tables(3)) as any);
    expect(await exportAssessments('p1')).toMatchSnapshot();
  });

  it('Umpan balik esai (data kecil): isi persis sama', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockAdmin.mockReturnValue(fakeDb(tables(3)) as any);
    expect(await exportQualAnswers('p1')).toMatchSnapshot();
  });

  it('Penilaian 360° (200 penilaian × 10 indikator = 2.000 baris skor): lengkap', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockAdmin.mockReturnValue(fakeDb(tables(200)) as any);
    const r = await exportAssessments('p1');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.rows).toHaveLength(2000);
  });
});

describe('Ekspor — gangguan baca → pesan gagal, bukan file terpotong', () => {
  const GAGAL = /Gagal mengambil data.*File tidak dibuat/;

  it('skor per-indikator gagal dibaca', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockAdmin.mockReturnValue(fakeDb(tables(3), { failOn: ['assessment_indicator_scores'] }) as any);
    const r = await exportAssessments('p1');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(GAGAL);
  });

  it('jawaban esai gagal dibaca', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockAdmin.mockReturnValue(fakeDb(tables(3), { failOn: ['assessment_qual_answers'] }) as any);
    const r = await exportQualAnswers('p1');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(GAGAL);
  });

  it('daftar penilaian gagal dibaca (query berhalaman lain)', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockAdmin.mockReturnValue(fakeDb(tables(3), { failOn: ['assessments'] }) as any);
    const r = await exportAssessments('p1');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(GAGAL);
  });

  it('Log Aktivitas HRD gagal dibaca', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockAdmin.mockReturnValue(fakeDb({}, { failOn: ['hrd_audit_log'] }) as any);
    const r = await exportHrdAuditLog();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(GAGAL);
  });

  it('KPI gagal dibaca', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockAdmin.mockReturnValue(fakeDb({ periods: [], period_months: [], employees: [] }, { failOn: ['kpi_scores'] }) as any);
    const r = await exportKpi(null);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(GAGAL);
  });

  it('bukan HRD tetap ditolak seperti biasa', async () => {
    const db = fakeDb({ employees: [{ id: U, role: 'spv', is_hrd_admin: false, hrd_sections: null }] });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockCreate.mockResolvedValue(Object.assign(db, { auth: { getUser: async () => ({ data: { user: { id: U } } }) } }) as any);
    expect(await exportKpi(null)).toEqual({ ok: false, error: 'Hanya HRD' });
  });
});
