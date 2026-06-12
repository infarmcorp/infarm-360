// @ts-nocheck
// TODO(migrasi): SPA legacy hasil AI Studio — belum lolos TS strict.
// Dipecah & ditipekan ulang bertahap saat tiap fitur dimigrasi ke route Next.js.
'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Award,
  Calendar,
  Layers,
  ChevronRight,
  TrendingUp,
  LogOut,
  User as UserIcon,
  Lock,
  FileText,
  Target,
  Users,
  CheckCircle,
  Clock,
  Trash2,
  Search,
  Sliders,
  Check,
  AlertTriangle,
  UploadCloud,
  FileSpreadsheet,
  Info,
  Building,
  Star,
  Users2,
  CalendarDays,
  ShieldCheck,
  Plus,
  PlusCircle,
  PenLine,
  Upload,
  Bell,
  ChevronDown,
  ChevronUp,
  Scale
} from 'lucide-react';

import { User, Period, AssesseeStatus, KPIHistory, Mapping, RelationCorrectionRequest } from './types';
import {
  INITIAL_USERS,
  ALL_EMPS,
  SPV_TEAMS,
  INITIAL_ASSESSEES,
  INITIAL_SCORE_360,
  INSTANT_QUARTERS,
  INITIAL_KPI_HIST,
  INITIAL_MAPPINGS,
  ASPEK,
  ASPEK_SCORES,
  DEPT_SCORES,
  INDONESIAN_MONTHS,
  Q_QUANT,
  Q_QUAL,
  INITIAL_EVAL_ANSWERS
} from './data';

import VisualCharts from './components/VisualCharts';
import PerformanceAppraisalDoc from './components/PerformanceAppraisalDoc';
import { cleanQuestionText, getAspectCodeForQuestion } from './utils/questionHelper';
import FormAssess from './components/FormAssess';

const getDynamicQr = (targetName: string, dept: string, assessorIdx: number) => {
  const firstName = targetName.split(' ')[0];
  
  let tasks = "menyelesaikan target tugas";
  let mistakeTerm = "kekeliruan operasional";
  let outputTerm = "hasil kerja";
  let skillTerm = "prosedur teknis baru";
  let groupTerm = "koordinasi harian";

  if (dept === 'Operasional') {
    tasks = "kegiatan bongkar muat dan tata kelola barang";
    mistakeTerm = "kesalahan logistik atau kerusakan barang fungsional";
    outputTerm = "akurasi pencatatan log harian dan kepatuhan K3";
    skillTerm = "pengoperasian perangkat modern dan standar K3";
    groupTerm = "sinergi tim operasional lapangan";
  } else if (dept === 'Marketing') {
    tasks = "peluncuran materi promosi dan program kampanye iklan";
    mistakeTerm = "salah sasaran demografi iklan atau optimasi budget";
    outputTerm = "materi kreatif promosi, visualisasi iklan, dan metrik CTR";
    skillTerm = "penerapan analisis tren digital terbaru";
    groupTerm = "brainstorming konsep kreatif lintas divisi";
  } else if (dept === 'Finance') {
    tasks = "rekonsiliasi keuangan bulanan dan penyesuaian kas";
    mistakeTerm = "selisih pembukuan jurnal saldo atau salah input nominal";
    outputTerm = "dokumen neraca, pelaporan pajak, dan akurasi jurnal";
    skillTerm = "penerapan aturan regulasi pajak dan software akuntansi";
    groupTerm = "penyelarasan berkas anggaran operasional";
  }

  if (assessorIdx === 0) {
    return {
      0: `Saya melihat ${firstName} selalu sigap ${tasks} tepat waktu.`,
      1: `Sangat terbuka menyampaikan hambatan kerja tanpa takut disalahkan.`,
      2: `Sportif mengakui jika terjadi ${mistakeTerm} dan lekas mencari solusi bersama.`,
      3: `Dia selalu berikan energi positif dan usaha terbaiknya untuk tim.`,
      4: `Sejauh ini ${outputTerm} garapan ${firstName} sangat rapi dan bisa diandalkan.`,
      5: `Proaktif mengusulkan perbaikan praktis demi kelancaran alur harian.`,
      6: `Selalu termotivasi dan antusias mempelajari ${skillTerm}.`,
      7: `Cukup cepat menyesuaikan diri tatkala terjadi perubahan prioritas kerja.`,
      8: `Enak diajak diskusi, pembawaannya supel dan mendukung kawan sejawat.`,
      9: `Menerima kritik saran kami dengan lapang hati demi perbaikan diri.`,
      10: `Menjaga sopan santun dan menjunjung tinggi etika kedisiplinan kerja.`,
      11: `Sangat teratur membagi waktu sehingga jarang ada tugas terbengkalai.`
    };
  } else if (assessorIdx === 1) {
    return {
      0: `${firstName} membuktikan komitmen waktu yang tinggi dalam mengemban amanah.`,
      1: `Integritasnya teruji, selalu melaporkan kondisi realitas di lapangan secara transparan.`,
      2: `Sikapnya ksatria saat dievaluasi perihal ${mistakeTerm} dan langsung merespon dengan perbaikan.`,
      3: `Dedikasinya melampaui harapan, selalu bersedia mengambil tanggung jawab esktra.`,
      4: `${firstName} konsisten memproduksi ${outputTerm} dengan tingkat presisi yang sangat aman.`,
      5: `Memiliki inisiatif orisinil untuk menyederhanakan ${groupTerm} agar lebih efisien.`,
      6: `Memiliki hasrat berkembang yang konkrit dengan menguasai ${skillTerm}.`,
      7: `Menunjukkan ketahanan (resilience) yang bagus di masa-masing restrukturisasi beban kerja.`,
      8: `Mampu membina komunikasi persuasif yang membuat suasana kerja sangat kondusif.`,
      9: `Menghargai feedback dari atasan sebagai kompas pengembangan karir profesional.`,
      10: `Menjadi role-model perilaku baik dan kedewasaan bagi rekan-rekan setimnya.`,
      11: `Kemampuan mengelola skala prioritas tugasnya sangat tajam dan matang.`
    };
  } else {
    return {
      0: `Memenuhi standar SLA ketepatan pemenuhan tugas yang handal.`,
      1: `Sangat mengedepankan etos transparansi pelaporan operasional.`,
      2: `Menunjukkan ketenangan emosional saat mengurai ${mistakeTerm}.`,
      3: `Memberikan totalitas kontribusi yang luar biasa pada setiap program kerja perusahaan.`,
      4: `Akurasi dokumen dan kesesuaian tindakan administrasinya sangat patut diapresiasi.`,
      5: `Seringkali berinisiatif mengajukan program mentoring mandiri.`,
      6: `Menuntaskan modul pembelajaran ${skillTerm} dengan predikat sangat baik.`,
      7: `Sangat terbuka dan fleksibel mengadopsi tatanan kerja anyar organisasi.`,
      8: `Selalu menghidupkan nilai-nilai kolaboratif dan kesetiakawanan sosial.`,
      9: `Menjadikan sesi evaluasi HRD sebagai sarana refleksi diri secara produktif.`,
      10: `Tidak pernah tercatat melakukan pelanggaran SOP ataupun tindakan indispliner.`,
      11: `Menampilkan disiplin kehadiran yang kokoh didukung manajemen waktu andalan.`
    };
  }
};

const getDynamicT = (targetName: string, dept: string, assessorIdx: number) => {
  const firstName = targetName.split(' ')[0];
  if (assessorIdx === 0) {
    return {
      0: `Rekan ${firstName} sangat handal dan suportif di lingkungan tim.`,
      1: `Kadang perlu meluangkan waktu bersantai agar tidak terlalu stres memikul beban kerja.`,
      2: `Membantu penyelesaian backlog tugas bersama saat situasi mendesak.`,
      3: `Rutin berkomunikasi aktif lewat saluran koordinasi internal.`,
      4: `Semoga terus dipertahankan kehangatan sikap kerjanya.`
    };
  } else if (assessorIdx === 1) {
    return {
      0: `Stabilitas kinerja ${firstName} sangat superior di kuartal ini.`,
      1: `Bisa terus dikembangkan keberanian memimpin presentasi di forum besar.`,
      2: `Berhasil mengamankan target esensial di divisi ${dept}.`,
      3: `Responsif terhadap instruksi pimpinan dengan sikap konstruktif.`,
      4: `Pertahankan kualitas kepemimpinan informal ini.`
    };
  } else {
    return {
      0: `Perilaku sosiometris dan indeks kedisipilanan ${firstName} luar biasa baik.`,
      1: `Manfaatkan program kelas pelatihan eksternal korporasi yang akan datang.`,
      2: `Menunjukkan etika teladan di lingkungan kantor pusat maupun cabang.`,
      3: `Sangat mematuhi batas pelaporan absensi dan administrasi HRD.`,
      4: `Terus asah potensi Anda untuk jenjang karir manajerial.`
    };
  }
};

export default function App() {
  // --- STATE ---
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    const u = localStorage.getItem('infarm_curuser');
    return u ? JSON.parse(u) : null;
  });

  const [quarters, setQuarters] = useState<Record<string, Period>>(() => {
    const q = localStorage.getItem('infarm_quarters');
    if (q) {
      try {
        const parsed = JSON.parse(q);
        if (!parsed['Q3-2026'] || parsed['Q2-2026']?.has360 !== true) {
          localStorage.setItem('infarm_quarters', JSON.stringify(INSTANT_QUARTERS));
          return INSTANT_QUARTERS;
        }
        return parsed;
      } catch (err) {
        return INSTANT_QUARTERS;
      }
    }
    return INSTANT_QUARTERS;
  });

  // Make end date and custom quarters fully editable and customizable
  const [activeQuarterKey, setActiveQuarterKey] = useState<string>(() => {
    return localStorage.getItem('infarm_active_qkey') || 'Q3-2026'; // Default to active Q3
  });

  const [assessList, setAssessList] = useState<Record<string, AssesseeStatus[]>>(() => {
    const a = localStorage.getItem('infarm_assess');
    return a ? JSON.parse(a) : INITIAL_ASSESSEES;
  });

  const [kpiHist, setKpiHist] = useState<KPIHistory>(() => {
    const k = localStorage.getItem('infarm_kpihist');
    if (k) {
      try {
        const parsed = JSON.parse(k);
        if (!parsed['EMP001']?.['2026-06'] || !parsed['EMP001']?.['2026-07']) {
          localStorage.setItem('infarm_kpihist', JSON.stringify(INITIAL_KPI_HIST));
          return INITIAL_KPI_HIST;
        }
        return parsed;
      } catch (err) {
        return INITIAL_KPI_HIST;
      }
    }
    return INITIAL_KPI_HIST;
  });

  const [mappings, setMappings] = useState<Mapping[]>(() => {
    const m = localStorage.getItem('infarm_mappings');
    return m ? JSON.parse(m) : INITIAL_MAPPINGS;
  });

  const [score360, setScore360] = useState<Record<string, Record<string, number>>>(() => {
    const s = localStorage.getItem('infarm_score360');
    if (s) {
      try {
        const parsed = JSON.parse(s);
        if (parsed['Q2-2026'] || parsed['Q3-2026'] || parsed['Q1-2026']) {
          return parsed;
        }
        return {
          'Q2-2026': parsed,
          'Q3-2026': {}
        };
      } catch (e) {
        // fallback
      }
    }
    return {
      'Q2-2026': INITIAL_SCORE_360,
      'Q3-2026': {},
      'Q1-2026': { EMP001: 88.0 }
    };
  });

  // Customizable questions state (Requirement 2)
  const [customQQuant, setCustomQQuant] = useState<string[]>(() => {
    const saved = localStorage.getItem('infarm_custom_qquant');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.length !== 12) {
          localStorage.removeItem('infarm_custom_qquant');
          return Q_QUANT;
        }
        return parsed;
      } catch (e) {
        return Q_QUANT;
      }
    }
    return Q_QUANT;
  });

  const [customQQual, setCustomQQual] = useState<string[]>(() => {
    const saved = localStorage.getItem('infarm_custom_qqual');
    return saved ? JSON.parse(saved) : Q_QUAL;
  });

  const [weightingMode, setWeightingMode] = useState<'four-class' | 'two-class'>(() => {
    const saved = localStorage.getItem('infarm_weighting_mode');
    return (saved as 'four-class' | 'two-class') || 'four-class';
  });

  const [raterWeights, setRaterWeights] = useState<{
    fourClass: { atasan: number; peer: number; cross: number; self: number };
    twoClass: { atasan: number; internal: number };
  }>(() => {
    const saved = localStorage.getItem('infarm_rater_weights');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) {}
    }
    return {
      fourClass: { atasan: 50, peer: 30, cross: 20, self: 0 },
      twoClass: { atasan: 40, internal: 60 }
    };
  });

  // Editable evaluations answers tracking (Requirement 1) with quarter segregation
  const [evalAnswers, setEvalAnswers] = useState<Record<string, Record<string, Record<string, { q: Record<number, number>; t: Record<number, string>; qr?: Record<number, string> }>>>>(() => {
    const saved = localStorage.getItem('infarm_eval_answers');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed['Q2-2026'] || parsed['Q3-2026'] || parsed['Q1-2026']) {
          return parsed;
        }
        return {
          'Q2-2026': parsed,
          'Q3-2026': {},
          'Q1-2026': {}
        };
      } catch (e) {
        // fallback
      }
    }
    return {
      'Q2-2026': INITIAL_EVAL_ANSWERS, // Q2 completed
      'Q3-2026': {},                    // Q3 active clean
      'Q1-2026': {
        EMP002: {
          EMP001: {
            q: { 0: 4, 1: 4, 2: 4, 3: 4, 4: 4, 5: 4, 6: 4, 7: 4, 8: 4, 9: 4, 10: 4, 11: 4 },
            t: { 0: 'Awal tahun yang baik.', 1: 'Masih penyesuaian alur baru.', 2: 'Membantu instalasi rak inventori.', 3: 'Membantu rekonsiliasi triwulanan.', 4: 'Semoga terus konsisten.' },
            qr: {
              0: 'Menyelesaikan target Q1 dengan baik.',
              1: 'Sangat jujur berterus-terang dalam pelaporan.',
              2: 'Cepat belajar dari kekeliruan Q1.',
              3: 'Menunjukkan kesungguhan belajar.',
              4: 'Hasil kerja standar dan rapi.',
              5: 'Inisiatif membersihkan workstation.',
              6: 'Menyukai tantangan baru.',
              7: 'Cepat menyesuaikan koordinasi kerja.',
              8: 'Bekerja bersama tim dengan harmonis.',
              9: 'Mendengarkan arahan koordinator.',
              10: 'Menjaga profesionalisme kerja.',
              11: 'Menghormati pembagian jadwal.'
            }
          }
        }
      }
    };
  });

  // Switch role view state for HRD Admin acting as Supervisor (Requirement 2)
  const [hrdActingAsSpv, setHrdActingAsSpv] = useState<boolean>(false);

  // Active user context (Requirement 2)
  const activeUser = useMemo(() => {
    if (!currentUser) return null;
    if (currentUser.role === 'hrd' && hrdActingAsSpv) {
      return {
        id: currentUser.id,
        name: currentUser.name + ' (SPV Mode)',
        dept: currentUser.dept,
        role: 'spv' as const,
        realHrd: currentUser
      };
    }
    return {
      id: currentUser.id,
      name: currentUser.name,
      dept: currentUser.dept,
      role: currentUser.role,
      realHrd: null as any
    };
  }, [currentUser, hrdActingAsSpv]);

  // Dynamic subordinates list supporting regular SPVs and HRD Admin acting as Supervisor (Requirement 2)
  const activeSupervisees = useMemo(() => {
    if (!activeUser) return [];
    // If Irma acting as SPV, she supervises all 5 employees
    if (activeUser.id === 'HRD001' && activeUser.role === 'spv') {
      return ['EMP001', 'EMP002', 'EMP003', 'EMP004', 'EMP005'];
    }
    return SPV_TEAMS[activeUser.id] || [];
  }, [activeUser]);

  // Support for Excel and Manual KPI entry (Requirement 4)
  const [kpiInputMode, setKpiInputMode] = useState<'manual' | 'excel'>('manual');
  const [kpiExcelUploading, setKpiExcelUploading] = useState<boolean>(false);
  const [kpiExcelFile, setKpiExcelFile] = useState<string | null>(null);

  // Promotion lists (Requirement 7)
  const [allUsersList, setAllUsersList] = useState<User[]>(() => {
    const saved = localStorage.getItem('infarm_all_users_list');
    return saved ? JSON.parse(saved) : INITIAL_USERS;
  });

  // Keep track of HRD promotion plans and approved/pending/not approved statuses independently
  const [promotions, setPromotions] = useState<Record<string, { targetPlan: string; status: 'approved' | 'pending' | 'not approved'; notes?: string }>>(() => {
    const p = localStorage.getItem('infarm_promotions');
    if (p) {
      try {
        return JSON.parse(p);
      } catch (err) {
        // fall back below
      }
    }
    return {
      'EMP001': { targetPlan: 'Promosi Ke Operator Senior (Tingkat V)', status: 'pending', notes: 'Sangat direkomendasikan atas capaian kualitatif & kuantitatif mumpuni.' },
      'HRD001': { targetPlan: 'Promosi Ke HR Director Executive (Tingkat II)', status: 'pending', notes: 'Pemeriksaan rutin berjalan tertib dan tepat.' }
    };
  });

  // Track SPV & HRD approvals for reports (Requirement 10)
  const [reportApprovals, setReportApprovals] = useState<Record<string, Record<string, { spvApproved: boolean; hrdApproved: boolean }>>>(() => {
    const saved = localStorage.getItem('infarm_report_approvals');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (err) {
        // fall back below
      }
    }
    return {
      'EMP001': {
        'Q1-2026': { spvApproved: true, hrdApproved: true },
        'Q2-2026': { spvApproved: true, hrdApproved: false },
      },
      'EMP002': {
        'Q1-2026': { spvApproved: true, hrdApproved: true },
        'Q2-2026': { spvApproved: false, hrdApproved: false },
      },
      'EMP003': {
        'Q1-2026': { spvApproved: true, hrdApproved: true },
        'Q2-2026': { spvApproved: true, hrdApproved: true },
      },
      'EMP004': {
        'Q1-2026': { spvApproved: true, hrdApproved: true },
        'Q2-2026': { spvApproved: false, hrdApproved: false },
      },
      'EMP005': {
        'Q1-2026': { spvApproved: true, hrdApproved: true },
        'Q2-2026': { spvApproved: false, hrdApproved: false },
      },
      'SPV001': {
        'Q1-2026': { spvApproved: true, hrdApproved: true },
        'Q2-2026': { spvApproved: false, hrdApproved: false },
      },
      'SPV002': {
        'Q1-2026': { spvApproved: true, hrdApproved: true },
        'Q2-2026': { spvApproved: false, hrdApproved: false },
      }
    };
  });

  const toggleReportApproval = (eid: string, qk: string, approverRole: 'spv' | 'hrd') => {
    setReportApprovals(prev => {
      const outer = { ...prev };
      if (!outer[eid]) {
        outer[eid] = {};
      }
      const inner = { ...outer[eid] };
      const current = inner[qk] || { spvApproved: false, hrdApproved: false };
      
      if (approverRole === 'spv') {
        inner[qk] = { ...current, spvApproved: !current.spvApproved };
      } else {
        inner[qk] = { ...current, hrdApproved: !current.hrdApproved };
      }
      
      outer[eid] = inner;
      return outer;
    });
    showToast('Status ACC Laporan berhasil diperbarui!', 'ok');
  };

  const [selQPromosi, setSelQPromosi] = useState<string>(() => {
    return localStorage.getItem('infarm_active_qkey') || 'Q3-2026';
  });

  const [selQPersonal, setSelQPersonal] = useState<string>(() => {
    return localStorage.getItem('infarm_active_qkey') || 'Q3-2026';
  });

  // Navigations & UI selections
  const [page, setPage] = useState<string>('assess');
  const [kpiTab, setKpiTab] = useState<'input' | 'history' | 'quarterly'>('input');
  const [periodeTab, setPeriodeTab] = useState<'control' | 'history'>('control');
  
  const [selMonth, setSelMonth] = useState<string>('2026-07'); // Set to first month of Q3
  const [selEmp, setSelEmp] = useState<string>('EMP001');
  const [selQRecap, setSelQRecap] = useState<string>('Q3-2026');
  const [filterSpvHistory, setFilterSpvHistory] = useState<string>('all');
  const [filterSpvRecap, setFilterSpvRecap] = useState<string>('all');
  const [selQTeam, setSelQTeam] = useState<string>('Q3-2026');
  const [selQReview, setSelQReview] = useState<string>('Q3-2026');
  const [selQAnalytics, setSelQAnalytics] = useState<string>('Q3-2026');
  const [analyticsSubTab, setAnalyticsSubTab] = useState<'compilation' | 'kpi_results' | 'feedback_360' | 'all_employees'>('compilation');
  const [searchQueryAllEmployees, setSearchQueryAllEmployees] = useState<string>('');
  
  const [filterYear, setFilterYear] = useState<string>('2026');
  const [filterQuarter, setFilterQuarter] = useState<string>('Q3');
  const [filterMonth, setFilterMonth] = useState<string>('Semua');
  const [filterDivision, setFilterDivision] = useState<string>('Semua');

  // Interactive Temp states
  const [loginRole, setLoginRole] = useState<string>('');
  const [loginUserId, setLoginUserId] = useState<string>('');
  const [loginPassword, setLoginPassword] = useState<string>('Infarm@2026');
  
  const [kpiInputScores, setKpiInputScores] = useState<Record<string, string>>({});
  const [kpiInputNotes, setKpiInputNotes] = useState<Record<string, string>>({});
  
  const [activeFormTarget, setActiveFormTarget] = useState<{ id: string; name: string; dept: string } | null>(null);
  
  // Detailed Report view targets
  const [selectedReviewEmpId, setSelectedReviewEmpId] = useState<string | null>(null);
  const [expandedTeamEmpId, setExpandedTeamEmpId] = useState<string | null>(null);

  // Filter query keyword
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selPromosiDept, setSelPromosiDept] = useState<string>('all');
  const [selPromosiPlan, setSelPromosiPlan] = useState<string>('all');
  const [selChartDept, setSelChartDept] = useState<string>('all');
  const [selChartEmpId, setSelChartEmpId] = useState<string>('all');
  const [selChartMonth, setSelChartMonth] = useState<string>('all');
  const [selChartYear, setSelChartYear] = useState<string>('2026');
  const [selChartQuarter, setSelChartQuarter] = useState<string>('all');
  const [selChartMode, setSelChartMode] = useState<'anggota' | 'divisi'>('anggota');

  // States for Progress 360 Feedback monitoring (Requirement 3)
  const [progress360Search, setProgress360Search] = useState<string>('');
  const [progress360Dept, setProgress360Dept] = useState<string>('all');
  const [progress360Status, setProgress360Status] = useState<string>('all');
  const [expandedAssessorId, setExpandedAssessorId] = useState<string | null>(null);
  const [monitorSubTab, setMonitorSubTab] = useState<'kpi-bulanan' | '360-kuartalan'>('kpi-bulanan');
  const [mappingInputPenilai, setMappingInputPenilai] = useState<string>('');
  const [mappingInputDinilai, setMappingInputDinilai] = useState<string>('');
  const [mappingInputRelasi, setMappingInputRelasi] = useState<string>('Peer');
  const [mappingInputSifat, setMappingInputSifat] = useState<'wajib' | 'opsional'>('wajib');

  // Punishment kepatuhan: pengurangan poin Skor Akhir per pegawai PER KUARTAL (diinput HRD).
  // Struktur: { [quarterKey]: { [employeeId]: poin } }
  const [compliancePenalties, setCompliancePenalties] = useState<Record<string, Record<string, number>>>(() => {
    try {
      const saved = localStorage.getItem('infarm_compliance_penalties');
      return saved ? JSON.parse(saved) : {};
    } catch { return {}; }
  });
  const getPenalty = (eid: string, qKey: string): number =>
    (compliancePenalties[qKey] && compliancePenalties[qKey][eid]) || 0;
  const setCompliancePenalty = (qKey: string, eid: string, value: number) => {
    const v = Math.max(0, Math.min(100, isNaN(value) ? 0 : value));
    setCompliancePenalties(prev => {
      const next = { ...prev, [qKey]: { ...(prev[qKey] || {}), [eid]: v } };
      localStorage.setItem('infarm_compliance_penalties', JSON.stringify(next));
      return next;
    });
  };

  const [relationRequests, setRelationRequests] = useState<RelationCorrectionRequest[]>(() => {
    const saved = localStorage.getItem('infarm_relation_requests');
    return saved ? JSON.parse(saved) : [
      {
        id: 'REQ01',
        penilaiId: 'EMP001',
        penilaiName: 'Andi Pratama',
        yangDinilaiId: 'EMP002',
        yangDinilaiName: 'Budi Santoso',
        oldRelasi: 'Cross',
        newRelasi: 'Peer',
        reason: 'Sama-sama dalam divisi Operasional sebagai rekan sejawat langsung.',
        status: 'pending'
      }
    ];
  });

  const [filterPenilai, setFilterPenilai] = useState<string>('');
  const [filterTarget, setFilterTarget] = useState<string>('');

  const [showCorrectionModal, setShowCorrectionModal] = useState<boolean>(false);
  const [correctionTarget, setCorrectionTarget] = useState<{ penilaiId: string; penilaiName: string; yangDinilaiId: string; yangDinilaiName: string; currentRelasi: string } | null>(null);
  const [correctionNewRelasi, setCorrectionNewRelasi] = useState<string>('Peer');
  const [correctionReason, setCorrectionReason] = useState<string>('');

  // Excel Upload simulation/state (Requirement 6)
  const [excelUploading, setExcelUploading] = useState<boolean>(false);
  const [excelFile, setExcelFile] = useState<string | null>(null);
  const [uploadedExcelKpis, setUploadedExcelKpis] = useState<Array<{ id: string; name: string; score: number; note: string }>>([]);

  // Ad-hoc rating addition state (Requirement 8)
  const [adhocTargetEmpId, setAdhocTargetEmpId] = useState<string>('');

  // Toast array
  const [toasts, setToasts] = useState<Array<{ id: string; msg: string; type: 'ok' | 'err' | 'info' }>>([]);

  // --- END-TO-END INTERACTIVE SIMULATION PANEL ---
  const [simulationDrawerOpen, setSimulationDrawerOpen] = useState<boolean>(false);
  const [simTargetEmpId, setSimTargetEmpId] = useState<string>('EMP001');

  const getRaterClass = (penilaiId: string, targetId: string): 'atasan' | 'peer' | 'cross' | 'self' => {
    if (penilaiId === targetId) return 'self';
    const match = mappings.find(m => m.penilaiId === penilaiId && m.yangDinilaiId === targetId);
    let origRelasi = 'Peer';
    if (match) {
      origRelasi = match.relasi;
    } else {
      origRelasi = getSuggestedRelasi(penilaiId, targetId);
    }
    
    if (origRelasi === 'Atasan' || origRelasi === 'SPV→Employee' || origRelasi === 'Direksi→SPV' || origRelasi === 'HRD→Employee') return 'atasan';
    if (origRelasi === 'Cross') return 'cross';
    return 'peer'; // Peer, Bawahan, or default
  };

  // Helper code to get score360 for a specific quarter and employee
  const getScore360ForQuarter = (eid: string, qKey: string): number | null => {
    const qAnswers = evalAnswers[qKey] || {};
    let hasAnswers = false;
    Object.entries(qAnswers).forEach(([assessorId, targetMap]) => {
      if ((targetMap as any)[eid]) {
        hasAnswers = true;
      }
    });

    if (hasAnswers) {
      // Calculate dynamic weighted score
      const scoresByGroup: { atasan: number[]; peer: number[]; cross: number[]; self: number[] } = {
        atasan: [],
        peer: [],
        cross: [],
        self: []
      };

      Object.entries(qAnswers).forEach(([assessorId, targetMap]) => {
        const targetAns = (targetMap as any)[eid];
        if (targetAns) {
          const qVals = Object.values(targetAns.q);
          const avg = qVals.length > 0 ? ((qVals as any[]).reduce((acc: number, c: any) => acc + Number(c), 0) / qVals.length) * 20 : 0;
          if (avg > 0) {
            const rClass = getRaterClass(assessorId, eid);
            scoresByGroup[rClass].push(avg);
          }
        }
      });

      if (weightingMode === 'four-class') {
        const averages: Record<'atasan' | 'peer' | 'cross' | 'self', number | null> = {
          atasan: scoresByGroup.atasan.length > 0 ? scoresByGroup.atasan.reduce((a, b) => a + b, 0) / scoresByGroup.atasan.length : null,
          peer: scoresByGroup.peer.length > 0 ? scoresByGroup.peer.reduce((a, b) => a + b, 0) / scoresByGroup.peer.length : null,
          cross: scoresByGroup.cross.length > 0 ? scoresByGroup.cross.reduce((a, b) => a + b, 0) / scoresByGroup.cross.length : null,
          self: scoresByGroup.self.length > 0 ? scoresByGroup.self.reduce((a, b) => a + b, 0) / scoresByGroup.self.length : null,
        };

        const wMap = {
          atasan: raterWeights.fourClass.atasan,
          peer: raterWeights.fourClass.peer,
          cross: raterWeights.fourClass.cross,
          self: raterWeights.fourClass.self
        };

        let totalWeight = 0;
        let weightedSum = 0;

        Object.keys(averages).forEach((key) => {
          const k = key as 'atasan' | 'peer' | 'cross' | 'self';
          if (k === 'self') return; // Exclude self from official total score limit
          const avgVal = averages[k];
          if (avgVal !== null) {
            totalWeight += wMap[k];
            weightedSum += avgVal * wMap[k];
          }
        });

        if (totalWeight > 0) {
          return Math.round((weightedSum / totalWeight) * 10) / 10;
        }
      } else {
        // two-class mode
        const atasanAvg = scoresByGroup.atasan.length > 0 ? scoresByGroup.atasan.reduce((a, b) => a + b, 0) / scoresByGroup.atasan.length : null;
        const internalScores = [...scoresByGroup.peer, ...scoresByGroup.cross]; // Exclude self from internal scores as well
        const internalAvg = internalScores.length > 0 ? internalScores.reduce((a, b) => a + b, 0) / internalScores.length : null;

        const wAtasan = raterWeights.twoClass.atasan;
        const wInternal = raterWeights.twoClass.internal;

        if (atasanAvg !== null && internalAvg !== null) {
          const totalWeight = wAtasan + wInternal;
          if (totalWeight > 0) {
            return Math.round(((atasanAvg * wAtasan + internalAvg * wInternal) / totalWeight) * 10) / 10;
          }
        } else if (atasanAvg !== null) {
          return Math.round(atasanAvg * 10) / 10;
        } else if (internalAvg !== null) {
          return Math.round(internalAvg * 10) / 10;
        }
      }
    }

    if (score360 && (score360 as any)[qKey] && (score360 as any)[qKey][eid] !== undefined) {
      return (score360 as any)[qKey][eid];
    }

    if (qKey === 'Q2-2026') {
      return INITIAL_SCORE_360[eid] ?? 85.0;
    }

    return null;
  };

  const handleSimulateFullFeedback = (targetId: string, qKey: string) => {
    const targetEmpObj = ALL_EMPS.find(e => e.id === targetId);
    if (!targetEmpObj) return;

    const assessors = ['EMP002', 'SPV001', 'HRD001'];
    const mockFeedbackText = assessors.map((assessorId, idx) => ({
      q: idx === 1 ? { 0: 5, 1: 5, 2: 4, 3: 5, 4: 5, 5: 5, 6: 4, 7: 5, 8: 4, 9: 5, 10: 5, 11: 5 } : 
         idx === 2 ? { 0: 5, 1: 5, 2: 5, 3: 4, 4: 5, 5: 4, 6: 5, 7: 4, 8: 5, 9: 4, 10: 5, 11: 5 } :
                     { 0: 5, 1: 4, 2: 4, 3: 5, 4: 5, 5: 4, 6: 4, 7: 5, 8: 4, 9: 5, 10: 4, 11: 4 },
      t: getDynamicT(targetEmpObj.name, targetEmpObj.dept, idx),
      qr: getDynamicQr(targetEmpObj.name, targetEmpObj.dept, idx)
    }));

    const currentQAnswers = evalAnswers[qKey] || {};
    const updatedAnswers = { ...currentQAnswers };

    assessors.forEach((assessorId, idx) => {
      if (assessorId !== targetId) {
        updatedAnswers[assessorId] = {
          ...(updatedAnswers[assessorId] || {}),
          [targetId]: mockFeedbackText[idx]
        };
      }
    });

    const newEvalAnswers = {
      ...evalAnswers,
      [qKey]: updatedAnswers
    };

    setEvalAnswers(newEvalAnswers);

    setAssessList(prev => {
      const updated = { ...prev };
      assessors.forEach(assessorId => {
        if (updated[assessorId]) {
          updated[assessorId] = updated[assessorId].map(item => {
            if (item.id === targetId) {
              return { ...item, status: 'done' as const };
            }
            return item;
          });
        }
      });
      return updated;
    });

    let totalScoreSum = 0;
    let evalCount = 0;
    Object.entries(updatedAnswers).forEach(([assessorId, targetMap]) => {
      const targetAns = (targetMap as any)[targetId];
      if (targetAns) {
        const qVals = Object.values(targetAns.q);
        const avg = qVals.length > 0 ? ((qVals as any[]).reduce((acc: number, c: any) => acc + Number(c), 0) / qVals.length) * 20 : 0;
        if (avg > 0) {
          totalScoreSum += avg;
          evalCount++;
        }
      }
    });
    const final360Avg = evalCount > 0 ? Math.round((totalScoreSum / evalCount) * 10) / 10 : 88.5;

    setScore360(prev => {
      const q360 = (prev as any)[qKey] || {};
      return {
        ...prev,
        [qKey]: {
          ...q360,
          [targetId]: final360Avg
        }
      } as any;
    });

    showToast(`Simulasikan 3 input penilai kompetensi selesai untuk ${targetEmpObj.name} di kuartal ${qKey}!`, 'ok');
  };

  const handleSimulatePartialFeedback = (targetId: string, qKey: string) => {
    const targetEmpObj = ALL_EMPS.find(e => e.id === targetId);
    if (!targetEmpObj) return;

    const assessorId = 'EMP002';
    const singleFeedback = {
      q: { 0: 4, 1: 4, 2: 4, 3: 4, 4: 4, 5: 3, 6: 4, 7: 4, 8: 4, 9: 4, 10: 4, 11: 4 },
      t: getDynamicT(targetEmpObj.name, targetEmpObj.dept, 0),
      qr: getDynamicQr(targetEmpObj.name, targetEmpObj.dept, 0)
    };

    const currentQAnswers = evalAnswers[qKey] || {};
    const updatedAnswers = {
      ...currentQAnswers,
      [assessorId]: {
        ...(currentQAnswers[assessorId] || {}),
        [targetId]: singleFeedback
      }
    };

    ['SPV001', 'HRD001'].forEach(otherId => {
      if (updatedAnswers[otherId] && (updatedAnswers[otherId] as any)[targetId]) {
        delete (updatedAnswers[otherId] as any)[targetId];
      }
    });

    const newEvalAnswers = {
      ...evalAnswers,
      [qKey]: updatedAnswers
    };

    setEvalAnswers(newEvalAnswers);

    setAssessList(prev => {
      const updated = { ...prev };
      if (updated[assessorId]) {
        updated[assessorId] = updated[assessorId].map(item => {
          if (item.id === targetId) return { ...item, status: 'done' as const };
          return item;
        });
      }
      ['SPV001', 'HRD001'].forEach(otherId => {
        if (updated[otherId]) {
          updated[otherId] = updated[otherId].map(item => {
            if (item.id === targetId) return { ...item, status: 'pending' as const };
            return item;
          });
        }
      });
      return updated;
    });

    setScore360(prev => {
      const q360 = (prev as any)[qKey] || {};
      return {
        ...prev,
        [qKey]: {
          ...q360,
          [targetId]: 80.0
        }
      } as any;
    });

    showToast(`Simulasikan 1 input penilai kompetensi selesai untuk ${targetEmpObj.name} di kuartal ${qKey}!`, 'info');
  };

  const handleSimulateSingleRaterFeedback = (targetId: string, qKey: string, raterId: string, raterIdx: number) => {
    const targetEmpObj = ALL_EMPS.find(e => e.id === targetId);
    if (!targetEmpObj) return;

    // Use different score distributions for variety
    const qScores = raterIdx === 1 ? { 0: 5, 1: 5, 2: 4, 3: 5, 4: 5, 5: 5, 6: 4, 7: 5, 8: 4, 9: 5, 10: 5, 11: 5 } : 
                    raterIdx === 2 ? { 0: 5, 1: 5, 2: 5, 3: 4, 4: 5, 5: 4, 6: 5, 7: 4, 8: 5, 9: 4, 10: 5, 11: 5 } :
                                     { 0: 5, 1: 4, 2: 4, 3: 5, 4: 5, 5: 4, 6: 4, 7: 5, 8: 4, 9: 5, 10: 4, 11: 4 };

    const singleFeedback = {
      q: qScores,
      t: getDynamicT(targetEmpObj.name, targetEmpObj.dept, raterIdx),
      qr: getDynamicQr(targetEmpObj.name, targetEmpObj.dept, raterIdx)
    };

    const currentQAnswers = evalAnswers[qKey] || {};
    const updatedAnswers = {
      ...currentQAnswers,
      [raterId]: {
        ...(currentQAnswers[raterId] || {}),
        [targetId]: singleFeedback
      }
    };

    const newEvalAnswers = {
      ...evalAnswers,
      [qKey]: updatedAnswers
    };

    setEvalAnswers(newEvalAnswers);

    setAssessList(prev => {
      const updated = { ...prev };
      if (updated[raterId]) {
        updated[raterId] = updated[raterId].map(item => {
          if (item.id === targetId) return { ...item, status: 'done' as const };
          return item;
        });
      }
      return updated;
    });

    // Recompute score360
    let totalScoreSum = 0;
    let evalCount = 0;
    Object.entries(updatedAnswers).forEach(([assessorId, targetMap]) => {
      const targetAns = (targetMap as any)[targetId];
      if (targetAns) {
        const qVals = Object.values(targetAns.q);
        const avg = qVals.length > 0 ? ((qVals as any[]).reduce((acc: number, c: any) => acc + Number(c), 0) / qVals.length) * 20 : 0;
        if (avg > 0) {
          totalScoreSum += avg;
          evalCount++;
        }
      }
    });
    const final360Avg = evalCount > 0 ? Math.round((totalScoreSum / evalCount) * 10) / 10 : 85.0;

    setScore360(prev => {
      const q360 = (prev as any)[qKey] || {};
      return {
        ...prev,
        [qKey]: {
          ...q360,
          [targetId]: final360Avg
        }
      } as any;
    });

    const raterNameObj = ALL_EMPS.find(u => u.id === raterId) || { name: raterId };
    showToast(`Berhasil mensimulasikan pengiriman dari rater: ${raterNameObj.name} untuk ${targetEmpObj.name}!`, 'ok');
  };

  const handleClearSimulatedFeedback = (targetId: string, qKey: string) => {
    const targetEmpObj = ALL_EMPS.find(e => e.id === targetId);
    if (!targetEmpObj) return;

    const currentQAnswers = evalAnswers[qKey] || {};
    const updatedAnswers = { ...currentQAnswers };

    ['EMP002', 'SPV001', 'HRD001'].forEach(assessorId => {
      if (updatedAnswers[assessorId] && (updatedAnswers[assessorId] as any)[targetId]) {
        delete (updatedAnswers[assessorId] as any)[targetId];
      }
    });

    const newEvalAnswers = {
      ...evalAnswers,
      [qKey]: updatedAnswers
    };

    setEvalAnswers(newEvalAnswers);

    setAssessList(prev => {
      const updated = { ...prev };
      ['EMP002', 'SPV001', 'HRD001'].forEach(assessorId => {
        if (updated[assessorId]) {
          updated[assessorId] = updated[assessorId].map(item => {
            if (item.id === targetId) return { ...item, status: 'pending' as const };
            return item;
          });
        }
      });
      return updated;
    });

    setScore360(prev => {
      const q360 = { ...((prev as any)[qKey] || {}) };
      delete q360[targetId];
      return {
        ...prev,
        [qKey]: q360
      } as any;
    });

    showToast(`Masukan evaluasi untuk ${targetEmpObj.name} di kuartal ${qKey} berhasil dikosongkan.`, 'info');
  };

  const handleToggleSimApproval = (targetId: string, qKey: string, role: 'spv' | 'hrd') => {
    setReportApprovals(prev => {
      const targetUserMap = prev[targetId] || {};
      const targetQObj = targetUserMap[qKey] || { spvApproved: false, hrdApproved: false, spvSignature: '', hrdSignature: '' };
      const nextVal = role === 'spv' ? !targetQObj.spvApproved : !targetQObj.hrdApproved;
      
      const newQObj = {
        ...targetQObj,
        [role === 'spv' ? 'spvApproved' : 'hrdApproved']: nextVal,
        [role === 'spv' ? 'spvSignature' : 'hrdSignature']: nextVal ? (role === 'spv' ? 'SPV_SIG_SIM' : 'HRD_SIG_SIM') : ''
      };

      return {
        ...prev,
        [targetId]: {
          ...targetUserMap,
          [qKey]: newQObj
        }
      };
    });

    showToast(`Status persetujuan ${role.toUpperCase()} untuk ${ALL_EMPS.find(e => e.id === targetId)?.name} berhasil diubah!`, 'ok');
  };

  const handleResetSimulationState = () => {
    localStorage.removeItem('infarm_quarters');
    localStorage.removeItem('infarm_eval_answers');
    localStorage.removeItem('infarm_assess');
    localStorage.removeItem('infarm_score360');
    localStorage.removeItem('infarm_report_approvals');
    localStorage.removeItem('infarm_active_qkey');
    window.location.reload();
  };

  const activePeriodObj = useMemo(() => quarters[activeQuarterKey] || null, [quarters, activeQuarterKey]);

  // --- LOCAL PERSISTENCE ---
  useEffect(() => {
    localStorage.setItem('infarm_quarters', JSON.stringify(quarters));
    localStorage.setItem('infarm_active_qkey', activeQuarterKey);
    localStorage.setItem('infarm_assess', JSON.stringify(assessList));
    localStorage.setItem('infarm_kpihist', JSON.stringify(kpiHist));
    localStorage.setItem('infarm_mappings', JSON.stringify(mappings));
    localStorage.setItem('infarm_score360', JSON.stringify(score360));
    localStorage.setItem('infarm_custom_qquant', JSON.stringify(customQQuant));
    localStorage.setItem('infarm_custom_qqual', JSON.stringify(customQQual));
    localStorage.setItem('infarm_eval_answers', JSON.stringify(evalAnswers));
    localStorage.setItem('infarm_all_users_list', JSON.stringify(allUsersList));
    localStorage.setItem('infarm_promotions', JSON.stringify(promotions));
    localStorage.setItem('infarm_report_approvals', JSON.stringify(reportApprovals));
    localStorage.setItem('infarm_relation_requests', JSON.stringify(relationRequests));
    localStorage.setItem('infarm_weighting_mode', weightingMode);
    localStorage.setItem('infarm_rater_weights', JSON.stringify(raterWeights));
    if (currentUser) {
      localStorage.setItem('infarm_curuser', JSON.stringify(currentUser));
    } else {
      localStorage.removeItem('infarm_curuser');
    }
  }, [currentUser, quarters, activeQuarterKey, assessList, kpiHist, mappings, score360, customQQuant, customQQual, evalAnswers, allUsersList, promotions, reportApprovals, relationRequests, weightingMode, raterWeights]);

  // Reset performance monitor selections when page or active user changes to prevent cross-scope leakages
  useEffect(() => {
    setSelChartDept('all');
    setSelChartEmpId('all');
  }, [activeUser, page]);

  // --- HELPERS ---
  const showToast = (msg: string, type: 'ok' | 'err' | 'info' = 'ok') => {
    const id = Date.now().toString();
    setToasts(prev => [...prev, { id, msg, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3200);
  };

  const getEmpDept = (id: string) => {
    return ALL_EMPS.find(e => e.id === id)?.dept || '-';
  };

  const getPlansForScore = (score: number | null): string[] => {
    if (score === null) {
      return [
        'Lengkapi Nilai Dahulu / Belum Ditentukan',
        'Pelatihan & Pendampingan Tambahan (Skill Development)',
        'Mutasi Antar-Divisi Sekelas',
        'Program Pembinaan Kinerja Intensif (Performance Improvement Plan / PIP)'
      ];
    }
    if (score >= 90) {
      return [
        'Promosi Ke Jabatan Lebih Tinggi (Senior / Lead)',
        'Rencana Suksesi Manajemen Masa Depan (High Talent Pool)',
        'Fast-Track Kenaikan Grade Utama',
        'Penyesuaian Skema Kompensasi & Gaji Istimewa'
      ];
    }
    if (score >= 80) {
      return [
        'Kenaikan Grade / Tingkat Golongan Reguler',
        'Peningkatan Tanggung Jawab (Dual Role)',
        'Penyesuaian Skema Kompensasi & Gaji',
        'Mutasi Antar-Divisi Sekelas'
      ];
    }
    if (score >= 65) {
      return [
        'Pelatihan & Pendampingan Tambahan (Skill Development)',
        'Mutasi Antar-Divisi Sekelas',
        'Rencana Pemantauan Kinerja Kwartal Depan'
      ];
    }
    return [
      'Program Pembinaan Kinerja Intensif (Performance Improvement Plan / PIP)',
      'Penangguhan Promosi & Penyesuaian',
      'Evaluasi Ulang Peran Kerja (Demosi/Mutasi Binaan)',
      'Konseling & Pelatihan Kompetensi Dasar'
    ];
  };

  const getEmpName = (id: string) => {
    return ALL_EMPS.find(e => e.id === id)?.name || id;
  };

  const getSpvNameForEmp = (empId: string): string => {
    const spvIds = Object.entries(SPV_TEAMS)
      .filter(([_, emps]) => emps.includes(empId))
      .map(([spvId]) => spvId);
    
    if (spvIds.length === 0) return 'Tidak ada SPV';
    return spvIds.map(spvId => ALL_EMPS.find(u => u.id === spvId)?.name || spvId).join(', ');
  };

  const getCompiledEvaluationsForTarget = (targetId: string, qKey: string = activeQuarterKey) => {
    const results: Array<{ assessorName: string; q: Record<number, number>; t: Record<number, string>; qr?: Record<number, string> }> = [];
    const qAnswers = evalAnswers[qKey] || {};
    Object.entries(qAnswers).forEach(([assessorId, targetMap]) => {
      const targetAns = (targetMap as any)[targetId];
      if (targetAns) {
        const assessor = ALL_EMPS.find(e => e.id === assessorId) || allUsersList.find(u => u.id === assessorId);
        const nameLabel = assessor 
          ? (assessor.id === targetId ? `${assessor.name} (Evaluasi Diri)` : assessor.name) 
          : assessorId;
        results.push({
          assessorName: nameLabel,
          q: targetAns.q,
          t: targetAns.t,
          qr: targetAns.qr
        });
      }
    });
    return results;
  };

  const getUserRoleLabel = (role: string) => {
    switch (role) {
      case 'employee': return 'Pegawai Operasional';
      case 'spv': return 'Supervisor (SPV)';
      case 'hrd': return 'HRD Admin';
      case 'direksi': return 'Direktur';
      default: return role;
    }
  };

  const getLatestKpiScoreVal = (eid: string, monthKey: string): number | null => {
    const subHist = kpiHist[eid]?.[monthKey];
    if (subHist && subHist.length > 0) {
      return subHist[subHist.length - 1].score;
    }
    return null;
  };

  const getQuarterKpiAverage = (eid: string, qKey: string): number | null => {
    const qObj = quarters[qKey];
    if (!qObj) return null;
    const scores = qObj.months.map(m => getLatestKpiScoreVal(eid, m)).filter((val): val is number => val !== null);
    if (scores.length === 0) return null;
    return scores.reduce((acc, cr) => acc + cr, 0) / scores.length;
  };

  const getComputedFinalScore = (eid: string, qKey: string): number | null => {
    const qObj = quarters[qKey];
    if (!qObj) return null;
    const kpiAvg = getQuarterKpiAverage(eid, qKey);
    if (kpiAvg === null) return null;
    let base: number;
    if (!qObj.has360) {
      base = kpiAvg; // pure KPI rating if 360 is turned off
    } else {
      const score360Val = getScore360ForQuarter(eid, qKey);
      base = score360Val === null ? kpiAvg : (kpiAvg * 0.5) + (score360Val * 0.5);
    }
    // Punishment kepatuhan (per kuartal): kurangi poin, jaga tidak negatif.
    return Math.max(0, base - getPenalty(eid, qKey));
  };

  // --- DYNAMIC FILTERING & SCORE CALCULATIONS FOR ANALYTICS ---
  const getFilteredQuarterKeys = (): string[] => {
    return Object.keys(quarters).filter(qKey => {
      const qObj = quarters[qKey];
      if (!qObj) return false;
      const yearOfQ = qKey.split('-')[1]; // e.g. '2026'
      if (filterYear !== 'Semua' && yearOfQ !== filterYear) {
        return false;
      }
      const quarterOfQ = qKey.split('-')[0]; // e.g. 'Q3'
      if (filterQuarter !== 'Semua' && quarterOfQ !== filterQuarter) {
        return false;
      }
      return true;
    });
  };

  const getFilteredMonths = (): string[] => {
    const qKeys = getFilteredQuarterKeys();
    const monthsSet = new Set<string>();
    qKeys.forEach(qKey => {
      const qObj = quarters[qKey];
      if (qObj) {
        qObj.months.forEach(m => monthsSet.add(m));
      }
    });
    
    const contextMonths = Array.from(monthsSet).sort();
    if (filterMonth !== 'Semua') {
      if (contextMonths.includes(filterMonth)) {
        return [filterMonth];
      } else {
        return [];
      }
    }
    return contextMonths;
  };

  const getMonthOptionsInContext = () => {
    let availableQuarters = Object.keys(quarters);
    if (filterYear !== 'Semua') {
      availableQuarters = availableQuarters.filter(q => q.endsWith(filterYear));
    }
    if (filterQuarter !== 'Semua') {
      availableQuarters = availableQuarters.filter(q => q.startsWith(filterQuarter));
    }
    const monthsSet = new Set<string>();
    availableQuarters.forEach(q => {
      quarters[q]?.months.forEach(m => monthsSet.add(m));
    });
    return Array.from(monthsSet).sort();
  };

  const getFilteredKpiAverage = (eid: string): number | null => {
    const targetMonths = getFilteredMonths();
    if (targetMonths.length === 0) return null;
    const scores = targetMonths.map(m => getLatestKpiScoreVal(eid, m)).filter((val): val is number => val !== null);
    if (scores.length === 0) return null;
    return scores.reduce((acc, cr) => acc + cr, 0) / scores.length;
  };

  const getFilteredFinalScore = (eid: string): number | null => {
    const kpiAvg = getFilteredKpiAverage(eid);
    if (kpiAvg === null) return null;
    
    // Check if 360 is active in some filtered period
    const qKeys = getFilteredQuarterKeys();
    const anyQHas360 = qKeys.some(qKey => quarters[qKey]?.has360);
    
    const penalty = getPenalty(eid, qKeys[0] || activeQuarterKey);
    if (!anyQHas360) {
      return Math.max(0, kpiAvg - penalty); // pure KPI rating if 360 is turned off
    }
    const score360Val = getScore360ForQuarter(eid, qKeys[0] || activeQuarterKey) ?? INITIAL_SCORE_360[eid] ?? null;
    if (score360Val === null) return Math.max(0, kpiAvg - penalty);
    return Math.max(0, (kpiAvg * 0.5) + (score360Val * 0.5) - penalty);
  };

  const getFilteredDeptScores = (): [string, number][] => {
    const activeEmps = ALL_EMPS.filter(emp => {
      if (filterDivision !== 'Semua' && emp.dept !== filterDivision) return false;
      return true;
    });
    const depts = Array.from(new Set(activeEmps.map(e => e.dept)));
    const scores = depts.map(d => {
      const deptEmps = activeEmps.filter(e => e.dept === d);
      const sVals = deptEmps.map(emp => getFilteredFinalScore(emp.id)).filter((s): s is number => s !== null);
      const avg = sVals.length > 0 ? (sVals.reduce((a, b) => a + b, 0) / sVals.length) : 0;
      return [d, Math.round(avg * 10) / 10] as [string, number];
    });
    return scores.sort((a, b) => b[1] - a[1]);
  };

  const getFilteredCategories = () => {
    const activeEmps = ALL_EMPS.filter(emp => {
      if (filterDivision !== 'Semua' && emp.dept !== filterDivision) return false;
      return true;
    });
    let melampaui = 0;
    let memenuhi = 0;
    let perlu = 0;
    let diBawah = 0;
    
    activeEmps.forEach(emp => {
      const score = getFilteredFinalScore(emp.id);
      if (score !== null) {
        if (score >= 90) melampaui++;
        else if (score >= 80) memenuhi++;
        else if (score >= 70) perlu++;
        else diBawah++;
      }
    });
    
    return [
      { label: 'Melampaui Ekspektasi (Skor ≥ 90)', count: melampaui, color: '#10B981' },
      { label: 'Memenuhi Ekspektasi (Skor 80 - 89)', count: memenuhi, color: '#3B82F6' },
      { label: 'Perlu Peningkatan (Skor 70 - 79)', count: perlu, color: '#F59E0B' },
      { label: 'Di Bawah Ekspektasi (Skor < 70)', count: diBawah, color: '#EF4444' }
    ];
  };

  const getFilteredRecommendations = () => {
    const activeEmps = ALL_EMPS.filter(emp => {
      if (filterDivision !== 'Semua' && emp.dept !== filterDivision) return false;
      return true;
    });
    let promosi = 0;
    let pertahankan = 0;
    let workshop = 0;
    let insentif = 0;
    
    activeEmps.forEach(emp => {
      const score = getFilteredFinalScore(emp.id);
      if (score !== null) {
        if (score >= 90) promosi++;
        else if (score >= 80) pertahankan++;
        else if (score >= 70) workshop++;
        else insentif++;
      }
    });
    
    return [
      { label: 'Promosi Akselerasi Jabatan', count: promosi, color: '#047857' },
      { label: 'Pertahankan Posisi & Jalur Bonus', count: pertahankan, color: '#0284C7' },
      { label: 'Program Workshop & Intervensi', count: workshop, color: '#D97706' },
      { label: 'Pelatihan Intensif Mutu', count: insentif, color: '#DC2626' }
    ];
  };

  // Synchronize selQAnalytics with year and quarter selection
  useEffect(() => {
    if (filterQuarter !== 'Semua' && filterYear !== 'Semua') {
      const key = `${filterQuarter}-${filterYear}`;
      if (quarters[key]) {
        setSelQAnalytics(key);
      }
    }
  }, [filterYear, filterQuarter, quarters]);

  const getSuggestedRelasi = (penilaiId: string, targetId: string): string => {
    if (!penilaiId || !targetId) return 'Peer';
    if (penilaiId === targetId) return 'Self Assessment';

    const penilai = allUsersList.find(u => u.id === penilaiId) || INITIAL_USERS.find(u => u.id === penilaiId);
    const target = allUsersList.find(u => u.id === targetId) || INITIAL_USERS.find(u => u.id === targetId);
    if (!penilai || !target) return 'Peer';

    // Cross kalau penilaian dari beda Divisi
    if (penilai.dept.toLowerCase() !== target.dept.toLowerCase()) {
      return 'Cross';
    }

    // Atasan kalau SPV -> Employee atau Direksi -> SPV
    if ((penilai.role === 'spv' && target.role === 'employee') || (penilai.role === 'direksi' && target.role === 'spv')) {
      return 'Atasan';
    }

    // Bawahan kalau sebaliknya dari Atasan (Employee -> SPV atau SPV -> Direksi)
    if ((penilai.role === 'employee' && target.role === 'spv') || (penilai.role === 'spv' && target.role === 'direksi')) {
      return 'Bawahan';
    }

    // Peer jadi Employee -> Employee
    if (penilai.role === 'employee' && target.role === 'employee') {
      return 'Peer';
    }

    return 'Peer';
  };

  const getGarisHubungan = (penilaiId: string, targetId: string): string => {
    if (!penilaiId || !targetId) return 'Employee → Employee';
    if (penilaiId === targetId) return 'Self Assessment';

    const penilai = allUsersList.find(u => u.id === penilaiId) || INITIAL_USERS.find(u => u.id === penilaiId);
    const target = allUsersList.find(u => u.id === targetId) || INITIAL_USERS.find(u => u.id === targetId);
    if (!penilai || !target) return 'Employee → Employee';

    const pRole = penilai.role;
    const tRole = target.role;

    const getRoleStr = (r: string): string => {
      if (r === 'employee') return 'Employee';
      if (r === 'spv') return 'SPV';
      if (r === 'direksi') return 'Direksi';
      if (r === 'hrd') return 'HRD';
      return r.charAt(0).toUpperCase() + r.slice(1);
    };

    // Cross kalau penilaian dari beda Divisi
    if (penilai.dept.toLowerCase() !== target.dept.toLowerCase()) {
      return `${getRoleStr(pRole)} (${penilai.dept}) → ${getRoleStr(tRole)} (${target.dept})`;
    }

    // Atasan kalau SPV -> Employee atau Direksi -> SPV
    if ((pRole === 'spv' && tRole === 'employee') || (pRole === 'direksi' && tRole === 'spv')) {
      return pRole === 'spv' ? 'SPV → Employee' : 'Direksi → SPV';
    }

    // Bawahan kalau sebaliknya dari Atasan (Employee -> SPV atau SPV -> Direksi)
    if ((pRole === 'employee' && tRole === 'spv') || (pRole === 'spv' && tRole === 'direksi')) {
      return pRole === 'employee' ? 'Employee → SPV' : 'SPV → Direksi';
    }

    // Peer jadi Employee -> Employee
    if (pRole === 'employee' && tRole === 'employee') {
      return 'Employee → Employee';
    }

    return `${getRoleStr(pRole)} → ${getRoleStr(tRole)}`;
  };

  const getRelationLabel = (penilaiId: string, yangDinilaiId: string): string => {
    if (penilaiId === yangDinilaiId) return 'Self Assessment';
    return getSuggestedRelasi(penilaiId, yangDinilaiId);
  };

  const catLabel = (score: number | null): string => {
    if (score === null) return 'Belum Ternilai';
    if (score >= 90) return 'Melampaui Ekspektasi';
    if (score >= 80) return 'Memenuhi Ekspektasi';
    if (score >= 70) return 'Perlu Peningkatan';
    return 'Di Bawah Ekspektasi';
  };

  const getCatBadge = (score: number | null) => {
    if (score === null) return <span className="bg-gray-100 text-gray-400 text-[10px] font-bold px-2 py-0.5 rounded-full border border-gray-150">N/A</span>;
    if (score >= 90) return <span className="bg-emerald-50 text-emerald-800 text-[10px] font-bold px-2.5 py-0.5 rounded-full border border-emerald-200">Melampaui Ekspektasi</span>;
    if (score >= 80) return <span className="bg-blue-50 text-blue-800 text-[10px] font-bold px-2.5 py-0.5 rounded-full border border-blue-200">Memenuhi Ekspektasi</span>;
    if (score >= 70) return <span className="bg-amber-50 text-amber-800 text-[10px] font-bold px-2.5 py-0.5 rounded-full border border-amber-200">Perlu Peningkatan</span>;
    return <span className="bg-rose-50 text-rose-800 text-[10px] font-bold px-2.5 py-0.5 rounded-full border border-rose-200">Di Bawah Ekspektasi</span>;
  };

  const isPeriodLocked = () => {
    return activePeriodObj ? activePeriodObj.status === 'ended' : true;
  };

  // --- ACTIONS ---
  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginRole || !loginUserId) {
      showToast('Pilih peran dan ID Pegawai Anda telebih dahulu.', 'err');
      return;
    }
    if (loginPassword !== 'Infarm@2026') {
      showToast('Sandi demo salah. Silakan gunakan password: Infarm@2026', 'err');
      return;
    }

    const matchedUser = INITIAL_USERS.find(user => user.id === loginUserId && user.role === loginRole);
    if (!matchedUser) {
      showToast('Hubungan ID dan Peran tidak berlaku.', 'err');
      return;
    }

    setCurrentUser(matchedUser);
    showToast(`Berhasil login sebagai ${matchedUser.name}!`, 'ok');

    // Default routes based on role
    if (matchedUser.role === 'hrd') {
      setPage('review');
    } else if (matchedUser.role === 'direksi') {
      setPage('analytics');
    } else {
      setPage('assess');
    }
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setLoginRole('');
    setLoginUserId('');
    setActiveFormTarget(null);
    setSelectedReviewEmpId(null);
    setExpandedTeamEmpId(null);
    showToast('Sesi Anda berakhir. Sampai jumpa kembali!', 'info');
  };

  const handleSubmitEvaluation = (
    answers: { q: Record<number, number>; t: Record<number, string>; qr?: Record<number, string> },
    isDraft: boolean = false
  ) => {
    if (!currentUser || !activeFormTarget) return;

    // Save actual answer content first — DI BAWAH kuartal aktif agar terbaca oleh
    // Review Hasil Akhir / kompilasi yang memakai evalAnswers[quarterKey][penilai][target].
    const quarterEntry = evalAnswers[activeQuarterKey] || {};
    const newEvalAnswers = {
      ...evalAnswers,
      [activeQuarterKey]: {
        ...quarterEntry,
        [currentUser.id]: {
          ...(quarterEntry[currentUser.id] || {}),
          [activeFormTarget.id]: answers
        }
      }
    };
    setEvalAnswers(newEvalAnswers);

    const targetStatus = isDraft ? ('draft' as const) : ('done' as const);

    // Update status evaluation in local state (handle self evaluation dynamically)
    setAssessList(prev => {
      const userAssessList = prev[currentUser.id] || [];
      const exists = userAssessList.some(item => item.id === activeFormTarget.id);
      let updated;
      if (exists) {
        updated = userAssessList.map(item => {
          if (item.id === activeFormTarget.id) {
            return { ...item, status: targetStatus };
          }
          return item;
        });
      } else {
        updated = [
          ...userAssessList,
          { id: activeFormTarget.id, name: activeFormTarget.name, status: targetStatus }
        ];
      }
      return { ...prev, [currentUser.id]: updated };
    });

    // Compute active quantitative average across ALL evaluators contributing to activeFormTarget.id
    let totalScoreSum = 0;
    let evalCount = 0;

    Object.entries(newEvalAnswers).forEach(([assessorId, targetMap]) => {
      const targetAns = targetMap[activeFormTarget.id];
      const assessorTasks = assessList[assessorId] || [];
      const currentTaskStatus = assessorId === currentUser.id
        ? targetStatus
        : (assessorTasks.find(t => t.id === activeFormTarget.id)?.status || 'pending');

      if (targetAns && currentTaskStatus === 'done') {
        const qVals = Object.values(targetAns.q);
        const avg = qVals.length > 0 ? ((qVals as any[]).reduce((acc: number, c: any) => acc + Number(c), 0) / qVals.length) * 20 : 85;
        totalScoreSum += avg;
        evalCount++;
      }
    });

    const final360Avg = evalCount > 0 ? Math.round((totalScoreSum / evalCount) * 10) / 10 : 85;

    setScore360(prev => ({
      ...prev,
      [activeFormTarget.id]: final360Avg
    }));

    if (isDraft) {
      showToast(`Kemajuan penilaian (draf) untuk ${activeFormTarget.name} berhasil disimpan sementara!`, 'ok');
    } else {
      showToast(`Penilaian kompetensi 360° untuk ${activeFormTarget.name} berhasil dikirim!`, 'ok');
    }
    setActiveFormTarget(null);
  };

  const updatePromotionValue = (empId: string, field: 'targetPlan' | 'status' | 'notes', value: string) => {
    setPromotions(prev => {
      const existing = prev[empId] || { targetPlan: 'Promosi Ke Jabatan Lebih Tinggi (Senior / Lead)', status: 'pending', notes: '' };
      return {
        ...prev,
        [empId]: {
          ...existing,
          [field]: value
        }
      };
    });
  };

  const handleAddAdhocAssess = () => {
    if (!activeUser || !adhocTargetEmpId) return;
    const targetUser = ALL_EMPS.find(u => u.id === adhocTargetEmpId);
    if (!targetUser) return;

    // Check if already exists in the list
    const currList = assessList[activeUser.id] || [];
    if (currList.some(e => e.id === targetUser.id)) {
      showToast('Karyawan tersebut sudah ada dalam daftar Anda.', 'err');
      return;
    }

    const newItem = { id: targetUser.id, name: targetUser.name, status: 'pending' as const };
    setAssessList(prev => ({
      ...prev,
      [activeUser.id]: [...currList, newItem]
    }));

    showToast(`Berhasil menambahkan ${targetUser.name} ke Daftar Penilaian Anda.`, 'ok');
    setAdhocTargetEmpId('');
  };

  const handleSaveKpiMonth = () => {
    if (!activeUser) return;
    const supervisees = (activeUser && activeUser.role === 'spv') ? [activeUser.id, ...activeSupervisees] : activeSupervisees;
    let savedCount = 0;

    supervisees.forEach(eid => {
      const inputVal = kpiInputScores[eid];
      if (inputVal === undefined || inputVal.trim() === '') return;

      const numScore = parseFloat(inputVal);
      if (isNaN(numScore) || numScore < 0 || numScore > 100) {
        showToast(`Evaluasi skor untuk ${getEmpName(eid)} harus dalam batas 0 s/d 100.`, 'err');
        return;
      }

      const note = kpiInputNotes[eid] || (eid === activeUser.id ? 'Input Mandiri KPI Supervisor' : 'Update via Evaluasi Supervisor');

      // Insert new kpi history item
      setKpiHist(prev => {
        const empHistory = prev[eid] || {};
        const monthHistory = empHistory[selMonth] || [];
        
        const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 16);
        const newItem = {
          score: numScore,
          by: activeUser.id,
          ts: timestamp,
          note
        };

        const updatedMonth = [...monthHistory, newItem];
        return {
          ...prev,
          [eid]: {
            ...empHistory,
            [selMonth]: updatedMonth
          }
        };
      });

      savedCount++;
    });

    if (savedCount > 0) {
      showToast(`${savedCount} data evaluasi KPI performa disimpan dengan riwayat ter-audit.`, 'ok');
      setKpiInputScores({});
      setKpiInputNotes({});
    } else {
      showToast('Tidak ada perubahan KPI bulanan yang valid untuk disimpan.', 'info');
    }
  };

  const handleSimulateExcelUpload = (fileNameWithExtension: string) => {
    setKpiExcelUploading(true);
    setTimeout(() => {
      setKpiExcelUploading(false);
      setKpiExcelFile(fileNameWithExtension);
      showToast(`Berkas ${fileNameWithExtension} berhasil didecode dan diverifikasi!`, 'ok');
    }, 900);
  };

  const handleApplyExcelData = () => {
    if (!kpiExcelFile) return;
    
    // Custom scores matching supervisees
    const simulatedScores: Record<string, string> = {
      'EMP001': '94.5',
      'EMP002': '88.0',
      'EMP003': '91.0',
      'EMP004': '84.5',
      'EMP005': '87.0'
    };
    if (activeUser && activeUser.role === 'spv') {
      simulatedScores[activeUser.id] = '92.5';
    }
    
    const simulatedNotes: Record<string, string> = {
      'EMP001': 'Dihitung dari ' + kpiExcelFile + ' - Absensi KPI 100% & Capaian Output 95%',
      'EMP002': 'Dihitung dari ' + kpiExcelFile + ' - Capaian Output 88%',
      'EMP003': 'Dihitung dari ' + kpiExcelFile + ' - Absensi KPI 98% & Capaian Output 90%',
      'EMP004': 'Dihitung dari ' + kpiExcelFile + ' - Absensi KPI 95%',
      'EMP005': 'Dihitung dari ' + kpiExcelFile + ' - Capaian Output 85%'
    };
    if (activeUser && activeUser.role === 'spv') {
      simulatedNotes[activeUser.id] = 'Dihitung dari ' + kpiExcelFile + ' - Capaian Mandiri SPV';
    }

    setKpiInputScores(prev => ({ ...prev, ...simulatedScores }));
    setKpiInputNotes(prev => ({ ...prev, ...simulatedNotes }));
    setKpiInputMode('manual');
    setKpiExcelFile(null);
    showToast('Data Excel KPI berhasil diimpor ke grid manual! Silakan periksa kembali dan klik Simpan Semua Skor.', 'ok');
  };

  // HRD Period Toggle (Modified for Requirement 3: "tetap ada set tanggal untuk Selesai")
  const handleTogglePeriodActive = (forceEndDate?: any) => {
    const validatedEndDate = (typeof forceEndDate === 'string') ? forceEndDate : undefined;
    setQuarters(prev => {
      const activeObj = prev[activeQuarterKey];
      if (!activeObj) return prev;
      const nextStatus = activeObj.status === 'active' ? 'ended' : 'active';
      return {
        ...prev,
        [activeQuarterKey]: {
          ...activeObj,
          status: nextStatus,
          end: validatedEndDate || activeObj.end
        }
      };
    });
    showToast(`Status kuartal periodik berhasil dialihkan.`, 'info');
  };

  const handleCreateNewQuarter = (label: string, months: string[], has360: boolean, start?: string, end?: string) => {
    const nextKey = `Q${Object.keys(quarters).length + 1}-25/26`;
    setQuarters(prev => ({
      ...prev,
      [nextKey]: {
        status: 'active',
        label,
        start: start || '2026-07-01',
        end: end || '2026-09-30',
        has360,
        months
      }
    }));
    setActiveQuarterKey(nextKey);
    showToast(`Siklus periodik baru ${label} diluncurkan!`, 'ok');
  };

  // Sifat penilaian (wajib/opsional) bersumber dari Mapping; default 'wajib'.
  const getSifatForPair = (penilaiId: string, targetId: string): 'wajib' | 'opsional' => {
    const m = mappings.find(mp => mp.penilaiId === penilaiId && mp.yangDinilaiId === targetId);
    return m?.sifat === 'opsional' ? 'opsional' : 'wajib';
  };
  const sifatBadgeClass = (sifat: 'wajib' | 'opsional') =>
    sifat === 'opsional'
      ? 'bg-slate-100 text-slate-600 border-slate-200'
      : 'bg-rose-50 text-rose-700 border-rose-200';

  // Mapping Admin actions
  const handleAddMapping = () => {
    if (!mappingInputPenilai || !mappingInputDinilai) {
      showToast('Pilih penilai dan target terlebih dahulu.', 'err');
      return;
    }
    if (mappingInputPenilai === mappingInputDinilai && mappingInputRelasi !== 'Self Assessment') {
      showToast('Penilai tidak diperkenankan sama dengan yang dinilai (kecuali untuk Self Assessment).', 'err');
      return;
    }

    const penilaiUser = INITIAL_USERS.find(e => e.id === mappingInputPenilai);
    const dinilaiUser = INITIAL_USERS.find(e => e.id === mappingInputDinilai);

    if (!penilaiUser || !dinilaiUser) return;

    const newMap: Mapping = {
      id: `M_NEW_${Date.now()}`,
      penilaiId: penilaiUser.id,
      penilaiName: penilaiUser.name,
      yangDinilaiId: dinilaiUser.id,
      yangDinilaiName: dinilaiUser.name,
      relasi: mappingInputRelasi,
      sifat: mappingInputSifat
    };

    setMappings(prev => [...prev, newMap]);
    showToast(`Hubungan evaluasi ${penilaiUser.name} → ${dinilaiUser.name} (${mappingInputRelasi} · ${mappingInputSifat}) berhasil ditambahkan!`, 'ok');
    setMappingInputPenilai('');
    setMappingInputDinilai('');
    setMappingInputSifat('wajib');
  };

  const handleRemoveMapping = (mapId: string) => {
    setMappings(prev => prev.filter(m => m.id !== mapId));
    showToast('Mapping penjadwalan penilaian dihapus.', 'info');
  };

  const simulateExcelUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setExcelUploading(true);
    setExcelFile(file.name);

    setTimeout(() => {
      setExcelUploading(false);
      showToast('File Excel berhasil diurai. 47 data pemetaan tim baru ditambahkan!', 'ok');
    }, 1800);
  };

  // Finalize document action
  const handleFinalizeReportFromHR = (eid: string) => {
    setReportApprovals(prev => {
      const outer = { ...prev };
      if (!outer[eid]) {
        outer[eid] = {};
      }
      const inner = { ...outer[eid] };
      const current = inner[selQReview] || { spvApproved: false, hrdApproved: false };
      inner[selQReview] = { ...current, hrdApproved: true };
      outer[eid] = inner;
      return outer;
    });
    showToast(`Laporan penilaian kerja ${getEmpName(eid)} berhasil terverifikasi & difinalisasi!`, 'ok');
    setSelectedReviewEmpId(null);
  };

  // Pre-load current users list based on selected login role
  const loginFilteredUsers = useMemo(() => {
    if (!loginRole) return [];
    return INITIAL_USERS.filter(u => u.role === loginRole);
  }, [loginRole]);

  // General Filter for Employee list inside review / dashboard
  const filteredEmployeesList = useMemo(() => {
    return ALL_EMPS.filter(e => {
      const matchSearch = e.name.toLowerCase().includes(searchQuery.toLowerCase()) || e.dept.toLowerCase().includes(searchQuery.toLowerCase());
      return matchSearch;
    });
  }, [searchQuery]);

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col font-sans select-none antialiased">
      
      {/* Toast Alert stack bar */}
      <div className="fixed top-4 right-4 z-50 space-y-2 pointer-events-none">
        {toasts.map(t => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, x: 50, y: -10 }}
            animate={{ opacity: 1, x: 0, y: 0 }}
            exit={{ opacity: 0, x: 30 }}
            className={`px-4 py-3 rounded-xl shadow-lg flex items-center gap-2.5 text-xs font-bold bg-white text-gray-800 border-l-4 border-l-solid ${
              t.type === 'ok' ? 'border-emerald-600' : t.type === 'err' ? 'border-red-600' : 'border-blue-600'
            }`}
          >
            <span>{t.type === 'ok' ? '✅' : t.type === 'err' ? '❌' : 'ℹ️'}</span>
            <span>{t.msg}</span>
          </motion.div>
        ))}
      </div>

      {/* Login Page Layout */}
      {!currentUser ? (
        <div className="flex-1 flex items-center justify-center py-10 px-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-md bg-white border border-gray-200 shadow-xl rounded-2xl p-6 sm:p-8"
          >
            <div className="text-center space-y-2 mb-6">
              <div className="mx-auto w-14 h-14 bg-emerald-800 text-white flex items-center justify-center rounded-2xl shadow-md">
                <Building className="w-8 h-8" />
              </div>
              <h2 className="text-xl font-extrabold text-emerald-950 tracking-tight">Infarm 360° Portal</h2>
              <p className="text-xs text-gray-400 font-medium">Sistem Penilaian Kompetensi & KPI Organisasi Modern</p>
            </div>

            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-[11px] font-bold text-gray-400 uppercase mb-1">Pilih Peran Anggota</label>
                <select
                  value={loginRole}
                  onChange={(e) => {
                    setLoginRole(e.target.value);
                    setLoginUserId('');
                  }}
                  className="w-full text-xs p-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-600/10 focus:border-emerald-700 bg-white"
                >
                  <option value="">-- Pilih Peran --</option>
                  <option value="employee">Pegawai Mandiri (Employee)</option>
                  <option value="spv">Koordinator Supervisor (SPV)</option>
                  <option value="hrd">HRD Administrator (HRD)</option>
                  <option value="direksi">Jajaran Eksekutif/Direksi (DIR)</option>
                </select>
              </div>

              {loginRole && (
                <motion.div
                  initial={{ opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <label className="block text-[11px] font-bold text-gray-400 uppercase mb-1">Nama / ID Pegawai</label>
                  <select
                    value={loginUserId}
                    onChange={(e) => setLoginUserId(e.target.value)}
                    className="w-full text-xs p-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-600/10 focus:border-emerald-700 bg-white"
                  >
                    <option value="">-- Pilih Nama Pegawai --</option>
                    {loginFilteredUsers.map(u => (
                      <option key={u.id} value={u.id}>
                        {u.id} — {u.name} ({u.dept})
                      </option>
                    ))}
                  </select>
                </motion.div>
              )}

              <div>
                <label className="block text-[11px] font-bold text-gray-400 uppercase mb-1">Verifikasi Akses Mandiri</label>
                <input
                  type="password"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="Password akses demo"
                  className="w-full text-xs p-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-600/10 focus:border-emerald-700"
                />
              </div>

              <div className="bg-emerald-50 text-emerald-800 p-3 rounded-xl text-[10px] leading-relaxed flex items-start gap-2 border border-emerald-100">
                <Info className="w-4 h-4 flex-shrink-0 text-emerald-600" />
                <span>
                  Password simulasi default yaitu <strong>Infarm@2026</strong>. Gunakan data demo yang tersedia untuk menguji bermacam-macam fungsionalitas tim.
                </span>
              </div>

              <button
                type="submit"
                className="w-full bg-emerald-800 hover:bg-emerald-900 border border-emerald-800 text-white py-3 px-4 rounded-xl font-bold text-xs transition-colors shadow-sm cursor-pointer"
              >
                Masuk ke Workspace
              </button>
            </form>
          </motion.div>
        </div>
      ) : (
        /* Inside app Dashboard frame */
        <div className="flex-1 flex flex-col md:flex-row min-h-screen">
          
          {/* Sider bar panel navigation control container */}
          <aside className="w-full md:w-60 bg-white border-r border-gray-200 flex flex-col">
            {/* Top Workspace logo name */}
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-800 text-white flex items-center justify-center font-bold text-md shadow-xs">
                  IF
                </div>
                <div>
                  <h1 className="text-xs font-bold text-emerald-950 tracking-tight leading-none">Infarm 360°</h1>
                  <span className="text-[9px] text-gray-400 font-bold block mt-0.5">Performance Appraisal</span>
                </div>
              </div>
            </div>

            {/* Current user mini session profile info */}
            <div className="p-4 bg-gray-100/60 border-b border-gray-200 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-emerald-800 font-bold text-emerald-50 text-xs flex items-center justify-center uppercase shadow-inner animate-pulse">
                {currentUser.name.split(' ').slice(0, 2).map(n => n[0]).join('')}
              </div>
              <div className="flex-1 overflow-hidden">
                <h4 className="text-xs font-bold text-gray-800 truncate leading-tight">{activeUser?.name}</h4>
                <p className="text-[10px] text-gray-405 truncate font-medium">{getUserRoleLabel(activeUser?.role || '')}</p>
                <p className="text-[9px] font-bold text-emerald-700">{activeUser?.dept} Dept · {activeUser?.id}</p>
              </div>
            </div>

             {/* Simulated SPV Switcher for HRD Admin (Requirement 2) */}
            {currentUser.role === 'hrd' && (
              <div className="mx-2 my-2.5 p-3 bg-indigo-950 text-white rounded-xl border border-indigo-800/60 shadow-md space-y-2">
                <div className="flex items-center gap-1.5 justify-between">
                  <div className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                    <span className="text-[10px] font-bold text-indigo-300 uppercase tracking-wider block">Mode Simulasi Peran</span>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setHrdActingAsSpv(false);
                      setPage('periode');
                      showToast('Beralih ke Pandangan HRD Admin', 'info');
                    }}
                    className={`text-[10px] font-bold py-1.5 px-2 rounded-lg transition-colors ${
                      !hrdActingAsSpv
                        ? 'bg-emerald-800 text-white shadow-2xs'
                        : 'bg-indigo-900/50 text-indigo-200 hover:text-white'
                    }`}
                  >
                    🏢 HRD Admin
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setHrdActingAsSpv(true);
                      setPage('kpi');
                      setKpiTab('input');
                      showToast('Beralih ke Peran Supervisor', 'info');
                    }}
                    className={`text-[10px] font-bold py-1.5 px-2 rounded-lg transition-colors ${
                      hrdActingAsSpv
                        ? 'bg-emerald-800 text-white shadow-2xs'
                        : 'bg-indigo-900/50 text-indigo-200 hover:text-white'
                    }`}
                  >
                    💼 SPV Mode
                  </button>
                </div>
                <div className="text-[9px] text-indigo-300 text-center font-medium mt-1">
                  {hrdActingAsSpv ? 'Bertindak sebagai Supervisor Irma' : 'Mengelola seluruh sistem organisasi'}
                </div>
                
                {/* Quick Period Toggle inside Sidebar simulation panel */}
                <div className="pt-2 border-t border-indigo-900/60 flex flex-col gap-1 text-[10px]">
                  <span className="text-[9px] font-black text-indigo-400 text-left block">Kontrol Siklus Cepat:</span>
                  <div className="flex items-center justify-between gap-1.5 bg-indigo-900/40 p-1.5 rounded-lg text-left">
                    <span className="font-extrabold text-[9px] whitespace-nowrap text-indigo-100">{activePeriodObj?.label}: {activePeriodObj?.status === 'active' ? '🟢 AKTIF' : '🔴 KUNCI'}</span>
                    <button
                      type="button"
                      onClick={() => {
                        handleTogglePeriodActive();
                        showToast(`Status ${activePeriodObj?.label} berhasil diubah!`, 'info');
                      }}
                      className="px-2 py-0.5 rounded bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-[8px] uppercase tracking-wider cursor-pointer font-sans"
                    >
                      Ubah
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Current active period controller indicator banner */}
            <div className="p-3 bg-emerald-50/50 border-b border-gray-150 flex items-center justify-between text-xs text-emerald-950">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${isPeriodLocked() ? 'bg-red-400' : 'bg-green-400 animate-pulse'}`}></span>
                <span className="font-bold text-emerald-900 truncate">
                  {activePeriodObj?.label || 'Kuartal Nonaktif'}
                </span>
              </div>
              <span className="text-[9px] bg-emerald-100 font-bold uppercase py-0.5 px-2 rounded-full border border-emerald-250 shrink-0">
                {activePeriodObj?.status === 'active' ? 'AKTIF' : 'TERKUNCI'}
              </span>
            </div>

            {/* Primary navigation menus */}
            <nav className="p-2 space-y-1 flex-1">
              <div className="text-[9px] font-bold text-gray-400 tracking-wider px-3 py-1 uppercase mb-1">
                Navigasi Utama
              </div>

              {/* Assessment list tab -> HIDE FOR ACTUAL HRD (Requirement 4) */}
              {activeUser?.role !== 'hrd' && (
                <button
                  type="button"
                  onClick={() => {
                    setPage('assess');
                    setActiveFormTarget(null);
                    setSelectedReviewEmpId(null);
                  }}
                  className={`w-full text-left flex items-center justify-between px-3 py-2 rounded-lg text-xs font-bold transition-all ${
                    page === 'assess'
                      ? 'bg-emerald-50 text-emerald-900 shadow-3xs'
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Star className="w-4 h-4 text-emerald-600" />
                    <span>Daftar Penilaian Saya</span>
                  </div>
                  <span className="w-5 h-5 bg-emerald-100 text-emerald-900 text-[10px] font-bold rounded-full flex items-center justify-center">
                    {(assessList[activeUser?.id || ''] || []).filter(a => a.status !== 'done').length}
                  </span>
                </button>
              )}

              {/* Hasil Laporan Saya button (Requirement 10) */}
              {activeUser && activeUser.role !== 'hrd' && activeUser.role !== 'direksi' && (
                <button
                  type="button"
                  onClick={() => {
                    setPage('laporan-saya');
                    setSelectedReviewEmpId(null);
                    setActiveFormTarget(null);
                  }}
                  className={`w-full text-left flex items-center justify-between px-3 py-2 rounded-lg text-xs font-bold transition-all ${
                    page === 'laporan-saya'
                      ? 'bg-emerald-50 text-emerald-900 shadow-3xs'
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-emerald-600 animate-pulse" />
                    <span>Laporan Hasil Saya</span>
                  </div>
                  {reportApprovals[activeUser.id]?.[activeQuarterKey]?.spvApproved &&
                   reportApprovals[activeUser.id]?.[activeQuarterKey]?.hrdApproved ? (
                    <span className="w-2 md:w-2.5 h-2 md:h-2.5 bg-emerald-500 rounded-full" title="Laporan sudah siap / ACC" />
                  ) : (
                    <span className="w-2 md:w-2.5 h-2 md:h-2.5 bg-amber-400 rounded-full" title="Ulasan sedang dimatangkan" />
                  )}
                </button>
              )}

              {/* SPV menus */}
              {activeUser?.role === 'spv' && (
                <>
                  <div className="text-[9px] font-bold text-gray-400 tracking-wider px-3 py-2 uppercase mt-2">
                    Menu Supervisor
                  </div>
                  <button
                    type="button"
                    onClick={() => { setPage('kpi'); setKpiTab('input'); }}
                    className={`w-full text-left flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold transition-all ${
                      page === 'kpi' ? 'bg-emerald-50 text-emerald-900' : 'text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    <Target className="w-4 h-4 text-emerald-600" />
                    <span>Input KPI Anggota</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => { setPage('team'); setExpandedTeamEmpId(null); }}
                    className={`w-full text-left flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold transition-all ${
                      page === 'team' ? 'bg-emerald-50 text-emerald-900' : 'text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    <Users className="w-4 h-4 text-emerald-600" />
                    <span>Laporan Kinerja Tim</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPage('monitor-kinerja')}
                    className={`w-full text-left flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold transition-all ${
                      page === 'monitor-kinerja' ? 'bg-emerald-50 text-emerald-900' : 'text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    <TrendingUp className="w-4 h-4 text-emerald-600" />
                    <span>Monitor Kinerja</span>
                  </button>
                </>
              )}

              {/* HRD menus */}
              {activeUser?.role === 'hrd' && (
                <>
                  <div className="text-[9px] font-bold text-gray-400 tracking-wider px-3 py-2 uppercase mt-2">
                    Menu Administrator
                  </div>
                  <button
                    type="button"
                    onClick={() => setPage('periode')}
                    className={`w-full text-left flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold transition-all ${
                      page === 'periode' ? 'bg-emerald-50 text-emerald-900' : 'text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    <CalendarDays className="w-4 h-4 text-emerald-600" />
                    <span>Kelola Siklus Periode</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPage('kelola-soal')}
                    className={`w-full text-left flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold transition-all ${
                      page === 'kelola-soal' ? 'bg-emerald-50 text-emerald-900' : 'text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    <Sliders className="w-4 h-4 text-emerald-600" />
                    <span>Kelola Pertanyaan</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPage('kelola-bobot')}
                    className={`w-full text-left flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold transition-all ${
                      page === 'kelola-bobot' ? 'bg-emerald-50 text-emerald-900' : 'text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    <Scale className="w-4 h-4 text-emerald-600" />
                    <span>Kelola Bobot Penilai</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPage('kpi-monitor')}
                    className={`w-full text-left flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold transition-all ${
                      page === 'kpi-monitor' ? 'bg-emerald-50 text-emerald-900' : 'text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    <Clock className="w-4 h-4 text-emerald-600" />
                    <span>Monitoring & Audit KPI</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPage('promosi-hub')}
                    className={`w-full text-left flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold transition-all ${
                      page === 'promosi-hub' ? 'bg-emerald-50 text-emerald-900' : 'text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    <Award className="w-4 h-4 text-emerald-600" />
                    <span>Promosi & Penyesuaian</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => { setPage('review'); setSelectedReviewEmpId(null); }}
                    className={`w-full text-left flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold transition-all ${
                      page === 'review' ? 'bg-emerald-50 text-emerald-900' : 'text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    <FileText className="w-4 h-4 text-emerald-600" />
                    <span>Review Hasil Akhir</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPage('mapping')}
                    className={`w-full text-left flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold transition-all ${
                      page === 'mapping' ? 'bg-emerald-50 text-emerald-900' : 'text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    <Layers className="w-4 h-4 text-emerald-600" />
                    <span>Pemetaan (Mapping)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPage('progress-360')}
                    className={`w-full text-left flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold transition-all ${
                      page === 'progress-360' ? 'bg-emerald-50 text-emerald-900' : 'text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    <CheckCircle className="w-4 h-4 text-emerald-600" />
                    <span>Progress 360 Feedback</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPage('kepatuhan')}
                    className={`w-full text-left flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold transition-all ${
                      page === 'kepatuhan' ? 'bg-emerald-50 text-emerald-900' : 'text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    <AlertTriangle className="w-4 h-4 text-rose-500" />
                    <span>Flag Kepatuhan Penilaian</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPage('monitor-kinerja')}
                    className={`w-full text-left flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold transition-all ${
                      page === 'monitor-kinerja' ? 'bg-emerald-50 text-emerald-900' : 'text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    <TrendingUp className="w-4 h-4 text-emerald-600" />
                    <span>Monitor Kinerja</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPage('analytics')}
                    className={`w-full text-left flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold transition-all ${
                      page === 'analytics' ? 'bg-emerald-50 text-emerald-900' : 'text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    <TrendingUp className="w-4 h-4 text-emerald-600" />
                    <span>Dashboard Organisasi</span>
                  </button>
                </>
              )}

              {/* DIREKSI and General Analytics */}
              {(activeUser?.role === 'direksi') && (
                <>
                  <div className="text-[9px] font-bold text-gray-400 tracking-wider px-3 py-2 uppercase mt-2">
                    Menu Eksekutif
                  </div>
                  <button
                    type="button"
                    onClick={() => setPage('analytics')}
                    className={`w-full text-left flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold transition-all ${
                      page === 'analytics' ? 'bg-emerald-50 text-emerald-900' : 'text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    <TrendingUp className="w-4 h-4 text-emerald-600" />
                    <span>Dashboard Eksekutif</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPage('monitor-kinerja')}
                    className={`w-full text-left flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold transition-all ${
                      page === 'monitor-kinerja' ? 'bg-emerald-50 text-emerald-900' : 'text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    <TrendingUp className="w-4 h-4 text-emerald-600" />
                    <span>Monitor Kinerja</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPage('promosi-hub')}
                    className={`w-full text-left flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold transition-all ${
                      page === 'promosi-hub' ? 'bg-emerald-50 text-emerald-900' : 'text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    <Award className="w-4 h-4 text-emerald-600" />
                    <span>Promosi & Penyesuaian</span>
                  </button>
                </>
              )}
            </nav>

            {/* Logout actions bottom banner */}
            <div className="p-3 border-t border-gray-200 bg-gray-50">
              <button
                type="button"
                onClick={handleLogout}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg font-bold text-xs text-rose-700 hover:bg-rose-50 border border-transparent hover:border-rose-100 transition-colors cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
                <span>Logout Sesi Kerja</span>
              </button>
            </div>
          </aside>

          {/* MAIN WORKSHEET VIEW */}
          <main className="flex-1 p-4 md:p-6 space-y-6 overflow-y-auto max-h-screen">
            
            {/* If Form evaluation active */}
            {activeFormTarget ? (
              <FormAssess
                target={activeFormTarget}
                onCancel={() => setActiveFormTarget(null)}
                onSubmit={handleSubmitEvaluation}
                customQQuant={customQQuant}
                customQQual={customQQual}
                initialAnswers={currentUser ? (evalAnswers[activeQuarterKey]?.[currentUser.id]?.[activeFormTarget.id] || null) : null}
              />
            ) : selectedReviewEmpId ? (
              /* If detailed PA doc editor is active for HRD reviewing */
              <PerformanceAppraisalDoc
                emp={ALL_EMPS.find(e => e.id === selectedReviewEmpId)!}
                qk={selQReview}
                quarterLabel={quarters[selQReview]?.label || ''}
                has360={quarters[selQReview]?.has360 || false}
                kpiScore={getQuarterKpiAverage(selectedReviewEmpId, selQReview) || 0}
                s360Score={quarters[selQReview]?.has360 ? (getScore360ForQuarter(selectedReviewEmpId, selQReview) || null) : null}
                finalScore={getComputedFinalScore(selectedReviewEmpId, selQReview)}
                isSpvView={false}
                onClose={() => setSelectedReviewEmpId(null)}
                onFinalize={() => handleFinalizeReportFromHR(selectedReviewEmpId)}
                onSaveDraft={(msg) => showToast(msg, 'ok')}
                customQQuant={customQQuant}
                customQQual={customQQual}
                compiledEvaluations={getCompiledEvaluationsForTarget(selectedReviewEmpId, selQReview)}
                anonymous={true}
                isHrdAdmin={true}
              />
            ) : (
              /* Normal dashboard tabs routing switch */
              <AnimatePresence mode="wait">
                <motion.div
                  key={page}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.15 }}
                  className="space-y-6"
                >
                  {/* TAB 0: LAPORAN HASIL SAYA (PERSONAL REPORT ACC PROCESS) (Requirement 10) */}
                  {page === 'laporan-saya' && activeUser && (() => {
                    const isSpvApproved = reportApprovals[activeUser.id]?.[selQPersonal]?.spvApproved || false;
                    const isHrdApproved = reportApprovals[activeUser.id]?.[selQPersonal]?.hrdApproved || false;
                    const isFullyApproved = isSpvApproved && isHrdApproved;
                    
                    const kpiAvgVal = getQuarterKpiAverage(activeUser.id, selQPersonal);
                    const s365Score = quarters[selQPersonal]?.has360 ? (getScore360ForQuarter(activeUser.id, selQPersonal) ?? null) : null;
                    const finalVal = getComputedFinalScore(activeUser.id, selQPersonal);

                    return (
                      <div className="space-y-4">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                          <div>
                            <h2 className="text-xl font-bold text-gray-800 tracking-tight">Laporan Hasil Kinerja Personal</h2>
                            <span className="text-xs text-gray-400 font-medium">Lihat ringkasan skor fungsional KPI, ulasan perilaku 360° ekosistem kerja, dan IDP pengembangan Anda secara anonim.</span>
                          </div>

                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-gray-600">Pilih Kuartal Acuan:</span>
                            <select
                              value={selQPersonal}
                              onChange={(e) => setSelQPersonal(e.target.value)}
                              className="text-xs p-2.5 border border-gray-250 rounded-lg min-w-[130px] font-bold text-emerald-950 bg-white"
                            >
                              {((Object.entries(quarters) as any) as [string, Period][]).map(([k, o]) => (
                                <option key={k} value={k}>{o.label}</option>
                              ))}
                            </select>
                          </div>
                        </div>

                        {/* Workflow locks representation */}
                        {!isFullyApproved ? (
                          <div className="bg-white border border-gray-150 rounded-3xl p-6 shadow-xs max-w-2xl mx-auto space-y-6">
                            <div className="text-center space-y-2">
                              <div className="w-16 h-16 bg-amber-50 text-amber-600 rounded-full flex items-center justify-center mx-auto text-2xl animate-bounce">
                                🔒
                              </div>
                              <h3 className="text-lg font-bold text-gray-850">Laporan Masih Dikunci</h3>
                              <p className="text-gray-500 text-xs max-w-md mx-auto leading-relaxed">
                                Laporan Kinerja Resmi Kuartal <strong>{quarters[selQPersonal]?.label || selQPersonal}</strong> belum selesai dirilis secara lengkap oleh Supervisor Anda dan HRD Coordinator.
                              </p>
                            </div>

                            <div className="border-t border-gray-100 pt-6 space-y-4 max-w-md mx-auto">
                              <h4 className="text-[10px] font-bold text-gray-400 tracking-wider uppercase text-center mb-3">Workflow Persetujuan</h4>
                              
                              <div className="space-y-6">
                                <div className="flex gap-3">
                                  <div className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-850 text-[10px] font-bold flex items-center justify-center shrink-0">
                                    ✓
                                  </div>
                                  <div>
                                    <h5 className="text-xs font-bold text-gray-700 leading-tight">1. Pengisian KPI Bulanan</h5>
                                    <p className="text-[10px] text-gray-405">Telah diakumulasikan otomatis ke dalam rataan berjalan kuartal.</p>
                                  </div>
                                </div>

                                <div className="flex gap-3">
                                  <div className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-850 text-[10px] font-bold flex items-center justify-center shrink-0">
                                    ✓
                                  </div>
                                  <div>
                                    <h5 className="text-xs font-bold text-gray-700 leading-tight">2. Pengisian Evaluasi Kemitraan 360°</h5>
                                    <p className="text-[10px] text-gray-405">Tanggapan sejawat dan atasan selesai dihimpun.</p>
                                  </div>
                                </div>

                                <div className="flex gap-3">
                                  <div className={`w-6 h-6 rounded-full text-[10px] font-bold flex items-center justify-center shrink-0 ${isSpvApproved ? 'bg-emerald-100 text-emerald-850' : 'bg-amber-100 text-amber-800 animate-pulse'}`}>
                                    {isSpvApproved ? '✓' : '⏳'}
                                  </div>
                                  <div>
                                    <h5 className="text-xs font-bold text-gray-700 leading-tight">3. Persetujuan & Ulasan Atasan (ACC SPV)</h5>
                                    <p className="text-[10px] text-gray-405">
                                      {isSpvApproved ? 'Telah disetujui & divalidasi oleh Supervisor.' : 'Supervisor sedang menentukan tindak lanjut sasaran IDP.'}
                                    </p>
                                  </div>
                                </div>

                                <div className="flex gap-3">
                                  <div className={`w-6 h-6 rounded-full text-[10px] font-bold flex items-center justify-center shrink-0 ${isHrdApproved ? 'bg-emerald-100 text-emerald-850' : 'bg-gray-100 text-gray-400'}`}>
                                    {isHrdApproved ? '✓' : '⏳'}
                                  </div>
                                  <div>
                                    <h5 className="text-xs font-bold text-gray-700 leading-tight">4. Audit Mutu Kepatuhan (ACC HRD)</h5>
                                    <p className="text-[10px] text-gray-450">
                                      {isHrdApproved ? 'Audit kepatuhan selesai dan laporan dirilis resmi.' : 'Proses audit berkas kelayakan, verifikasi program pelatihan & promosi.'}
                                    </p>
                                  </div>
                                </div>
                              </div>
                            </div>

                            <div className="bg-amber-50/50 border border-amber-200/50 p-4 rounded-2xl text-center max-w-md mx-auto">
                              <p className="text-[10px] text-amber-900 leading-relaxed">
                                🛡️ <strong>Kerahasiaan Rater Terjamin:</strong> Identitas pemberi skor dan kutipan feedback timbal-balik disandikan secara penuh demi melestarikan rasa saling menghargai.
                              </p>
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-4">
                            <div className="bg-emerald-50 border border-emerald-250 rounded-2xl p-4 text-xs text-emerald-900 flex items-center justify-between gap-3 shadow-2xs max-w-4xl mx-auto">
                              <div className="flex items-center gap-2">
                                <span className="text-lg">🔓</span>
                                <div>
                                  <strong className="block font-bold">Laporan Kinerja Resmi Siap Ditinjau</strong>
                                  <span>Otoritas SPV dan HRD Admin telah meng-ACC berkas laporan kepatuhan Anda secara resmi.</span>
                                </div>
                              </div>
                              <span className="bg-emerald-700 text-emerald-50 text-[9px] font-black uppercase px-2 py-0.5 rounded-full animate-pulse">SIAP</span>
                            </div>

                            <PerformanceAppraisalDoc
                              emp={activeUser}
                              qk={selQPersonal}
                              quarterLabel={quarters[selQPersonal]?.label || ''}
                              has360={quarters[selQPersonal]?.has360 || false}
                              kpiScore={kpiAvgVal || 0}
                              s360Score={quarters[selQPersonal]?.has360 ? s365Score : null}
                              finalScore={finalVal}
                              isSpvView={true} // Render Section 6/IDP statically for employees
                              onClose={() => {}}
                              customQQuant={customQQuant}
                              customQQual={customQQual}
                              compiledEvaluations={getCompiledEvaluationsForTarget(activeUser.id, selQPersonal)}
                              anonymous={true} // Absolute rater confidentiality enforced (Requirement 10)
                            />
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* TAB 1: DAFTAR PENILAIAN MEMPERSALANKAN 360 */}
                  {page === 'assess' && activeUser && (
                    <div className="space-y-4">
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div>
                          <h2 className="text-xl font-bold text-gray-800 tracking-tight">Kelola Penilaian Rekan & Diri Sendiri (360° Feedback)</h2>
                          <span className="text-xs text-gray-400 font-medium leading-none">
                            Anda dijadwalkan mengisi formulir timbal-balik bagi rekan kerja serta perumusan penilaian diri sendiri/mandiri di bawah ini.
                          </span>
                        </div>

                        {/* Interactive Reset state for demo simplicity */}
                        <button
                          type="button"
                          onClick={() => {
                            if (window.confirm("Ingin merestore ulang data default evaluasi?")) {
                              localStorage.removeItem('infarm_assess');
                              localStorage.removeItem('infarm_eval_answers');
                              window.location.reload();
                            }
                          }}
                          className="bg-gray-100 hover:bg-gray-200 text-gray-700 text-[10px] font-bold uppercase py-1.5 px-3 rounded-lg border border-gray-250 shrink-0 cursor-pointer transition-colors"
                        >
                          🔄 Reset Demo Data
                        </button>
                      </div>

                      {isPeriodLocked() && (
                        <div className="bg-rose-50 border border-rose-200/80 p-3.5 rounded-xl text-xs text-rose-850 flex items-start gap-2.5 shadow-2xs">
                          <Lock className="w-5 h-5 text-rose-600 flex-shrink-0 mt-0.5" />
                          <div>
                            <strong className="block font-bold">Periode Sesi Penilaian Terkunci</strong>
                            <span>Siklus kuartal penilaian saat ini sedang ditutup atau dinonaktifkan oleh HRD Admin. Anda tidak diperkenankan mengisi atau mengubah form.</span>
                          </div>
                        </div>
                      )}

                      {/* Section Add Ad-hoc Target (Requirement 8 - Hack to rate anyone) */}
                      {!isPeriodLocked() && (
                        <div className="bg-emerald-50/40 border border-emerald-600/20 rounded-2xl p-4 shadow-3xs space-y-3">
                          <div className="flex items-center gap-2">
                            <PlusCircle className="w-5 h-5 text-emerald-800 flex-shrink-0" />
                            <div>
                              <h3 className="text-xs font-bold text-emerald-950 uppercase tracking-wide">Hak Penilaian Ad-Hoc Mandiri</h3>
                              <p className="text-[10px] text-emerald-800">
                                Sesuai regulasi kuartal ini, Anda berhak penuh untuk menilai <strong>siapapun rekan kerja lain</strong> yang tidak tercantum dalam daftar rutin di bawah.
                              </p>
                            </div>
                          </div>
                          
                          <div className="flex flex-col sm:flex-row items-center gap-2.5">
                            <select
                              value={adhocTargetEmpId}
                              onChange={(e) => setAdhocTargetEmpId(e.target.value)}
                              className="w-full sm:flex-1 text-xs p-2.5 bg-white border border-gray-200 rounded-xl focus:ring-1 focus:ring-emerald-700 font-medium"
                            >
                              <option value="">-- Pilih Rekan Kerja untuk Dinilai --</option>
                              {ALL_EMPS.filter(u => {
                                if (u.id === activeUser.id) return false;
                                const currList = assessList[activeUser.id] || [];
                                return !currList.some(x => x.id === u.id);
                              }).map(u => (
                                <option key={u.id} value={u.id}>
                                  {u.name} - {u.dept} ({u.id})
                                </option>
                              ))}
                            </select>
                            
                            <button
                              type="button"
                              onClick={handleAddAdhocAssess}
                              disabled={!adhocTargetEmpId}
                              className={`w-full sm:w-auto rounded-xl py-2.5 px-4 font-bold text-xs transition-colors flex items-center justify-center gap-1.5 shadow-2xs whitespace-nowrap cursor-pointer ${
                                adhocTargetEmpId 
                                  ? 'bg-emerald-800 hover:bg-emerald-900 text-white' 
                                  : 'bg-gray-100 text-gray-400 border border-gray-250 cursor-not-allowed'
                              }`}
                            >
                              <Plus className="w-4 h-4" />
                              <span>Tambahkan Rekan</span>
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Stat summary cards */}
                      {(() => {
                        const rawList = assessList[activeUser.id] || [];
                        const hasSelf = rawList.some(x => x.id === activeUser.id);
                        const list = hasSelf 
                          ? rawList 
                          : [
                              { id: activeUser.id, name: `${activeUser.name} (Penilaian Diri Sendiri)`, status: 'pending' as const },
                              ...rawList
                            ];
                        const total = list.length;
                        const done = list.filter(l => l.status === 'done').length;
                        const pct = total > 0 ? Math.round((done / total) * 100) : 0;
                        return (
                          <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-3xs space-y-2">
                            <div className="flex justify-between items-center text-xs">
                              <span className="font-bold text-emerald-950">Kemajuan Hubungan Feedback Penilaian</span>
                              <span className="font-mono font-bold text-emerald-800">{done} dari {total} Terpenuhi ({pct}%)</span>
                            </div>
                            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                              <div style={{ width: `${pct}%` }} className="h-full bg-emerald-700 rounded-full transition-all duration-300" />
                            </div>
                          </div>
                        );
                      })()}

                      {/* Table grid links */}
                      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-xs">
                        <div className="bg-gray-50 border-b border-gray-150 px-4 py-3 font-semibold text-xs text-gray-700">
                          Rekan Kerja & Evaluasi Mandiri dalam Daftar Penilaian Anda
                        </div>

                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-xs text-gray-650 min-w-[500px]">
                            <thead>
                              <tr className="bg-gray-50 border-b border-gray-200 font-semibold text-[10px] uppercase text-gray-400 tracking-wider">
                                <th className="py-2.5 px-4 w-1/3">Nama Pegawai & ID</th>
                                <th className="py-2.5 px-4">Departemen</th>
                                <th className="py-2.5 px-4 text-center">Garis Hubungan</th>
                                <th className="py-2.5 px-4 text-center">Sifat</th>
                                <th className="py-2.5 px-4">Status Pengisian</th>
                                <th className="py-2.5 px-4 text-right">Aksi Tindak Lanjut</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(() => {
                                const rawList = assessList[activeUser.id] || [];
                                const hasSelf = rawList.some(x => x.id === activeUser.id);
                                const list = hasSelf 
                                  ? rawList 
                                  : [
                                      { id: activeUser.id, name: `${activeUser.name} (Penilaian Diri Sendiri)`, status: 'pending' as const },
                                      ...rawList
                                    ];
                                if (list.length === 0) {
                                  return (
                                    <tr>
                                      <td colSpan={6} className="py-8 text-center text-gray-400 font-medium">
                                        Anda tidak memiliki daftar penilaian 360° yang terjadwal.
                                      </td>
                                    </tr>
                                  );
                                }
                                return list.map((item, index) => {
                                  const dept = getEmpDept(item.id);
                                  const isFilled = item.status === 'done';
                                  const relation = getRelationLabel(activeUser.id, item.id);
                                  return (
                                    <tr key={index} className="border-b border-gray-100 last:border-none hover:bg-gray-50/20 animate-fade-in">
                                      <td className="py-3.5 px-4">
                                        <div className="flex items-center gap-3">
                                          <div className="w-8 h-8 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center font-bold">
                                            {item.name.replace(/\([^)]*\)/g, '').trim().split(' ').slice(0, 2).map(n => n[0]).join('')}
                                          </div>
                                          <div>
                                            <span className="font-bold text-gray-800 text-[13px] block">
                                              {item.name}
                                              {item.id === activeUser.id && (
                                                <span className="ml-1.5 text-[8px] bg-indigo-50 text-indigo-700 font-extrabold px-1.5 py-0.5 rounded border border-indigo-150 uppercase tracking-wider">
                                                  Evaluasi Diri
                                                </span>
                                              )}
                                            </span>
                                            <span className="text-[10px] text-gray-450 block">ID: {item.id}</span>
                                          </div>
                                        </div>
                                      </td>
                                      <td className="py-3.5 px-4 font-semibold text-gray-600">{dept}</td>
                                      <td className="py-3.5 px-4 text-center">
                                        <div className="inline-flex flex-col items-center gap-1">
                                          <span className="bg-slate-100 text-slate-800 text-[11px] font-bold px-2.5 py-0.5 rounded-full border border-gray-250 font-sans">
                                            {relation}
                                          </span>
                                          {item.id !== activeUser.id && (
                                            (() => {
                                              const hasPendingReq = relationRequests.some(r => r.penilaiId === activeUser.id && r.yangDinilaiId === item.id && r.status === 'pending');
                                              if (hasPendingReq) {
                                                return <span className="text-[9px] text-indigo-700 font-semibold bg-indigo-50 px-1.5 py-0.5 rounded">Menunggu HRD</span>;
                                              }
                                              return (
                                                <button
                                                  type="button"
                                                  onClick={() => {
                                                    setCorrectionTarget({
                                                      penilaiId: activeUser.id,
                                                      penilaiName: activeUser.name,
                                                      yangDinilaiId: item.id,
                                                      yangDinilaiName: item.name.replace(/\([^)]*\)/g, '').trim(),
                                                      currentRelasi: relation
                                                    });
                                                    setCorrectionNewRelasi(relation === 'Cross' ? 'Peer' : 'Cross');
                                                    setCorrectionReason('');
                                                    setShowCorrectionModal(true);
                                                  }}
                                                  className="text-[10px] text-gray-400 hover:text-emerald-800 font-semibold underline hover:no-underline cursor-pointer transition-colors"
                                                >
                                                  Minta Koreksi
                                                </button>
                                              );
                                            })()
                                          )}
                                        </div>
                                      </td>
                                      <td className="py-3.5 px-4 text-center">
                                        {(() => {
                                          const sifat = item.id === activeUser.id ? 'wajib' : getSifatForPair(activeUser.id, item.id);
                                          return (
                                            <span className={`inline-block text-[10px] font-bold px-2.5 py-0.5 rounded-full border uppercase tracking-wide ${sifatBadgeClass(sifat)}`}>
                                              {sifat === 'opsional' ? 'Opsional' : 'Wajib'}
                                            </span>
                                          );
                                        })()}
                                      </td>
                                      <td className="py-3.5 px-4">
                                        {item.status === 'done' ? (
                                          <span className="text-emerald-700 bg-emerald-50 text-[10px] font-bold px-2 py-0.5 rounded-full border border-emerald-150">✓ Selesai Dinilai</span>
                                        ) : item.status === 'draft' ? (
                                          <span className="text-indigo-800 bg-indigo-50 text-[10px] font-bold px-2 py-0.5 rounded-full border border-indigo-200">📝 Draf Tersimpan</span>
                                        ) : (
                                          <span className="text-amber-800 bg-amber-50 text-[10px] font-bold px-2 py-0.5 rounded-full border border-amber-250">Menunggu Formulir</span>
                                        )}
                                      </td>
                                      <td className="py-3.5 px-4 text-right">
                                        {item.status === 'done' ? (
                                          isPeriodLocked() ? (
                                            <button type="button" disabled className="text-gray-400 bg-gray-100/80 border border-gray-200 rounded-lg px-2.5 py-1 text-[11px] font-bold cursor-not-allowed">
                                              Selesai & Locked
                                            </button>
                                          ) : (
                                            <button
                                              type="button"
                                              onClick={() => setActiveFormTarget({ id: item.id, name: item.name, dept })}
                                              className="bg-amber-600 hover:bg-amber-700 text-white rounded-lg px-3 py-1 text-[11px] font-bold transition-all cursor-pointer inline-flex items-center gap-1 shadow-2xs font-sans"
                                            >
                                              <span>Ubah Penilaian</span>
                                              <Sliders className="w-3.5 h-3.5 text-amber-100" />
                                            </button>
                                          )
                                        ) : isPeriodLocked() ? (
                                          <button type="button" disabled className="text-gray-400 bg-gray-100 border border-gray-200 rounded-lg px-2.5 py-1 text-[11px] font-bold inline-flex items-center gap-1 cursor-not-allowed">
                                            <Lock className="w-3.5 h-3.5" />
                                            <span>Terkunci</span>
                                          </button>
                                        ) : item.status === 'draft' ? (
                                          <button
                                            type="button"
                                            onClick={() => setActiveFormTarget({ id: item.id, name: item.name, dept })}
                                            className="bg-indigo-700 hover:bg-indigo-900 border border-indigo-700 text-white rounded-lg px-3 py-1 text-[11px] font-bold transition-all cursor-pointer inline-flex items-center gap-1 shadow-2xs"
                                          >
                                            <span>Lanjutkan Nilai</span>
                                            <Sliders className="w-3.5 h-3.5 text-indigo-200" />
                                          </button>
                                        ) : (
                                          <button
                                            type="button"
                                            onClick={() => setActiveFormTarget({ id: item.id, name: item.name, dept })}
                                            className="bg-emerald-800 hover:bg-emerald-900 border border-emerald-800 text-white rounded-lg px-3 py-1 text-[11px] font-bold transition-all cursor-pointer inline-flex items-center gap-1 shadow-2xs"
                                          >
                                            <span>Mulai Nilai</span>
                                            <ChevronRight className="w-3.5 h-3.5" />
                                          </button>
                                        )}
                                      </td>
                                    </tr>
                                  );
                                });
                              })()}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* TAB 2: INPUT KPI TIM (SPV ONLY) */}
                  {page === 'kpi' && activeUser?.role === 'spv' && (
                    <div className="space-y-4">
                      <div>
                        <h2 className="text-xl font-bold text-gray-800 tracking-tight">Input Matriks Performa KPI Kerja</h2>
                        <span className="text-xs text-gray-400 font-medium">Asah pengawasan capaian output performa dengan update historis bulanan tim bimbingan Anda.</span>
                      </div>

                      {/* Nested selection tab */}
                      <div className="flex border-b border-gray-200">
                        {([
                          { id: 'input', label: 'Input KPI Bulanan', icon: Target },
                          { id: 'history', label: 'Riwayat & Audit Perubahan', icon: Clock },
                          { id: 'quarterly', label: 'Rekapitulasi Kuartal', icon: FileText }
                        ] as const).map(tab => {
                          const IconComp = tab.icon;
                          return (
                            <button
                              key={tab.id}
                              onClick={() => { setKpiTab(tab.id); }}
                              className={`flex items-center gap-1.5 py-2.5 px-4 font-bold text-xs border-b-2 transition-all cursor-pointer ${
                                kpiTab === tab.id
                                  ? 'border-emerald-700 text-emerald-900 bg-white/40'
                                  : 'border-transparent text-gray-500 hover:text-gray-800'
                              }`}
                            >
                              <IconComp className="w-4 h-4 text-emerald-650" />
                              <span>{tab.label}</span>
                            </button>
                          );
                        })}
                      </div>

                      {/* Tab KPI 2.1: INPUT KPI BULANAN */}
                      {kpiTab === 'input' && (
                        <div className="space-y-4">
                          {/* Segmented control for Manual vs Excel (Requirement 4) */}
                          <div className="flex gap-2 bg-gray-100 p-1 rounded-xl self-start max-w-sm text-xs font-bold border border-gray-200">
                            <button
                              type="button"
                              onClick={() => setKpiInputMode('manual')}
                              className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 cursor-pointer transition-all ${
                                kpiInputMode === 'manual'
                                  ? 'bg-white text-emerald-950 shadow-xs'
                                  : 'text-gray-500 hover:text-gray-800'
                              }`}
                            >
                              <PenLine className="w-3.5 h-3.5 text-emerald-700" />
                              <span>Pengisian Manual Apps</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setKpiInputMode('excel')}
                              className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 cursor-pointer transition-all ${
                                kpiInputMode === 'excel'
                                  ? 'bg-white text-emerald-950 shadow-xs'
                                  : 'text-gray-500 hover:text-gray-800'
                              }`}
                            >
                              <Upload className="w-3.5 h-3.5 text-indigo-600" />
                              <span>Unggah Excel Kerja</span>
                            </button>
                          </div>

                          {/* SUB-MODE 1: MANUAL TABLE ENTRY */}
                          {kpiInputMode === 'manual' && (
                            <div className="space-y-4">
                              <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-3xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                                <div className="flex items-center gap-3">
                                  <span className="text-xs font-bold text-gray-600 shrink-0">Bulan & Tahun Evaluasi:</span>
                                  <select
                                    value={selMonth}
                                    onChange={(e) => setSelMonth(e.target.value)}
                                    className="text-xs p-2.5 border border-gray-250 rounded-lg min-w-[170px] bg-white font-bold text-gray-800"
                                  >
                                    <option value="2026-05">Mei 2026</option>
                                    <option value="2026-04">April 2026</option>
                                    <option value="2026-03">Maret 2026</option>
                                    <option value="2026-02">Februari 2026</option>
                                    <option value="2026-01">Januari 2026</option>
                                  </select>
                                </div>

                                {!isPeriodLocked() && (
                                  <button
                                    type="button"
                                    onClick={handleSaveKpiMonth}
                                    className="w-full sm:w-auto bg-emerald-800 hover:bg-emerald-950 text-white font-bold px-4 py-2 rounded-xl text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
                                  >
                                    <Check className="w-4 h-4" />
                                    <span>Simpan Semua Skor</span>
                                  </button>
                                )}
                              </div>

                              {isPeriodLocked() && (
                                <div className="bg-rose-50 border border-rose-200/80 p-3.5 rounded-xl text-xs text-rose-850 flex items-start gap-2">
                                  <Lock className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
                                  <span>Periode siklus kuartal saat ini sedang terkunci. Anda tidak diperkenankan menyimpan entri KPI baru.</span>
                                </div>
                              )}

                              <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-xs">
                                <table className="w-full text-left text-xs text-gray-600 min-w-[550px]">
                                  <thead>
                                    <tr className="bg-gray-50 border-b border-gray-200 font-bold text-[9px] uppercase tracking-wider text-gray-400">
                                      <th className="py-2.5 px-4 w-1/4">Nama Anggota Tim</th>
                                      <th className="py-2.5 px-4 w-1/5">Skor Saat Ini</th>
                                      <th className="py-2.5 px-4 w-1/4">Input Skor Baru (0-100)</th>
                                      <th className="py-2.5 px-4">Komentar Ringkas Audit</th>
                                      <th className="py-2.5 px-4 text-right">Varians</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {(() => {
                                      const supervisees = (activeUser && activeUser.role === 'spv') ? [activeUser.id, ...activeSupervisees] : activeSupervisees;
                                      return supervisees.map((eid, idx) => {
                                        const activeScore = getLatestKpiScoreVal(eid, selMonth);
                                        const tempVal = kpiInputScores[eid] || '';
                                        const inputNote = kpiInputNotes[eid] || '';
                                        
                                        // Calculate variance preview
                                        let varianceElement = <span className="text-gray-400">—</span>;
                                        if (tempVal !== '') {
                                          const parsedInput = parseFloat(tempVal);
                                          if (!isNaN(parsedInput)) {
                                            if (activeScore === null) {
                                              varianceElement = <span className="text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded">+{parsedInput.toFixed(1)}</span>;
                                            } else {
                                              const diff = parsedInput - activeScore;
                                              if (diff > 0) {
                                                varianceElement = <span className="text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded">+{diff.toFixed(1)}</span>;
                                              } else if (diff < 0) {
                                                varianceElement = <span className="text-red-700 font-bold bg-rose-50 px-2 py-0.5 rounded">{diff.toFixed(1)}</span>;
                                              } else {
                                                varianceElement = <span className="text-gray-400 bg-gray-50 px-2 py-0.5 rounded">Sama</span>;
                                              }
                                            }
                                          }
                                        }

                                        return (
                                          <tr key={idx} className="border-b border-gray-100 last:border-none hover:bg-gray-50/10">
                                            <td className="py-3 px-4">
                                              <div className="flex items-center gap-2.5">
                                                <div className="w-8 h-8 rounded-full bg-slate-100 text-slate-800 flex items-center justify-center font-bold">
                                                  {getEmpName(eid).substring(0, 2)}
                                                </div>
                                                <div>
                                                  <span className="font-bold text-gray-800 block text-xs">
                                                    {getEmpName(eid)}
                                                    {eid === activeUser?.id && (
                                                      <span className="ml-1.5 text-[8px] bg-indigo-50 text-indigo-700 font-extrabold px-1.5 py-0.5 rounded border border-indigo-150 uppercase tracking-wider">
                                                        KPI Mandiri
                                                      </span>
                                                    )}
                                                  </span>
                                                  <span className="text-[10px] text-gray-400 block">{getEmpDept(eid)} · ID: {eid}</span>
                                                </div>
                                              </div>
                                            </td>
                                            <td className="py-3 px-4">
                                              {activeScore !== null ? (
                                                <div className="flex items-center gap-1.5">
                                                  <span className="font-mono font-bold text-emerald-800 text-sm">{activeScore.toFixed(1)}</span>
                                                  {getCatBadge(activeScore)}
                                                </div>
                                              ) : (
                                                <span className="text-gray-400 italic">Belum Diinput</span>
                                              )}
                                            </td>
                                            <td className="py-3 px-4">
                                              {isPeriodLocked() ? (
                                                <span className="text-gray-400 italic">Terkunci</span>
                                              ) : (
                                                <input
                                                  type="number"
                                                  min="0"
                                                  max="100"
                                                  step="0.1"
                                                  value={tempVal}
                                                  onChange={(e) => setKpiInputScores({ ...kpiInputScores, [eid]: e.target.value })}
                                                  placeholder={activeScore !== null ? activeScore.toFixed(1) : "Nilai 0 s/d 100"}
                                                  className="w-24 text-xs font-mono p-1 border border-gray-250 rounded-md focus:ring-1 focus:ring-emerald-700 text-center"
                                                />
                                              )}
                                            </td>
                                            <td className="py-3 px-4">
                                              {isPeriodLocked() ? (
                                                <span className="text-gray-400 font-sans">—</span>
                                              ) : (
                                                <input
                                                  type="text"
                                                  value={inputNote}
                                                  onChange={(e) => setKpiInputNotes({ ...kpiInputNotes, [eid]: e.target.value })}
                                                  placeholder="Masukan alasan contoh revisi..."
                                                  className="w-full text-xs p-1 border border-gray-205 rounded-md"
                                                />
                                              )}
                                            </td>
                                            <td className="py-3 px-4 text-right font-mono font-bold text-xs">
                                              {varianceElement}
                                            </td>
                                          </tr>
                                        );
                                      });
                                    })()}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          )}

                          {/* SUB-MODE 2: EXCEL BULK UPLOAD */}
                          {kpiInputMode === 'excel' && (
                            <div className="space-y-4">
                              <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-3xs flex flex-col items-center justify-center text-center space-y-4 min-h-[220px]">
                                {kpiExcelUploading ? (
                                  <div className="space-y-3">
                                    <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
                                    <span className="text-xs text-gray-500 font-medium block">Sedang mengurai file matriks Excel KPI...</span>
                                  </div>
                                ) : kpiExcelFile ? (
                                  <div className="space-y-4 w-full">
                                    <div className="inline-flex p-3 bg-emerald-50 text-emerald-800 rounded-full border border-emerald-150 shadow-3xs">
                                      <Check className="w-6 h-6 animate-bounce" />
                                    </div>
                                    <div>
                                      <h3 className="text-sm font-bold text-gray-800">{kpiExcelFile} Berhasil Diparsing!</h3>
                                      <p className="text-[11px] text-gray-400 mt-0.5">Ditemukan 5 baris data KPI valid untuk dicocokkan ke form evaluasi.</p>
                                    </div>

                                    {/* Excel parsed rows overview card */}
                                    <div className="bg-gray-50/50 border border-gray-200 rounded-xl p-3 text-left space-y-2 max-w-xl mx-auto">
                                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Review Hasil Penguraian Spreadsheet:</span>
                                      <div className="divide-y divide-gray-150">
                                        {[
                                          { eid: 'EMP001', name: 'Andi Pratama', score: 94.5, note: 'Absensi KPI 100% & Capaian Output 95%' },
                                          { eid: 'EMP002', name: 'Budi Santoso', score: 88.0, note: 'Capaian Output 88%' },
                                          { eid: 'EMP003', name: 'Citra Dewi', score: 91.0, note: 'Absensi KPI 98% & Capaian Output 90%' },
                                          { eid: 'EMP004', name: 'Dani Wardhana', score: 84.5, note: 'Absensi KPI 95%' },
                                          { eid: 'EMP005', name: 'Elga Putra', score: 87.0, note: 'Capaian Output 85%' }
                                        ].map((row, idx) => (
                                          <div key={idx} className="flex justify-between items-center py-2 text-xs">
                                            <div>
                                              <span className="font-bold text-gray-800">{row.name}</span>
                                              <span className="text-[10px] text-gray-400 block font-mono">{row.eid} - {row.note}</span>
                                            </div>
                                            <span className="font-mono bg-emerald-50 text-emerald-800 px-2 py-0.5 rounded font-bold">{row.score.toFixed(1)}</span>
                                          </div>
                                        ))}
                                      </div>
                                    </div>

                                    <div className="flex justify-center gap-2 pt-2">
                                      <button
                                        type="button"
                                        onClick={() => setKpiExcelFile(null)}
                                        className="text-xs font-bold text-gray-500 hover:text-gray-800 bg-white border border-gray-250 px-4 py-2 rounded-lg cursor-pointer"
                                      >
                                        Batal / Pilih Ulang
                                      </button>
                                      <button
                                        type="button"
                                        onClick={handleApplyExcelData}
                                        className="text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-800 px-4 py-2 rounded-lg cursor-pointer shadow-3xs"
                                      >
                                        Pasang Data & Tinjau Kembali
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="space-y-4">
                                    <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center mx-auto border border-indigo-100 shadow-3xs">
                                      <Upload className="w-6 h-6" />
                                    </div>
                                    <div>
                                      <h3 className="text-xs font-bold text-gray-800">Tarik atau Seret File Excel ke Sini</h3>
                                      <p className="text-[10px] text-gray-400 max-w-xs mt-0.5">Mendukung format file `.xlsx` atau `.csv` yang diekspor dari aplikasi presensi HRD.</p>
                                    </div>
                                    <div className="flex flex-col gap-1.5 items-center justify-center pt-2">
                                      <button
                                        type="button"
                                        onClick={() => handleSimulateExcelUpload('Template_Skor_KPI_Kuartal2.xlsx')}
                                        className="text-[11px] font-bold bg-white text-indigo-700 border border-indigo-150 hover:bg-indigo-50/20 px-3.5 py-1.5 rounded-lg cursor-pointer transition-colors shadow-2xs"
                                      >
                                        Simulasikan Unggah Berkas Excel
                                      </button>
                                      <span className="text-[9px] text-gray-400 font-bold uppercase tracking-wider block">Atau Unduh Template Standardisasi:</span>
                                      <a
                                        href="#download"
                                        onClick={(e) => {
                                          e.preventDefault();
                                          showToast('Berhasil mengunduh template standardisasi Excel KPI.', 'ok');
                                        }}
                                        className="text-[10px] text-gray-500 hover:text-indigo-600 underline font-bold"
                                      >
                                        Format_Template_KPI_Standard.xlsx
                                      </a>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}

                        </div>
                      )}

                      {/* Tab KPI 2.2: AUDIT & HISTORY PERUBAHAN */}
                      {kpiTab === 'history' && (() => {
                        const currentFilteredEmps = (activeUser && activeUser.role === 'spv' && !activeSupervisees.includes(activeUser.id))
                          ? [activeUser.id, ...activeSupervisees]
                          : activeSupervisees;
                        const effectiveSelEmp = currentFilteredEmps.includes(selEmp) ? selEmp : (currentFilteredEmps[0] || '');

                        return (
                          <div className="space-y-4">
                            <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-3xs flex flex-wrap items-center gap-4">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-gray-600">Pilih Pegawai Tim:</span>
                                <select
                                  value={effectiveSelEmp}
                                  onChange={(e) => setSelEmp(e.target.value)}
                                  className="text-xs p-2.5 border border-gray-250 rounded-lg min-w-[200px] bg-white text-gray-800 font-bold focus:ring-1 focus:ring-emerald-700 focus:outline-none"
                                >
                                  {currentFilteredEmps.map(eid => (
                                    <option key={eid} value={eid}>
                                      {getEmpName(eid)} ({eid}) — SPV: {getSpvNameForEmp(eid)}
                                    </option>
                                  ))}
                                  {currentFilteredEmps.length === 0 && (
                                    <option value="">Tidak ada pegawai</option>
                                  )}
                                </select>
                              </div>
                              <span className="text-xs text-gray-400 font-medium">Memantau rekam audit perubahan entri skor secara harian.</span>
                            </div>

                            <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-xs space-y-4">
                              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-2 border-b border-gray-150">
                                <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider">
                                  Rekam Audit Skor Perubahan KPI: {getEmpName(effectiveSelEmp) || '—'}
                                </h4>
                                {effectiveSelEmp && (
                                  <div className="text-xs text-gray-500 font-medium bg-gray-50 border border-gray-150 px-2.5 py-1 rounded-full">
                                    SPV: <span className="font-bold text-gray-700">{getSpvNameForEmp(effectiveSelEmp) === 'Tidak ada SPV' ? 'Direksi' : getSpvNameForEmp(effectiveSelEmp)}</span>
                                  </div>
                                )}
                              </div>

                              <div className="space-y-3">
                                {(() => {
                                  if (!effectiveSelEmp) {
                                    return (
                                      <div className="text-center py-6 text-gray-400 font-medium text-xs">
                                        Tidak ada data audit riwayat KPI yang tercatat untuk pegawai ini.
                                      </div>
                                    );
                                  }
                                  const userHist = kpiHist[effectiveSelEmp] || {};
                                  const recordedMonths = Object.keys(userHist).sort().reverse();
                                  if (recordedMonths.length === 0) {
                                    return (
                                      <div className="text-center py-6 text-gray-400 font-medium text-xs">
                                        Tidak ada data audit riwayat KPI yang tercatat untuk pegawai ini.
                                      </div>
                                    );
                                  }
                                  return recordedMonths.map((mKey, idx) => {
                                    const listItems = userHist[mKey] || [];
                                    return (
                                      <div key={idx} className="border border-gray-150 rounded-xl overflow-hidden shadow-2xs">
                                        <div className="bg-gray-50 border-b border-gray-150 px-4 py-2 flex items-center justify-between text-xs font-bold text-gray-700">
                                          <span>Bulan: {mKey}</span>
                                          <span className="text-[10px] bg-gray-200 px-2 py-0.5 rounded-md font-mono">{listItems.length} Entri Audit</span>
                                        </div>
                                        <div className="divide-y divide-gray-100">
                                          {listItems.map((record, rIdx) => {
                                            const isActive = rIdx === listItems.length - 1;
                                            return (
                                              <div key={rIdx} className="p-3 text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 bg-white hover:bg-gray-50/40">
                                                <div className="space-y-1">
                                                  <div className="flex items-center gap-1.5 flex-wrap">
                                                    <span className="font-mono font-bold text-gray-850 text-md">{record.score.toFixed(1)}</span>
                                                    <span className={`text-[9px] font-bold px-2 py-0.2 rounded-full ${isActive ? 'bg-emerald-150 text-emerald-800' : 'bg-gray-100 text-gray-400'}`}>
                                                      {isActive ? 'Aktif Saat Ini' : 'Arsip/Revisi'}
                                                    </span>
                                                    {record.note && (
                                                      <span className="text-[10px] text-gray-500 font-medium italic">— "{record.note}"</span>
                                                    )}
                                                  </div>
                                                  <div className="text-[10px] text-gray-400 flex items-center gap-1">
                                                    <Clock className="w-3.5 h-3.5" />
                                                    <span>Disimpan pada {record.ts} oleh {getEmpName(record.by)} ({record.by})</span>
                                                  </div>
                                                </div>
                                              </div>
                                            );
                                          })}
                                        </div>
                                      </div>
                                    );
                                  });
                                })()}
                              </div>
                            </div>
                          </div>
                        );
                      })()}

                      {/* Tab KPI 2.3: REKAPITULASI KUARTAL */}
                      {kpiTab === 'quarterly' && (() => {
                        const recapLabel = quarters[selQRecap]?.label || '';
                        const currentRecapYear = (recapLabel.match(/\d{4}/) || ['2026'])[0];
                        const currentRecapQuarter = (recapLabel.match(/Q[1-4]/) || ['Q1'])[0];
                        const uniqueYearsList = Array.from(new Set(Object.keys(quarters).map(qk => (quarters[qk].label.match(/\d{4}/) || ['2026'])[0])));

                        return (
                          <div className="space-y-4">
                            <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-3xs flex flex-wrap items-center gap-4">
                              <span className="text-xs font-bold text-gray-700">Pilih Kuartal Acuan:</span>
                              
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-gray-500 font-medium">Tahun:</span>
                                <select
                                  value={currentRecapYear}
                                  onChange={(e) => {
                                    const year = e.target.value;
                                    const match = Object.keys(quarters).find(qk => {
                                      const lbl = quarters[qk].label.toLowerCase();
                                      const key = qk.toLowerCase();
                                      return (lbl.includes(year.toLowerCase()) || key.includes(year.toLowerCase())) &&
                                             (lbl.includes(currentRecapQuarter.toLowerCase()) || key.includes(currentRecapQuarter.toLowerCase()));
                                    });
                                    if (match) setSelQRecap(match);
                                  }}
                                  className="text-xs p-2.5 border border-gray-200 rounded-xl bg-gray-50 text-gray-803 font-bold focus:outline-none focus:ring-1 focus:ring-emerald-700 cursor-pointer"
                                >
                                  {uniqueYearsList.map(yr => (
                                    <option key={yr} value={yr}>Tahun {yr}</option>
                                  ))}
                                </select>
                              </div>

                              <div className="flex items-center gap-2">
                                <span className="text-xs text-gray-500 font-medium">Kuartal:</span>
                                <select
                                  value={currentRecapQuarter}
                                  onChange={(e) => {
                                    const qtr = e.target.value;
                                    const match = Object.keys(quarters).find(qk => {
                                      const lbl = quarters[qk].label.toLowerCase();
                                      const key = qk.toLowerCase();
                                      return (lbl.includes(currentRecapYear.toLowerCase()) || key.includes(currentRecapYear.toLowerCase())) &&
                                             (lbl.includes(qtr.toLowerCase()) || key.includes(qtr.toLowerCase()));
                                    });
                                    if (match) setSelQRecap(match);
                                  }}
                                  className="text-xs p-2.5 border border-gray-200 rounded-xl bg-gray-50 text-gray-803 font-bold focus:outline-none focus:ring-1 focus:ring-emerald-700 cursor-pointer"
                                >
                                  {['Q1', 'Q2', 'Q3', 'Q4'].map(qtr => (
                                    <option key={qtr} value={qtr}>Kuartal {qtr.replace('Q', '')} ({qtr})</option>
                                  ))}
                                </select>
                              </div>

                            </div>

                          {!quarters[selQRecap]?.has360 && (
                            <div className="bg-amber-50 border border-amber-250 p-3 rounded-xl text-xs text-amber-800 flex items-center gap-2">
                              <Info className="w-4.5 h-4.5 text-amber-600 flex-shrink-0" />
                              <span>Siklus kuartal ini bertipe <strong>KPI Saja</strong>. Rekapitulasi mengabaikan kuesioner kelompok 360° dan berfokus fungsional kerja.</span>
                            </div>
                          )}

                          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-xs">
                            <table className="w-full text-left text-xs text-gray-650 min-w-[600px]">
                              <thead>
                                <tr className="bg-gray-50 border-b border-gray-200 font-bold text-[9px] uppercase tracking-wider text-gray-400">
                                  <th className="py-2.5 px-4 w-1/4">Nama Pegawai</th>
                                  {quarters[selQRecap]?.months.map(m => (
                                    <th key={m} className="py-2.5 px-4 text-center">{m}</th>
                                  ))}
                                  <th className="py-2.5 px-4 text-center">Rataan KPI</th>
                                  {quarters[selQRecap]?.has360 && (
                                    <th className="py-2.5 px-4 text-center">Hasil 360°</th>
                                  )}
                                  <th className="py-2.5 px-4 text-center">Hasil Skor Akhir</th>
                                  <th className="py-2.5 px-4 text-right">Kategori</th>
                                </tr>
                              </thead>
                              <tbody>
                                {(() => {
                                  const filteredSupervisees = (activeUser && activeUser.role === 'spv' && !activeSupervisees.includes(activeUser.id))
                                    ? [activeUser.id, ...activeSupervisees]
                                    : activeSupervisees;
                                  const currentQMonths = quarters[selQRecap]?.months || [];

                                  if (filteredSupervisees.length === 0) {
                                    const colSpan = 4 + currentQMonths.length + (quarters[selQRecap]?.has360 ? 1 : 0);
                                    return (
                                      <tr>
                                        <td colSpan={colSpan} className="py-6 text-center text-gray-400 font-medium font-sans">
                                          Tidak ada data bimbingan untuk SPV terpilih di kuartal ini.
                                        </td>
                                      </tr>
                                    );
                                  }

                                  return filteredSupervisees.map((eid, idx) => {
                                    const kpiAvg = getQuarterKpiAverage(eid, selQRecap);
                                    const score360Val = getScore360ForQuarter(eid, selQRecap) ?? null;
                                    const finalVal = getComputedFinalScore(eid, selQRecap);

                                    return (
                                      <tr key={idx} className={`border-b border-gray-100 last:border-none hover:bg-gray-50/10 ${eid === activeUser?.id ? 'bg-emerald-50/20' : ''}`}>
                                        <td className="py-3 px-4 font-bold text-gray-800">
                                          <div className="flex items-center gap-2">
                                            <span>{getEmpName(eid)}</span>
                                            {eid === activeUser?.id && (
                                              <span className="text-[9px] bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wider">
                                                SPV / Anda
                                              </span>
                                            )}
                                          </div>
                                          <div className="text-[10px] text-gray-400 font-medium mt-0.5">
                                            SPV: {getSpvNameForEmp(eid) === 'Tidak ada SPV' ? 'Direksi' : getSpvNameForEmp(eid)}
                                          </div>
                                        </td>
                                        
                                        {/* Monthly scores columns */}
                                        {currentQMonths.map(m => {
                                          const monScore = getLatestKpiScoreVal(eid, m);
                                          return (
                                            <td key={m} className="py-3 px-4 text-center font-mono font-medium text-gray-500">
                                              {monScore !== null ? monScore.toFixed(1) : '—'}
                                            </td>
                                          );
                                        })}

                                        <td className="py-3 px-4 text-center font-mono font-bold text-emerald-805">
                                          {kpiAvg !== null ? kpiAvg.toFixed(1) : '—'}
                                        </td>

                                        {quarters[selQRecap]?.has360 && (
                                          <td className="py-3 px-4 text-center font-mono font-bold text-indigo-805">
                                            {score360Val !== null ? score360Val.toFixed(1) : '—'}
                                          </td>
                                        )}

                                        <td className="py-3 px-4 text-center font-mono font-extrabold text-slate-900 text-sm">
                                          {finalVal !== null ? finalVal.toFixed(1) : '—'}
                                        </td>

                                        <td className="py-3 px-4 text-right">
                                          {getCatBadge(finalVal)}
                                        </td>
                                      </tr>
                                    );
                                  });
                                })()}
                              </tbody>
                            </table>
                          </div>
                        </div>
                        );
                      })()}
                    </div>
                  )}

                  {/* TAB 3: LAPORAN TIM PERFORMANCE (SPV BARU) */}
                  {page === 'team' && activeUser?.role === 'spv' && (() => {
                    const teamLabel = quarters[selQTeam]?.label || '';
                    const currentTeamYear = (teamLabel.match(/\d{4}/) || ['2026'])[0];
                    const currentTeamQuarter = (teamLabel.match(/Q[1-4]/) || ['Q1'])[0];
                    const uniqueYearsListForTeam = Array.from(new Set(Object.keys(quarters).map(qk => (quarters[qk].label.match(/\d{4}/) || ['2026'])[0])));

                    return (
                      <div className="space-y-4">
                        <div>
                          <h2 className="text-xl font-bold text-gray-800 tracking-tight">Dokumen Laporan Kinerja Akhir Tim</h2>
                          <span className="text-xs text-gray-400 font-medium">Tinjau dan kaji kompilasi lengkap ulasan performa pegawai bimbingan Anda format standard organisasi.</span>
                        </div>

                        <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-3xs flex flex-col sm:flex-row sm:items-center gap-4">
                          <span className="text-xs font-bold text-gray-700">Pilih Siklus Kuartal:</span>
                          
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-500 font-medium">Tahun:</span>
                            <select
                              value={currentTeamYear}
                              onChange={(e) => {
                                const year = e.target.value;
                                const match = Object.keys(quarters).find(qk => {
                                  const lbl = quarters[qk].label.toLowerCase();
                                  const key = qk.toLowerCase();
                                  return (lbl.includes(year.toLowerCase()) || key.includes(year.toLowerCase())) &&
                                         (lbl.includes(currentTeamQuarter.toLowerCase()) || key.includes(currentTeamQuarter.toLowerCase()));
                                });
                                if (match) setSelQTeam(match);
                              }}
                              className="text-xs p-2.5 border border-gray-200 rounded-xl bg-gray-50 text-gray-803 font-bold focus:outline-none focus:ring-1 focus:ring-emerald-700 cursor-pointer"
                            >
                              {uniqueYearsListForTeam.map(yr => (
                                <option key={yr} value={yr}>Tahun {yr}</option>
                              ))}
                            </select>
                          </div>

                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-500 font-medium">Kuartal:</span>
                            <select
                              value={currentTeamQuarter}
                              onChange={(e) => {
                                const qtr = e.target.value;
                                const match = Object.keys(quarters).find(qk => {
                                  const lbl = quarters[qk].label.toLowerCase();
                                  const key = qk.toLowerCase();
                                  return (lbl.includes(currentTeamYear.toLowerCase()) || key.includes(currentTeamYear.toLowerCase())) &&
                                         (lbl.includes(qtr.toLowerCase()) || key.includes(qtr.toLowerCase()));
                                });
                                if (match) setSelQTeam(match);
                              }}
                              className="text-xs p-2.5 border border-gray-200 rounded-xl bg-gray-50 text-gray-803 font-bold focus:outline-none focus:ring-1 focus:ring-emerald-700 cursor-pointer"
                            >
                              {['Q1', 'Q2', 'Q3', 'Q4'].map(qtr => (
                                <option key={qtr} value={qtr}>Kuartal {qtr.replace('Q', '')} ({qtr})</option>
                              ))}
                            </select>
                          </div>
                        </div>

                      {/* Supervisee row selector list with expandable Appraisal view */}
                      <div className="space-y-3">
                        {(() => {
                          const supervisees = activeSupervisees;
                          return supervisees.map((eid) => {
                            const empObj = ALL_EMPS.find(e => e.id === eid)!;
                            const finalScoreComputed = getComputedFinalScore(eid, selQTeam);
                            const isExpanded = expandedTeamEmpId === eid;

                            return (
                              <div key={eid} className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-xs">
                                <div
                                  onClick={() => setExpandedTeamEmpId(isExpanded ? null : eid)}
                                  className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer bg-gray-50/70 hover:bg-gray-100 transition-colors"
                                >
                                  <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-full bg-emerald-100 font-bold text-emerald-800 text-xs flex items-center justify-center">
                                      {empObj.name.substring(0, 2)}
                                    </div>
                                    <div>
                                      <h4 className="text-sm font-bold text-gray-800 leading-tight">{empObj.name}</h4>
                                      <p className="text-xs text-gray-400 font-medium">{empObj.dept} Dept · Employee ID: {eid}</p>
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-4 self-end sm:self-auto">
                                    <div className="flex items-center gap-2 border-r border-gray-200 pr-3">
                                      <div className="flex flex-col items-center gap-1">
                                        <span className="text-[9px] text-gray-400 font-bold leading-none">STATUS SPV</span>
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation(); // Prevent toggling expand when clicking approval button
                                            toggleReportApproval(eid, selQTeam, 'spv');
                                          }}
                                          className={`text-[10px] font-bold px-2.5 py-1 rounded-lg border flex items-center gap-1.5 transition-all cursor-pointer ${
                                            reportApprovals[eid]?.[selQTeam]?.spvApproved
                                              ? 'bg-emerald-50 text-emerald-800 border-emerald-250 shadow-2xs'
                                              : 'bg-white text-amber-800 border-amber-250 hover:bg-amber-50'
                                          }`}
                                        >
                                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500" style={{ backgroundColor: reportApprovals[eid]?.[selQTeam]?.spvApproved ? '#047857' : '#f59e0b' }} />
                                          <span>{reportApprovals[eid]?.[selQTeam]?.spvApproved ? 'Disetujui (ACC)' : 'Sains & Klik ACC'}</span>
                                        </button>
                                      </div>

                                      <div className="flex flex-col items-center gap-1">
                                        <span className="text-[9px] text-gray-400 font-bold leading-none">ACC HRD</span>
                                        <span className={`text-[10px] font-bold px-2.5 py-1 rounded-lg border flex items-center gap-1.5 ${
                                          reportApprovals[eid]?.[selQTeam]?.hrdApproved
                                            ? 'bg-emerald-50 text-emerald-800 border-emerald-250'
                                            : 'bg-gray-50 text-gray-450 border-gray-200'
                                        }`}>
                                          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: reportApprovals[eid]?.[selQTeam]?.hrdApproved ? '#047857' : '#9ca3af' }} />
                                          <span>{reportApprovals[eid]?.[selQTeam]?.hrdApproved ? 'Terfinalisasi' : 'Menunggu'}</span>
                                        </span>
                                      </div>
                                    </div>

                                    <div className="text-right">
                                      <span className="block text-[10px] text-gray-400 font-bold leading-none">FINAL SCORE</span>
                                      <span className="font-mono font-extrabold text-sm text-emerald-950">
                                        {finalScoreComputed !== null ? finalScoreComputed.toFixed(1) : '—'}
                                      </span>
                                    </div>
                                    {getCatBadge(finalScoreComputed)}
                                  </div>
                                </div>

                                {isExpanded && (
                                  <div className="p-4 border-t border-gray-150 bg-gray-50/50">
                                    <PerformanceAppraisalDoc
                                      emp={empObj}
                                      qk={selQTeam}
                                      quarterLabel={quarters[selQTeam]?.label}
                                      has360={quarters[selQTeam]?.has360}
                                      kpiScore={getQuarterKpiAverage(eid, selQTeam) || 0}
                                      s360Score={quarters[selQTeam]?.has360 ? (getScore360ForQuarter(eid, selQTeam) ?? null) : null}
                                      finalScore={finalScoreComputed}
                                      isSpvView={true}
                                      onClose={() => setExpandedTeamEmpId(null)}
                                      customQQuant={customQQuant}
                                      customQQual={customQQual}
                                      compiledEvaluations={getCompiledEvaluationsForTarget(eid, selQTeam)}
                                      anonymous={true}
                                    />
                                  </div>
                                )}
                              </div>
                            );
                          });
                        })()}
                      </div>
                    </div>
                    );
                  })()}

                  {/* TAB 4: KELOLA PERIODE SIKLUS PENILAIAN (HRD ONLY) */}
                  {page === 'periode' && currentUser.role === 'hrd' && (
                    <div className="space-y-4">
                      <div>
                        <h2 className="text-xl font-bold text-gray-800 tracking-tight">Kelola Siklus Sistem Penilaian Kinerja</h2>
                        <span className="text-xs text-gray-400 font-medium">Buka evaluasi baru, aktifkan pengisian form 360, serta mengunci modifikasi penilaian.</span>
                      </div>

                      {/* Sub controllers */}
                      <div className="flex border-b border-gray-200">
                        <button
                          type="button"
                          onClick={() => setPeriodeTab('control')}
                          className={`py-2 px-4 font-bold text-xs border-b-2 transition-all cursor-pointer ${
                            periodeTab === 'control' ? 'border-emerald-700 text-emerald-900' : 'text-gray-500 hover:text-gray-800'
                          }`}
                        >
                          Kontrol Aktivasi Siklus
                        </button>
                        <button
                          type="button"
                          onClick={() => setPeriodeTab('history')}
                          className={`py-2 px-4 font-bold text-xs border-b-2 transition-all cursor-pointer ${
                            periodeTab === 'history' ? 'border-emerald-700 text-emerald-900' : 'text-gray-500 hover:text-gray-800'
                          }`}
                        >
                          Arsip & Riwayat Kuartal
                        </button>
                      </div>

                      {/* Sub-tab: Period Control */}
                      {periodeTab === 'control' && (
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                          {/* Left layout stats toggle */}
                          <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-xs space-y-4 lg:col-span-2">
                            <h3 className="text-xs font-bold text-gray-700 uppercase tracking-widest">Status Periode Acuan: {activePeriodObj?.label}</h3>
                            
                            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between p-4 bg-emerald-50/50 rounded-xl border border-emerald-100 gap-4">
                              <div className="space-y-1">
                                <span className="text-xs font-bold text-emerald-900 block">Periode Penilaian: {activePeriodObj?.label}</span>
                                <span className="text-[11px] text-emerald-800 font-semibold block">Sesi Masukan 360° saat ini: {activePeriodObj?.status === 'active' ? 'Dibuka untuk Umum' : 'Dikunci / Terfinalisasi'}</span>
                              </div>

                              <button
                                type="button"
                                onClick={() => handleTogglePeriodActive()}
                                className={`px-4 py-2 text-xs font-bold rounded-xl text-white transition-all cursor-pointer ${
                                  activePeriodObj?.status === 'active'
                                    ? 'bg-rose-700 hover:bg-rose-800'
                                    : 'bg-emerald-800 hover:bg-emerald-900'
                                }`}
                              >
                                {activePeriodObj?.status === 'active' ? 'Kunci & Akhiri Periode Penilaian' : 'Aktifkan Kembali Periode Penilaian'}
                              </button>
                            </div>

                            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-900">
                              <span className="block font-semibold mb-1">Dampak Mengunci Periode Penilaian (Status: ended)</span>
                              <p className="leading-relaxed">
                                Pegawai tidak lagi dapat mengirimkan form penilaian kompetensi 360° yang belum selesai. Supervisor dilarang mengubah skor KPI performa bulanan, dan berkas di-finalisasi agar siap dicetak.
                              </p>
                            </div>
                          </div>

                          {/* Launch new Cycle Form */}
                          <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-xs space-y-4">
                            <h3 className="text-xs font-bold text-gray-700 uppercase tracking-widest">Buka Periode Penilaian Baru</h3>
                            <form
                              onSubmit={(e) => {
                                e.preventDefault();
                                const label = (e.currentTarget.elements.namedItem('newQlabel') as HTMLInputElement).value;
                                const is360 = (e.currentTarget.elements.namedItem('newQ360') as HTMLInputElement).checked;
                                const sDate = (e.currentTarget.elements.namedItem('startDate') as HTMLInputElement).value;
                                const eDate = (e.currentTarget.elements.namedItem('endDate') as HTMLInputElement).value;
                                if (!label) return;
                                handleCreateNewQuarter(label, ['2026-07', '2026-08', '2026-09'], is360);
                                showToast(`Periode Penilaian "${label}" berhasil diaktifkan dengan masa dinas ${sDate} s.d. ${eDate}!`, 'ok');
                                e.currentTarget.reset();
                              }}
                              className="space-y-4 text-xs"
                            >
                              <div>
                                <label className="block text-[11px] font-bold text-gray-400 uppercase mb-1">Label Periode Baru</label>
                                <input
                                  name="newQlabel"
                                  type="text"
                                  placeholder="Contoh: Q3 2026 (Jul - Sep)"
                                  className="w-full text-xs p-2.5 border border-gray-200 rounded-xl"
                                  required
                                />
                              </div>

                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <label className="block text-[11px] font-bold text-gray-400 uppercase mb-1">Tanggal Mulai</label>
                                  <input
                                    name="startDate"
                                    type="date"
                                    defaultValue="2026-07-01"
                                    className="w-full text-xs p-2.5 border border-gray-200 rounded-xl cursor-pointer"
                                    required
                                  />
                                </div>
                                <div>
                                  <label className="block text-[11px] font-bold text-gray-400 uppercase mb-1">Tanggal Selesai</label>
                                  <input
                                    name="endDate"
                                    type="date"
                                    defaultValue="2026-09-30"
                                    className="w-full text-xs p-2.5 border border-gray-200 rounded-xl cursor-pointer"
                                    required
                                  />
                                </div>
                              </div>

                              <div className="flex items-center gap-2">
                                <input
                                  name="newQ360"
                                  id="newQ360"
                                  type="checkbox"
                                  defaultChecked
                                  className="w-4 h-4 rounded text-emerald-800 focus:ring-emerald-700"
                                />
                                <label htmlFor="newQ360" className="font-bold text-gray-75 * select-none cursor-pointer">
                                  Aktifkan Angket Evaluasi 360°
                                </label>
                              </div>

                              <button
                                type="submit"
                                className="w-full bg-emerald-800 hover:bg-emerald-900 text-white font-bold py-2.5 rounded-xl transition-all cursor-pointer shadow-2xs"
                              >
                                Aktivasi Periode Penilaian
                              </button>
                            </form>
                          </div>
                        </div>
                      )}

                      {/* Sub-tab: Cycle History */}
                      {periodeTab === 'history' && (
                        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-xs">
                          <table className="w-full text-left text-xs text-gray-600 min-w-[500px]">
                            <thead>
                              <tr className="bg-gray-50 border-b border-gray-200 font-bold text-[9px] uppercase tracking-wider text-gray-400">
                                <th className="py-2.5 px-4">Nama Kuartal</th>
                                <th className="py-2.5 px-4 text-center">Status</th>
                                <th className="py-2.5 px-4 text-center">Komponen 360 Feedback</th>
                                <th className="py-2.5 px-4">Daftar Bulan</th>
                                <th className="py-2.5 px-4 text-right">Aksi</th>
                              </tr>
                            </thead>
                            <tbody>
                              {((Object.entries(quarters) as any) as [string, Period][]).map(([qKey, obj]) => {
                                const isCurrent = qKey === activeQuarterKey;
                                return (
                                  <tr key={qKey} className="border-b border-gray-100 last:border-none">
                                    <td className="py-3 px-4 font-bold text-gray-800 flex items-center gap-1.5">
                                      <span>{obj.label}</span>
                                      {isCurrent && (
                                        <span className="bg-emerald-100 text-emerald-800 text-[9px] font-bold px-1.5 py-0.2 rounded border border-emerald-250 shrink-0">Siklus Dipilih</span>
                                      )}
                                    </td>
                                    <td className="py-3 px-4 text-center">
                                      {obj.status === 'active' ? (
                                        <span className="text-emerald-700 bg-emerald-50 text-[10px] font-bold px-2 py-0.5 rounded-full border border-emerald-150">Terbuka / Aktif</span>
                                      ) : (
                                        <span className="text-gray-400 bg-gray-50 text-[10px] font-bold px-2 py-0.5 rounded-full border border-gray-150">Terkunci / Selesai</span>
                                      )}
                                    </td>
                                    <td className="py-3 px-4 text-center">
                                      {obj.has360 ? (
                                        <span className="font-bold text-emerald-800">Aktif (50% Bobot)</span>
                                      ) : (
                                        <span className="text-gray-400 font-medium">Hanya Komponen KPI</span>
                                      )}
                                    </td>
                                    <td className="py-3 px-4 font-mono text-gray-500">
                                      {obj.months.join(', ')}
                                    </td>
                                    <td className="py-3 px-4 text-right">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setActiveQuarterKey(qKey);
                                          showToast(`Kuartal terpilih beralih ke ${obj.label}`);
                                        }}
                                        className="text-xs text-gray-600 bg-white hover:bg-gray-100 border border-gray-200 hover:border-gray-300 rounded-lg py-1 px-2.5 font-bold transition-all cursor-pointer"
                                      >
                                        Pilih Kuartal
                                      </button>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}

                  {/* TAB 5: REVIEW HASIL AKHIR & FINALISASI (HRD ONLY) */}
                  {page === 'review' && currentUser.role === 'hrd' && (
                    <div className="space-y-4">
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                        <div>
                          <h2 className="text-xl font-bold text-gray-800 tracking-tight">Evaluasi dan Finalisasi Penilaian Akhir</h2>
                          <span className="text-xs text-gray-400 font-medium">Lakukan proses audit rencana pengembangan, pengisian umpan-balik, dan memfinalisasi berkas pegawai.</span>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-xs font-bold text-gray-600">Siklus Acuan:</span>
                          <select
                            value={selQReview}
                            onChange={(e) => setSelQReview(e.target.value)}
                            className="text-xs p-2.5 border border-gray-250 rounded-lg min-w-[130px] font-bold text-emerald-950 bg-white"
                          >
                            {((Object.entries(quarters) as any) as [string, Period][]).map(([k, o]) => (
                              <option key={k} value={k}>{o.label}</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {/* Main stats mini card summary strip */}
                      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                        <div className="p-4 bg-white border border-gray-150 rounded-2xl text-center">
                          <span className="text-2xl font-bold text-gray-800 block leading-tight">8</span>
                          <span className="text-[10px] text-gray-400 font-bold block">Total Pegawai Kuartal</span>
                        </div>
                        <div className="p-4 bg-white border border-gray-150 rounded-2xl text-center">
                          <span className="text-2xl font-bold text-emerald-800 block leading-tight">5</span>
                          <span className="text-[10px] text-emerald-700 font-bold block">Telah Selesai Audit</span>
                        </div>
                        <div className="p-4 bg-white border border-gray-150 rounded-2xl text-center">
                          <span className="text-2xl font-bold text-amber-800 block leading-tight">3</span>
                          <span className="text-[10px] text-amber-700 font-bold block">Perlu Verifikasi IDP</span>
                        </div>
                        <div className="p-4 bg-white border border-gray-150 rounded-2xl text-center">
                          <span className="text-2xl font-bold text-indigo-800 block leading-tight">1</span>
                          <span className="text-[10px] text-indigo-700 font-bold block">Kategori Khusus</span>
                        </div>
                      </div>

                      {/* Filter Search Field */}
                      <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-3xs flex items-center gap-3">
                        <Search className="w-4 h-4 text-gray-400 flex-shrink-0" />
                        <input
                          type="text"
                          placeholder="Cari berdasarkan nama atau departemen..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="w-full text-xs font-sans border-none focus:outline-hidden"
                        />
                      </div>

                      {/* Main employees overall scoring audit list tree tab */}
                      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-xs">
                        <table className="w-full text-left text-xs text-gray-650 min-w-[650px]">
                          <thead>
                            <tr className="bg-gray-50 border-b border-gray-200 font-bold text-[9px] uppercase tracking-wider text-gray-400">
                              <th className="py-2.5 px-4 w-1/4">Nama Pegawai & ID</th>
                              <th className="py-2.5 px-4 text-center">Rataan KPI</th>
                              {quarters[selQReview]?.has360 && (
                                <th className="py-2.5 px-4 text-center">Hasil 360°</th>
                              )}
                              <th className="py-2.5 px-4 text-center">Skor Akhir</th>
                              <th className="py-2.5 px-4 text-center">Kategori Hasil Kerja</th>
                              <th className="py-2.5 px-4 text-center">Status Verifikasi</th>
                              <th className="py-2.5 px-4 text-right">Verifikasi Tindak Lanjut</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredEmployeesList.map((e, index) => {
                              const kpiAvgVal = getQuarterKpiAverage(e.id, selQReview);
                              const score360Val = quarters[selQReview]?.has360 ? (getScore360ForQuarter(e.id, selQReview) ?? null) : null;
                              const finalVal = getComputedFinalScore(e.id, selQReview);
                              
                              // Simulasi status HRD review
                              const isAppraisedSim = [true, true, true, false, true, true, false, true][index] ?? false;

                              return (
                                <tr key={e.id} className="border-b border-gray-100 last:border-none hover:bg-gray-50/15">
                                  <td className="py-3 px-4">
                                    <div className="flex items-center gap-2.5">
                                      <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center font-bold text-slate-800">
                                        {e.name.substring(0, 2)}
                                      </div>
                                      <div>
                                        <span className="font-bold text-gray-800 block text-xs">{e.name}</span>
                                        <span className="text-[10px] text-gray-400 block">{e.dept} Department · ID: {e.id}</span>
                                      </div>
                                    </div>
                                  </td>
                                  
                                  <td className="py-3 px-4 text-center font-mono font-bold text-gray-700">
                                    {kpiAvgVal !== null ? kpiAvgVal.toFixed(1) : '—'}
                                  </td>

                                  {quarters[selQReview]?.has360 && (
                                    <td className="py-3 px-4 text-center font-mono">
                                      {score360Val !== null ? (
                                        <span className="font-bold text-indigo-900 bg-indigo-50/50 px-2 py-0.5 rounded">{score360Val.toFixed(1)}</span>
                                      ) : '—'}
                                    </td>
                                  )}

                                  <td className="py-3 px-4 text-center font-mono text-sm font-extrabold text-emerald-950">
                                    {finalVal !== null ? finalVal.toFixed(1) : '—'}
                                  </td>

                                  <td className="py-3 px-4 text-center">
                                    {getCatBadge(finalVal)}
                                  </td>

                                  <td className="py-3 px-4 text-center">
                                    <div className="flex flex-col gap-1 items-center justify-center">
                                      <button
                                        type="button"
                                        onClick={() => toggleReportApproval(e.id, selQReview, 'spv')}
                                        title="Klik untuk mengubah persetujuan SPV"
                                        className={`text-[10px] font-bold px-2 py-1 rounded border flex items-center gap-1 transition-all cursor-pointer ${
                                          reportApprovals[e.id]?.[selQReview]?.spvApproved
                                            ? 'bg-emerald-50 text-emerald-800 border-emerald-250 shadow-3xs'
                                            : 'bg-amber-50 text-amber-800 border-amber-250'
                                        }`}
                                      >
                                        <span>SPV:</span>
                                        <span>{reportApprovals[e.id]?.[selQReview]?.spvApproved ? '✓ ACC' : '⏳ Pending'}</span>
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => toggleReportApproval(e.id, selQReview, 'hrd')}
                                        title="Klik untuk mengubah persetujuan HRD Admin"
                                        className={`text-[10px] font-bold px-2 py-1 rounded border flex items-center gap-1 transition-all cursor-pointer ${
                                          reportApprovals[e.id]?.[selQReview]?.hrdApproved
                                            ? 'bg-emerald-50 text-emerald-800 border-emerald-250 shadow-3xs'
                                            : 'bg-rose-50 text-rose-800 border-rose-250'
                                        }`}
                                      >
                                        <span>HRD:</span>
                                        <span>{reportApprovals[e.id]?.[selQReview]?.hrdApproved ? '✓ ACC' : '⏳ Pending'}</span>
                                      </button>
                                    </div>
                                  </td>

                                  <td className="py-3 px-4 text-right">
                                    <button
                                      type="button"
                                      onClick={() => setSelectedReviewEmpId(e.id)}
                                      className="inline-flex items-center gap-1 text-[11px] font-bold text-gray-700 bg-white hover:bg-gray-100 border border-gray-200 px-3 py-1 rounded-lg shadow-3xs hover:border-gray-300 transition-colors cursor-pointer"
                                    >
                                      <span>Edit Laporan</span>
                                      <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* TAB 6: DASHBOARD ANALYTICS BAR CHART OVERVIEW (DIREKSI & HRD) */}
                  {page === 'analytics' && (
                    <div className="space-y-4">
                      
                      {/* 4 FILTER UTAMA: TAHUN, KUARTAL, BULAN, DIVISI */}
                      <div className="bg-white border border-gray-200/80 rounded-2xl p-5 shadow-xs space-y-4">
                        <div className="flex items-center justify-between border-b border-gray-100 pb-2.5">
                          <div className="flex items-center gap-2">
                            <span className="p-1 rounded bg-emerald-50 text-emerald-700">
                              <Layers className="w-4 h-4" />
                            </span>
                            <h3 className="text-xs font-black tracking-widest text-[#015f43] uppercase">Panel Filter Selektif Organisasi</h3>
                          </div>
                          <span className="text-[10px] font-mono text-gray-400 font-extrabold uppercase">Tahun · Kuartal · Bulan · Divisi</span>
                        </div>
                        
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                          {/* 1. FILTER TAHUN */}
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider">Tahun Laporan</label>
                            <select
                              value={filterYear}
                              onChange={(e) => {
                                setFilterYear(e.target.value);
                                setFilterMonth('Semua'); // Reset month
                              }}
                              className="w-full text-xs p-2.5 border border-gray-250 rounded-xl font-bold text-gray-800 bg-gray-50/50 hover:bg-gray-50 focus:ring-1 focus:ring-emerald-700 focus:outline-none transition-all cursor-pointer shadow-3xs"
                            >
                              <option value="Semua">📅 Semua Tahun</option>
                              <option value="2026">📅 2026</option>
                            </select>
                          </div>

                          {/* 2. FILTER KUARTAL */}
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider">Kuartal Acuan</label>
                            <select
                              value={filterQuarter}
                              onChange={(e) => {
                                setFilterQuarter(e.target.value);
                                setFilterMonth('Semua'); // Reset month
                              }}
                              className="w-full text-xs p-2.5 border border-gray-250 rounded-xl font-bold text-gray-800 bg-gray-50/50 hover:bg-gray-50 focus:ring-1 focus:ring-emerald-700 focus:outline-none transition-all cursor-pointer shadow-3xs"
                            >
                              <option value="Semua">📊 Semua Kuartal (Q1 - Q3)</option>
                              <option value="Q1">📊 Kuartal 1 (Q1)</option>
                              <option value="Q2">📊 Kuartal 2 (Q2)</option>
                              <option value="Q3">📊 Kuartal 3 (Q3)</option>
                            </select>
                          </div>

                          {/* 3. FILTER BULAN */}
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider">Bulan Spesifik</label>
                            <select
                              value={filterMonth}
                              onChange={(e) => setFilterMonth(e.target.value)}
                              className="w-full text-xs p-2.5 border border-gray-250 rounded-xl font-bold text-gray-800 bg-gray-50/50 hover:bg-gray-50 focus:ring-1 focus:ring-emerald-700 focus:outline-none transition-all cursor-pointer shadow-3xs"
                            >
                              <option value="Semua">🗓️ Semua Bulan</option>
                              {getMonthOptionsInContext().map(m => {
                                const parts = m.split('-');
                                const monthNamesIndo: Record<string, string> = {
                                  '01': 'Januari', '02': 'Februari', '03': 'Maret',
                                  '04': 'April', '05': 'Mei', '06': 'Juni',
                                  '07': 'Juli', '08': 'Agustus', '09': 'September',
                                  '10': 'Oktober', '11': 'November', '12': 'Desember'
                                };
                                const label = parts[1] && monthNamesIndo[parts[1]] 
                                  ? `${monthNamesIndo[parts[1]]} ${parts[0]}`
                                  : m;
                                return (
                                  <option key={m} value={m}>🗓️ {label}</option>
                                );
                              })}
                            </select>
                          </div>

                          {/* 4. FILTER DIVISI */}
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider">Divisi / Departemen</label>
                            <select
                              value={filterDivision}
                              onChange={(e) => setFilterDivision(e.target.value)}
                              className="w-full text-xs p-2.5 border border-gray-250 rounded-xl font-bold text-gray-800 bg-gray-50/50 hover:bg-gray-50 focus:ring-1 focus:ring-emerald-700 focus:outline-none transition-all cursor-pointer shadow-3xs"
                            >
                              <option value="Semua">🏢 Semua Divisi</option>
                              {Array.from(new Set(ALL_EMPS.map(emp => emp.dept))).map(d => (
                                <option key={d} value={d}>🏢 Divisi {d}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                      </div>

                      {/* Top acuan selectors */}
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white/50 p-4 border border-gray-150 rounded-2xl">
                        <div>
                          <h2 className="text-xl font-bold text-gray-800 tracking-tight">Kompilasi Dashboard Kinerja Organisasi</h2>
                          <span className="text-xs text-gray-400 font-medium">Informasi sebaran kategori hasil, rekapitulasi, bimbingan dan top performa perusahaan.</span>
                        </div>

                        {/* Interactive dynamic info display */}
                        <div className="bg-emerald-50 rounded-xl px-4 py-2 text-right border border-emerald-100 font-sans">
                          <span className="block text-[8px] font-bold text-emerald-800 uppercase tracking-widest leading-none">Siklus Aktif Analisis</span>
                          <span className="text-sm font-black text-emerald-950 font-mono">
                            {filterQuarter === 'Semua' ? 'Semua Kuartal' : filterQuarter} - {filterYear === 'Semua' ? 'Semua Tahun' : filterYear}
                          </span>
                        </div>
                      </div>

                      {/* Panel Simulasi Penilaian Tanpa 360° Feedback */}
                      <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-2xl p-4 sm:p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="space-y-1.5 max-w-2xl">
                          <div className="flex items-center gap-2">
                            <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 text-[10px] font-bold font-mono tracking-wider uppercase">Mode Simulasi</span>
                            <h3 className="text-xs font-extrabold text-amber-950 uppercase tracking-wider">
                              Skenario Siklus Tanpa Evaluasi 360° Feedback
                            </h3>
                          </div>
                          <p className="text-xs text-amber-900/90 leading-relaxed font-bold">
                            Siklus Aktif: <span className="font-extrabold text-emerald-950 underline">{quarters[selQAnalytics]?.label || selQAnalytics}</span> status saat ini &rarr; {quarters[selQAnalytics]?.has360 ? (
                              <span className="bg-emerald-100 text-emerald-900 px-2 py-0.5 rounded-md font-mono text-[10px]">360° AKTIF (Bobot KPI 50% / 360° 50%)</span>
                            ) : (
                              <span className="bg-amber-150 text-amber-900 px-2 py-0.5 rounded-md font-mono text-[10px]">360° NONAKTIF (Timbangan murni 100% KPI)</span>
                            )}
                          </p>
                          <p className="text-[11px] text-amber-800/80 leading-relaxed">
                            💡 <span className="font-bold underline">Penjelasan Visual:</span> Jika kuartal tertentu (seperti <strong>Kuartal 2</strong>) tidak mengadakan evaluasi 360 Feedback, maka bobot penilaian kompetensi ditiadakan. Nilai akhir dihitung murni 100% dari rerata skor KPI Bulanan, kolom 360° pada tabel ditiadakan (N/A), serta bagian radar/detail evaluasi perilaku dalam dokumen cetak resmi disembunyikan secara cerdas.
                          </p>
                        </div>
                        <div className="shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              const qKey = selQAnalytics;
                              const updated = {
                                ...quarters,
                                [qKey]: {
                                  ...quarters[qKey],
                                  has360: !quarters[qKey].has360
                                }
                              };
                              setQuarters(updated);
                              localStorage.setItem('infarm_quarters', JSON.stringify(updated));
                              showToast(
                                `Format kuartal ${quarters[qKey]?.label} diubah: ${
                                  !quarters[qKey].has360 ? "MENJADI 100% KPI MURNI" : "MENJADI GABUNGAN KPI 50% + 360° 50%"
                                }`,
                                'info'
                              );
                            }}
                            className={`w-full md:w-auto px-4 py-2.5 rounded-xl font-bold text-[10px] tracking-wider uppercase text-white shadow-2xs transition-all active:scale-95 ${
                              quarters[selQAnalytics]?.has360
                                ? 'bg-amber-700 hover:bg-amber-800'
                                : 'bg-emerald-700 hover:bg-emerald-800'
                            }`}
                          >
                            {quarters[selQAnalytics]?.has360
                              ? "⚡ Set Tanpa 360°"
                              : "⚡ Aktifkan Kembali 360°"}
                          </button>
                        </div>
                      </div>

                      {/* Sub-tabs Selection for Analytics Page */}
                      <div className="flex border-b border-gray-200 gap-1.5 mt-2 overflow-x-auto scrollbar-none">
                        <button
                          type="button"
                          onClick={() => setAnalyticsSubTab('compilation')}
                          className={`flex items-center gap-2 py-2 px-4 text-xs font-bold border-b-2 transition-all cursor-pointer shrink-0 ${
                            analyticsSubTab === 'compilation'
                              ? 'border-emerald-700 text-emerald-950 bg-emerald-50/10'
                              : 'border-transparent text-gray-500 hover:text-gray-850'
                          }`}
                        >
                          <Building className="w-4 h-4 text-emerald-700" />
                          <span>Kompilasi Kinerja Organisasi</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setAnalyticsSubTab('kpi_results')}
                          className={`flex items-center gap-2 py-2 px-4 text-xs font-bold border-b-2 transition-all cursor-pointer shrink-0 ${
                            analyticsSubTab === 'kpi_results'
                              ? 'border-emerald-700 text-emerald-950 bg-emerald-50/10'
                              : 'border-transparent text-gray-500 hover:text-gray-850'
                          }`}
                        >
                          <Award className="w-4 h-4 text-emerald-700" />
                          <span>Analisis Hasil KPI</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setAnalyticsSubTab('feedback_360')}
                          className={`flex items-center gap-2 py-2 px-4 text-xs font-bold border-b-2 transition-all cursor-pointer shrink-0 ${
                            analyticsSubTab === 'feedback_360'
                              ? 'border-emerald-700 text-emerald-950 bg-emerald-50/10'
                              : 'border-transparent text-gray-500 hover:text-gray-850'
                          }`}
                        >
                          <TrendingUp className="w-4 h-4 text-emerald-700" />
                          <span>Analisis 360 Feedback</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setAnalyticsSubTab('all_employees')}
                          className={`flex items-center gap-2 py-2 px-4 text-xs font-bold border-b-2 transition-all cursor-pointer shrink-0 ${
                            analyticsSubTab === 'all_employees'
                              ? 'border-emerald-700 text-emerald-950 bg-emerald-50/10'
                              : 'border-transparent text-gray-500 hover:text-gray-850'
                          }`}
                        >
                          <Users className="w-4 h-4 text-emerald-700" />
                          <span>Tabel Hasil Seluruh Pegawai</span>
                        </button>
                      </div>

                      {analyticsSubTab === 'compilation' ? (
                        <>
                          {/* Display beautiful dynamic charts from sub-component VisualCharts */}
                          <VisualCharts
                            deptScores={getFilteredDeptScores()}
                            aspekScores={ASPEK.map((asp, idx) => ({ aspek: asp, score: ASPEK_SCORES[idx] }))}
                            categories={getFilteredCategories()}
                            recommendations={getFilteredRecommendations()}
                            has360={getFilteredQuarterKeys().some(q => quarters[q]?.has360)}
                            selectedQuarterLabel={
                              filterQuarter === 'Semua' && filterYear === 'Semua'
                                ? 'Semua Kuartal'
                                : `${filterQuarter !== 'Semua' ? filterQuarter : 'Semua Kuartal'} ${filterYear !== 'Semua' ? filterYear : 'Semua Tahun'}`
                            }
                          />

                          {/* Top 5 Performers & bottom performers list sidebar grids inside dashboard */}
                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                            {/* Top Performers Card */}
                            <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-xs">
                              <h3 className="text-xs font-bold text-emerald-805 tracking-wider uppercase mb-3 flex items-center gap-1.5">
                                <span className="p-1 rounded-md bg-emerald-50 text-emerald-800">🏆</span>
                                <span>Bintang Performa Utama (Top Performers)</span>
                              </h3>
                              <div className="divide-y divide-gray-100">
                                {[...ALL_EMPS]
                                  .filter(emp => {
                                    if (filterDivision !== 'Semua' && emp.dept !== filterDivision) return false;
                                    return true;
                                  })
                                  .map(emp => ({ emp, fScore: getFilteredFinalScore(emp.id) }))
                                  .filter(x => x.fScore !== null)
                                  .sort((a,b) => (b.fScore || 0) - (a.fScore || 0))
                                  .slice(0, 4)
                                  .map((item, idx) => {
                                    return (
                                      <div key={item.emp.id} className="py-3 first:pt-0 last:pb-0 flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                          <span className="font-mono text-xs font-bold text-emerald-800 w-5">#{idx + 1}</span>
                                          <div>
                                            <span className="font-bold text-gray-800 block text-xs">{item.emp.name}</span>
                                            <span className="text-[10px] text-gray-400 block">{item.emp.dept} Department</span>
                                          </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                          <span className="font-mono font-extrabold text-sm text-emerald-800">{item.fScore?.toFixed(1) || '—'}</span>
                                          {getCatBadge(item.fScore)}
                                        </div>
                                      </div>
                                    );
                                  })}
                              </div>
                            </div>

                            {/* Critical focus group coaching cards */}
                            <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-xs">
                              <h3 className="text-xs font-bold text-red-805 tracking-wider uppercase mb-3 flex items-center gap-1.5">
                                <span className="p-1 rounded-md bg-rose-50 text-rose-700">⚠️</span>
                                <span>Sasaran Mentoring / Coaching Tim</span>
                              </h3>
                              <div className="divide-y divide-gray-100">
                                {[...ALL_EMPS]
                                  .filter(emp => {
                                    if (filterDivision !== 'Semua' && emp.dept !== filterDivision) return false;
                                    return true;
                                  })
                                  .map(emp => ({ emp, fScore: getFilteredFinalScore(emp.id) }))
                                  .filter(x => x.fScore !== null)
                                  .sort((a,b) => (a.fScore || 99) - (b.fScore || 99))
                                  .filter(x => x.fScore !== null && x.fScore < 85)
                                  .slice(0, 4)
                                  .map((item) => {
                                    return (
                                      <div key={item.emp.id} className="py-3 first:pt-0 last:pb-0 flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                          <div className="w-8 h-8 rounded-full bg-rose-50 text-rose-800 font-bold flex items-center justify-center text-[11px]">
                                            {item.emp.name.substring(0, 2)}
                                          </div>
                                          <div>
                                            <span className="font-bold text-gray-850 block text-xs">{item.emp.name}</span>
                                            <span className="text-[10px] text-gray-400 block">{item.emp.dept} Department</span>
                                          </div>
                                        </div>
                                        <div className="flex items-center gap-2.5">
                                          <span className="font-mono font-bold text-rose-800">{item.fScore?.toFixed(1) || '—'}</span>
                                          <span className="text-[9px] bg-red-100/50 text-rose-800 border border-red-200 px-2 py-0.5 rounded font-bold">Sasaran Coaching</span>
                                        </div>
                                      </div>
                                    );
                                  })}
                              </div>
                            </div>
                          </div>

                      {/* RENCANA SUKSESI & STATUS PROMOSI TERPILIH (DIREKSI & HRD COOPERATIVE BOARD) */}
                      <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-xs">
                        <h3 className="text-xs font-bold text-indigo-950 tracking-wider uppercase mb-3 flex items-center justify-between">
                          <span className="flex items-center gap-1.5 font-extrabold text-indigo-950">
                            <span className="p-1 rounded-md bg-indigo-50 text-indigo-800">🎯</span>
                            <span>Papan Pertimbangan Suksesi & Promosi (Skor &gt; 90)</span>
                          </span>
                          <span className="text-[10px] text-gray-500 font-extrabold bg-gray-50 px-2 py-0.5 rounded border border-gray-150 font-mono">
                            Siklus: {quarters[selQAnalytics]?.label || selQAnalytics}
                          </span>
                        </h3>

                        {(() => {
                          const pCandidates = ALL_EMPS
                            .filter(emp => {
                              if (filterDivision !== 'Semua' && emp.dept !== filterDivision) return false;
                              return true;
                            })
                            .map(emp => {
                              const finalScoreVal = getFilteredFinalScore(emp.id);
                              return { emp, finalScoreVal };
                            }).filter(cand => cand.finalScoreVal !== null && cand.finalScoreVal >= 90);

                          if (pCandidates.length === 0) {
                            return (
                              <p className="text-xs text-gray-400 italic text-center py-6 font-medium">
                                Belum ada pegawai dengan Skor Akhir &gt; 90 pada siklus ini. Rencana suksesi belum diusulkan.
                              </p>
                            );
                          }

                          return (
                            <div className="overflow-x-auto">
                              <table className="w-full text-left font-sans text-xs text-gray-650 min-w-[500px]">
                                <thead>
                                  <tr className="bg-gray-50 border-b border-gray-200 font-bold text-[9px] uppercase tracking-wider text-gray-400">
                                    <th className="py-2.5 px-4 font-extrabold text-gray-450">Nama Pegawai (ID)</th>
                                    <th className="py-2.5 px-4 text-center font-extrabold text-gray-450">Skor Akhir</th>
                                    <th className="py-2.5 px-4 font-extrabold text-gray-450">Rencana Suksesi Organisasi (Pilihan HRD)</th>
                                    <th className="py-2.5 px-4 text-center font-extrabold text-gray-450">Status Diskusi Direksi & Kelayakan</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {pCandidates.map(({ emp, finalScoreVal }) => {
                                    const activeProm = promotions[emp.id] || {
                                      targetPlan: 'Promosi Ke Jabatan Lebih Tinggi (Senior / Lead)',
                                      status: 'pending',
                                      notes: ''
                                    };

                                    return (
                                      <tr key={emp.id} className="border-b border-gray-100 last:border-none hover:bg-gray-50/10 transition-colors">
                                        <td className="py-3 px-4">
                                          <div className="font-extrabold text-gray-805 text-sm">{emp.name}</div>
                                          <div className="text-[10px] text-gray-450 font-bold">{emp.dept} · ID: {emp.id}</div>
                                        </td>
                                        <td className="py-3 px-4 text-center">
                                          <span className="font-mono font-black text-emerald-900 bg-emerald-50 px-2.5 py-1 rounded inline-block text-[11px] border border-emerald-100">
                                            {finalScoreVal?.toFixed(1)}
                                          </span>
                                        </td>
                                        <td className="py-3 px-4">
                                          <span className="font-extrabold text-slate-800 block text-xs">{activeProm.targetPlan}</span>
                                          {activeProm.notes && (
                                            <span className="text-[10px] text-gray-455 font-semibold bg-gray-50 px-2 py-1 rounded-lg border border-gray-150 inline-block mt-1 leading-normal max-w-md">
                                              &ldquo;{activeProm.notes}&rdquo;
                                            </span>
                                          )}
                                        </td>
                                        <td className="py-3 px-4 text-center">
                                          <span className={`inline-block text-[9px] font-black uppercase px-2.5 py-1 rounded-full border ${
                                            activeProm.status === 'approved'
                                              ? 'bg-emerald-50 text-emerald-800 border-emerald-250'
                                              : activeProm.status === 'not approved'
                                              ? 'bg-rose-50 text-rose-800 border-rose-250'
                                              : 'bg-amber-50 text-amber-800 border-amber-250'
                                          }`}>
                                            {activeProm.status === 'approved' ? '🟢 Approved' : activeProm.status === 'not approved' ? '🔴 Not Approved' : '🟡 Pending'}
                                          </span>
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          );
                        })()}
                      </div>
                    </>
                  ) : analyticsSubTab === 'kpi_results' ? (
                    <div className="space-y-6">
                      {/* KPI Banner */}
                      <div className="bg-gradient-to-r from-emerald-700 to-teal-800 rounded-3xl p-5 sm:p-6 text-white shadow-md relative overflow-hidden">
                        <div className="absolute right-0 bottom-0 opacity-10 translate-x-1/4 translate-y-1/4 scale-150">
                          <Award className="w-64 h-64" />
                        </div>
                        <div className="relative z-10 space-y-2">
                          <span className="px-2.5 py-1 rounded-full bg-emerald-900/40 text-emerald-200 text-[10px] font-extrabold uppercase tracking-wide border border-emerald-500/20">
                            Analisis Khusus KPI
                          </span>
                          <h2 className="text-xl sm:text-2xl font-black tracking-tight font-sans">
                            Analisis Pencapaian KPI Bulanan Organisasi
                          </h2>
                          <p className="text-xs sm:text-sm text-emerald-100/90 leading-relaxed max-w-3xl">
                            Evaluasi kinerja objektif berdasarkan integrasi target kuantitatif bulanan per departemen untuk kuartal <span className="font-bold underline">{quarters[selQAnalytics]?.label || selQAnalytics}</span>.
                          </p>
                        </div>
                      </div>

                      {/* KPI Mini-stats Grid */}
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        {(() => {
                          const activeEmps = ALL_EMPS.filter(emp => {
                            if (filterDivision !== 'Semua' && emp.dept !== filterDivision) return false;
                            return true;
                          });
                          const allKpiScores = activeEmps.map(emp => getFilteredKpiAverage(emp.id)).filter((v): v is number => v !== null);
                          const avgKpi = allKpiScores.length > 0 ? (allKpiScores.reduce((a, b) => a + b, 0) / allKpiScores.length) : 0;
                          const maxKpi = allKpiScores.length > 0 ? Math.max(...allKpiScores) : 0;
                          const kpiOver80 = allKpiScores.filter(s => s >= 80).length;
                          const percentageOver80 = allKpiScores.length > 0 ? (kpiOver80 / allKpiScores.length) * 100 : 0;
                          const targetMonths = getFilteredMonths();

                          return (
                            <>
                              <div className="bg-white border border-gray-150 rounded-2xl p-4.5 shadow-3xs flex items-center gap-4 animate-fade-in">
                                <div className="w-11 h-11 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600">
                                  <Award className="w-5.5 h-5.5" />
                                </div>
                                <div>
                                  <div className="text-xl font-black text-gray-850 font-mono">{avgKpi.toFixed(1)}</div>
                                  <div className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Rerata KPI Organisasi</div>
                                </div>
                              </div>

                              <div className="bg-white border border-gray-150 rounded-2xl p-4.5 shadow-3xs flex items-center gap-4 animate-fade-in">
                                <div className="w-11 h-11 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600">
                                  <Target className="w-5.5 h-5.5" />
                                </div>
                                <div>
                                  <div className="text-xl font-black text-gray-850 font-mono">{maxKpi.toFixed(1)}</div>
                                  <div className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Skor KPI Tertinggi</div>
                                </div>
                              </div>

                              <div className="bg-white border border-gray-150 rounded-2xl p-4.5 shadow-3xs flex items-center gap-4 animate-fade-in">
                                <div className="w-11 h-11 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600">
                                  <TrendingUp className="w-5.5 h-5.5" />
                                </div>
                                <div>
                                  <div className="text-xl font-black text-gray-850 font-mono">{percentageOver80.toFixed(0)}%</div>
                                  <div className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">KPI Di Atas Standar (&ge;80)</div>
                                </div>
                              </div>

                              <div className="bg-white border border-gray-150 rounded-2xl p-4.5 shadow-3xs flex items-center gap-4 animate-fade-in">
                                <div className="w-11 h-11 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600">
                                  <Clock className="w-5.5 h-5.5" />
                                </div>
                                <div>
                                  <div className="text-xl font-black text-gray-850 font-mono">{targetMonths.length} Bulan</div>
                                  <div className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Siklus Penilaian Terpilih</div>
                                </div>
                              </div>
                            </>
                          );
                        })()}
                      </div>

                      {/* Department KPI and Employee leaderboard Grid */}
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* 🏢 Department KPI */}
                        {(() => {
                          const activeEmps = ALL_EMPS.filter(emp => {
                            if (filterDivision !== 'Semua' && emp.dept !== filterDivision) return false;
                            return true;
                          });
                          const depts = Array.from(new Set(activeEmps.map(e => e.dept)));
                          const deptData = depts.map(d => {
                            const deptEmps = activeEmps.filter(e => e.dept === d);
                            const deptScores = deptEmps.map(emp => getFilteredKpiAverage(emp.id)).filter((v): v is number => v !== null);
                            const avg = deptScores.length > 0 ? (deptScores.reduce((a, b) => a + b, 0) / deptScores.length) : 0;
                            return { name: d, avg, count: deptEmps.length };
                          }).sort((a, b) => b.avg - a.avg);

                          return (
                            <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-xs">
                              <h3 className="text-xs font-bold text-gray-800 tracking-wider uppercase mb-4 flex items-center gap-2 border-b border-gray-100 pb-2.5">
                                <span className="p-1 rounded-lg bg-emerald-50 text-emerald-700">🏢</span>
                                <span>Rerata KPI Bulanan per Departemen</span>
                              </h3>
                              <div className="space-y-4">
                                {deptData.map((d, i) => (
                                  <div key={i} className="space-y-1">
                                    <div className="flex justify-between items-center text-xs">
                                      <span className="font-bold text-slate-700">
                                        {d.name}{' '}
                                        <span className="font-normal text-gray-400 text-[10px]">
                                          ({d.count} Pegawai)
                                        </span>
                                      </span>
                                      <span className="font-bold text-emerald-800 font-mono bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">
                                        {d.avg.toFixed(1)} / 100
                                      </span>
                                    </div>
                                    <div className="h-2.5 bg-gray-100 rounded-md overflow-hidden">
                                      <motion.div
                                        initial={{ width: 0 }}
                                        animate={{ width: `${d.avg}%` }}
                                        transition={{ duration: 0.8, delay: i * 0.1 }}
                                        className="h-full bg-gradient-to-r from-emerald-500 to-teal-600 rounded-md"
                                      />
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })()}

                        {/* 📅 Monthly Breakdown */}
                        {(() => {
                          const activeEmps = ALL_EMPS.filter(emp => {
                            if (filterDivision !== 'Semua' && emp.dept !== filterDivision) return false;
                            return true;
                          });
                          const months = getFilteredMonths();
                          const monthlyData = months.map(m => {
                            const scores = activeEmps.map(emp => getLatestKpiScoreVal(emp.id, m)).filter((v): v is number => v !== null);
                            const avg = scores.length > 0 ? (scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
                            return { month: m, avg };
                          });

                          return (
                            <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-xs">
                              <h3 className="text-xs font-bold text-gray-800 tracking-wider uppercase mb-4 flex items-center gap-2 border-b border-gray-100 pb-2.5">
                                <span className="p-1 rounded-lg bg-indigo-50 text-indigo-700">📅</span>
                                <span>Perkembangan KPI Bulanan Organisasi</span>
                              </h3>
                              {monthlyData.length === 0 ? (
                                <p className="text-xs text-gray-400 italic font-bold">Tidak ada data bulan untuk kuartal ini.</p>
                              ) : (
                                <div className="space-y-4">
                                  {monthlyData.map((m, i) => (
                                    <div key={i} className="space-y-1">
                                      <div className="flex justify-between items-center text-xs">
                                        <span className="font-bold text-slate-700">
                                          Bulan {m.month}
                                        </span>
                                        <span className="font-bold text-indigo-805 font-mono bg-indigo-50 px-2' py-0.5 rounded border border-indigo-100">
                                          {m.avg.toFixed(1)}
                                        </span>
                                      </div>
                                      <div className="h-2.5 bg-gray-100 rounded-md overflow-hidden">
                                        <motion.div
                                          initial={{ width: 0 }}
                                          animate={{ width: `${m.avg}%` }}
                                          transition={{ duration: 0.8, delay: i * 0.1 }}
                                          className="h-full bg-gradient-to-r from-indigo-500 to-blue-600 rounded-md"
                                        />
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </div>

                      {/* Leaders and Under-performers of KPI */}
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Leaders of KPI */}
                        <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-xs">
                          <h3 className="text-xs font-bold text-gray-800 tracking-wider uppercase mb-4 flex items-center gap-2 border-b border-gray-100 pb-2.5">
                            <span className="p-1 rounded-lg bg-amber-50 text-amber-700">🏆</span>
                            <span>Bintang KPI Teratas (KPI Top Performers)</span>
                          </h3>
                          <div className="space-y-3">
                            {ALL_EMPS
                              .filter(emp => {
                                if (filterDivision !== 'Semua' && emp.dept !== filterDivision) return false;
                                return true;
                              })
                              .map(emp => {
                                const kpiAvg = getFilteredKpiAverage(emp.id);
                                return { emp, kpiAvg };
                              })
                              .filter(x => x.kpiAvg !== null)
                              .sort((a,b) => (b.kpiAvg || 0) - (a.kpiAvg || 0))
                              .slice(0, 6)
                              .map((item, idx) => (
                                <div key={item.emp.id} className="p-3 bg-emerald-50/20 rounded-xl border border-emerald-100 flex items-center justify-between gap-4">
                                  <div className="flex items-center gap-3">
                                    <span className="font-mono text-xs font-black text-emerald-800 w-5">#{idx + 1}</span>
                                    <div>
                                      <span className="font-bold text-gray-800 text-xs block">{item.emp.name}</span>
                                      <span className="text-[10px] text-gray-400 block">{item.emp.dept} · ID: {item.emp.id}</span>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2.5">
                                    <span className="font-mono font-black text-emerald-800 text-xs bg-emerald-50 px-2 py-1 rounded border border-emerald-150">{item.kpiAvg?.toFixed(1)}</span>
                                    {getCatBadge(item.kpiAvg)}
                                  </div>
                                </div>
                              ))}
                          </div>
                        </div>

                        {/* Lowest KPI Performers */}
                        <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-xs">
                          <h3 className="text-xs font-bold text-gray-800 tracking-wider uppercase mb-4 flex items-center gap-2 border-b border-gray-100 pb-2.5">
                            <span className="p-1 rounded-lg bg-rose-50 text-rose-700">📈</span>
                            <span>Pegawai dengan KPI Terendah / Perlu Bimbingan</span>
                          </h3>
                          <div className="space-y-3">
                            {ALL_EMPS
                              .filter(emp => {
                                if (filterDivision !== 'Semua' && emp.dept !== filterDivision) return false;
                                return true;
                              })
                              .map(emp => {
                                const kpiAvg = getFilteredKpiAverage(emp.id);
                                return { emp, kpiAvg };
                              })
                              .filter(x => x.kpiAvg !== null)
                              .sort((a,b) => (a.kpiAvg || 0) - (b.kpiAvg || 0))
                              .slice(0, 6)
                              .map((item, idx) => (
                                <div key={item.emp.id} className="p-3 bg-rose-50/10 rounded-xl border border-rose-100 border-dashed flex items-center justify-between gap-4">
                                  <div className="flex items-center gap-3">
                                    <span className="font-mono text-xs font-black text-rose-800 w-5">#{idx + 1}</span>
                                    <div>
                                      <span className="font-bold text-gray-800 text-xs block">{item.emp.name}</span>
                                      <span className="text-[10px] text-gray-400 block">{item.emp.dept} · ID: {item.emp.id}</span>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2.5">
                                    <span className="font-mono font-black text-rose-800 text-xs bg-rose-50 px-2 py-1 rounded border border-rose-150">{item.kpiAvg?.toFixed(1)}</span>
                                    {getCatBadge(item.kpiAvg)}
                                  </div>
                                </div>
                              ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : analyticsSubTab === 'feedback_360' ? (
                    <div className="space-y-6">
                      {/* 360 Feedback Alert Banner */}
                      {(() => {
                        const activeQuarter = quarters[selQAnalytics];
                        const is360ActiveForQ = activeQuarter?.has360 || false;

                        return (
                          <>
                            {!is360ActiveForQ ? (
                              <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-250 rounded-2xl p-5 shadow-3xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                <div className="space-y-1">
                                  <div className="flex items-center gap-2">
                                    <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 text-[9px] font-bold font-mono tracking-wider uppercase">Info Terkait</span>
                                    <h4 className="text-xs font-black text-amber-950 uppercase tracking-widest">Penilaian 360° Belum Berlangsung</h4>
                                  </div>
                                  <p className="text-xs text-amber-900 leading-relaxed font-bold">
                                    Kuartal Terpilih ({activeQuarter?.label || selQAnalytics}) berstatus "KPI Murni" sehingga evaluasi 360° tidak diaktifkan secara operasional.
                                  </p>
                                  <p className="text-[11px] text-amber-800/80 leading-normal">
                                    Untuk konsistensi grafik, chart di bawah menyajikan simulasi hasil penilaian terakhir (periode Q1 2026).
                                  </p>
                                </div>
                                <div className="shrink-0 bg-amber-150 text-amber-900 px-3.5 py-1.5 rounded-lg text-center font-bold text-xs uppercase tracking-wide border border-amber-250">
                                  YANG DIGUNAKAN: PENILAIAN TERAKHIR (Q1 2026)
                                </div>
                              </div>
                            ) : (
                              <div className="bg-gradient-to-r from-indigo-700 to-indigo-800 rounded-3xl p-5 sm:p-6 text-white shadow-md relative overflow-hidden">
                                <div className="absolute right-0 bottom-0 opacity-10 translate-x-1/4 translate-y-1/4 scale-150">
                                  <TrendingUp className="w-64 h-64" />
                                </div>
                                <div className="relative z-10 space-y-2">
                                  <span className="px-2.5 py-1 rounded-full bg-indigo-900/40 text-indigo-200 text-[10px] font-extrabold uppercase tracking-wide border border-indigo-500/20">
                                    Umpan Balik Multidimensi
                                  </span>
                                  <h2 className="text-xl sm:text-2xl font-black tracking-tight font-sans">
                                    Analisis Evaluasi Budaya 360° Feedback
                                  </h2>
                                  <p className="text-xs sm:text-sm text-indigo-100/90 leading-relaxed max-w-3xl">
                                    Hasil penilaian kompetensi perilaku sosiometris dari berbagai sudut pandang penilai (Self, Peer, Subordinate, &amp; Supervisor) di kuartal <span className="font-bold underline">{activeQuarter?.label || selQAnalytics}</span>.
                                  </p>
                                </div>
                              </div>
                            )}

                            {/* Stats Grid */}
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                              {(() => {
                                const activeEmps = ALL_EMPS.filter(emp => {
                                  if (filterDivision !== 'Semua' && emp.dept !== filterDivision) return false;
                                  return true;
                                });
                                const all360Scores = activeEmps.map(emp => {
                                  if (is360ActiveForQ) {
                                    return getScore360ForQuarter(emp.id, selQAnalytics) ?? null;
                                  } else {
                                    return INITIAL_SCORE_360[emp.id] ?? null;
                                  }
                                }).filter((v): v is number => v !== null);

                                const avg360 = all360Scores.length > 0 ? (all360Scores.reduce((a, b) => a + b, 0) / all360Scores.length) : 0;
                                const max360 = all360Scores.length > 0 ? Math.max(...all360Scores) : 0;

                                return (
                                  <>
                                    <div className="bg-white border border-gray-150 rounded-2xl p-4.5 shadow-3xs flex items-center gap-4 animate-fade-in">
                                      <div className="w-11 h-11 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600">
                                        <TrendingUp className="w-5.5 h-5.5" />
                                      </div>
                                      <div>
                                        <div className="text-xl font-black text-gray-850 font-mono">{avg360.toFixed(1)}</div>
                                        <div className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Rerata Nilai 360°</div>
                                      </div>
                                    </div>

                                    <div className="bg-white border border-gray-150 rounded-2xl p-4.5 shadow-3xs flex items-center gap-4 animate-fade-in">
                                      <div className="w-11 h-11 rounded-xl bg-violet-50 flex items-center justify-center text-violet-600">
                                        <Award className="w-5.5 h-5.5" />
                                      </div>
                                      <div>
                                        <div className="text-xl font-black text-gray-850 font-mono">{max360.toFixed(1)}</div>
                                        <div className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Nilai 360° Tertinggi</div>
                                      </div>
                                    </div>

                                    <div className="bg-white border border-gray-150 rounded-2xl p-4.5 shadow-3xs flex items-center gap-4 animate-fade-in">
                                      <div className="w-11 h-11 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600">
                                        <Users className="w-5.5 h-5.5" />
                                      </div>
                                      <div>
                                        <div className="text-xl font-black text-gray-850 font-mono">100%</div>
                                        <div className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Tingkat Partisipasi</div>
                                      </div>
                                    </div>

                                    <div className="bg-white border border-gray-150 rounded-2xl p-4.5 shadow-3xs flex items-center gap-4 animate-fade-in">
                                      <div className="w-11 h-11 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600">
                                        <CheckCircle className="w-5.5 h-5.5" />
                                      </div>
                                      <div>
                                        <div className="text-xl font-black text-gray-850 font-mono">Lengkap</div>
                                        <div className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Status Validasi</div>
                                      </div>
                                    </div>
                                  </>
                                );
                              })()}
                            </div>

                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                              {/* 1. Aspek Core Culture */}
                              <div className="bg-white border border-gray-200/80 rounded-2xl p-5 shadow-xs">
                                <h4 className="text-sm font-bold text-gray-800 mb-4 flex items-center gap-2 border-b border-gray-100 pb-2.5">
                                  <span>✨</span> Indeks Sub-Aspek Kompetensi &amp; Perilaku
                                </h4>
                                <div className="space-y-4">
                                  {ASPEK.map((asp, idx) => {
                                    const score = ASPEK_SCORES[idx] || 85;
                                    const scoreColor = score >= 90 ? 'bg-indigo-600' : score >= 80 ? 'bg-indigo-500' : 'bg-amber-500';
                                    return (
                                      <div key={idx} className="space-y-1">
                                        <div className="flex justify-between items-center text-xs">
                                          <span className="font-bold text-gray-705">⭐ {asp}</span>
                                          <span className="text-xs font-extrabold text-indigo-900 font-mono bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">{score} / 100</span>
                                        </div>
                                        <div className="h-3 bg-gray-100 rounded-md overflow-hidden">
                                          <motion.div
                                            initial={{ width: 0 }}
                                            animate={{ width: `${score}%` }}
                                            transition={{ duration: 1, delay: idx * 0.08 }}
                                            className={`h-full rounded-md ${scoreColor}`}
                                          />
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                                {!is360ActiveForQ && (
                                  <div className="mt-4 p-3 bg-amber-50/50 border border-amber-200 rounded-xl">
                                    <p className="text-[10px] text-amber-900/95 italic font-semibold leading-relaxed">
                                      * Catatan Simulasi: Karena kuartal terpilih berformat KPI Murni, grafik di atas menampilkan rekam ulas historis terakhir (Q1 2026) sebagai keterangan visual sesuai standar penilaian.
                                    </p>
                                  </div>
                                )}
                              </div>

                              {/* 2. Rating Source Breakdown */}
                              <div className="bg-white border border-gray-200/80 rounded-2xl p-5 shadow-xs flex flex-col justify-between">
                                <div>
                                  <h4 className="text-sm font-bold text-gray-800 mb-2 flex items-center gap-2 border-b border-gray-100 pb-2.5">
                                    <span>🎯</span> Distribusi Rerata Penilai Sosiometris (360°)
                                  </h4>
                                  <p className="text-[11px] text-gray-400 mb-4 leading-normal">
                                    Timbangan bobot penilaian 360 derajat berdasarkan relevansi hubungan dinilai &amp; penilai secara silang untuk objektivitas komparatif.
                                  </p>
                                  <div className="grid grid-cols-2 gap-3.5">
                                    <div className="p-3 bg-gray-50/50 rounded-2xl border border-gray-100">
                                      <span className="text-[9px] text-indigo-750 font-bold block uppercase tracking-wider mb-1">Self (Diri Sendiri)</span>
                                      <div className="flex items-baseline gap-1">
                                        <span className="text-base font-black text-gray-800 font-mono">88.5</span>
                                        <span className="text-[8px] text-gray-400 uppercase font-mono font-bold">(Bobot 10%)</span>
                                      </div>
                                    </div>
                                    <div className="p-3 bg-gray-50/50 rounded-2xl border border-gray-100">
                                      <span className="text-[9px] text-emerald-800 font-bold block uppercase tracking-wider mb-1">Peers (Rekan Sejawat)</span>
                                      <div className="flex items-baseline gap-1">
                                        <span className="text-base font-black text-gray-800 font-mono">86.2</span>
                                        <span className="text-[8px] text-gray-400 uppercase font-mono font-bold">(Bobot 30%)</span>
                                      </div>
                                    </div>
                                    <div className="p-3 bg-gray-50/50 rounded-2xl border border-gray-100">
                                      <span className="text-[9px] text-amber-850 font-bold block uppercase tracking-wider mb-1">Subordinates (Bawahan)</span>
                                      <div className="flex items-baseline gap-1">
                                        <span className="text-base font-black text-gray-800 font-mono">85.4</span>
                                        <span className="text-[8px] text-gray-400 uppercase font-mono font-bold">(Bobot 30%)</span>
                                      </div>
                                    </div>
                                    <div className="p-3 bg-gray-50/50 rounded-2xl border border-gray-100">
                                      <span className="text-[9px] text-rose-800 font-bold block uppercase tracking-wider mb-1">Supervisor (Atasan)</span>
                                      <div className="flex items-baseline gap-1">
                                        <span className="text-base font-black text-gray-800 font-mono">89.1</span>
                                        <span className="text-[8px] text-gray-400 uppercase font-mono font-bold">(Bobot 30%)</span>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>

                            {/* 🏢 Perbandingan Hasil Evaluasi Budaya Per Divisi */}
                            <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-xs">
                              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-gray-100 pb-3 mb-4">
                                <div>
                                  <h3 className="text-xs font-bold text-gray-800 tracking-wider uppercase flex items-center gap-2">
                                    <span className="p-1 rounded bg-indigo-50 text-indigo-700">🏢</span>
                                    <span>Perbandingan Hasil Evaluasi Budaya Per Divisi</span>
                                  </h3>
                                  <p className="text-[11px] text-gray-400 mt-0.5">
                                    Analisis komparatif kinerja sosiometris (360° Feedback) antar divisi/sektor organisasi.
                                  </p>
                                </div>
                              </div>

                              <div className="space-y-4">
                                {(() => {
                                  const depts = Array.from(new Set(ALL_EMPS.map(e => e.dept))).sort();
                                  const dept360Data = depts.map(dept => {
                                    const deptEmps = ALL_EMPS.filter(e => e.dept === dept);
                                    const scores = deptEmps
                                      .map(emp => is360ActiveForQ ? (getScore360ForQuarter(emp.id, selQAnalytics) ?? null) : (INITIAL_SCORE_360[emp.id] ?? null))
                                      .filter((v): v is number => v !== null);
                                    const avg = scores.length > 0 ? (scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
                                    const max = scores.length > 0 ? Math.max(...scores) : 0;
                                    const min = scores.length > 0 ? Math.min(...scores) : 0;
                                    return { name: dept, avg, max, min, count: deptEmps.length };
                                  }).sort((a, b) => b.avg - a.avg);

                                  return (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                      <div className="space-y-3">
                                        {dept360Data.map((d, index) => {
                                          const percentage = d.avg;
                                          const barColor = percentage >= 88 ? 'bg-indigo-600' : percentage >= 85 ? 'bg-indigo-500' : 'bg-amber-500';
                                          return (
                                            <div key={d.name} className="p-3 bg-gray-50/50 hover:bg-indigo-50/20 transition-all rounded-xl border border-gray-100">
                                              <div className="flex justify-between items-center text-xs mb-1.5">
                                                <div className="flex items-center gap-2">
                                                  <span className="font-mono text-[9px] font-bold text-indigo-800 bg-indigo-50 px-1.5 py-0.5 rounded-md">
                                                    #{index + 1}
                                                  </span>
                                                  <span className="font-bold text-gray-700">{d.name}</span>
                                                  <span className="text-[9px] text-gray-405">({d.count} Karyawan)</span>
                                                </div>
                                                <span className="font-mono font-extrabold text-indigo-900 text-xs">{d.avg.toFixed(1)} / 100</span>
                                              </div>
                                              <div className="h-2 bg-gray-100 rounded-lg overflow-hidden">
                                                <motion.div
                                                  initial={{ width: 0 }}
                                                  animate={{ width: `${percentage}%` }}
                                                  transition={{ duration: 0.8, delay: index * 0.05 }}
                                                  className={`h-full rounded-lg ${barColor}`}
                                                />
                                              </div>
                                              <div className="flex justify-between items-center text-[9px] text-gray-400 mt-1.5 font-sans font-medium">
                                                <span>Terendah: <strong className="font-mono text-gray-600 font-bold">{d.min.toFixed(1)}</strong></span>
                                                <span>Tertinggi: <strong className="font-mono text-gray-600 font-bold">{d.max.toFixed(1)}</strong></span>
                                              </div>
                                            </div>
                                          );
                                        })}
                                      </div>

                                      <div className="bg-indigo-50/20 rounded-2xl p-4 border border-indigo-100 flex flex-col justify-between">
                                        <div>
                                          <h4 className="text-[11px] font-black text-indigo-950 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                                            <span>💡</span> Insight Evaluasi Budaya Antar Divisi
                                          </h4>
                                          <p className="text-[10.5px] text-indigo-900/90 leading-relaxed">
                                            {(() => {
                                              const bestDept = dept360Data[0];
                                              const needCoachingDept = dept360Data[dept360Data.length - 1];
                                              return (
                                                <>
                                                  Divisi dengan implementasi sosiometris &amp; keselarasan budaya organisasi terbaik saat ini adalah <strong className="font-bold text-indigo-950">{bestDept?.name}</strong> dengan rata-rata skor inter-personal mencapai <strong className="font-mono font-bold text-indigo-950 bg-indigo-100/60 px-1.5 py-0.2 rounded">{bestDept?.avg.toFixed(1)}</strong>.
                                                  <br /><br />
                                                  Sebaliknya, <strong className="font-bold text-indigo-950">{needCoachingDept?.name}</strong> (rerata <strong className="font-bold text-indigo-950">{needCoachingDept?.avg.toFixed(1)}</strong>) disarankan untuk mengadakan FGD (Focus Group Discussion) internal untuk meningkatkan aspek kolaborasi, keterbukan ulasan, serta komunikasi horizontal sosiometris antar rekan kerja tim.
                                                </>
                                              );
                                            })()}
                                          </p>
                                        </div>
                                        <div className="mt-4 pt-3 border-t border-indigo-100/60 flex items-center justify-between text-[9px] text-indigo-700/80 font-bold uppercase tracking-wider">
                                          <span>Metrik Valid: Standar Deviasi &lt; 2.5</span>
                                          <span>Siklus Penilaian Terkalibrasi</span>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })()}
                              </div>
                            </div>

                             {/* Completed Employees list and Under-performers 360 */}
                             <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                               {/* Completed Employees list */}
                               <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-xs">
                                 <h3 className="text-xs font-bold text-gray-800 tracking-wider uppercase mb-4 flex items-center gap-2 border-b border-gray-100 pb-2.5">
                                   <span className="p-1 rounded-lg bg-indigo-50 text-indigo-700">🏆</span>
                                   <span>Evaluasi Budaya Teraktif / Tertinggi</span>
                                 </h3>
                                 <div className="space-y-3">
                                   {ALL_EMPS
                                     .filter(emp => {
                                       if (filterDivision !== 'Semua' && emp.dept !== filterDivision) return false;
                                       return true;
                                     })
                                     .map(emp => {
                                       const s360 = is360ActiveForQ ? (getScore360ForQuarter(emp.id, selQAnalytics) ?? null) : (INITIAL_SCORE_360[emp.id] ?? null);
                                       return { emp, s360 };
                                     })
                                     .filter(x => x.s360 !== null)
                                     .sort((a,b) => (b.s360 || 0) - (a.s360 || 0))
                                     .slice(0, 6)
                                     .map((item, idx) => (
                                       <div key={item.emp.id} className="p-3 bg-indigo-50/20 rounded-xl border border-indigo-100 flex items-center justify-between">
                                         <div className="flex items-center gap-2.5">
                                           <span className="font-mono text-xs font-black text-indigo-800 w-5">#{idx + 1}</span>
                                           <div className="w-8 h-8 rounded-full bg-indigo-50 text-indigo-805 flex items-center justify-center font-black text-xs">
                                             {item.emp.name.substring(0, 2)}
                                           </div>
                                           <div>
                                             <span className="font-bold text-gray-850 text-xs block">{item.emp.name}</span>
                                             <span className="text-[9px] text-gray-400 block font-semibold">{item.emp.dept}</span>
                                           </div>
                                         </div>
                                         <span className="font-mono font-black text-xs text-indigo-850 bg-indigo-50/30 px-2 py-0.5 rounded border border-indigo-150">
                                           {item.s360?.toFixed(1)}
                                         </span>
                                       </div>
                                     ))}
                                 </div>
                               </div>

                               {/* Under-performers 360 */}
                               <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-xs">
                                 <h3 className="text-xs font-bold text-gray-800 tracking-wider uppercase mb-4 flex items-center gap-2 border-b border-gray-100 pb-2.5">
                                   <span className="p-1 rounded-lg bg-rose-50 text-rose-700">⚠️</span>
                                   <span>Nilai Evaluasi Budaya Terendah / Perlu Perhatian</span>
                                 </h3>
                                 <div className="space-y-3">
                                   {ALL_EMPS
                                     .filter(emp => {
                                       if (filterDivision !== 'Semua' && emp.dept !== filterDivision) return false;
                                       return true;
                                     })
                                     .map(emp => {
                                       const s360 = is360ActiveForQ ? (getScore360ForQuarter(emp.id, selQAnalytics) ?? null) : (INITIAL_SCORE_360[emp.id] ?? null);
                                       return { emp, s360 };
                                     })
                                     .filter(x => x.s360 !== null)
                                     .sort((a,b) => (a.s360 || 0) - (b.s360 || 0))
                                     .slice(0, 6)
                                     .map((item, idx) => (
                                       <div key={item.emp.id} className="p-3 bg-rose-50/10 rounded-xl border border-rose-150 border-dashed flex items-center justify-between">
                                         <div className="flex items-center gap-2.5">
                                           <span className="font-mono text-xs font-black text-rose-800 w-5">#{idx + 1}</span>
                                           <div className="w-8 h-8 rounded-full bg-rose-50 text-rose-805 flex items-center justify-center font-black text-xs">
                                             {item.emp.name.substring(0, 2)}
                                           </div>
                                           <div>
                                             <span className="font-bold text-gray-850 text-xs block">{item.emp.name}</span>
                                             <span className="text-[9px] text-gray-400 block font-semibold">{item.emp.dept}</span>
                                           </div>
                                         </div>
                                         <span className="font-mono font-black text-xs text-rose-850 bg-rose-50 px-2 py-0.5 rounded border border-rose-100 font-bold">
                                           {item.s360?.toFixed(1)}
                                         </span>
                                       </div>
                                     ))}
                                 </div>
                               </div>
                             </div>
                          </>
                        );
                      })()}
                    </div>
                  ) : (
                      <div className="space-y-4">
                        {/* Tabel hasil seluruh pegawai */}
                        <div className="bg-white border border-gray-150 rounded-2xl overflow-hidden shadow-3xs shadow-slate-100">
                          <div className="p-5 border-b border-gray-150 bg-gray-50/40 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <div>
                              <h3 className="text-sm font-bold text-gray-800">Tabel Hasil Penilaian Seluruh Pegawai</h3>
                              <p className="text-[11px] text-gray-450 font-medium">Membandingkan KPI Rata-rata, Evaluasi 360°, dan Skor Akhir Kalibrasi untuk kuartal {quarters[selQAnalytics]?.label || selQAnalytics}.</p>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-gray-500">Cari Karyawan:</span>
                              <div className="relative">
                                <input
                                  type="text"
                                  placeholder="Nama atau ID..."
                                  value={searchQueryAllEmployees}
                                  onChange={(e) => setSearchQueryAllEmployees(e.target.value)}
                                  className="text-xs pl-8 pr-3 py-2 border border-gray-250 rounded-xl focus:outline-none focus:ring-1 focus:ring-emerald-700 w-full sm:w-48 bg-white"
                                />
                                <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-2.5" />
                              </div>
                            </div>
                          </div>
                          <div className="overflow-x-auto">
                            <table className="w-full text-left font-sans text-xs text-gray-650 min-w-[800px] border-collapse">
                              <thead>
                                <tr className="border-b border-gray-150 bg-gray-100/50 text-[10px] text-gray-400 font-extrabold uppercase tracking-wider">
                                  <th className="py-3 px-4">Karyawan (ID)</th>
                                  <th className="py-3 px-4">Divisi &amp; Jabatan</th>
                                  <th className="py-3 px-4 text-center">Rerata KPI Kerja</th>
                                  <th className="py-3 px-4 text-center">Evaluasi 360°</th>
                                  <th className="py-3 px-4 text-center">Skor Akhir Kalibrasi</th>
                                  <th className="py-3 px-4">Rencana Suksesi / Promosi</th>
                                  <th className="py-3 px-4 text-right">Kategori Evaluasi</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100">
                                {(() => {
                                  const filteredList = ALL_EMPS.filter(emp => {
                                    if (filterDivision !== 'Semua' && emp.dept !== filterDivision) return false;
                                    if (!searchQueryAllEmployees) return true;
                                    const query = searchQueryAllEmployees.toLowerCase();
                                    return emp.name.toLowerCase().includes(query) || emp.id.toLowerCase().includes(query);
                                  });

                                  if (filteredList.length === 0) {
                                    return (
                                      <tr>
                                        <td colSpan={7} className="py-12 text-center text-gray-405 font-bold italic">
                                          Tidak ditemukan pegawai dengan nama &ldquo;{searchQueryAllEmployees}&rdquo;
                                        </td>
                                      </tr>
                                    );
                                  }

                                  const activeQuarter = quarters[selQAnalytics];
                                  const is360ActiveForQ = activeQuarter?.has360 || false;

                                  return filteredList.map((emp) => {
                                    const kpiAvg = getFilteredKpiAverage(emp.id);
                                    const s360 = getFilteredQuarterKeys().some(q => quarters[q]?.has360)
                                      ? (is360ActiveForQ ? (getScore360ForQuarter(emp.id, selQAnalytics) ?? null) : (INITIAL_SCORE_360[emp.id] ?? null))
                                      : null;
                                    const finalScore = getFilteredFinalScore(emp.id);
                                    const promPlan = promotions[emp.id] || null;

                                    return (
                                      <tr key={emp.id} className="hover:bg-slate-50/40 transition-colors">
                                        <td className="py-3.5 px-4 font-sans">
                                          <div className="flex items-center gap-2.5">
                                            <div className="w-8 h-8 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-800 flex items-center justify-center font-black text-xs uppercase shadow-3xs">
                                              {emp.name.slice(0, 2)}
                                            </div>
                                            <div>
                                              <span className="block font-extrabold text-slate-800">{emp.name}</span>
                                              <span className="block text-[10px] text-gray-400 font-mono font-bold tracking-wider">{emp.id}</span>
                                            </div>
                                          </div>
                                        </td>
                                        <td className="py-3.5 px-4 font-sans font-bold text-[11px] text-slate-700">
                                          <span className="block">{emp.dept}</span>
                                          <span className="block text-[9px] text-gray-400 uppercase font-sans tracking-wide">{getUserRoleLabel(emp.role)}</span>
                                        </td>
                                        <td className="py-3.5 px-4 text-center font-mono font-black text-emerald-800 text-xs">
                                          {kpiAvg !== null ? (
                                            <span className="bg-emerald-50 text-emerald-850 px-2.5 py-1 rounded inline-block border border-emerald-100">
                                              {kpiAvg.toFixed(1)}
                                            </span>
                                          ) : (
                                            <span className="text-gray-400">—</span>
                                          )}
                                        </td>
                                        <td className="py-3.5 px-4 text-center font-mono font-black text-indigo-700 text-xs">
                                          {s360 !== null ? (
                                            <span className="bg-indigo-50 text-indigo-800 px-2.5 py-1 rounded inline-block border border-indigo-150">
                                              {s360.toFixed(1)}
                                            </span>
                                          ) : (
                                            <span className="text-gray-400">—</span>
                                          )}
                                        </td>
                                        <td className="py-3.5 px-4 text-center font-mono font-black text-slate-800 text-sm">
                                          {finalScore !== null ? (
                                            <span className="bg-slate-50 border border-gray-200 text-slate-800 px-2.5 py-1 rounded inline-block">
                                              {finalScore.toFixed(1)}
                                            </span>
                                          ) : (
                                            <span className="text-gray-444 italic">—</span>
                                          )}
                                        </td>
                                        <td className="py-3.5 px-4 max-w-xs">
                                          {promPlan ? (
                                            <div className="space-y-1">
                                              <span className="font-extrabold text-slate-800 block text-xs" title={promPlan.targetPlan}>
                                                {promPlan.targetPlan}
                                              </span>
                                              <span className={`inline-block text-[9px] font-black uppercase px-2 py-0.5 rounded border ${
                                                promPlan.status === 'approved' ? 'bg-emerald-50 text-emerald-850 border-emerald-250' :
                                                promPlan.status === 'not approved' ? 'bg-rose-50 text-rose-800 border-rose-250' : 'bg-amber-50 text-amber-850 border-amber-250'
                                              }`}>
                                                {promPlan.status}
                                              </span>
                                            </div>
                                          ) : (
                                            <span className="text-gray-400 italic">Tidak ada rencana</span>
                                          )}
                                        </td>
                                        <td className="py-3.5 px-4 text-right">
                                          {getCatBadge(finalScore)}
                                        </td>
                                      </tr>
                                    );
                                  });
                                })()}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                  {/* TAB 7: PEER MAPPING CONFIG DETAILS (HRD ONLY) */}
                  {page === 'mapping' && currentUser.role === 'hrd' && (
                    <div className="space-y-4">
                      <div>
                        <h2 className="text-xl font-bold text-gray-800 tracking-tight">Kelola Penjadwalan Penilai 360° (Mapping)</h2>
                        <span className="text-xs text-gray-400 font-medium">Tentukan dan delegasi siapa menilai siapa di kuartal rilis untuk menghindari bias konflik.</span>
                      </div>

                      {/* Import and summary grids */}
                      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                        {/* Drag and drop Simulated element */}
                        <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-xs flex flex-col justify-between">
                          <h3 className="text-xs font-bold text-gray-700 uppercase tracking-widest mb-3">Impor Massal Pemetaan Excel</h3>
                          
                          <div className="border-2 border-dashed border-emerald-450 rounded-xl p-4 text-center cursor-pointer relative bg-emerald-50/20 hover:bg-emerald-50/40 transition-colors">
                            <input
                              type="file"
                              accept=".xlsx,.xls"
                              onChange={simulateExcelUpload}
                              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                            />
                            <div className="space-y-2 py-4">
                              <UploadCloud className="w-10 h-10 mx-auto text-emerald-800" />
                              <div className="text-xs font-bold text-gray-800">
                                {excelUploading ? 'Mengurai Berkas Excel...' : 'Drag & Drop berkas pemetaan Excel'}
                              </div>
                              <p className="text-[10px] text-gray-400 font-medium">Mendukung format standard organisasi (.xlsx, .xls)</p>
                            </div>
                          </div>

                          <div className="mt-3 flex flex-wrap gap-2 justify-between">
                            <span className="text-[10px] text-gray-404 font-semibold shrink-0">Butuh template Excel?</span>
                            <button
                              type="button"
                              onClick={() => showToast('Mendownload template Excel...', 'info')}
                              className="text-[10px] font-bold text-emerald-800 hover:underline cursor-pointer flex items-center gap-1 shrink-0"
                            >
                              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700" />
                              <span>Unduh Formulir Acuan (.xlsx)</span>
                            </button>
                          </div>
                        </div>

                        {/* Summary state column and Manual Add pairing Mapping form */}
                        <div className="p-5 bg-white border border-gray-200 rounded-2xl shadow-xs space-y-4 lg:col-span-2 flex flex-col justify-between">
                          <div className="flex flex-col gap-1">
                            <h3 className="text-xs font-bold text-gray-700 uppercase tracking-widest">Pendaftaran Sepasang Relasi Manual</h3>
                            <span className="text-[10px] text-gray-400">Sistem akan menyarankan tipe relasi secara otomatis berdasarkan hirarki jabatan penilai dan target.</span>
                          </div>
                          
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                            <div>
                              <label className="block text-[10px] text-gray-400 font-bold mb-1">PEGAWAI PENILAI</label>
                              <select
                                value={mappingInputPenilai}
                                onChange={(e) => {
                                  const nextPenilai = e.target.value;
                                  setMappingInputPenilai(nextPenilai);
                                  setMappingInputRelasi(getSuggestedRelasi(nextPenilai, mappingInputDinilai));
                                }}
                                className="w-full text-xs p-2.5 border border-gray-200 rounded-xl bg-white"
                              >
                                <option value="">-- Pilih Penilai --</option>
                                {INITIAL_USERS.map(u => (
                                  <option key={u.id} value={u.id}>{u.name} ({getUserRoleLabel(u.role)} - {u.dept})</option>
                                ))}
                              </select>
                            </div>

                            <div>
                              <label className="block text-[10px] text-gray-400 font-bold mb-1">TARGET YANG DINILAI</label>
                              <select
                                value={mappingInputDinilai}
                                onChange={(e) => {
                                  const nextDinilai = e.target.value;
                                  setMappingInputDinilai(nextDinilai);
                                  setMappingInputRelasi(getSuggestedRelasi(mappingInputPenilai, nextDinilai));
                                }}
                                className="w-full text-xs p-2.5 border border-gray-200 rounded-xl bg-white"
                              >
                                <option value="">-- Pilih Dinilai --</option>
                                {INITIAL_USERS.map(u => (
                                  <option key={u.id} value={u.id}>{u.name} ({getUserRoleLabel(u.role)} - {u.dept})</option>
                                ))}
                              </select>
                            </div>

                            <div>
                              <label className="block text-[10px] text-gray-400 font-bold mb-1">RELASI ASOSIASI</label>
                              <select
                                value={mappingInputRelasi}
                                onChange={(e) => setMappingInputRelasi(e.target.value)}
                                className="w-full text-xs p-2.5 border border-gray-200 rounded-xl bg-white text-emerald-900 font-bold"
                              >
                                <option value="Bawahan">Bawahan</option>
                                <option value="Peer">Peer</option>
                                <option value="Atasan">Atasan</option>
                                <option value="Cross">Cross</option>
                                <option value="Self Assessment">Self Assessment</option>
                              </select>
                            </div>

                            <div>
                              <label className="block text-[10px] text-gray-400 font-bold mb-1">SIFAT PENILAIAN</label>
                              <select
                                value={mappingInputSifat}
                                onChange={(e) => setMappingInputSifat(e.target.value as 'wajib' | 'opsional')}
                                className="w-full text-xs p-2.5 border border-gray-200 rounded-xl bg-white font-bold text-rose-800"
                              >
                                <option value="wajib">Wajib</option>
                                <option value="opsional">Opsional</option>
                              </select>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={handleAddMapping}
                            className="bg-emerald-800 hover:bg-emerald-900 border border-emerald-800 text-white font-bold py-2 px-4 rounded-xl text-xs text-center transition-all cursor-pointer self-end shadow-2xs animate-pulse"
                          >
                            Daftarkan Relasi Manual
                          </button>
                        </div>
                      </div>

                      {/* Master table for all recorded mapping pairings */}
                      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-xs">
                        {(() => {
                          const filteredMappings = mappings.filter(m => {
                            const matchesPenilai = filterPenilai ? m.penilaiId === filterPenilai : true;
                            const matchesTarget = filterTarget ? m.yangDinilaiId === filterTarget : true;
                            return matchesPenilai && matchesTarget;
                          });

                          return (
                            <>
                              <div className="bg-gray-50/50 border-b border-gray-200 px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                <div className="font-semibold text-xs text-gray-750 flex items-center gap-2">
                                  <span>Tabel Pengendalian Jadwal Pemetaan Hubungan Kerja Kerja Aktif</span>
                                  <span className="bg-emerald-100 text-emerald-800 text-[10px] font-black px-2 py-0.5 rounded-full border border-emerald-250 font-mono">
                                    {filteredMappings.length} Terpasang
                                  </span>
                                </div>

                                <div className="flex flex-wrap items-center gap-2.5">
                                  <span className="text-[10px] text-gray-400 font-extrabold uppercase">Filter:</span>
                                  
                                  {/* Filter Penilai */}
                                  <div className="relative">
                                    <select
                                      value={filterPenilai}
                                      onChange={(e) => setFilterPenilai(e.target.value)}
                                      className="text-[11px] p-1.5 border border-gray-200 rounded-lg bg-white font-semibold text-gray-700 focus:outline-none focus:ring-1 focus:ring-emerald-700 min-w-[140px]"
                                    >
                                      <option value="">Semua Penilai ({INITIAL_USERS.length})</option>
                                      {INITIAL_USERS.map(u => (
                                        <option key={u.id} value={u.id}>P: {u.name}</option>
                                      ))}
                                    </select>
                                  </div>

                                  {/* Filter Target */}
                                  <div className="relative">
                                    <select
                                      value={filterTarget}
                                      onChange={(e) => setFilterTarget(e.target.value)}
                                      className="text-[11px] p-1.5 border border-gray-200 rounded-lg bg-white font-semibold text-gray-700 focus:outline-none focus:ring-1 focus:ring-emerald-700 min-w-[140px]"
                                    >
                                      <option value="">Semua Target ({INITIAL_USERS.length})</option>
                                      {INITIAL_USERS.map(u => (
                                        <option key={u.id} value={u.id}>T: {u.name}</option>
                                      ))}
                                    </select>
                                  </div>

                                  {(filterPenilai || filterTarget) && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setFilterPenilai('');
                                        setFilterTarget('');
                                      }}
                                      className="text-[10px] text-rose-700 hover:text-rose-900 font-black underline cursor-pointer transition-colors"
                                    >
                                      Bersihkan
                                    </button>
                                  )}
                                </div>
                              </div>

                              <div className="overflow-x-auto">
                                <table className="w-full text-left font-sans text-xs text-gray-650 min-w-[500px]">
                                  <thead>
                                    <tr className="bg-gray-150 border-b border-gray-200 font-bold text-[9px] uppercase tracking-wider text-gray-400">
                                      <th className="py-2.5 px-4 animate-fade-in">Pegawai Penilai (Sponsor)</th>
                                      <th className="py-2.5 px-4">Pegawai Sasaran (Target)</th>
                                      <th className="py-2.5 px-4 text-center animate-fade-in">Relasi</th>
                                      <th className="py-2.5 px-4 text-center">Sifat</th>
                                      <th className="py-2.5 px-4 text-center animate-fade-in">Garis Hubungan</th>
                                      <th className="py-2.5 px-4 text-center">Status Pemetaan</th>
                                      <th className="py-2.5 px-4 text-right">Tindakan Khusus</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {filteredMappings.length === 0 ? (
                                      <tr>
                                        <td colSpan={7} className="py-12 text-center text-gray-400 font-medium">
                                          Tidak ada data pemetaan yang cocok dengan filter penilai / target di atas.
                                        </td>
                                      </tr>
                                    ) : (
                                      filteredMappings.map((mItem, idx) => {
                                        const relasiValue = getSuggestedRelasi(mItem.penilaiId, mItem.yangDinilaiId);
                                        const hubunganValue = getGarisHubungan(mItem.penilaiId, mItem.yangDinilaiId);
                                        return (
                                          <tr key={mItem.id} className="border-b border-gray-100 last:border-none hover:bg-gray-50/20">
                                            <td className="py-3 px-4 font-bold text-gray-800">
                                              {mItem.penilaiName} <span className="font-mono text-[10px] text-gray-405 font-medium">({mItem.penilaiId})</span>
                                            </td>
                                            <td className="py-3 px-4 font-bold text-gray-800">
                                              {mItem.yangDinilaiName} <span className="font-mono text-[10px] text-gray-405 font-medium">({mItem.yangDinilaiId})</span>
                                            </td>
                                            <td className="py-3 px-4 text-center">
                                              <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                                                relasiValue === 'Atasan' ? 'bg-indigo-50 text-indigo-800 border-indigo-200' :
                                                relasiValue === 'Bawahan' ? 'bg-amber-50 text-amber-800 border-amber-200' :
                                                relasiValue === 'Cross' ? 'bg-purple-50 text-purple-800 border-purple-200' :
                                                'bg-emerald-50 text-emerald-800 border-emerald-200'
                                              }`}>
                                                {relasiValue}
                                              </span>
                                            </td>
                                            <td className="py-3 px-4 text-center">
                                              {(() => {
                                                const sifat = mItem.sifat === 'opsional' ? 'opsional' : 'wajib';
                                                return (
                                                  <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase ${sifatBadgeClass(sifat)}`}>
                                                    {sifat === 'opsional' ? 'Opsional' : 'Wajib'}
                                                  </span>
                                                );
                                              })()}
                                            </td>
                                            <td className="py-3 px-4 text-center font-mono text-[10px] text-slate-700">
                                              {hubunganValue}
                                            </td>
                                            <td className="py-3 px-4 text-center">
                                              <span className="bg-emerald-50 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded border border-emerald-150">Terjadwal Aktif</span>
                                            </td>
                                            <td className="py-3 px-4 text-right">
                                              <button
                                                type="button"
                                                onClick={() => handleRemoveMapping(mItem.id)}
                                                className="text-red-700 bg-white hover:bg-rose-50 border border-gray-200 hover:border-rose-100 rounded-lg p-1 transition-all cursor-pointer"
                                              >
                                                <Trash2 className="w-3.5 h-3.5" />
                                              </button>
                                            </td>
                                          </tr>
                                        );
                                      })
                                    )}
                                  </tbody>
                                </table>
                              </div>
                            </>
                          );
                        })()}
                      </div>

                      {/* HRD CORRECTION REQUESTS PANEL */}
                      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-xs space-y-4 p-5 animate-fade-in mt-6">
                        <div className="flex items-center justify-between">
                          <div>
                            <h3 className="text-xs font-extrabold text-indigo-900 uppercase tracking-wider">Permohonan Koreksi Garis Hubungan Relasi</h3>
                            <p className="text-[10px] text-gray-405 mt-0.5 font-medium">Daftar keluhan penyesuaian relasi kerja 360° yang diusulkan oleh pegawai.</p>
                          </div>
                          <span className="bg-indigo-50 text-indigo-700 text-[10px] font-bold px-2 py-0.5 rounded-full border border-indigo-100">
                            {relationRequests.filter(r => r.status === 'pending').length} Menunggu 
                          </span>
                        </div>

                        {relationRequests.length === 0 ? (
                          <div className="py-6 text-center text-gray-450 text-xs font-semibold">
                            Tidak ada permohonan koreksi relasi kerja yang diajukan saat ini.
                          </div>
                        ) : (
                          <div className="space-y-3.5 max-h-[400px] overflow-y-auto pr-1">
                            {relationRequests.map((req) => (
                              <div key={req.id} className="p-4 rounded-xl border border-gray-150 bg-slate-50/50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 transition-all hover:bg-slate-50">
                                <div className="space-y-1.5 flex-1 w-full">
                                  <div className="flex items-center gap-2 flex-wrap text-xs">
                                    <span className="font-extrabold text-gray-950 text-[13px]">{req.penilaiName}</span>
                                    <span className="text-[10px] text-gray-400 font-mono">({req.penilaiId})</span>
                                    <span className="text-gray-400 font-bold">→</span>
                                    <span className="font-extrabold text-gray-950 text-[13px]">{req.yangDinilaiName}</span>
                                    <span className="text-[10px] text-gray-400 font-mono">({req.yangDinilaiId})</span>
                                  </div>

                                  <div className="flex items-center gap-2 flex-wrap text-xs">
                                    <span className="text-[10px] text-gray-405 font-bold uppercase">Asosiasi:</span>
                                    <span className="bg-rose-50 text-rose-800 text-[10px] font-extrabold px-1.5 py-0.5 rounded line-through">{req.oldRelasi}</span>
                                    <span className="text-gray-300 font-bold text-[10px]">menjadi</span>
                                    <span className="bg-emerald-50 text-emerald-800 text-[10px] font-extrabold px-1.5 py-0.5 rounded">{req.newRelasi}</span>
                                  </div>

                                  <p className="text-[11px] text-gray-500 italic bg-white p-2.5 rounded-lg border border-gray-150 shadow-3xs">
                                    " {req.reason} "
                                  </p>
                                </div>

                                <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                                  {req.status === 'pending' ? (
                                    <>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setMappings(prev => {
                                            const idx = prev.findIndex(m => m.penilaiId === req.penilaiId && m.yangDinilaiId === req.yangDinilaiId);
                                            if (idx >= 0) {
                                              const updated = [...prev];
                                              updated[idx] = { ...updated[idx], relasi: req.newRelasi };
                                              return updated;
                                            } else {
                                              return [...prev, {
                                                id: `M_NEW_${Date.now()}`,
                                                penilaiId: req.penilaiId,
                                                penilaiName: req.penilaiName,
                                                yangDinilaiId: req.yangDinilaiId,
                                                yangDinilaiName: req.yangDinilaiName,
                                                relasi: req.newRelasi
                                              }];
                                            }
                                          });

                                          setRelationRequests(prev => prev.map(r => r.id === req.id ? { ...r, status: 'approved' as const } : r));
                                          showToast(`Koreksi hubungan berhasil disetujui.`, 'ok');
                                        }}
                                        className="bg-emerald-800 hover:bg-emerald-900 text-white font-bold text-[11px] px-3 py-1.5 rounded-lg transition-colors cursor-pointer shadow-3xs"
                                      >
                                        Setujui
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setRelationRequests(prev => prev.map(r => r.id === req.id ? { ...r, status: 'rejected' as const } : r));
                                          showToast(`Koreksi hubungan ditolak.`, 'info');
                                        }}
                                        className="bg-rose-50 hover:bg-rose-105 text-rose-800 border border-rose-200 font-bold text-[11px] px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
                                      >
                                        Tolak
                                      </button>
                                    </>
                                  ) : (
                                    <span className={`text-[10px] font-black uppercase px-2 py-1 rounded border ${
                                      req.status === 'approved' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-gray-100 text-gray-400 border-gray-200'
                                    }`}>
                                      {req.status === 'approved' ? '✓ Diterima' : '✗ Ditolak'}
                                    </span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* TAB: KELOLA PERTANYAAN (Requirement 1) */}
                  {page === 'kelola-soal' && currentUser.role === 'hrd' && (() => {
                    const dynamicMap: Record<string, number[]> = { A: [], B: [], C: [], D: [], E: [] };
                    customQQuant.forEach((q, idx) => {
                      const code = getAspectCodeForQuestion(q, idx);
                      if (dynamicMap[code]) {
                        dynamicMap[code].push(idx);
                      } else {
                        dynamicMap.E.push(idx); // default fallback
                      }
                    });

                    const ASPECTS_LOCAL = [
                      { code: 'A', name: 'A. Jujur & Tanggung Jawab', countLabel: `(${dynamicMap.A.length})`, indices: dynamicMap.A },
                      { code: 'B', name: 'B. Semaksimal Mungkin', countLabel: `(${dynamicMap.B.length})`, indices: dynamicMap.B },
                      { code: 'C', name: 'C. Menantang Diri', countLabel: `(${dynamicMap.C.length})`, indices: dynamicMap.C },
                      { code: 'D', name: 'D. Lapang Hati & Terbuka', countLabel: `(${dynamicMap.D.length})`, indices: dynamicMap.D },
                      { code: 'E', name: 'E. Bermawas Diri', countLabel: `(${dynamicMap.E.length})`, indices: dynamicMap.E }
                    ];

                    const getTitleAndDesc = (rawText: string, idx: number) => {
                      if (!rawText) return { title: '', desc: '' };
                      const cleaned = cleanQuestionText(rawText);
                      const splitChar = cleaned.includes(' - ') ? ' - ' : '-';
                      const parts = cleaned.split(splitChar);
                      const title = parts[0]?.trim() || '';
                      const desc = parts.slice(1).join(' - ')?.trim() || '';
                      return { title, desc };
                    };

                    return (
                      <div className="space-y-6">
                        <div>
                          <h2 className="text-xl font-bold text-gray-800 tracking-tight">Kelola Lembar Pertanyaan Kuesioner (HRD)</h2>
                          <span className="text-xs text-gray-450 font-medium">Ubah, hapus, atau kelola aspek penilaian kompetensi 360° agar selaras dengan Lembar Penilaian Saya.</span>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                          {/* PILAR KUANTITATIF (PILIHAN GANDA 1-5 GROUPED BY ASPECT) */}
                          <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-xs space-y-4">
                            <div>
                              <h3 className="text-xs font-extrabold text-emerald-805 uppercase tracking-wider">Arah Perilaku Kuantitatif (Rating 1-5) berkelompok</h3>
                              <p className="text-[10px] text-gray-400 mt-0.5 font-sans">Pertanyaan dikelompokkan berdasarkan Aspek Penilaian Seni 360° yang aktif di Lembar Penilaian.</p>
                            </div>

                            <div className="space-y-4 max-h-[500px] overflow-y-auto pr-1">
                              {ASPECTS_LOCAL.map((aspect) => (
                                <div key={aspect.code} className="border border-gray-150 rounded-xl overflow-hidden bg-gray-50/40">
                                  <div className="bg-emerald-50/70 px-3 py-2 border-b border-gray-150 flex items-center justify-between">
                                    <span className="text-[10px] font-extrabold text-emerald-900 uppercase tracking-wider">{aspect.name}</span>
                                    <span className="bg-emerald-100 text-emerald-805 text-[9px] font-bold font-mono px-1.5 py-0.5 rounded border border-emerald-205">
                                      {aspect.indices.length} Indikator
                                    </span>
                                  </div>
                                  <div className="p-3 space-y-4 bg-white">
                                    {aspect.indices.map((idx) => {
                                      const rawText = customQQuant[idx] || '';
                                      const { title, desc } = getTitleAndDesc(rawText, idx);

                                      return (
                                        <div key={idx} className="space-y-2 p-2.5 bg-gray-50/50 border border-gray-210 rounded-lg text-xs">
                                          <div className="flex items-center justify-between">
                                            <span className="font-extrabold text-[10px] text-emerald-700 font-mono">Indikator Soal #{idx + 1}</span>
                                            <button
                                              type="button"
                                              onClick={() => {
                                                if (confirm(`Apakah Anda yakin ingin menghapus indikator "${title}"? Langkah ini tidak dapat dibatalkan.`)) {
                                                  const nextQ = customQQuant.filter((_, qIdx) => qIdx !== idx);
                                                  setCustomQQuant(nextQ);
                                                  localStorage.setItem('infarm_custom_qquant', JSON.stringify(nextQ));
                                                  showToast('Indikator berkompeten berhasil dihapus.', 'ok');
                                                }
                                              }}
                                              className="p-1 text-red-500 hover:text-red-700 hover:bg-rose-50 rounded-md transition-colors shrink-0 shadow-3xs border border-gray-200 cursor-pointer"
                                              title="Hapus indikator"
                                            >
                                              <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                          </div>
                                          <div className="space-y-1.5">
                                            <div>
                                              <label className="text-[9px] font-bold text-gray-400 uppercase tracking-widest block mb-0.5">Judul Ringkas:</label>
                                              <input
                                                type="text"
                                                value={title}
                                                onChange={(e) => {
                                                  const newTitle = e.target.value;
                                                  const nextQ = [...customQQuant];
                                                  const aspectCode = getAspectCodeForQuestion(rawText, idx);
                                                  nextQ[idx] = `[${aspectCode}] ${newTitle} - ${desc}`;
                                                  setCustomQQuant(nextQ);
                                                  localStorage.setItem('infarm_custom_qquant', JSON.stringify(nextQ));
                                                }}
                                                className="w-full text-xs p-1.5 bg-white border border-gray-250 rounded-md focus:ring-1 focus:ring-emerald-700 outline-none font-semibold text-gray-800"
                                              />
                                            </div>
                                            <div>
                                              <label className="text-[9px] font-bold text-gray-400 uppercase tracking-widest block mb-0.5">Deskripsi Perilaku Khusus:</label>
                                              <textarea
                                                value={desc}
                                                onChange={(e) => {
                                                  const newDesc = e.target.value;
                                                  const nextQ = [...customQQuant];
                                                  const aspectCode = getAspectCodeForQuestion(rawText, idx);
                                                  nextQ[idx] = `[${aspectCode}] ${title} - ${newDesc}`;
                                                  setCustomQQuant(nextQ);
                                                  localStorage.setItem('infarm_custom_qquant', JSON.stringify(nextQ));
                                                }}
                                                className="w-full text-xs p-1.5 bg-white border border-gray-250 rounded-md focus:ring-1 focus:ring-emerald-700 outline-none text-gray-650 resize-none leading-relaxed"
                                                rows={2}
                                              />
                                            </div>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              ))}
                            </div>

                            {/* Form Tambah Indikator Kuantitatif Baru */}
                            <div className="border-t border-gray-150 pt-4 mt-2">
                              <span className="block text-xs font-black text-emerald-950 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                                <PlusCircle className="w-4 h-4 text-emerald-800" /> Tambah Indikator Kuantitatif Baru
                              </span>
                              <form
                                onSubmit={(e) => {
                                  e.preventDefault();
                                  const form = e.currentTarget;
                                  const fData = new FormData(form);
                                  const titleVal = (fData.get('newTitle') as string || '').trim();
                                  const descVal = (fData.get('newDesc') as string || '').trim();
                                  const aspectVal = fData.get('newAspect') as string;

                                  if (!titleVal || !descVal) {
                                    showToast('Harap isi judul dan deskripsi indikator.', 'err');
                                    return;
                                  }

                                  const formatted = `[${aspectVal}] ${titleVal} - ${descVal}`;
                                  const nextQ = [...customQQuant, formatted];
                                  setCustomQQuant(nextQ);
                                  localStorage.setItem('infarm_custom_qquant', JSON.stringify(nextQ));
                                  showToast('Indikator kuantitatif berhasil ditambahkan!', 'ok');
                                  form.reset();
                                }}
                                className="space-y-3 bg-emerald-50/30 p-3 rounded-xl border border-emerald-100"
                              >
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                  <div>
                                    <label className="text-[9px] font-bold text-emerald-800 uppercase tracking-wider block mb-0.5">Aspek Kelompok:</label>
                                    <select
                                      name="newAspect"
                                      className="w-full text-[11px] p-1.5 bg-white border border-gray-250 rounded-md focus:ring-1 focus:ring-emerald-700 outline-none text-gray-700 font-semibold cursor-pointer"
                                    >
                                      <option value="A">A. Jujur & Tanggung Jawab</option>
                                      <option value="B">B. Semaksimal Mungkin</option>
                                      <option value="C">C. Menantang Diri</option>
                                      <option value="D">D. Lapang Hati & Terbuka</option>
                                      <option value="E">E. Bermawas Diri</option>
                                    </select>
                                  </div>
                                  <div>
                                    <label className="text-[9px] font-bold text-emerald-800 uppercase tracking-wider block mb-0.5">Judul Ringkas:</label>
                                    <input
                                      type="text"
                                      name="newTitle"
                                      placeholder="Contoh: Kejujuran Finansial"
                                      className="w-full text-xs p-1.5 bg-white border border-gray-250 rounded-md focus:ring-1 focus:ring-emerald-700 outline-none font-semibold text-gray-800"
                                    />
                                  </div>
                                </div>
                                <div>
                                  <label className="text-[9px] font-bold text-emerald-800 uppercase tracking-wider block mb-0.5">Deskripsi Perilaku:</label>
                                  <textarea
                                    name="newDesc"
                                    placeholder="Contoh: Senantiasa memelihara transparansi dan ketepatan laporan operasional..."
                                    rows={2}
                                    className="w-full text-xs p-1.5 bg-white border border-gray-250 rounded-md focus:ring-1 focus:ring-emerald-700 outline-none text-gray-800 leading-relaxed resize-none"
                                  />
                                </div>
                                <button
                                  type="submit"
                                  className="w-full bg-emerald-800 hover:bg-emerald-900 text-white font-bold py-1.5 px-3 rounded-lg text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-3xs"
                                >
                                  <Plus className="w-3.5 h-3.5" /> Tambah Indikator ke Aspek
                                </button>
                              </form>
                            </div>
                          </div>

                          {/* PILAR KUALITATIF (TEKS BESAR / ESSAI) */}
                          <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-xs space-y-4">
                            <div className="flex items-center justify-between">
                              <div>
                                <h3 className="text-xs font-extrabold text-indigo-805 uppercase tracking-wider">Umpan Balik Kualitatif (Essai Bebas)</h3>
                                <p className="text-[10px] text-gray-400 mt-0.5 font-sans">Pertanyaan deskriptif narrative di bagian akhir kuesioner.</p>
                              </div>
                              <span className="bg-indigo-50 text-indigo-800 text-[10px] font-bold px-2 py-0.5 rounded-full font-mono border border-indigo-100">
                                {customQQual.length} Soal
                              </span>
                            </div>

                            <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
                              {customQQual.map((qText, idx) => (
                                <div key={idx} className="flex gap-2 items-start bg-gray-50 p-2.5 rounded-xl border border-gray-150">
                                  <span className="text-xs font-bold text-indigo-700 font-mono mt-1 shrink-0">#{idx + 1}</span>
                                  <textarea
                                    value={qText}
                                    onChange={(e) => {
                                      const nextQ = [...customQQual];
                                      nextQ[idx] = e.target.value;
                                      setCustomQQual(nextQ);
                                      localStorage.setItem('infarm_custom_qqual', JSON.stringify(nextQ));
                                    }}
                                    className="w-full text-xs bg-transparent border-none focus:ring-1 focus:ring-indigo-700 p-0 text-gray-800 resize-none font-semibold leading-relaxed outline-none"
                                    rows={2}
                                  />
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const nextQ = customQQual.filter((_, qIdx) => qIdx !== idx);
                                      setCustomQQual(nextQ);
                                      localStorage.setItem('infarm_custom_qqual', JSON.stringify(nextQ));
                                      showToast('Pertanyaan Kualitatif berhasil dihapus', 'info');
                                    }}
                                    className="text-red-700 bg-white hover:bg-rose-50 border border-gray-100 rounded-lg p-1 shrink-0 cursor-pointer shadow-3xs"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              ))}
                            </div>

                            <div className="pt-2">
                              <form
                                onSubmit={(e) => {
                                  e.preventDefault();
                                  const form = e.currentTarget;
                                  const formData = new FormData(form);
                                  const qVal = formData.get('newQQual') as string;
                                  if (!qVal || qVal.trim() === '') return;
                                  const nextQ = [...customQQual, qVal.trim()];
                                  setCustomQQual(nextQ);
                                  localStorage.setItem('infarm_custom_qqual', JSON.stringify(nextQ));
                                  showToast('Indikator kualitatif berhasil ditambahkan', 'ok');
                                  form.reset();
                                }}
                                className="flex gap-2"
                              >
                                <input
                                  name="newQQual"
                                  placeholder="Tulis indikator kualitatif baru..."
                                  className="flex-1 text-xs p-2 bg-white border border-gray-250 rounded-xl focus:ring-1 focus:ring-indigo-700 outline-none"
                                />
                                <button
                                  type="submit"
                                  className="bg-indigo-850 hover:bg-indigo-950 text-white font-bold px-3 py-2 rounded-xl text-xs flex items-center justify-center gap-1 cursor-pointer shrink-0 shadow-2xs"
                                >
                                  <Plus className="w-3.5 h-3.5" />
                                  <span>Tambah</span>
                                </button>
                              </form>
                            </div>
                          </div>
                        </div>

                        {/* Control panel buttons */}
                        <div className="flex justify-end gap-3 pt-2">
                          <button
                            type="button"
                            onClick={() => {
                              if (window.confirm('Apakah Anda yakin ingin mengembalikan seluruh naskah pertanyaan kuesioner ke standar awal organisasi?')) {
                                setCustomQQuant(Q_QUANT);
                                setCustomQQual(Q_QUAL);
                                localStorage.removeItem('infarm_custom_qquant');
                                localStorage.removeItem('infarm_custom_qqual');
                                showToast('Naskah kuesioner berhasil di-reset ke standar awal.', 'ok');
                              }
                            }}
                            className="text-xs font-bold text-red-700 hover:text-red-950 bg-white border border-red-200 hover:bg-rose-50 px-4 py-2.5 rounded-xl cursor-pointer"
                          >
                            Reset Semua ke Standar Organisasi
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              showToast('Perubahan naskah kuesioner berhasil diperbarui seutuhnya.', 'ok');
                            }}
                            className="text-xs font-bold text-white bg-emerald-800 hover:bg-emerald-950 px-5 py-2.5 rounded-xl cursor-pointer shadow-md"
                          >
                            Simpan Matriks Kuesioner
                          </button>
                        </div>
                      </div>
                    );
                  })()}

                  {/* TAB: KELOLA BOBOT PENILAI (Requirement 2) */}
                  {page === 'kelola-bobot' && currentUser.role === 'hrd' && (
                    <div className="space-y-6">
                      <div>
                        <h2 className="text-xl font-bold text-gray-800 tracking-tight">Kelola Bobot Penilai (HRD)</h2>
                        <span className="text-xs text-gray-450 font-medium font-sans">Atur bobot kontribusi dari masing-masing jenis penilai 360° untuk menghasilkan skor kelayakan kompetensi akhir yang adil dan proposional.</span>
                      </div>

                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* LEFT COLUMN: CONFIGURATION */}
                        <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-xs space-y-6">
                          {/* Choose Mode */}
                          <div className="space-y-2">
                            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest">
                              Skema Pembobotan Aktif
                            </label>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <button
                                type="button"
                                onClick={() => {
                                  setWeightingMode('four-class');
                                  showToast('Menggunakan Model Pembobotan 4-Kelas', 'info');
                                }}
                                className={`p-4 rounded-xl border text-left flex flex-col justify-between transition-all duration-150 cursor-pointer ${
                                  weightingMode === 'four-class'
                                    ? 'border-emerald-800 bg-emerald-50/30 ring-1 ring-emerald-800'
                                    : 'border-gray-200 bg-white hover:bg-gray-50'
                                }`}
                              >
                                <span className={`text-xs block ${weightingMode === 'four-class' ? 'font-bold text-emerald-900' : 'font-semibold text-gray-700'}`}>
                                  Model 4-Kelas
                                </span>
                                <span className="text-[10px] text-gray-400 mt-1 leading-relaxed">
                                  Menetapkan bobot rater secara rinci bagi Atasan, Peer, Cross, dan Self.
                                </span>
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  setWeightingMode('two-class');
                                  showToast('Menggunakan Model Pembobotan 2-Kelas', 'info');
                                }}
                                className={`p-4 rounded-xl border text-left flex flex-col justify-between transition-all duration-150 cursor-pointer ${
                                  weightingMode === 'two-class'
                                    ? 'border-emerald-800 bg-emerald-50/30 ring-1 ring-emerald-800'
                                    : 'border-gray-200 bg-white hover:bg-gray-50'
                                }`}
                              >
                                <span className={`text-xs block ${weightingMode === 'two-class' ? 'font-bold text-emerald-900' : 'font-semibold text-gray-700'}`}>
                                  Model 2-Kelas
                                </span>
                                <span className="text-[10px] text-gray-400 mt-1 leading-relaxed">
                                  Hanya memisahkan bobot pimpinan: Atasan ({raterWeights.twoClass.atasan}%) & Internal ({raterWeights.twoClass.internal}%).
                                </span>
                              </button>
                            </div>
                          </div>

                          {/* WEIGHT EDITORS */}
                          {weightingMode === 'four-class' ? (
                            <div className="space-y-4">
                              <div className="flex items-center justify-between border-b border-gray-150 pb-2">
                                <h3 className="text-xs font-extrabold text-emerald-850 uppercase tracking-wider">Nilai Bobot 4-Kelas</h3>
                                <span className="text-[10px] px-2 py-0.5 rounded-full font-mono font-bold bg-amber-55 text-amber-800 border border-amber-200 animate-pulse">
                                  Total (Atasan+Peer+Cross): {raterWeights.fourClass.atasan + raterWeights.fourClass.peer + raterWeights.fourClass.cross}%
                                </span>
                              </div>

                              {/* Atasan Slider */}
                              <div className="space-y-1.5">
                                <div className="flex justify-between items-center text-xs">
                                  <span className="font-semibold text-gray-700">1. Atasan (Supervisor / Direksi)</span>
                                  <span className="font-mono font-bold text-gray-900">{raterWeights.fourClass.atasan}%</span>
                                </div>
                                <div className="flex items-center gap-3">
                                  <input
                                    type="range"
                                    min="0"
                                    max="100"
                                    value={raterWeights.fourClass.atasan}
                                    onChange={(e) => {
                                      setRaterWeights(prev => ({
                                        ...prev,
                                        fourClass: { ...prev.fourClass, atasan: parseInt(e.target.value) || 0 }
                                      }));
                                    }}
                                    className="w-full h-1.5 bg-gray-100 rounded-lg appearance-none cursor-pointer accent-emerald-850"
                                  />
                                  <input
                                    type="number"
                                    min="0"
                                    max="100"
                                    value={raterWeights.fourClass.atasan}
                                    onChange={(e) => {
                                      setRaterWeights(prev => ({
                                        ...prev,
                                        fourClass: { ...prev.fourClass, atasan: Math.min(100, Math.max(0, parseInt(e.target.value) || 0)) }
                                      }));
                                    }}
                                    className="w-14 text-center text-xs p-1 bg-white border border-gray-250 rounded font-bold font-mono outline-none"
                                  />
                                </div>
                              </div>

                              {/* Peer Slider */}
                              <div className="space-y-1.5">
                                <div className="flex justify-between items-center text-xs">
                                  <span className="font-semibold text-gray-700">2. Peer (Rekan Kerja Satu Divisi)</span>
                                  <span className="font-mono font-bold text-gray-900">{raterWeights.fourClass.peer}%</span>
                                </div>
                                <div className="flex items-center gap-3">
                                  <input
                                    type="range"
                                    min="0"
                                    max="100"
                                    value={raterWeights.fourClass.peer}
                                    onChange={(e) => {
                                      setRaterWeights(prev => ({
                                        ...prev,
                                        fourClass: { ...prev.fourClass, peer: parseInt(e.target.value) || 0 }
                                      }));
                                    }}
                                    className="w-full h-1.5 bg-gray-100 rounded-lg appearance-none cursor-pointer accent-emerald-650"
                                  />
                                  <input
                                    type="number"
                                    min="0"
                                    max="100"
                                    value={raterWeights.fourClass.peer}
                                    onChange={(e) => {
                                      setRaterWeights(prev => ({
                                        ...prev,
                                        fourClass: { ...prev.fourClass, peer: Math.min(100, Math.max(0, parseInt(e.target.value) || 0)) }
                                      }));
                                    }}
                                    className="w-14 text-center text-xs p-1 bg-white border border-gray-250 rounded font-bold font-mono outline-none"
                                  />
                                </div>
                              </div>

                              {/* Cross Slider */}
                              <div className="space-y-1.5">
                                <div className="flex justify-between items-center text-xs">
                                  <span className="font-semibold text-gray-700">3. Cross-Divisional (Rekan Lintas Departemen)</span>
                                  <span className="font-mono font-bold text-gray-900">{raterWeights.fourClass.cross}%</span>
                                </div>
                                <div className="flex items-center gap-3">
                                  <input
                                    type="range"
                                    min="0"
                                    max="100"
                                    value={raterWeights.fourClass.cross}
                                    onChange={(e) => {
                                      setRaterWeights(prev => ({
                                        ...prev,
                                        fourClass: { ...prev.fourClass, cross: parseInt(e.target.value) || 0 }
                                      }));
                                    }}
                                    className="w-full h-1.5 bg-gray-100 rounded-lg appearance-none cursor-pointer accent-indigo-650"
                                  />
                                  <input
                                    type="number"
                                    min="0"
                                    max="100"
                                    value={raterWeights.fourClass.cross}
                                    onChange={(e) => {
                                      setRaterWeights(prev => ({
                                        ...prev,
                                        fourClass: { ...prev.fourClass, cross: Math.min(100, Math.max(0, parseInt(e.target.value) || 0)) }
                                      }));
                                    }}
                                    className="w-14 text-center text-xs p-1 bg-white border border-gray-250 rounded font-bold font-mono outline-none"
                                  />
                                </div>
                              </div>

                              {/* Self Stand-alone Card */}
                              <div className="p-3 bg-sky-50 rounded-xl border border-sky-150 text-xs mt-3">
                                <div className="flex justify-between items-center font-bold text-sky-950 mb-1">
                                  <span>4. Self Evaluasi (Mandiri)</span>
                                  <span className="font-mono px-2 py-0.5 rounded bg-sky-100 text-sky-800 text-[10px]">PEMBANDING MANDIRI</span>
                                </div>
                                <span className="text-[10px] text-sky-750 font-medium leading-relaxed block">
                                  Sesuai instruksi organisasi terbaru, penilaian mandiri (Self) sekarang berdiri sendiri sebagai pembanding murni di Final Report. Bobotnya dikecualikan secara otomatis dari 100% pembobotan kuantitatif kelayakan.
                                </span>
                              </div>
                            </div>
                          ) : (
                            <div className="space-y-4">
                              <div className="flex items-center justify-between border-b border-gray-150 pb-2">
                                <h3 className="text-xs font-extrabold text-emerald-850 uppercase tracking-wider">Nilai Bobot 2-Kelas</h3>
                                <span className="text-[10px] px-2 py-0.5 rounded-full font-mono font-bold bg-amber-55 text-amber-805 border border-amber-200 animate-pulse">
                                  Total: {raterWeights.twoClass.atasan + raterWeights.twoClass.internal}%
                                </span>
                              </div>

                              {/* Atasan Slider (2-Class) */}
                              <div className="space-y-1.5">
                                <div className="flex justify-between items-center text-xs">
                                  <span className="font-semibold text-gray-700">1. Atasan (Supervisor / Direksi)</span>
                                  <span className="font-mono font-bold text-gray-900">{raterWeights.twoClass.atasan}%</span>
                                </div>
                                <div className="flex items-center gap-3">
                                  <input
                                    type="range"
                                    min="0"
                                    max="100"
                                    value={raterWeights.twoClass.atasan}
                                    onChange={(e) => {
                                      setRaterWeights(prev => ({
                                        ...prev,
                                        twoClass: { ...prev.twoClass, atasan: parseInt(e.target.value) || 0 }
                                      }));
                                    }}
                                    className="w-full h-1.5 bg-gray-100 rounded-lg appearance-none cursor-pointer accent-emerald-850"
                                  />
                                  <input
                                    type="number"
                                    min="0"
                                    max="100"
                                    value={raterWeights.twoClass.atasan}
                                    onChange={(e) => {
                                      setRaterWeights(prev => ({
                                        ...prev,
                                        twoClass: { ...prev.twoClass, atasan: Math.min(100, Math.max(0, parseInt(e.target.value) || 0)) }
                                      }));
                                    }}
                                    className="w-14 text-center text-xs p-1 bg-white border border-gray-250 rounded font-bold font-mono outline-none"
                                  />
                                </div>
                              </div>

                              {/* Internal Slider (2-Class) */}
                              <div className="space-y-1.5">
                                <div className="flex justify-between items-center text-xs">
                                  <span className="font-semibold text-gray-700">2. Internal (Peer + Cross, Tanpa Self)</span>
                                  <span className="font-mono font-bold text-indigo-900">{raterWeights.twoClass.internal}%</span>
                                </div>
                                <div className="flex items-center gap-3">
                                  <input
                                    type="range"
                                    min="0"
                                    max="100"
                                    value={raterWeights.twoClass.internal}
                                    onChange={(e) => {
                                      setRaterWeights(prev => ({
                                        ...prev,
                                        twoClass: { ...prev.twoClass, internal: parseInt(e.target.value) || 0 }
                                      }));
                                    }}
                                    className="w-full h-1.5 bg-gray-100 rounded-lg appearance-none cursor-pointer accent-indigo-650"
                                  />
                                  <input
                                    type="number"
                                    min="0"
                                    max="100"
                                    value={raterWeights.twoClass.internal}
                                    onChange={(e) => {
                                      setRaterWeights(prev => ({
                                        ...prev,
                                        twoClass: { ...prev.twoClass, internal: Math.min(100, Math.max(0, parseInt(e.target.value) || 0)) }
                                      }));
                                    }}
                                    className="w-14 text-center text-xs p-1 bg-white border border-gray-250 rounded font-bold font-mono outline-none"
                                  />
                                </div>
                              </div>
                            </div>
                          )}

                          {/* VALIDATION INDICATOR */}
                          {(() => {
                            const sum = weightingMode === 'four-class'
                              ? raterWeights.fourClass.atasan + raterWeights.fourClass.peer + raterWeights.fourClass.cross
                              : raterWeights.twoClass.atasan + raterWeights.twoClass.internal;
                            const isValid = sum === 100;
                            return (
                              <div className={`p-4 rounded-xl border flex items-start gap-2.5 text-xs font-semibold ${
                                isValid
                                  ? 'bg-emerald-50 text-emerald-800 border-emerald-250'
                                  : 'bg-rose-50/50 text-rose-800 border-rose-200'
                              }`}>
                                {isValid ? (
                                  <>
                                    <ShieldCheck className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" />
                                    <div>
                                      <strong className="block font-bold mb-0.5">Matriks Bobot Valid (100%)</strong>
                                      <span>Formula pembobotan ini siap diterapkan ke seluruh kalkulasi laporan performa secara real-time.</span>
                                    </div>
                                  </>
                                ) : (
                                  <>
                                    <AlertTriangle className="w-5 h-5 text-rose-700 shrink-0 mt-0.5 animate-bounce" />
                                    <div>
                                      <strong className="block font-bold mb-0.5">Konfigurasi Bobot Salah ({sum}%)</strong>
                                      <span>Jumlah kumulatif persentase seluruh kelas penilai wajib bernilai pas <strong>100%</strong>. Harap sesuaikan ulang.</span>
                                    </div>
                                  </>
                                )}
                              </div>
                            );
                          })()}

                          {/* ACTION BUTTONS */}
                          <div className="flex gap-3 justify-end pt-2">
                            <button
                              type="button"
                              onClick={() => {
                                setRaterWeights({
                                  fourClass: { atasan: 50, peer: 30, cross: 20, self: 0 },
                                  twoClass: { atasan: 40, internal: 60 }
                                });
                                showToast('Bobot dikembalikan ke standar awal.', 'info');
                              }}
                              className="text-xs font-bold text-gray-550 bg-white hover:bg-gray-50 border border-gray-200 px-4 py-2.5 rounded-xl cursor-pointer"
                            >
                              Reset default
                            </button>
                            <button
                              type="button"
                              disabled={
                                (weightingMode === 'four-class' && raterWeights.fourClass.atasan + raterWeights.fourClass.peer + raterWeights.fourClass.cross !== 100) ||
                                (weightingMode === 'two-class' && raterWeights.twoClass.atasan + raterWeights.twoClass.internal !== 100)
                              }
                              onClick={() => {
                                localStorage.setItem('infarm_weighting_mode', weightingMode);
                                localStorage.setItem('infarm_rater_weights', JSON.stringify(raterWeights));
                                showToast('Matriks pembobotan per-peran berhasil disimpan secara permanen.', 'ok');
                              }}
                              className="text-xs font-bold text-white bg-emerald-800 hover:bg-emerald-900 disabled:opacity-35 disabled:cursor-not-allowed px-5 py-2.5 rounded-xl cursor-pointer shadow-3xs transition-all"
                            >
                              Simpan & Terapkan Bobot
                            </button>
                          </div>
                        </div>

                        {/* RIGHT COLUMN: PREVIEW & EXPLANATION */}
                        <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-xs space-y-6 flex flex-col justify-between">
                          <div className="space-y-4">
                            <div>
                              <h3 className="text-xs font-extrabold text-indigo-805 uppercase tracking-wider">Komposisi Visual Distribusi Bobot</h3>
                              <p className="text-[10px] text-gray-400 mt-0.5 font-sans">Ilustrasi proporsi peran penilai yang memengaruhi nilai kelayakan.</p>
                            </div>

                            {/* visual chart container */}
                            <div className="bg-gray-50 p-4 rounded-xl border border-gray-150 space-y-3.5 text-xs text-gray-750">
                              <span className="block font-bold text-gray-900 text-[11px]">Skema Aktif: {weightingMode === 'four-class' ? 'Model 4-Kelas' : 'Model 2-Kelas'}</span>
                              {weightingMode === 'four-class' ? (
                                <div className="space-y-3">
                                  <div className="h-4 w-full flex rounded-full overflow-hidden shadow-inner font-mono text-[9px] text-white font-bold text-center">
                                    <div style={{ width: `${raterWeights.fourClass.atasan}%` }} className="bg-emerald-800 flex items-center justify-center transition-all duration-300" title="Atasan">
                                      {raterWeights.fourClass.atasan > 10 && `${raterWeights.fourClass.atasan}%`}
                                    </div>
                                    <div style={{ width: `${raterWeights.fourClass.peer}%` }} className="bg-emerald-500 flex items-center justify-center border-l border-white transition-all duration-300" title="Peer">
                                      {raterWeights.fourClass.peer > 10 && `${raterWeights.fourClass.peer}%`}
                                    </div>
                                    <div style={{ width: `${raterWeights.fourClass.cross}%` }} className="bg-indigo-600 flex items-center justify-center border-l border-white transition-all duration-300" title="Cross">
                                      {raterWeights.fourClass.cross > 10 && `${raterWeights.fourClass.cross}%`}
                                    </div>
                                  </div>
                                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px] font-bold">
                                    <div className="flex items-center gap-1.5">
                                      <span className="w-2.5 h-2.5 bg-emerald-800 rounded-sm" />
                                      <span className="text-gray-655">Atasan: {raterWeights.fourClass.atasan}%</span>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                      <span className="w-2.5 h-2.5 bg-emerald-500 rounded-sm" />
                                      <span className="text-gray-655">Peer: {raterWeights.fourClass.peer}%</span>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                      <span className="w-2.5 h-2.5 bg-indigo-600 rounded-sm" />
                                      <span className="text-gray-655">Cross: {raterWeights.fourClass.cross}%</span>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                      <span className="w-2.5 h-2.5 bg-sky-400 rounded-sm" />
                                      <span className="text-gray-655">Self: Stand-alone Pembanding</span>
                                    </div>
                                  </div>
                                </div>
                              ) : (
                                <div className="space-y-3">
                                  <div className="h-4 w-full flex rounded-full overflow-hidden shadow-inner font-mono text-[9px] text-white font-bold text-center">
                                    <div style={{ width: `${raterWeights.twoClass.atasan}%` }} className="bg-emerald-800 flex items-center justify-center transition-all duration-300" title="Atasan">
                                      {raterWeights.twoClass.atasan > 10 && `${raterWeights.twoClass.atasan}%`}
                                    </div>
                                    <div style={{ width: `${raterWeights.twoClass.internal}%` }} className="bg-indigo-650 flex items-center justify-center border-l border-white transition-all duration-300" title="Internal">
                                      {raterWeights.twoClass.internal > 10 && `${raterWeights.twoClass.internal}%`}
                                    </div>
                                  </div>
                                  <div className="grid grid-cols-2 gap-2 text-[10px] font-bold">
                                    <div className="flex items-center gap-1.5">
                                      <span className="w-2.5 h-2.5 bg-emerald-800 rounded-sm" />
                                      <span className="text-gray-655">Atasan: {raterWeights.twoClass.atasan}%</span>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                      <span className="w-2.5 h-2.5 bg-indigo-650 rounded-sm" />
                                      <span className="text-gray-655">Internal: {raterWeights.twoClass.internal}%</span>
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>

                            {/* EDUCATION BANNER */}
                            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-950 space-y-2 font-sans leading-relaxed">
                              <span className="block font-bold text-amber-900 flex items-center gap-1">
                                <Info className="w-4 h-4 text-amber-700 shrink-0" />
                                <span>Formula Penyelaras Dinamis:</span>
                              </span>
                              <p className="text-amber-900/95 font-medium mb-1">
                                Jika salah satu kelas penilai belum mengirimkan ulasan di periode aktif, sistem akan melakukan <strong>normalisasi proporsional otomatis</strong>. Sisa bobot akan didistribusikan merata ke kelas yang sudah terisi agar total kalkulasi rater tetap utuh 100%.
                              </p>
                              <p className="text-amber-900/90 font-medium">
                                Contoh: Apabila Self-Assessment (10%) dihilangkan atau tidak diisi, maka sum 90% sisanya akan diskalakan ulang menjadi 100% sehingga skor tidak berkurang.
                              </p>
                            </div>
                          </div>

                          {/* DYNAMIC CASE PREVIEW */}
                          <div className="border border-gray-150 rounded-xl p-4 bg-slate-50 space-y-2">
                            <span className="block text-[9px] font-extrabold uppercase text-slate-500 tracking-wider">Simulasi Output Riel (Pegawai: Andi Pratama):</span>
                            {(() => {
                              const calculatedScore = getScore360ForQuarter('EMP001', 'Q2-2026');
                              return (
                                <div className="space-y-1">
                                  <div className="flex justify-between items-center bg-white p-2 border border-gray-150 rounded-lg">
                                    <span className="text-xs font-bold text-gray-700">Skor Kompetensi Dinamis:</span>
                                    <span className="text-emerald-800 text-sm font-black font-mono">{calculatedScore || 'N/A'}</span>
                                  </div>
                                  <p className="text-[10px] text-gray-400 font-sans italic">
                                    Menggunakan skema {weightingMode === 'four-class' ? '4-Kelas' : '2-Kelas'} dengan formula pembobotan aktif Anda.
                                  </p>
                                </div>
                              );
                            })()}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* TAB: AUDIT & MONITORING LOG KPI (Requirement 3) */}
                  {page === 'kpi-monitor' && currentUser.role === 'hrd' && (
                    <div className="space-y-6">
                      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                        <div>
                          <h2 className="text-xl font-bold text-gray-800 tracking-tight">Monitoring & Audit Log KPI Kerja (HRD)</h2>
                          <span className="text-xs text-gray-455 font-medium">Pantau rekam audit perubahan berkas skor KPI yang dimasukkan oleh Supervisor secara berkala.</span>
                        </div>
                        <div className="flex gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              localStorage.removeItem('infarm_kpi_hist');
                              window.location.reload();
                            }}
                            className="bg-white border border-gray-200 hover:bg-gray-50 text-gray-600 px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer"
                          >
                            Reset Demo Audit
                          </button>
                        </div>
                      </div>

                      {/* Summary analytics widgets */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div className="bg-white border border-gray-205 rounded-2xl p-4 shadow-3xs space-y-1">
                          <span className="text-[10px] text-gray-400 font-extrabold uppercase">Jumlah Entri KPI Ter-Audit</span>
                          <p className="text-2xl font-bold font-mono text-emerald-950">
                            {(() => {
                              let count = 0;
                              Object.values(kpiHist).forEach(mObj => {
                                Object.values(mObj).forEach(arr => {
                                  count += arr.length;
                                });
                              });
                              return count;
                            })()} <span className="text-xs text-gray-450 font-sans font-normal">Seni Entri</span>
                          </p>
                        </div>
                        <div className="bg-white border border-gray-205 rounded-2xl p-4 shadow-3xs space-y-1">
                          <span className="text-[10px] text-gray-400 font-extrabold uppercase">Riwayat Overwrites Supervisor / HRD</span>
                          <p className="text-2xl font-bold font-mono text-indigo-950">
                            {(() => {
                              let revisions = 0;
                              Object.values(kpiHist).forEach(mObj => {
                                Object.values(mObj).forEach(arr => {
                                  if (arr.length > 1) {
                                    revisions += (arr.length - 1);
                                  }
                                });
                              });
                              return revisions;
                            })()} <span className="text-xs text-indigo-350 font-sans font-normal font-medium">Revisi</span>
                          </p>
                        </div>
                        <div className="bg-white border border-gray-205 rounded-2xl p-4 shadow-3xs space-y-1">
                          <span className="text-[10px] text-gray-400 font-extrabold uppercase">Kecepatan Sinkronisasi</span>
                          <p className="text-2xl font-bold font-mono text-gray-800">100% <span className="text-xs text-emerald-700 font-sans font-extrabold">REAL-TIME</span></p>
                        </div>
                      </div>

                      {/* Main Monitoring Table & Recent changes feed */}
                      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        {/* LEFT: Complete overview table of ALL employees */}
                        <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-xs lg:col-span-2 space-y-4">
                          <div className="flex items-center justify-between">
                            <h3 className="text-xs font-extrabold text-emerald-805 uppercase tracking-wider">Matriks Kompilasi Nilai KPI Kerja Komplit</h3>
                            <span className="text-[9px] bg-emerald-50 text-emerald-800 font-bold border border-emerald-100 px-2 py-0.5 rounded-full uppercase">Kuartal Aktif Berjalan</span>
                          </div>

                          <div className="overflow-x-auto">
                            <table className="w-full text-left font-sans text-xs text-gray-600 min-w-[500px]">
                              <thead>
                                <tr className="bg-gray-50 border-b border-gray-200 font-bold text-[9px] uppercase tracking-wider text-gray-400">
                                  <th className="py-2.5 px-4">Nama Pegawai (ID)</th>
                                  <th className="py-2.5 px-4 text-center">Mei 26</th>
                                  <th className="py-2.5 px-4 text-center">Apr 26</th>
                                  <th className="py-2.5 px-4 text-center">Mar 26</th>
                                  <th className="py-2.5 px-4 text-right">Rerata Akhir KPI</th>
                                </tr>
                              </thead>
                              <tbody>
                                {ALL_EMPS.map((emp) => {
                                  const m5 = getLatestKpiScoreVal(emp.id, '2026-05');
                                  const m4 = getLatestKpiScoreVal(emp.id, '2026-04');
                                  const m3 = getLatestKpiScoreVal(emp.id, '2026-03');
                                  const avg = getQuarterKpiAverage(emp.id, activeQuarterKey);

                                  return (
                                    <tr key={emp.id} className="border-b border-gray-100 last:border-none hover:bg-gray-50/10">
                                      <td className="py-3 px-4">
                                        <span className="font-bold text-gray-800 block text-xs">{emp.name}</span>
                                        <span className="text-[10px] text-gray-400 block">{emp.dept} · ID: {emp.id}</span>
                                      </td>
                                      <td className="py-3 px-4 text-center font-mono font-bold">
                                        {m5 !== null ? <span className="text-emerald-800">{m5.toFixed(1)}</span> : <span className="text-gray-405">—</span>}
                                      </td>
                                      <td className="py-3 px-4 text-center font-mono font-medium text-gray-500">
                                        {m4 !== null ? m4.toFixed(1) : <span className="text-gray-405">—</span>}
                                      </td>
                                      <td className="py-3 px-4 text-center font-mono text-gray-500">
                                        {m3 !== null ? m3.toFixed(1) : <span className="text-gray-405">—</span>}
                                      </td>
                                      <td className="py-3 px-4 text-right">
                                        {avg !== null ? (
                                          <div className="inline-flex items-center gap-1 bg-gray-50 p-1.5 rounded-lg border border-gray-200">
                                            <span className="font-mono font-black text-gray-950 text-xs">{avg.toFixed(1)}</span>
                                            {getCatBadge(avg)}
                                          </div>
                                        ) : (
                                          <span className="text-gray-400 italic">Belum Diinput</span>
                                        )}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>

                        {/* RIGHT: Consolidated Audit Trail Timeline - Chronological */}
                        <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-xs space-y-4">
                          <h3 className="text-xs font-extrabold text-emerald-800 uppercase tracking-wider flex items-center gap-1.5 border-b border-gray-100 pb-2">
                            <Clock className="w-4 h-4 text-emerald-600" />
                            <span>Riwayat Perubahan Pencatatan KPI</span>
                          </h3>

                          <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
                            {(() => {
                              const logs: Array<{
                                empId: string;
                                empName: string;
                                month: string;
                                score: number;
                                by: string;
                                ts: string;
                                note: string;
                                revisionNumber: number;
                                isRevision: boolean;
                              }> = [];

                              Object.entries(kpiHist).forEach(([eid, monthsObj]) => {
                                const emp = ALL_EMPS.find(e => e.id === eid);
                                if (!emp) return;

                                Object.entries(monthsObj).forEach(([month, entries]) => {
                                  entries.forEach((entry, idx) => {
                                    logs.push({
                                      empId: eid,
                                      empName: emp.name,
                                      month,
                                      score: entry.score,
                                      by: entry.by,
                                      ts: entry.ts,
                                      note: entry.note,
                                      revisionNumber: idx + 1,
                                      isRevision: idx > 0
                                    });
                                  });
                                });
                              });

                              // Sort logs by timestamp (newest first)
                              const sortedLogs = logs.sort((a, b) => b.ts.localeCompare(a.ts));

                              if (sortedLogs.length === 0) {
                                return (
                                  <div className="text-center py-8 text-gray-400 italic font-medium">
                                    Belum ada catatan aktivitas audit KPI kerja kuartal ini.
                                  </div>
                                );
                              }

                              return sortedLogs.map((log, idx) => (
                                <div key={idx} className={`p-3 rounded-xl border text-xs space-y-1.5 transition-all ${
                                  log.isRevision
                                    ? 'bg-amber-50/45 border-amber-200'
                                    : 'bg-gray-50 border-gray-200'
                                }`}>
                                  <div className="flex justify-between items-start">
                                    <div>
                                      <span className="font-extrabold text-gray-800 text-[11px] block leading-tight">{log.empName}</span>
                                      <span className="text-[10px] text-gray-400 block mt-0.5">Bulan evaluasi: {log.month}</span>
                                    </div>
                                    <div className="text-right">
                                      <span className="font-mono font-bold text-xs block text-slate-900">{log.score.toFixed(1)}</span>
                                      {log.isRevision ? (
                                        <span className="inline-block text-[8px] bg-amber-100 text-amber-800 font-bold px-1.5 py-0.5 rounded uppercase font-mono mt-0.5">Koreksi #{log.revisionNumber}</span>
                                      ) : (
                                        <span className="inline-block text-[8px] bg-emerald-50 text-emerald-800 font-bold px-1.5 py-0.5 rounded uppercase font-mono mt-0.5">Masukan Awal</span>
                                      )}
                                    </div>
                                  </div>

                                  <div className="p-2 bg-white/70 rounded-lg text-[10px] text-gray-500 leading-normal border border-gray-100/50">
                                    <span className="font-bold text-gray-700">Justifikasi:</span> &ldquo;{log.note}&rdquo;
                                  </div>

                                  <div className="flex justify-between items-center text-[9px] text-gray-400 font-bold uppercase tracking-wide">
                                    <span>Oleh: <span className="text-slate-800">{log.by === 'HRD001' ? 'Irma (HR Admin)' : log.by === 'SPV001' ? 'Gunawan (SPV)' : 'Hesti (SPV)'}</span></span>
                                    <span className="font-mono text-gray-400">{log.ts}</span>
                                  </div>
                                </div>
                              ));
                            })()}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* TAB: PROMOSI HUB: Displaying candidates and allowing HRD and DIREKSI to plan and filter */}
                  {(page === 'promosi-hub' && (currentUser.role === 'hrd' || currentUser.role === 'direksi')) && (() => {
                    const candidateList = ALL_EMPS.map(emp => {
                      const kpiAvg = getQuarterKpiAverage(emp.id, selQPromosi);
                      const s360 = quarters[selQPromosi]?.has360 ? (getScore360ForQuarter(emp.id, selQPromosi) ?? null) : null;
                      const finalScoreVal = getComputedFinalScore(emp.id, selQPromosi);
                      const activeProm = promotions[emp.id] || {
                        targetPlan: getPlansForScore(finalScoreVal)[0],
                        status: 'pending',
                        notes: ''
                      };
                      return {
                        emp,
                        kpiAvg,
                        s360,
                        finalScoreVal,
                        activeProm
                      };
                    });

                    // Extract all unique plans for filtering prior to filters application
                    const allUniquePlans = Array.from(new Set(
                      ALL_EMPS.map(emp => {
                        const score = getComputedFinalScore(emp.id, selQPromosi);
                        const activeP = promotions[emp.id] || {
                          targetPlan: getPlansForScore(score)[0]
                        };
                        return activeP.targetPlan;
                      })
                    )).filter(Boolean);

                    const allUniqueDepts = Array.from(new Set(ALL_EMPS.map(emp => emp.dept)));

                    // Apply filters
                    let filteredCandidates = candidateList;
                    if (selPromosiDept !== 'all') {
                      filteredCandidates = filteredCandidates.filter(item => item.emp.dept === selPromosiDept);
                    }
                    if (selPromosiPlan !== 'all') {
                      filteredCandidates = filteredCandidates.filter(item => item.activeProm.targetPlan === selPromosiPlan);
                    }

                    return (
                      <div className="space-y-6">
                        <div className="bg-gradient-to-r from-emerald-800 to-indigo-900 rounded-2xl p-6 text-white shadow-md space-y-4">
                          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                            <div className="space-y-1">
                              <div className="inline-flex py-1 px-2.5 bg-white/10 rounded-full text-[10px] font-bold tracking-wider uppercase">
                                Promosi & Penyesuaian Pegawai
                              </div>
                              <h2 className="text-xl font-bold tracking-tight">Hub Evaluasi Promosi & Mutasi Suksesi Organisasi</h2>
                              <span className="text-xs text-emerald-200 font-medium block leading-relaxed max-w-2xl">
                                Peninjauan suksesi pangkat kerja, mutasi, serta asimilasi penyesuaian untuk <strong>seluruh pegawai</strong>. Rencana Suksesi disesuaikan berdasarkan kategori perolehan skor akhir untuk menjamin efektivitas penempatan.
                              </span>
                            </div>

                            <div className="flex items-center gap-2 bg-black/20 p-2.5 rounded-xl border border-white/10 shrink-0">
                              <span className="text-xs font-bold text-white uppercase tracking-wider">Siklus Acuan:</span>
                              <select
                                value={selQPromosi}
                                onChange={(e) => setSelQPromosi(e.target.value)}
                                className="text-xs p-2 border border-white/20 rounded-lg font-bold bg-emerald-950 text-white focus:outline-none cursor-pointer"
                              >
                                {Object.entries(quarters).map(([k, o]: [string, any]) => (
                                  <option key={k} value={k}>{o.label}</option>
                                ))}
                              </select>
                            </div>
                          </div>
                        </div>

                        {/* FILTER BAR FOR DIREKSI & HRD */}
                        <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-3xs grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                          <div className="space-y-1">
                            <label className="block text-[10px] text-gray-500 font-bold uppercase tracking-wider">Saring Sektor / Divisi:</label>
                            <select
                              value={selPromosiDept}
                              onChange={(e) => setSelPromosiDept(e.target.value)}
                              className="w-full text-xs p-2.5 border border-gray-200 rounded-xl font-bold bg-gray-50 text-gray-800 transition-all focus:ring-1 focus:ring-emerald-700 focus:outline-none cursor-pointer"
                            >
                              <option value="all">📁 Semua Divisi ({allUniqueDepts.length})</option>
                              {allUniqueDepts.map(dept => (
                                <option key={dept} value={dept}>🏢 {dept}</option>
                              ))}
                            </select>
                          </div>

                          <div className="space-y-1">
                            <label className="block text-[10px] text-gray-500 font-bold uppercase tracking-wider">Saring Rencana Suksesi:</label>
                            <select
                              value={selPromosiPlan}
                              onChange={(e) => setSelPromosiPlan(e.target.value)}
                              className="w-full text-xs p-2.5 border border-gray-200 rounded-xl font-bold bg-gray-50 text-gray-800 transition-all focus:ring-1 focus:ring-emerald-700 focus:outline-none cursor-pointer"
                            >
                              <option value="all">🎯 Semua Rencana / Promosi ({allUniquePlans.length})</option>
                              {allUniquePlans.map(plan => (
                                <option key={plan} value={plan}>{plan}</option>
                              ))}
                            </select>
                          </div>

                          <div className="bg-emerald-50/50 rounded-xl p-3 border border-emerald-100 flex flex-col justify-center">
                            <span className="text-[10px] text-emerald-800 font-black uppercase tracking-wide">Otoritas Akses:</span>
                            <span className="text-xs text-gray-600 font-medium">
                              Login: <strong className="text-indigo-900 font-black uppercase">{currentUser.role === 'direksi' ? 'Direksi (Final Approval)' : 'HRD Admin (Planner)'}</strong>
                            </span>
                          </div>
                        </div>

                        <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-xs space-y-4">
                          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-gray-100 pb-3">
                            <div>
                              <h3 className="text-xs font-extrabold text-emerald-800 uppercase tracking-wider">
                                Daftar Kontrol Promosi &amp; Penyesuaian Tim
                              </h3>
                              <p className="text-[11px] text-gray-400 mt-0.5">
                                Menampilkan seluruh pegawai aktif beserta rekomendasi rencana asimilasi bertingkat.
                              </p>
                            </div>
                            <span className="text-xs font-mono font-bold text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded border border-emerald-100">
                              Ditemukan: {filteredCandidates.length} Pegawai
                            </span>
                          </div>

                          {filteredCandidates.length === 0 ? (
                            <div className="py-12 text-center text-gray-400 space-y-3">
                              <div className="w-12 h-12 bg-gray-50 rounded-full flex items-center justify-center mx-auto text-gray-300 animate-bounce">
                                <Award className="w-6 h-6" />
                              </div>
                              <div className="space-y-1">
                                <p className="font-extrabold text-xs text-gray-600">Tidak ada pegawai yang sesuai dengan pilihan filter</p>
                                <p className="text-[11px] text-gray-400 max-w-md mx-auto">
                                  Silakan ubah pengaturan filter divisi atau rencana suksesi untuk melihat catatan suksesi pegawai lainnya.
                                </p>
                              </div>
                            </div>
                          ) : (
                            <div className="divide-y divide-gray-100">
                              {filteredCandidates.map(({ emp, kpiAvg, s360, finalScoreVal, activeProm }) => {
                                const plansArr = getPlansForScore(finalScoreVal);
                                if (activeProm.targetPlan && !plansArr.includes(activeProm.targetPlan)) {
                                  plansArr.unshift(activeProm.targetPlan);
                                }

                                // Deterministik color scheme based on user score categories
                                let bracketBadge = '';
                                let bracketColor = 'bg-gray-100 text-gray-600 border-gray-300';
                                if (finalScoreVal !== null) {
                                  if (finalScoreVal >= 90) {
                                    bracketBadge = '🏆 Suksesi Utama (Skor ≥ 90)';
                                    bracketColor = 'bg-emerald-50 text-emerald-800 border-emerald-200';
                                  } else if (finalScoreVal >= 80) {
                                    bracketBadge = '⭐ Suksesi Reguler (Skor 80 - 89)';
                                    bracketColor = 'bg-blue-50 text-blue-800 border-blue-200';
                                  } else if (finalScoreVal >= 65) {
                                    bracketBadge = '⚡ Suksesi Binaan (Skor 65 - 79)';
                                    bracketColor = 'bg-amber-50 text-amber-805 border-amber-200';
                                  } else {
                                    bracketBadge = '⚠️ Pembinaan PIP (Skor < 65)';
                                    bracketColor = 'bg-rose-50 text-rose-800 border-rose-200';
                                  }
                                } else {
                                  bracketBadge = '📝 Belum Dinilai (Lengkapi KPI)';
                                  bracketColor = 'bg-gray-50 text-gray-400 border-gray-200';
                                }

                                return (
                                  <div key={emp.id} className="py-5 first:pt-0 last:pb-0 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                                    {/* Left Details */}
                                    <div className="lg:col-span-5 space-y-3">
                                      <div className="space-y-1">
                                        <div className="flex items-center gap-2 flex-wrap">
                                          <span className="font-extrabold text-gray-800 text-sm">{emp.name}</span>
                                          <span className="font-mono text-[10px] text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded border border-gray-200">ID: {emp.id}</span>
                                        </div>
                                        <div className="flex items-center gap-2 flex-wrap text-[11px]">
                                          <span className="font-bold text-indigo-900 bg-indigo-50/50 px-2 py-0.5 rounded leading-none">
                                            {emp.dept} • {getUserRoleLabel(emp.role)}
                                          </span>
                                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded border leading-none ${bracketColor}`}>
                                            {bracketBadge}
                                          </span>
                                        </div>
                                      </div>

                                      {/* SCORE CARD BREAKDOWN */}
                                      <div className="bg-gray-50/60 border border-gray-200 p-3 rounded-xl space-y-2">
                                        <span className="block text-[9px] text-gray-400 font-bold uppercase tracking-wider">Metrik Nilai Rerata:</span>
                                        <div className="grid grid-cols-3 gap-2 text-center">
                                          <div className="bg-white p-1.5 rounded border border-gray-100">
                                            <span className="block text-[8px] text-gray-400 font-bold uppercase">KPI RATAAN</span>
                                            <span className="font-mono text-xs font-extrabold text-slate-800">{kpiAvg !== null ? kpiAvg.toFixed(1) : '—'}</span>
                                          </div>
                                          <div className="bg-white p-1.5 rounded border border-gray-100">
                                            <span className="block text-[8px] text-gray-400 font-bold uppercase">SKOR 360°</span>
                                            <span className="font-mono text-xs font-extrabold text-indigo-800">
                                              {s360 !== null ? s360.toFixed(1) : 'Nonaktif'}
                                            </span>
                                          </div>
                                          <div className="bg-emerald-50/50 p-1.5 rounded border border-emerald-100">
                                            <span className="block text-[8px] text-emerald-800 font-bold uppercase">SKOR AKHIR</span>
                                            <span className="font-mono text-xs font-black text-emerald-900">{finalScoreVal?.toFixed(1) || '—'}</span>
                                          </div>
                                        </div>
                                      </div>
                                    </div>

                                    {/* Right Controls */}
                                    <div className="lg:col-span-7 bg-emerald-50/20 border border-emerald-600/10 p-4 rounded-xl space-y-4">
                                      <span className="block text-[10px] text-emerald-800 font-black uppercase tracking-wider flex items-center gap-1.5">
                                        <Sliders className="w-3.5 h-3.5 text-emerald-600" />
                                        <span>Konfigurasi Rekomendasi Kerja:</span>
                                      </span>

                                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        {/* Dropdown Rencana Promosi */}
                                        <div className="space-y-1">
                                          <label className="block text-[9px] text-gray-500 font-bold uppercase">Rencana Suksesi (Rekomendasi HRD):</label>
                                          {currentUser.role === 'direksi' ? (
                                            <div className="w-full text-xs p-2.5 bg-slate-100 border border-slate-200 rounded-xl font-bold text-slate-700">
                                              🎯 {activeProm.targetPlan || 'Belum Ditentukan'}
                                            </div>
                                          ) : (
                                            <select
                                              value={activeProm.targetPlan}
                                              onChange={(e) => updatePromotionValue(emp.id, 'targetPlan', e.target.value)}
                                              className="w-full text-xs p-2 border border-gray-200 rounded-xl font-bold bg-white text-gray-800 focus:outline-none focus:ring-1 focus:ring-emerald-700 cursor-pointer"
                                            >
                                              {plansArr.map(p => (
                                                <option key={p} value={p}>{p}</option>
                                              ))}
                                            </select>
                                          )}
                                        </div>

                                        {/* Dropdown Status Persetujuan */}
                                        <div className="space-y-1">
                                          <label className="block text-[9px] text-gray-500 font-bold uppercase">Kewenangan Diskusi / ACC Direksi:</label>
                                          <select
                                            value={activeProm.status}
                                            onChange={(e) => updatePromotionValue(emp.id, 'status', e.target.value as any)}
                                            className={`w-full text-xs p-2 border rounded-xl font-black uppercase cursor-pointer focus:outline-none ${
                                              activeProm.status === 'approved' 
                                                ? 'bg-emerald-50 text-emerald-800 border-emerald-300' 
                                                : activeProm.status === 'not approved' 
                                                ? 'bg-rose-50 text-rose-800 border-rose-300' 
                                                : 'bg-amber-50 text-amber-800 border-amber-300'
                                            }`}
                                          >
                                            <option value="pending">🟡 Review (Tinjau Ulang Direksi)</option>
                                            <option value="approved">🟢 ACC / Approved (Disetujui Direksi)</option>
                                            <option value="not approved">🔴 Decline / Rejected (Ditolak / Ditangguhkan)</option>
                                          </select>
                                        </div>
                                      </div>

                                      {/* Catatan / Justifikasi Diskusi bersama Direksi */}
                                      <div className="space-y-1">
                                        <label className="block text-[9px] text-gray-500 font-bold uppercase">
                                          Catatan Justifikasi &amp; Rencana Detail (Readonly bagi Direksi):
                                        </label>
                                        {currentUser.role === 'direksi' ? (
                                          <div className="w-full text-xs p-3 bg-slate-100 border border-slate-200 rounded-xl text-slate-705 leading-relaxed font-semibold font-sans min-h-[50px]">
                                            📝 {activeProm.notes || 'Belum ada catatan justifikasi detail yang diisi oleh HRD.'}
                                          </div>
                                        ) : (
                                          <textarea
                                            value={activeProm.notes || ''}
                                            onChange={(e) => updatePromotionValue(emp.id, 'notes', e.target.value)}
                                            placeholder="Tuliskan justifikasi detail hasil diskusi bersama direksi, pangkat baru, atau restrukturisasi upah di sini..."
                                            rows={2}
                                            className="w-full text-xs p-2.5 border border-gray-200 rounded-xl bg-white text-gray-750 focus:outline-none focus:ring-1 focus:ring-emerald-700 font-sans leading-relaxed resize-y"
                                          />
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })()}

                  {page === 'monitor-kinerja' && (() => {
                    const isSpv = activeUser?.role === 'spv';
                    // SPV (asli MAUPUN HRD mode-SPV spt Irma) dibatasi HANYA divisinya sendiri.
                    // Mis. Irma (divisi HRD) di mode SPV → hanya pegawai divisi HRD.
                    const visibleEmps = isSpv
                      ? ALL_EMPS.filter(emp => emp.dept === activeUser?.dept)
                      : ALL_EMPS; // HRD Admin / Direksi: semua pegawai, semua divisi

                    // Dynamic evaluation helpers for custom Year, Month, and Quarter filters (Requirements 1 & 2)
                    const getFilteredKpiScore = (empId: string, yr: string, mth: string, qtrKey: string) => {
                      if (mth !== 'all') {
                        const yearPrefix = yr === 'all' ? '2026' : yr;
                        const monthKey = `${yearPrefix}-${mth}`;
                        return getLatestKpiScoreVal(empId, monthKey) ?? 0;
                      }
                      if (qtrKey !== 'all') {
                        return getQuarterKpiAverage(empId, qtrKey) ?? 0;
                      }
                      // Fallback: average across all quarters
                      const qKeys = Object.keys(quarters);
                      let total = 0;
                      let count = 0;
                      qKeys.forEach(qk => {
                        const avg = getQuarterKpiAverage(empId, qk);
                        if (avg !== null) {
                          total += avg;
                          count++;
                        }
                      });
                      return count > 0 ? total / count : 0;
                    };

                    const getFiltered360Score = (empId: string, qtrKey: string) => {
                      if (qtrKey !== 'all') {
                        return quarters[qtrKey]?.has360 ? (getScore360ForQuarter(empId, qtrKey) ?? 0) : 0;
                      }
                      // For 'all', average across valid quarters
                      const qKeys = Object.keys(quarters);
                      let total = 0;
                      let count = 0;
                      qKeys.forEach(qk => {
                        if (quarters[qk]?.has360) {
                          const val = getScore360ForQuarter(empId, qk);
                          if (val !== null) {
                            total += val;
                            count++;
                          }
                        }
                      });
                      return count > 0 ? total / count : 0;
                    };

                    const getFilteredFinalScore = (empId: string, yr: string, mth: string, qtrKey: string) => {
                      const kpi = getFilteredKpiScore(empId, yr, mth, qtrKey);
                      const s360 = getFiltered360Score(empId, qtrKey);
                      const penalty = getPenalty(empId, qtrKey === 'all' ? activeQuarterKey : qtrKey); // punishment per kuartal
                      if (qtrKey !== 'all' && !quarters[qtrKey]?.has360) {
                        return Math.max(0, kpi - penalty);
                      }
                      return Math.max(0, (kpi * 0.5) + (s360 * 0.5) - penalty);
                    };

                    return (
                      <div className="space-y-6">
                        <div className="bg-gradient-to-r from-emerald-800 to-indigo-900 rounded-2xl p-6 text-white shadow-md space-y-4">
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                          <div className="space-y-1">
                            <div className="inline-flex py-1 px-2.5 bg-white/10 rounded-full text-[10px] font-bold tracking-wider uppercase">
                              Sistem Intelijen Kinerja Tim
                            </div>
                            <h2 className="text-xl font-bold tracking-tight">Monitor Kinerja &amp; Tren Karyawan</h2>
                            <span className="text-xs text-emerald-200 font-medium block leading-relaxed max-w-2xl">
                              Panel monitoring performa dan skor kalibrasi. Dapatkan pemetaan visual performa kerja berbasis KPI Rerata, Evaluasi 360°, dan Skor Akhir bertingkat yang dapat difilter menyeluruh.
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* FILTERS CARD */}
                      <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-xs grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                        {/* 1. FILTER DIVISI (Only shown if NOT SPV / HRD Admin level) */}
                        {!isSpv && (
                          <div className="space-y-1.5 animate-fade-in">
                            <label className="block text-[11px] text-gray-500 font-bold uppercase tracking-wider flex items-center gap-1.5">
                              <Building className="w-3.5 h-3.5 text-emerald-600" />
                              <span>Filter Divisi / Sektor:</span>
                            </label>
                            <select
                              value={selChartDept}
                              onChange={(e) => {
                                setSelChartDept(e.target.value);
                                setSelChartEmpId('all');
                              }}
                              className="w-full text-xs p-2.5 border border-gray-200 rounded-xl font-bold bg-gray-50 text-gray-805 transition-all focus:ring-1 focus:ring-emerald-700 focus:outline-none cursor-pointer"
                            >
                              <option value="all">📁 Semua Divisi</option>
                              {Array.from(new Set(visibleEmps.map(emp => emp.dept))).map(dept => (
                                <option key={dept} value={dept}>🏢 {dept}</option>
                              ))}
                            </select>
                          </div>
                        )}

                        {/* 2. FILTER PILIH PENGAMATAN PEGAWAI */}
                        <div className="space-y-1.5">
                          <label className="block text-[11px] text-gray-500 font-bold uppercase tracking-wider flex items-center gap-1.5">
                            <Users2 className="w-3.5 h-3.5 text-indigo-600" />
                            <span>Pilih Pengamatan Pegawai:</span>
                          </label>
                          <select
                            value={selChartEmpId}
                            onChange={(e) => setSelChartEmpId(e.target.value)}
                            className="w-full text-xs p-2.5 border border-gray-200 rounded-xl font-bold bg-gray-50 text-gray-805 transition-all focus:ring-1 focus:ring-indigo-700 focus:outline-none cursor-pointer"
                          >
                            <option value="all">
                              {isSpv 
                                ? `📊 Bandingkan Semua Anggota Bimbingan (${selChartDept === 'all' ? 'Semua Sektor' : selChartDept})`
                                : `📊 Bandingkan Semua Anggota Tim (${selChartDept === 'all' ? 'Seluruh Divisi' : selChartDept})`
                              }
                            </option>
                            {visibleEmps
                              .filter(emp => isSpv ? true : (selChartDept === 'all' || emp.dept === selChartDept))
                              .map(emp => (
                                <option key={emp.id} value={emp.id}>👤 {emp.name}</option>
                              ))
                            }
                          </select>
                        </div>

                        {/* 3. FILTER BULAN (Requirement 1 & 2) */}
                        <div className="space-y-1.5">
                          <label className="block text-[11px] text-gray-500 font-bold uppercase tracking-wider flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5 text-blue-600" />
                            <span>Filter Bulan:</span>
                          </label>
                          <select
                            value={selChartMonth}
                            onChange={(e) => setSelChartMonth(e.target.value)}
                            className="w-full text-xs p-2.5 border border-gray-200 rounded-xl font-bold bg-gray-50 text-gray-805 transition-all focus:ring-1 focus:ring-blue-700 focus:outline-none cursor-pointer"
                          >
                            <option value="all">📆 Semua Bulan</option>
                            <option value="01">🗓️ Januari</option>
                            <option value="02">🗓️ Februari</option>
                            <option value="03">🗓️ Maret</option>
                            <option value="04">🗓️ April</option>
                            <option value="05">🗓️ Mei</option>
                            <option value="06">🗓️ Juni</option>
                            <option value="07">🗓️ Juli</option>
                            <option value="08">🗓️ Agustus</option>
                            <option value="09">🗓️ September</option>
                            <option value="10">🗓️ Oktober</option>
                            <option value="11">🗓️ November</option>
                            <option value="12">🗓️ Desember</option>
                          </select>
                        </div>

                        {/* 4. FILTER TAHUN (Requirement 1 & 2) */}
                        <div className="space-y-1.5">
                          <label className="block text-[11px] text-gray-500 font-bold uppercase tracking-wider flex items-center gap-1.5">
                            <CalendarDays className="w-3.5 h-3.5 text-rose-600" />
                            <span>Filter Tahun:</span>
                          </label>
                          <select
                            value={selChartYear}
                            onChange={(e) => setSelChartYear(e.target.value)}
                            className="w-full text-xs p-2.5 border border-gray-200 rounded-xl font-bold bg-gray-50 text-gray-805 transition-all focus:ring-1 focus:ring-rose-700 focus:outline-none cursor-pointer"
                          >
                            <option value="all">📅 Semua Tahun</option>
                            <option value="2026">📅 Tahun 2026</option>
                          </select>
                        </div>

                        {/* 5. FILTER KUARTAL (Requirement 1 & 2) */}
                        <div className="space-y-1.5">
                          <label className="block text-[11px] text-gray-500 font-bold uppercase tracking-wider flex items-center gap-1.5">
                            <Layers className="w-3.5 h-3.5 text-purple-600" />
                            <span>Filter Kuartal:</span>
                          </label>
                          <select
                            value={selChartQuarter}
                            onChange={(e) => setSelChartQuarter(e.target.value)}
                            className="w-full text-xs p-2.5 border border-gray-200 rounded-xl font-bold bg-gray-50 text-gray-805 transition-all focus:ring-1 focus:ring-purple-700 focus:outline-none cursor-pointer"
                          >
                            <option value="all">📦 Semua Kuartal</option>
                            {Object.entries(quarters).map(([k, o]: [string, any]) => (
                              <option key={k} value={k}>📦 {o.label}</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {/* CHART MODULE */}
                      {selChartEmpId === 'all' ? (() => {
                        // Gather comparison data based on comparison mode (anggota vs divisi)
                        const comparisonList = selChartMode === 'anggota'
                          ? visibleEmps
                              .filter(emp => isSpv ? true : (selChartDept === 'all' || emp.dept === selChartDept))
                              .map(emp => {
                                const kpiAvg = getFilteredKpiScore(emp.id, selChartYear, selChartMonth, selChartQuarter);
                                const s360 = getFiltered360Score(emp.id, selChartQuarter);
                                const finalScoreVal = getFilteredFinalScore(emp.id, selChartYear, selChartMonth, selChartQuarter);
                                return {
                                  id: emp.id,
                                  name: emp.name,
                                  dept: emp.dept,
                                  kpiAvg,
                                  s360,
                                  finalScoreVal
                                };
                              })
                          : Array.from(new Set(visibleEmps.map(emp => emp.dept))).sort().map(dept => {
                              const deptEmps = visibleEmps.filter(emp => emp.dept === dept);
                              let totalKpi = 0;
                              let total360 = 0;
                              let totalFinal = 0;
                              
                              deptEmps.forEach(emp => {
                                totalKpi += getFilteredKpiScore(emp.id, selChartYear, selChartMonth, selChartQuarter);
                                total360 += getFiltered360Score(emp.id, selChartQuarter);
                                totalFinal += getFilteredFinalScore(emp.id, selChartYear, selChartMonth, selChartQuarter);
                              });
                              
                              const count = Math.max(1, deptEmps.length);
                              return {
                                id: dept,
                                name: dept,
                                dept: 'Divisi',
                                kpiAvg: totalKpi / count,
                                s360: total360 / count,
                                finalScoreVal: totalFinal / count
                              };
                            });

                        const chartWidth = Math.max(680, 80 + comparisonList.length * 108);

                        return (
                          <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-xs space-y-6">
                            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-gray-100 pb-4">
                              <div className="space-y-1">
                                <h3 className="text-sm font-extrabold text-slate-800 uppercase tracking-tight flex items-center flex-wrap gap-2">
                                  <span>Matriks Perbandingan Kinerja {selChartMode === 'anggota' ? 'Anggota' : 'Divisi'}</span>
                                  <span className="text-xs bg-emerald-100 text-emerald-800 py-0.5 px-2 rounded-full font-bold">
                                    {comparisonList.length} {selChartMode === 'anggota' ? 'Pegawai' : 'Sektor / Divisi'}
                                  </span>
                                </h3>
                                <p className="text-xs text-gray-400">
                                  Menampilkan nilai KPI, Evaluasi 360°, dan Skor Akhir secara komparatif untuk {selChartQuarter === 'all' ? 'Semua Kuartal' : (quarters[selChartQuarter]?.label || selChartQuarter)}{selChartMonth !== 'all' ? ` (Bulan: ${selChartMonth})` : ''}{selChartYear !== 'all' ? ` (Tahun: ${selChartYear})` : ''}.
                                </p>
                              </div>

                              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                                {/* Segmented control level pembanding */}
                                <div className="flex bg-gray-100 p-1 rounded-xl">
                                  <button
                                    type="button"
                                    onClick={() => setSelChartMode('anggota')}
                                    className={`py-1 px-3 text-[10px] font-bold rounded-lg transition-all ${
                                      selChartMode === 'anggota'
                                        ? 'bg-white text-emerald-950 shadow-3xs'
                                        : 'text-gray-500 hover:text-slate-800'
                                    }`}
                                  >
                                    🗣️ Pegawai
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setSelChartMode('divisi')}
                                    className={`py-1 px-3 text-[10px] font-bold rounded-lg transition-all ${
                                      selChartMode === 'divisi'
                                        ? 'bg-white text-emerald-950 shadow-3xs'
                                        : 'text-gray-500 hover:text-slate-800'
                                    }`}
                                  >
                                    🏢 Divisi
                                  </button>
                                </div>

                                {/* LEGEND */}
                                <div className="flex items-center gap-3 text-[9px] font-bold text-gray-600 bg-gray-50 p-2 rounded-xl border border-gray-100">
                                  <div className="flex items-center gap-1">
                                    <span className="w-2.5 h-2.5 bg-emerald-400 rounded-2xs inline-block"></span>
                                    <span>Rataan KPI</span>
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <span className="w-2.5 h-2.5 bg-indigo-500 rounded-2xs inline-block"></span>
                                    <span>Evaluasi 360°</span>
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <span className="w-2.5 h-2.5 bg-sky-500 rounded-2xs inline-block"></span>
                                    <span>Skor Akhir</span>
                                  </div>
                                </div>
                              </div>
                            </div>

                            {/* HOVER INTERACTIVITY IN THE SVG CHART */}
                            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
                              {/* Left column: SVG Scrollable workspace */}
                              <div className="lg:col-span-8 bg-gray-50 rounded-2xl p-4 border border-gray-100 flex flex-col justify-between min-h-[360px]">
                                {comparisonList.length > 5 && (
                                  <div className="flex items-center justify-between text-[10px] text-gray-400 font-bold mb-2 px-1">
                                    <span className="flex items-center gap-1">↔️ Geser kanan-kiri untuk melihat performa lengkap</span>
                                    <span className="bg-gray-200/50 text-gray-650 px-1.5 py-0.5 rounded font-mono text-[9px] font-extrabold">{comparisonList.length} entri</span>
                                  </div>
                                )}

                                <div className="w-full overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-gray-200 scrollbar-track-transparent">
                                  {/* SVG WORKSPACE */}
                                  <svg width={chartWidth} height="320" className="overflow-visible font-sans mx-auto">
                                    {/* Grid Lines */}
                                    {[0, 20, 40, 60, 80, 100].map((val) => {
                                      const y = 280 - (val * 240) / 100;
                                      return (
                                        <g key={val} className="opacity-80">
                                          <line x1="45" y1={y} x2={chartWidth - 15} stroke="#e5e7eb" strokeWidth="1" strokeDasharray="3,3" />
                                          <text x="12" y={y + 4} className="fill-gray-400 font-mono font-bold text-[10px] text-right">{val}</text>
                                        </g>
                                      );
                                    })}

                                    {/* Rendering bar clusters */}
                                    {comparisonList.map((data, index) => {
                                      const blockWidth = 72;
                                      const spacing = 36;
                                      const startX = 60 + index * (blockWidth + spacing);
                                      
                                      // heights
                                      const kpiH = (data.kpiAvg * 240) / 100;
                                      const s360H = (data.s360 * 240) / 100;
                                      const finalH = (data.finalScoreVal * 240) / 100;

                                      const barWidth = blockWidth / 3.4;

                                      return (
                                        <g key={data.id} className="group cursor-pointer">
                                          {/* Hover block highlight background */}
                                          <rect
                                            x={startX - 10}
                                            y="20"
                                            width={blockWidth + 20}
                                            height="265"
                                            className="fill-black/[0.015] hover:fill-indigo-500/[0.03] transition-all rounded-lg"
                                          />

                                          {/* Bar 1: KPI */}
                                          <rect
                                            x={startX}
                                            y={280 - kpiH}
                                            width={barWidth}
                                            height={kpiH}
                                            rx="3"
                                            className="fill-emerald-400 opacity-95 group-hover:opacity-100 transition-all duration-300"
                                          />
                                          {/* Bar 2: 360 */}
                                          <rect
                                            x={startX + barWidth + 2}
                                            y={280 - s360H}
                                            width={barWidth}
                                            height={s360H}
                                            rx="3"
                                            className="fill-indigo-500 opacity-95 group-hover:opacity-100 transition-all duration-300"
                                          />
                                          {/* Bar 3: Final Score */}
                                          <rect
                                            x={startX + (barWidth * 2) + 4}
                                            y={280 - finalH}
                                            width={barWidth}
                                            height={finalH}
                                            rx="3"
                                            className="fill-sky-500 opacity-95 group-hover:opacity-100 transition-all duration-300"
                                          />

                                          {/* Label nama */}
                                          <text
                                            x={startX + blockWidth / 2}
                                            y="302"
                                            textAnchor="middle"
                                            className="fill-gray-600 font-bold text-[9px] group-hover:fill-indigo-800 transition-colors"
                                          >
                                            {selChartMode === 'anggota' ? data.name.split(' ')[0] : (data.name.length > 12 ? data.name.substring(0, 11) + '..' : data.name)}
                                          </text>
                                          <text
                                            x={startX + blockWidth / 2}
                                            y="314"
                                            textAnchor="middle"
                                            className="fill-gray-400 font-mono text-[8px]"
                                          >
                                            {data.dept}
                                          </text>

                                          {/* Hover label for exact scores (kotak dilebarkan agar teks tidak terpotong) */}
                                          <g className="invisible group-hover:visible transition-all">
                                            <rect
                                              x={startX + 36 - 92}
                                              y={Math.min(280 - kpiH, 280 - s360H, 280 - finalH) - 38}
                                              width="184"
                                              height="30"
                                              rx="6"
                                              className="fill-slate-900 filter drop-shadow-md"
                                            />
                                            <text
                                              x={startX + 36}
                                              y={Math.min(280 - kpiH, 280 - s360H, 280 - finalH) - 19}
                                              className="fill-white font-mono text-[9px] font-black"
                                              textAnchor="middle"
                                            >
                                              KPI {data.kpiAvg.toFixed(1)} · 360 {data.s360.toFixed(1)} · Akhir {data.finalScoreVal.toFixed(1)}
                                            </text>
                                          </g>
                                        </g>
                                      );
                                    })}
                                  </svg>
                                </div>
                              </div>

                              {/* COMPARATIVE INTERACTIVE REPORT CARD */}
                              <div className="lg:col-span-4 space-y-4 flex flex-col justify-between">
                                <div className="space-y-3">
                                  <span className="block text-[10px] text-slate-400 font-extrabold uppercase tracking-wider">
                                    Ikhtisar Nilai Sebaran Komparatif
                                  </span>

                                  {/* Table with mini layout */}
                                  <div className="border border-gray-100 rounded-xl overflow-hidden text-xs">
                                    <div className="grid grid-cols-3 bg-gray-50 p-2 font-bold text-gray-500 text-[10px] uppercase border-b border-gray-100">
                                      <span>{selChartMode === 'anggota' ? 'Pegawai' : 'Divisi'}</span>
                                      <span className="text-center">{selChartMode === 'anggota' ? 'Dept' : 'Sektor'}</span>
                                      <span className="text-right">Skor Akhir</span>
                                    </div>
                                    <div className="divide-y divide-gray-100 max-h-[190px] overflow-y-auto font-sans">
                                      {comparisonList.map(data => (
                                        <div key={data.id} className="grid grid-cols-3 p-2 hover:bg-gray-50 font-medium">
                                          <span className="truncate pr-1 text-gray-800">{data.name}</span>
                                          <span className="text-center text-gray-500">{data.dept}</span>
                                          <span className="text-right font-mono font-black text-emerald-800">{data.finalScoreVal.toFixed(1)}</span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                </div>

                                <div className="bg-indigo-50/50 rounded-xl p-3.5 border border-indigo-100/50 space-y-2">
                                  <span className="text-[10px] text-indigo-900 font-black uppercase tracking-wider flex items-center gap-1.5">
                                    <Info className="w-4 h-4 text-indigo-700" />
                                    <span>Skor Rata-rata {selChartMode === 'anggota' ? 'Sektor Kerja' : 'Perusahaan'}:</span>
                                  </span>
                                  <div className="grid grid-cols-2 gap-2 text-center">
                                    <div className="bg-white p-2 rounded-lg border border-indigo-100">
                                      <span className="text-[9px] text-slate-400 block font-bold uppercase">Rataan KPI</span>
                                      <span className="font-mono text-sm font-extrabold text-emerald-700">
                                        {(comparisonList.reduce((acc, curr) => acc + curr.kpiAvg, 0) / Math.max(1, comparisonList.length)).toFixed(1)}
                                      </span>
                                    </div>
                                    <div className="bg-white p-2 rounded-lg border border-indigo-100">
                                      <span className="text-[9px] text-slate-400 block font-bold uppercase">Rataan Akhir</span>
                                      <span className="font-mono text-sm font-black text-slate-800">
                                        {(comparisonList.reduce((acc, curr) => acc + curr.finalScoreVal, 0) / Math.max(1, comparisonList.length)).toFixed(1)}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })() : (() => {
                        const selectedEmp = visibleEmps.find(e => e.id === selChartEmpId);
                        if (!selectedEmp) return null;

                        const baseHistoricalData = Object.keys(quarters).map(qKey => {
                          const kpiAvg = getQuarterKpiAverage(selectedEmp.id, qKey) || 0;
                          const s360 = quarters[qKey]?.has360 ? (getScore360ForQuarter(selectedEmp.id, qKey) ?? 0) : 0;
                          const finalScoreVal = getComputedFinalScore(selectedEmp.id, qKey) || 0;
                          return {
                            qKey,
                            qLabel: quarters[qKey]?.label || qKey,
                            kpiAvg,
                            s360,
                            finalScoreVal
                          };
                        });

                        const historicalData = selChartQuarter !== 'all'
                          ? baseHistoricalData.filter(h => h.qKey === selChartQuarter)
                          : baseHistoricalData;

                        // Gather monthly KPI historical data
                        const empKpiHist = kpiHist[selectedEmp.id] || {};
                        const sortedMonths = Object.keys(empKpiHist).sort();
                        const baseMonthlyKpiData = sortedMonths.map(m => {
                          const list = empKpiHist[m] || [];
                          const score = list.length > 0 ? list[list.length - 1].score : 0;
                          const note = list.length > 0 ? list[list.length - 1].note : 'Entri KPI bulanan terekam';
                          const by = list.length > 0 ? list[list.length - 1].by : 'Supervisor';
                          const ts = list.length > 0 ? list[list.length - 1].ts : '—';
                          
                          const [year, month] = m.split('-');
                          const indonesianMonths: Record<string, string> = {
                            '01': 'Jan', '02': 'Feb', '03': 'Mar', '04': 'Apr', '05': 'Mei', '06': 'Jun',
                            '07': 'Jul', '08': 'Agu', '09': 'Sep', '10': 'Okt', '11': 'Nov', '12': 'Des'
                          };
                          const label = `${indonesianMonths[month] || month} ${year.slice(2)}`;
                          return {
                            monthKey: m,
                            label,
                            score,
                            note,
                            by,
                            ts
                          };
                        });

                        const monthlyKpiData = baseMonthlyKpiData.filter(h => {
                          if (selChartYear !== 'all' && !h.monthKey.startsWith(selChartYear)) return false;
                          if (selChartMonth !== 'all' && !h.monthKey.endsWith('-' + selChartMonth)) return false;
                          if (selChartQuarter !== 'all') {
                            const qMonths = quarters[selChartQuarter]?.months || [];
                            if (!qMonths.includes(h.monthKey)) return false;
                          }
                          return true;
                        });

                        // Tren BULANAN gabungan: KPI (per bulan), Evaluasi 360° (dari kuartal
                        // bulan tsb), dan Skor Akhir (blend 0.5/0.5 jika kuartal ber-360).
                        const findQuarterForMonth = (mk: string) =>
                          Object.keys(quarters).find(qk => (quarters[qk]?.months || []).includes(mk));
                        const monthlyTrend = monthlyKpiData.map(h => {
                          const qk = findQuarterForMonth(h.monthKey);
                          const has360 = qk ? !!quarters[qk]?.has360 : false;
                          const s360 = (qk && has360) ? (getScore360ForQuarter(selectedEmp.id, qk) ?? 0) : 0;
                          const penalty = getPenalty(selectedEmp.id, qk || activeQuarterKey); // punishment per kuartal
                          const finalScoreVal = Math.max(0, (has360 ? (h.score * 0.5 + s360 * 0.5) : h.score) - penalty);
                          return { monthKey: h.monthKey, label: h.label, kpi: h.score, s360, finalScoreVal };
                        });

                        const getXPctValue = (idx: number, len: number) => {
                          if (len <= 1) return 300;
                          return 60 + idx * (480 / (len - 1));
                        };

                        return (
                          <div className="space-y-6">
                          <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-xs space-y-6">
                            {/* TABBED MONITOR HEADER */}
                            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-gray-100 pb-4">
                              <div>
                                <h3 className="text-sm font-extrabold text-indigo-900 uppercase tracking-tight flex items-center gap-2">
                                  <span>Histori &amp; Tren Kinerja Individu: {selectedEmp.name}</span>
                                  <span className="text-[10px] bg-indigo-100 text-indigo-800 py-0.5 px-2.5 rounded-full font-bold">
                                    ID: {selectedEmp.id}
                                  </span>
                                </h3>
                                <p className="text-xs text-gray-400 mt-1">
                                  {monitorSubTab === 'kpi-bulanan'
                                    ? 'Menampilkan dinamika peningkatan kinerja berdasarkan input skor KPI setiap bulan secara rinci.'
                                    : 'Menampilkan rataan nilai KPI, evaluasi kepatuhan 360°, dan bobot skor akhir kuartalan.'
                                  }
                                </p>
                              </div>

                              {/* TAB SELECTOR */}
                              <div className="flex bg-gray-50 p-1 rounded-xl border border-gray-200 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => setMonitorSubTab('kpi-bulanan')}
                                  className={`px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-wide rounded-lg transition-all cursor-pointer ${
                                    monitorSubTab === 'kpi-bulanan'
                                      ? 'bg-emerald-600 text-white shadow-xs'
                                      : 'text-gray-550 hover:bg-gray-200'
                                  }`}
                                >
                                  📅 BULANAN (KPI)
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setMonitorSubTab('360-kuartalan')}
                                  className={`px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-wide rounded-lg transition-all cursor-pointer ${
                                    monitorSubTab === '360-kuartalan'
                                      ? 'bg-indigo-600 text-white shadow-xs'
                                      : 'text-gray-550 hover:bg-gray-200'
                                  }`}
                                >
                                  📊 KUARTALAN (360)
                                </button>
                              </div>
                            </div>

                            {/* LEGEND / SUB-INFO ROW */}
                            <div className="flex justify-between items-center text-[10px] text-gray-400 font-bold uppercase tracking-wider">
                              <span>Visualisasi Grafik Tren</span>
                              {monitorSubTab === 'kpi-bulanan' ? (
                                <div className="flex items-center gap-4 text-gray-600">
                                  <div className="flex items-center gap-1.5">
                                    <span className="w-2.5 h-2.5 bg-emerald-500 rounded-full inline-block"></span>
                                    <span>Skor KPI Bulanan</span>
                                  </div>
                                  <div className="flex items-center gap-1.5">
                                    <span className="w-5 h-0.5 border-t border-dashed border-emerald-400 inline-block"></span>
                                    <span>Garis Tren Capaian</span>
                                  </div>
                                </div>
                              ) : (
                                <div className="flex items-center gap-4 text-gray-600">
                                  <div className="flex items-center gap-1.5">
                                    <span className="w-3 h-0.5 border-t-2 border-dashed border-emerald-500 inline-block"></span>
                                    <span>Rata-rata KPI</span>
                                  </div>
                                  <div className="flex items-center gap-1.5">
                                    <span className="w-3 h-0.5 border-t-2 border-dashed border-indigo-400 inline-block"></span>
                                    <span>Evaluasi 360°</span>
                                  </div>
                                  <div className="flex items-center gap-1.5">
                                    <span className="w-4 h-1 bg-sky-500 rounded-full inline-block"></span>
                                    <span>Skor Akhir Kerja</span>
                                  </div>
                                </div>
                              )}
                            </div>

                            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
                              {/* SVG PROGRESSIVE LINE GRAPH */}
                              <div className="lg:col-span-8 bg-gray-50 rounded-2xl p-4 border border-gray-100 relative min-h-[300px] flex items-end">
                                <svg width="100%" height="280" viewBox="0 0 600 280" className="overflow-visible font-sans">
                                  {/* Grid Lines */}
                                  {[0, 25, 50, 75, 100].map((val) => {
                                    const y = 240 - (val * 200) / 100;
                                    return (
                                      <g key={val} className="opacity-80">
                                        <line x1="45" y1={y} x2="570" y2={y} stroke="#e5e7eb" strokeWidth="1" strokeDasharray="3,3" />
                                        <text x="12" y={y + 4} className="fill-gray-400 font-mono font-bold text-[10px] text-right">{val}</text>
                                      </g>
                                    );
                                  })}

                                  {/* Conditional Render Trendline */}
                                  {monitorSubTab === 'kpi-bulanan' ? (
                                    monthlyKpiData.length > 0 ? (() => {
                                      const pathPoints: string[] = [];
                                      monthlyKpiData.forEach((h, idx) => {
                                        const xPct = getXPctValue(idx, monthlyKpiData.length);
                                        const kpiY = 240 - (h.score * 200) / 100;
                                        pathPoints.push(`${xPct},${kpiY}`);
                                      });

                                      const shadingPoints = [
                                        `${getXPctValue(0, monthlyKpiData.length)},240`,
                                        ...pathPoints,
                                        `${getXPctValue(monthlyKpiData.length - 1, monthlyKpiData.length)},240`
                                      ].join(' ');

                                      return (
                                        <>
                                          {/* Gradient definitions */}
                                          <defs>
                                            <linearGradient id="emerald-gradient-glow" x1="0" y1="0" x2="0" y2="1">
                                              <stop offset="0%" stopColor="#10b981" stopOpacity="0.25" />
                                              <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
                                            </linearGradient>
                                          </defs>

                                          {/* Area Shading beneath the curve */}
                                          {monthlyKpiData.length > 1 && (
                                            <polygon
                                              points={shadingPoints}
                                              fill="url(#emerald-gradient-glow)"
                                            />
                                          )}

                                          {/* Main Trend Line */}
                                          {monthlyKpiData.length > 1 && (
                                            <polyline
                                              points={pathPoints.join(' ')}
                                              fill="none"
                                              stroke="#10b981"
                                              strokeWidth="3.5"
                                              strokeLinecap="round"
                                              strokeLinejoin="round"
                                            />
                                          )}

                                          {/* Interactive Monthly Points */}
                                          {monthlyKpiData.map((h, idx) => {
                                            const xPct = getXPctValue(idx, monthlyKpiData.length);
                                            const kpiY = 240 - (h.score * 200) / 100;

                                            return (
                                              <g key={idx} className="group cursor-pointer">
                                                {/* Hover line */}
                                                <line
                                                  x1={xPct}
                                                  y1="40"
                                                  x2={xPct}
                                                  y2="240"
                                                  stroke="#10b981"
                                                  strokeWidth="1.5"
                                                  strokeDasharray="2,3"
                                                  className="opacity-0 group-hover:opacity-40 transition-opacity"
                                                />

                                                {/* Glowing marker dot */}
                                                <circle
                                                  cx={xPct}
                                                  cy={kpiY}
                                                  r="8"
                                                  className="fill-emerald-500 stroke-white stroke-2 group-hover:fill-emerald-600 group-hover:r-10 transition-all"
                                                />
                                                <circle cx={xPct} cy={kpiY} r="3.5" className="fill-white" />

                                                {/* Month labels */}
                                                <text x={xPct} y="260" textAnchor="middle" className="fill-slate-650 font-sans font-bold text-[10px]">
                                                  {h.label}
                                                </text>

                                                {/* Interactive detailed tooltip */}
                                                <g className="invisible group-hover:visible transition-all duration-200 z-50">
                                                  <rect
                                                    x={xPct - 95}
                                                    y={Math.max(10, kpiY - 95)}
                                                    width="190"
                                                    height="80"
                                                    rx="10"
                                                    className="fill-slate-900 border border-slate-700 shadow-2xl"
                                                  />
                                                  <text x={xPct} y={Math.max(10, kpiY - 95) + 18} className="fill-white font-sans text-[11px] font-black" textAnchor="middle">
                                                    SKOR KPI: {h.score.toFixed(1)}
                                                  </text>
                                                  <text x={xPct} y={Math.max(10, kpiY - 95) + 34} className="fill-emerald-400 font-sans text-[9px] font-bold" textAnchor="middle">
                                                    Penilai: {h.by} • {h.ts.split(' ')[0]}
                                                  </text>
                                                  <text x={xPct} y={Math.max(10, kpiY - 95) + 52} className="fill-gray-300 font-sans text-[9px] italic" textAnchor="middle">
                                                    {h.note.length > 30 ? `"${h.note.slice(0, 28)}..."` : `"${h.note}"`}
                                                  </text>
                                                  <text x={xPct} y={Math.max(10, kpiY - 95) + 68} className="fill-gray-400 font-sans text-[8px] tracking-wide" textAnchor="middle">
                                                    Catatan Evaluasi Bulanan
                                                  </text>
                                                </g>
                                              </g>
                                            );
                                          })}
                                        </>
                                      );
                                    })() : (
                                      <text x="300" y="140" textAnchor="middle" className="fill-gray-400 text-xs italic">
                                        Belum ada rekaman entri KPI bulanan untuk pegawai ini.
                                      </text>
                                    )
                                  ) : (
                                    historicalData.length > 0 ? (() => {
                                      const pathKpiPoints: string[] = [];
                                      const path360Points: string[] = [];
                                      const pathFinalPoints: string[] = [];

                                      historicalData.forEach((h, idx) => {
                                        const xPct = getXPctValue(idx, historicalData.length);
                                        const kpiY = 240 - (h.kpiAvg * 200) / 100;
                                        const s360Y = 240 - (h.s360 * 200) / 100;
                                        const finalY = 240 - (h.finalScoreVal * 200) / 100;

                                        pathKpiPoints.push(`${xPct},${kpiY}`);
                                        path360Points.push(`${xPct},${s360Y}`);
                                        pathFinalPoints.push(`${xPct},${finalY}`);
                                      });

                                      return (
                                        <>
                                          {/* Polyline Paths */}
                                          {historicalData.length > 1 && (
                                            <>
                                              <polyline points={pathKpiPoints.join(' ')} fill="none" stroke="#10b981" strokeWidth="2" strokeDasharray="4,4" />
                                              <polyline points={path360Points.join(' ')} fill="none" stroke="#6366f1" strokeWidth="2" strokeDasharray="4,4" />
                                              <polyline points={pathFinalPoints.join(' ')} fill="none" stroke="#0ea5e9" strokeWidth="3.5" />
                                            </>
                                          )}

                                          {/* Interactive Points / Dots */}
                                          {historicalData.map((h, idx) => {
                                            const xPct = getXPctValue(idx, historicalData.length);
                                            const kpiY = 240 - (h.kpiAvg * 200) / 100;
                                            const s360Y = 240 - (h.s360 * 200) / 100;
                                            const finalY = 240 - (h.finalScoreVal * 200) / 100;

                                            return (
                                              <g key={idx} className="group cursor-pointer">
                                                {/* Guide line */}
                                                <line x1={xPct} y1="40" x2={xPct} y2="240" stroke="#cbd5e1" strokeWidth="1" strokeDasharray="2,2" />

                                                {/* Metric markers */}
                                                <circle cx={xPct} cy={finalY} r="7" className="fill-sky-500 stroke-white stroke-2 hover:r-9 transition-all" />
                                                <circle cx={xPct} cy={finalY} r="3.5" className="fill-white" />

                                                <circle cx={xPct} cy={kpiY} r="5" className="fill-emerald-400 stroke-white stroke-1" />
                                                <circle cx={xPct} cy={s360Y} r="5" className="fill-indigo-400 stroke-white stroke-1" />

                                                {/* Label */}
                                                <text x={xPct} y="260" textAnchor="middle" className="fill-slate-800 font-bold text-[10px]">
                                                  {h.qLabel}
                                                </text>

                                                {/* Custom Tooltip */}
                                                <g className="invisible group-hover:visible transition-all duration-200 z-50">
                                                  <rect x={xPct - 75} y={Math.max(10, finalY - 80)} width="150" height="65" rx="8" className="fill-slate-900 border border-slate-700 shadow-2xl" />
                                                  <text x={xPct} y={Math.max(10, finalY - 80) + 16} className="fill-white font-sans text-[10px] font-black text-center" textAnchor="middle">
                                                    {h.qLabel} SUMMARY
                                                  </text>
                                                  <text x={xPct} y={Math.max(10, finalY - 80) + 29} className="fill-emerald-400 font-sans text-[9px] font-bold text-center" textAnchor="middle">
                                                    Rataan KPI: {h.kpiAvg.toFixed(1)}
                                                  </text>
                                                  <text x={xPct} y={Math.max(10, finalY - 80) + 42} className="fill-indigo-350 font-sans text-[9px] font-bold text-center" textAnchor="middle">
                                                    Evaluasi 360°: {h.s360.toFixed(1)}
                                                  </text>
                                                  <text x={xPct} y={Math.max(10, finalY - 80) + 55} className="fill-sky-300 font-sans text-[10px] font-black text-center" textAnchor="middle">
                                                    Skor Akhir: {h.finalScoreVal.toFixed(1)}
                                                  </text>
                                                </g>
                                              </g>
                                            );
                                          })}
                                        </>
                                      );
                                    })() : null
                                  )}
                                </svg>
                              </div>

                              {/* DETAIL METRIC CARDS FOR SELECTED EMPLOYEE */}
                              <div className="lg:col-span-4 space-y-4">
                                {monitorSubTab === 'kpi-bulanan' ? (
                                  <>
                                    <span className="block text-[10px] text-slate-450 font-extrabold uppercase tracking-wider">
                                      Riwayat Entri KPI Bulanan
                                    </span>

                                    <div className="space-y-2.5 max-h-[290px] overflow-y-auto pr-1">
                                      {monthlyKpiData.map(m => {
                                        let scoreColor = 'text-gray-550 border-gray-200 bg-gray-50';
                                        if (m.score >= 90) scoreColor = 'text-emerald-800 border-emerald-250 bg-emerald-50/50';
                                        else if (m.score >= 80) scoreColor = 'text-indigo-800 border-indigo-250 bg-indigo-50/50';
                                        else if (m.score >= 70) scoreColor = 'text-amber-800 border-amber-250 bg-amber-50/50';

                                        return (
                                          <div key={m.monthKey} className="bg-white border border-gray-150 rounded-xl p-3 space-y-1.5 shadow-3xs transition-all hover:border-emerald-300">
                                            <div className="flex justify-between items-center text-xs">
                                              <span className="font-extrabold text-slate-800">{m.label}</span>
                                              <span className={`font-mono font-black text-[10px] px-2 py-0.5 rounded border ${scoreColor}`}>
                                                {m.score.toFixed(1)}
                                              </span>
                                            </div>
                                            <div className="space-y-1">
                                              <p className="text-[10px] text-gray-500 font-medium italic leading-relaxed line-clamp-2">
                                                &ldquo;{m.note || 'Tidak ada catatan entri.'}&rdquo;
                                              </p>
                                              <span className="block text-[8px] text-gray-400 font-bold uppercase tracking-wide">
                                                Penilai: {m.by} • {m.ts}
                                              </span>
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </>
                                ) : (
                                  <>
                                    <span className="block text-[10px] text-slate-450 font-extrabold uppercase tracking-wider">
                                      Dinamika Pencatatan Lintas Siklus
                                    </span>

                                    <div className="space-y-2.5">
                                      {historicalData.map(h => {
                                        let rateColor = 'bg-gray-100 text-gray-700';
                                        let rateLabel = 'PIP/Pembinaan';
                                        if (h.finalScoreVal >= 90) { rateColor = 'bg-emerald-100 text-emerald-800'; rateLabel = 'Sangat Istimewa (A)'; }
                                        else if (h.finalScoreVal >= 80) { rateColor = 'bg-blue-100 text-blue-800'; rateLabel = 'Istimewa (B)'; }
                                        else if (h.finalScoreVal >= 65) { rateColor = 'bg-amber-100 text-amber-800'; rateLabel = 'Cukup Kerja (C)'; }

                                        return (
                                          <div key={h.qKey} className="bg-gray-50 border border-gray-200 rounded-xl p-3 flex justify-between items-center text-xs">
                                            <div className="space-y-0.5">
                                              <span className="font-extrabold text-slate-800">{h.qLabel}</span>
                                              <span className={`block text-[9px] font-extrabold px-1.5 py-0.5 rounded ${rateColor} uppercase border border-white max-w-[130px] truncate`}>
                                                {rateLabel}
                                              </span>
                                            </div>
                                            <div className="text-right">
                                              <span className="block text-[10px] text-gray-400 font-bold uppercase">Skor Akhir</span>
                                              <span className="font-mono text-xs font-black text-slate-800">{h.finalScoreVal > 0 ? h.finalScoreVal.toFixed(1) : '—'}</span>
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>

                                    <div className="bg-gradient-to-br from-emerald-50 to-emerald-100/40 border border-emerald-100 p-4 rounded-xl space-y-2">
                                      <span className="text-[10px] text-emerald-950 font-extrabold uppercase tracking-wider block">Target Suksesi Kuartal Ini:</span>
                                      {(() => {
                                        const curProm = promotions[selectedEmp.id];
                                        if (curProm) {
                                          const statusEmoji = curProm.status === 'approved' ? '🟢 Disetujui' : curProm.status === 'not approved' ? '🔴 Ditangguhkan' : '🟡 Ditinjau';
                                          return (
                                            <div className="space-y-1">
                                              <span className="block text-xs font-black text-emerald-800">{curProm.targetPlan}</span>
                                              <span className="text-[10px] text-gray-500 font-bold block">{statusEmoji} • {curProm.notes || 'Catatan asimilasi belum didokumentasikan.'}</span>
                                            </div>
                                          );
                                        } else {
                                          return (
                                            <span className="text-xs text-gray-400 italic block">Rencana suksesi asimilasi belum ditentukan oleh HRD / Direksi.</span>
                                          );
                                        }
                                      })()}
                                    </div>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* CHART TREN BULANAN: KPI, EVALUASI 360° & SKOR AKHIR */}
                          <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-xs space-y-5">
                            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-gray-100 pb-4">
                              <div>
                                <h3 className="text-sm font-extrabold text-sky-900 uppercase tracking-tight flex items-center gap-2">
                                  <span>Tren Bulanan: KPI, Evaluasi 360° &amp; Skor Akhir</span>
                                  <span className="text-[10px] bg-sky-100 text-sky-800 py-0.5 px-2.5 rounded-full font-bold">
                                    {monthlyTrend.length} Bulan
                                  </span>
                                </h3>
                                <p className="text-xs text-gray-400 mt-1">
                                  Dimensi bulan: KPI per bulan, Evaluasi 360° dari kuartal terkait, dan Skor Akhir (bobot 50/50).
                                </p>
                              </div>
                              <div className="flex items-center gap-4 text-[10px] text-gray-600 font-bold uppercase tracking-wider">
                                <div className="flex items-center gap-1.5">
                                  <span className="w-3 h-0.5 border-t-2 border-dashed border-emerald-500 inline-block"></span><span>KPI</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <span className="w-3 h-0.5 border-t-2 border-dashed border-indigo-400 inline-block"></span><span>360°</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <span className="w-4 h-1 bg-sky-500 rounded-full inline-block"></span><span>Skor Akhir</span>
                                </div>
                              </div>
                            </div>

                            <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100 min-h-[300px] flex items-end">
                              {monthlyTrend.length > 0 ? (
                                <svg width="100%" height="280" viewBox="0 0 600 280" className="overflow-visible font-sans">
                                  {[0, 25, 50, 75, 100].map((val) => {
                                    const y = 240 - (val * 200) / 100;
                                    return (
                                      <g key={val} className="opacity-80">
                                        <line x1="45" y1={y} x2="570" y2={y} stroke="#e5e7eb" strokeWidth="1" strokeDasharray="3,3" />
                                        <text x="12" y={y + 4} className="fill-gray-400 font-mono font-bold text-[10px]">{val}</text>
                                      </g>
                                    );
                                  })}
                                  {(() => {
                                    const kpiPts: string[] = [];
                                    const s360Pts: string[] = [];
                                    const finalPts: string[] = [];
                                    monthlyTrend.forEach((h, idx) => {
                                      const x = getXPctValue(idx, monthlyTrend.length);
                                      kpiPts.push(`${x},${240 - (h.kpi * 200) / 100}`);
                                      s360Pts.push(`${x},${240 - (h.s360 * 200) / 100}`);
                                      finalPts.push(`${x},${240 - (h.finalScoreVal * 200) / 100}`);
                                    });
                                    return (
                                      <>
                                        {monthlyTrend.length > 1 && (
                                          <>
                                            <polyline points={kpiPts.join(' ')} fill="none" stroke="#10b981" strokeWidth="2" strokeDasharray="4,4" />
                                            <polyline points={s360Pts.join(' ')} fill="none" stroke="#6366f1" strokeWidth="2" strokeDasharray="4,4" />
                                            <polyline points={finalPts.join(' ')} fill="none" stroke="#0ea5e9" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
                                          </>
                                        )}
                                        {monthlyTrend.map((h, idx) => {
                                          const x = getXPctValue(idx, monthlyTrend.length);
                                          const kpiY = 240 - (h.kpi * 200) / 100;
                                          const s360Y = 240 - (h.s360 * 200) / 100;
                                          const finalY = 240 - (h.finalScoreVal * 200) / 100;
                                          return (
                                            <g key={h.monthKey} className="group cursor-pointer">
                                              <line x1={x} y1="40" x2={x} y2="240" stroke="#cbd5e1" strokeWidth="1" strokeDasharray="2,2" className="opacity-0 group-hover:opacity-60 transition-opacity" />
                                              <circle cx={x} cy={finalY} r="7" className="fill-sky-500 stroke-white stroke-2 hover:r-9 transition-all" />
                                              <circle cx={x} cy={finalY} r="3.5" className="fill-white" />
                                              <circle cx={x} cy={kpiY} r="5" className="fill-emerald-400 stroke-white stroke-1" />
                                              <circle cx={x} cy={s360Y} r="5" className="fill-indigo-400 stroke-white stroke-1" />
                                              <text x={x} y="260" textAnchor="middle" className="fill-slate-650 font-bold text-[10px]">{h.label}</text>
                                              <g className="invisible group-hover:visible transition-all duration-200">
                                                <rect x={x - 75} y={Math.max(10, finalY - 80)} width="150" height="65" rx="8" className="fill-slate-900 shadow-2xl" />
                                                <text x={x} y={Math.max(10, finalY - 80) + 16} textAnchor="middle" className="fill-white text-[10px] font-black">{h.label}</text>
                                                <text x={x} y={Math.max(10, finalY - 80) + 29} textAnchor="middle" className="fill-emerald-400 text-[9px] font-bold">KPI: {h.kpi.toFixed(1)}</text>
                                                <text x={x} y={Math.max(10, finalY - 80) + 42} textAnchor="middle" className="fill-indigo-300 text-[9px] font-bold">360°: {h.s360 > 0 ? h.s360.toFixed(1) : '—'}</text>
                                                <text x={x} y={Math.max(10, finalY - 80) + 55} textAnchor="middle" className="fill-sky-300 text-[10px] font-black">Skor Akhir: {h.finalScoreVal.toFixed(1)}</text>
                                              </g>
                                            </g>
                                          );
                                        })}
                                      </>
                                    );
                                  })()}
                                </svg>
                              ) : (
                                <div className="w-full text-center text-xs text-gray-400 italic py-20">
                                  Belum ada data bulanan untuk filter yang dipilih.
                                </div>
                              )}
                            </div>
                          </div>
                          </div>
                        );
                      })()}
                    </div>
                    );
                  })()}

                  {/* TAB: FLAG KEPATUHAN PENILAIAN (HRD) */}
                  {page === 'kepatuhan' && currentUser.role === 'hrd' && (() => {
                    // Per pegawai: penilaian WAJIB yang belum selesai (terlambat) + status Self Assessment.
                    const rows = allUsersList.map(u => {
                      const tasks = assessList[u.id] || [];
                      const mandatoryLate = tasks.filter(t =>
                        t.id !== u.id && getSifatForPair(u.id, t.id) === 'wajib' && t.status !== 'done'
                      );
                      const selfDone = tasks.some(t => t.id === u.id && t.status === 'done');
                      return {
                        id: u.id,
                        name: u.name,
                        dept: u.dept,
                        role: u.role,
                        lateCount: mandatoryLate.length,
                        lateTargets: mandatoryLate.map(t => t.name || t.id),
                        selfDone
                      };
                    });
                    const flagged = rows
                      .filter(r => r.lateCount > 0 || !r.selfDone)
                      .sort((a, b) => b.lateCount - a.lateCount);
                    const totalLate = rows.reduce((s, r) => s + r.lateCount, 0);
                    const totalNoSelf = rows.filter(r => !r.selfDone).length;

                    return (
                      <div className="space-y-6 animate-fade-in">
                        {/* Banner */}
                        <div className="bg-gradient-to-r from-rose-700 to-indigo-900 rounded-2xl p-6 text-white shadow-md space-y-1">
                          <div className="inline-flex py-1 px-2.5 bg-white/10 rounded-full text-[10px] font-bold tracking-wider uppercase">
                            Pemantauan Kepatuhan 360°
                          </div>
                          <h2 className="text-xl font-bold tracking-tight">Flag Kepatuhan Penilaian</h2>
                          <span className="text-xs text-rose-100 font-medium block leading-relaxed max-w-2xl">
                            Pegawai yang terlambat menyelesaikan penilaian <strong>wajib</strong> dan/atau
                            belum mengisi <strong>Self Assessment</strong>. Punishment berlaku untuk siklus
                            aktif: <strong>{quarters[activeQuarterKey]?.label || activeQuarterKey}</strong>.
                          </span>
                        </div>

                        {/* Stat cards */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div className="bg-white border border-gray-150 p-4 rounded-xl flex items-center gap-4 shadow-3xs">
                            <div className="p-3 rounded-lg bg-rose-50 text-rose-600"><AlertTriangle className="w-5 h-5" /></div>
                            <div>
                              <span className="block text-[10px] text-gray-400 font-extrabold uppercase tracking-wide">Pegawai Ter-flag</span>
                              <span className="text-lg font-black text-slate-805">{flagged.length} Pegawai</span>
                            </div>
                          </div>
                          <div className="bg-white border border-gray-150 p-4 rounded-xl flex items-center gap-4 shadow-3xs">
                            <div className="p-3 rounded-lg bg-amber-50 text-amber-700"><Clock className="w-5 h-5" /></div>
                            <div>
                              <span className="block text-[10px] text-gray-400 font-extrabold uppercase tracking-wide">Penilaian Wajib Terlambat</span>
                              <span className="text-lg font-black text-amber-800">{totalLate} Penilaian</span>
                            </div>
                          </div>
                          <div className="bg-white border border-gray-150 p-4 rounded-xl flex items-center gap-4 shadow-3xs">
                            <div className="p-3 rounded-lg bg-indigo-50 text-indigo-700"><UserIcon className="w-5 h-5" /></div>
                            <div>
                              <span className="block text-[10px] text-gray-400 font-extrabold uppercase tracking-wide">Belum Self Assessment</span>
                              <span className="text-lg font-black text-indigo-800">{totalNoSelf} Pegawai</span>
                            </div>
                          </div>
                        </div>

                        {/* Table */}
                        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-xs">
                          <div className="bg-gray-50/50 border-b border-gray-200 px-4 py-3">
                            <h3 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">Daftar Pegawai Ter-flag</h3>
                          </div>
                          {flagged.length === 0 ? (
                            <div className="py-12 text-center text-emerald-700 font-bold text-sm flex flex-col items-center gap-2">
                              <CheckCircle className="w-8 h-8 text-emerald-500" />
                              Semua pegawai patuh — tidak ada penilaian wajib terlambat atau Self Assessment yang kosong.
                            </div>
                          ) : (
                            <div className="overflow-x-auto">
                              <table className="w-full text-left text-xs text-gray-650 min-w-[640px]">
                                <thead>
                                  <tr className="bg-gray-150 border-b border-gray-200 font-bold text-[9px] uppercase tracking-wider text-gray-400">
                                    <th className="py-2.5 px-4">Pegawai</th>
                                    <th className="py-2.5 px-4">Divisi & Peran</th>
                                    <th className="py-2.5 px-4">Penilaian Wajib Terlambat</th>
                                    <th className="py-2.5 px-4 text-center">Self Assessment</th>
                                    <th className="py-2.5 px-4 text-center">Punishment & Skor Akhir</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {flagged.map((r) => (
                                    <tr key={r.id} className="border-b border-gray-100 last:border-none hover:bg-gray-50/20">
                                      <td className="py-3 px-4">
                                        <span className="font-bold text-gray-800 block">{r.name}</span>
                                        <span className="text-[10px] text-gray-450 font-mono">ID: {r.id}</span>
                                      </td>
                                      <td className="py-3 px-4 text-gray-600 font-semibold">
                                        {r.dept} <span className="text-gray-400">· {getUserRoleLabel(r.role)}</span>
                                      </td>
                                      <td className="py-3 px-4">
                                        {r.lateCount > 0 ? (
                                          <div className="space-y-1">
                                            <span className="inline-block text-[10px] font-black px-2 py-0.5 rounded-full border bg-rose-50 text-rose-700 border-rose-200 uppercase">
                                              ⚠ {r.lateCount} Terlambat
                                            </span>
                                            <span className="block text-[10px] text-gray-500 italic">
                                              {r.lateTargets.slice(0, 3).join(', ')}
                                              {r.lateTargets.length > 3 ? ` +${r.lateTargets.length - 3} lainnya` : ''}
                                            </span>
                                          </div>
                                        ) : (
                                          <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded-full border bg-emerald-50 text-emerald-700 border-emerald-150">✓ Tidak ada</span>
                                        )}
                                      </td>
                                      <td className="py-3 px-4 text-center">
                                        {r.selfDone ? (
                                          <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded-full border bg-emerald-50 text-emerald-700 border-emerald-150">✓ Sudah</span>
                                        ) : (
                                          <span className="inline-block text-[10px] font-black px-2 py-0.5 rounded-full border bg-rose-50 text-rose-700 border-rose-200 uppercase">⚠ Belum Diisi</span>
                                        )}
                                      </td>
                                      <td className="py-3 px-4 text-center">
                                        <div className="flex flex-col items-center gap-1">
                                          <div className="flex items-center gap-1">
                                            <input
                                              type="number"
                                              min={0}
                                              max={100}
                                              value={compliancePenalties[activeQuarterKey]?.[r.id] ?? ''}
                                              onChange={(e) => setCompliancePenalty(activeQuarterKey, r.id, e.target.value === '' ? 0 : Number(e.target.value))}
                                              placeholder="0"
                                              title="Pengurangan poin Skor Akhir akibat keterlambatan / Self Assessment (kuartal aktif)"
                                              className="w-16 text-xs p-1.5 border border-gray-250 rounded-lg text-center font-bold text-rose-700 focus:ring-1 focus:ring-rose-400 outline-none"
                                            />
                                            <span className="text-[10px] text-gray-400 font-bold">poin</span>
                                          </div>
                                          {(() => {
                                            const net = getComputedFinalScore(r.id, activeQuarterKey);
                                            const penalty = getPenalty(r.id, activeQuarterKey);
                                            return (
                                              <span className="text-[10px] font-mono font-bold text-slate-700">
                                                Skor Akhir: {net !== null ? net.toFixed(1) : '—'}
                                                {penalty > 0 && <span className="text-rose-600 font-black"> (−{penalty})</span>}
                                              </span>
                                            );
                                          })()}
                                        </div>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>

                        <p className="text-[11px] text-gray-400 italic px-1">
                          Catatan: "terlambat" = penilaian bersifat <strong>Wajib</strong> (dari Pemetaan) yang
                          belum berstatus selesai. <strong>Punishment</strong> = pengurangan poin yang langsung
                          memotong <strong>Skor Akhir</strong> pegawai (tersimpan otomatis, minimal 0). Sifat
                          penilaian diatur di halaman Pemetaan (Mapping).
                        </p>
                      </div>
                    );
                  })()}

                  {/* TAB: PROGRESS 360 FEEDBACK (Requirement 3) */}
                  {page === 'progress-360' && activeUser?.role === 'hrd' && (() => {
                    const getRelasiLabel = (penilaiId: string, targetId: string) => {
                      const match = mappings.find(m => m.penilaiId === penilaiId && m.yangDinilaiId === targetId);
                      return match ? match.relasi : 'Peer';
                    };

                    const assessors = allUsersList.map(user => {
                      const tasks = assessList[user.id] || [];
                      const totalTasks = tasks.length;
                      const doneTasks = tasks.filter(t => t.status === 'done').length;
                      const isCompleted = totalTasks > 0 && doneTasks === totalTasks;
                      const completionRate = totalTasks > 0 ? (doneTasks / totalTasks) * 100 : 0;
                      return {
                        ...user,
                        tasks,
                        totalTasks,
                        doneTasks,
                        isCompleted,
                        completionRate
                      };
                    }).filter(a => a.totalTasks > 0);

                    // Filters
                    const filteredAssessors = assessors.filter(a => {
                      if (progress360Search.trim()) {
                        const q = progress360Search.toLowerCase();
                        if (!a.name.toLowerCase().includes(q) && !a.id.toLowerCase().includes(q)) return false;
                      }
                      if (progress360Dept !== 'all' && a.dept !== progress360Dept) return false;
                      if (progress360Status === 'lengkap' && !a.isCompleted) return false;
                      if (progress360Status === 'belum' && a.isCompleted) return false;
                      return true;
                    });

                    // Calculations
                    const totalAssessors = assessors.length;
                    const doneAssessors = assessors.filter(a => a.isCompleted).length;
                    const pendingAssessors = totalAssessors - doneAssessors;
                    const overallTotalTasks = assessors.reduce((sum, a) => sum + a.totalTasks, 0);
                    const overallDoneTasks = assessors.reduce((sum, a) => sum + a.doneTasks, 0);
                    const overallPercent = overallTotalTasks > 0 ? (overallDoneTasks / overallTotalTasks) * 100 : 0;

                    const handleNudgeAssessor = (name: string, id: string) => {
                      const pendingTargets = (assessList[id] || [])
                        .filter(t => t.status === 'pending')
                        .map(t => {
                          const userMatch = allUsersList.find(u => u.id === t.id);
                          return userMatch ? userMatch.name : t.name || t.id;
                        });

                      if (pendingTargets.length === 0) {
                        showToast(`Semua penilaian oleh ${name} sudah selesai.`, 'info');
                        return;
                      }

                      const listStr = pendingTargets.slice(0, 2).join(', ') + (pendingTargets.length > 2 ? ` dan ${pendingTargets.length - 2} rekan lainnya` : '');
                      showToast(`🔔 Notifikasi pengingat berhasil terkirim ke ${name} untuk merampungkan penilaian terhadap: ${listStr}.`, 'ok');
                    };

                    const handleMassNudge = () => {
                      const incompleteCount = assessors.filter(a => !a.isCompleted).length;
                      if (incompleteCount === 0) {
                        showToast('Semua partisipan sudah lengkap menilai!', 'info');
                        return;
                      }
                      showToast(`🔔 Pengingat massal berhasil dilepaskan ke ${incompleteCount} penilai via sistem notifikasi.`, 'ok');
                    };

                    const handleForceCompleteTask = (penilaiId: string, targetId: string) => {
                      setAssessList(prev => {
                        const updated = { ...prev };
                        if (updated[penilaiId]) {
                          updated[penilaiId] = updated[penilaiId].map(t =>
                            t.id === targetId ? { ...t, status: 'done' as const } : t
                          );
                        }
                        localStorage.setItem('infarm_assess_list', JSON.stringify(updated));
                        return updated;
                      });
                      showToast('Ulasan berhasil ditandai Selesai secara manual oleh Admin.', 'ok');
                    };

                    return (
                      <div className="space-y-6 animate-fade-in">
                        {/* Title Banner */}
                        <div className="bg-gradient-to-r from-emerald-800 to-indigo-900 rounded-2xl p-6 text-white shadow-md space-y-4">
                          <div className="space-y-1">
                            <div className="inline-flex py-1 px-2.5 bg-white/10 rounded-full text-[10px] font-bold tracking-wider uppercase">
                              Pusat Evaluasi 360° Feedback
                            </div>
                            <h2 className="text-xl font-bold tracking-tight">Progress Partisipasi Penilaian Sosiometris</h2>
                            <span className="text-xs text-emerald-200 font-medium block leading-relaxed max-w-2xl">
                              Pantau keterisian kuesioner, kelengkapan evaluasi rekan kerja, dan hubungi partisipan yang belum selesai. Lakukan penyesuaian manual langsung jika diperlukan.
                            </span>
                          </div>
                        </div>

                        {/* Stats Row */}
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                          <div className="bg-white border border-gray-150 p-4 rounded-xl flex items-center gap-4 shadow-3xs">
                            <div className="p-3 rounded-lg bg-emerald-50 text-emerald-700">
                              <Users2 className="w-5 h-5" />
                            </div>
                            <div>
                              <span className="block text-[10px] text-gray-400 font-extrabold uppercase tracking-wide">Total Partisipan</span>
                              <span className="text-lg font-black text-slate-805">{totalAssessors} Pegawai</span>
                            </div>
                          </div>

                          <div className="bg-white border border-gray-150 p-4 rounded-xl flex items-center gap-4 shadow-3xs">
                            <div className="p-3 rounded-lg bg-emerald-100 text-emerald-800">
                              <CheckCircle className="w-5 h-5" />
                            </div>
                            <div>
                              <span className="block text-[10px] text-gray-400 font-extrabold uppercase tracking-wide font-sans">Selesai Lengkap</span>
                              <span className="text-lg font-black text-emerald-800">{doneAssessors} Pegawai</span>
                            </div>
                          </div>

                          <div className="bg-white border border-gray-150 p-4 rounded-xl flex items-center gap-4 shadow-3xs">
                            <div className="p-3 rounded-lg bg-amber-50 text-amber-700">
                              <Clock className="w-5 h-5" />
                            </div>
                            <div>
                              <span className="block text-[10px] text-gray-400 font-extrabold uppercase tracking-wide font-sans">Belum Lengkap</span>
                              <span className="text-lg font-black text-amber-700">{pendingAssessors} Pegawai</span>
                            </div>
                          </div>

                          <div className="bg-white border border-gray-150 p-4 rounded-xl shadow-3xs space-y-2">
                            <div className="flex justify-between items-center text-[10px] text-slate-500 font-extrabold uppercase tracking-wide">
                              <span>Kemajuan Submit</span>
                              <span className="font-mono text-xs">{overallDoneTasks} / {overallTotalTasks} ({overallPercent.toFixed(0)}%)</span>
                            </div>
                            <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
                              <div className="bg-indigo-600 h-full rounded-full transition-all" style={{ width: `${overallPercent}%` }} />
                            </div>
                          </div>
                        </div>

                        {/* Controls/Filters Row */}
                        <div className="bg-white border border-gray-150 p-4 rounded-xl shadow-3xs flex flex-wrap gap-4 items-center justify-between">
                          <div className="flex flex-wrap items-center gap-3 shrink-1 w-full lg:w-auto">
                            {/* Search */}
                            <div className="relative max-w-xs w-full">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"><Search className="w-4 h-4" /></span>
                              <input
                                type="text"
                                placeholder="Cari penilai (Nama/ID)..."
                                value={progress360Search}
                                onChange={(e) => setProgress360Search(e.target.value)}
                                className="w-full text-xs pl-9 pr-3 py-2 border border-gray-200 rounded-xl focus:ring-1 focus:ring-emerald-700 focus:outline-none focus:border-emerald-700 font-bold bg-gray-50 text-gray-805"
                              />
                            </div>

                            {/* Divisi */}
                            <select
                              value={progress360Dept}
                              onChange={(e) => setProgress360Dept(e.target.value)}
                              className="text-xs p-2 border border-gray-200 rounded-xl bg-gray-50 text-gray-805 font-bold focus:outline-none focus:ring-1 focus:ring-emerald-700 shrink-0 cursor-pointer"
                            >
                              <option value="all">📁 Semua Sektor/Divisi</option>
                              {Array.from(new Set(assessors.map(a => a.dept))).map(dept => (
                                <option key={dept} value={dept}>🏢 {dept}</option>
                              ))}
                            </select>

                            {/* Status */}
                            <select
                              value={progress360Status}
                              onChange={(e) => setProgress360Status(e.target.value)}
                              className="text-xs p-2 border border-gray-200 rounded-xl bg-gray-50 text-gray-805 font-bold focus:outline-none focus:ring-1 focus:ring-emerald-700 shrink-0 cursor-pointer"
                            >
                              <option value="all">🗳️ Semua Status Pengisian</option>
                              <option value="lengkap">🟢 Sudah Lengkap Menilai</option>
                              <option value="belum">⏳ Belum Lengkap Menilai</option>
                            </select>
                          </div>

                          {/* Mass nudge */}
                          <button
                            type="button"
                            onClick={handleMassNudge}
                            className="text-xs font-black uppercase text-white bg-indigo-600 hover:bg-indigo-800 px-4.5 py-2.5 rounded-xl flex items-center gap-2 shadow-2xs cursor-pointer transition-all"
                          >
                            <Bell className="w-3.5 h-3.5" />
                            <span>Kirim Pengingat Massal</span>
                          </button>
                        </div>

                        {/* Main Table Panel */}
                        <div className="bg-white border border-gray-150 rounded-2xl overflow-hidden shadow-3xs shadow-slate-100">
                          <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                              <thead>
                                <tr className="border-b border-gray-100 bg-gray-50/50 text-[10px] text-gray-400 font-extrabold uppercase tracking-wider">
                                  <th className="py-3 px-4">Nama Penilai</th>
                                  <th className="py-3 px-4">Divisi &amp; Peran</th>
                                  <th className="py-3 px-4">Target Penilaian</th>
                                  <th className="py-3 px-4 text-center">Kemajuan</th>
                                  <th className="py-3 px-4 text-center">Menilai Si Penilai</th>
                                  <th className="py-3 px-4 text-center">Status</th>
                                  <th className="py-3 px-4 text-center">Aksi</th>
                                </tr>
                              </thead>
                              <tbody>
                                {filteredAssessors.length > 0 ? (
                                  filteredAssessors.map((a) => {
                                    const isExpanded = expandedAssessorId === a.id;
                                    
                                    // Dynamically calculate who evaluates this current assessor and their progress (Requirement 3)
                                    const evaluatorsList = assessors.map(evaluator => {
                                      const taskForA = (assessList[evaluator.id] || []).find(t => t.id === a.id);
                                      return {
                                        hasTask: !!taskForA,
                                        isDone: taskForA?.status === 'done'
                                      };
                                    }).filter(e => e.hasTask);

                                    const totalAssessedByCount = evaluatorsList.length;
                                    const doneAssessedByCount = evaluatorsList.filter(e => e.isDone).length;
                                    const assessedByProgress = totalAssessedByCount > 0 ? (doneAssessedByCount / totalAssessedByCount) * 100 : 0;

                                    return (
                                      <React.Fragment key={a.id}>
                                        <tr className="hover:bg-slate-50/40 border-b border-gray-150 transition-colors">
                                          <td className="py-3.5 px-4">
                                            <div className="flex items-center gap-2.5">
                                              <div className="w-7 h-7 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center font-extrabold text-xs text-emerald-800 font-sans uppercase">
                                                {a.name.slice(0, 2)}
                                              </div>
                                              <div>
                                                <span className="block text-xs font-extrabold text-slate-800 leading-relaxed">{a.name}</span>
                                                <span className="block text-[9px] text-gray-400 font-mono tracking-wide">{a.id}</span>
                                              </div>
                                            </div>
                                          </td>
                                          <td className="py-3.5 px-4 font-sans font-bold text-xs text-slate-700">
                                            <span className="block">{a.dept}</span>
                                            <span className="block text-[9px] text-gray-400 font-sans uppercase tracking-wide">{getUserRoleLabel(a.role)}</span>
                                          </td>
                                          <td className="py-3.5 px-4 text-xs font-bold text-slate-600">
                                            📋 {a.totalTasks} Pegawai
                                          </td>
                                          <td className="py-3.5 px-4">
                                            <div className="max-w-[120px] mx-auto space-y-1">
                                              <div className="flex justify-between items-center text-[9px] font-extrabold text-gray-400">
                                                <span>{a.doneTasks} / {a.totalTasks} selesai</span>
                                                <span>{a.completionRate.toFixed(0)}%</span>
                                              </div>
                                              <div className="w-full bg-gray-100 h-1.5 rounded-full overflow-hidden">
                                                <div 
                                                  className={`h-full rounded-full transition-all ${a.isCompleted ? 'bg-emerald-500' : 'bg-orange-400'}`} 
                                                  style={{ width: `${a.completionRate}%` }} 
                                                />
                                              </div>
                                            </div>
                                          </td>
                                          <td className="py-3.5 px-4 text-center">
                                            <div className="max-w-[120px] mx-auto space-y-1">
                                              <div className="flex justify-between items-center text-[9px] font-extrabold text-gray-400">
                                                <span>{doneAssessedByCount} / {totalAssessedByCount} selesai</span>
                                                <span>{assessedByProgress.toFixed(0)}%</span>
                                              </div>
                                              <div className="w-full bg-gray-100 h-1.5 rounded-full overflow-hidden">
                                                <div 
                                                  className={`h-full rounded-full transition-all ${assessedByProgress === 100 ? 'bg-indigo-600' : 'bg-amber-400'}`} 
                                                  style={{ width: `${assessedByProgress}%` }} 
                                                />
                                              </div>
                                            </div>
                                          </td>
                                          <td className="py-3.5 px-4 text-center">
                                            {a.isCompleted ? (
                                              <span className="inline-flex items-center gap-1.5 py-1 px-2.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-150 text-[10px] font-extrabold uppercase">
                                                <CheckCircle className="w-3 h-3 text-emerald-600" />
                                                Lengkap
                                              </span>
                                            ) : (
                                              <span className="inline-flex items-center gap-1.5 py-1 px-2.5 rounded-full bg-amber-50 text-amber-800 border border-amber-150 text-[10px] font-extrabold uppercase">
                                                <Clock className="w-3 h-3 text-amber-600" />
                                                Belum Lengkap
                                              </span>
                                            )}
                                          </td>
                                          <td className="py-3.5 px-4 text-center">
                                            <div className="flex items-center justify-center gap-2">
                                              {!a.isCompleted ? (
                                                <button
                                                  type="button"
                                                  onClick={() => handleNudgeAssessor(a.name, a.id)}
                                                  className="text-[10px] font-black uppercase text-indigo-700 hover:text-indigo-950 font-sans hover:bg-indigo-50/50 py-1.5 px-2.5 rounded-lg border border-indigo-200 cursor-pointer shrink-0 transition-colors"
                                                >
                                                  Kirim Pengingat
                                                </button>
                                              ) : (
                                                <span className="text-[10px] text-gray-400 font-bold uppercase py-1.5 px-2.5 block cursor-default">—</span>
                                              )}

                                              <button
                                                type="button"
                                                onClick={() => setExpandedAssessorId(isExpanded ? null : a.id)}
                                                className="text-[10px] text-zinc-650 font-bold bg-slate-50 border border-neutral-200 p-1.5 rounded-lg shadow-3xs cursor-pointer hover:bg-neutral-100 transition-colors flex items-center justify-center shrink-0"
                                                title="Lihat target detail"
                                              >
                                                {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                              </button>
                                            </div>
                                          </td>
                                        </tr>

                                        {/* Expand block details */}
                                        {isExpanded && (
                                          <tr className="bg-slate-50/60 border-b border-gray-150">
                                            <td colSpan={6} className="p-4 bg-emerald-50/5">
                                              <div className="max-w-4xl mx-auto border border-gray-150 rounded-xl bg-white p-4 shadow-3xs space-y-4">
                                                <div className="flex justify-between items-center border-b border-slate-100 pb-2.5">
                                                  <span className="text-[10px] text-slate-705 font-black uppercase tracking-wider block">
                                                    Daftar Target Penjadwalan oleh {a.name}
                                                  </span>
                                                  <span className="text-[10px] text-gray-400 font-bold">
                                                    Siklus Acuan Evaluasi Sosiometris Aktif
                                                  </span>
                                                </div>

                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                                                  {a.tasks.map((task) => {
                                                    const targetUser = allUsersList.find(u => u.id === task.id);
                                                    const relasiLabel = getRelasiLabel(a.id, task.id);
                                                    let isDone = task.status === 'done';

                                                    return (
                                                      <div 
                                                        key={task.id} 
                                                        className="border border-neutral-100 rounded-xl p-3 flex justify-between items-center bg-gray-50/50 hover:bg-neutral-50 transition-all hover:border-emerald-250"
                                                      >
                                                        <div className="space-y-1">
                                                          <div className="flex items-center gap-2">
                                                            <span className="text-xs font-extrabold text-slate-805">{targetUser ? targetUser.name : task.id}</span>
                                                            <span className="text-[9px] font-bold bg-indigo-50 text-indigo-800 py-0.5 px-2 rounded-full border border-indigo-100 uppercase">
                                                              {relasiLabel}
                                                            </span>
                                                            {(() => {
                                                              const sifat = getSifatForPair(a.id, task.id);
                                                              return (
                                                                <span className={`text-[9px] font-bold py-0.5 px-2 rounded-full border uppercase ${sifatBadgeClass(sifat)}`}>
                                                                  {sifat === 'opsional' ? 'Opsional' : 'Wajib'}
                                                                </span>
                                                              );
                                                            })()}
                                                          </div>
                                                          <span className="block text-[9px] text-gray-400 font-mono">ID Target: {task.id} • Dept: {targetUser?.dept || '—'}</span>
                                                        </div>

                                                        <div className="flex items-center gap-2.5 text-right">
                                                          {isDone ? (
                                                            <span className="inline-flex items-center gap-1 text-[9px] font-extrabold text-emerald-800 uppercase">
                                                              <Check className="w-3.5 h-3.5 text-emerald-600 stroke-[3]" />
                                                              Selesai
                                                            </span>
                                                          ) : task.status === 'draft' ? (
                                                            <div className="flex items-center gap-2">
                                                              <span className="inline-flex items-center gap-1 text-[9px] font-extrabold text-indigo-700 uppercase">
                                                                <Clock className="w-3 h-3 text-indigo-500" />
                                                                Draf
                                                              </span>
                                                              <button
                                                                type="button"
                                                                onClick={() => handleForceCompleteTask(a.id, task.id)}
                                                                className="text-[9px] font-black uppercase tracking-wide text-white bg-emerald-700 hover:bg-emerald-950 px-2.5 py-1.5 rounded-lg border border-emerald-600 transition-colors cursor-pointer"
                                                                title="Tandai evaluasi sebagai selesai (override administrator)"
                                                              >
                                                                Paksa Selesai
                                                              </button>
                                                            </div>
                                                          ) : (
                                                            <div className="flex items-center gap-2">
                                                              <span className="inline-flex items-center gap-1 text-[9px] font-extrabold text-amber-700 uppercase">
                                                                <Clock className="w-3 h-3 text-amber-600" />
                                                                Pending
                                                              </span>
                                                              <button
                                                                type="button"
                                                                onClick={() => handleForceCompleteTask(a.id, task.id)}
                                                                className="text-[9px] font-black uppercase tracking-wide text-white bg-emerald-700 hover:bg-emerald-950 px-2.5 py-1.5 rounded-lg border border-emerald-600 transition-colors cursor-pointer"
                                                                title="Tandai evaluasi sebagai selesai (override administrator)"
                                                              >
                                                                Paksa Selesai
                                                              </button>
                                                            </div>
                                                          )}
                                                        </div>
                                                      </div>
                                                    );
                                                  })}
                                                </div>
                                              </div>
                                            </td>
                                          </tr>
                                        )}
                                      </React.Fragment>
                                    );
                                  })
                                ) : (
                                  <tr>
                                    <td colSpan={6} className="py-8 text-center text-xs text-slate-400 italic">
                                      Tidak ada data partisipan penilai yang sesuai dengan kriteria penyaringan.
                                    </td>
                                  </tr>
                                )}
                              </tbody>
                            </table>
                          </div>
                          
                          <div className="bg-slate-50/80 border-t border-gray-150 p-3 flex justify-between items-center text-[10px] text-gray-400 font-bold uppercase">
                            <span>Menampilkan {filteredAssessors.length} dari {assessors.length} penilai aktif</span>
                            <span>Akses Panel: Level HRD Administrator</span>
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                </motion.div>
              </AnimatePresence>
            )}
          </main>
        </div>
      )}

      {/* Global MODAL: Correction Request */}
      {showCorrectionModal && correctionTarget && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-[999]">
          <div className="bg-white rounded-2xl border border-gray-150 max-w-md w-full shadow-lg p-6 space-y-4 animate-fade-in">
            <div className="flex justify-between items-start">
              <h3 className="text-sm font-extrabold text-indigo-900 uppercase tracking-wide">Pengajuan Koreksi Relasi Kerja</h3>
              <button
                type="button"
                onClick={() => {
                  setShowCorrectionModal(false);
                  setCorrectionTarget(null);
                }}
                className="text-gray-400 hover:text-gray-600 font-bold bg-gray-50 hover:bg-gray-100 p-1 rounded-full transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-gray-455 leading-relaxed leading-[18px]">
              Anda mengajukan penyesuaian garis hubungan sosiometris / relasi kerja untuk penilaian terhadap rekan kerja <strong>{correctionTarget.yangDinilaiName}</strong>. 
              Permasalahan peninjauan ini akan dikirimkan untuk divalidasi HRD Admin.
            </p>

            <div className="space-y-3.5">
              <div>
                <label className="block text-[10px] uppercase font-extrabold text-gray-400 mb-1">Garis Hubungan Saat Ini</label>
                <div className="text-xs font-bold text-gray-800 bg-gray-50 px-3 py-2.5 rounded-lg border border-gray-150">
                  {correctionTarget.currentRelasi}
                </div>
              </div>

              <div>
                <label className="block text-[10px] uppercase font-extrabold text-gray-405 mb-1 text-indigo-950">Relasi yang Semestinya</label>
                <select
                  value={correctionNewRelasi}
                  onChange={(e) => setCorrectionNewRelasi(e.target.value)}
                  className="w-full text-xs p-2.5 border border-gray-200 rounded-xl bg-white text-emerald-900 font-bold"
                >
                  <option value="Bawahan">Bawahan</option>
                  <option value="Peer">Peer</option>
                  <option value="Atasan">Atasan</option>
                  <option value="Cross">Cross</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] uppercase font-extrabold text-gray-405 mb-1 text-indigo-950">Alasan Koreksi Pembetulan</label>
                <textarea
                  value={correctionReason}
                  onChange={(e) => setCorrectionReason(e.target.value)}
                  placeholder="Jelaskan mengapa garis hubungan penilaian ini perlu direvisi (misal: 'Aris bukan atasan saya melainkan peer di departemen IT')"
                  className="w-full text-xs p-2.5 border border-gray-200 rounded-xl h-24 focus:ring-1 focus:ring-emerald-700 font-medium"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowCorrectionModal(false);
                  setCorrectionTarget(null);
                }}
                className="text-xs font-bold text-gray-500 hover:text-gray-700 bg-gray-50 hover:bg-gray-100 border border-gray-200 px-4 py-2 rounded-lg cursor-pointer transition-colors"
              >
                Batalkan
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!correctionReason.trim()) {
                    showToast('Harap cantumkan alasan pengajuan koreksi relasi.', 'err');
                    return;
                  }
                  const newReq = {
                    id: `REQ_${Date.now()}`,
                    penilaiId: correctionTarget.penilaiId,
                    penilaiName: correctionTarget.penilaiName,
                    yangDinilaiId: correctionTarget.yangDinilaiId,
                    yangDinilaiName: correctionTarget.yangDinilaiName,
                    oldRelasi: correctionTarget.currentRelasi,
                    newRelasi: correctionNewRelasi,
                    reason: correctionReason,
                    status: 'pending' as const
                  };
                  setRelationRequests(prev => [newReq, ...prev]);
                  showToast('Pengajuan koreksi relasi telah berhasil dikirim ke HRD Admin.', 'ok');
                  setShowCorrectionModal(false);
                  setCorrectionTarget(null);
                  setCorrectionReason('');
                }}
                className="text-xs font-bold text-white bg-emerald-800 hover:bg-emerald-950 px-4 py-2 rounded-lg cursor-pointer transition-colors"
              >
                Kirim Pengajuan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- FLOATING END-TO-END SIMULATOR PAD --- */}
      <div className="fixed bottom-4 right-4 z-[99] flex flex-col items-end scale-95 origin-bottom-right">
        {simulationDrawerOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 30 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="mb-3 w-85 bg-slate-950 border border-slate-700 text-white rounded-2xl shadow-2xl p-5 overflow-y-auto max-h-[75vh] space-y-4 font-sans border-solid"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-700 pb-2.5">
              <div className="flex items-center gap-2">
                <span className="text-sm">🛠️</span>
                <span className="text-xs font-black tracking-wider uppercase text-emerald-400">Simulator Control Pad</span>
              </div>
              <button
                type="button"
                onClick={() => setSimulationDrawerOpen(false)}
                className="text-xs font-bold text-slate-405 hover:text-white bg-slate-800 hover:bg-slate-700 p-1 px-1.5 rounded cursor-pointer leading-none"
              >
                ✕
              </button>
            </div>

            {/* Quick Note */}
            <p className="text-[10px] text-slate-300 leading-normal font-sans text-left">
              Gunakan panel ini untuk mensimulasikan rater yang mengirimkan komentar murni & pengujian status operasional secara langsung.
            </p>

            {/* Part 1: Period control */}
            <div className="p-3 bg-slate-900 rounded-xl border border-slate-800/80 space-y-2.5 text-left border-solid">
              <span className="block text-[10px] font-black uppercase text-indigo-300">1. Konfigurasi Siklus Periode</span>
              
              <div>
                <label className="block text-[9px] text-slate-400 font-bold mb-1 uppercase">Pilih Kuartal Acuan Aktif</label>
                <select
                  value={activeQuarterKey}
                  onChange={(e) => {
                    setActiveQuarterKey(e.target.value);
                    showToast(`Kuartal acuan aktif secara global diganti ke: ${e.target.value}`, 'info');
                  }}
                  className="w-full text-[10px] p-2 bg-slate-800 border border-slate-700 rounded-lg text-white font-bold cursor-pointer"
                >
                  {Object.entries(quarters).map(([k, q]: [string, any]) => (
                    <option key={k} value={k}>
                      {q.label} ({q.status === 'active' ? 'AKTIF' : 'TERKUNCI'})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    handleTogglePeriodActive();
                    showToast(`Siklus ${quarters[activeQuarterKey]?.label} berhasil di-${quarters[activeQuarterKey]?.status === 'active' ? 'kunci' : 'aktifkan'}!`, 'info');
                  }}
                  className={`py-1.5 px-2 text-[10px] font-bold rounded-lg transition-all text-center cursor-pointer ${
                    quarters[activeQuarterKey]?.status === 'active'
                      ? 'bg-rose-700 hover:bg-rose-800 text-white'
                      : 'bg-emerald-700 hover:bg-emerald-800 text-white'
                  }`}
                >
                  {quarters[activeQuarterKey]?.status === 'active' ? '🔒 Kunci Sesi' : '🔓 Aktifkan Sesi'}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const curVal = quarters[activeQuarterKey]?.has360;
                    setQuarters(prev => {
                      const cur = prev[activeQuarterKey];
                      if (!cur) return prev;
                      return {
                        ...prev,
                        [activeQuarterKey]: {
                          ...cur,
                          has360: !cur.has360
                        }
                      };
                    });
                    showToast(`Format ${quarters[activeQuarterKey]?.label} diubah: ${!curVal ? 'GABUNGAN KPI + 360°' : '100% KPI MURNI'}`, 'info');
                  }}
                  className="py-1.5 px-2 text-[10px] font-bold rounded-lg bg-indigo-900 hover:bg-indigo-850 text-indigo-100 text-center cursor-pointer"
                >
                  {quarters[activeQuarterKey]?.has360 ? '💡 Matikan 360°' : '💡 Hidupkan 360°'}
                </button>
              </div>
            </div>

            {/* Part 2: Populate / Simulate feedback */}
            <div className="p-3 bg-slate-900 rounded-xl border border-slate-800/80 space-y-2.5 text-left border-solid">
              <span className="block text-[10px] font-black uppercase text-indigo-300">2. Simulasi Masukan 360° Raters</span>
              
              <div>
                <label className="block text-[9px] text-slate-400 font-bold mb-1 uppercase">Pilih Target Pegawai</label>
                <select
                  value={simTargetEmpId}
                  onChange={(e) => setSimTargetEmpId(e.target.value)}
                  className="w-full text-[10px] p-2 bg-slate-800 border border-slate-700 rounded-lg text-white font-semibold cursor-pointer"
                >
                  {ALL_EMPS.map(emp => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name} ({emp.dept} - {emp.id})
                    </option>
                  ))}
                </select>
              </div>

              {/* Rater status */}
              {(() => {
                const qAnswers = evalAnswers[activeQuarterKey] || {};
                const raters = [
                  { id: 'EMP002', name: 'Budi Santoso', role: 'Rekan Kerja (Peer)', icon: '👥' },
                  { id: 'SPV001', name: 'Gunawan Wibowo', role: 'Supervisor (Direct)', icon: '👔' },
                  { id: 'HRD001', name: 'Irma Suryani', role: 'HRD (External)', icon: '⚖️' }
                ];
                let count = 0;
                raters.forEach(r => {
                  if (qAnswers[r.id] && qAnswers[r.id][simTargetEmpId]) {
                    count++;
                  }
                });
                return (
                  <div className="space-y-2">
                    <div className="flex justify-between items-center bg-slate-800 px-2 py-1.5 rounded-lg border border-slate-750 text-[9px] font-semibold text-slate-300">
                      <span>Progres Umpan Balik ({quarters[activeQuarterKey]?.label || activeQuarterKey}):</span>
                      <span className="font-bold text-emerald-450">{count} dari {raters.length} Raters</span>
                    </div>

                    <div className="bg-slate-950/60 p-2 rounded-lg border border-slate-800/80 space-y-1.5">
                      <span className="block text-[8px] font-black uppercase text-slate-500 tracking-wider">Status & Simulasi Per Rater:</span>
                      {raters.map((r, rIdx) => {
                        const hasSubmitted = !!(qAnswers[r.id] && qAnswers[r.id][simTargetEmpId]);
                        return (
                          <div key={r.id} className="flex items-center justify-between gap-1 p-1 bg-slate-900 rounded border border-slate-800 text-[10px]">
                            <div className="min-w-0">
                              <div className="font-bold text-white flex items-center gap-1 truncate text-[9px]">
                                <span>{r.icon}</span>
                                <span className="truncate">{r.name}</span>
                              </div>
                              <div className="text-[8px] text-slate-400 font-medium">{r.role}</div>
                            </div>

                            {hasSubmitted ? (
                              <span className="shrink-0 text-[8px] px-1.5 py-0.5 rounded-full bg-emerald-950 text-emerald-450 border border-emerald-900 font-bold flex items-center gap-0.5">
                                <span>✓</span> Sent
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleSimulateSingleRaterFeedback(simTargetEmpId, activeQuarterKey, r.id, rIdx)}
                                className="shrink-0 text-[8px] font-bold px-1.5 py-0.5 rounded bg-indigo-700 hover:bg-indigo-600 active:scale-95 text-indigo-100 transition-all font-sans cursor-pointer whitespace-nowrap"
                              >
                                ⚡ Send
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              <div className="space-y-1.5">
                <button
                  type="button"
                  onClick={() => handleSimulateFullFeedback(simTargetEmpId, activeQuarterKey)}
                  className="w-full py-1.5 px-2 text-[10px] font-bold rounded bg-emerald-600 hover:bg-emerald-700 text-white transition-all cursor-pointer text-left flex items-center justify-between"
                >
                  <span>🚀 Kirim 3 Raters (Lengkap)</span>
                  <span className="text-[9px] bg-emerald-850 text-emerald-100 rounded px-1 font-mono font-bold">LENGKAP</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleSimulatePartialFeedback(simTargetEmpId, activeQuarterKey)}
                  className="w-full py-1.5 px-2 text-[10px] font-bold rounded bg-blue-600 hover:bg-blue-700 text-white transition-all cursor-pointer text-left flex items-center justify-between"
                >
                  <span>⚡ Kirim 1 Rater (Parsial)</span>
                  <span className="text-[9px] bg-blue-800 text-blue-100 rounded px-1 font-mono font-bold">1 RATER</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleClearSimulatedFeedback(simTargetEmpId, activeQuarterKey)}
                  className="w-full py-1.5 px-2 text-[10px] font-medium rounded bg-slate-805 hover:bg-slate-700 text-slate-350 hover:text-white transition-all cursor-pointer text-left flex items-center justify-between border border-solid border-slate-700"
                >
                  <span>🗑️ Kosongkan Masukan 360°</span>
                  <span className="text-[9px] text-slate-400 font-bold">RESET</span>
                </button>
              </div>
            </div>

            {/* Part 3: Signoffs */}
            <div className="p-3 bg-slate-900 rounded-xl border border-slate-800/80 space-y-2 text-left border-solid">
              <span className="block text-[10px] font-black uppercase text-indigo-300">3. Status Persetujuan Penilaian</span>
              {(() => {
                const targetUserMap = reportApprovals[simTargetEmpId] || {};
                const targetQObj = targetUserMap[activeQuarterKey] || { spvApproved: false, hrdApproved: false };
                return (
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleToggleSimApproval(simTargetEmpId, activeQuarterKey, 'spv')}
                      className={`py-1.5 px-2 text-[10px] font-bold rounded transition-all cursor-pointer text-center ${
                        targetQObj.spvApproved
                          ? 'bg-emerald-900 border border-emerald-700 text-emerald-100 border-solid'
                          : 'bg-slate-800 hover:bg-slate-750 text-slate-300'
                      }`}
                    >
                      {targetQObj.spvApproved ? '✅ Approved SPV' : '✍️ Sign SPV'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleSimApproval(simTargetEmpId, activeQuarterKey, 'hrd')}
                      className={`py-1.5 px-2 text-[10px] font-bold rounded transition-all cursor-pointer text-center ${
                        targetQObj.hrdApproved
                          ? 'bg-emerald-900 border border-emerald-700 text-emerald-100 border-solid'
                          : 'bg-slate-800 hover:bg-slate-750 text-slate-300'
                      }`}
                    >
                      {targetQObj.hrdApproved ? '✅ Approved HRD' : '✍️ Sign HRD'}
                    </button>
                  </div>
                );
              })()}
            </div>

            {/* Part 4: Reset all */}
            <button
              type="button"
              onClick={handleResetSimulationState}
              className="w-full py-2 px-3 text-[10px] font-black bg-rose-950/40 hover:bg-rose-900/60 border border-rose-900 rounded-xl text-rose-200 transition-all cursor-pointer text-center border-solid"
            >
              🔄 Reset Ulang Seluruh Database
            </button>
          </motion.div>
        )}

        {/* Toggle Button */}
        <button
          type="button"
          onClick={() => setSimulationDrawerOpen(!simulationDrawerOpen)}
          className="bg-indigo-700 hover:bg-indigo-850 text-white py-2.5 px-4 rounded-full shadow-2xl flex items-center gap-2 font-bold text-[11px] transition-all cursor-pointer border border-indigo-505 border-solid"
        >
          <span>🛠️</span>
          <span>{simulationDrawerOpen ? 'Tutup Simulator' : 'Demo & Simulator Pad'}</span>
        </button>
      </div>
    </div>
  );
}
