/**
 * HAPUS PEGAWAI SEPENUHNYA — hapus baris employees + akun auth + seluruh data terkait.
 * Beda dari reset-people.mjs (yang hanya membersihkan data 360°/KPI & menyisakan akun).
 *
 * Cascade FK menangani: spv_team_members, mappings, assessments(+anak), kpi_scores,
 * kpi_audit, result_360, compliance_penalties, final_reports, succession_plans.
 * Referensi NON-cascade dibersihkan manual lebih dulu: relation_correction_requests
 * (assessor/target/reviewed_by), serta kolom *_by yang menunjuk pegawai ini (di-NULL-kan).
 *
 *   npm install --no-save pg
 *   node scripts/delete-people.mjs           # pratinjau
 *   node scripts/delete-people.mjs --apply   # terapkan
 *   npm uninstall --no-save pg
 */
import { readFileSync } from 'node:fs';
import pg from 'pg';

const apply = process.argv.includes('--apply');

const PEOPLE = [
  { name: 'Mr. A', id: '540281ab-3c4b-4160-b23d-f1273d4c7415' },
  { name: 'Mr. X', id: '444864a5-e2f1-47f2-9adf-56b3fc5d1137' },
  { name: 'Mr. Y', id: '9f59758b-8a2f-4f42-a8b6-04d54dc3761d' },
  { name: 'Mr. Z', id: '55387b9e-aefa-41cd-9fa9-a4691f31c859' },
  { name: 'Kiki Saputri', id: 'e05855bf-8df2-4c54-b12a-0664c45c5bae' },
  { name: 'Mawar', id: 'e07550fa-a00c-4590-83bf-39b61a94be36' },
];
const IDS = PEOPLE.map((p) => p.id);

const env = readFileSync('.env.local', 'utf8');
const url = env.split(/\r?\n/).find((l) => l.startsWith('SUPABASE_DB_URL='))
  ?.slice('SUPABASE_DB_URL='.length).trim().replace(/^["']|["']$/g, '');
if (!url) { console.error('SUPABASE_DB_URL tidak ditemukan'); process.exit(1); }

const c = new pg.Client({ connectionString: url });
await c.connect();
try {
  // pastikan tak ada dari mereka yang jadi atasan pegawai lain (spv_id) — cegah cascade tak terduga
  const asSpv = (await c.query('select count(*) n from spv_team_members where spv_id = any($1)', [IDS])).rows[0].n;
  const n = async (sql) => Number((await c.query(sql, [IDS])).rows[0].n);
  console.log('Pegawai yang akan DIHAPUS PERMANEN (akun + seluruh data):');
  PEOPLE.forEach((p) => console.log(`  • ${p.name}`));
  console.log('\nReferensi terkait saat ini:');
  console.log(`  sebagai atasan (spv_team_members.spv_id): ${asSpv}`);
  console.log(`  keanggotaan tim (employee_id)           : ${await n('select count(*) n from spv_team_members where employee_id = any($1)')}`);
  console.log(`  mappings (assessor/target)              : ${await n('select count(*) n from mappings where assessor_id = any($1) or target_id = any($1)')}`);
  console.log(`  assessments (assessor/target)           : ${await n('select count(*) n from assessments where assessor_id = any($1) or target_id = any($1)')}`);
  console.log(`  koreksi relasi (assessor/target/review) : ${await n('select count(*) n from relation_correction_requests where assessor_id = any($1) or target_id = any($1) or reviewed_by = any($1)')}`);
  console.log(`  result_360 / kpi / laporan / suksesi     : ${await n('select count(*) n from result_360 where employee_id = any($1)')} / ${await n('select count(*) n from kpi_scores where employee_id = any($1)')} / ${await n('select count(*) n from final_reports where employee_id = any($1)')} / ${await n('select count(*) n from succession_plans where employee_id = any($1)')}`);
  console.log(`  akun auth (auth.users)                   : ${await n('select count(*) n from auth.users where id = any($1)')}`);

  if (!apply) { console.log('\n[PRATINJAU] Belum ada perubahan. Jalankan dengan --apply.'); process.exit(0); }

  await c.query('begin');
  // 1) Referensi NON-cascade.
  await c.query('delete from relation_correction_requests where assessor_id = any($1) or target_id = any($1) or reviewed_by = any($1)', [IDS]);
  await c.query('update kpi_scores set updated_by = null where updated_by = any($1)', [IDS]);
  await c.query('update kpi_audit set changed_by = null where changed_by = any($1)', [IDS]);
  await c.query('update final_reports set finalized_by = null where finalized_by = any($1)', [IDS]);
  await c.query('update succession_plans set proposed_by = null where proposed_by = any($1)', [IDS]);
  await c.query('update succession_plans set direksi_id = null where direksi_id = any($1)', [IDS]);
  // 2) Hapus pegawai (cascade ke seluruh data milik mereka).
  const delEmp = await c.query('delete from employees where id = any($1)', [IDS]);
  // 3) Hapus akun auth (cascade ke auth.identities/sessions).
  const delAuth = await c.query('delete from auth.users where id = any($1)', [IDS]);
  await c.query('commit');
  console.log(`\n✅ Dihapus: ${delEmp.rowCount} pegawai + ${delAuth.rowCount} akun auth.`);

  const left = Number((await c.query('select count(*) n from employees where id = any($1)', [IDS])).rows[0].n);
  console.log(`Verifikasi: sisa baris employees = ${left} (harusnya 0).`);
} catch (e) {
  await c.query('rollback').catch(() => {});
  console.error('❌ Gagal — rollback:', e.message);
  process.exitCode = 1;
} finally { await c.end(); }
