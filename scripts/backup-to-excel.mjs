/**
 * KONVERSI folder backup (JSON) → satu file Excel (.xlsx), 1 sheet per tabel.
 *
 * Untuk DIBACA/ARSIP saja — BUKAN pengganti backup. Excel tak bisa di-restore
 * (kehilangan tipe data/null/jsonb). Untuk pemulihan tetap pakai folder JSON.
 *
 * Akun login (auth.users / auth.identities) DIKECUALIKAN — hash sandi tak perlu
 * masuk Excel. Kolom objek/array (jsonb) diubah jadi teks JSON agar terbaca.
 *
 * Cara pakai (xlsx sudah ada di proyek — tak perlu install):
 *   node scripts/backup-to-excel.mjs backups/backup-<timestamp>
 *
 * Hasil → backups/backup-<timestamp>.xlsx
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import * as fs from 'node:fs';
import * as XLSX from 'xlsx';

// Build ESM xlsx tak otomatis punya akses fs → daftarkan agar writeFile bisa ke disk.
XLSX.set_fs(fs);

const dir = process.argv[2];
if (!dir) { console.error('❌ Sebutkan folder backup. Contoh:\n   node scripts/backup-to-excel.mjs backups/backup-2026-06-27T...'); process.exit(1); }
if (!existsSync(`${dir}/_manifest.json`)) { console.error(`❌ ${dir}/_manifest.json tak ditemukan — pastikan folder backup benar.`); process.exit(1); }

// Sel non-primitif (objek/array dari jsonb) → teks JSON agar tak jadi "[object Object]".
const flatten = (row) => {
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    out[k] = (v !== null && typeof v === 'object') ? JSON.stringify(v) : v;
  }
  return out;
};

// Nama sheet Excel: maks 31 char, tanpa karakter terlarang ( : \ / ? * [ ] ).
const sheetName = (name) => name.replace(/[:\\/?*[\]]/g, '_').slice(0, 31);

const wb = XLSX.utils.book_new();
const used = new Set();
let sheets = 0, totalRows = 0;

// Sheet ringkasan dari manifest (tabel + jumlah baris).
const manifest = JSON.parse(readFileSync(`${dir}/_manifest.json`, 'utf8'));
const summary = Object.entries(manifest.tables || {}).map(([tabel, baris]) => ({ tabel, baris }));
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summary), 'RINGKASAN');

const files = readdirSync(dir)
  .filter((f) => f.endsWith('.json') && f !== '_manifest.json')
  .filter((f) => !f.startsWith('auth.')); // kecualikan akun login (hash sandi)

for (const f of files.sort()) {
  const rows = JSON.parse(readFileSync(`${dir}/${f}`, 'utf8'));
  const base = f.replace(/\.json$/, '');
  let name = sheetName(base);
  // Hindari nama sheet bentrok setelah dipotong 31 char.
  let i = 2; while (used.has(name)) { name = sheetName(base).slice(0, 28) + '_' + i++; }
  used.add(name);
  const ws = rows.length ? XLSX.utils.json_to_sheet(rows.map(flatten)) : XLSX.utils.aoa_to_sheet([['(kosong)']]);
  XLSX.utils.book_append_sheet(wb, ws, name);
  sheets++; totalRows += rows.length;
  console.log(`  ✓ ${base.padEnd(34)} ${rows.length} baris`);
}

const out = `${dir.replace(/[\\/]$/, '')}.xlsx`;
XLSX.writeFile(wb, out);
console.log(`\n✅ Excel dibuat — ${sheets} sheet, ${totalRows} baris (auth.* dikecualikan).`);
console.log(`   Tersimpan di: ${out}`);
