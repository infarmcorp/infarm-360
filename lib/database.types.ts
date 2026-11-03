/**
 * Tipe database — SUBSET untuk vertical slice Input KPI.
 *
 * TODO: ganti seluruh file ini dengan hasil generate resmi begitu Supabase aktif:
 *   npx supabase gen types typescript --project-id <id> > lib/database.types.ts
 * Bentuk di bawah sengaja mengikuti GenericSchema supabase-js (ada Views/Functions/
 * Enums/CompositeTypes + Relationships per tabel) agar `.from()` ter-tipe, bukan `never`.
 */
export type UserRole = 'employee' | 'spv' | 'hrd' | 'direksi';
export type RelationKind = 'Atasan' | 'Peer' | 'Cross' | 'Self' | 'Bawahan';
/** 'invalidated' (migrasi 0046) = penilaian terkirim yang DIBATALKAN validitasnya oleh HRD — arsip, keluar dari skor. */
export type AssessmentStatus = 'draft' | 'submitted' | 'invalidated';
export type ExposureStatus = 'eligible' | 'partially_eligible' | 'not_eligible'; // BR-03 Exposure Check
export type WeightValues = { atasan?: number; peer?: number; cross?: number; bawahan?: number; self?: number; internal?: number };
export type ReportStatus = 'draft' | 'in_review' | 'finalized';
export type DevPlanStatus = 'draft' | 'waiting_supervisor' | 'revision' | 'waiting_hrd' | 'agreed';
export type DevSessionKind = 'one_on_one' | 'hrd_monthly';
export type DevItemProgress = { item_id: string; status: 'on_track' | 'behind' | 'done'; note: string };
export type SuccessionStatus = 'draft' | 'submitted' | 'approved' | 'rejected';
export type CorrectionStatus = 'pending' | 'approved' | 'rejected';
/** Jenis permohonan pemetaan yang diajukan pegawai (migrasi 0035). */
export type RequestKind = 'relation' | 'remove' | 'add';

export interface Database {
  public: {
    Tables: {
      employees: {
        Row: { id: string; emp_code: string; name: string; nickname: string | null; dept: string; role: UserRole; is_hrd_admin: boolean; is_external: boolean; is_cross_reviewer: boolean; is_coordinator: boolean; hrd_sections: string[] | null; is_active: boolean; joined_on: string | null; left_on: string | null; access_reviewed_at: string | null; created_at: string };
        Insert: { id: string; emp_code: string; name: string; nickname?: string | null; dept: string; role?: UserRole; is_hrd_admin?: boolean; is_external?: boolean; is_cross_reviewer?: boolean; is_coordinator?: boolean; hrd_sections?: string[] | null; is_active?: boolean; joined_on?: string | null; left_on?: string | null; access_reviewed_at?: string | null };
        Update: Partial<Database['public']['Tables']['employees']['Insert']>;
        Relationships: [];
      };
      spv_team_members: {
        Row: { spv_id: string; employee_id: string };
        Insert: { spv_id: string; employee_id: string };
        Update: Partial<{ spv_id: string; employee_id: string }>;
        Relationships: [];
      };
      coordinator_team_members: {
        Row: { coordinator_id: string; employee_id: string };
        Insert: { coordinator_id: string; employee_id: string };
        Update: Partial<{ coordinator_id: string; employee_id: string }>;
        Relationships: [];
      };
      page_grants: {
        Row: { id: string; employee_id: string; section: string; scope: 'all' | 'own_division' | 'other_divisions' | 'self' | 'coordinator_team'; scopes: string[]; can_edit: boolean; can_finalize: boolean; created_at: string; created_by: string | null };
        Insert: { id?: string; employee_id: string; section: string; scope?: 'all' | 'own_division' | 'other_divisions' | 'self' | 'coordinator_team'; scopes?: string[]; can_edit?: boolean; can_finalize?: boolean; created_by?: string | null };
        Update: Partial<{ section: string; scope: 'all' | 'own_division' | 'other_divisions' | 'self' | 'coordinator_team'; scopes: string[]; can_edit: boolean; can_finalize: boolean; created_by: string | null }>;
        Relationships: [];
      };
      periods: {
        Row: { id: string; code: string; label: string; start_date: string; end_date: string; status: 'active' | 'ended'; has_360: boolean; form_open: boolean; mapping_published: boolean; kpi_standard: number; assessment_deadline: string | null; dev_plan_closed_at: string | null; dev_plan_due: string | null; created_at: string };
        Insert: { code: string; label: string; start_date: string; end_date: string; status?: 'active' | 'ended'; has_360?: boolean; form_open?: boolean; mapping_published?: boolean; kpi_standard?: number; assessment_deadline?: string | null; dev_plan_closed_at?: string | null; dev_plan_due?: string | null };
        Update: Partial<Database['public']['Tables']['periods']['Insert']>;
        Relationships: [];
      };
      period_months: {
        Row: { period_id: string; ym: string };
        Insert: { period_id: string; ym: string };
        Update: Partial<{ period_id: string; ym: string }>;
        Relationships: [];
      };
      kpi_scores: {
        Row: { employee_id: string; ym: string; score: number; updated_by: string | null; updated_at: string };
        Insert: { employee_id: string; ym: string; score: number; updated_by?: string | null };
        Update: Partial<Database['public']['Tables']['kpi_scores']['Insert']>;
        Relationships: [];
      };
      kpi_audit: {
        Row: { id: number; employee_id: string; ym: string; score: number; changed_by: string | null; changed_at: string; note: string | null; action: string };
        Insert: { employee_id: string; ym: string; score: number; changed_by?: string | null; note?: string | null; action?: string };
        Update: never;
        Relationships: [];
      };
      mappings: {
        Row: { id: string; period_id: string; assessor_id: string; target_id: string; relation: RelationKind; mandatory: boolean; is_adhoc: boolean; is_active: boolean; created_at: string };
        Insert: { period_id: string; assessor_id: string; target_id: string; relation: RelationKind; mandatory?: boolean; is_adhoc?: boolean; is_active?: boolean };
        Update: Partial<Database['public']['Tables']['mappings']['Insert']>;
        Relationships: [];
      };
      assessments: {
        Row: { id: string; period_id: string; assessor_id: string; target_id: string; status: AssessmentStatus; is_adhoc: boolean; submitted_at: string | null; first_submitted_at: string | null; forced_by_hrd: boolean; exposure_status: ExposureStatus | null; exposure_confirmed_at: string | null; exposure_reason: string | null; created_at: string; invalidated_at: string | null; invalidated_by: string | null; invalid_reason: string | null };
        Insert: { period_id: string; assessor_id: string; target_id: string; status?: AssessmentStatus; is_adhoc?: boolean; submitted_at?: string | null; exposure_status?: ExposureStatus | null; exposure_confirmed_at?: string | null; exposure_reason?: string | null; invalidated_at?: string | null; invalidated_by?: string | null; invalid_reason?: string | null };
        Update: Partial<Database['public']['Tables']['assessments']['Insert']>;
        Relationships: [];
      };
      culture_aspects: {
        Row: { id: string; period_id: string; name: string; order_idx: number };
        Insert: { period_id: string; name: string; order_idx?: number };
        Update: Partial<Database['public']['Tables']['culture_aspects']['Insert']>;
        Relationships: [];
      };
      indicators: {
        Row: { id: string; aspect_id: string; text: string; order_idx: number; is_active: boolean; description: string | null; rating_guide: Record<string, string> | null; rating_key_points: Record<string, string> | null };
        Insert: { aspect_id: string; text: string; order_idx?: number; is_active?: boolean; description?: string | null; rating_guide?: Record<string, string> | null; rating_key_points?: Record<string, string> | null };
        Update: Partial<Database['public']['Tables']['indicators']['Insert']>;
        Relationships: [];
      };
      qualitative_questions: {
        Row: { id: string; period_id: string; text: string; order_idx: number };
        Insert: { period_id: string; text: string; order_idx?: number };
        Update: Partial<Database['public']['Tables']['qualitative_questions']['Insert']>;
        Relationships: [];
      };
      assessment_indicator_scores: {
        Row: { assessment_id: string; indicator_id: string; rating: number | null; comment: string | null; is_na: boolean; na_reason: string | null };
        Insert: { assessment_id: string; indicator_id: string; rating?: number | null; comment?: string | null; is_na?: boolean; na_reason?: string | null };
        Update: Partial<Database['public']['Tables']['assessment_indicator_scores']['Insert']>;
        Relationships: [];
      };
      assessment_qual_answers: {
        Row: { assessment_id: string; question_id: string; answer: string | null };
        Insert: { assessment_id: string; question_id: string; answer?: string | null };
        Update: Partial<Database['public']['Tables']['assessment_qual_answers']['Insert']>;
        Relationships: [];
      };
      weight_schemes: {
        Row: { id: string; period_id: string; model: '4class' | '2class'; weights: WeightValues; is_active: boolean; updated_by: string | null; updated_at: string };
        Insert: { period_id: string; model: '4class' | '2class'; weights: WeightValues; is_active?: boolean; updated_by?: string | null; updated_at?: string };
        Update: Partial<Database['public']['Tables']['weight_schemes']['Insert']>;
        Relationships: [];
      };
      employee_weight_overrides: {
        Row: { id: string; period_id: string; employee_id: string; model: '4class' | '2class'; weights: WeightValues; updated_by: string | null; updated_at: string };
        Insert: { period_id: string; employee_id: string; model: '4class' | '2class'; weights: WeightValues; updated_by?: string | null; updated_at?: string };
        Update: Partial<Database['public']['Tables']['employee_weight_overrides']['Insert']>;
        Relationships: [];
      };
      employee_report_folders: {
        Row: { employee_id: string; url: string; updated_by: string | null; updated_at: string };
        Insert: { employee_id: string; url: string; updated_by?: string | null; updated_at?: string };
        Update: Partial<Database['public']['Tables']['employee_report_folders']['Insert']>;
        Relationships: [];
      };
      release_email_schedules: {
        Row: {
          id: string; period_id: string; send_at: string; content: Record<string, unknown>; recipient_ids: string[];
          status: 'scheduled' | 'sending' | 'done' | 'cancelled';
          created_by: string | null; created_by_name: string | null; created_at: string; updated_at: string;
          started_at: string | null; finished_at: string | null; sent_ids: string[];
          skipped: { id: string; name: string; reason: string }[]; failed: { id: string; name: string; reason: string }[];
        };
        Insert: {
          period_id: string; send_at: string; content: Record<string, unknown>; recipient_ids: string[];
          status?: 'scheduled' | 'sending' | 'done' | 'cancelled'; created_by?: string | null; created_by_name?: string | null;
          updated_at?: string; started_at?: string | null; finished_at?: string | null; sent_ids?: string[];
          skipped?: { id: string; name: string; reason: string }[]; failed?: { id: string; name: string; reason: string }[];
        };
        Update: Partial<Database['public']['Tables']['release_email_schedules']['Insert']>;
        Relationships: [];
      };
      development_plans: {
        // Rencana Pengembangan (0055) — melekat ke periode LAPORAN (source_period_id).
        Row: {
          id: string; employee_id: string; source_period_id: string; status: DevPlanStatus;
          sup_confirmation: string | null; sup_context: string | null; sup_support: string | null; sup_hope: string | null;
          revision_reason: string | null; employee_signed_at: string | null;
          supervisor_id: string | null; supervisor_name: string | null; supervisor_signed_at: string | null;
          hrd_id: string | null; hrd_name: string | null; hrd_signed_at: string | null;
          created_at: string; updated_at: string;
        };
        Insert: {
          employee_id: string; source_period_id: string; status?: DevPlanStatus;
          sup_confirmation?: string | null; sup_context?: string | null; sup_support?: string | null; sup_hope?: string | null;
          revision_reason?: string | null; employee_signed_at?: string | null;
          supervisor_id?: string | null; supervisor_name?: string | null; supervisor_signed_at?: string | null;
          hrd_id?: string | null; hrd_name?: string | null; hrd_signed_at?: string | null; updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['development_plans']['Insert']>;
        Relationships: [];
      };
      development_plan_items: {
        Row: { id: string; plan_id: string; order_idx: number; area: string; target: string; actions: string; due_text: string; companion: string; success_indicator: string };
        Insert: { plan_id: string; order_idx?: number; area?: string; target?: string; actions?: string; due_text?: string; companion?: string; success_indicator?: string };
        Update: Partial<Database['public']['Tables']['development_plan_items']['Insert']>;
        Relationships: [];
      };
      development_plan_sessions: {
        // Catatan sesi 1-on-1 (atasan) & tinjauan bulanan HRD (0056).
        Row: {
          id: string; plan_id: string; kind: DevSessionKind; session_date: string; author_id: string | null; author_name: string | null;
          summary: string; overall_status: 'on_track' | 'behind' | null; item_progress: DevItemProgress[];
          employee_note: string | null; employee_note_at: string | null; created_at: string; updated_at: string;
        };
        Insert: {
          plan_id: string; kind: DevSessionKind; session_date: string; author_id?: string | null; author_name?: string | null;
          summary: string; overall_status?: 'on_track' | 'behind' | null; item_progress?: DevItemProgress[];
          employee_note?: string | null; employee_note_at?: string | null; updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['development_plan_sessions']['Insert']>;
        Relationships: [];
      };
      outside_mapping_notes: {
        // Catatan di Luar Pemetaan (0054) — anonim secara skema: tanpa kolom penulis & tanpa waktu kirim.
        Row: { id: string; period_id: string; target_id: string; aspect_id: string; body: string };
        Insert: { period_id: string; target_id: string; aspect_id: string; body: string };
        Update: never;
        Relationships: [];
      };
      result_360: {
        Row: { employee_id: string; period_id: string; score: number | null; score_raw: number | null; late_penalty: number; computed_at: string };
        Insert: { employee_id: string; period_id: string; score?: number | null; score_raw?: number | null; late_penalty?: number; computed_at?: string };
        Update: Partial<Database['public']['Tables']['result_360']['Insert']>;
        Relationships: [];
      };
      late_penalty_waivers: {
        Row: { employee_id: string; period_id: string; reason: string; points: number; set_by: string | null; created_at: string };
        Insert: { employee_id: string; period_id: string; reason: string; points?: number; set_by?: string | null };
        Update: Partial<Database['public']['Tables']['late_penalty_waivers']['Insert']>;
        Relationships: [];
      };
      compliance_penalties: {
        Row: { employee_id: string; period_id: string; points: number; reason: string | null; set_by: string | null; updated_at: string };
        Insert: { employee_id: string; period_id: string; points?: number; reason?: string | null; set_by?: string | null };
        Update: Partial<Database['public']['Tables']['compliance_penalties']['Insert']>;
        Relationships: [];
      };
      hrd_audit_log: {
        Row: { id: number; actor_id: string | null; actor_name: string | null; action: string; category: string; summary: string; target_type: string | null; target_id: string | null; target_label: string | null; meta: Record<string, unknown> | null; created_at: string };
        Insert: { actor_id?: string | null; actor_name?: string | null; action: string; category?: string; summary: string; target_type?: string | null; target_id?: string | null; target_label?: string | null; meta?: Record<string, unknown> | null };
        Update: never;
        Relationships: [];
      };
      final_reports: {
        Row: { id: string; employee_id: string; period_id: string; content: Record<string, unknown>; final_score: number | null; status: ReportStatus; spv_acc: boolean; finalized_by: string | null; pdf_path: string | null; updated_at: string };
        Insert: { employee_id: string; period_id: string; content?: Record<string, unknown>; final_score?: number | null; status?: ReportStatus; spv_acc?: boolean; finalized_by?: string | null; pdf_path?: string | null };
        Update: Partial<Database['public']['Tables']['final_reports']['Insert']>;
        Relationships: [];
      };
      relation_correction_requests: {
        Row: { id: string; mapping_id: string | null; period_id: string; assessor_id: string; target_id: string; kind: RequestKind; old_relation: RelationKind | null; new_relation: RelationKind | null; reason: string; reject_reason: string | null; status: CorrectionStatus; reviewed_by: string | null; reviewed_at: string | null; created_at: string };
        Insert: { mapping_id?: string | null; period_id: string; assessor_id: string; target_id: string; kind?: RequestKind; old_relation?: RelationKind | null; new_relation?: RelationKind | null; reason: string; reject_reason?: string | null; status?: CorrectionStatus; reviewed_by?: string | null; reviewed_at?: string | null };
        Update: Partial<Database['public']['Tables']['relation_correction_requests']['Insert']>;
        Relationships: [];
      };
      succession_plans: {
        Row: { id: string; employee_id: string; period_id: string; plan: string; justification: string | null; status: SuccessionStatus; proposed_by: string | null; direksi_id: string | null; direksi_comment: string | null; created_at: string };
        Insert: { employee_id: string; period_id: string; plan: string; justification?: string | null; status?: SuccessionStatus; proposed_by?: string | null; direksi_id?: string | null; direksi_comment?: string | null };
        Update: Partial<Database['public']['Tables']['succession_plans']['Insert']>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    // Fungsi DB (migrasi 0042) — hanya dieksekusi service_role dari Server Action KPI.
    Functions: {
      kpi_save_with_audit: {
        Args: { p_actor: string; p_ym: string; p_rows: { employee_id: string; score: number; note: string | null }[] };
        Returns: number;
      };
      kpi_delete_with_audit: {
        Args: { p_actor: string; p_employee: string; p_ym: string; p_note: string };
        Returns: number | null;
      };
      // 0048: Aktifkan/Hapus Periode dalam satu transaksi (service_role saja).
      period_activate: {
        Args: { p_period: string };
        Returns: string;
      };
      period_delete: {
        Args: { p_period: string };
        Returns: { label: string; months: string[]; kpi_deleted: number; kpi_audit_deleted: number };
      };
    };
    Enums: { user_role: UserRole; relation_kind: RelationKind; assessment_status: AssessmentStatus };
    CompositeTypes: Record<string, never>;
  };
}
