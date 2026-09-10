import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeClient, type MockClient } from './helpers/mock-supabase';

/**
 * Gembok "masa kerja" pada input KPI (kebijakan 2026-09-10): pegawai NONAKTIF hanya boleh
 * diberi KPI untuk bulan yang masih ia kerjakan (ym ≤ bulan `left_on`).
 *
 * Kenapa diuji: deaktivasi sengaja TIDAK mengeluarkan orang dari `spv_team_members` (agar
 * reversibel), jadi daftar penilai tetap memuat mereka. Bila gembok ini longgar, KPI bisa
 * tercatat untuk bulan setelah orangnya keluar — dan itu **salah diam-diam**: tak ada error,
 * hanya rerata kuartal & Skor Akhir yang jadi keliru. Penyaringan di UI cuma tampilan; ini
 * lapisan yang benar-benar menolak (impor Excel, tab lama, panggilan langsung).
 */
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(), createAdminClient: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { createClient, createAdminClient } from '@/lib/supabase/server';
import { saveKpiScores } from '@/app/(app)/kpi/actions';

const mockCreate = vi.mocked(createClient);
const mockAdmin = vi.mocked(createAdminClient);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function use(c: MockClient) { mockCreate.mockResolvedValue(c as any); return c; }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function useAdmin(c: MockClient) { mockAdmin.mockReturnValue(c as any); return c; }

const UID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const EMP = '11111111-1111-1111-1111-111111111111';
/** Pelaku HRD (bukan koordinator) → melewati percabangan koordinator & SPV. */
const HRD = { role: 'hrd', is_coordinator: false };
const ROWS = [{ employeeId: EMP, score: 90 }];

/** Status pegawai yang dikembalikan lookup service_role sebelum penyimpanan. */
function status(rows: { is_active: boolean; left_on: string | null }[]) {
  return { employees: [{ data: rows.map((r) => ({ id: EMP, name: 'Budi', ...r })) }] };
}

beforeEach(() => { vi.clearAllMocks(); });

describe('saveKpiScores — batas masa kerja pegawai nonaktif', () => {
  it('TOLAK bulan setelah tanggal keluar', async () => {
    use(makeClient({ user: { id: UID }, tables: { employees: [{ data: HRD }] } }));
    useAdmin(makeClient({ tables: status([{ is_active: false, left_on: '2026-08-15' }]) }));
    const r = await saveKpiScores({ ym: '2026-09', rows: ROWS });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toMatch(/nonaktif/i);
      expect(r.error).toContain('Budi'); // sebut namanya — penilai perlu tahu baris mana
    }
  });

  it('TOLAK nonaktif tanpa tanggal keluar (deaktivasi lama, tanpa acuan batas)', async () => {
    use(makeClient({ user: { id: UID }, tables: { employees: [{ data: HRD }] } }));
    useAdmin(makeClient({ tables: status([{ is_active: false, left_on: null }]) }));
    const r = await saveKpiScores({ ym: '2026-07', rows: ROWS });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/nonaktif/i);
  });

  /**
   * Dua kasus LOLOS gembok: dibuktikan dengan berhentinya alur di pemeriksaan BERIKUTNYA
   * ("bulan di luar periode aktif"). Kalau gembok keliru menolak, pesannya akan menyebut
   * "nonaktif" — jadi tes ini menangkap gembok yang terlalu ketat, bukan sekadar yang longgar.
   */
  it('IZINKAN bulan sebelum tanggal keluar (masa kerja yang sah)', async () => {
    use(makeClient({ user: { id: UID }, tables: {
      employees: [{ data: HRD }],
      period_months: [{ data: null }],
    } }));
    useAdmin(makeClient({ tables: status([{ is_active: false, left_on: '2026-08-15' }]) }));
    const r = await saveKpiScores({ ym: '2026-07', rows: ROWS });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/periode aktif/i);
  });

  it('IZINKAN bulan keluar itu sendiri (batas inklusif — ia masih bekerja sebagian bulan itu)', async () => {
    use(makeClient({ user: { id: UID }, tables: {
      employees: [{ data: HRD }],
      period_months: [{ data: null }],
    } }));
    useAdmin(makeClient({ tables: status([{ is_active: false, left_on: '2026-08-15' }]) }));
    const r = await saveKpiScores({ ym: '2026-08', rows: ROWS });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/periode aktif/i);
  });

  it('pegawai AKTIF tak tersentuh gembok ini', async () => {
    use(makeClient({ user: { id: UID }, tables: {
      employees: [{ data: HRD }],
      period_months: [{ data: null }],
    } }));
    useAdmin(makeClient({ tables: status([{ is_active: true, left_on: null }]) }));
    const r = await saveKpiScores({ ym: '2026-12', rows: ROWS });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/periode aktif/i);
  });
});
