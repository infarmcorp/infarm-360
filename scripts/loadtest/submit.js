/**
 * UJI BEBAN k6 — meniru PERSIS submitAssessment (app/(app)/penilaian/actions.ts)
 * lewat REST Supabase: login → upsert header assessments → batch upsert skor indikator
 * → batch upsert jawaban esai. Setiap VU = satu penilai (assessor_id unik → tanpa
 * kontensi baris), jadi ini mengukur kapasitas tulis Supabase pada beban serempak.
 *
 * Prasyarat:  node scripts/loadtest/provision.mjs   (membuat fixtures.json)
 * Jalankan:   k6 run scripts/loadtest/submit.js
 *   atur:     k6 run -e VUS=100 -e DURATION=2m scripts/loadtest/submit.js
 *             k6 run -e RAMP=1 scripts/loadtest/submit.js   (mode burst: ramping-vus)
 * Bersihkan:  node scripts/loadtest/teardown.mjs
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Rate } from 'k6/metrics';

const FIX = JSON.parse(open('./fixtures.json'));
const VUS = Number(__ENV.VUS || 100);
const DURATION = __ENV.DURATION || '1m';
const RAMP = __ENV.RAMP === '1';

const submitDur = new Trend('submit_full_ms', true); // total 1 submit (3 round-trip)
const submitErr = new Rate('submit_errors');

export const options = RAMP
  ? {
      // Mode BURST: naik cepat ke VUS lalu turun — meniru "100 orang submit serempak".
      scenarios: {
        burst: {
          executor: 'ramping-vus',
          startVUs: 0,
          stages: [
            { duration: '10s', target: VUS },
            { duration: '30s', target: VUS },
            { duration: '5s', target: 0 },
          ],
          gracefulRampDown: '10s',
        },
      },
      thresholds: {
        submit_full_ms: ['p(95)<3000'],
        submit_errors: ['rate<0.01'],
        http_req_failed: ['rate<0.01'],
      },
    }
  : {
      // Mode SUSTAINED: VUS konstan selama DURATION — meniru beban berkelanjutan.
      vus: VUS,
      duration: DURATION,
      thresholds: {
        submit_full_ms: ['p(95)<3000'],
        submit_errors: ['rate<0.01'],
        http_req_failed: ['rate<0.01'],
      },
    };

const REST = `${FIX.url}/rest/v1`;
const AUTH = `${FIX.url}/auth/v1`;

// Token di-cache per-VU (module scope = per VU instance di k6).
let token = null;
let me = null;

function login() {
  const u = FIX.users[(__VU - 1) % FIX.users.length];
  me = u;
  const res = http.post(
    `${AUTH}/token?grant_type=password`,
    JSON.stringify({ email: u.email, password: u.password }),
    { headers: { apikey: FIX.anonKey, 'Content-Type': 'application/json' }, tags: { op: 'login' } },
  );
  const ok = check(res, { 'login 200': (r) => r.status === 200 });
  if (!ok) { console.error(`login gagal VU${__VU}: ${res.status} ${res.body}`); return false; }
  token = res.json('access_token');
  return true;
}

function H(extra) {
  return Object.assign(
    { apikey: FIX.anonKey, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    extra || {},
  );
}

export default function () {
  if (!token && !login()) { submitErr.add(1); sleep(1); return; }

  const t0 = Date.now();

  // 1) Upsert header assessment → ambil id (sama: onConflict period_id,assessor_id,target_id).
  const hRes = http.post(
    `${REST}/assessments?on_conflict=period_id,assessor_id,target_id&select=id`,
    JSON.stringify({
      period_id: FIX.periodId, assessor_id: me.assessorId, target_id: me.targetId,
      status: 'submitted', submitted_at: new Date().toISOString(),
    }),
    { headers: H({ Prefer: 'resolution=merge-duplicates,return=representation' }), tags: { op: 'header' } },
  );
  const headerOk = check(hRes, { 'header 2xx': (r) => r.status >= 200 && r.status < 300 });
  if (!headerOk) {
    submitErr.add(1);
    if (hRes.status === 401) token = null; // sesi kedaluwarsa → login ulang iterasi berikut
    else console.error(`header VU${__VU}: ${hRes.status} ${hRes.body}`);
    return;
  }
  const assessmentId = hRes.json('0.id');

  // 2) Batch upsert skor indikator (semua indikator sekaligus — bukan loop).
  const scores = FIX.indicatorIds.map((iid) => ({
    assessment_id: assessmentId, indicator_id: iid, rating: 4,
    comment: 'Bukti perilaku uji beban — konsisten dan kolaboratif.',
  }));
  const sRes = http.post(
    `${REST}/assessment_indicator_scores?on_conflict=assessment_id,indicator_id`,
    JSON.stringify(scores),
    { headers: H({ Prefer: 'resolution=merge-duplicates' }), tags: { op: 'scores' } },
  );
  const scoresOk = check(sRes, { 'scores 2xx': (r) => r.status >= 200 && r.status < 300 });

  // 3) Batch upsert jawaban esai.
  let answersOk = true;
  if (FIX.questionIds.length) {
    const answers = FIX.questionIds.map((qid) => ({
      assessment_id: assessmentId, question_id: qid, answer: 'Jawaban esai uji beban.',
    }));
    const aRes = http.post(
      `${REST}/assessment_qual_answers?on_conflict=assessment_id,question_id`,
      JSON.stringify(answers),
      { headers: H({ Prefer: 'resolution=merge-duplicates' }), tags: { op: 'answers' } },
    );
    answersOk = check(aRes, { 'answers 2xx': (r) => r.status >= 200 && r.status < 300 });
  }

  submitDur.add(Date.now() - t0);
  submitErr.add(!(scoresOk && answersOk));

  sleep(Math.random() * 2 + 0.5); // think-time 0.5–2.5s antar submit
}
