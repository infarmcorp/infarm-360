/**
 * APPLY MIGRATION — jalankan satu file SQL migrasi ke database Supabase.
 * Dipakai saat Supabase CLI tak tersedia di platform ini (binary tak cocok).
 *
 * Cara pakai:
 *   npm install --no-save pg
 *   node scripts/apply-migration.mjs supabase/migrations/0009_spv_self_report_read.sql
 *   npm uninstall --no-save pg
 *
 * Migrasi di repo ini idempoten (drop policy if exists / create or replace),
 * sehingga aman dijalankan ulang.
 */
import { readFileSync } from 'node:fs';
import pg from 'pg';

const file = process.argv[2];
if (!file) { console.error('Pakai: node scripts/apply-migration.mjs <path-ke-file.sql>'); process.exit(1); }

const env = readFileSync('.env.local', 'utf8');
const url = env.split(/\r?\n/).find((l) => l.startsWith('SUPABASE_DB_URL='))
  ?.slice('SUPABASE_DB_URL='.length).trim().replace(/^["']|["']$/g, '');
if (!url) { console.error('SUPABASE_DB_URL tidak ditemukan di .env.local'); process.exit(1); }

const sql = readFileSync(file, 'utf8');
const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  await client.query('begin');
  await client.query(sql);
  await client.query('commit');
  console.log(`✅ Migrasi diterapkan: ${file}`);
} catch (e) {
  await client.query('rollback');
  console.error(`❌ Gagal menerapkan ${file}:`, e.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
