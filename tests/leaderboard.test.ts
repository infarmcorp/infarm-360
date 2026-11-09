import { describe, it, expect } from 'vitest';
import { bottomWithoutTop } from '@/app/(app)/admin/dashboard/dashboard-visual';

const rows = (ids: number[]) => ids.map((n) => ({ id: String(n) }));

describe('Peringkat Dashboard: pegawai tidak muncul di Teratas sekaligus Terbawah', () => {
  it('12 pegawai: Terbawah hanya sisa 2 orang terendah, urutan dari skor terendah tetap', () => {
    const ranked = Array.from({ length: 12 }, (_, i) => i + 1); // 1 = skor tertinggi
    const top = rows(ranked.slice(0, 10));
    const bottom = rows([...ranked].reverse().slice(0, 10));
    expect(bottomWithoutTop(top, bottom).map((r) => r.id)).toEqual(['12', '11']);
  });

  it('6 pegawai: semua sudah di Teratas, Terbawah kosong', () => {
    const six = rows([1, 2, 3, 4, 5, 6]);
    expect(bottomWithoutTop(six, [...six].reverse())).toEqual([]);
  });

  it('20 pegawai atau lebih: daftar Terbawah utuh', () => {
    const top = rows([1, 2, 3]);
    const bottom = rows([20, 19, 18]);
    expect(bottomWithoutTop(top, bottom)).toEqual(bottom);
  });
});
