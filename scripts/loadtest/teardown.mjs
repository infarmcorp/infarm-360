/**
 * TEARDOWN uji beban — hapus SEMUA fixture LOADTEST-* (periode cascade ke aspek/
 * indikator/pertanyaan/assessments/skor/esai/mapping; + auth users & employees).
 * Aman dijalankan berulang. Jalankan setelah `k6 run`.
 *
 *   node scripts/loadtest/teardown.mjs
 */
import { readFileSync, existsSync, rmSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createClient } from '@supabase/supabase-js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ENV_FILE = existsSync('.env.loadtest') ? '.env.loadtest' : '.env.local';
const env = {};
for (const line of readFileSync(ENV_FILE, 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z_]+)\s*=\s*"?([^"\n]*)"?\s*$/);
  if (m) env[m[1]] = m[2];
}
const URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !SERVICE) throw new Error(`Butuh NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY di ${ENV_FILE}`);

const admin = createClient(URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });

async function main() {
  console.log(`== TEARDOWN uji beban → ${URL} ==`);
  await admin.from('periods').delete().eq('code', 'LOADTEST-P');

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
  const fx = join(HERE, 'fixtures.json');
  if (existsSync(fx)) rmSync(fx);
  console.log(`✓ Dibersihkan: periode LOADTEST + ${emails.length} user.`);
}

main().catch((e) => { console.error('GAGAL teardown:', e.message); process.exit(1); });
