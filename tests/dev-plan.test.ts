import { describe, it, expect } from 'vitest';
import {
  resolveSupervisor, canActAsSupervisor, canHrdSign, canHrdManage, canViewPlan, submitBlocker, ownerCanEdit,
  supervisorApproveBlocker, nextQuarterLabel, planTitle, planStatusLabel, sessionsOpen, canRecordSession, canEditSession,
  type PlanItem, type PlanActor,
} from '@/lib/dev-plan';

/**
 * Rencana Pengembangan (0055) — aturan murni: siapa atasan, siapa boleh bertindak/melihat, kelengkapan isi.
 * Keputusan pemilik 2026-11-03: koordinator → anggota timnya; SPV → anggota tanpa koordinator & koordinator;
 * Direksi → SPV dan HRD/pegawai yang memimpin tim; selain itu → HRD. Persetujuan HRD hanya posisi HRD.
 */
const E = 'emp', C = 'coord', S = 'spv', D = 'dir', H = 'hrd';
const actor = (id: string, row: Omit<PlanActor, 'id'>): PlanActor => ({ id, ...row });
const full: PlanItem = { area: 'a', target: 't', actions: 'l', due_text: 'Des', companion: 'SPV', success_indicator: 'i' };

describe('resolveSupervisor', () => {
  it('Direksi tidak punya atasan', () => {
    expect(resolveSupervisor({ employeeId: D, role: 'direksi', leadsTeam: false, coordinatorIds: [], spvIds: [] }).kind).toBe('none');
  });
  it('SPV → Direksi', () => {
    expect(resolveSupervisor({ employeeId: S, role: 'spv', leadsTeam: true, coordinatorIds: [], spvIds: [] }).kind).toBe('direksi');
  });
  it('HRD posisi yang memimpin tim (Mode SPV) → Direksi', () => {
    expect(resolveSupervisor({ employeeId: H, role: 'hrd', leadsTeam: true, coordinatorIds: [], spvIds: [] }).kind).toBe('direksi');
  });
  it('anggota tim koordinator → koordinator; SPV-nya hanya melihat', () => {
    expect(resolveSupervisor({ employeeId: E, role: 'employee', leadsTeam: false, coordinatorIds: [C], spvIds: [S] }))
      .toEqual({ kind: 'coordinator', ids: [C], viewerIds: [S] });
  });
  it('koordinator (anggota tim SPV) → SPV', () => {
    expect(resolveSupervisor({ employeeId: C, role: 'employee', leadsTeam: false, coordinatorIds: [], spvIds: [S] }))
      .toEqual({ kind: 'spv', ids: [S], viewerIds: [] });
  });
  it('tanpa SPV & koordinator → HRD', () => {
    expect(resolveSupervisor({ employeeId: E, role: 'hrd', leadsTeam: false, coordinatorIds: [], spvIds: [] }).kind).toBe('hrd');
  });
  it('tak pernah menjadi atasan dirinya sendiri', () => {
    expect(resolveSupervisor({ employeeId: E, role: 'employee', leadsTeam: false, coordinatorIds: [E], spvIds: [] }).kind).toBe('hrd');
  });
});

describe('canActAsSupervisor / canViewPlan', () => {
  const coordInfo = { kind: 'coordinator' as const, ids: [C], viewerIds: [S] };
  it('koordinator boleh; SPV-pengamat hanya melihat', () => {
    expect(canActAsSupervisor(coordInfo, actor(C, { role: 'employee', is_coordinator: true }), E, 'spv')).toBe(true);
    expect(canActAsSupervisor(coordInfo, actor(S, { role: 'spv' }), E, 'spv')).toBe(false);
    expect(canViewPlan(coordInfo, actor(S, { role: 'spv' }), E, 'spv')).toBe(true);
  });
  it('HRD Mode SPV sebagai SPV tim (paritas)', () => {
    expect(canActAsSupervisor({ kind: 'spv', ids: [H], viewerIds: [] }, actor(H, { role: 'hrd' }), E, 'spv')).toBe(true);
  });
  it('Direksi untuk rencana SPV', () => {
    expect(canActAsSupervisor({ kind: 'direksi', ids: [], viewerIds: [] }, actor(D, { role: 'direksi' }), S, 'spv')).toBe(true);
    expect(canActAsSupervisor({ kind: 'direksi', ids: [], viewerIds: [] }, actor(C, { role: 'employee' }), S, 'spv')).toBe(false);
  });
  it('atasan cadangan HRD = posisi HRD di Mode Admin saja', () => {
    const info = { kind: 'hrd' as const, ids: [], viewerIds: [] };
    expect(canActAsSupervisor(info, actor(H, { role: 'hrd' }), E, 'admin')).toBe(true);
    expect(canActAsSupervisor(info, actor(H, { role: 'hrd' }), E, 'spv')).toBe(false);
    expect(canActAsSupervisor(info, actor('x', { role: 'employee', is_hrd_admin: true }), E, 'admin')).toBe(false);
  });
  it('tak ada yang bertindak sebagai atasan atas rencananya sendiri', () => {
    expect(canActAsSupervisor({ kind: 'spv', ids: [S], viewerIds: [] }, actor(S, { role: 'spv' }), S, 'spv')).toBe(false);
  });
  it('melihat: pemilik, Direksi, HRD Mode Admin; bukan pegawai lain / HRD Mode SPV', () => {
    const info = { kind: 'spv' as const, ids: [S], viewerIds: [] };
    expect(canViewPlan(info, actor(E, { role: 'employee' }), E, 'spv')).toBe(true);
    expect(canViewPlan(info, actor(D, { role: 'direksi' }), E, 'spv')).toBe(true);
    expect(canViewPlan(info, actor(H, { role: 'hrd' }), E, 'admin')).toBe(true);
    expect(canViewPlan(info, actor(H, { role: 'hrd' }), E, 'spv')).toBe(false);
    expect(canViewPlan(info, actor('lain', { role: 'employee' }), E, 'spv')).toBe(false);
  });
});

describe('canHrdSign / canHrdManage', () => {
  it('persetujuan HRD: posisi HRD di Mode Admin; bukan pemegang izin HRD Admin', () => {
    expect(canHrdSign(actor(H, { role: 'hrd' }), 'admin')).toBe(true);
    expect(canHrdSign(actor(H, { role: 'hrd' }), 'spv')).toBe(false);
    expect(canHrdSign(actor('x', { role: 'employee', is_hrd_admin: true }), 'admin')).toBe(false);
    expect(canHrdSign(actor(H, { role: 'hrd', hrd_sections: ['laporan'] }), 'admin')).toBe(false);
  });
  it('pengaturan periode: HRD Mode Admin berbagian Rencana Pengembangan (termasuk izin HRD Admin)', () => {
    expect(canHrdManage(actor('x', { role: 'employee', is_hrd_admin: true }), 'admin')).toBe(true);
    expect(canHrdManage(actor('x', { role: 'employee', is_hrd_admin: true }), 'spv')).toBe(false);
    expect(canHrdManage(actor('x', { role: 'spv' }), 'admin')).toBe(false);
  });
});

describe('kelengkapan & status', () => {
  it('kirim butuh minimal satu prioritas dan semua lengkap', () => {
    expect(submitBlocker([])).toMatch(/minimal satu/);
    expect(submitBlocker([full, { ...full, target: '  ' }])).toMatch(/Prioritas 2/);
    expect(submitBlocker([full, full])).toBeNull();
  });
  it('isi hanya bisa diubah di Draf / Perlu Perbaikan; Direksi selalu', () => {
    expect(ownerCanEdit(null, 'employee')).toBe(true);
    expect(ownerCanEdit('revision', 'employee')).toBe(true);
    expect(ownerCanEdit('waiting_supervisor', 'employee')).toBe(false);
    expect(ownerCanEdit('agreed', 'employee')).toBe(false);
    expect(ownerCanEdit('draft', 'direksi')).toBe(true);
  });
  it('Setujui atasan: Konfirmasi Kinerja & Dukungan wajib, lainnya opsional', () => {
    expect(supervisorApproveBlocker({ confirmation: '', support: 'Coaching mingguan' })).toMatch(/Konfirmasi Kinerja/);
    expect(supervisorApproveBlocker({ confirmation: 'Sesuai pengamatan', support: '' })).toMatch(/Dukungan/);
    expect(supervisorApproveBlocker({ confirmation: 'Sesuai pengamatan', support: 'Coaching mingguan' })).toBeNull();
  });
  it('judul = kuartal sesudah periode laporan', () => {
    expect(nextQuarterLabel('Q3 2026')).toBe('Q4 2026');
    expect(nextQuarterLabel('Q4 2026')).toBe('Q1 2027');
    expect(planTitle('Q3 2026')).toBe('Rencana Pengembangan Q4 2026');
  });
  it('rencana Direksi berlabel Tersimpan', () => {
    expect(planStatusLabel('draft', 'direksi')).toBe('Tersimpan');
    expect(planStatusLabel(null, 'employee')).toBe('Belum diisi');
  });
});

describe('Tahap 2 — catatan sesi', () => {
  const info = { kind: 'coordinator' as const, ids: [C], viewerIds: [S] };
  it('sesi hanya untuk rencana Disepakati, bukan rencana Direksi', () => {
    expect(sessionsOpen('agreed', 'employee')).toBe(true);
    expect(sessionsOpen('waiting_hrd', 'employee')).toBe(false);
    expect(sessionsOpen('agreed', 'direksi')).toBe(false);
  });
  it('1-on-1 dicatat atasan; SPV-pengamat & HRD (bukan atasan) tidak', () => {
    expect(canRecordSession('one_on_one', info, actor(C, { role: 'employee', is_coordinator: true }), E, 'spv')).toBe(true);
    expect(canRecordSession('one_on_one', info, actor(S, { role: 'spv' }), E, 'spv')).toBe(false);
    expect(canRecordSession('one_on_one', info, actor(H, { role: 'hrd' }), E, 'admin')).toBe(false);
  });
  it('tinjauan bulanan dicatat HRD Mode Admin (termasuk izin HRD Admin)', () => {
    expect(canRecordSession('hrd_monthly', info, actor('x', { role: 'employee', is_hrd_admin: true }), E, 'admin')).toBe(true);
    expect(canRecordSession('hrd_monthly', info, actor(C, { role: 'employee', is_coordinator: true }), E, 'spv')).toBe(false);
  });
  it('ubah/hapus hanya oleh pencatatnya', () => {
    const coord = actor(C, { role: 'employee', is_coordinator: true });
    expect(canEditSession({ kind: 'one_on_one', author_id: C }, info, coord, E, 'spv')).toBe(true);
    expect(canEditSession({ kind: 'one_on_one', author_id: 'lain' }, info, coord, E, 'spv')).toBe(false);
  });
});
