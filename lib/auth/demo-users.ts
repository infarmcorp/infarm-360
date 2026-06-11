/**
 * Kredensial DEMO — sumber tunggal.
 *
 * Sekarang : dipakai untuk login & menelusuri tiap halaman (data mock src/data.ts).
 * Nanti    : jadi seed Supabase Auth (admin.createUser) + baris tabel `employees`.
 *            emp_code = id pegawai di src/data.ts.
 *
 * CATATAN KEAMANAN: ini kredensial demo, BUKAN produksi. Saat go-live:
 *  - ganti password tiap user, jangan pakai password bersama;
 *  - jangan commit password asli — buat user via Supabase Auth, bukan file ini.
 */
export type UserRole = 'employee' | 'spv' | 'hrd' | 'direksi';

export interface DemoUser {
  emp_code: string;
  email: string;
  password: string;
  name: string;
  dept: string;
  role: UserRole;
}

/** Password bersama untuk semua user demo (lihat catatan keamanan di atas). */
export const DEMO_PASSWORD = 'Infarm@2026';

export const DEMO_USERS: DemoUser[] = [
  // Employees
  { emp_code: 'EMP001', email: 'andi.pratama@infarm.test',     name: 'Andi Pratama',     dept: 'Operasional', role: 'employee', password: DEMO_PASSWORD },
  { emp_code: 'EMP002', email: 'budi.santoso@infarm.test',     name: 'Budi Santoso',     dept: 'Operasional', role: 'employee', password: DEMO_PASSWORD },
  { emp_code: 'EMP003', email: 'citra.dewi@infarm.test',       name: 'Citra Dewi',       dept: 'Marketing',   role: 'employee', password: DEMO_PASSWORD },
  { emp_code: 'EMP004', email: 'dinda.rahayu@infarm.test',     name: 'Dinda Rahayu',     dept: 'Marketing',   role: 'employee', password: DEMO_PASSWORD },
  { emp_code: 'EMP005', email: 'eko.prasetyo@infarm.test',     name: 'Eko Prasetyo',     dept: 'Finance',     role: 'employee', password: DEMO_PASSWORD },
  // Supervisor
  { emp_code: 'SPV001', email: 'gunawan.wibowo@infarm.test',   name: 'Gunawan Wibowo',   dept: 'Operasional', role: 'spv',      password: DEMO_PASSWORD },
  { emp_code: 'SPV002', email: 'hesti.lestari@infarm.test',    name: 'Hesti Lestari',    dept: 'Marketing',   role: 'spv',      password: DEMO_PASSWORD },
  // HRD Admin
  { emp_code: 'HRD001', email: 'irma.suryani@infarm.test',     name: 'Irma Suryani',     dept: 'HRD',         role: 'hrd',      password: DEMO_PASSWORD },
  // Direksi
  { emp_code: 'DIR001', email: 'joko.widiatmoko@infarm.test',  name: 'Joko Widiatmoko',  dept: 'Direksi',     role: 'direksi',  password: DEMO_PASSWORD },
  { emp_code: 'DIR002', email: 'kartini.puspita@infarm.test',  name: 'Kartini Puspita',  dept: 'Direksi',     role: 'direksi',  password: DEMO_PASSWORD },
];
