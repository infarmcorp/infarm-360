import { describe, it, expect, vi } from 'vitest';
import { fetchAllPaged, fetchAllByIds } from '@/lib/supabase/paginate';

type Res<T> = { data: T[] | null; error: unknown };
const rows = (n: number, start = 0) => Array.from({ length: n }, (_, i) => start + i);

describe('fetchAllPaged — paginasi 1000 baris/request', () => {
  it('halaman tepat 1000 → meminta halaman berikutnya; berhenti saat halaman < 1000', async () => {
    const run = vi.fn(async (from: number, _to: number): Promise<Res<number>> => {
      if (from === 0) return { data: rows(1000, 0), error: null };
      if (from === 1000) return { data: rows(1000, 1000), error: null };
      return { data: rows(5, 2000), error: null };
    });
    const out = await fetchAllPaged(run);
    expect(run).toHaveBeenCalledTimes(3);
    expect(run.mock.calls).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
    expect(out).toHaveLength(2005);
    expect(out).toEqual(rows(2005)); // urutan sambungan = urutan halaman
  });

  it('halaman pertama 999 baris → berhenti setelah satu request', async () => {
    const run = vi.fn(async (_from: number, _to: number): Promise<Res<number>> => ({ data: rows(999), error: null }));
    const out = await fetchAllPaged(run);
    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith(0, 999);
    expect(out).toHaveLength(999);
  });

  it('tepat 1000 lalu halaman kosong → dua request, 1000 baris', async () => {
    const run = vi.fn(async (from: number, _to: number): Promise<Res<number>> =>
      ({ data: from === 0 ? rows(1000) : [], error: null }));
    const out = await fetchAllPaged(run);
    expect(run).toHaveBeenCalledTimes(2);
    expect(out).toHaveLength(1000);
  });

  it('data null tanpa error → berhenti, hasil kosong', async () => {
    const run = vi.fn(async (): Promise<Res<number>> => ({ data: null, error: null }));
    await expect(fetchAllPaged(run)).resolves.toEqual([]);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('error dilempar (tidak ditelan) dengan message dari objek error', async () => {
    const run = vi.fn(async (): Promise<Res<number>> => ({ data: null, error: { message: 'boom' } }));
    await expect(fetchAllPaged(run)).rejects.toThrow('boom');
  });

  it('error di halaman kedua tetap dilempar (hasil parsial tidak dikembalikan)', async () => {
    const run = vi.fn(async (from: number): Promise<Res<number>> =>
      from === 0 ? { data: rows(1000), error: null } : { data: null, error: { message: 'halaman 2 gagal' } });
    await expect(fetchAllPaged(run)).rejects.toThrow('halaman 2 gagal');
  });

  it('error tanpa message → pesan baku "query gagal"', async () => {
    await expect(fetchAllPaged<number>(async () => ({ data: null, error: 'x' }))).rejects.toThrow('query gagal');
    await expect(fetchAllPaged<number>(async () => ({ data: null, error: { code: '1' } }))).rejects.toThrow('query gagal');
  });

  it('error bernilai falsy (mis. "") dianggap tidak ada error', async () => {
    await expect(fetchAllPaged<number>(async () => ({ data: [1], error: '' }))).resolves.toEqual([1]);
  });
});

describe('fetchAllByIds — chunk id 150 + paginasi per chunk', () => {
  it('daftar id kosong → tidak ada request, hasil kosong', async () => {
    const run = vi.fn(async (): Promise<Res<number>> => ({ data: [1], error: null }));
    await expect(fetchAllByIds([], run)).resolves.toEqual([]);
    expect(run).not.toHaveBeenCalled();
  });

  it('memecah id menjadi chunk 150 (301 id → 150, 150, 1) berurutan', async () => {
    const ids = Array.from({ length: 301 }, (_, i) => `id-${i}`);
    const run = vi.fn(async (chunk: string[], _from: number, _to: number): Promise<Res<string>> =>
      ({ data: chunk.slice(0, 1), error: null }));
    const out = await fetchAllByIds(ids, run);
    expect(run).toHaveBeenCalledTimes(3);
    const chunks = run.mock.calls.map((c) => c[0]);
    expect(chunks.map((c) => c.length)).toEqual([150, 150, 1]);
    expect(chunks.flat()).toEqual(ids);
    expect(out).toEqual(['id-0', 'id-150', 'id-300']);
  });

  it('tepat 150 id → satu chunk', async () => {
    const ids = Array.from({ length: 150 }, (_, i) => `id-${i}`);
    const run = vi.fn(async (): Promise<Res<number>> => ({ data: [], error: null }));
    await fetchAllByIds(ids, run);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('paginasi di dalam tiap chunk; hasil = chunk1 semua halaman, lalu chunk2', async () => {
    const ids = Array.from({ length: 160 }, (_, i) => `id-${i}`);
    const run = vi.fn(async (chunk: string[], from: number, _to: number): Promise<Res<string>> => {
      if (chunk[0] === 'id-0') {
        return { data: from === 0 ? Array<string>(1000).fill('a') : ['a-last'], error: null };
      }
      return { data: ['b'], error: null };
    });
    const out = await fetchAllByIds(ids, run);
    expect(run.mock.calls.map((c) => [c[0][0], c[1], c[2]])).toEqual([
      ['id-0', 0, 999], ['id-0', 1000, 1999], ['id-150', 0, 999],
    ]);
    expect(out).toHaveLength(1002);
    expect(out[999]).toBe('a');
    expect(out[1000]).toBe('a-last');
    expect(out[1001]).toBe('b');
  });

  it('error di chunk kedua dilempar', async () => {
    const ids = Array.from({ length: 200 }, (_, i) => `id-${i}`);
    const run = vi.fn(async (chunk: string[]): Promise<Res<string>> =>
      chunk[0] === 'id-0' ? { data: ['ok'], error: null } : { data: null, error: { message: 'chunk gagal' } });
    await expect(fetchAllByIds(ids, run)).rejects.toThrow('chunk gagal');
  });

  it('id duplikat tidak dideduplikasi (diteruskan apa adanya)', async () => {
    const run = vi.fn(async (chunk: string[]): Promise<Res<string>> => ({ data: chunk, error: null }));
    await expect(fetchAllByIds(['x', 'x'], run)).resolves.toEqual(['x', 'x']);
  });
});
