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
export type AssessmentStatus = 'draft' | 'submitted';
export type WeightValues = { atasan?: number; peer?: number; cross?: number; bawahan?: number; self?: number; internal?: number };
export type ReportStatus = 'draft' | 'in_review' | 'finalized';
export type SuccessionStatus = 'draft' | 'submitted' | 'approved' | 'rejected';
export type CorrectionStatus = 'pending' | 'approved' | 'rejected';

export interface Database {
  public: {
    Tables: {
      employees: {
        Row: { id: string; emp_code: string; name: string; dept: string; role: UserRole; is_hrd_admin: boolean; is_external: boolean; is_cross_reviewer: boolean; is_coordinator: boolean; hrd_sections: string[] | null; is_active: boolean; joined_on: string | null; left_on: string | null; access_reviewed_at: string | null; created_at: string };
        Insert: { id: string; emp_code: string; name: string; dept: string; role?: UserRole; is_hrd_admin?: boolean; is_external?: boolean; is_cross_reviewer?: boolean; is_coordinator?: boolean; hrd_sections?: string[] | null; is_active?: boolean; joined_on?: string | null; left_on?: string | null; access_reviewed_at?: string | null };
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
        Row: { id: string; employee_id: string; section: string; scope: 'all' | 'own_division' | 'other_divisions' | 'self' | 'coordinator_team'; scopes: string[]; can_edit: boolean; created_at: string; created_by: string | null };
        Insert: { id?: string; employee_id: string; section: string; scope?: 'all' | 'own_division' | 'other_divisions' | 'self' | 'coordinator_team'; scopes?: string[]; can_edit?: boolean; created_by?: string | null };
        Update: Partial<{ section: string; scope: 'all' | 'own_division' | 'other_divisions' | 'self' | 'coordinator_team'; scopes: string[]; can_edit: boolean; created_by: string | null }>;
        Relationships: [];
      };
      periods: {
        Row: { id: string; code: string; label: string; start_date: string; end_date: string; status: 'active' | 'ended'; has_360: boolean; form_open: boolean; kpi_standard: number; created_at: string };
        Insert: { code: string; label: string; start_date: string; end_date: string; status?: 'active' | 'ended'; has_360?: boolean; form_open?: boolean; kpi_standard?: number };
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
        Row: { id: string; period_id: string; assessor_id: string; target_id: string; status: AssessmentStatus; is_adhoc: boolean; submitted_at: string | null; created_at: string };
        Insert: { period_id: string; assessor_id: string; target_id: string; status?: AssessmentStatus; is_adhoc?: boolean; submitted_at?: string | null };
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
        Row: { id: string; aspect_id: string; text: string; order_idx: number; is_active: boolean; description: string | null; rating_guide: Record<string, string> | null };
        Insert: { aspect_id: string; text: string; order_idx?: number; is_active?: boolean; description?: string | null; rating_guide?: Record<string, string> | null };
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
        Row: { assessment_id: string; indicator_id: string; rating: number | null; comment: string | null };
        Insert: { assessment_id: string; indicator_id: string; rating?: number | null; comment?: string | null };
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
        Insert: { period_id: string; model: '4class' | '2class'; weights: WeightValues; is_active?: boolean; updated_by?: string | null };
        Update: Partial<Database['public']['Tables']['weight_schemes']['Insert']>;
        Relationships: [];
      };
      employee_weight_overrides: {
        Row: { id: string; period_id: string; employee_id: string; model: '4class' | '2class'; weights: WeightValues; updated_by: string | null; updated_at: string };
        Insert: { period_id: string; employee_id: string; model: '4class' | '2class'; weights: WeightValues; updated_by?: string | null; updated_at?: string };
        Update: Partial<Database['public']['Tables']['employee_weight_overrides']['Insert']>;
        Relationships: [];
      };
      result_360: {
        Row: { employee_id: string; period_id: string; score: number | null; computed_at: string };
        Insert: { employee_id: string; period_id: string; score?: number | null; computed_at?: string };
        Update: Partial<Database['public']['Tables']['result_360']['Insert']>;
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
        Row: { id: string; mapping_id: string | null; period_id: string; assessor_id: string; target_id: string; old_relation: RelationKind | null; new_relation: RelationKind | null; reason: string; status: CorrectionStatus; reviewed_by: string | null; reviewed_at: string | null; created_at: string };
        Insert: { mapping_id?: string | null; period_id: string; assessor_id: string; target_id: string; old_relation?: RelationKind | null; new_relation?: RelationKind | null; reason: string; status?: CorrectionStatus; reviewed_by?: string | null; reviewed_at?: string | null };
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
    Functions: Record<string, never>;
    Enums: { user_role: UserRole; relation_kind: RelationKind; assessment_status: AssessmentStatus };
    CompositeTypes: Record<string, never>;
  };
}
