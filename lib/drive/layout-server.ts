import type { createClient } from '@/lib/supabase/server';
import { fetchAllPaged } from '@/lib/supabase/paginate';
import type { DriveTeams } from '@/lib/drive-layout';

type SB = Awaited<ReturnType<typeof createClient>>;

/**
 * Data tim untuk susunan folder Transfer PDF ke Drive (service_role; pemanggil sudah lolos gerbang HRD).
 * Atasan NONAKTIF dilewati (sama dengan loadSupervisorResolver) → pegawai jatuh ke tingkat berikutnya.
 * Bidang koordinator (0065) dibaca terpisah: kolom belum ada → tanpa bidang, bukan gagal.
 */
export async function loadDriveTeams(admin: SB): Promise<DriveTeams> {
  const [spvRows, coordRows, empRows] = await Promise.all([
    fetchAllPaged<{ spv_id: string; employee_id: string }>((from, to) =>
      admin.from('spv_team_members').select('spv_id, employee_id').order('spv_id').order('employee_id').range(from, to)),
    fetchAllPaged<{ coordinator_id: string; employee_id: string }>((from, to) =>
      admin.from('coordinator_team_members').select('coordinator_id, employee_id').order('coordinator_id').order('employee_id').range(from, to)),
    fetchAllPaged<{ id: string; name: string; is_active: boolean }>((from, to) =>
      admin.from('employees').select('id, name, is_active').order('id').range(from, to)),
  ]);
  const areas = new Map<string, string | null>();
  const { data: areaRows, error } = await admin.from('employees').select('id, coordinator_area').eq('is_coordinator', true);
  if (!error) (areaRows ?? []).forEach((r) => areas.set(r.id, r.coordinator_area ?? null));

  const active = new Set(empRows.filter((e) => e.is_active).map((e) => e.id));
  const people = new Map(empRows.map((e) => [e.id, { name: e.name, coordinatorArea: areas.get(e.id) ?? null }]));
  const leads = new Set(spvRows.map((r) => r.spv_id));
  const spvBy = new Map<string, string[]>();
  for (const r of spvRows) if (active.has(r.spv_id)) spvBy.set(r.employee_id, [...(spvBy.get(r.employee_id) ?? []), r.spv_id]);
  const coordBy = new Map<string, string[]>();
  for (const r of coordRows) if (active.has(r.coordinator_id)) coordBy.set(r.employee_id, [...(coordBy.get(r.employee_id) ?? []), r.coordinator_id]);
  return { spvBy, coordBy, leads, people };
}
