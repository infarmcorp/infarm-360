/**
 * RESTORE PENUH dari folder backup → memasukkan kembali data ke database.
 *
 * ⚠️ BERISIKO — skrip ini MENULIS ke database. Jalankan HANYA saat benar-benar
 * perlu memulihkan (data hilang/rusak). Salah pakai bisa menimpa data yang ada.
 *
 * Strategi: untuk tiap tabel, INSERT semua baris dari JSON; bila baris dengan
 * Primary Key sama sudah ada → di-UPDATE (upsert). Baris yang ADA di DB tapi
 * TIDAK ada di backup TIDAK dihapus (aman). Dijalankan dalam 1 transaksi:
 * bila ada error di tengah, SELURUH proses dibatalkan (rollback) — DB tak
 * separuh-terisi. FK & trigger dimatikan sementara (session_replication_role)
 * agar urutan tabel tak jadi soal.
 *
 * Cara pakai:
 *   npm install --no-save pg
 *   node scripts/restore.mjs backups/backup-<timestamp> PULIHKAN
 *   npm uninstall --no-save pg
 *
 * Argumen:
 *   <folder>     wajib — folder hasil backup
 *   PULIHKAN     wajib — konfirmasi (cegah jalan tak sengaja)
 *   --no-auth    opsional — lewati akun login (auth.users/identities); hanya data app
 */
import { readFileSync, existsSync } from 'node:fs';
import pg from 'pg';

const [, , dir, confirm, ...flags] = process.argv;
const skipAuth = flags.includes('--no-auth');

if (!dir) { console.error('❌ Sebutkan folder backup. Contoh:\n   node scripts/restore.mjs backups/backup-2026-06-25T... PULIHKAN'); process.exit(1); }
if (confirm !== 'PULIHKAN') { console.error('❌ Tambahkan kata konfirmasi PULIHKAN di akhir perintah (cegah jalan tak sengaja).'); process.exit(1); }
if (!existsSync(`${dir}/_manifest.json`)) { console.error(`❌ ${dir}/_manifest.json tak ditemukan — pastikan folder backup benar.`); process.exit(1); }

// Urutan PULIH: induk dulu, anak menyusul (jaga FK seandainya replica-mode gagal).
const RESTORE_ORDER = [
  ...(skipAuth ? [] : ['auth.users', 'auth.identities']),
  'employees', 'spv_team_members', 'periods', 'period_months',
  'culture_aspects', 'indicators', 'qualitative_questions', 'weight_schemes',
  'mappings', 'relation_correction_requests',
  'kpi_scores', 'kpi_audit',
  'assessments', 'assessment_indicator_scores', 'assessment_qual_answers',
  'result_360', 'compliance_penalties', 'final_reports', 'succession_plans',
  'hrd_audit_log',
];

const env = readFileSync('.env.local', 'utf8');
const url = env.split(/\r?\n/).find((l) => l.startsWith('SUPABASE_DB_URL='))
  ?.slice('SUPABASE_DB_URL='.length).trim().replace(/^["']|["']$/g, '');
if (!url) { console.error('❌ SUPABASE_DB_URL tidak ditemukan di .env.local'); process.exit(1); }

const client = new pg.Client({ connectionString: url });
await client.connect();

/** Ambil PK + tipe kolom tabel (untuk upsert generik + casting jsonb). */
async function meta(qualified) {
  const [schema, name] = qualified.includes('.') ? qualified.split('.') : ['public', qualified];
  const reg = `${schema}.${name}`;
  const cols = (await client.query(
    `select column_name, data_type, is_identity, identity_generation, is_generated
       from information_schema.columns where table_schema=$1 and table_name=$2`, [schema, name],
  )).rows;
  const pk = (await client.query(
    `select a.attname from pg_index i
       join pg_attribute a on a.attrelid=i.indrelid and a.attnum=any(i.indkey)
      where i.indrelid=$1::regclass and i.indisprimary`, [reg],
  )).rows.map((r) => r.attname);
  return { schema, name, reg, cols, pk };
}

function load(qualified) {
  const f = `${dir}/${qualified}.json`;
  return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null;
}

console.log(`\n♻️  RESTORE dari ${dir}${skipAuth ? ' (TANPA akun auth)' : ''}\n`);

let restored = 0, skipped = 0;
try {
  await client.query('begin');
  // Matikan FK & trigger selama muat (kalau role mengizinkan).
  let replica = false;
  try { await client.query("set session_replication_role = 'replica'"); replica = true; }
  catch { console.log('  ⚠ session_replication_role tak bisa diset — andalkan urutan tabel (induk→anak).'); }

  for (const tbl of RESTORE_ORDER) {
    const rows = load(tbl);
    if (rows == null) { console.log(`  – ${tbl.padEnd(34)} (tak ada di backup, dilewati)`); skipped++; continue; }
    if (rows.length === 0) { console.log(`  · ${tbl.padEnd(34)} 0 baris`); continue; }

    const m = await meta(tbl);
    // Kolom terhitung (generated/computed, mis. auth.users.confirmed_at) tak boleh diisi → buang.
    const insertable = new Set(m.cols.filter((c) => c.is_generated !== 'ALWAYS').map((c) => c.column_name));
    const typeOf = Object.fromEntries(m.cols.map((c) => [c.column_name, c.data_type]));
    const hasAlwaysIdentity = m.cols.some((c) => c.is_identity === 'YES' && c.identity_generation === 'ALWAYS');
    // Kolom yang dipakai = irisan kunci JSON ∩ kolom insertable saat ini (tahan perubahan skema).
    const colNames = Object.keys(rows[0]).filter((k) => insertable.has(k));
    const updatable = colNames.filter((c) => !m.pk.includes(c));

    const idList = colNames.map((c) => `"${c}"`).join(', ');
    const overriding = hasAlwaysIdentity ? 'overriding system value ' : '';
    const conflict = m.pk.length
      ? (updatable.length
          ? `on conflict (${m.pk.map((c) => `"${c}"`).join(', ')}) do update set ${updatable.map((c) => `"${c}"=excluded."${c}"`).join(', ')}`
          : `on conflict (${m.pk.map((c) => `"${c}"`).join(', ')}) do nothing`)
      : '';

    for (const row of rows) {
      const params = [];
      const ph = colNames.map((c) => {
        const v = row[c];
        const t = typeOf[c];
        if (v !== null && (t === 'jsonb' || t === 'json')) { params.push(JSON.stringify(v)); return `$${params.length}::${t}`; }
        params.push(v); return `$${params.length}`;
      });
      await client.query(
        `insert into ${m.reg} (${idList}) ${overriding}values (${ph.join(', ')}) ${conflict}`,
        params,
      );
    }
    console.log(`  ✓ ${tbl.padEnd(34)} ${rows.length} baris dipulihkan`);
    restored += rows.length;
  }

  if (replica) await client.query("set session_replication_role = 'origin'");
  await client.query('commit');
  console.log(`\n✅ Restore selesai — ${restored} baris dipulihkan (${skipped} tabel dilewati).`);
} catch (e) {
  await client.query('rollback');
  console.error('\n❌ GAGAL — semua perubahan dibatalkan (rollback). Database tak berubah.');
  console.error('   ', e.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
