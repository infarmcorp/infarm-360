/**
 * FIX PERIOD START DATE — koreksi periode Q1 yang tanggal mulainya jatuh di
 * 31 Des 2025 (human error / efek zona waktu) menjadi 1 Jan 2026, agar filter
 * Tahun di dashboard mengelompokkannya ke 2026 (bukan 2025).
 *
 * Hanya menyentuh kolom `start_date`. Tidak mengubah bulan periode, KPI, 360°,
 * atau skor apa pun. Dalam transaksi (auto-rollback bila gagal).
 *
 * Cara pakai:
 *   npm install --no-save pg
 *   node scripts/fix-period-start-year.mjs          # pratinjau (tanpa ubah)
 *   node scripts/fix-period-start-year.mjs --apply   # terapkan perubahan
 *   npm uninstall --no-save pg
 */
import { readFileSync } from 'node:fs';
import pg from 'pg';

const apply = process.argv.includes('--apply');

const env = readFileSync('.env.local', 'utf8');
const url = env.split(/\r?\n/).find((l) => l.startsWith('SUPABASE_DB_URL='))
  ?.slice('SUPABASE_DB_URL='.length).trim().replace(/^["']|["']$/g, '');
if (!url) { console.error('SUPABASE_DB_URL tidak ditemukan di .env.local'); process.exit(1); }

// Baris yang dikoreksi: start_date di Des 2025 (mestinya Q1 2026).
const SELECT = `select id, label, to_char(start_date,'YYYY-MM-DD') as start_date, status
  from periods
  where start_date >= date '2025-12-01' and start_date < date '2026-01-01'
  order by label`;
const UPDATE = `update periods set start_date = date '2026-01-01'
  where start_date >= date '2025-12-01' and start_date < date '2026-01-01'`;

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  const before = await client.query(SELECT);
  if (before.rows.length === 0) {
    console.log('Tidak ada periode dgn start_date di Des 2025. Tidak ada yang diubah.');
    process.exit(0);
  }
  console.log('Periode yang akan dikoreksi → start_date jadi 2026-01-01:');
  before.rows.forEach((r) => console.log(`  • ${r.label} (status ${r.status}) — ${r.start_date}`));

  if (!apply) {
    console.log('\n[PRATINJAU] Tidak ada perubahan. Jalankan dengan --apply untuk menerapkan.');
    process.exit(0);
  }

  await client.query('begin');
  const res = await client.query(UPDATE);
  await client.query('commit');
  console.log(`\n✅ ${res.rowCount} periode diperbarui ke start_date 2026-01-01.`);

  const after = await client.query(SELECT);
  console.log(`Verifikasi: sisa baris di Des 2025 = ${after.rows.length} (harusnya 0).`);
} catch (e) {
  await client.query('rollback').catch(() => {});
  console.error('❌ Gagal:', e.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
