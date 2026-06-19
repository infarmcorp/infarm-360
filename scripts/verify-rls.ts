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
 * Yang diverifikasi pada umpan balik 360° MENTAH lapis 3 (migrasi 0012 — jaring regresi):
 *  - SPV TIDAK PERNAH membaca assessments / assessment_indicator_scores /
 *    assessment_qual_answers anggota timnya (komentar per penilai BESERTA NAMA).
 *  - Kontrol positif: HRD baca semua; penilai baca penilaiannya sendiri; target
 *    (pegawai dinilai) baca penilaian atas dirinya. → menjaga 0012 tak ter-regresi
 *    (mis. is_my_member sengaja/tak sengaja dikembalikan ke asmt_read/ais_read/aqa_read).
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

// Fixture 360° (lapis 3): periode + aspek/indikator/pertanyaan + 1 penilaian
// OTH→EMP (penilai luar tim SPV menilai anggota tim SPV) berstatus 'submitted'.
const P_CODE = 'RLSTEST-P360'; // kode periode uji (dihapus → cascade ke semua turunannya)
const aid: Record<string, string> = {}; // periodId/aspectId/indId/qId/asmtId
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
  // Periode uji dulu — FK on delete cascade menyapu culture_aspects/indicators/
  // qualitative_questions/assessments/assessment_indicator_scores/assessment_qual_answers.
  await admin.from('periods').delete().eq('code', P_CODE);
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

  // --- Fixture 360° lapis 3 ---
  // Periode uji (has_360) + 1 aspek + 1 indikator + 1 pertanyaan esai.
  { const { data, error } = await admin.from('periods').insert({
      code: P_CODE, label: 'RLS Test 360', start_date: '2099-01-01', end_date: '2099-03-31',
      status: 'active', has_360: true,
    }).select('id').single();
    if (error) throw new Error('periods: ' + error.message); aid.periodId = data.id; }
  { const { data, error } = await admin.from('culture_aspects')
      .insert({ period_id: aid.periodId, name: 'RLS Aspek', order_idx: 0 }).select('id').single();
    if (error) throw new Error('culture_aspects: ' + error.message); aid.aspectId = data.id; }
  { const { data, error } = await admin.from('indicators')
      .insert({ aspect_id: aid.aspectId, text: 'RLS Indikator', order_idx: 0 }).select('id').single();
    if (error) throw new Error('indicators: ' + error.message); aid.indId = data.id; }
  { const { data, error } = await admin.from('qualitative_questions')
      .insert({ period_id: aid.periodId, text: 'RLS Pertanyaan', order_idx: 0 }).select('id').single();
    if (error) throw new Error('qualitative_questions: ' + error.message); aid.qId = data.id; }
  // Penilaian OTH→EMP (penilai DI LUAR tim SPV, target = anggota tim SPV) — submitted.
  { const { data, error } = await admin.from('assessments').insert({
      period_id: aid.periodId, assessor_id: id.OTH, target_id: id.EMP, status: 'submitted', submitted_at: new Date().toISOString(),
    }).select('id').single();
    if (error) throw new Error('assessments: ' + error.message); aid.asmtId = data.id; }
  // Komentar mentah per penilai (lapis 3 yang HARUS tersembunyi dari SPV).
  { const { error } = await admin.from('assessment_indicator_scores').insert({
      assessment_id: aid.asmtId, indicator_id: aid.indId, rating: 3, comment: 'KOMENTAR RAHASIA RLS',
    }); if (error) throw new Error('assessment_indicator_scores: ' + error.message); }
  { const { error } = await admin.from('assessment_qual_answers').insert({
      assessment_id: aid.asmtId, question_id: aid.qId, answer: 'ESAI RAHASIA RLS',
    }); if (error) throw new Error('assessment_qual_answers: ' + error.message); }
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

/** Jumlah baris penilaian 360° (header/AIS/AQA) milik fixture yang terlihat client. */
async function asmtVisible(c: SupabaseClient): Promise<number> {
  const { data, error } = await c.from('assessments').select('id').eq('id', aid.asmtId);
  return error ? 0 : (data?.length ?? 0);
}
async function aisVisible(c: SupabaseClient): Promise<number> {
  const { data, error } = await c.from('assessment_indicator_scores').select('rating').eq('assessment_id', aid.asmtId);
  return error ? 0 : (data?.length ?? 0);
}
async function aqaVisible(c: SupabaseClient): Promise<number> {
  const { data, error } = await c.from('assessment_qual_answers').select('answer').eq('assessment_id', aid.asmtId);
  return error ? 0 : (data?.length ?? 0);
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
      // 360° lapis 3 — anggota tim EMP dinilai OTH; SPV TAK BOLEH lihat raw (0012).
      check('BACA assessments anggota tim (EMP) DITOLAK [0012]', (await asmtVisible(c)) === 0);
      check('BACA komentar indikator (AIS) anggota tim DITOLAK [0012]', (await aisVisible(c)) === 0);
      check('BACA esai kualitatif (AQA) anggota tim DITOLAK [0012]', (await aqaVisible(c)) === 0);
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
      // 360° lapis 3 — kontrol positif: HRD baca raw penuh (header + komentar + esai).
      check('BACA assessments 360° DIIZINKAN (kontrol positif)', (await asmtVisible(c)) === 1);
      check('BACA komentar indikator (AIS) DIIZINKAN', (await aisVisible(c)) === 1);
      check('BACA esai kualitatif (AQA) DIIZINKAN', (await aqaVisible(c)) === 1);
      await c.auth.signOut();
    }

    console.log('\n360° lapis 3 — kontrol positif penilai & target:');
    {
      const c = await loginAs(FIX.OTH.email); // OTH = penilai (assessor) atas penilaiannya
      check('Penilai (OTH) BACA assessments-nya sendiri DIIZINKAN', (await asmtVisible(c)) === 1);
      check('Penilai (OTH) BACA komentar indikatornya sendiri DIIZINKAN', (await aisVisible(c)) === 1);
      await c.auth.signOut();
    }
    {
      const c = await loginAs(FIX.EMP.email); // EMP = target (dinilai) atas dirinya
      check('Target (EMP) BACA penilaian atas dirinya DIIZINKAN', (await asmtVisible(c)) === 1);
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
