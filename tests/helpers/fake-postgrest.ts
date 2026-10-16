/**
 * Tiruan PostgREST berbasis data (bukan antrean respons) untuk menguji PAGINASI.
 *
 * Meniru batas keras `db.max_rows`: tiap request mengembalikan paling banyak MAX_ROWS baris —
 * query tanpa `.range()` diam-diam terpotong, persis seperti production. Filter yang didukung:
 * eq, neq, in, order (kolom berurutan), range, limit, maybeSingle. Cukup untuk query baca-saja.
 * `failOn` membuat query ke tabel tertentu gagal (uji error tidak ditelan).
 */
export const MAX_ROWS = 1000;

type Row = Record<string, unknown>;

export type FakeDb = {
  from: (table: string) => FakeQuery;
  /** Jumlah request per tabel (untuk memastikan chunk/halaman benar-benar diminta). */
  requests: Record<string, number>;
};

type FakeQuery = {
  select: (cols?: string) => FakeQuery;
  eq: (col: string, val: unknown) => FakeQuery;
  neq: (col: string, val: unknown) => FakeQuery;
  in: (col: string, vals: unknown[]) => FakeQuery;
  order: (col: string, opts?: { ascending?: boolean }) => FakeQuery;
  range: (from: number, to: number) => FakeQuery;
  limit: (n: number) => FakeQuery;
  maybeSingle: () => Promise<{ data: Row | null; error: unknown }>;
  then: <R>(onFulfilled: (v: { data: Row[] | null; error: unknown }) => R) => Promise<R>;
};

export function fakeDb(tables: Record<string, Row[]>, opts: { failOn?: string[] } = {}): FakeDb {
  const requests: Record<string, number> = {};
  function from(table: string): FakeQuery {
    const preds: ((r: Row) => boolean)[] = [];
    const orders: { col: string; asc: boolean }[] = [];
    let range: [number, number] | null = null;
    let limit: number | null = null;
    const run = (): { data: Row[] | null; error: unknown } => {
      requests[table] = (requests[table] ?? 0) + 1;
      if (opts.failOn?.includes(table)) return { data: null, error: { message: `gagal membaca ${table}` } };
      let rows = (tables[table] ?? []).filter((r) => preds.every((p) => p(r)));
      if (orders.length) {
        rows = [...rows].sort((a, b) => {
          for (const o of orders) {
            const x = String(a[o.col]); const y = String(b[o.col]);
            if (x !== y) return (x < y ? -1 : 1) * (o.asc ? 1 : -1);
          }
          return 0;
        });
      }
      if (range) rows = rows.slice(range[0], range[1] + 1);
      if (limit != null) rows = rows.slice(0, limit);
      return { data: rows.slice(0, MAX_ROWS), error: null };
    };
    const q: FakeQuery = {
      select: () => q,
      eq: (c, v) => { preds.push((r) => r[c] === v); return q; },
      neq: (c, v) => { preds.push((r) => r[c] !== v); return q; },
      in: (c, vs) => { const s = new Set(vs); preds.push((r) => s.has(r[c])); return q; },
      order: (c, o) => { orders.push({ col: c, asc: o?.ascending !== false }); return q; },
      range: (a, b) => { range = [a, b]; return q; },
      limit: (n) => { limit = n; return q; },
      maybeSingle: async () => { const r = run(); return { data: r.data?.[0] ?? null, error: r.error }; },
      then: (onFulfilled) => Promise.resolve(run()).then(onFulfilled),
    };
    return q;
  }
  return { from, requests };
}
