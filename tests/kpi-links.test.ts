import { describe, it, expect } from 'vitest';
import { KPI_AUDIT_HREF } from '@/lib/kpi-links';

// Menu "Monitoring & Audit KPI" harus membuka Riwayat & Audit di KEDUA tata letak halaman /kpi:
// mode pemantauan (HRD Mode Admin & grant) membaca `?view=`, mode tab (SPV ber-izin HRD) membaca `?tab=`.
describe('KPI_AUDIT_HREF — tautan menu Monitoring & Audit KPI', () => {
  const url = new URL(KPI_AUDIT_HREF, 'http://x');
  it('menuju /kpi', () => expect(url.pathname).toBe('/kpi'));
  it('mode pemantauan → view=riwayat', () => expect(url.searchParams.get('view')).toBe('riwayat'));
  it('mode tab → tab=riwayat', () => expect(url.searchParams.get('tab')).toBe('riwayat'));
});
