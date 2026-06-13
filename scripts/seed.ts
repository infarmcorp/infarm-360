/**
 * Seed MINIMAL (akun + struktur) ke Supabase.
 * Jalankan: npx tsx scripts/seed.ts
 *
 * Mengisi: auth users + employees + spv_team_members + periods + period_months
 *          + culture_aspects + indicators + qualitative_questions + weight_schemes.
 * TIDAK mengisi: kpi_scores, mappings, assessments, result_360 (diisi via UI nanti).
 *
 * Idempoten: aman dijalankan ulang (skip yang sudah ada).
 */
import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';
import { INITIAL_USERS, SPV_TEAMS, INSTANT_QUARTERS, Q_QUANT, Q_QUAL, INITIAL_MAPPINGS, INITIAL_KPI_HIST } from '../src/data';
import { DEMO_USERS } from '../lib/auth/demo-users';

// Relasi legacy → enum relation_kind DB (jaga semantik kelas penilai: atasan/peer/cross).
const RELATION_MAP: Record<string, 'Atasan' | 'Peer' | 'Cross' | 'Self' | 'Bawahan'> = {
  'Atasan': 'Atasan', 'SPV→Employee': 'Atasan', 'HRD→Employee': 'Atasan', 'Direksi→SPV': 'Atasan',
  'Cross': 'Cross', 'Self': 'Self', 'Bawahan': 'Bawahan', 'Peer': 'Peer',
};

// --- Muat env dari .env.local ---
const env: Record<string, string> = {};
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z_]+)\s*=\s*"?([^"\n]*)"?\s*$/);
  if (m) env[m[1]] = m[2];
}
const URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !SERVICE) throw new Error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY tidak ada di .env.local');

const sb = createClient(URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });

// --- Aspek budaya & pengelompokan indikator (dari FormAssess/questionHelper) ---
const ASPECTS = [
  { code: 'A', name: 'Jujur & Tanggung Jawab', idx: [0, 1, 2] },
  { code: 'B', name: 'Semaksimal Mungkin',     idx: [3, 4, 5] },
  { code: 'C', name: 'Menantang Diri',         idx: [6, 7] },
  { code: 'D', name: 'Lapang Hati',            idx: [8, 9] },
  { code: 'E', name: 'Bermawas Diri',          idx: [10, 11] },
];

async function main() {
  console.log('== SEED MINIMAL Infarm 360 →', URL, '==\n');

  // 1) AUTH USERS (idempoten: pakai yang sudah ada) -------------------------
  const existing = new Map<string, string>(); // email -> id
  let page = 1;
  for (;;) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    data.users.forEach(u => { if (u.email) existing.set(u.email, u.id); });
    if (data.users.length < 200) break;
    page++;
  }
  const idByCode = new Map<string, string>();
  for (const u of DEMO_USERS) {
    let id = existing.get(u.email);
    if (!id) {
      const { data, error } = await sb.auth.admin.createUser({
        email: u.email, password: u.password, email_confirm: true,
        user_metadata: { name: u.name, emp_code: u.emp_code },
      });
      if (error) throw new Error(`createUser ${u.email}: ${error.message}`);
      id = data.user!.id;
      console.log(`  + auth user  ${u.email}`);
    } else {
      console.log(`  = auth user  ${u.email} (sudah ada)`);
    }
    idByCode.set(u.emp_code, id);
  }

  // 2) EMPLOYEES ------------------------------------------------------------
  const empRows = INITIAL_USERS.map(u => ({
    id: idByCode.get(u.id)!, emp_code: u.id, name: u.name, dept: u.dept, role: u.role, is_active: true,
  }));
  {
    const { error } = await sb.from('employees').upsert(empRows, { onConflict: 'id' });
    if (error) throw new Error('employees: ' + error.message);
    console.log(`\n  ✓ employees: ${empRows.length}`);
  }

  // 3) SPV_TEAM_MEMBERS -----------------------------------------------------
  const teamRows: { spv_id: string; employee_id: string }[] = [];
  for (const [spvCode, members] of Object.entries(SPV_TEAMS)) {
    for (const empCode of members) {
      teamRows.push({ spv_id: idByCode.get(spvCode)!, employee_id: idByCode.get(empCode)! });
    }
  }
  {
    const { error } = await sb.from('spv_team_members').upsert(teamRows, { onConflict: 'spv_id,employee_id' });
    if (error) throw new Error('spv_team_members: ' + error.message);
    console.log(`  ✓ spv_team_members: ${teamRows.length}`);
  }

  // 4) PERIODS + MONTHS -----------------------------------------------------
  const periodIdByCode = new Map<string, string>();
  for (const [code, p] of Object.entries(INSTANT_QUARTERS)) {
    const { data, error } = await sb.from('periods').upsert(
      { code, label: p.label, start_date: p.start, end_date: p.end, status: p.status, has_360: p.has360 },
      { onConflict: 'code' }
    ).select('id').single();
    if (error) throw new Error(`periods ${code}: ` + error.message);
    periodIdByCode.set(code, data.id);
    const monthRows = p.months.map(ym => ({ period_id: data.id, ym }));
    const { error: mErr } = await sb.from('period_months').upsert(monthRows, { onConflict: 'period_id,ym' });
    if (mErr) throw new Error(`period_months ${code}: ` + mErr.message);
  }
  console.log(`  ✓ periods: ${periodIdByCode.size} (+ months)`);

  // 5) ASPEK + INDIKATOR + QUAL + BOBOT (per periode) -----------------------
  for (const [code, periodId] of periodIdByCode) {
    // Skip kalau periode ini sudah punya aspek (idempoten)
    const { count } = await sb.from('culture_aspects')
      .select('*', { count: 'exact', head: true }).eq('period_id', periodId);
    if (count && count > 0) { console.log(`  = ${code}: aspek sudah ada, skip`); continue; }

    for (let a = 0; a < ASPECTS.length; a++) {
      const asp = ASPECTS[a];
      const { data: aspRow, error: aErr } = await sb.from('culture_aspects')
        .insert({ period_id: periodId, name: asp.name, order_idx: a }).select('id').single();
      if (aErr) throw new Error(`culture_aspects ${code}/${asp.code}: ` + aErr.message);
      const indRows = asp.idx.map((qi, oi) => ({
        aspect_id: aspRow.id, text: Q_QUANT[qi], order_idx: oi, is_active: true,
      }));
      const { error: iErr } = await sb.from('indicators').insert(indRows);
      if (iErr) throw new Error(`indicators ${code}/${asp.code}: ` + iErr.message);
    }
    const qualRows = Q_QUAL.map((text, oi) => ({ period_id: periodId, text, order_idx: oi }));
    const { error: qErr } = await sb.from('qualitative_questions').insert(qualRows);
    if (qErr) throw new Error(`qualitative_questions ${code}: ` + qErr.message);

    const { error: wErr } = await sb.from('weight_schemes').insert({
      period_id: periodId, model: '4class',
      weights: { atasan: 50, peer: 30, cross: 20, self: 0 }, is_active: true,
    });
    if (wErr) throw new Error(`weight_schemes ${code}: ` + wErr.message);
    console.log(`  ✓ ${code}: 5 aspek, 12 indikator, ${Q_QUAL.length} qual, bobot 4class`);
  }

  // 6) MAPPINGS (struktur "siapa menilai siapa") → ke kuartal aktif Q3-2026 ---
  const activePeriodId = periodIdByCode.get('Q3-2026');
  if (activePeriodId) {
    const mapRows = INITIAL_MAPPINGS.map((m) => ({
      period_id: activePeriodId,
      assessor_id: idByCode.get(m.penilaiId)!,
      target_id: idByCode.get(m.yangDinilaiId)!,
      relation: RELATION_MAP[m.relasi] ?? 'Peer',
      mandatory: (m as { sifat?: string }).sifat !== 'opsional',
      is_active: true,
    }));
    const { error } = await sb.from('mappings')
      .upsert(mapRows, { onConflict: 'period_id,assessor_id,target_id' });
    if (error) throw new Error('mappings: ' + error.message);
    console.log(`\n  ✓ mappings (Q3-2026): ${mapRows.length}`);
  }

  // 7) KPI SCORES (skor terkini per bulan, dari INITIAL_KPI_HIST) -----------
  // Data performa demo agar Dashboard punya Skor Akhir. Mudah diganti via UI /kpi.
  const kpiRows: { employee_id: string; ym: string; score: number; updated_by: string | null }[] = [];
  for (const [empCode, byMonth] of Object.entries(INITIAL_KPI_HIST)) {
    const empId = idByCode.get(empCode);
    if (!empId) continue;
    for (const [ym, hist] of Object.entries(byMonth as Record<string, { score: number; by: string }[]>)) {
      if (!hist.length) continue;
      const latest = hist[hist.length - 1]; // skor terbaru bulan itu
      kpiRows.push({ employee_id: empId, ym, score: latest.score, updated_by: idByCode.get(latest.by) ?? null });
    }
  }
  if (kpiRows.length) {
    const { error } = await sb.from('kpi_scores').upsert(kpiRows, { onConflict: 'employee_id,ym' });
    if (error) throw new Error('kpi_scores: ' + error.message);
    console.log(`  ✓ kpi_scores: ${kpiRows.length}`);
  }

  console.log('\n== SEED SELESAI ==');
}

main().catch(e => { console.error('\nGAGAL:', e.message); process.exit(1); });
