import { describe, it, expect } from 'vitest';
import { reportDetailRoute, roleGrantRecipients, type ActorRow } from '@/lib/auth/roles';

// Halaman detail laporan (/laporan/[employeeId]) memilih jalur tampilan lewat reportDetailRoute.
// Inti Gelombang 3 (sisa temuan no. 11): tampilan HRD penuh HANYA untuk pemegang izin HRD di Mode Admin.

const employee: ActorRow = { role: 'employee' };
const empHrd: ActorRow = { role: 'employee', is_hrd_admin: true };          // pegawai ber-izin HRD
const empHrdCoord: ActorRow = { role: 'employee', is_hrd_admin: true, is_coordinator: true };
const coord: ActorRow = { role: 'employee', is_coordinator: true };
const spv: ActorRow = { role: 'spv' };
const spvHrd: ActorRow = { role: 'spv', is_hrd_admin: true };
const hrd: ActorRow = { role: 'hrd' };
const hrdNoLaporan: ActorRow = { role: 'hrd', hrd_sections: ['pegawai'] };   // HRD tanpa bagian Laporan
const direksi: ActorRow = { role: 'direksi' };

describe('reportDetailRoute — Mode Admin', () => {
  it('pemegang izin HRD di Mode Admin → tampilan HRD penuh', () => {
    expect(reportDetailRoute(hrd, 'admin', false)).toBe('hrd');
    expect(reportDetailRoute(empHrd, 'admin', false)).toBe('hrd');
    expect(reportDetailRoute(empHrdCoord, 'admin', false)).toBe('hrd');
  });
  it('SPV ber-izin HRD tetap jalur SPV walau di Mode Admin (perilaku lama; temuan no. 11 ditutup 2026-10-14 karena tak ada SPV ber-izin HRD di production)', () => {
    expect(reportDetailRoute(spvHrd, 'admin', false)).toBe('spv');
  });
  it('HRD penuh di Mode Admin mengabaikan grant Review (grant tak dibaca)', () => {
    expect(reportDetailRoute(hrd, 'admin', true)).toBe('hrd');
  });
  it('HRD tanpa bagian Laporan di Mode Admin: grant Review (bila ada) dipakai; tanpa grant tetap HRD', () => {
    expect(reportDetailRoute(hrdNoLaporan, 'admin', true)).toBe('grant');
    expect(reportDetailRoute(hrdNoLaporan, 'admin', false)).toBe('hrd');
  });
});

describe('reportDetailRoute — mode posisi-asli (Gelombang 3)', () => {
  it('pegawai ber-izin HRD di mode posisi-asli TIDAK mendapat tampilan HRD penuh', () => {
    expect(reportDetailRoute(empHrd, 'spv', false)).toBe('need-admin');
  });
  it('koordinator ber-izin HRD di mode posisi-asli → jalur Koordinator', () => {
    expect(reportDetailRoute(empHrdCoord, 'spv', false)).toBe('coordinator');
  });
  it('HRD-posisi & SPV ber-izin HRD di mode posisi-asli → jalur SPV (paritas SPV ↔ HRD Mode-SPV)', () => {
    expect(reportDetailRoute(hrd, 'spv', false)).toBe('spv');
    expect(reportDetailRoute(spvHrd, 'spv', false)).toBe('spv');
  });
  it('pemegang izin HRD + grant Review di mode posisi-asli → jalur grant (berlingkup)', () => {
    expect(reportDetailRoute(empHrd, 'spv', true)).toBe('grant');
    expect(reportDetailRoute(hrd, 'spv', true)).toBe('grant');
  });
});

describe('reportDetailRoute — peran tanpa izin HRD (tak berubah)', () => {
  it('SPV → jalur SPV, apa pun nilai cookie mode', () => {
    expect(reportDetailRoute(spv, 'spv', false)).toBe('spv');
    expect(reportDetailRoute(spv, 'admin', false)).toBe('spv');
  });
  it('Koordinator → jalur Koordinator; Direksi → jalur Direksi', () => {
    expect(reportDetailRoute(coord, 'spv', false)).toBe('coordinator');
    expect(reportDetailRoute(direksi, 'spv', false)).toBe('direksi');
  });
  it('pemegang grant Review non-HRD → jalur grant (didahulukan atas peran)', () => {
    expect(reportDetailRoute(employee, 'spv', true)).toBe('grant');
    expect(reportDetailRoute(spv, 'spv', true)).toBe('grant');
    expect(reportDetailRoute(coord, 'spv', true)).toBe('grant');
    expect(reportDetailRoute(direksi, 'spv', true)).toBe('grant');
  });
  it('pegawai biasa tanpa grant → ditolak; cookie admin palsu tak memberi akses', () => {
    expect(reportDetailRoute(employee, 'spv', false)).toBe('denied');
    expect(reportDetailRoute(employee, 'admin', false)).toBe('denied');
    expect(reportDetailRoute(null, 'admin', false)).toBe('denied');
  });
});

describe('roleGrantRecipients — jumlah penerima akses per peran (Manajemen Akses)', () => {
  const rows = [
    { id: 'me', role: 'employee', isExternal: false, isCoordinator: false },   // pelaku: HRD ber-posisi Pegawai
    { id: 'p1', role: 'employee', isExternal: false, isCoordinator: false },
    { id: 'p2', role: 'employee', isExternal: false, isCoordinator: true },
    { id: 'x1', role: 'employee', isExternal: true, isCoordinator: false },    // eksternal: tak pernah
    { id: 's1', role: 'spv', isExternal: false, isCoordinator: false },
    { id: 'd1', role: 'direksi', isExternal: false, isCoordinator: false },
  ];
  it('pelaku sendiri dikecualikan (selaras server setPageGrantForRole)', () => {
    expect(roleGrantRecipients(rows, 'pegawai', 'me').map((r) => r.id)).toEqual(['p1', 'p2']);
  });
  it('bila pelaku bukan anggota peran itu, jumlahnya utuh', () => {
    expect(roleGrantRecipients(rows, 'pegawai', 's1').map((r) => r.id)).toEqual(['me', 'p1', 'p2']);
  });
  it('per peran: koordinator, SPV, Direksi; eksternal & peran tak dikenal tak pernah ikut', () => {
    expect(roleGrantRecipients(rows, 'koordinator', 'me').map((r) => r.id)).toEqual(['p2']);
    expect(roleGrantRecipients(rows, 'spv', 'me').map((r) => r.id)).toEqual(['s1']);
    expect(roleGrantRecipients(rows, 'direksi', 'me').map((r) => r.id)).toEqual(['d1']);
    expect(roleGrantRecipients(rows, 'hrd', 'me')).toEqual([]);
  });
});
