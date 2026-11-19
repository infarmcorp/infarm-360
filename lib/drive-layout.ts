/**
 * Susunan folder Transfer PDF ke Drive (Review & Finalisasi, keputusan pemilik 2026-11-18).
 *
 *   <Folder induk> / <Periode> / <Divisi> / <Folder atasan> / <Divisi - Nama - Periode>.pdf
 *
 * Folder atasan mengikuti atasan langsung pegawai (aturan sama dengan Rencana Pengembangan, `resolveSupervisor`):
 *  - dinaungi koordinator → "Koordinator <Bidang> - <Nama>" (satu salinan per koordinator bila lebih dari satu);
 *  - langsung di bawah SPV → "SPV - <Nama> (langsung)" (satu salinan per SPV);
 *  - SPV / pemimpin tim → "Supervisor (untuk Direksi)" — laporan SPV tak boleh masuk ke foldernya sendiri;
 *  - Direksi, tanpa atasan → "Lainnya".
 * Laporan koordinator sendiri jatuh ke folder SPV-nya (atasannya), bukan ke folder koordinatornya.
 * Folder diserahkan HRD ke koordinator/SPV DI LUAR aplikasi. Modul ini murni (tanpa I/O) — diuji tests/drive-layout.test.ts.
 */
import { resolveSupervisor } from '@/lib/dev-plan';

export const SUPERVISOR_FOLDER = 'Supervisor (untuk Direksi)';
export const OTHER_FOLDER = 'Lainnya';
export const NO_DEPT_FOLDER = 'Tanpa Divisi';

/** Nama folder/berkas aman untuk Drive (tanpa garis miring & karakter yang membingungkan). */
export function cleanDriveName(s: string): string {
  return s.replace(/[\\/:*?"<>|\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
}

export function coordinatorFolderName(name: string, area: string | null | undefined): string {
  const a = area?.trim();
  return cleanDriveName(a ? `Koordinator ${a} - ${name}` : `Koordinator - ${name}`);
}

export function spvFolderName(name: string): string {
  return cleanDriveName(`SPV - ${name} (langsung)`);
}

export type DrivePerson = { name: string; coordinatorArea: string | null };
export type DriveSubject = { id: string; dept: string | null; role: string | null };
export type DriveTeams = {
  /** pegawai → SPV aktif (spv_team_members, atasan nonaktif sudah dibuang). */
  spvBy: Map<string, string[]>;
  /** pegawai → koordinator aktif (coordinator_team_members, nonaktif sudah dibuang). */
  coordBy: Map<string, string[]>;
  /** id yang memimpin tim (spv_id di spv_team_members). */
  leads: Set<string>;
  /** nama + bidang atasan (koordinator/SPV). */
  people: Map<string, DrivePerson>;
};

/**
 * Jalur folder (relatif terhadap folder periode) untuk PDF seorang pegawai — satu jalur per salinan.
 * Selalu minimal satu jalur. Urutan stabil (urut nama folder) agar hasil transfer dapat diulang.
 */
export function driveFoldersFor(emp: DriveSubject, teams: DriveTeams): string[][] {
  const dept = cleanDriveName(emp.dept ?? '') || NO_DEPT_FOLDER;
  const sup = resolveSupervisor({
    employeeId: emp.id, role: emp.role, leadsTeam: teams.leads.has(emp.id),
    coordinatorIds: teams.coordBy.get(emp.id) ?? [], spvIds: teams.spvBy.get(emp.id) ?? [],
  });
  const nameOf = (id: string) => teams.people.get(id)?.name ?? 'Tanpa Nama';
  let subs: string[];
  switch (sup.kind) {
    case 'coordinator':
      subs = sup.ids.map((id) => coordinatorFolderName(nameOf(id), teams.people.get(id)?.coordinatorArea));
      break;
    case 'spv':
      subs = sup.ids.map((id) => spvFolderName(nameOf(id)));
      break;
    case 'direksi':
      subs = [SUPERVISOR_FOLDER];
      break;
    default:
      subs = [OTHER_FOLDER];
  }
  return [...new Set(subs)].sort((a, b) => a.localeCompare(b, 'id')).map((s) => [dept, s]);
}

export type ExistingFile = { id: string; parentId: string | null };
export type FileOps = {
  /** Berkas yang dipakai ulang: isi diganti; `move` = berkas perlu dipindah dari `fromParent` ke `folderId`. */
  update: { fileId: string; folderId: string; move: boolean; fromParent: string | null }[];
  /** Folder yang belum punya berkas pegawai ini → unggah baru. */
  create: string[];
  /** Salinan lama yang tak lagi punya folder tujuan (mis. pegawai pindah atasan) → dibuang ke Sampah. */
  trash: string[];
};

/**
 * Rekonsiliasi berkas PDF seorang pegawai di Drive dengan folder tujuannya: utamakan berkas yang sudah di folder
 * yang benar (timpa isi), lalu pindahkan berkas lama yang tersisa, unggah baru bila kurang, sisanya ke Sampah.
 */
export function planFileOps(existing: ExistingFile[], targets: string[]): FileOps {
  const unused = [...existing];
  const ops: FileOps = { update: [], create: [], trash: [] };
  const pending: string[] = [];
  for (const folderId of [...new Set(targets)]) {
    const i = unused.findIndex((f) => f.parentId === folderId);
    if (i >= 0) { ops.update.push({ fileId: unused[i].id, folderId, move: false, fromParent: unused[i].parentId }); unused.splice(i, 1); }
    else pending.push(folderId);
  }
  for (const folderId of pending) {
    const f = unused.shift();
    if (f) ops.update.push({ fileId: f.id, folderId, move: true, fromParent: f.parentId });
    else ops.create.push(folderId);
  }
  ops.trash = unused.map((f) => f.id);
  return ops;
}
