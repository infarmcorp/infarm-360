/**
 * RESET DATA (reusable) — backup dulu, lalu kosongkan data hasil/transaksi.
 * Konfigurasi (pegawai, periode, pertanyaan, bobot, pemetaan) DIPERTAHANKAN.
 *
 * Cara pakai:
 *   npm install --no-save pg
 *   node scripts/reset-data.mjs
 *   npm uninstall --no-save pg
 *
 * Backup JSON setiap tabel yang dihapus ditulis ke backups/reset-<timestamp>/
 * (folder di-gitignore). ⚠ Hapusnya tak bisa di-undo selain dari backup ini.
 */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import pg from 'pg';

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
];

const env = readFileSync('.env.local', 'utf8');
const url = env.split(/\r?\n/).find((l) => l.startsWith('SUPABASE_DB_URL='))
  ?.slice('SUPABASE_DB_URL='.length).trim().replace(/^["']|["']$/g, '');
if (!url) { console.error('SUPABASE_DB_URL tidak ditemukan di .env.local'); process.exit(1); }

const client = new pg.Client({ connectionString: url });
await client.connect();

// 1) Backup — dump tiap tabel ke JSON sebelum dihapus.
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const dir = `backups/reset-${stamp}`;
mkdirSync(dir, { recursive: true });
console.log(`Backup → ${dir}`);
const before = {};
for (const t of TABLES) {
  const { rows } = await client.query(`select * from ${t}`);
  writeFileSync(`${dir}/${t}.json`, JSON.stringify(rows, null, 2));
  before[t] = rows.length;
  console.log(`  ${t}: ${rows.length} baris dibackup`);
}

// 2) Reset — jalankan SQL truncate.
const sql = readFileSync('scripts/reset-data.sql', 'utf8');
await client.query(sql);

// 3) Verifikasi — semua tabel hasil kini 0.
console.log('\nSetelah reset:');
for (const t of TABLES) {
  const { rows } = await client.query(`select count(*)::int as n from ${t}`);
  console.log(`  ${t}: ${rows[0].n}`);
}

// Konfigurasi yang dipertahankan (sanity check).
console.log('\nKonfigurasi dipertahankan:');
for (const t of ['employees', 'periods', 'culture_aspects', 'indicators', 'qualitative_questions', 'weight_schemes', 'mappings']) {
  const { rows } = await client.query(`select count(*)::int as n from ${t}`);
  console.log(`  ${t}: ${rows[0].n}`);
}

await client.end();
console.log('\n✅ Reset selesai. Backup tersimpan di', dir);
