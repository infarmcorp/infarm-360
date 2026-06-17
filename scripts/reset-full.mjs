/**
 * RESET PENUH (reusable) — backup dulu, lalu sisakan HANYA data pegawai.
 * Mengosongkan seluruh konfigurasi (periode, aspek, indikator, esai, bobot,
 * pemetaan) + semua data hasil. employees & spv_team_members DIPERTAHANKAN.
 *
 * Cara pakai:
 *   npm install --no-save pg
 *   node scripts/reset-full.mjs
 *   npm uninstall --no-save pg
 *
 * Backup JSON setiap tabel yang dihapus ditulis ke backups/reset-full-<timestamp>/
 * (folder di-gitignore). ⚠ Hapusnya tak bisa di-undo selain dari backup ini.
 */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import pg from 'pg';

// Semua tabel KECUALI employees & spv_team_members.
const TABLES = [
  'assessment_indicator_scores',
  'assessment_qual_answers',
  'assessments',
  'kpi_scores',
  'kpi_audit',
  'result_360',
  'compliance_penalties',
  'final_reports',
  'succession_plans',
  'relation_correction_requests',
  'hrd_audit_log',
  'mappings',
  'weight_schemes',
  'indicators',
  'culture_aspects',
  'qualitative_questions',
  'period_months',
  'periods',
];

const env = readFileSync('.env.local', 'utf8');
const url = env.split(/\r?\n/).find((l) => l.startsWith('SUPABASE_DB_URL='))
  ?.slice('SUPABASE_DB_URL='.length).trim().replace(/^["']|["']$/g, '');
if (!url) { console.error('SUPABASE_DB_URL tidak ditemukan di .env.local'); process.exit(1); }

const client = new pg.Client({ connectionString: url });
await client.connect();

// 1) Backup.
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const dir = `backups/reset-full-${stamp}`;
mkdirSync(dir, { recursive: true });
console.log(`Backup → ${dir}`);
for (const t of TABLES) {
  const { rows } = await client.query(`select * from ${t}`);
  writeFileSync(`${dir}/${t}.json`, JSON.stringify(rows, null, 2));
  console.log(`  ${t}: ${rows.length} baris dibackup`);
}

// 2) Reset.
await client.query(readFileSync('scripts/reset-full.sql', 'utf8'));

// 3) Verifikasi.
console.log('\nSetelah reset (harus 0):');
for (const t of TABLES) {
  const { rows } = await client.query(`select count(*)::int as n from ${t}`);
  console.log(`  ${t}: ${rows[0].n}`);
}
console.log('\nDipertahankan:');
for (const t of ['employees', 'spv_team_members']) {
  const { rows } = await client.query(`select count(*)::int as n from ${t}`);
  console.log(`  ${t}: ${rows[0].n}`);
}

await client.end();
console.log('\n✅ Reset penuh selesai. Backup tersimpan di', dir);
