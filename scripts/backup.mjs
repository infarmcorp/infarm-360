/**
 * BACKUP PENUH (non-destruktif) — salin SELURUH database ke file JSON.
 *
 * AMAN: skrip ini HANYA MEMBACA. Tidak mengubah/menghapus apa pun di database.
 * Boleh dijalankan kapan saja, sesering apa pun.
 *
 * Cara pakai:
 *   npm install --no-save pg
 *   node scripts/backup.mjs
 *   npm uninstall --no-save pg
 *
 * Hasil → backups/backup-<timestamp>/
 *   ├── _manifest.json              (ringkasan: tanggal + jumlah baris per tabel)
 *   ├── <tabel>.json                (20 tabel publik)
 *   ├── auth.users.json             (akun login + sandi TER-HASH)
 *   └── auth.identities.json        (kaitan akun ↔ email/provider)
 *
 * Folder backups/ sudah di-gitignore → dump berisi data pegawai mentah TIDAK
 * akan ter-commit ke GitHub. Pulihkan dengan: node scripts/restore.mjs <folder>
 */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import pg from 'pg';

// Daftar acuan 20 tabel awal. Backup sebenarnya memakai SEMUA tabel publik yang ada di DB
// (lihat query information_schema di bawah) agar tabel migrasi baru tak terlewat.
const PUBLIC_TABLES = [
  'employees', 'spv_team_members', 'periods', 'period_months',
  'culture_aspects', 'indicators', 'qualitative_questions', 'weight_schemes',
  'mappings', 'relation_correction_requests',
  'kpi_scores', 'kpi_audit',
  'assessments', 'assessment_indicator_scores', 'assessment_qual_answers',
  'result_360', 'compliance_penalties', 'final_reports', 'succession_plans',
  'hrd_audit_log',
];
// Tabel sistem Auth (akun login). Disertakan agar restore memulihkan login + sandi.
const AUTH_TABLES = ['users', 'identities'];

// Sumber koneksi: env proses (GitHub Actions — workflow backup terjadwal) → fallback .env.local (laptop).
let url = process.env.SUPABASE_DB_URL?.trim();
if (!url) {
  let env = '';
  try { env = readFileSync('.env.local', 'utf8'); } catch { /* tak ada .env.local */ }
  url = env.split(/\r?\n/).find((l) => l.startsWith('SUPABASE_DB_URL='))
    ?.slice('SUPABASE_DB_URL='.length).trim().replace(/^["']|["']$/g, '');
}
if (!url) { console.error('❌ SUPABASE_DB_URL tidak ditemukan (env proses / .env.local)'); process.exit(1); }

const client = new pg.Client({ connectionString: url });
await client.connect();

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const dir = `backups/backup-${stamp}`;
mkdirSync(dir, { recursive: true });
console.log(`\n📦 BACKUP → ${dir}\n`);

const manifest = { createdAt: new Date().toISOString(), tables: {} };
let total = 0;

async function dump(label, sql) {
  const { rows } = await client.query(sql);
  writeFileSync(`${dir}/${label}.json`, JSON.stringify(rows, null, 2));
  manifest.tables[label] = rows.length;
  total += rows.length;
  console.log(`  ✓ ${label.padEnd(34)} ${rows.length} baris`);
}

// Tabel publik ditemukan otomatis dari DB — tabel dari migrasi baru (page_grants, dll.)
// ikut ter-backup tanpa perlu memperbarui daftar di atas (daftar itu kini hanya acuan).
const { rows: found } = await client.query(
  `select table_name from information_schema.tables
    where table_schema = 'public' and table_type = 'BASE TABLE' order by table_name`);
const tables = found.map((r) => r.table_name);
const extra = tables.filter((t) => !PUBLIC_TABLES.includes(t));
if (extra.length) console.log(`ℹ️  Tabel di luar daftar acuan (ikut di-backup): ${extra.join(', ')}\n`);

console.log('Tabel aplikasi:');
for (const t of tables) await dump(t, `select * from public."${t}"`);

console.log('\nAkun login (Auth):');
for (const t of AUTH_TABLES) await dump(`auth.${t}`, `select * from auth.${t}`);

writeFileSync(`${dir}/_manifest.json`, JSON.stringify(manifest, null, 2));
await client.end();

console.log(`\n✅ Backup selesai — ${total} baris dari ${Object.keys(manifest.tables).length} tabel.`);
console.log(`   Tersimpan di: ${dir}`);
console.log(`   Pulihkan (bila perlu): node scripts/restore.mjs ${dir} PULIHKAN\n`);
