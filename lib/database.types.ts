/**
 * Tipe database — SUBSET untuk vertical slice Input KPI.
 *
 * TODO: ganti seluruh file ini dengan hasil generate resmi begitu Supabase aktif:
 *   npx supabase gen types typescript --project-id <id> > lib/database.types.ts
 * Bentuk di bawah sengaja mengikuti GenericSchema supabase-js (ada Views/Functions/
 * Enums/CompositeTypes + Relationships per tabel) agar `.from()` ter-tipe, bukan `never`.
 */
export type UserRole = 'employee' | 'spv' | 'hrd' | 'direksi';

export interface Database {
  public: {
    Tables: {
      employees: {
        Row: { id: string; emp_code: string; name: string; dept: string; role: UserRole; is_active: boolean; created_at: string };
        Insert: { id: string; emp_code: string; name: string; dept: string; role?: UserRole; is_active?: boolean };
        Update: Partial<Database['public']['Tables']['employees']['Insert']>;
        Relationships: [];
      };
      spv_team_members: {
        Row: { spv_id: string; employee_id: string };
        Insert: { spv_id: string; employee_id: string };
        Update: Partial<{ spv_id: string; employee_id: string }>;
        Relationships: [];
      };
      periods: {
        Row: { id: string; code: string; label: string; start_date: string; end_date: string; status: 'active' | 'ended'; has_360: boolean; created_at: string };
        Insert: { code: string; label: string; start_date: string; end_date: string; status?: 'active' | 'ended'; has_360?: boolean };
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
        Row: { id: number; employee_id: string; ym: string; score: number; changed_by: string | null; changed_at: string; note: string | null };
        Insert: { employee_id: string; ym: string; score: number; changed_by?: string | null; note?: string | null };
        Update: never;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: { user_role: UserRole };
    CompositeTypes: Record<string, never>;
  };
}
