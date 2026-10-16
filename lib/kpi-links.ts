/**
 * Tautan menu "Monitoring & Audit KPI" → langsung ke Riwayat & Audit. Halaman /kpi punya dua tata
 * letak: mode pemantauan (HRD Mode Admin & pemegang grant) membaca `?view=`, mode tab (SPV/HRD
 * Mode-SPV, termasuk SPV ber-izin HRD di Mode Admin) membaca `?tab=` — keduanya disertakan.
 */
export const KPI_AUDIT_HREF = '/kpi?view=riwayat&tab=riwayat';
