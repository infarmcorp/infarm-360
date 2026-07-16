/**
 * Mock Supabase client untuk uji Server Action (tanpa DB nyata).
 *
 * Meniru API chainable Supabase yang dipakai di Server Actions:
 *   .from(table).select().eq().maybeSingle()
 *   .from(table).update({...}).eq().eq().select()
 *   .from(table).insert({...}) / .delete().eq()
 *   .auth.getUser()
 *
 * Respons diberikan per-tabel sebagai ANTREAN (FIFO): tiap pemanggilan `from(table)`
 * yang di-"settle" (maybeSingle/single/await) mengambil satu respons berikutnya untuk
 * tabel itu — urutan pemanggilan di kode = urutan antrean. Bila antrean habis, mock
 * melempar error (menandakan kode memanggil lebih banyak query dari yang diharapkan tes).
 */

export type QResult = { data?: unknown; error?: unknown };

export type MockUser = { id: string } | null;

export type MockCall = {
  table: string;
  op: 'select' | 'update' | 'insert' | 'delete';
  payload?: unknown;
  filters: unknown[];
};

export type MockClient = {
  auth: { getUser: () => Promise<{ data: { user: MockUser }; error: null }> };
  from: (table: string) => QueryBuilder;
  /** Rekaman semua query yang di-settle (untuk assertion). */
  calls: MockCall[];
};

type QueryBuilder = {
  select: (cols?: string) => QueryBuilder;
  update: (payload: unknown) => QueryBuilder;
  insert: (payload: unknown) => QueryBuilder;
  delete: () => QueryBuilder;
  eq: (col: string, val: unknown) => QueryBuilder;
  or: (expr: string) => QueryBuilder;
  in: (col: string, vals: unknown[]) => QueryBuilder;
  limit: (n: number) => QueryBuilder;
  order: (...args: unknown[]) => QueryBuilder;
  maybeSingle: () => Promise<QResult>;
  single: () => Promise<QResult>;
  then: (
    onFulfilled?: ((value: QResult) => unknown) | null,
    onRejected?: ((reason: unknown) => unknown) | null,
  ) => Promise<unknown>;
};

export function makeClient(cfg: { user?: MockUser; tables?: Record<string, QResult[]> }): MockClient {
  const queues: Record<string, QResult[]> = {};
  for (const [k, v] of Object.entries(cfg.tables ?? {})) queues[k] = [...v];
  const calls: MockCall[] = [];

  function next(table: string): QResult {
    const q = queues[table];
    if (!q || q.length === 0) {
      throw new Error(`mock-supabase: tak ada respons terantre untuk tabel "${table}" (query ke-${calls.length + 1})`);
    }
    return q.shift() as QResult;
  }

  function from(table: string): QueryBuilder {
    const state: MockCall = { table, op: 'select', filters: [] };
    const settle = (): QResult => {
      calls.push({ ...state, filters: [...state.filters] });
      return next(table);
    };
    const builder: QueryBuilder = {
      select: () => builder,
      update: (payload) => { state.op = 'update'; state.payload = payload; return builder; },
      insert: (payload) => { state.op = 'insert'; state.payload = payload; return builder; },
      delete: () => { state.op = 'delete'; return builder; },
      eq: (col, val) => { state.filters.push(['eq', col, val]); return builder; },
      or: (expr) => { state.filters.push(['or', expr]); return builder; },
      in: (col, vals) => { state.filters.push(['in', col, vals]); return builder; },
      limit: () => builder,
      order: () => builder,
      maybeSingle: () => Promise.resolve(settle()),
      single: () => Promise.resolve(settle()),
      then: (onFulfilled, onRejected) => Promise.resolve(settle()).then(onFulfilled ?? undefined, onRejected ?? undefined),
    };
    return builder;
  }

  return {
    auth: { getUser: async () => ({ data: { user: cfg.user ?? null }, error: null }) },
    from,
    calls,
  };
}
