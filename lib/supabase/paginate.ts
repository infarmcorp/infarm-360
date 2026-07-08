/**
 * Helper paginasi + chunking untuk menembus dua batas keras PostgREST yang
 * menyebabkan bug "salah diam-diam" (data terpotong TANPA error):
 *
 *  1. `db.max_rows` (default **1000 baris/request**) — query tabel besar tanpa
 *     `.range()` diam-diam dipotong di 1000 baris. Fatal untuk kalkulasi skor /
 *     agregat (rating 360° > 4000 baris → skor salah).
 *  2. Panjang URL `.in(col, ids)` (~16KB header) — daftar id besar (~400+ UUID)
 *     bikin request gagal (`fetch failed`).
 *
 * Pakai untuk SETIAP enumerasi baris yang bisa tumbuh melewati 1000
 * (assessment_indicator_scores, assessment_qual_answers, kpi_scores lintas-periode, dst).
 *
 * `run` WAJIB menyertakan `.order(...)` deterministik agar halaman tak tumpang-tindih/bocor.
 * Melempar error (bukan menelan) — data terpotong lebih berbahaya daripada gagal keras.
 */
export async function fetchAllPaged<T>(
  run: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const PAGE = 1000;
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await run(from, from + PAGE - 1);
    if (error) {
      throw new Error(
        typeof error === 'object' && error && 'message' in error
          ? String((error as { message: unknown }).message)
          : 'query gagal',
      );
    }
    if (data?.length) out.push(...data);
    if (!data || data.length < PAGE) break;
  }
  return out;
}

/**
 * Ambil SEMUA baris tabel anak yang difilter `.in(col, ids)`: **chunk ids**
 * (cegah URL `.in()` kepanjangan) + **paginasi baris** (batas 1000/request).
 * CHUNK 150 aman jauh di bawah batas URL. Lihat {@link fetchAllPaged}.
 */
export async function fetchAllByIds<T>(
  ids: string[],
  run: (chunk: string[], from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const CHUNK = 150;
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    out.push(...(await fetchAllPaged((from, to) => run(chunk, from, to))));
  }
  return out;
}
