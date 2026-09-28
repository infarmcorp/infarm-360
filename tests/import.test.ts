import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import {
  pickField,
  parseKpiRows, isValidKpiRow, type KpiMember,
  parseMappingRows, classifyMappingRows, normRelation, normMandatory, type MapEmp,
} from '@/lib/import/parse';

/** Bangun baris seperti yang dihasilkan komponen klien: objek → sheet xlsx → sheet_to_json. */
function sheetRows(objs: Record<string, unknown>[]): Record<string, unknown>[] {
  const ws = XLSX.utils.json_to_sheet(objs);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'S');
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  const wb2 = XLSX.read(buf, { type: 'array' });
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(wb2.Sheets[wb2.SheetNames[0]], { defval: '' });
}

const MEMBERS: KpiMember[] = [
  { id: 'u1', code: 'EMP001', name: 'Andi', dept: 'Operasional' },
  { id: 'u2', code: 'emp002', name: 'Budi', dept: 'Operasional' }, // kode lowercase → diuji normalisasi
];

describe('pickField — resolusi kolom berdasar alias', () => {
  it('cocok case-insensitive + trim, ambil nilai yang di-trim', () => {
    expect(pickField({ '  Emp_Code ': '  EMP001 ' }, ['emp_code', 'kode'])).toBe('EMP001');
  });
  it("'' bila tak ada kolom cocok", () => {
    expect(pickField({ lain: 'x' }, ['emp_code', 'kode'])).toBe('');
  });
});

describe('parseKpiRows', () => {
  it('mencocokkan emp_code (uppercased) ke anggota + baca skor & catatan', () => {
    const rows = parseKpiRows([{ emp_code: 'EMP001', score: '90', note: 'bagus' }], MEMBERS);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ code: 'EMP001', score: 90, note: 'bagus', member: { id: 'u1' } });
  });

  it('menormalkan kode ke uppercase agar cocok ke anggota meski input lowercase', () => {
    const rows = parseKpiRows([{ kode: 'emp002', skor: '88' }], MEMBERS);
    expect(rows[0].code).toBe('EMP002');
    expect(rows[0].member?.id).toBe('u2');
  });

  it('menerima alias kolom (kode/skor/nilai/kpi, catatan/komentar)', () => {
    const rows = parseKpiRows([{ kode: 'EMP001', nilai: '75', komentar: 'c' }], MEMBERS);
    expect(rows[0]).toMatchObject({ code: 'EMP001', score: 75, note: 'c' });
  });

  it('kode tak dikenal → member null', () => {
    const rows = parseKpiRows([{ emp_code: 'ZZZ999', score: '50' }], MEMBERS);
    expect(rows[0].member).toBeNull();
  });

  it('membuang baris tanpa kode', () => {
    const rows = parseKpiRows([{ score: '90' }, { emp_code: 'EMP001', score: '80' }], MEMBERS);
    expect(rows).toHaveLength(1);
    expect(rows[0].code).toBe('EMP001');
  });

  it('skor kosong → NaN (bukan 0)', () => {
    const rows = parseKpiRows([{ emp_code: 'EMP001', score: '' }], MEMBERS);
    expect(Number.isNaN(rows[0].score)).toBe(true);
  });

  it('input kosong → array kosong', () => {
    expect(parseKpiRows([], MEMBERS)).toEqual([]);
  });
});

describe('isValidKpiRow', () => {
  const row = (code: string, score: number): ReturnType<typeof parseKpiRows>[number] =>
    parseKpiRows([{ emp_code: code, score: String(score) }], MEMBERS)[0];

  it('valid: kode cocok & skor 0–100 (termasuk batas 0 dan 100)', () => {
    expect(isValidKpiRow(row('EMP001', 0))).toBe(true);
    expect(isValidKpiRow(row('EMP001', 100))).toBe(true);
    expect(isValidKpiRow(row('EMP001', 87.5))).toBe(true);
  });
  it('tidak valid: skor di luar 0–100', () => {
    expect(isValidKpiRow(row('EMP001', -1))).toBe(false);
    expect(isValidKpiRow(row('EMP001', 101))).toBe(false);
  });
  it('tidak valid: kode tak cocok ke anggota', () => {
    expect(isValidKpiRow(row('ZZZ999', 90))).toBe(false);
  });
  it('tidak valid: skor kosong/non-numerik (kosong tidak lagi diimpor sebagai 0)', () => {
    const r = parseKpiRows([{ emp_code: 'EMP001', score: '' }], MEMBERS)[0];
    expect(isValidKpiRow(r)).toBe(false);
    const r2 = parseKpiRows([{ emp_code: 'EMP001', score: 'abc' }], MEMBERS)[0];
    expect(isValidKpiRow(r2)).toBe(false);
  });
});

describe('parseKpiRows — round-trip lewat xlsx asli (paritas jalur klien)', () => {
  it('mendeteksi kolom dari sheet .xlsx nyata', () => {
    const raw = sheetRows([
      { emp_code: 'EMP001', nama: 'Andi', score: 92, note: 'oke' },
      { emp_code: 'emp002', nama: 'Budi', score: 70, note: '' },
    ]);
    const rows = parseKpiRows(raw, MEMBERS);
    expect(rows.map((r) => r.code)).toEqual(['EMP001', 'EMP002']);
    expect(rows.filter(isValidKpiRow)).toHaveLength(2);
  });
});

/* ───────────────────────────── Pemetaan 360° ───────────────────────────── */

const EMPS: MapEmp[] = [
  { id: 'a1', code: 'SPV001', name: 'Gunawan' },
  { id: 'a2', code: 'EMP001', name: 'Andi' },
  { id: 'a3', code: 'EMP002', name: 'Budi' },
];

describe('normRelation / normMandatory', () => {
  it('normRelation case-insensitive → bentuk kanonik; tak dikenal → ""', () => {
    expect(normRelation('atasan')).toBe('Atasan');
    expect(normRelation('  PEER ')).toBe('Peer');
    expect(normRelation('bos')).toBe('');
  });
  it('normMandatory: wajib/ya/1/true → true; opsional/"" → false', () => {
    expect(normMandatory('wajib')).toBe(true);
    expect(normMandatory('YA')).toBe(true);
    expect(normMandatory('1')).toBe(true);
    expect(normMandatory('opsional')).toBe(false);
    expect(normMandatory('')).toBe(false);
  });
});

describe('parseMappingRows', () => {
  it('cocokkan kode penilai/dinilai (uppercased) + normalisasi relasi & sifat', () => {
    const rows = parseMappingRows([{ penilai: 'spv001', dinilai: 'EMP001', relasi: 'atasan', wajib: 'wajib' }], EMPS);
    expect(rows[0]).toMatchObject({
      aCode: 'SPV001', tCode: 'EMP001', relation: 'Atasan', mandatory: true,
      assessor: { id: 'a1' }, target: { id: 'a2' }, relOk: true,
    });
  });
  it('menerima alias kolom (assessor/target/relation/mandatory)', () => {
    const rows = parseMappingRows([{ assessor: 'SPV001', target: 'EMP002', relation: 'Peer', mandatory: '0' }], EMPS);
    expect(rows[0]).toMatchObject({ aCode: 'SPV001', tCode: 'EMP002', relation: 'Peer', mandatory: false });
  });
  it('membuang baris tanpa kode penilai maupun dinilai', () => {
    const rows = parseMappingRows([{ relasi: 'Peer' }, { penilai: 'SPV001', dinilai: 'EMP001', relasi: 'Atasan' }], EMPS);
    expect(rows).toHaveLength(1);
  });
});

describe('classifyMappingRows', () => {
  const parse = (objs: Record<string, unknown>[]) => classifyMappingRows(parseMappingRows(objs, EMPS));

  it('ok: pasangan valid, relasi valid', () => {
    const c = parse([{ penilai: 'SPV001', dinilai: 'EMP001', relasi: 'Atasan', wajib: 'wajib' }]);
    expect(c[0]).toMatchObject({ status: 'ok', line: 1, reason: '' });
  });

  it('invalid: kode penilai tak dikenal', () => {
    const c = parse([{ penilai: 'ZZZ', dinilai: 'EMP001', relasi: 'Peer' }]);
    expect(c[0].status).toBe('invalid');
    expect(c[0].reason).toContain('penilai');
  });

  it('invalid: kode dinilai tak dikenal', () => {
    const c = parse([{ penilai: 'SPV001', dinilai: 'ZZZ', relasi: 'Peer' }]);
    expect(c[0].status).toBe('invalid');
    expect(c[0].reason).toContain('dinilai');
  });

  it('invalid: relasi kosong/tak valid', () => {
    const c = parse([{ penilai: 'SPV001', dinilai: 'EMP001', relasi: 'bukan-relasi' }]);
    expect(c[0]).toMatchObject({ status: 'invalid', reason: 'Relasi kosong/tak valid' });
  });

  it('invalid: penilai = dinilai (Self Assessment dinonaktifkan, BR-02)', () => {
    const c = parse([{ penilai: 'EMP001', dinilai: 'EMP001', relasi: 'Peer' }]);
    expect(c[0].status).toBe('invalid');
  });

  it('invalid: relasi Self dinonaktifkan meski penilai ≠ dinilai', () => {
    const c = parse([{ penilai: 'SPV001', dinilai: 'EMP001', relasi: 'Self' }]);
    expect(c[0]).toMatchObject({ status: 'invalid', reason: 'Relasi Self dinonaktifkan untuk periode ini' });
  });

  it('dup: pasangan penilai→target berulang (relasi tak dihitung untuk keunikan)', () => {
    const c = parse([
      { penilai: 'SPV001', dinilai: 'EMP001', relasi: 'Atasan' },
      { penilai: 'SPV001', dinilai: 'EMP001', relasi: 'Peer' },
    ]);
    expect(c[0].status).toBe('ok');
    expect(c[1].status).toBe('dup');
    expect(c[1].reason).toContain('baris 1');
  });

  it('penomoran baris 1-based dipertahankan lintas baris campuran', () => {
    const c = parse([
      { penilai: 'SPV001', dinilai: 'EMP001', relasi: 'Atasan' },
      { penilai: 'ZZZ', dinilai: 'EMP002', relasi: 'Peer' },
    ]);
    expect(c.map((x) => x.line)).toEqual([1, 2]);
    expect(c[1].status).toBe('invalid');
  });
});
