/**
 * VERIFIKASI RLS TERPROGRAM PER PERAN — dengan fixture uji yang dibuat sendiri.
 * Jalankan: npx tsx scripts/verify-rls.ts
 *
 * Mengapa fixture sendiri: DB live berisi data PEGAWAI NYATA. Skrip ini TIDAK menyentuh
 * akun/data nyata — ia membuat segelintir user uji (prefix RLSTEST-*) via service_role,
 * menjalankan assertion RLS sebagai tiap peran (anon + login), lalu MENGHAPUS semuanya.
 *
 * Yang diverifikasi pada `kpi_scores` (+ struktur tim):
 *  - BACA: SPV→tim+diri · Employee→diri · HRD/Direksi→semua.
 *  - TULIS: SPV boleh tim & diri sendiri (0008); SPV DITOLAK untuk pegawai SPV lain;
 *    Employee & Direksi DITOLAK menulis KPI.
 *
 * Keluar kode 1 bila ada assertion gagal. Cleanup dijamin lewat finally.
 */
import { readFileSync } from 'fs';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// --- env ---
const env: Record<string, string> = {};
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z_]+)\s*=\s*"?([^"\n]*)"?\s*$/);
  if (m) env[m[1]] = m[2];
}
const URL = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !ANON || !SERVICE) {
  throw new Error('Butuh NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY + SUPABASE_SERVICE_ROLE_KEY di .env.local');
}

const admin = createClient(URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });

const PW = 'RlsTest@2026!';
const YM = '2099-01'; // bulan jauh di masa depan → hindari bentrok periode nyata
type Role = 'employee' | 'spv' | 'hrd' | 'direksi';
type Fixture = { code: string; email: string; name: string; role: Role };
const FIX: Record<string, Fixture> = {
  SPV: { code: 'RLSTEST-SPV', email: 'rlstest.spv@infarm.test', name: 'RLS Test SPV', role: 'spv' },
  SP2: { code: 'RLSTEST-SP2', email: 'rlstest.sp2@infarm.test', name: 'RLS Test SPV2', role: 'spv' },
  EMP: { code: 'RLSTEST-EMP', email: 'rlstest.emp@infarm.test', name: 'RLS Test Emp', role: 'employee' },
  OTH: { code: 'RLSTEST-OTH', email: 'rlstest.oth@infarm.test', name: 'RLS Test Oth', role: 'employee' },
  HRD: { code: 'RLSTEST-HRD', email: 'rlstest.hrd@infarm.test', name: 'RLS Test HRD', role: 'hrd' },
  DIR: { code: 'RLSTEST-DIR', email: 'rlstest.dir@infarm.test', name: 'RLS Test Dir', role: 'direksi' },
};
const ALL_EMAILS = Object.values(FIX).map((f) => f.email);
const id: Record<string, string> = {}; // key (SPV/EMP/...) → auth user id
const codeOf = (uid: string) => {
  const key = Object.keys(FIX).find((k) => id[k] === uid);
  return key ? FIX[key].code : uid;
};

let pass = 0, fail = 0;
function check(name: string, ok: boolean, detail = '') {
  if (ok) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
}
const sameSet = (a: string[], b: string[]) =>
  a.length === b.length && [...new Set(a)].sort().join(',') === [...new Set(b)].sort().join(',');

async function listTestUserIds(): Promise<{ email: string; id: string }[]> {
  const out: { email: string; id: string }[] = [];
  let page = 1;
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    data.users.forEach((u) => { if (u.email && ALL_EMAILS.includes(u.email)) out.push({ email: u.email, id: u.id }); });
    if (data.users.length < 200) break;
    page++;
  }
  return out;
}

async function cleanup() {
  const users = await listTestUserIds();
  const ids = users.map((u) => u.id);
  if (ids.length) {
    await admin.from('kpi_scores').delete().in('employee_id', ids);
    await admin.from('spv_team_members').delete().in('spv_id', ids);
    await admin.from('spv_team_members').delete().in('employee_id', ids);
    await admin.from('employees').delete().in('id', ids);
    for (const u of users) await admin.auth.admin.deleteUser(u.id);
  }
}

async function setup() {
  // Buat auth users + employees.
  for (const [key, f] of Object.entries(FIX)) {
    const { data, error } = await admin.auth.admin.createUser({
      email: f.email, password: PW, email_confirm: true, user_metadata: { name: f.name, emp_code: f.code },
    });
    if (error) throw new Error(`createUser ${f.email}: ${error.message}`);
    id[key] = data.user!.id;
  }
  const empRows = Object.entries(FIX).map(([key, f]) => ({
    id: id[key], emp_code: f.code, name: f.name, dept: 'RLSTEST', role: f.role, is_active: true,
  }));
  { const { error } = await admin.from('employees').insert(empRows); if (error) throw new Error('employees: ' + error.message); }
  // Tim: SPV→EMP, SP2→OTH.
  { const { error } = await admin.from('spv_team_members').insert([
      { spv_id: id.SPV, employee_id: id.EMP },
      { spv_id: id.SP2, employee_id: id.OTH },
    ]); if (error) throw new Error('spv_team_members: ' + error.message); }
  // KPI seed (semua 6) agar BACA punya baris untuk diuji.
  { const { error } = await admin.from('kpi_scores').insert(
      Object.values(id).map((uid) => ({ employee_id: uid, ym: YM, score: 80 })),
    ); if (error) throw new Error('kpi_scores: ' + error.message); }
}

async function loginAs(email: string): Promise<SupabaseClient> {
  const c = createClient(URL, ANON, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email, password: PW });
  if (error) throw new Error(`login ${email}: ${error.message}`);
  return c;
}

const testIds = () => Object.values(id);
/** emp_code test yang baris kpinya terlihat client (dibatasi ke fixture, abaikan data nyata). */
async function visibleTestKpiCodes(c: SupabaseClient): Promise<string[]> {
  const { data, error } = await c.from('kpi_scores').select('employee_id').in('employee_id', testIds());
  if (error) throw new Error('select kpi_scores: ' + error.message);
  return [...new Set((data ?? []).map((r) => codeOf(r.employee_id)))];
}
/** UPDATE idempoten (score=score) pada baris kpi target; kembalikan jumlah baris terpengaruh. */
async function tryKpiWrite(c: SupabaseClient, key: string): Promise<number> {
  const { data, error } = await c.from('kpi_scores')
    .update({ score: 80 }).eq('employee_id', id[key]).eq('ym', YM).select('employee_id');
  if (error) return 0;
  return data?.length ?? 0;
}

async function main() {
  console.log('== VERIFIKASI RLS per peran (fixture uji) →', URL, '==\n');
  await cleanup();   // bersihkan sisa run sebelumnya bila ada
  await setup();
  try {
    // SPV (tim: EMP). SP2 (tim: OTH).
    console.log('SPV (RLSTEST-SPV, tim = EMP):');
    {
      const c = await loginAs(FIX.SPV.email);
      check('BACA kpi: hanya diri + anggota tim (SPV, EMP)', sameSet(await visibleTestKpiCodes(c), ['RLSTEST-SPV', 'RLSTEST-EMP']));
      check('TULIS kpi anggota tim (EMP) DIIZINKAN', (await tryKpiWrite(c, 'EMP')) > 0);
      check('TULIS kpi diri sendiri DIIZINKAN [migrasi 0008]', (await tryKpiWrite(c, 'SPV')) > 0);
      check('TULIS kpi pegawai SPV lain (OTH) DITOLAK', (await tryKpiWrite(c, 'OTH')) === 0);
      check('TULIS kpi SPV lain (SP2) DITOLAK', (await tryKpiWrite(c, 'SP2')) === 0);
      await c.auth.signOut();
    }

    console.log('\nEmployee (RLSTEST-EMP):');
    {
      const c = await loginAs(FIX.EMP.email);
      check('BACA kpi: hanya diri sendiri (EMP)', sameSet(await visibleTestKpiCodes(c), ['RLSTEST-EMP']));
      check('TULIS kpi diri sendiri DITOLAK (employee tak boleh tulis KPI)', (await tryKpiWrite(c, 'EMP')) === 0);
      check('TULIS kpi orang lain (SPV) DITOLAK', (await tryKpiWrite(c, 'SPV')) === 0);
      await c.auth.signOut();
    }

    console.log('\nHRD (RLSTEST-HRD):');
    {
      const c = await loginAs(FIX.HRD.email);
      const vis = await visibleTestKpiCodes(c);
      check('BACA kpi: seluruh fixture terlihat', sameSet(vis, Object.values(FIX).map((f) => f.code)), `terlihat: ${vis.sort().join(',')}`);
      check('TULIS kpi pegawai mana pun (EMP) DIIZINKAN', (await tryKpiWrite(c, 'EMP')) > 0);
      await c.auth.signOut();
    }

    console.log('\nDireksi (RLSTEST-DIR):');
    {
      const c = await loginAs(FIX.DIR.email);
      const vis = await visibleTestKpiCodes(c);
      check('BACA kpi: seluruh fixture terlihat (read-only)', sameSet(vis, Object.values(FIX).map((f) => f.code)), `terlihat: ${vis.sort().join(',')}`);
      check('TULIS kpi (EMP) DITOLAK (Direksi read-only)', (await tryKpiWrite(c, 'EMP')) === 0);
      await c.auth.signOut();
    }

    console.log(`\n== HASIL: ${pass} lolos, ${fail} gagal ==`);
  } finally {
    await cleanup();
    console.log('  (fixture uji dibersihkan)');
  }
  if (fail > 0) process.exit(1);
}

main().catch((e) => { console.error('\nGAGAL menjalankan verifikasi:', e.message); process.exit(1); });
