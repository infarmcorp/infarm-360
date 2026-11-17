import { describe, it, expect } from 'vitest';
import { isDriveUrl, ReportFolderUrl, tableMissing } from '@/lib/report-folder';

// Folder Laporan (Drive) dipensiunkan 2026-11-17 (PDF diunduh langsung); helper lib tetap diuji karena
// tableMissing dipakai bersama (jadwal Email Rilis).
const URL_OK = 'https://drive.google.com/drive/folders/1AbCdEf';

describe('isDriveUrl / ReportFolderUrl', () => {
  it('terima tautan folder Google Drive', () => {
    expect(isDriveUrl(URL_OK)).toBe(true);
    expect(isDriveUrl('https://drive.google.com/file/d/xyz/view')).toBe(true);
  });
  it('tolak host lain, http, dan host tiruan', () => {
    expect(isDriveUrl('http://drive.google.com/drive/folders/1')).toBe(false);
    expect(isDriveUrl('https://drive.google.com.evil.com/x')).toBe(false);
    expect(isDriveUrl('https://docs.google.com/document/d/1')).toBe(false);
    expect(isDriveUrl('javascript:alert(1)')).toBe(false);
    expect(isDriveUrl('bukan url')).toBe(false);
  });
  it('kosong → null (hapus); dipangkas', () => {
    expect(ReportFolderUrl.parse('  ')).toBeNull();
    expect(ReportFolderUrl.parse(`  ${URL_OK}  `)).toBe(URL_OK);
    expect(ReportFolderUrl.safeParse('https://evil.com').success).toBe(false);
  });
  it('tableMissing mengenali tabel belum ada', () => {
    expect(tableMissing({ code: '42P01' })).toBe(true);
    expect(tableMissing({ code: 'PGRST205' })).toBe(true);
    expect(tableMissing({ code: '23505' })).toBe(false);
    expect(tableMissing(null)).toBe(false);
  });
});
