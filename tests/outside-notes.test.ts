import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { makeClient } from './helpers/mock-supabase';

/**
 * Laporkan Pelanggaran (tabel catatan 0054 + 0058; dulu Catatan di Luar Pemetaan) — sisi BACA & isolasi.
 *
 * Yang dikunci:
 *  1. Halaman Laporan Pelanggaran hanya untuk HRD berbagian Review & Finalisasi di Mode Admin, atau Direksi.
 *  2. Semua loader laporan (SPV, Koordinator, HRD Mode-SPV, Direksi, Tinjauan Hasil Akhir, grant Review, pegawai)
 *     tak pernah menyentuh tabel laporan — sejak 2026-11-10 laporan juga TIDAK lagi tampil di rincian komentar HRD.
 *  3. Pembacaan: isian pelapor saja (tanpa penulis/waktu kirim), cadangan bila kolom 0058 belum ada, urutan tampil
 *     = tanggal kejadian terbaru lalu abjad isi (bukan urutan masuk).
 *  4. Tabel hanya disentuh dua file; pembacanya hanya halaman Laporan Pelanggaran & ekspor Bahan Laporan.
 */
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(), createAdminClient: vi.fn() }));

import { createAdminClient } from '@/lib/supabase/server';
import type { ActorRow } from '@/lib/auth/roles';
import { violationPageAllowed, loadViolationReports, sortViolations } from '@/lib/outside-notes';
import {
  loadTeamReportForSpv, loadTeamReportForCoordinator, loadTeamReportForHrdSpv, loadSpvReportForDireksi,
  loadReportForDireksiReview, loadReport, reportForGrantViewer, type ReportData,
} from '@/lib/report';
import { RawFeedback } from '@/app/(app)/laporan/raw-feedback';

const mockAdmin = vi.mocked(createAdminClient);
beforeEach(() => { vi.clearAllMocks(); });

// ── 1. Gerbang halaman ─────────────────────────────────────────────────────────────────────────
describe('violationPageAllowed — HRD (bagian Review & Finalisasi) di Mode Admin, atau Direksi', () => {
  const cases: [string, ActorRow, 'admin' | 'spv', boolean][] = [
    ['HRD Mode Admin', { role: 'hrd' }, 'admin', true],
    ['pegawai ber-izin HRD Mode Admin', { role: 'employee', is_hrd_admin: true }, 'admin', true],
    ['HRD Mode-SPV', { role: 'hrd' }, 'spv', false],
    ['HRD tanpa bagian Laporan', { role: 'hrd', hrd_sections: ['pegawai'] }, 'admin', false],
    ['HRD dengan bagian Laporan saja', { role: 'hrd', hrd_sections: ['laporan'] }, 'admin', true],
    ['SPV', { role: 'spv' }, 'admin', false],
    ['Koordinator', { role: 'employee', is_coordinator: true }, 'admin', false],
    ['Direksi', { role: 'direksi' }, 'admin', true],
    ['Direksi (cookie mode apa pun)', { role: 'direksi' }, 'spv', true],
    ['pegawai biasa', { role: 'employee' }, 'admin', false],
  ];
  it.each(cases)('%s', (_l, actor, mode, expected) => {
    expect(violationPageAllowed(actor, mode)).toBe(expected);
  });
});

// ── Klien palsu permisif (service_role) untuk menjalankan loader penuh ────────────────────────
type Call = { table: string; filters: unknown[][] };
const EMP = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const ACTOR = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const PERIOD = { id: 'p4', label: 'Q4 2026', has_360: true };
const PEOPLE: Record<string, Record<string, unknown>> = {
  [EMP]: { id: EMP, name: 'Target', dept: 'Gudang', role: 'spv', is_external: false },
  [ACTOR]: { id: ACTOR, name: 'Pelaku', dept: 'Gudang', role: 'direksi' },
};

function fakeAdmin(notes: { aspect_id: string; body: string }[] = []) {
  const calls: Call[] = [];
  const client = {
    calls,
    from(table: string) {
      const filters: unknown[][] = [];
      const one = (): unknown => {
        const id = filters.find((f) => f[0] === 'eq' && f[1] === 'id')?.[2] as string | undefined;
        switch (table) {
          case 'employees': return id ? PEOPLE[id] ?? null : null;
          case 'final_reports': return { status: 'finalized', final_score: 80, content: {} };
          case 'coordinator_team_members': return { employee_id: EMP };
          case 'periods': return { start_date: '2026-10-01' };
          default: return null;
        }
      };
      const many = (): unknown[] => {
        if (table === 'culture_aspects') return [{ id: 'a1', name: 'Integritas', order_idx: 1 }, { id: 'a2', name: 'Kolaborasi', order_idx: 2 }];
        if (table === 'outside_mapping_notes') return notes;
        return [];
      };
      const settle = (single: boolean) => {
        calls.push({ table, filters: [...filters] });
        return Promise.resolve({ data: single ? one() : many(), error: null, count: 0 });
      };
      const b: Record<string, unknown> = {};
      for (const m of ['select', 'order', 'limit', 'range', 'in', 'neq', 'not', 'is', 'ilike', 'or']) {
        b[m] = (...args: unknown[]) => { if (m === 'in') filters.push(['in', ...args]); return b; };
      }
      b.eq = (col: string, val: unknown) => { filters.push(['eq', col, val]); return b; };
      b.maybeSingle = () => settle(true);
      b.single = () => settle(true);
      b.then = (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) => settle(false).then(ok, bad);
      return b;
    },
  };
  return client;
}

const NOTES = [
  { aspect_id: 'a1', body: 'Sering membantu shift malam tanpa diminta.' },
  { aspect_id: 'a1', body: 'Bersikap adil saat membagi lembur tim.' },
];

// ── 2. Loader laporan tak pernah memuat laporan pelanggaran ────────────────────────────────────
describe('loader laporan tak pernah memuat laporan pelanggaran', () => {
  const run: [string, () => Promise<ReportData | null>][] = [
    ['SPV (loadTeamReportForSpv)', () => loadTeamReportForSpv(ACTOR, EMP, PERIOD)],
    ['Koordinator (loadTeamReportForCoordinator)', () => loadTeamReportForCoordinator(ACTOR, EMP, PERIOD)],
    ['HRD Mode-SPV (loadTeamReportForHrdSpv)', () => loadTeamReportForHrdSpv(ACTOR, EMP, PERIOD)],
    ['Direksi (loadSpvReportForDireksi)', () => loadSpvReportForDireksi(ACTOR, EMP, PERIOD)],
    ['Tinjauan Hasil Akhir (loadReportForDireksiReview)', () => loadReportForDireksiReview(ACTOR, EMP, PERIOD)],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ['grant Review (loadReport → reportForGrantViewer)', async () => { const d = await loadReport(createAdminClient() as any, EMP, PERIOD); return d && reportForGrantViewer(d, { isSelf: false, isDireksi: false }); }],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ['laporan HRD / pegawai (loadReport)', () => loadReport(createAdminClient() as any, EMP, PERIOD)],
  ];
  it.each(run)('%s', async (_l, fn) => {
    const fake = fakeAdmin(NOTES);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockAdmin.mockReturnValue(fake as any);
    const data = await fn();
    expect(data).not.toBeNull(); // loader benar-benar berjalan sampai akhir (bukan lolos karena ditolak)
    expect(fake.calls.some((c) => c.table === 'outside_mapping_notes')).toBe(false);
    expect(JSON.stringify(data)).not.toContain('shift malam');
  });
});

// ── 3. Pembacaan untuk halaman & ekspor ───────────────────────────────────────────────────────
describe('loadViolationReports', () => {
  const ROW = {
    period_id: 'p4', target_id: EMP, aspect_id: null, is_other: true,
    incident_date: '2026-10-20', body: '  Isi laporan yang cukup panjang.  ', note: '   ',
  };

  it('isian pelapor saja, di-trim; catatan kosong → null; filter periode', async () => {
    const c = makeClient({ tables: { outside_mapping_notes: [{ data: [ROW] }] } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = await loadViolationReports(c as any, 'p4');
    expect(rows).toEqual([{ ...ROW, body: 'Isi laporan yang cukup panjang.', note: null }]);
    expect(c.calls[0].filters).toEqual(expect.arrayContaining([['eq', 'period_id', 'p4']]));
  });

  it('kolom 0058 belum ada → baca kolom lama (tanpa tanggal/Lainnya/catatan)', async () => {
    const c = makeClient({ tables: { outside_mapping_notes: [
      { error: { code: '42703', message: 'column outside_mapping_notes.is_other does not exist' } },
      { data: [{ period_id: 'p4', target_id: EMP, aspect_id: 'a1', body: 'Laporan lama sebelum pembaruan.' }] },
    ] } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = await loadViolationReports(c as any, 'p4');
    expect(rows).toEqual([{ period_id: 'p4', target_id: EMP, aspect_id: 'a1', is_other: false, incident_date: null, body: 'Laporan lama sebelum pembaruan.', note: null }]);
  });

  it('tabel belum ada (0054) → kosong; gangguan lain dilempar', async () => {
    const missing = makeClient({ tables: { outside_mapping_notes: [{ error: { code: 'PGRST205', message: 'Could not find the table' } }] } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(await loadViolationReports(missing as any)).toEqual([]);
    const broken = makeClient({ tables: { outside_mapping_notes: [{ error: { code: '57014', message: 'canceling statement due to statement timeout' } }] } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(loadViolationReports(broken as any)).rejects.toThrow();
  });
});

describe('sortViolations — tanggal kejadian terbaru, lalu abjad isi; tak bergantung urutan masuk', () => {
  const xs = [
    { incident_date: null, body: 'Tanpa tanggal.' },
    { incident_date: '2026-10-01', body: 'Bravo.' },
    { incident_date: '2026-11-04', body: 'Terbaru.' },
    { incident_date: '2026-10-01', body: 'alpha.' },
  ];
  it('urutan', () => {
    expect(sortViolations(xs).map((x) => x.body)).toEqual(['Terbaru.', 'alpha.', 'Bravo.', 'Tanpa tanggal.']);
    expect(sortViolations([...xs].reverse())).toEqual(sortViolations(xs));
  });
});

// ── 4. Isolasi ────────────────────────────────────────────────────────────────────────────────
describe('tabel laporan terisolasi dari skor, progress, kepatuhan, potongan telat, laporan pegawai, final_reports', () => {
  const ROOT = join(__dirname, '..');
  function walk(dir: string, out: string[] = []): string[] {
    for (const f of readdirSync(dir)) {
      if (f === 'node_modules' || f.startsWith('.')) continue;
      const p = join(dir, f);
      if (statSync(p).isDirectory()) walk(p, out);
      else if (/\.(ts|tsx)$/.test(f) && !f.endsWith('database.types.ts')) out.push(p);
    }
    return out;
  }
  const src = () => [...walk(join(ROOT, 'app')), ...walk(join(ROOT, 'lib'))];
  it('hanya outside-note-actions.ts (tulis) & lib/outside-notes.ts (baca) yang menyebut tabelnya', () => {
    const files = src()
      .filter((p) => readFileSync(p, 'utf8').includes('outside_mapping_notes'))
      .map((p) => relative(ROOT, p).replace(/\\/g, '/'))
      .sort();
    expect(files).toEqual(['app/(app)/penilaian/outside-note-actions.ts', 'lib/outside-notes.ts']);
  });
  it('loadViolationReports hanya dipanggil halaman Laporan Pelanggaran & ekspor Bahan Laporan', () => {
    const callers = src()
      .filter((p) => !p.endsWith('outside-notes.ts') && readFileSync(p, 'utf8').includes('loadViolationReports('))
      .map((p) => relative(ROOT, p).replace(/\\/g, '/'))
      .sort();
    expect(callers).toEqual(['app/(app)/admin/ekspor/actions.ts', 'app/(app)/admin/pelanggaran/page.tsx']);
  });
  it('halaman Laporan Pelanggaran memeriksa gerbang sebelum membaca', () => {
    const page = readFileSync(join(ROOT, 'app/(app)/admin/pelanggaran/page.tsx'), 'utf8');
    expect(page.indexOf('violationPageAllowed(')).toBeGreaterThan(-1);
    expect(page.indexOf('violationPageAllowed(')).toBeLessThan(page.indexOf('loadViolationReports('));
  });
  it('detail laporan pegawai tak lagi memuat laporan pelanggaran', () => {
    const detail = readFileSync(join(ROOT, 'app/(app)/laporan/[employeeId]/page.tsx'), 'utf8');
    expect(detail).not.toMatch(/outside-notes|withOutsideNotes/);
  });
});

// ── 5. Rincian komentar laporan ───────────────────────────────────────────────────────────────
describe('RawFeedback tanpa blok laporan pelanggaran', () => {
  const ind = { num: 1, text: 'Jujur', ratings: [4], entries: [{ rating: 4, comment: 'Konsisten jujur di lapangan.' }] };
  const html = (byAspect: ReportData['byAspect'], essays: ReportData['essays'] = []) =>
    renderToStaticMarkup(createElement(RawFeedback, { byAspect, essays }));

  it('aspek berindikator tampil tanpa blok catatan/laporan', () => {
    const out = html([{ name: 'Integritas', indicators: [ind] }]);
    expect(out).toContain('Konsisten jujur di lapangan.');
    expect(out).not.toMatch(/Catatan di Luar Pemetaan|Laporan Pelanggaran/);
  });

  it('tanpa indikator maupun esai → "Belum ada umpan balik"', () => {
    expect(html([{ name: 'Kolaborasi', indicators: [] }])).toContain('Belum ada umpan balik');
  });
});
