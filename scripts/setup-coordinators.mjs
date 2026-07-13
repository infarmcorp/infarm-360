/**
 * SETUP KOORDINATOR (sekali pakai, sesuai permintaan HRD 2026-07-12).
 * Verifikasi skema 0021 → set grant is_coordinator + isi coordinator_team_members
 * untuk Widodo & Arif. Idempoten (hapus tim lama lalu isi ulang). node scripts/setup-coordinators.mjs
 */
import { readFileSync } from 'node:fs';
import pg from 'pg';
const env = readFileSync('.env.local', 'utf8');
const url = env.split(/\r?\n/).find((l) => l.startsWith('SUPABASE_DB_URL='))
  ?.slice('SUPABASE_DB_URL='.length).trim().replace(/^["']|["']$/g, '');
const c = new pg.Client({ connectionString: url });
await c.connect();

const findId = async (name) => {
  const { rows } = await c.query(`select id, name, dept from employees where lower(name)=lower($1)`, [name.trim()]);
  if (rows.length === 0) throw new Error(`Tidak ditemukan: "${name}"`);
  if (rows.length > 1) throw new Error(`Ganda (${rows.length}): "${name}"`);
  return rows[0];
};

const plan = [
  { coord: 'Rochmat Arif Maulana', team: ['Qurrotun Ayun', 'Reni Candra Sari'] },
  { coord: 'Widodo Hadi Kusumo', team: ['Adistya Dwi Nurmayunita', 'Muhammad Fikar Nazary', 'Sitti Aisyatul Maufiroh', 'Vizcha Amalia Susanto Putri'] },
];

try {
  // 1) Verifikasi skema.
  const { rows: col } = await c.query(
    `select 1 from information_schema.columns where table_name='employees' and column_name='is_coordinator'`);
  const { rows: tbl } = await c.query(
    `select 1 from information_schema.tables where table_name='coordinator_team_members'`);
  console.log(`Skema 0021 → kolom is_coordinator: ${col.length ? 'ADA' : 'TIDAK ADA'} · tabel coordinator_team_members: ${tbl.length ? 'ADA' : 'TIDAK ADA'}\n`);
  if (!col.length || !tbl.length) throw new Error('Skema 0021 belum lengkap — batal.');

  // 2) Resolusi id + terapkan.
  await c.query('begin');
  for (const p of plan) {
    const coord = await findId(p.coord);
    const members = [];
    for (const t of p.team) members.push(await findId(t));
    await c.query(`update employees set is_coordinator=true where id=$1`, [coord.id]);
    await c.query(`delete from coordinator_team_members where coordinator_id=$1`, [coord.id]);
    for (const m of members) {
      await c.query(`insert into coordinator_team_members(coordinator_id, employee_id) values($1,$2)
        on conflict do nothing`, [coord.id, m.id]);
    }
    console.log(`✅ ${coord.name} (${coord.dept}) → Koordinator atas ${members.length}:`);
    members.forEach((m) => console.log(`     • ${m.name} (${m.dept})`));
  }
  await c.query('commit');

  // 3) Verifikasi baca balik.
  console.log('\n— Verifikasi tersimpan —');
  const { rows } = await c.query(
    `select cc.name as coord, e.name as anggota, e.dept
       from coordinator_team_members ct
       join employees cc on cc.id=ct.coordinator_id
       join employees e on e.id=ct.employee_id
      order by cc.name, e.name`);
  rows.forEach((r) => console.log(`  ${r.coord}  ←  ${r.anggota} (${r.dept})`));
  console.log(`\nTotal baris coordinator_team_members: ${rows.length}`);
} catch (e) {
  await c.query('rollback').catch(() => {});
  console.error('GAGAL:', e.message);
  process.exitCode = 1;
} finally {
  await c.end();
}
