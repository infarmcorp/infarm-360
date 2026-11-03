import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { makeClient } from './helpers/mock-supabase';

/**
 * Catatan di Luar Pemetaan (migrasi 0054) — sisi BACA & isolasi.
 *
 * Yang dikunci:
 *  1. Hanya rute detail laporan 'hrd' (izin HRD + Mode Admin) yang boleh memuat catatan.
 *  2. Semua loader non-HRD-Admin (SPV, Koordinator, HRD Mode-SPV, Direksi, Tinjauan Hasil Akhir, grant Review)
 *     tak pernah menyentuh tabel catatan & tak membawa `outsideNotes` — fitur ini OPT-IN, bukan mengandalkan withoutRaw.
 *  3. HRD Mode Admin menerima catatan tentang dirinya sendiri (keputusan pemilik 2026-11-03), tetap tanpa identitas.
 *  4. Tabel catatan hanya disentuh dua file → skor/progress/kepatuhan/potongan telat/ekspor/final_reports tak mungkin
 *     terpengaruh, dengan atau tanpa catatan.
 *  5. Blok tampilan muncul/tersembunyi sesuai data.
 */
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(), createAdminClient: vi.fn() }));

import { createAdminClient } from '@/lib/supabase/server';
import { reportDetailRoute, type ActorRow } from '@/lib/auth/roles';
import { outsideNotesAllowed, withOutsideNotes, sortOutsideNotes } from '@/lib/outside-notes';
import {
  loadTeamReportForSpv, loadTeamReportForCoordinator, loadTeamReportForHrdSpv, loadSpvReportForDireksi,
  loadReportForDireksiReview, loadReport, reportForGrantViewer, withoutNamedFeedback, type ReportData,
} from '@/lib/report';
import { RawFeedback } from '@/app/(app)/laporan/raw-feedback';

const mockAdmin = vi.mocked(createAdminClient);
beforeEach(() => { vi.clearAllMocks(); });

// ── 1. Gerbang rute ────────────────────────────────────────────────────────────────────────────
describe('outsideNotesAllowed — hanya HRD di Mode Admin', () => {
  const hrd: ActorRow = { role: 'hrd' };
  const empHrd: ActorRow = { role: 'employee', is_hrd_admin: true };
  const cases: [string, ActorRow, 'admin' | 'spv', boolean, boolean][] = [
    ['HRD Mode Admin', hrd, 'admin', false, true],
    ['pegawai ber-izin HRD Mode Admin', empHrd, 'admin', false, true],
    ['HRD Mode-SPV', hrd, 'spv', false, false],
    ['pegawai ber-izin HRD mode posisi-asli', empHrd, 'spv', false, false],
    ['SPV', { role: 'spv' }, 'spv', false, false],
    ['Koordinator', { role: 'employee', is_coordinator: true }, 'spv', false, false],
    ['Direksi', { role: 'direksi' }, 'spv', false, false],
    ['pemegang grant Review', { role: 'employee' }, 'spv', true, false],
    ['HRD tanpa bagian Laporan + grant Review', { role: 'hrd', hrd_sections: ['pegawai'] }, 'admin', true, false],
    ['pegawai biasa', { role: 'employee' }, 'spv', false, false],
  ];
  it.each(cases)('%s', (_l, actor, mode, grant, expected) => {
    expect(outsideNotesAllowed(reportDetailRoute(actor, mode, grant))).toBe(expected);
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

// ── 2. Loader non-HRD-Admin ────────────────────────────────────────────────────────────────────
describe('loader non-HRD-Admin tak pernah memuat catatan', () => {
  const run: [string, () => Promise<ReportData | null>][] = [
    ['SPV (loadTeamReportForSpv)', () => loadTeamReportForSpv(ACTOR, EMP, PERIOD)],
    ['Koordinator (loadTeamReportForCoordinator)', () => loadTeamReportForCoordinator(ACTOR, EMP, PERIOD)],
    ['HRD Mode-SPV (loadTeamReportForHrdSpv)', () => loadTeamReportForHrdSpv(ACTOR, EMP, PERIOD)],
    ['Direksi (loadSpvReportForDireksi)', () => loadSpvReportForDireksi(ACTOR, EMP, PERIOD)],
    ['Tinjauan Hasil Akhir (loadReportForDireksiReview)', () => loadReportForDireksiReview(ACTOR, EMP, PERIOD)],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ['grant Review (loadReport → reportForGrantViewer)', async () => { const d = await loadReport(createAdminClient() as any, EMP, PERIOD); return d && reportForGrantViewer(d, { isSelf: false, isDireksi: false }); }],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ['laporan pegawai sendiri (loadReport)', () => loadReport(createAdminClient() as any, EMP, PERIOD)],
  ];
  it.each(run)('%s', async (_l, fn) => {
    const fake = fakeAdmin(NOTES);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockAdmin.mockReturnValue(fake as any);
    const data = await fn();
    expect(data).not.toBeNull(); // loader benar-benar berjalan sampai akhir (bukan lolos karena ditolak)
    expect(fake.calls.some((c) => c.table === 'outside_mapping_notes')).toBe(false);
    expect(data!.byAspect.every((a) => a.outsideNotes === undefined)).toBe(true);
    expect(JSON.stringify(data)).not.toContain('shift malam');
  });
});

// ── 3. Jalur HRD Mode Admin ────────────────────────────────────────────────────────────────────
describe('withOutsideNotes — jalur HRD Mode Admin', () => {
  async function hrdView(notes = NOTES, employeeId = EMP) {
    const fake = fakeAdmin(notes);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockAdmin.mockReturnValue(fake as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const base = withoutNamedFeedback((await loadReport(fake as any, employeeId, PERIOD))!);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return { data: await withOutsideNotes(fake as any, base, employeeId, PERIOD.id), fake };
  }

  it('menempel catatan ke aspeknya, urut abjad isi (bukan urutan kirim), aspek tanpa catatan tak berubah', async () => {
    const { data, fake } = await hrdView();
    const integritas = data.byAspect.find((a) => a.name === 'Integritas')!;
    expect(integritas.outsideNotes).toEqual([
      'Bersikap adil saat membagi lembur tim.',
      'Sering membantu shift malam tanpa diminta.',
    ]);
    expect(data.byAspect.find((a) => a.name === 'Kolaborasi')!.outsideNotes).toBeUndefined();
    const q = fake.calls.find((c) => c.table === 'outside_mapping_notes')!;
    expect(q.filters).toEqual(expect.arrayContaining([['eq', 'period_id', 'p4'], ['eq', 'target_id', EMP]]));
  });

  it('HRD membuka laporannya SENDIRI → catatan tentang dirinya tetap tampil (anonim)', async () => {
    const { data } = await hrdView(NOTES, ACTOR);
    expect(data.byAspect.find((a) => a.name === 'Integritas')!.outsideNotes).toHaveLength(2);
  });

  it('isi saja — tak ada nama/tanggal/relasi/divisi penulis di data', async () => {
    const { data } = await hrdView();
    const notes = data.byAspect.flatMap((a) => a.outsideNotes ?? []);
    expect(notes.every((n) => typeof n === 'string')).toBe(true);
    expect(data.assessors).toEqual([]); // L3 tetap dibuang
  });

  it('tabel belum ada / gagal baca → laporan dikembalikan apa adanya', async () => {
    const c = makeClient({ tables: { outside_mapping_notes: [{ error: { code: 'PGRST205', message: 'Could not find the table' } }] } });
    const base = { byAspect: [{ name: 'Integritas', indicators: [] }] } as unknown as ReportData;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(await withOutsideNotes(c as any, base, EMP, 'p4')).toBe(base);
  });

  it('sortOutsideNotes tak bergantung urutan masuk', () => {
    const a = ['Charlie datang tepat waktu.', 'alpha membantu.', 'Bravo jujur.'];
    expect(sortOutsideNotes(a)).toEqual(sortOutsideNotes([...a].reverse()));
    expect(sortOutsideNotes(a)[0]).toBe('alpha membantu.');
  });
});

// ── 4. Isolasi: tabel hanya disentuh dua file ─────────────────────────────────────────────────
describe('tabel catatan terisolasi dari skor, progress, kepatuhan, potongan telat, ekspor, final_reports', () => {
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
  it('hanya outside-note-actions.ts (tulis) & lib/outside-notes.ts (baca) yang menyebut tabelnya', () => {
    const files = [...walk(join(ROOT, 'app')), ...walk(join(ROOT, 'lib'))]
      .filter((p) => readFileSync(p, 'utf8').includes('outside_mapping_notes'))
      .map((p) => relative(ROOT, p).replace(/\\/g, '/'))
      .sort();
    expect(files).toEqual(['app/(app)/penilaian/outside-note-actions.ts', 'lib/outside-notes.ts']);
  });
  it('withOutsideNotes hanya dipanggil di detail laporan (jalur HRD Mode Admin)', () => {
    const callers = [...walk(join(ROOT, 'app')), ...walk(join(ROOT, 'lib'))]
      .filter((p) => !p.endsWith('outside-notes.ts') && readFileSync(p, 'utf8').includes('withOutsideNotes('))
      .map((p) => relative(ROOT, p).replace(/\\/g, '/'));
    expect(callers).toEqual(['app/(app)/laporan/[employeeId]/page.tsx']);
  });
  it('outsideNotesForExport hanya dipanggil ekspor Bahan Laporan (gerbang Mode Admin di sana)', () => {
    const callers = [...walk(join(ROOT, 'app')), ...walk(join(ROOT, 'lib'))]
      .filter((p) => !p.endsWith('outside-notes.ts') && readFileSync(p, 'utf8').includes('outsideNotesForExport('))
      .map((p) => relative(ROOT, p).replace(/\\/g, '/'));
    expect(callers).toEqual(['app/(app)/admin/ekspor/actions.ts']);
  });
});

// ── 5. Tampilan RawFeedback ───────────────────────────────────────────────────────────────────
describe('RawFeedback — blok Catatan di Luar Pemetaan', () => {
  const ind = { num: 1, text: 'Jujur', ratings: [4], entries: [{ rating: 4, comment: 'Konsisten jujur di lapangan.' }] };
  const html = (byAspect: ReportData['byAspect'], essays: ReportData['essays'] = []) =>
    renderToStaticMarkup(createElement(RawFeedback, { byAspect, essays }));

  it('aspek dengan catatan → blok tampil setelah indikator, dengan label jumlah & tanpa ikut dicetak', () => {
    const out = html([{ name: 'Integritas', indicators: [ind], outsideNotes: ['Catatan pertama yang cukup panjang.'] }]);
    expect(out).toContain('Catatan di Luar Pemetaan');
    expect(out).toContain('catatan · tanpa rating · hanya HRD');
    expect(out).toContain('no-print');
    expect(out.indexOf('Pertanyaan #1')).toBeLessThan(out.indexOf('Catatan di Luar Pemetaan'));
  });

  it('aspek tanpa catatan → blok tidak tampil', () => {
    const out = html([{ name: 'Integritas', indicators: [ind] }]);
    expect(out).not.toContain('Catatan di Luar Pemetaan');
  });

  it('aspek yang isinya HANYA catatan tetap tampil & "Belum ada umpan balik" tidak muncul', () => {
    const out = html([{ name: 'Kolaborasi', indicators: [], outsideNotes: ['Satu-satunya catatan untuk aspek ini.'] }]);
    expect(out).toContain('Kolaborasi');
    expect(out).toContain('Satu-satunya catatan');
    expect(out).not.toContain('Belum ada umpan balik');
  });

  it('tanpa indikator, esai, maupun catatan → "Belum ada umpan balik"', () => {
    expect(html([{ name: 'Kolaborasi', indicators: [] }])).toContain('Belum ada umpan balik');
  });
});
