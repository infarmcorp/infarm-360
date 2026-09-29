/**
 * CLONE ANONIM: production → staging.
 * Jalankan: npx tsx scripts/clone-anon-to-staging.ts
 *
 * TUJUAN: mengisi DB STAGING dengan REPLIKA production yang disamarkan, agar perubahan
 * (mis. Manajemen Akses) bisa diuji dengan volume & distribusi data yang realistis TANPA
 * membocorkan identitas / teks umpan balik asli.
 *
 * DIPERTAHANKAN (realisme): semua angka & struktur — dept, role, flag, tanggal, skor KPI,
 *   skor 360°, rating per-indikator, bobot, status laporan, final_score, relasi tim/mapping,
 *   page_grants. UUID non-auth (periode/aspek/indikator/mapping/dll) dipertahankan apa adanya.
 * DISAMARKAN (privasi): nama → "Pegawai NNN"; email auth → pseudonim; SEMUA teks bebas
 *   (komentar 360°, esai, narasi laporan, justifikasi, alasan/catatan) → placeholder.
 * DILEWATI: hrd_audit_log (log; snapshot nama = PII, tak perlu untuk uji).
 *
 * KEAMANAN:
 *  - PROD dipakai HANYA untuk .select() (baca). Tak ada satupun tulisan ke prod.
 *  - STAGING dipakai untuk wipe + tulis. Skrip BATAL bila URL tulis mengarah ke production.
 *  - Baca prod dari .env.local.production.bak; tulis staging dari .env.staging.
 */
import { readFileSync } from 'fs';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const PROD_REF = 'beajoczjpywozavatzmf';
const STAGING_REF = 'twgdlhmsoifvmiqpkqsr';

function loadEnv(path: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*"?([^"\n]*)"?\s*$/);
    if (m) env[m[1]] = m[2];
  }
  return env;
}

const prodEnv = loadEnv('.env.local.production.bak');
const stagingEnv = loadEnv('.env.staging');

const PROD_URL = prodEnv.NEXT_PUBLIC_SUPABASE_URL;
const PROD_SVC = prodEnv.SUPABASE_SERVICE_ROLE_KEY;
const STG_URL = stagingEnv.NEXT_PUBLIC_SUPABASE_URL;
const STG_SVC = stagingEnv.SUPABASE_SERVICE_ROLE_KEY;
// Sandi login akun staging — dari .env.staging (di-gitignore), BUKAN sandi demo di repo:
// repo bisa publik, jadi sandi yang tertulis di kode = staging terbuka untuk siapa pun.
const STAGING_PASSWORD = stagingEnv.STAGING_PASSWORD;
if (!STAGING_PASSWORD || STAGING_PASSWORD.length < 12)
  throw new Error('STAGING_PASSWORD (min 12 karakter) wajib diisi di .env.staging');

// --- PENGAMAN: pastikan arah baca=prod, tulis=staging ---
if (!PROD_URL || !PROD_SVC) throw new Error('Kredensial prod (.env.local.production.bak) tidak lengkap');
if (!STG_URL || !STG_SVC) throw new Error('Kredensial staging (.env.staging) tidak lengkap');
if (!STG_URL.includes(STAGING_REF)) throw new Error(`ABORT: URL tulis bukan staging (${STG_URL}).`);
if (STG_URL.includes(PROD_REF)) throw new Error('ABORT: URL tulis mengarah ke PRODUCTION.');
if (!PROD_URL.includes(PROD_REF)) throw new Error(`ABORT: URL baca bukan production (${PROD_URL}).`);

const prod = createClient(PROD_URL, PROD_SVC, { auth: { autoRefreshToken: false, persistSession: false } });
const stg = createClient(STG_URL, STG_SVC, { auth: { autoRefreshToken: false, persistSession: false } });

/** Ambil SEMUA baris satu tabel dari prod (paginasi range 1000). Hanya baca. */
async function fetchAll(table: string): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  const size = 1000;
  for (let from = 0; ; from += size) {
    const { data, error } = await prod.from(table).select('*').range(from, from + size - 1);
    if (error) throw new Error(`baca ${table}: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < size) break;
  }
  return rows;
}

/** Sisipkan ke staging dalam batch. */
async function insertBatch(table: string, rows: Record<string, unknown>[]) {
  if (!rows.length) return;
  const size = 500;
  for (let i = 0; i < rows.length; i += size) {
    const chunk = rows.slice(i, i + size);
    const { error } = await stg.from(table).insert(chunk);
    if (error) throw new Error(`tulis ${table}: ${error.message}`);
  }
}

const PLACEHOLDER = '[teks disamarkan]';

// Konfigurasi remap/skrub per tabel (employees & wipe ditangani terpisah).
// empCols: kolom yang berisi employee-id (dipetakan via idMap).
// textCols: teks bebas → PLACEHOLDER (kecuali content jsonb → {}).
// dropCols: kolom di-drop (mis. identity id).
type TableCfg = { name: string; empCols?: string[]; textCols?: string[]; dropCols?: string[] };
const TABLES: TableCfg[] = [
  { name: 'periods' },
  { name: 'period_months' },
  { name: 'culture_aspects' },
  { name: 'indicators' },
  { name: 'qualitative_questions' },
  { name: 'weight_schemes', empCols: ['updated_by'] },
  { name: 'spv_team_members', empCols: ['spv_id', 'employee_id'] },
  { name: 'coordinator_team_members', empCols: ['coordinator_id', 'employee_id'] },
  { name: 'mappings', empCols: ['assessor_id', 'target_id'] },
  { name: 'relation_correction_requests', empCols: ['assessor_id', 'target_id', 'reviewed_by'], textCols: ['reason'] },
  { name: 'assessments', empCols: ['assessor_id', 'target_id'] },
  { name: 'assessment_indicator_scores', textCols: ['comment'] },
  { name: 'assessment_qual_answers', textCols: ['answer'] },
  { name: 'kpi_scores', empCols: ['employee_id', 'updated_by'] },
  { name: 'kpi_audit', empCols: ['employee_id', 'changed_by'], textCols: ['note'], dropCols: ['id'] },
  { name: 'result_360', empCols: ['employee_id'] },
  { name: 'final_reports', empCols: ['employee_id', 'finalized_by'], textCols: ['content'], dropCols: ['pdf_path'] },
  { name: 'succession_plans', empCols: ['employee_id', 'proposed_by', 'direksi_id'], textCols: ['plan', 'justification', 'direksi_comment'] },
  { name: 'compliance_penalties', empCols: ['employee_id', 'set_by'], textCols: ['reason'] },
  { name: 'page_grants', empCols: ['employee_id', 'created_by'] },
];

// Urutan WIPE (anak → induk) + kolom filter yang PASTI ada (DELETE PostgREST wajib berfilter).
// UUID_MIN cocok untuk semua uuid; 0 untuk id bigint (identity).
const UUID_MIN = '00000000-0000-0000-0000-000000000000';
const WIPE_ORDER: { t: string; col: string; int?: boolean }[] = [
  { t: 'hrd_audit_log', col: 'id', int: true },
  { t: 'page_grants', col: 'id' },
  { t: 'succession_plans', col: 'id' },
  { t: 'compliance_penalties', col: 'employee_id' },
  { t: 'final_reports', col: 'id' },
  { t: 'result_360', col: 'employee_id' },
  { t: 'kpi_audit', col: 'id', int: true },
  { t: 'kpi_scores', col: 'employee_id' },
  { t: 'assessment_qual_answers', col: 'assessment_id' },
  { t: 'assessment_indicator_scores', col: 'assessment_id' },
  { t: 'assessments', col: 'id' },
  { t: 'relation_correction_requests', col: 'id' },
  { t: 'mappings', col: 'id' },
  { t: 'weight_schemes', col: 'id' },
  { t: 'indicators', col: 'id' },
  { t: 'culture_aspects', col: 'id' },
  { t: 'qualitative_questions', col: 'id' },
  { t: 'period_months', col: 'period_id' },
  { t: 'coordinator_team_members', col: 'coordinator_id' },
  { t: 'spv_team_members', col: 'spv_id' },
  { t: 'periods', col: 'id' },
  { t: 'employees', col: 'id' },
];

async function wipeStaging(client: SupabaseClient) {
  console.log('\n== WIPE STAGING (tabel) ==');
  for (const { t, col, int } of WIPE_ORDER) {
    const { error } = await client.from(t).delete().gte(col, (int ? 0 : UUID_MIN) as never);
    if (error) throw new Error(`wipe ${t}: ${error.message}`);
    console.log(`  · wiped ${t}`);
  }
}

async function deleteAllAuthUsers(client: SupabaseClient) {
  console.log('\n== HAPUS AUTH USERS STAGING ==');
  let page = 1, total = 0;
  for (;;) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    for (const u of data.users) {
      await client.auth.admin.deleteUser(u.id);
      total++;
    }
    if (data.users.length < 200) break;
    page++;
  }
  console.log(`  · dihapus ${total} auth user`);
}

async function main() {
  console.log('== CLONE ANONIM prod → staging ==');
  console.log('  BACA :', PROD_URL);
  console.log('  TULIS:', STG_URL);

  // 1) Baca employees prod + bangun peta id.
  const prodEmps = await fetchAll('employees');
  console.log(`\n  prod employees: ${prodEmps.length}`);

  // 2) Wipe staging (tabel dulu — hormati FK RESTRICT — lalu auth users).
  await wipeStaging(stg);
  await deleteAllAuthUsers(stg);

  // 3) Buat auth user staging + baris employees anonim.
  console.log('\n== BUAT AUTH + EMPLOYEES (anonim) ==');
  const idMap = new Map<string, string>(); // prodId → stagingId
  const empRows: Record<string, unknown>[] = [];
  let n = 0;
  for (const e of prodEmps) {
    n++;
    const num = String(n).padStart(3, '0');
    const email = `pegawai${num}@staging.test`;
    const { data, error } = await stg.auth.admin.createUser({
      email, password: STAGING_PASSWORD, email_confirm: true,
      user_metadata: { name: `Pegawai ${num}`, emp_code: e.emp_code },
    });
    if (error) throw new Error(`createUser ${email}: ${error.message}`);
    const newId = data.user!.id;
    idMap.set(e.id as string, newId);
    empRows.push({
      id: newId,
      emp_code: e.emp_code,
      name: `Pegawai ${num}`,
      dept: e.dept,
      role: e.role,
      is_active: e.is_active,
      created_at: e.created_at,
      is_hrd_admin: e.is_hrd_admin ?? false,
      is_external: e.is_external ?? false,
      is_cross_reviewer: e.is_cross_reviewer ?? false,
      is_coordinator: e.is_coordinator ?? false,
      hrd_sections: e.hrd_sections ?? null,
      joined_on: e.joined_on ?? null,
      left_on: e.left_on ?? null,
    });
  }
  await insertBatch('employees', empRows);
  console.log(`  ✓ employees: ${empRows.length}`);

  // 4) Salin tabel lain dengan remap employee-id + skrub teks.
  const mapId = (v: unknown) => (v == null ? v : (idMap.get(v as string) ?? null));
  for (const cfg of TABLES) {
    const src = await fetchAll(cfg.name);
    const out = src.map((row) => {
      const r: Record<string, unknown> = { ...row };
      for (const c of cfg.empCols ?? []) if (c in r) r[c] = mapId(r[c]);
      for (const c of cfg.textCols ?? []) {
        if (!(c in r)) continue;
        r[c] = c === 'content' ? {} : (r[c] == null ? r[c] : PLACEHOLDER);
      }
      for (const c of cfg.dropCols ?? []) delete r[c];
      // page_grants: prod belum punya kolom `scopes` (0028 hanya di staging) → turunkan dari `scope`.
      if (cfg.name === 'page_grants') {
        const sc = r.scope as string | null | undefined;
        if (!Array.isArray(r.scopes) || (r.scopes as unknown[]).length === 0) r.scopes = sc ? [sc] : [];
      }
      return r;
    });
    await insertBatch(cfg.name, out);
    console.log(`  ✓ ${cfg.name}: ${out.length}`);
  }

  console.log('\n== CLONE SELESAI ==');
  console.log('Login staging: pegawai001@staging.test .. pegawaiNNN@staging.test / sandi: STAGING_PASSWORD di .env.staging');
  console.log('(Cari pemegang peran HRD via kolom role/is_hrd_admin di tabel employees staging.)');
}

main().catch((e) => { console.error('\nGAGAL:', e.message); process.exit(1); });
