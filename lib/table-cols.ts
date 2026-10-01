/**
 * Lebar kolom tabel `table-fixed` dalam PERSEN dari bobot (proporsi px). Kolom bersyarat diberi
 * `false` (mis. `has360 && 88`) → dilewati, sisanya dinormalkan agar SELALU berjumlah 100% untuk
 * tiap kombinasi kolom (tak ada celah/overflow). Kolom terakhir menyerap sisa pembulatan.
 * Dipakai di `<colgroup>`: `colPercents([...]).map((w, i) => <col key={i} style={{ width: w }} />)`.
 * Modul polos (tanpa 'use client') agar bisa dipakai komponen server maupun klien.
 */
export function colPercents(weights: (number | false | null | undefined)[]): string[] {
  const ws = weights.filter((w): w is number => typeof w === 'number' && w > 0);
  const total = ws.reduce((a, b) => a + b, 0);
  if (total === 0) return [];
  let used = 0;
  return ws.map((w, i) => {
    if (i === ws.length - 1) return `${Math.round((100 - used) * 1000) / 1000}%`;
    const p = Math.round((w / total) * 100 * 1000) / 1000;
    used += p;
    return `${p}%`;
  });
}
