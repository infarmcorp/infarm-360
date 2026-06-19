/**
 * Data benih (seed) Infarm 360 — mandiri, lepas dari arsip legacy `src/`.
 * Dipindahkan dari `src/data.ts` agar arsip SPA legacy bisa dihapus tanpa memutus seed.
 * Hanya berisi konstanta yang dipakai `scripts/seed.ts` (struktur akun + periode demo).
 *
 * Dipakai oleh: scripts/seed.ts (npx tsx scripts/seed.ts).
 */

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
  months: string[]; // mis. ["2026-01", "2026-02", "2026-03"]
}

export interface KPIHistoryItem {
  score: number;
  by: string;
  ts: string;
  note: string;
}

export interface KPIHistory {
  [employeeId: string]: { [month: string]: KPIHistoryItem[] };
}

export interface Mapping {
  id: string;
  penilaiId: string;
  penilaiName: string;
  yangDinilaiId: string;
  yangDinilaiName: string;
  relasi: 'Peer' | 'SPV→Employee' | 'HRD→Employee' | 'Direksi→SPV' | string;
  sifat?: 'wajib' | 'opsional';
}

export const INITIAL_USERS: User[] = [
  // Employees
  { id: 'EMP001', name: 'Andi Pratama', dept: 'Operasional', role: 'employee' },
  { id: 'EMP002', name: 'Budi Santoso', dept: 'Operasional', role: 'employee' },
  { id: 'EMP003', name: 'Citra Dewi', dept: 'Marketing', role: 'employee' },
  { id: 'EMP004', name: 'Dinda Rahayu', dept: 'Marketing', role: 'employee' },
  { id: 'EMP005', name: 'Eko Prasetyo', dept: 'Finance', role: 'employee' },
  // SPVS
  { id: 'SPV001', name: 'Gunawan Wibowo', dept: 'Operasional', role: 'spv' },
  { id: 'SPV002', name: 'Hesti Lestari', dept: 'Marketing', role: 'spv' },
  // HRD
  { id: 'HRD001', name: 'Irma Suryani', dept: 'HRD', role: 'hrd' },
  // Direksi
  { id: 'DIR001', name: 'Joko Widiatmoko', dept: 'Direksi', role: 'direksi' },
  { id: 'DIR002', name: 'Kartini Puspita', dept: 'Direksi', role: 'direksi' },
];

// Tim SPV selaras divisi (otorisasi RLS is_my_member): SPV hanya mengakses KPI/360
// anggota divisinya sendiri. EMP005 (Finance) belum punya SPV → hanya HRD yang mengelola.
export const SPV_TEAMS: { [spvId: string]: string[] } = {
  SPV001: ['EMP001', 'EMP002'], // Operasional
  SPV002: ['EMP003', 'EMP004'], // Marketing
};

export const INSTANT_QUARTERS: { [key: string]: Period } = {
  'Q1-2026': {
    status: 'ended', label: 'Q1 2026', start: '2026-01-01', end: '2026-03-31',
    has360: true, months: ['2026-01', '2026-02', '2026-03'],
  },
  'Q2-2026': {
    status: 'ended', label: 'Q2 2026', start: '2026-04-01', end: '2026-06-30',
    has360: true, months: ['2026-04', '2026-05', '2026-06'],
  },
  'Q3-2026': {
    status: 'active', label: 'Q3 2026', start: '2026-07-01', end: '2026-09-30',
    has360: true, months: ['2026-07', '2026-08', '2026-09'],
  },
};

export const INITIAL_KPI_HIST: KPIHistory = {
  EMP001: {
    '2026-01': [
      { score: 96.0, by: 'SPV001', ts: '2026-02-05 09:14', note: 'Initial submission' },
      { score: 97.7, by: 'SPV001', ts: '2026-02-10 14:32', note: 'Koreksi setelah review atasan' },
    ],
    '2026-02': [{ score: 95.5, by: 'SPV001', ts: '2026-03-03 10:05', note: 'Monthly input' }],
    '2026-03': [{ score: 99.9, by: 'SPV001', ts: '2026-04-04 08:47', note: 'Monthly input' }],
    '2026-04': [{ score: 98.2, by: 'SPV001', ts: '2026-05-05 09:20', note: 'Monthly input' }],
    '2026-05': [{ score: 96.8, by: 'SPV001', ts: '2026-06-03 10:11', note: 'Mid-term submission' }],
    '2026-06': [{ score: 98.0, by: 'SPV001', ts: '2026-07-03 10:00', note: 'Monthly input' }],
    '2026-07': [{ score: 95.0, by: 'SPV001', ts: '2026-08-03 10:00', note: 'Monthly input' }],
    '2026-08': [{ score: 97.2, by: 'SPV001', ts: '2026-09-03 10:00', note: 'Monthly input' }],
    '2026-09': [{ score: 99.0, by: 'SPV001', ts: '2026-10-03 10:00', note: 'Monthly input' }],
  },
  EMP002: {
    '2026-01': [{ score: 82.0, by: 'SPV001', ts: '2026-02-05 09:20', note: 'Monthly input' }],
    '2026-02': [
      { score: 88.0, by: 'SPV001', ts: '2026-03-03 10:10', note: 'First entry' },
      { score: 85.0, by: 'SPV001', ts: '2026-03-05 16:45', note: 'Revisi setelah diskusi target' },
    ],
    '2026-03': [{ score: 85.5, by: 'SPV001', ts: '2026-04-04 09:00', note: 'Monthly input' }],
    '2026-04': [
      { score: 80.0, by: 'SPV001', ts: '2026-05-05 09:25', note: 'Low output month' },
      { score: 83.5, by: 'SPV001', ts: '2026-05-12 11:00', note: 'Update setelah evaluasi mid-month' },
    ],
    '2026-05': [{ score: 84.0, by: 'SPV001', ts: '2026-06-03 10:15', note: 'Monthly validation' }],
    '2026-06': [{ score: 86.5, by: 'SPV001', ts: '2026-07-03 10:05', note: 'Monthly input' }],
    '2026-07': [{ score: 84.0, by: 'SPV001', ts: '2026-08-03 10:05', note: 'Monthly input' }],
    '2026-08': [{ score: 83.5, by: 'SPV001', ts: '2026-09-03 10:05', note: 'Monthly input' }],
    '2026-09': [{ score: 87.0, by: 'SPV001', ts: '2026-10-03 10:05', note: 'Monthly input' }],
  },
  EMP003: {
    '2026-01': [{ score: 89.0, by: 'SPV002', ts: '2026-02-05 10:00', note: 'Monthly input' }],
    '2026-02': [{ score: 91.5, by: 'SPV002', ts: '2026-03-04 09:30', note: 'Monthly input' }],
    '2026-03': [{ score: 88.0, by: 'SPV002', ts: '2026-04-03 08:55', note: 'Monthly input' }],
    '2026-04': [{ score: 90.0, by: 'SPV002', ts: '2026-05-06 09:10', note: 'Monthly input' }],
    '2026-05': [{ score: 89.5, by: 'SPV002', ts: '2026-06-04 09:40', note: 'Approved entry' }],
    '2026-06': [{ score: 92.0, by: 'SPV002', ts: '2026-07-04 09:30', note: 'Monthly input' }],
    '2026-07': [{ score: 91.0, by: 'SPV002', ts: '2026-08-04 09:30', note: 'Monthly input' }],
    '2026-08': [{ score: 88.5, by: 'SPV002', ts: '2026-09-04 09:30', note: 'Monthly input' }],
    '2026-09': [{ score: 90.5, by: 'SPV002', ts: '2026-10-04 09:30', note: 'Monthly input' }],
  },
  EMP004: {
    '2026-01': [{ score: 76.0, by: 'SPV002', ts: '2026-02-05 10:05', note: 'Monthly input' }],
    '2026-02': [{ score: 79.5, by: 'SPV002', ts: '2026-03-04 09:35', note: 'Monthly input' }],
    '2026-03': [{ score: 78.0, by: 'SPV002', ts: '2026-04-03 09:00', note: 'Monthly input' }],
    '2026-04': [{ score: 80.0, by: 'SPV002', ts: '2026-05-06 09:20', note: 'Monthly input' }],
    '2026-05': [{ score: 79.5, by: 'SPV002', ts: '2026-06-04 11:30', note: 'Monthly input' }],
    '2026-06': [{ score: 81.0, by: 'SPV002', ts: '2026-07-04 09:35', note: 'Monthly input' }],
    '2026-07': [{ score: 79.0, by: 'SPV002', ts: '2026-08-04 09:35', note: 'Monthly input' }],
    '2026-08': [{ score: 80.5, by: 'SPV002', ts: '2026-09-04 09:35', note: 'Monthly input' }],
    '2026-09': [{ score: 82.0, by: 'SPV002', ts: '2026-10-04 09:35', note: 'Monthly input' }],
  },
  EMP005: {
    '2026-01': [{ score: 86.0, by: 'SPV002', ts: '2026-02-06 10:00', note: 'Monthly input' }],
    '2026-02': [{ score: 88.5, by: 'SPV002', ts: '2026-03-05 09:00', note: 'Monthly input' }],
    '2026-03': [{ score: 90.0, by: 'SPV002', ts: '2026-04-04 09:00', note: 'Monthly input' }],
    '2026-04': [{ score: 91.0, by: 'SPV002', ts: '2026-05-05 09:00', note: 'Monthly input' }],
    '2026-05': [{ score: 89.0, by: 'SPV002', ts: '2026-06-02 09:00', note: 'Monthly input' }],
    '2026-06': [{ score: 87.5, by: 'SPV002', ts: '2026-07-04 10:00', note: 'Monthly input' }],
    '2026-07': [{ score: 89.0, by: 'SPV002', ts: '2026-08-04 10:00', note: 'Monthly input' }],
    '2026-08': [{ score: 86.5, by: 'SPV002', ts: '2026-09-04 10:00', note: 'Monthly input' }],
    '2026-09': [{ score: 91.0, by: 'SPV002', ts: '2026-10-04 10:00', note: 'Monthly input' }],
  },
  SPV001: {
    '2026-01': [{ score: 94.0, by: 'HRD001', ts: '2026-02-07 09:00', note: 'Periodic evaluation' }],
    '2026-02': [{ score: 95.5, by: 'HRD001', ts: '2026-03-05 09:00', note: 'Periodic evaluation' }],
    '2026-03': [{ score: 93.0, by: 'HRD001', ts: '2026-04-05 09:00', note: 'Periodic evaluation' }],
    '2026-04': [{ score: 94.5, by: 'HRD001', ts: '2026-05-05 09:00', note: 'Periodic evaluation' }],
    '2026-05': [{ score: 96.0, by: 'HRD001', ts: '2026-06-05 09:00', note: 'Periodic evaluation' }],
    '2026-06': [{ score: 95.0, by: 'HRD001', ts: '2026-07-05 09:00', note: 'Periodic evaluation' }],
    '2026-07': [{ score: 93.5, by: 'HRD001', ts: '2026-08-05 09:00', note: 'Periodic evaluation' }],
    '2026-08': [{ score: 94.0, by: 'HRD001', ts: '2026-09-05 09:00', note: 'Periodic evaluation' }],
    '2026-09': [{ score: 95.5, by: 'HRD001', ts: '2026-10-05 09:00', note: 'Periodic evaluation' }],
  },
  SPV002: {
    '2026-01': [{ score: 81.0, by: 'HRD001', ts: '2026-02-07 09:05', note: 'Periodic evaluation' }],
    '2026-02': [{ score: 84.0, by: 'HRD001', ts: '2026-03-05 09:05', note: 'Periodic evaluation' }],
    '2026-03': [{ score: 82.0, by: 'HRD001', ts: '2026-04-05 09:05', note: 'Periodic evaluation' }],
    '2026-04': [{ score: 83.0, by: 'HRD001', ts: '2026-05-05 09:05', note: 'Periodic evaluation' }],
    '2026-05': [{ score: 85.0, by: 'HRD001', ts: '2026-06-05 09:05', note: 'Periodic evaluation' }],
    '2026-06': [{ score: 84.5, by: 'HRD001', ts: '2026-07-05 09:05', note: 'Periodic evaluation' }],
    '2026-07': [{ score: 82.5, by: 'HRD001', ts: '2026-08-05 09:05', note: 'Periodic evaluation' }],
    '2026-08': [{ score: 83.0, by: 'HRD001', ts: '2026-09-05 09:05', note: 'Periodic evaluation' }],
    '2026-09': [{ score: 85.0, by: 'HRD001', ts: '2026-10-05 09:05', note: 'Periodic evaluation' }],
  },
  HRD001: {
    '2026-01': [{ score: 95.0, by: 'DIR001', ts: '2026-02-08 10:00', note: 'Executive review' }],
    '2026-02': [{ score: 97.0, by: 'DIR001', ts: '2026-03-06 10:00', note: 'Executive review' }],
    '2026-03': [{ score: 96.0, by: 'DIR001', ts: '2026-04-06 10:00', note: 'Executive review' }],
    '2026-04': [{ score: 96.5, by: 'DIR001', ts: '2026-05-06 10:00', note: 'Executive review' }],
    '2026-05': [{ score: 98.0, by: 'DIR001', ts: '2026-06-06 10:00', note: 'Executive review' }],
    '2026-06': [{ score: 97.0, by: 'DIR001', ts: '2026-07-06 10:00', note: 'Executive review' }],
    '2026-07': [{ score: 95.0, by: 'DIR001', ts: '2026-08-06 10:00', note: 'Executive review' }],
    '2026-08': [{ score: 96.5, by: 'DIR001', ts: '2026-09-06 10:00', note: 'Executive review' }],
    '2026-09': [{ score: 97.5, by: 'DIR001', ts: '2026-10-06 10:00', note: 'Executive review' }],
  },
};

export const Q_QUANT = [
  'Pegang Komitmen - Menyelesaikan pekerjaan sesuai waktu yang sudah disepakati',
  'Transparansi - Menyampaikan informasi apa adanya tanpa menutupi kesalahan',
  'Akui Kesalahan & Evaluasi - Mengakui kekeliruan secara sportif & berinisiatif mencari solusi',
  'Totalitas & Kerja Keras - Memberikan usaha terbaik melebihi standar minimum',
  'Kualitas Hasil Kerja - Memastikan output pekerjaan rapi, akurat, dan sesuai standar',
  'Inisiatif Tinggi - Aktif mencari solusi tanpa menunggu diperintah',
  'Belajar & Berkembang - Terus meningkatkan keahlian dan mempelajari hal baru',
  'Adaptasi Perubahan - Cepat menyesuaikan diri dengan metode kerja baru',
  'Kerjasama Tim - Berkomunikasi secara kondusif dan aktif berkontribusi',
  'Umpan Balik Positif - Menerima kritik dengan kepala dingin sebagai evaluasi diri',
  'Profesionalisme & Etika - Menjaga perilaku terpuji, sopan santun, mematuhi peraturan',
  'Manajemen Waktu - Disiplin jam kerja, handal menentukan prioritas tugas',
];

export const Q_QUAL = [
  'Apa kekuatan utama yang paling menonjol dari rekan ini?',
  'Pada aspek apa rekan ini perlu paling banyak melakukan perbaikan?',
  'Berikan contoh konkret situasi di mana rekan ini memberikan dampak positif?',
  'Hambatan atau tantangan apa yang perlu diperhatikan?',
  'Saran spesifik apa agar rekan ini dapat berkembang lebih baik?',
];

export const INITIAL_MAPPINGS: Mapping[] = [
  { id: 'M01', penilaiId: 'EMP002', penilaiName: 'Budi Santoso', yangDinilaiId: 'EMP001', yangDinilaiName: 'Andi Pratama', relasi: 'Peer', sifat: 'wajib' },
  { id: 'M02', penilaiId: 'EMP003', penilaiName: 'Citra Dewi', yangDinilaiId: 'EMP001', yangDinilaiName: 'Andi Pratama', relasi: 'Peer', sifat: 'opsional' },
  { id: 'M03', penilaiId: 'SPV001', penilaiName: 'Gunawan Wibowo', yangDinilaiId: 'EMP001', yangDinilaiName: 'Andi Pratama', relasi: 'SPV→Employee', sifat: 'wajib' },
  { id: 'M04', penilaiId: 'HRD001', penilaiName: 'Irma Suryani', yangDinilaiId: 'EMP001', yangDinilaiName: 'Andi Pratama', relasi: 'HRD→Employee', sifat: 'wajib' },
  { id: 'M05', penilaiId: 'EMP001', penilaiName: 'Andi Pratama', yangDinilaiId: 'EMP002', yangDinilaiName: 'Budi Santoso', relasi: 'Peer', sifat: 'wajib' },
  { id: 'M06', penilaiId: 'DIR001', penilaiName: 'Joko Widiatmoko', yangDinilaiId: 'SPV001', yangDinilaiName: 'Gunawan Wibowo', relasi: 'Direksi→SPV', sifat: 'wajib' },
  { id: 'M07', penilaiId: 'EMP003', penilaiName: 'Citra Dewi', yangDinilaiId: 'EMP002', yangDinilaiName: 'Budi Santoso', relasi: 'Peer', sifat: 'opsional' },
  { id: 'M08', penilaiId: 'EMP004', penilaiName: 'Dinda Rahayu', yangDinilaiId: 'EMP003', yangDinilaiName: 'Citra Dewi', relasi: 'Peer', sifat: 'opsional' },
];
