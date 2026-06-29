/**
 * RESET DATA PER ORANG — hapus SEMUA data 360°/KPI untuk daftar pegawai tertentu,
 * TANPA menghapus akun login & pemetaan (mappings) — mereka tetap di siklus.
 *
 * Menghapus: penilaian (sbg penilai ATAU target) + jawaban rating/esai, hasil 360°,
 * laporan final, kpi_scores + kpi_audit, compliance_penalties, koreksi relasi.
 * Mempertahankan: employees, mappings, weight_schemes, spv_team_members.
 *
 * Dalam transaksi (auto-rollback bila gagal).
 *   npm install --no-save pg
 *   node scripts/reset-people.mjs           # pratinjau (tanpa ubah)
 *   node scripts/reset-people.mjs --apply    # terapkan
 *   npm uninstall --no-save pg
 */
import { readFileSync } from 'node:fs';
import pg from 'pg';

const apply = process.argv.includes('--apply');

const PEOPLE = [
  { name: 'Mr. X', id: '444864a5-e2f1-47f2-9adf-56b3fc5d1137' },
  { name: 'Kiki Saputri', id: 'e05855bf-8df2-4c54-b12a-0664c45c5bae' },
  { name: 'Mawar', id: 'e07550fa-a00c-4590-83bf-39b61a94be36' },
  { name: 'Mr. Y', id: '9f59758b-8a2f-4f42-a8b6-04d54dc3761d' },
  { name: 'Mr. Z', id: '55387b9e-aefa-41cd-9fa9-a4691f31c859' },
  { name: 'Mr. A', id: '540281ab-3c4b-4160-b23d-f1273d4c7415' },
];
const IDS = PEOPLE.map((p) => p.id);

const env = readFileSync('.env.local', 'utf8');
const url = env.split(/\r?\n/).find((l) => l.startsWith('SUPABASE_DB_URL='))
  ?.slice('SUPABASE_DB_URL='.length).trim().replace(/^["']|["']$/g, '');
if (!url) { console.error('SUPABASE_DB_URL tidak ditemukan'); process.exit(1); }

// subquery assessment yang terdampak (sbg penilai atau target)
const ASMT_SUB = `select id from assessments where assessor_id = any($1) or target_id = any($1)`;

const c = new pg.Client({ connectionString: url });
await c.connect();
try {
  const n = async (sql) => Number((await c.query(sql, [IDS])).rows[0].n);
  console.log('Pegawai yang di-reset:');
  PEOPLE.forEach((p) => console.log(`  • ${p.name}`));
  console.log('\nYang akan DIHAPUS:');
  console.log(`  assessment_indicator_scores : ${await n(`select count(*) n from assessment_indicator_scores where assessment_id in (${ASMT_SUB})`)}`);
  console.log(`  assessment_qual_answers     : ${await n(`select count(*) n from assessment_qual_answers where assessment_id in (${ASMT_SUB})`)}`);
  console.log(`  assessments                 : ${await n(`select count(*) n from assessments where assessor_id = any($1) or target_id = any($1)`)}`);
  console.log(`  relation_correction_requests: ${await n(`select count(*) n from relation_correction_requests where assessor_id = any($1) or target_id = any($1)`)}`);
  console.log(`  result_360                  : ${await n(`select count(*) n from result_360 where employee_id = any($1)`)}`);
  console.log(`  final_reports               : ${await n(`select count(*) n from final_reports where employee_id = any($1)`)}`);
  console.log(`  kpi_audit                   : ${await n(`select count(*) n from kpi_audit where employee_id = any($1)`)}`);
  console.log(`  kpi_scores                  : ${await n(`select count(*) n from kpi_scores where employee_id = any($1)`)}`);
  console.log(`  compliance_penalties        : ${await n(`select count(*) n from compliance_penalties where employee_id = any($1)`)}`);
  console.log('\nDIPERTAHANKAN: akun (employees), mappings, weight_schemes, spv_team_members.');

  if (!apply) { console.log('\n[PRATINJAU] Belum ada perubahan. Jalankan dengan --apply untuk menghapus.'); process.exit(0); }

  await c.query('begin');
  const d = async (sql) => (await c.query(sql, [IDS])).rowCount;
  const r = {};
  r.ais  = await d(`delete from assessment_indicator_scores where assessment_id in (${ASMT_SUB})`);
  r.aqa  = await d(`delete from assessment_qual_answers where assessment_id in (${ASMT_SUB})`);
  r.asmt = await d(`delete from assessments where assessor_id = any($1) or target_id = any($1)`);
  r.rcr  = await d(`delete from relation_correction_requests where assessor_id = any($1) or target_id = any($1)`);
  r.r360 = await d(`delete from result_360 where employee_id = any($1)`);
  r.fr   = await d(`delete from final_reports where employee_id = any($1)`);
  r.ka   = await d(`delete from kpi_audit where employee_id = any($1)`);
  r.kpi  = await d(`delete from kpi_scores where employee_id = any($1)`);
  r.pen  = await d(`delete from compliance_penalties where employee_id = any($1)`);
  await c.query('commit');
  console.log('\n✅ Reset selesai. Baris terhapus:', JSON.stringify(r));
} catch (e) {
  await c.query('rollback').catch(() => {});
  console.error('❌ Gagal — semua perubahan dibatalkan (rollback):', e.message);
  process.exitCode = 1;
} finally { await c.end(); }
