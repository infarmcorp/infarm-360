/**
 * Logika parsing & validasi impor Excel/CSV — MURNI (tanpa React/DOM/xlsx), agar bisa
 * diuji unit (tests/import.test.ts). Pembacaan file (`XLSX.read` → `sheet_to_json`) tetap
 * di komponen klien; fungsi di sini menerima baris mentah (hasil `sheet_to_json`).
 *
 * Dua jalur: KPI massal (`parseKpiRows`) & pemetaan 360° (`parseMappingRows` + classify).
 */

/** Ambil nilai kolom berdasar alias nama (case-insensitive, di-trim). '' bila tak ada. */
export function pickField(row: Record<string, unknown>, keys: string[]): string {
  const found = Object.keys(row).find((k) => keys.includes(k.trim().toLowerCase()));
  return found ? String(row[found]).trim() : '';
}

/* ───────────────────────────── KPI massal ───────────────────────────── */

export type KpiMember = { id: string; code: string; name: string; dept: string };
export type KpiParsedRow = { code: string; score: number; note: string; member: KpiMember | null };

const KPI_CODE_KEYS = ['emp_code', 'kode', 'kode pegawai', 'id'];
const KPI_SCORE_KEYS = ['score', 'skor', 'nilai', 'kpi'];
const KPI_NOTE_KEYS = ['note', 'catatan', 'komentar'];

/**
 * Parse baris KPI: cocokkan `emp_code` (uppercase) ke anggota, baca skor & catatan.
 * Baris tanpa kode dibuang. Skor kosong → NaN (akan dianggap tak valid), bukan 0.
 */
export function parseKpiRows(raw: Record<string, unknown>[], members: KpiMember[]): KpiParsedRow[] {
  const byCode = new Map(members.map((m) => [m.code.toUpperCase(), m]));
  return raw
    .map((r) => {
      const code = pickField(r, KPI_CODE_KEYS).toUpperCase();
      const scoreStr = pickField(r, KPI_SCORE_KEYS);
      const note = pickField(r, KPI_NOTE_KEYS);
      const score = scoreStr === '' ? NaN : Number(scoreStr);
      return { code, score, note, member: byCode.get(code) ?? null };
    })
    .filter((r) => r.code);
}

/** Baris KPI valid: kode cocok ke anggota & skor angka 0–100. */
export function isValidKpiRow(r: KpiParsedRow): boolean {
  return !!r.member && Number.isFinite(r.score) && r.score >= 0 && r.score <= 100;
}

/* ───────────────────────────── Pemetaan 360° ───────────────────────────── */

export const MAPPING_RELATIONS = ['Atasan', 'Peer', 'Cross', 'Self', 'Bawahan'] as const;
export type Relation = (typeof MAPPING_RELATIONS)[number];

/** Normalisasi relasi ke salah satu MAPPING_RELATIONS (case-insensitive); '' bila tak cocok. */
export const normRelation = (s: string): string =>
  MAPPING_RELATIONS.find((r) => r.toLowerCase() === s.trim().toLowerCase()) ?? '';

/** Normalisasi kolom sifat → wajib (true) / opsional (false). */
export const normMandatory = (s: string): boolean =>
  ['wajib', 'true', '1', 'ya', 'y'].includes(s.trim().toLowerCase());

export type MapEmp = { id: string; code: string; name: string };
export type MapParsedRow = {
  aCode: string; tCode: string; relation: string; mandatory: boolean;
  assessor: MapEmp | null; target: MapEmp | null; relOk: boolean;
};

const MAP_ASSESSOR_KEYS = ['penilai', 'assessor_code', 'assessor', 'penilai_code'];
const MAP_TARGET_KEYS = ['dinilai', 'target_code', 'target', 'dinilai_code'];
const MAP_REL_KEYS = ['relasi', 'relation'];
const MAP_MAND_KEYS = ['wajib', 'mandatory', 'sifat'];

/** Parse baris pemetaan: cocokkan kode penilai/dinilai (uppercase), normalisasi relasi & sifat.
 *  Baris tanpa kode penilai maupun dinilai dibuang. */
export function parseMappingRows(raw: Record<string, unknown>[], employees: MapEmp[]): MapParsedRow[] {
  const byCode = new Map(employees.map((e) => [e.code.toUpperCase(), e]));
  return raw
    .map((r) => {
      const aCode = pickField(r, MAP_ASSESSOR_KEYS).toUpperCase();
      const tCode = pickField(r, MAP_TARGET_KEYS).toUpperCase();
      const relation = normRelation(pickField(r, MAP_REL_KEYS));
      const mandatory = normMandatory(pickField(r, MAP_MAND_KEYS));
      return {
        aCode, tCode, relation, mandatory,
        assessor: byCode.get(aCode) ?? null, target: byCode.get(tCode) ?? null, relOk: !!relation,
      };
    })
    .filter((r) => r.aCode || r.tCode);
}

export type MapStatus = 'ok' | 'dup' | 'invalid';
export type MapClassified = { r: MapParsedRow; line: number; status: MapStatus; reason: string };

/**
 * Klasifikasi tiap baris pemetaan + alasan bila dilewati (nomor baris 1-based):
 *  - 'invalid' : kode penilai/dinilai tak dikenal, relasi kosong/tak valid, ATAU Self
 *                Assessment (penilai = dinilai, atau relasi 'Self') — DINONAKTIFKAN
 *                (BR-02, kebijakan Q3 2026: tidak menggunakan Self Assessment).
 *  - 'dup'     : pasangan penilai→target sama dengan baris sebelumnya (keunikan DB =
 *                penilai+target saja, relasi tak dihitung).
 *  - 'ok'      : siap diimpor.
 */
export function classifyMappingRows(rows: MapParsedRow[]): MapClassified[] {
  const seen = new Map<string, number>(); // pasangan → nomor baris pertama (1-based)
  return rows.map((r, i) => {
    let status: MapStatus = 'ok';
    let reason = '';
    if (!r.assessor) { status = 'invalid'; reason = `Kode penilai "${r.aCode || '?'}" tak dikenal`; }
    else if (!r.target) { status = 'invalid'; reason = `Kode dinilai "${r.tCode || '?'}" tak dikenal`; }
    else if (!r.relOk) { status = 'invalid'; reason = 'Relasi kosong/tak valid'; }
    else if (r.assessor.id === r.target.id) { status = 'invalid'; reason = 'Penilai = Dinilai tidak diperbolehkan (Self Assessment dinonaktifkan)'; }
    else if (r.relation === 'Self') { status = 'invalid'; reason = 'Relasi Self dinonaktifkan untuk periode ini'; }
    else {
      const key = `${r.assessor.id}|${r.target.id}`;
      if (seen.has(key)) { status = 'dup'; reason = `Duplikat — pasangan sama dengan baris ${seen.get(key)}`; }
      else seen.set(key, i + 1);
    }
    return { r, line: i + 1, status, reason };
  });
}
