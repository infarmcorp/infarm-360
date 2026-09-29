/**
 * CEK "KPI BELUM TERBACA" (read-only) — replikasi definisi trendOf('unread') (lib/trend.ts):
 * dari 3 bulan PERTAMA kuartal aktif (period_months, urut), hanya SATU bulan yang terisi
 * (dua bulan kosong). Angka 0 = nilai sungguhan (terhitung terisi).
 * Tidak mengubah apa pun. Pakai: node scripts/check-unread.mjs
 */
import { readFileSync } from 'node:fs';
import pg from 'pg';

const env = readFileSync('.env.local', 'utf8');
const url = env.split(/\r?\n/).find((l) => l.startsWith('SUPABASE_DB_URL='))
  ?.slice('SUPABASE_DB_URL='.length).trim().replace(/^["']|["']$/g, '');
if (!url) { console.error('SUPABASE_DB_URL tidak ditemukan'); process.exit(1); }

const c = new pg.Client({ connectionString: url });
await c.connect();
try {
  const { rows: ap } = await c.query(`select id, label from periods where status='active' limit 1`);
  if (!ap.length) { console.log('⚠️  Tidak ada periode aktif.'); process.exit(0); }
  const p = ap[0];

  const { rows: months } = await c.query(
    `select ym from period_months where period_id=$1 order by ym asc`, [p.id]);
  const first3 = months.map((m) => m.ym).slice(0, 3);
  console.log(`Periode aktif : ${p.label}`);
  console.log(`Bulan (urut)  : ${months.map((m) => m.ym).join(', ')}`);
  console.log(`3 bulan awal  : ${first3.join(', ')}\n`);

  // Rerata KPI per (pegawai, ym).
  const { rows } = await c.query(
    `select e.id, e.name, k.ym, avg(k.score)::float as s
       from kpi_scores k join employees e on e.id = k.employee_id
      where k.ym = any($1) group by e.id, e.name, k.ym`, [first3]);

  const byEmp = new Map();
  for (const r of rows) {
    if (!byEmp.has(r.id)) byEmp.set(r.id, { name: r.name, m: new Map() });
    byEmp.get(r.id).m.set(r.ym, r.s);
  }

  // trendOf: tepat 1 dari 3 bulan awal terisi → unread (kosong = tak ada baris; 0 = terisi).
  const unread = [];
  for (const [, { name, m }] of byEmp) {
    if (first3.filter((ym) => m.has(ym)).length === 1) unread.push(name);
  }

  console.log(`Pegawai punya baris KPI di 3 bln awal: ${byEmp.size}`);
  console.log(`KPI "belum terbaca" (2 dari 3 bulan kosong): ${unread.length}`);
  if (unread.length) unread.forEach((n) => console.log(`  • ${n}`));
  else console.log('  (tidak ada — kartu "Belum Terbaca" memang tidak tampil; ini benar)');
} finally {
  await c.end();
}
