/**
 * READINESS CHECK (read-only) — cek cepat kesiapan periode aktif untuk 360°.
 * Tidak mengubah apa pun. Pakai: node scripts/readiness-check.mjs
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
  const { rows: ap } = await c.query(
    `select id, label, has_360, status from periods where status='active' limit 1`);
  if (!ap.length) { console.log('⚠️  Tidak ada periode aktif.'); process.exit(0); }
  const p = ap[0];
  console.log(`Periode aktif : ${p.label}  (status=${p.status}, has_360=${p.has_360})`);

  const q = async (sql, params) => (await c.query(sql, params)).rows[0].n;
  const asp  = await q(`select count(*) n from culture_aspects where period_id=$1`, [p.id]);
  const ind  = await q(`select count(*) n from indicators i join culture_aspects a on a.id=i.aspect_id where a.period_id=$1 and i.is_active=true`, [p.id]);
  const qual = await q(`select count(*) n from qualitative_questions where period_id=$1`, [p.id]);
  const maps = await q(`select count(*) n from mappings where period_id=$1`, [p.id]);
  const wts  = await q(`select count(*) n from weight_schemes where period_id=$1`, [p.id]);
  const asmt = await q(`select count(*) n from assessments where period_id=$1`, [p.id]);
  const subm = await q(`select count(*) n from assessments where period_id=$1 and status='submitted'`, [p.id]);
  const draf = await q(`select count(*) n from assessments where period_id=$1 and status='draft'`, [p.id]);

  console.log(`Aspek budaya  : ${asp}`);
  console.log(`Indikator aktif: ${ind}`);
  console.log(`Esai kualitatif: ${qual}`);
  console.log(`Bobot penilai : ${wts}`);
  console.log(`Pemetaan      : ${maps}`);
  console.log(`Penilaian     : total ${asmt}  (submitted ${subm}, draft ${draf})`);

  const ok = p.has_360 && asp>0 && ind>0 && maps>0 && wts>0;
  console.log(`\n${ok ? '✅ SIAP' : '⚠️  PERIKSA'} — form 360° ${p.has_360 ? 'TERBUKA' : 'TERTUTUP (has_360=false)'}.`);
} finally { await c.end(); }
