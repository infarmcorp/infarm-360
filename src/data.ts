import { User, Period, KPIHistory, Mapping, AssesseeStatus } from './types';

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
  { id: 'DIR002', name: 'Kartini Puspita', dept: 'Direksi', role: 'direksi' }
];

export const ALL_EMPS = INITIAL_USERS.filter(u => u.role !== 'direksi');

export const SPV_TEAMS: { [spvId: string]: string[] } = {
  SPV001: ['EMP001', 'EMP002', 'EMP003', 'EMP004'],
  SPV002: ['EMP003', 'EMP004', 'EMP005']
};

export const INITIAL_ASSESSEES: { [userId: string]: AssesseeStatus[] } = {
  EMP001: [
    { id: 'EMP002', name: 'Budi Santoso', status: 'done' },
    { id: 'EMP003', name: 'Citra Dewi', status: 'pending' },
    { id: 'SPV001', name: 'Gunawan Wibowo', status: 'pending' }
  ],
  EMP002: [
    { id: 'EMP001', name: 'Andi Pratama', status: 'done' },
    { id: 'EMP003', name: 'Citra Dewi', status: 'pending' }
  ],
  EMP003: [
    { id: 'EMP001', name: 'Andi Pratama', status: 'pending' },
    { id: 'EMP004', name: 'Dinda Rahayu', status: 'pending' }
  ],
  EMP004: [
    { id: 'EMP002', name: 'Budi Santoso', status: 'pending' }
  ],
  EMP005: [
    { id: 'EMP003', name: 'Citra Dewi', status: 'done' },
    { id: 'EMP004', name: 'Dinda Rahayu', status: 'pending' }
  ],
  SPV001: [
    { id: 'EMP001', name: 'Andi Pratama', status: 'done' },
    { id: 'EMP002', name: 'Budi Santoso', status: 'done' },
    { id: 'EMP003', name: 'Citra Dewi', status: 'pending' },
    { id: 'EMP004', name: 'Dinda Rahayu', status: 'pending' }
  ],
  SPV002: [
    { id: 'EMP003', name: 'Citra Dewi', status: 'done' },
    { id: 'EMP004', name: 'Dinda Rahayu', status: 'pending' },
    { id: 'EMP005', name: 'Eko Prasetyo', status: 'done' }
  ],
  HRD001: [
    { id: 'EMP001', name: 'Andi Pratama', status: 'done' },
    { id: 'EMP002', name: 'Budi Santoso', status: 'done' },
    { id: 'EMP003', name: 'Citra Dewi', status: 'done' },
    { id: 'EMP004', name: 'Dinda Rahayu', status: 'pending' },
    { id: 'EMP005', name: 'Eko Prasetyo', status: 'pending' },
    { id: 'SPV001', name: 'Gunawan Wibowo', status: 'done' },
    { id: 'SPV002', name: 'Hesti Lestari', status: 'pending' }
  ],
  DIR001: [
    { id: 'SPV001', name: 'Gunawan Wibowo', status: 'done' },
    { id: 'SPV002', name: 'Hesti Lestari', status: 'pending' },
    { id: 'HRD001', name: 'Irma Suryani', status: 'done' }
  ],
  DIR002: [
    { id: 'SPV001', name: 'Gunawan Wibowo', status: 'done' },
    { id: 'HRD001', name: 'Irma Suryani', status: 'done' }
  ]
};

export const INITIAL_SCORE_360: { [employeeId: string]: number } = {
  EMP001: 93.3,
  EMP002: 82.1,
  EMP003: 88.5,
  EMP004: 76.4,
  EMP005: 84.7,
  SPV001: 91.2,
  SPV002: 80.3,
  HRD001: 94.1
};

export const INSTANT_QUARTERS: { [key: string]: Period } = {
  'Q1-2026': {
    status: 'ended',
    label: 'Q1 2026',
    start: '2026-01-01',
    end: '2026-03-31',
    has360: true,
    months: ['2026-01', '2026-02', '2026-03']
  },
  'Q2-2026': {
    status: 'ended',
    label: 'Q2 2026',
    start: '2026-04-01',
    end: '2026-06-30',
    has360: true,
    months: ['2026-04', '2026-05', '2026-06']
  },
  'Q3-2026': {
    status: 'active',
    label: 'Q3 2026',
    start: '2026-07-01',
    end: '2026-09-30',
    has360: true,
    months: ['2026-07', '2026-08', '2026-09']
  }
};

export const INITIAL_KPI_HIST: KPIHistory = {
  EMP001: {
    '2026-01': [
      { score: 96.0, by: 'SPV001', ts: '2026-02-05 09:14', note: 'Initial submission' },
      { score: 97.7, by: 'SPV001', ts: '2026-02-10 14:32', note: 'Koreksi setelah review atasan' }
    ],
    '2026-02': [{ score: 95.5, by: 'SPV001', ts: '2026-03-03 10:05', note: 'Monthly input' }],
    '2026-03': [{ score: 99.9, by: 'SPV001', ts: '2026-04-04 08:47', note: 'Monthly input' }],
    '2026-04': [{ score: 98.2, by: 'SPV001', ts: '2026-05-05 09:20', note: 'Monthly input' }],
    '2026-05': [{ score: 96.8, by: 'SPV001', ts: '2026-06-03 10:11', note: 'Mid-term submission' }],
    '2026-06': [{ score: 98.0, by: 'SPV001', ts: '2026-07-03 10:00', note: 'Monthly input' }],
    '2026-07': [{ score: 95.0, by: 'SPV001', ts: '2026-08-03 10:00', note: 'Monthly input' }],
    '2026-08': [{ score: 97.2, by: 'SPV001', ts: '2026-09-03 10:00', note: 'Monthly input' }],
    '2026-09': [{ score: 99.0, by: 'SPV001', ts: '2026-10-03 10:00', note: 'Monthly input' }]
  },
  EMP002: {
    '2026-01': [{ score: 82.0, by: 'SPV001', ts: '2026-02-05 09:20', note: 'Monthly input' }],
    '2026-02': [
      { score: 88.0, by: 'SPV001', ts: '2026-03-03 10:10', note: 'First entry' },
      { score: 85.0, by: 'SPV001', ts: '2026-03-05 16:45', note: 'Revisi setelah diskusi target' }
    ],
    '2026-03': [{ score: 85.5, by: 'SPV001', ts: '2026-04-04 09:00', note: 'Monthly input' }],
    '2026-04': [
      { score: 80.0, by: 'SPV001', ts: '2026-05-05 09:25', note: 'Low output month' },
      { score: 83.5, by: 'SPV001', ts: '2026-05-12 11:00', note: 'Update setelah evaluasi mid-month' }
    ],
    '2026-05': [{ score: 84.0, by: 'SPV001', ts: '2026-06-03 10:15', note: 'Monthly validation' }],
    '2026-06': [{ score: 86.5, by: 'SPV001', ts: '2026-07-03 10:05', note: 'Monthly input' }],
    '2026-07': [{ score: 84.0, by: 'SPV001', ts: '2026-08-03 10:05', note: 'Monthly input' }],
    '2026-08': [{ score: 83.5, by: 'SPV001', ts: '2026-09-03 10:05', note: 'Monthly input' }],
    '2026-09': [{ score: 87.0, by: 'SPV001', ts: '2026-10-03 10:05', note: 'Monthly input' }]
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
    '2026-09': [{ score: 90.5, by: 'SPV002', ts: '2026-10-04 09:30', note: 'Monthly input' }]
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
    '2026-09': [{ score: 82.0, by: 'SPV002', ts: '2026-10-04 09:35', note: 'Monthly input' }]
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
    '2026-09': [{ score: 91.0, by: 'SPV002', ts: '2026-10-04 10:00', note: 'Monthly input' }]
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
    '2026-09': [{ score: 95.5, by: 'HRD001', ts: '2026-10-05 09:00', note: 'Periodic evaluation' }]
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
    '2026-09': [{ score: 85.0, by: 'HRD001', ts: '2026-10-05 09:05', note: 'Periodic evaluation' }]
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
    '2026-09': [{ score: 97.5, by: 'DIR001', ts: '2026-10-06 10:00', note: 'Executive review' }]
  }
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
  'Manajemen Waktu - Disiplin jam kerja, handal menentukan prioritas tugas'
];

export const Q_QUAL = [
  'Apa kekuatan utama yang paling menonjol dari rekan ini?',
  'Pada aspek apa rekan ini perlu paling banyak melakukan perbaikan?',
  'Berikan contoh konkret situasi di mana rekan ini memberikan dampak positif?',
  'Hambatan atau tantangan apa yang perlu diperhatikan?',
  'Saran spesifik apa agar rekan ini dapat berkembang lebih baik?'
];

export const ASPEK = [
  'Lapang Hati & Terbuka',
  'Berusaha Semaksimal Mungkin',
  'Selalu Menantang Diri',
  'Jujur & Tanggung Jawab',
  'Selalu Bermawas Diri'
];

export const ASPEK_SCORES = [88, 91, 79, 86, 83];

export const DEPT_SCORES: [string, number][] = [
  ['Operasional', 87.2],
  ['Marketing', 83.5],
  ['Finance', 88.1],
  ['HRD', 95.1],
  ['Teknologi', 79.4]
];

export const INITIAL_MAPPINGS: Mapping[] = [
  { id: 'M01', penilaiId: 'EMP002', penilaiName: 'Budi Santoso', yangDinilaiId: 'EMP001', yangDinilaiName: 'Andi Pratama', relasi: 'Peer' },
  { id: 'M02', penilaiId: 'EMP003', penilaiName: 'Citra Dewi', yangDinilaiId: 'EMP001', yangDinilaiName: 'Andi Pratama', relasi: 'Peer' },
  { id: 'M03', penilaiId: 'SPV001', penilaiName: 'Gunawan Wibowo', yangDinilaiId: 'EMP001', yangDinilaiName: 'Andi Pratama', relasi: 'SPV→Employee' },
  { id: 'M04', penilaiId: 'HRD001', penilaiName: 'Irma Suryani', yangDinilaiId: 'EMP001', yangDinilaiName: 'Andi Pratama', relasi: 'HRD→Employee' },
  { id: 'M05', penilaiId: 'EMP001', penilaiName: 'Andi Pratama', yangDinilaiId: 'EMP002', yangDinilaiName: 'Budi Santoso', relasi: 'Peer' },
  { id: 'M06', penilaiId: 'DIR001', penilaiName: 'Joko Widiatmoko', yangDinilaiId: 'SPV001', yangDinilaiName: 'Gunawan Wibowo', relasi: 'Direksi→SPV' },
  { id: 'M07', penilaiId: 'EMP003', penilaiName: 'Citra Dewi', yangDinilaiId: 'EMP002', yangDinilaiName: 'Budi Santoso', relasi: 'Peer' },
  { id: 'M08', penilaiId: 'EMP004', penilaiName: 'Dinda Rahayu', yangDinilaiId: 'EMP003', yangDinilaiName: 'Citra Dewi', relasi: 'Peer' }
];

export const INDONESIAN_MONTHS = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

export const INITIAL_EVAL_ANSWERS: Record<string, Record<string, { q: Record<number, number>; t: Record<number, string>; qr?: Record<number, string> }>> = {
  // Assessor: Budi Santoso (EMP002)
  EMP002: {
    // Target: Andi Pratama (EMP001)
    EMP001: {
      q: {
        0: 5, 1: 4, 2: 4, 3: 5, 4: 5, 5: 4, 6: 5, 7: 4, 8: 5, 9: 4, 10: 5, 11: 4
      },
      t: {
        0: 'Rekan Andi sangat ahli di bidang operasional dan selalu responsif.',
        1: 'Terkadang terlalu perfeksionis sehingga agak menghambat rekan kerja lain.',
        2: 'Membantu setup workstation baru dalam waktu setengah hari saja.',
        3: 'Membagikan workflow penyusunan dokumen secara terbuka.',
        4: 'Lebih rileks dan jangan terlalu memikirkan detail kecil.'
      },
      qr: {
        0: 'Selalu menyelesaikan pekerjaan tepat waktu sesuai dengan target disepakati.',
        1: 'Sangat jujur menyebutkan jika ada kesalahan input log harian.',
        2: 'Sportif jika melakukan kekeliruan dan aktif mencari solusi pemecahan.',
        3: 'Memberikan usaha terbaik di luar tanggung jawab standarnya.',
        4: 'Output pekerjaan sangat memuaskan, rapi, dan minim kesalahan revisi.',
        5: 'Punya inisiatif yang tinggi untuk membenahi workstation operasional.',
        6: 'Selalu bersemangat mempelajari keterampilan baru di divisi.',
        7: 'Sangat sigap beradaptasi ketika ada perubahan sistem inventori.',
        8: 'Mudah berkolaborasi dan selalu ramah saat berdiskusi grup.',
        9: 'Terbuka saat menerima koreksi masukan dari sesama rekan kerja.',
        10: 'Menjaga sikap dan sopan santun yang sangat baik di kantor.',
        11: 'Pembagian waktu kerjanya sangat teratur dan seimbang.'
      }
    }
  },
  // Assessor: Gunawan Wibowo (SPV001)
  SPV001: {
    // Target: Andi Pratama (EMP001)
    EMP001: {
      q: {
        0: 5, 1: 5, 2: 4, 3: 5, 4: 5, 5: 5, 6: 4, 7: 5, 8: 4, 9: 5, 10: 5, 11: 5
      },
      t: {
        0: 'Disiplin yang sangat tinggi dan etos kerja teladan.',
        1: 'Bisa lebih meningkatkan komunikasi lintas divisi.',
        2: 'Mengamankan stok kritis operasional menjelang akhir kuartal.',
        3: 'Tidak ada.',
        4: 'Pertahankan kinerja solid untuk promosi karir berikutnya.'
      },
      qr: {
        0: 'Komitmen waktu yang luar biasa, tidak pernah menunda tugas penting.',
        1: 'Transparansi kerjanya sangat baik, selalu melaporkan kondisi riil di lapangan.',
        2: 'Menerima arahan perbaikan kesalahan dengan sikap ksatria dan sigap.',
        3: 'Pekerja keras sejati yang siap mendukung kebutuhan tim kapan saja.',
        4: 'Kualitas kerja unggul, sangat sedikit memerlukan supervisi tambahan.',
        5: 'Secara proaktif menyarankan perbaikan proses alur penerimaan barang.',
        6: 'Terlihat konsisten menantang diri dengan mempelajari prosedur terbaru.',
        7: 'Fleksibel dan tenang menghadapi perubahan beban kerja mendadak.',
        8: 'Mampu memimpin koordinasi harian operasional dengan kondusif.',
        9: 'Menghargai masukan umpan balik sebagai sarana evaluasi diri yang sehat.',
        10: 'Memiliki integritas tinggi dan selalu menaati kode etik perusahaan.',
        11: 'Ketepatan kehadirannya sangat baik, manajemen waktu kerjanya patut ditiru.'
      }
    },
    // Target: Budi Santoso (EMP002)
    EMP002: {
      q: {
        0: 4, 1: 4, 2: 4, 3: 4, 4: 4, 5: 3, 6: 4, 7: 4, 8: 4, 9: 4, 10: 4, 11: 4
      },
      t: {
        0: 'Stabil secara kinerja.',
        1: 'Inisiatif mandiri perlu dipicu kembali.',
        2: 'Membantu proses audit inventori semesteran dengan lancar.',
        3: 'Keterlibatan di rapat koordinasi masih minim.',
        4: 'Lebih proaktif mengusulkan ide perbaikan.'
      },
      qr: {
        0: 'Pekerjaan selesai sesuai jadwal dengan kualitas memadai.',
        1: 'Cukup terbuka dalam menyampaikan update status progres tugas.',
        2: 'Sedia memperbaiki kesalahan operasional yang dilaporkan.',
        3: 'Memberikan kontribusi sesuai standar kerja yang diinstruksikan.',
        4: 'Hasil pekerjaan berada dalam batas toleransi kesalahan yang wajar.',
        5: 'Masih perlu diingatkan untuk mengambil tindakan preventif mandiri.',
        6: 'Menunjukkan usaha yang cukup untuk mempelajari metode kerja luar divisi.',
        7: 'Cepat menyesuaikan dengan prosedur keamanan operasional yang baru.',
        8: 'Bekerja dengan baik bersama anggota tim lainnya.',
        9: 'Bisa menerima kritik masukan harian dengan respons yang bersahabat.',
        10: 'Menjaga perilaku profesional dan sopan santun dengan konsisten.',
        11: 'Kehadiran dan disiplin jam kerja terpantau cukup teratur.'
      }
    }
  },
  // Assessor: Irma Suryani (HRD001)
  HRD001: {
    // Target: Andi Pratama (EMP001)
    EMP001: {
      q: {
        0: 5, 1: 5, 2: 5, 3: 4, 4: 5, 5: 4, 6: 5, 7: 4, 8: 5, 9: 4, 10: 5, 11: 5
      },
      t: {
        0: 'Integritas, disiplin, dan dedikasi luar biasa.',
        1: 'Perlu bimbingan untuk memperluas peran koordinasi tim.',
        2: 'Menangani insiden logistik operasional darurat dengan tenang.',
        3: 'Sering memendam isu sebelum dikoordinasikan.',
        4: 'Terus pertahankan semangat melayani dan kolaborasi.'
      },
      qr: {
        0: 'Memegang tanggung jawab penuh terhadap tenggat waktu penyelesaian tugas.',
        1: 'Sangat jujur dalam pelaporan data, teladan integritas.',
        2: 'Berorientasi solusi saat merespon kegagalan atau kesalahan teknis.',
        3: 'Menghadirkan upaya maksimal untuk mencapai indikator keberhasilan.',
        4: 'Ketelitian hasil kerja sangat baik, minim tingkat kesalahan akurasi.',
        5: 'Turut serta merancang langkah-langkah peningkatan efisiensi.',
        6: 'Memiliki dorongan belajar yang besar terhadap hal teknologis baru.',
        7: 'Adaptif terhadap standar operasional baru yang ditetapkan korporasi.',
        8: 'Sangat kooperatif dan memberi energi positif dalam koordinasi.',
        9: 'Lapang dada menerima saran HRD saat sesi diskusi evaluasi rutin.',
        10: 'Etika kerjanya prima, mematuhi seluruh peraturan disiplin.',
        11: 'Manajemen waktu yang efisien dalam menyelesaikan beberapa tugas sekaligus.'
      }
    }
  }
};

