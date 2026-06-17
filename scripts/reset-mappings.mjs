/**
 * RESET PEMETAAN (reusable) — backup dulu, lalu kosongkan pemetaan 360° saja.
 * Mengosongkan mappings + relation_correction_requests. Pegawai, periode,
 * pertanyaan, bobot, dan data hasil TIDAK tersentuh.
 *
 * Cara pakai:
 *   npm install --no-save pg
 *   node scripts/reset-mappings.mjs
 *   npm uninstall --no-save pg
 *
 * Backup JSON ditulis ke backups/reset-mappings-<timestamp>/ (di-gitignore).
 * ⚠ Hapusnya tak bisa di-undo selain dari backup ini.
 */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import pg from 'pg';

const TABLES = ['relation_correction_requests', 'mappings'];

const env = readFileSync('.env.local', 'utf8');
const url = env.split(/\r?\n/).find((l) => l.startsWith('SUPABASE_DB_URL='))
  ?.slice('SUPABASE_DB_URL='.length).trim().replace(/^["']|["']$/g, '');
if (!url) { console.error('SUPABASE_DB_URL tidak ditemukan di .env.local'); process.exit(1); }

const client = new pg.Client({ connectionString: url });
await client.connect();

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const dir = `backups/reset-mappings-${stamp}`;
mkdirSync(dir, { recursive: true });
console.log(`Backup → ${dir}`);
for (const t of TABLES) {
  const { rows } = await client.query(`select * from ${t}`);
  writeFileSync(`${dir}/${t}.json`, JSON.stringify(rows, null, 2));
  console.log(`  ${t}: ${rows.length} baris dibackup`);
}

await client.query(readFileSync('scripts/reset-mappings.sql', 'utf8'));

console.log('\nSetelah reset (harus 0):');
for (const t of TABLES) {
  const { rows } = await client.query(`select count(*)::int as n from ${t}`);
  console.log(`  ${t}: ${rows[0].n}`);
}

await client.end();
console.log('\n✅ Reset pemetaan selesai. Backup tersimpan di', dir);
