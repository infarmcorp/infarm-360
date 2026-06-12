export type UserRole = 'employee' | 'spv' | 'hrd' | 'direksi';

export interface User {
  id: string;
  name: string;
  dept: string;
  role: UserRole;
}

export interface Period {
  status: 'active' | 'ended';
  label: string;
  start: string;
  end: string;
  has360: boolean;
  months: string[]; // e.g. ["2026-01", "2026-02", "2026-03"]
}

export interface AssesseeStatus {
  id: string;
  name: string;
  status: 'done' | 'pending' | 'draft';
}

export interface KPIHistoryItem {
  score: number;
  by: string;
  ts: string;
  note: string;
}

export interface KPIHistory {
  [employeeId: string]: {
    [month: string]: KPIHistoryItem[];
  };
}

export interface Mapping {
  id: string;
  penilaiId: string;
  penilaiName: string;
  yangDinilaiId: string;
  yangDinilaiName: string;
  relasi: 'Peer' | 'SPV→Employee' | 'HRD→Employee' | 'Direksi→SPV' | string;
  /** Sifat penilaian: wajib (default) atau opsional. */
  sifat?: 'wajib' | 'opsional';
}

export interface RecommendationField {
  objective: string;
  target: string;
  action: string;
  deadline: string;
  partner: string;
  indicator: string;
}

export interface FollowUpTask {
  no: number;
  action: string;
  target: string;
  deadline: string;
  partner: string;
  indicator: string;
}

export interface SupervisorComment {
  confirmation: string;
  context: string;
  support: string;
  expectations: string;
}

export interface RelationCorrectionRequest {
  id: string;
  penilaiId: string;
  penilaiName: string;
  yangDinilaiId: string;
  yangDinilaiName: string;
  oldRelasi: string;
  newRelasi: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
}

