/**
 * PROVISIONING FIXTURE UJI BEBAN (k6) — membuat periode + aspek/indikator/pertanyaan +
 * N penilai + beberapa target + mapping, lalu menulis kredensialnya ke fixtures.json.
 *
 * Jalankan:  node scripts/loadtest/provision.mjs            (default 100 penilai)
 *            VU=200 node scripts/loadtest/provision.mjs     (atur jumlah penilai)
 *
 * Env dibaca dari .env.loadtest bila ada, jika tidak dari .env.local.
 *
 * KEAMANAN: menolak berjalan terhadap project PRODUKSI (ref beajoczjpywozavatzmf)
 * kecuali ALLOW_PROD=1. Uji ini menulis data nyata & butuh periode 'active' —
 * jalankan terhadap project Supabase free TERPISAH (staging), bukan produksi.
 *
 * Semua entitas diberi kode LOADTEST-* agar teardown.mjs bisa menyapunya total.
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createClient } from '@supabase/supabase-js';

const HERE = dirname(fileURLToPath(import.meta.url));
const PROD_REF = 'beajoczjpywozavatzmf'; // ref project produksi — jangan diuji-beban

// --- env ---
const ENV_FILE = existsSync('.env.loadtest') ? '.env.loadtest' : '.env.local';
const env = {};
for (const line of readFileSync(ENV_FILE, 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z_]+)\s*=\s*"?([^"\n]*)"?\s*$/);
  if (m) env[m[1]] = m[2];
}
const URL = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !ANON || !SERVICE) {
  throw new Error(`Butuh NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY + SUPABASE_SERVICE_ROLE_KEY di ${ENV_FILE}`);
}
if (URL.includes(PROD_REF) && process.env.ALLOW_PROD !== '1') {
  console.error(`\n✗ DITOLAK: ${ENV_FILE} menunjuk ke project PRODUKSI (${PROD_REF}).`);
  console.error('  Uji beban menulis data nyata + butuh periode "active" yang bisa mengganggu app live.');
  console.error('  Buat project Supabase free terpisah → salin URL/anon/service ke .env.loadtest → ulangi.');
  console.error('  (Override sadar-risiko: ALLOW_PROD=1 node scripts/loadtest/provision.mjs)\n');
  process.exit(1);
}

const VU = Number(process.env.VU || 100);     // jumlah penilai (virtual users)
const TARGETS = Number(process.env.TARGETS || 5);
const ASPECTS = Number(process.env.ASPECTS || 5);
const IND_PER_ASPECT = Number(process.env.IND_PER_ASPECT || 5);
const QUESTIONS = Number(process.env.QUESTIONS || 3);
const PW = 'LoadTest@2026!';
const CODE = 'LOADTEST';

const admin = createClient(URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });

async function main() {
  console.log(`== PROVISION uji beban → ${URL} ==`);
  console.log(`   penilai=${VU} target=${TARGETS} aspek=${ASPECTS} indikator=${ASPECTS * IND_PER_ASPECT} esai=${QUESTIONS}\n`);

  // Bersihkan sisa run sebelumnya (idempoten).
  await teardownInline();

  // Periode (active + has_360) — wajib active agar RLS asmt_write mengizinkan tulis.
  const { data: per, error: pErr } = await admin.from('periods').insert({
    code: `${CODE}-P`, label: 'LOAD TEST 360', start_date: '2098-01-01', end_date: '2098-03-31',
    status: 'active', has_360: true,
  }).select('id').single();
  if (pErr) throw new Error('periods: ' + pErr.message);
  const periodId = per.id;

  // Aspek + indikator.
  const indicatorIds = [];
  for (let a = 0; a < ASPECTS; a++) {
    const { data: asp, error: aErr } = await admin.from('culture_aspects')
      .insert({ period_id: periodId, name: `${CODE} Aspek ${a + 1}`, order_idx: a }).select('id').single();
    if (aErr) throw new Error('culture_aspects: ' + aErr.message);
    const rows = Array.from({ length: IND_PER_ASPECT }, (_, i) => ({
      aspect_id: asp.id, text: `${CODE} Indikator ${a + 1}.${i + 1}`, order_idx: i,
    }));
    const { data: inds, error: iErr } = await admin.from('indicators').insert(rows).select('id');
    if (iErr) throw new Error('indicators: ' + iErr.message);
    indicatorIds.push(...inds.map((r) => r.id));
  }

  // Pertanyaan kualitatif.
  const qRows = Array.from({ length: QUESTIONS }, (_, i) => ({
    period_id: periodId, text: `${CODE} Pertanyaan ${i + 1}`, order_idx: i,
  }));
  const { data: qs, error: qErr } = await admin.from('qualitative_questions').insert(qRows).select('id');
  if (qErr) throw new Error('qualitative_questions: ' + qErr.message);
  const questionIds = qs.map((r) => r.id);

  // Target (pegawai yang dinilai).
  const targetIds = [];
  for (let t = 0; t < TARGETS; t++) {
    const email = `loadtest.tgt${t}@infarm.test`;
    const { data, error } = await admin.auth.admin.createUser({
      email, password: PW, email_confirm: true, user_metadata: { name: `LT Target ${t}`, emp_code: `${CODE}-T${t}` },
    });
    if (error) throw new Error(`createUser ${email}: ${error.message}`);
    targetIds.push(data.user.id);
  }

  // Penilai (virtual users) — dibuat paralel berkelompok agar cepat.
  console.log(`Membuat ${VU} penilai...`);
  const users = [];
  const empRows = [];
  const CHUNK = 20;
  for (let base = 0; base < VU; base += CHUNK) {
    const batch = [];
    for (let u = base; u < Math.min(base + CHUNK, VU); u++) {
      const email = `loadtest.vu${u}@infarm.test`;
      batch.push(admin.auth.admin.createUser({
        email, password: PW, email_confirm: true, user_metadata: { name: `LT VU ${u}`, emp_code: `${CODE}-V${u}` },
      }).then(({ data, error }) => {
        if (error) throw new Error(`createUser ${email}: ${error.message}`);
        const targetId = targetIds[u % TARGETS];
        users.push({ email, password: PW, targetId, assessorId: data.user.id });
        empRows.push({ id: data.user.id, emp_code: `${CODE}-V${u}`, name: `LT VU ${u}`, dept: 'LOADTEST', role: 'employee', is_active: true });
        return { assessorId: data.user.id, targetId };
      }));
    }
    await Promise.all(batch);
    process.stdout.write(`\r  ${Math.min(base + CHUNK, VU)}/${VU}`);
  }
  console.log('');

  // employees untuk target + penilai.
  for (let t = 0; t < TARGETS; t++) {
    empRows.push({ id: targetIds[t], emp_code: `${CODE}-T${t}`, name: `LT Target ${t}`, dept: 'LOADTEST', role: 'employee', is_active: true });
  }
  for (let i = 0; i < empRows.length; i += 200) {
    const { error } = await admin.from('employees').insert(empRows.slice(i, i + 200));
    if (error) throw new Error('employees: ' + error.message);
  }

  // Mapping penilai→target (faithful ke alur app; assessor unik → tanpa kontensi baris).
  const empById = new Map(empRows.map((e) => [e.emp_code, e.id]));
  const mapRows = users.map((u, idx) => ({
    period_id: periodId,
    assessor_id: empById.get(`${CODE}-V${idx}`),
    target_id: u.targetId,
    relation: 'Peer', mandatory: true, is_active: true,
  }));
  for (let i = 0; i < mapRows.length; i += 200) {
    const { error } = await admin.from('mappings').insert(mapRows.slice(i, i + 200));
    if (error) throw new Error('mappings: ' + error.message);
  }

  const fixtures = { url: URL, anonKey: ANON, periodId, indicatorIds, questionIds, users };
  const out = join(HERE, 'fixtures.json');
  writeFileSync(out, JSON.stringify(fixtures, null, 2));
  console.log(`\n✓ Selesai. ${users.length} penilai siap. Fixture → ${out}`);
  console.log('  Lanjut:  k6 run scripts/loadtest/submit.js');
  console.log('  Bersihkan setelahnya:  node scripts/loadtest/teardown.mjs\n');
}

async function teardownInline() {
  await admin.from('periods').delete().eq('code', `${CODE}-P`);
  // hapus auth users + employees LOADTEST-*
  const emails = [];
  let page = 1;
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    data.users.forEach((u) => { if (u.email && u.email.startsWith('loadtest.')) emails.push({ id: u.id, email: u.email }); });
    if (data.users.length < 200) break;
    page++;
  }
  if (emails.length) {
    const ids = emails.map((e) => e.id);
    for (let i = 0; i < ids.length; i += 200) await admin.from('employees').delete().in('id', ids.slice(i, i + 200));
    for (const e of emails) await admin.auth.admin.deleteUser(e.id);
  }
}

main().catch((e) => { console.error('\nGAGAL provision:', e.message); process.exit(1); });
