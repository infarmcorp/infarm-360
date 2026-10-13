import { describe, it, expect } from 'vitest';
import { parseSummary, parseInline, hasSummaryMarkup } from '@/lib/summary-format';

const t = (text: string) => ({ text, bold: false });
const b = (text: string) => ({ text, bold: true });

describe('parseInline', () => {
  it('memecah teks biasa & tebal', () => {
    expect(parseInline('**Catatan:** ada penilai')).toEqual([b('Catatan:'), t(' ada penilai')]);
    expect(parseInline('a **b** c **d**')).toEqual([t('a '), b('b'), t(' c '), b('d')]);
  });
  it('`**` tanpa pasangan dibiarkan apa adanya', () => {
    expect(parseInline('nilai **5 dari 5')).toEqual([t('nilai **5 dari 5')]);
  });
});

describe('parseSummary', () => {
  it('teks lama tanpa tanda → paragraf, pindah baris dipertahankan', () => {
    expect(parseSummary('Baris satu\nBaris dua\n\nParagraf dua')).toEqual([
      { kind: 'p', lines: [[t('Baris satu')], [t('Baris dua')]] },
      { kind: 'p', lines: [[t('Paragraf dua')]] },
    ]);
  });

  it('judul tebal + daftar poin (contoh "Jujur & Tanggung Jawab")', () => {
    const s = '**Perlu Peningkatan.**\n- Empat dari delapan penilai.\n• Tidak sungkan.\n- **Catatan:** komitmen.';
    expect(parseSummary(s)).toEqual([
      { kind: 'p', lines: [[b('Perlu Peningkatan.')]] },
      { kind: 'ul', items: [[[t('Empat dari delapan penilai.')]], [[t('Tidak sungkan.')]], [[b('Catatan:'), t(' komitmen.')]]] },
    ]);
  });

  it('baris setelah poin = lanjutan poin (contoh "Perlu Dikembangkan"); baris kosong menutup daftar', () => {
    const s = '- **Prioritas utama**\r\nTiga dari delapan penilai.\n- **Ketegasan**\n  Penilai berharap.\n\nPenutup.';
    expect(parseSummary(s)).toEqual([
      { kind: 'ul', items: [
        [[b('Prioritas utama')], [t('Tiga dari delapan penilai.')]],
        [[b('Ketegasan')], [t('Penilai berharap.')]],
      ] },
      { kind: 'p', lines: [[t('Penutup.')]] },
    ]);
  });

  it('`**` di awal baris bukan poin; `-` tanpa spasi bukan poin', () => {
    expect(parseSummary('**Tebal** awal')[0].kind).toBe('p');
    expect(parseSummary('-5 poin')[0]).toEqual({ kind: 'p', lines: [[t('-5 poin')]] });
  });

  it('teks kosong → tanpa blok', () => {
    expect(parseSummary('  \n\n')).toEqual([]);
  });
});

describe('hasSummaryMarkup', () => {
  it('mendeteksi tebal/poin', () => {
    expect(hasSummaryMarkup('biasa saja')).toBe(false);
    expect(hasSummaryMarkup('ada **tebal**')).toBe(true);
    expect(hasSummaryMarkup('x\n- poin')).toBe(true);
  });
});

describe('poin gaya Excel', () => {
  it('`* ` di awal sel = poin (Excel menolak sel berawalan "-")', () => {
    expect(parseSummary('* **Prioritas**\nPenjelasan\n- Poin dua')).toEqual([
      { kind: 'ul', items: [[[b('Prioritas')], [t('Penjelasan')]], [[t('Poin dua')]]] },
    ]);
  });
});
