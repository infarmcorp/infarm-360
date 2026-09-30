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
 *  - TULIS lewat API: DITOLAK untuk SEMUA peran termasuk HRD [0042] — KPI hanya lewat UI (Server
 *    Action → fungsi DB kpi_save_with_audit via service_role). Fungsi itu pun tak bisa dipanggil
 *    pengguna lewat API.
 *
 * Yang diverifikasi pada umpan balik 360° MENTAH lapis 3 (migrasi 0012 — jaring regresi):
 *  - SPV TIDAK PERNAH membaca assessments / assessment_indicator_scores /
 *    assessment_qual_answers anggota timnya (komentar per penilai BESERTA NAMA).
 *  - Kontrol positif: HRD baca semua; penilai baca penilaiannya sendiri. → menjaga 0012 tak
 *    ter-regresi (mis. is_my_member sengaja/tak sengaja dikembalikan ke asmt_read/ais_read/aqa_read).
 *
 * Pengetatan 0041 (audit 2026-09-29):
 *  - Target (pegawai dinilai) DITOLAK membaca baris mentah atas dirinya (identitas penilai).
 *  - Pegawai DITOLAK menyisipkan penilaian tanpa pemetaan aktif.
 *  - Penilai DITOLAK menurunkan/menghapus penilaian terkirim (kirim ulang tetap boleh).
 *  - SPV DITOLAK mengubah final_score/status laporan tim & ACC laporan yang masih draft.
 *  - SPV DITOLAK menulis KPI bulan di luar periode aktif (periode terkunci).
 *
 * Anonimitas 0042: siapa-menilai-siapa hanya untuk HRD — Direksi & target DITOLAK membaca
 * penilaian mentah; pemetaan hanya terbaca oleh penilainya sendiri (bukan target/SPV/Direksi).
 *
 * ⚠️ Membuat periode uji berstatus 'active' selama skrip berjalan — jalankan di STAGING, atau di
 * produksi saat tak ada aktivitas (halaman yang membaca "periode aktif" bisa sesaat memilih periode uji).
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
const YM_LOCKED = '2098-12'; // bulan di luar periode aktif mana pun (simulasi periode terkunci)
type Role = 'employee' | 'spv' | 'hrd' | 'direksi';
type Fixture = { code: string; email: string; name: string; role: Role };
const FIX: Record<string, Fixture> = {
  SPV: { code: 'RLSTEST-SPV', email: 'rlstest.spv@infarm.test', name: 'RLS Test SPV', role: 'spv' },
  SP2: { code: 'RLSTEST-SP2', email: 'rlstest.sp2@infarm.test', name: 'RLS Test SPV2', role: 'spv' },
  EMP: { code: 'RLSTEST-EMP', email: 'rlstest.emp@infarm.test', name: 'RLS Test Emp', role: 'employee' },
  OTH: { code: 'RLSTEST-OTH', email: 'rlstest.oth@infarm.test', name: 'RLS Test Oth', role: 'employee' },
  HRD: { code: 'RLSTEST-HRD', email: 'rlstest.hrd@infarm.test', name: 'RLS Test HRD', role: 'hrd' },
  DIR: { code: 'RLSTEST-DIR', email: 'rlstest.dir@infarm.test', name: 'RLS Test Dir', role: 'direksi' },
  // HRD TERBATAS: izin HRD Admin tapi hanya bagian Ekspor (hrd_sections) — uji 0045.
  HRL: { code: 'RLSTEST-HRL', email: 'rlstest.hrl@infarm.test', name: 'RLS Test HRD Terbatas', role: 'employee' },
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
    // Log ACC yang dicatat trigger 0045 selama uji (append-only untuk pengguna; service_role boleh).
    await admin.from('hrd_audit_log').delete().in('actor_id', ids);
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
  { const { error } = await admin.from('employees').update({ is_hrd_admin: true, hrd_sections: ['ekspor'] }).eq('id', id.HRL);
    if (error) throw new Error('employees (HRL): ' + error.message); }
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
  // Bulan KPI uji (YM) milik periode uji aktif — kpi_write hanya untuk bulan periode AKTIF [0041].
  // YM_LOCKED sengaja TIDAK masuk periode aktif mana pun (mensimulasikan KPI periode terkunci).
  { const { error } = await admin.from('period_months').insert({ period_id: aid.periodId, ym: YM });
    if (error) throw new Error('period_months: ' + error.message); }
  { const { error } = await admin.from('kpi_scores').insert({ employee_id: id.EMP, ym: YM_LOCKED, score: 80 });
    if (error) throw new Error('kpi_scores (locked): ' + error.message); }
  // Pemetaan OTH→EMP (aktif) — penilaian OTH sah; EMP→SP2 SENGAJA tanpa pemetaan (uji injeksi) [0041].
  { const { data, error } = await admin.from('mappings').insert({
      period_id: aid.periodId, assessor_id: id.OTH, target_id: id.EMP, relation: 'Peer',
    }).select('id').single(); if (error) throw new Error('mappings: ' + error.message); aid.mapId = data.id; }
  // Pemetaan OTH→SPV (belum dinilai) — uji kirim penilaian KOSONG [0045].
  { const { error } = await admin.from('mappings').insert({
      period_id: aid.periodId, assessor_id: id.OTH, target_id: id.SPV, relation: 'Cross',
    }); if (error) throw new Error('mappings (OTH→SPV): ' + error.message); }
  // Rencana suksesi DRAF (belum diajukan) — Direksi tak boleh meresponsnya [0045].
  { const { data, error } = await admin.from('succession_plans').insert({
      employee_id: id.EMP, period_id: aid.periodId, plan: 'RLS rencana', status: 'draft',
    }).select('id').single(); if (error) throw new Error('succession_plans: ' + error.message); aid.planId = data.id; }
  // Laporan EMP (draft dulu; diubah ke in_review di tengah uji) — uji penjaga kolom SPV [0041].
  { const { data, error } = await admin.from('final_reports').insert({
      employee_id: id.EMP, period_id: aid.periodId, final_score: 80, status: 'draft',
    }).select('id').single();
    if (error) throw new Error('final_reports: ' + error.message); aid.reportId = data.id; }
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

/** UPDATE idempoten KPI bulan TERKUNCI (YM_LOCKED) milik EMP; jumlah baris terpengaruh. */
async function tryKpiLockedWrite(c: SupabaseClient): Promise<number> {
  const { data, error } = await c.from('kpi_scores')
    .update({ score: 80 }).eq('employee_id', id.EMP).eq('ym', YM_LOCKED).select('employee_id');
  if (error) return 0;
  return data?.length ?? 0;
}
/** Jumlah baris pemetaan uji (OTH→EMP) yang terlihat client. */
async function mapVisible(c: SupabaseClient): Promise<number> {
  const { data, error } = await c.from('mappings').select('id').eq('period_id', aid.periodId).eq('target_id', id.EMP);
  return error ? 0 : (data?.length ?? 0);
}
/** Coba panggil fungsi simpan KPI langsung lewat API. true = berhasil (= celah terbuka). */
async function tryKpiRpc(c: SupabaseClient): Promise<boolean> {
  const { error } = await c.rpc('kpi_save_with_audit', { p_actor: id.HRD, p_ym: YM, p_rows: [{ employee_id: id.EMP, score: 80, note: null }] });
  return !error;
}
/** Coba sisipkan penilaian tanpa pemetaan (EMP→SP2). true = berhasil (= celah terbuka). */
async function tryInjectAssessment(c: SupabaseClient): Promise<boolean> {
  const { data, error } = await c.from('assessments').insert({
    period_id: aid.periodId, assessor_id: id.EMP, target_id: id.SP2, status: 'submitted',
  }).select('id');
  if (error || !data?.length) return false;
  await admin.from('assessments').delete().eq('id', data[0].id); // bersihkan bila (salah) lolos
  return true;
}
/** Update final_reports EMP; jumlah baris terpengaruh (0 = ditolak). */
async function tryReportUpdate(c: SupabaseClient, patch: Record<string, unknown>): Promise<number> {
  const { data, error } = await c.from('final_reports').update(patch).eq('id', aid.reportId).select('id');
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
      check('TULIS kpi anggota tim (EMP) lewat API DITOLAK — wajib lewat UI [0042]', (await tryKpiWrite(c, 'EMP')) === 0);
      check('TULIS kpi diri sendiri lewat API DITOLAK [0042]', (await tryKpiWrite(c, 'SPV')) === 0);
      check('PANGGIL fungsi kpi_save_with_audit lewat API DITOLAK [0042]', !(await tryKpiRpc(c)));
      check('BACA pemetaan anggota tim (siapa menilai EMP) DITOLAK [0042]', (await mapVisible(c)) === 0);
      check('TULIS kpi pegawai SPV lain (OTH) DITOLAK', (await tryKpiWrite(c, 'OTH')) === 0);
      check('TULIS kpi SPV lain (SP2) DITOLAK', (await tryKpiWrite(c, 'SP2')) === 0);
      // 360° lapis 3 — anggota tim EMP dinilai OTH; SPV TAK BOLEH lihat raw (0012).
      check('BACA assessments anggota tim (EMP) DITOLAK [0012]', (await asmtVisible(c)) === 0);
      check('BACA komentar indikator (AIS) anggota tim DITOLAK [0012]', (await aisVisible(c)) === 0);
      check('BACA esai kualitatif (AQA) anggota tim DITOLAK [0012]', (await aqaVisible(c)) === 0);
      // KPI periode terkunci & penjaga kolom laporan tim [0041].
      check('TULIS kpi anggota tim di bulan PERIODE TERKUNCI DITOLAK [0041]', (await tryKpiLockedWrite(c)) === 0);
      check('ACC laporan tim saat masih DRAFT DITOLAK [0041]', (await tryReportUpdate(c, { spv_acc: true })) === 0);
      await admin.from('final_reports').update({ status: 'in_review' }).eq('id', aid.reportId);
      check('UBAH final_score laporan tim DITOLAK [0041]', (await tryReportUpdate(c, { final_score: 99 })) === 0);
      check('UBAH status laporan tim → finalized DITOLAK [0041]', (await tryReportUpdate(c, { status: 'finalized' })) === 0);
      check('ACC laporan tim yang sudah dirilis DIIZINKAN (kontrol positif)', (await tryReportUpdate(c, { spv_acc: true })) === 1);
      await c.auth.signOut();
    }

    console.log('\nEmployee (RLSTEST-EMP):');
    {
      const c = await loginAs(FIX.EMP.email);
      check('BACA kpi: hanya diri sendiri (EMP)', sameSet(await visibleTestKpiCodes(c), ['RLSTEST-EMP']));
      check('TULIS kpi diri sendiri DITOLAK (employee tak boleh tulis KPI)', (await tryKpiWrite(c, 'EMP')) === 0);
      check('TULIS kpi orang lain (SPV) DITOLAK', (await tryKpiWrite(c, 'SPV')) === 0);
      check('SISIPKAN penilaian 360° TANPA pemetaan (EMP→SP2) DITOLAK [0041]', !(await tryInjectAssessment(c)));
      check('BACA pemetaan "siapa menilai saya" (target EMP) DITOLAK [0042]', (await mapVisible(c)) === 0);
      await c.auth.signOut();
    }

    console.log('\nHRD (RLSTEST-HRD):');
    {
      const c = await loginAs(FIX.HRD.email);
      const vis = await visibleTestKpiCodes(c);
      check('BACA kpi: seluruh fixture terlihat', sameSet(vis, Object.values(FIX).map((f) => f.code)), `terlihat: ${vis.sort().join(',')}`);
      check('TULIS kpi (EMP) lewat API DITOLAK juga untuk HRD — wajib lewat UI [0042]', (await tryKpiWrite(c, 'EMP')) === 0);
      check('BACA pemetaan DIIZINKAN (HRD mengatur pemetaan — kontrol positif)', (await mapVisible(c)) === 1);
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
      check('Penilai (OTH) BACA pemetaan "saya menilai siapa" DIIZINKAN', (await mapVisible(c)) === 1);
      // Edit & kirim ulang tetap boleh (punya pemetaan aktif) — kontrol positif [0041].
      { const { data } = await c.from('assessments').update({ status: 'submitted' }).eq('id', aid.asmtId).select('id');
        check('Penilai (OTH) KIRIM ULANG penilaiannya DIIZINKAN', (data?.length ?? 0) === 1); }
      { const { data, error } = await c.from('assessments').update({ status: 'draft' }).eq('id', aid.asmtId).select('id');
        check('Penilai (OTH) TURUNKAN penilaian terkirim ke draf DITOLAK [0041]', !!error || (data?.length ?? 0) === 0); }
      { const { data, error } = await c.from('assessments').delete().eq('id', aid.asmtId).select('id');
        check('Penilai (OTH) HAPUS penilaian terkirim DITOLAK [0041]', !!error || (data?.length ?? 0) === 0); }
      await c.auth.signOut();
      // Pastikan penilaian uji masih utuh & terkirim — agar uji baca target di bawah tak "lolos palsu".
      const { data: still } = await admin.from('assessments').select('status').eq('id', aid.asmtId).maybeSingle();
      check('Penilaian uji masih ada & berstatus submitted', still?.status === 'submitted', `status: ${still?.status ?? 'hilang'}`);
    }
    {
      // Target (pegawai dinilai) TAK BOLEH membaca baris mentah — assessor_id = identitas penilai [0041].
      // Laporannya disajikan server (anonim, hanya saat finalized).
      const c = await loginAs(FIX.EMP.email);
      check('Target (EMP) BACA penilaian mentah atas dirinya DITOLAK [0041]', (await asmtVisible(c)) === 0);
      check('Target (EMP) BACA komentar indikator (AIS) atas dirinya DITOLAK [0041]', (await aisVisible(c)) === 0);
      check('Target (EMP) BACA esai (AQA) atas dirinya DITOLAK [0041]', (await aqaVisible(c)) === 0);
      await c.auth.signOut();
    }

    console.log('\nDireksi (RLSTEST-DIR):');
    {
      const c = await loginAs(FIX.DIR.email);
      const vis = await visibleTestKpiCodes(c);
      check('BACA kpi: seluruh fixture terlihat (read-only)', sameSet(vis, Object.values(FIX).map((f) => f.code)), `terlihat: ${vis.sort().join(',')}`);
      check('TULIS kpi (EMP) DITOLAK (Direksi read-only)', (await tryKpiWrite(c, 'EMP')) === 0);
      check('BACA penilaian 360° mentah (identitas penilai) DITOLAK [0042]', (await asmtVisible(c)) === 0);
      check('BACA komentar indikator (AIS) mentah DITOLAK [0042]', (await aisVisible(c)) === 0);
      check('BACA pemetaan (siapa menilai siapa) DITOLAK [0042]', (await mapVisible(c)) === 0);
      await c.auth.signOut();
    }

    console.log('\n0045 — sisa celah server:');
    {
      // HRD terbatas (hanya Ekspor): tak bisa menaikkan izin sendiri / menulis bagian lain.
      const c = await loginAs(FIX.HRL.email);
      { const { data, error } = await c.from('employees').update({ hrd_sections: null }).eq('id', id.HRL).select('id');
        check('HRD terbatas MENGOSONGKAN batasan bagiannya sendiri DITOLAK [0045]', !!error || (data?.length ?? 0) === 0); }
      { const { data, error } = await c.from('employees').update({ is_hrd_admin: true }).eq('id', id.EMP).select('id');
        check('HRD terbatas MEMBERI izin HRD Admin ke orang lain DITOLAK [0045]', !!error || (data?.length ?? 0) === 0); }
      { const { data, error } = await c.from('periods').update({ label: 'RLS Test 360' }).eq('id', aid.periodId).select('id');
        check('HRD terbatas (tanpa bagian Periode) UBAH periode DITOLAK [0045]', !!error || (data?.length ?? 0) === 0); }
      check('HRD terbatas tetap BACA penilaian (baca tak berubah — kontrol positif)', (await asmtVisible(c)) === 1);
      await c.auth.signOut();
    }
    {
      const c = await loginAs(FIX.HRD.email);
      { const { data, error } = await c.from('periods').update({ label: 'RLS Test 360' }).eq('id', aid.periodId).select('id');
        check('HRD penuh UBAH periode DIIZINKAN (kontrol positif)', !error && (data?.length ?? 0) === 1, error?.message ?? ''); }
      { const { error } = await c.from('weight_schemes').insert({
          period_id: aid.periodId, model: '2class', weights: { atasan: 40, internal: 50 }, is_active: false });
        check('Bobot dengan total ≠ 100 DITOLAK database [0045]', !!error); }
      await c.auth.signOut();
    }
    {
      const c = await loginAs(FIX.OTH.email);
      // Isi penilaian terkirim tak bisa "dikosongkan" (evidence < 20 karakter).
      { const { error } = await c.from('assessment_indicator_scores').update({ comment: 'pendek' })
          .eq('assessment_id', aid.asmtId).eq('indicator_id', aid.indId);
        check('Penilai KOSONGKAN evidence penilaian terkirim DITOLAK [0045]', !!error); }
      // Kirim penilaian KOSONG (tanpa rating/evidence/esai) lewat API.
      { const { data: h, error: hErr } = await c.from('assessments').insert({
          period_id: aid.periodId, assessor_id: id.OTH, target_id: id.SPV, status: 'draft' }).select('id').single();
        check('Penilai BUAT draf untuk pasangan yang dipetakan DIIZINKAN (kontrol positif)', !hErr && !!h, hErr?.message ?? '');
        if (h) {
          const { data, error } = await c.from('assessments').update({ status: 'submitted' }).eq('id', h.id).select('id');
          check('Penilai KIRIM penilaian tanpa isi DITOLAK [0045]', !!error || (data?.length ?? 0) === 0);
        } }
      // Form ditutup HRD → isi penilaian tak bisa diubah.
      await admin.from('periods').update({ form_open: false }).eq('id', aid.periodId);
      { const { data, error } = await c.from('assessment_indicator_scores').update({ rating: 5 })
          .eq('assessment_id', aid.asmtId).eq('indicator_id', aid.indId).select('rating');
        check('Penilai UBAH rating saat form DITUTUP DITOLAK [0045]', !!error || (data?.length ?? 0) === 0); }
      { const { data, error } = await c.from('assessment_qual_answers').update({ answer: 'DIUBAH LEWAT API' })
          .eq('assessment_id', aid.asmtId).eq('question_id', aid.qId).select('answer');
        check('Penilai UBAH esai saat form DITUTUP DITOLAK [0045]', !!error || (data?.length ?? 0) === 0); }
      await admin.from('periods').update({ form_open: true }).eq('id', aid.periodId);
      await c.auth.signOut();
    }
    {
      // Permohonan palsu: menunjuk pemetaan orang lain / langsung berstatus disetujui.
      const c = await loginAs(FIX.EMP.email);
      { const { error } = await c.from('relation_correction_requests').insert({
          kind: 'relation', mapping_id: aid.mapId, period_id: aid.periodId, assessor_id: id.EMP, target_id: id.SP2,
          old_relation: 'Peer', new_relation: 'Atasan', reason: 'uji RLS', status: 'pending' });
        check('Permohonan dengan PEMETAAN ORANG LAIN DITOLAK [0045]', !!error); }
      { const { error } = await c.from('relation_correction_requests').insert({
          kind: 'add', mapping_id: null, period_id: aid.periodId, assessor_id: id.EMP, target_id: id.SP2,
          old_relation: null, new_relation: 'Cross', reason: 'uji RLS', status: 'approved' });
        check('Permohonan langsung berstatus DISETUJUI DITOLAK [0045]', !!error); }
      await c.auth.signOut();
    }
    {
      const c = await loginAs(FIX.DIR.email);
      { const { data, error } = await c.from('succession_plans').update({ status: 'approved', direksi_id: id.DIR })
          .eq('id', aid.planId).select('id');
        check('Direksi merespons rencana suksesi yang masih DRAF DITOLAK [0045]', !!error || (data?.length ?? 0) === 0); }
      await c.auth.signOut();
    }
    {
      // ACC SPV (kontrol positif di atas) kini tercatat di Log Aktivitas oleh trigger.
      const { data } = await admin.from('hrd_audit_log').select('id').eq('actor_id', id.SPV).eq('action', 'report.acc');
      check('ACC oleh SPV TERCATAT di Log Aktivitas [0045]', (data?.length ?? 0) >= 1);
    }

    console.log(`\n== HASIL: ${pass} lolos, ${fail} gagal ==`);
  } finally {
    await cleanup();
    console.log('  (fixture uji dibersihkan)');
  }
  if (fail > 0) process.exit(1);
}

main().catch((e) => { console.error('\nGAGAL menjalankan verifikasi:', e.message); process.exit(1); });
