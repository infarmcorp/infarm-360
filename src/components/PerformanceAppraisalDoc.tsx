import React, { useState, useMemo } from 'react';
import { motion } from 'motion/react';
import { User } from '../types';
import { ChevronLeft, Download, CheckCircle, ShieldAlert, FileText, Sparkles, AlertCircle, Save } from 'lucide-react';
import { ASPEK, ASPEK_SCORES, Q_QUANT, Q_QUAL } from '../data';
import { getAspectCodeForQuestion, cleanQuestionText, getQuestionMeta } from '../utils/questionHelper';

interface PADocProps {
  emp: User;
  qk: string;
  quarterLabel: string;
  has360: boolean;
  kpiScore: number;
  s360Score: number | null;
  finalScore: number | null;
  isSpvView: boolean;
  onClose: () => void;
  onFinalize?: (note: string) => void;
  onSaveDraft?: (note: string) => void;
  customQQuant?: string[];
  customQQual?: string[];
  compiledEvaluations?: Array<{ assessorName: string; q: Record<number, number>; t: Record<number, string>; qr?: Record<number, string> }>;
  anonymous?: boolean;
  isHrdAdmin?: boolean;
}

export const PerformanceAppraisalDoc: React.FC<PADocProps> = ({
  emp,
  qk,
  quarterLabel,
  has360,
  kpiScore,
  s360Score,
  finalScore,
  isSpvView,
  onClose,
  onFinalize,
  onSaveDraft,
  customQQuant,
  customQQual,
  compiledEvaluations,
  anonymous = true,
  isHrdAdmin = false,
}) => {
  const today = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
  const questionsQuant = customQQuant || Q_QUANT;
  const questionsQual = customQQual || Q_QUAL;

  const aspekIdxToCode: Record<number, 'A' | 'B' | 'C' | 'D' | 'E'> = {
    0: 'D', // Lapang Hati & Terbuka
    1: 'B', // Berusaha Semaksimal Mungkin
    2: 'C', // Selalu Menantang Diri
    3: 'A', // Jujur & Tanggung Jawab
    4: 'E'  // Selalu Bermawas Diri
  };

  const selfScore = useMemo(() => {
    if (!compiledEvaluations) return null;
    const selfEval = compiledEvaluations.find(ev => ev.assessorName.includes('(Evaluasi Diri)'));
    if (!selfEval) return null;
    const qVals = Object.values(selfEval.q) as number[];
    if (qVals.length === 0) return null;
    const score = (qVals.reduce((acc, curr) => Number(acc) + Number(curr), 0) / qVals.length) * 20;
    return Math.round(score * 10) / 10;
  }, [compiledEvaluations]);

  const getAspectRealScore = (code: 'A' | 'B' | 'C' | 'D' | 'E', fallbackVal: number): number => {
    if (!compiledEvaluations || compiledEvaluations.length === 0) return fallbackVal;
    
    // Find all indices of questions belonging to this aspect
    const indices: number[] = [];
    questionsQuant.forEach((q, idx) => {
      if (getAspectCodeForQuestion(q, idx) === code) {
        indices.push(idx);
      }
    });
    
    if (indices.length === 0) return 0;
    
    // Accumulate scores
    let totalScore = 0;
    let totalRatingsCount = 0;
    
    // Exclude self evaluation from Core 360 values
    compiledEvaluations.forEach(ev => {
      const isSelf = ev.assessorName.includes('(Evaluasi Diri)');
      if (isSelf) return; // exclude self!
      
      indices.forEach(idx => {
        const val = ev.q[idx];
        if (val !== undefined && val > 0) {
          totalScore += val;
          totalRatingsCount++;
        }
      });
    });
    
    if (totalRatingsCount === 0) return fallbackVal;
    const avg = totalScore / totalRatingsCount;
    return Math.round(avg * 20);
  };

  const storageKey = `infarm_pa_draft_${emp.id}_${qk}`;

  // Anonymization mapping for peer reviews (Requirement 10)
  const assessorNameMapping = React.useMemo(() => {
    const mapping: Record<string, string> = {};
    if (compiledEvaluations) {
      let peerCounter = 1;
      compiledEvaluations.forEach(ev => {
        if (ev.assessorName && !mapping[ev.assessorName]) {
          mapping[ev.assessorName] = `Rekan Kerja (Responden #${peerCounter++})`;
        }
      });
    }
    return mapping;
  }, [compiledEvaluations, anonymous]);

  // States for Sections 2 and 4 to allow HRD edits (Requirement 2)
  const [kepribadianPoinRow, setKepribadianPoinRow] = useState<string[]>(() => {
    const saved = localStorage.getItem(`${storageKey}_kepribadian`);
    if (saved) {
      try { return JSON.parse(saved); } catch(e) {}
    }
    return ASPEK.map(asp => `Menunjukkan sikap kerja luhur pada aspek ${asp} dalam penanganan tugas.`);
  });
  
  const [fokusPengembangan, setFokusPengembangan] = useState<string>(() => {
    const saved = localStorage.getItem(`${storageKey}_fokus`);
    if (saved) return saved;
    return finalScore && finalScore >= 90
      ? `Perkembangan sasarannya diarahkan untuk memperkuat keandalan delegasi operasional tim, bimbingan berkala bagi rekan yang memerlukan, serta merumuskan optimalisasi alur baru.`
      : `Fokus pada asahan komunikasi konstruktif, penguatan kualitas tindak lanjut solusi secara mendalam, serta perbaikan kedisiplinan estimasi tenggat waktu project.`;
  });

  const [aspectSummaries, setAspectSummaries] = useState<Record<string, string>>(() => {
    const saved = localStorage.getItem(`${storageKey}_summaries`);
    if (saved) {
      try { return JSON.parse(saved); } catch(e) {}
    }
    const defaults: Record<string, Record<string, string>> = {
      EMP001: {
        'Jujur & Tanggung Jawab': 'Sangat bertanggung jawab atas integritas pelaporan stock opname harian di gudang operasional. Menunjukkan transparansi tinggi jika terjadi penyimpangan selisih barang di lapangan.',
        'Berusaha Semaksimal Mungkin': 'Sangat berdedikasi tinggi, sering melampaui tenggat waktu jika dibutuhkan koordinasi darurat logistik lintas tim penyaluran.',
        'Selalu Menantang Diri': 'Aktif mencari tantangan baru dalam otomatisasi sistem inventaris fisik dan ingin mereplikasi standar terbaik dari modern supply chain.',
        'Lapang Hati & Terbuka': 'Menerima saran efisiensi proses muatan dari rekan penilai dengan dada lapang tanpa defensif, berfokus murni pada solusi tim.',
        'Selalu Bermawas Diri': 'Sadar secara periodik akan batasan kerja fisiknya, bersiap mengomunikasikan hambatan atau kelelahan secara asertif sebelum terjadi keterlambatan.'
      },
      EMP002: {
        'Jujur & Tanggung Jawab': 'Selalu mengedepankan keterbukaan data kualititas pupuk dan benih di kebun, tidak ragu melaporkan barang cacat kirim sejak dini.',
        'Berusaha Semaksimal Mungkin': 'Gigih menyelesaikan target pemeliharaan harian, bahkan di tengah padatnya rotasi jadwal piket kebun basah.',
        'Selalu Menantang Diri': 'Terus berusaha mencoba menguasai teknik pemetaan lahan berbasis satelit meskipun di luar latar belakang kompetensi utamanya.',
        'Lapang Hati & Terbuka': 'Sangat tenang berdiskusi saat rekan kerja memberikan feedback bahwa ia kurang tegas terhadap vendor penyedia alat pertanian.',
        'Selalu Bermawas Diri': 'Secara konstan mengevaluasi proses kerja mandiri berulangnya demi meminimalkan eror input laporan bulanan.'
      },
      EMP003: {
        'Jujur & Tanggung Jawab': 'Melaksanakan program campaign marketing dengan jujur dan bertanggung jawab penuh atas pencapaian lead harian.',
        'Berusaha Semaksimal Mungkin': 'Selalu mencurahkan tenaga ekstra untuk merancang visual promotion yang estetik dan memikat calon mitra Infarm.',
        'Selalu Menantang Diri': 'Berani bereksperimen dengan model konten video vertikal kekinian yang menantang algoritma platform baru.',
        'Lapang Hati & Terbuka': 'Sangat terbuka terhadap kritik pedas dari tim desain dan mampu menangkap esensinya untuk perbaikan konsep kreatif berikutnya.',
        'Selalu Bermawas Diri': 'Sering melakukan refleksi diri agar ritme pembuatan konten tetap konsisten tanpa mengorbankan kualitas kesehatan fisik.'
      },
      EMP004: {
        'Jujur & Tanggung Jawab': 'Benar-benar akurat dalam memperhitungkan biaya pengiklanan, memegang tinggi nilai integritas keuangan pemasaran.',
        'Berusaha Semaksimal Mungkin': 'Bekerja keras mengoptimasi bid iklan digital Infarm pagi dan malam untuk menekan cost-per-click se-efisien mungkin.',
        'Selalu Menantang Diri': 'Meredesain struktur funnel iklan dari awal demi mengejar efisiensi KPI yang ditetapkan manajemen kuartal ini.',
        'Lapang Hati & Terbuka': 'Mengapresiasi masukan dari tim lapangan operasional dan segera merevisi materi promosi agar tidak menimbulkan salah paham konsumen.',
        'Selalu Bermawas Diri': 'Berkomitmen mengasah kemandirian dalam analisis data data analitik lanjutan pasca evaluasi pertengahan kuartal bersama atasan.'
      },
      EMP005: {
        'Jujur & Tanggung Jawab': 'Sangat teliti dalam pembukuan keuangan bulanan, memegang prinsip integritas penuh bebas dari kekeliruan pelaporan.',
        'Berusaha Semaksimal Mungkin': 'Mengorbankan waktu ekstra di masa closing audit kuartalan agar neraca konsolidasi Infarm kelar tanpa cacat.',
        'Selalu Menantang Diri': 'Secara mandiri menginisiasi migrasi formula spreadsheet lama ke model data keuangan interaktif guna meningkatkan performa analisis.',
        'Lapang Hati & Terbuka': 'Sangat terbuka berdiskusi dengan sesama bagian operasional perihal efisiensi alur reimburse dana taktis lapangan.',
        'Selalu Bermawas Diri': 'Senantiasa meluangkan waktu bermawas diri guna mengimbangi ketepatan komputasi data finansial dengan kesabaran koordinasi rutin.'
      }
    };

    const employeeId = emp.id;
    const userDefaults = defaults[employeeId] || {
      'Jujur & Tanggung Jawab': 'Memiliki integritas kerja yang kuat, objektif menyampaikan realita operasional yang terjadi dan tuntas mengawal mandat tugas.',
      'Berusaha Semaksimal Mungkin': 'Menampilkan inisiatif tinggi serta dedikasi di luar standar minimal guna membantu rekan-rekan menyelesaikan target divisi.',
      'Selalu Menantang Diri': 'Menginginkan perbaikan proses kerja berkelanjutan dan berani memelopori pendekatan baru yang lebih efisien.',
      'Lapang Hati & Terbuka': 'Menerima tanggapan dari tim pengkaji dengan kepala dingin, mencari pilar solutif alih-alih alasan defensif.',
      'Selalu Bermawas Diri': 'Fokus menilai kelemahan sistematis diri, mengantisipasi celah miss-com serta giat meng-upgrade kecakapan pribadi.'
    };

    return userDefaults;
  });

  const getCatLabel = (val: number | null) => {
    if (val === null) return 'N/A';
    if (val >= 90) return 'Melampaui Ekspektasi';
    if (val >= 80) return 'Memenuhi Ekspektasi';
    if (val >= 70) return 'Perlu Peningkatan';
    return 'Di Bawah Ekspektasi';
  };

  const getCatBadgeClass = (val: number | null) => {
    if (val === null) return 'bg-gray-100 text-gray-700 border border-gray-200';
    if (val >= 90) return 'bg-emerald-100 text-emerald-800 border border-emerald-200';
    if (val >= 80) return 'bg-blue-100 text-blue-800 border border-blue-200';
    if (val >= 70) return 'bg-amber-100 text-amber-850 border border-amber-200';
    return 'bg-rose-100 text-rose-800 border border-rose-200';
  };

  const handleDownloadPDFSim = () => {
    alert(`Mensimulasikan unduh PDF Laporan Kinerja ${emp.name} - ${quarterLabel}`);
  };

  const handleSaveDraft = () => {
    localStorage.setItem(`${storageKey}_kepribadian`, JSON.stringify(kepribadianPoinRow));
    localStorage.setItem(`${storageKey}_fokus`, fokusPengembangan);
    localStorage.setItem(`${storageKey}_summaries`, JSON.stringify(aspectSummaries));
    if (onSaveDraft) {
      onSaveDraft(`Draf evaluasi kinerja untuk ${emp.name} (${quarterLabel}) berhasil disimpan!`);
    }
  };

  const handleFinalSubmit = () => {
    // Save draft auto before finalizing
    localStorage.setItem(`${storageKey}_kepribadian`, JSON.stringify(kepribadianPoinRow));
    localStorage.setItem(`${storageKey}_fokus`, fokusPengembangan);
    localStorage.setItem(`${storageKey}_summaries`, JSON.stringify(aspectSummaries));
    if (onFinalize) {
      onFinalize(`Laporan ${emp.name} difinalisasi dengan rekomendasi IDP & review atasan.`);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -15 }}
      className="space-y-4 max-w-4xl mx-auto"
    >
      {/* Top action header controller */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-gray-200 shadow-xs">
        <button
          onClick={onClose}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-gray-700 bg-gray-50 hover:bg-gray-100 border border-gray-200 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          <span>Kembali ke Review</span>
        </button>

        <div className="flex items-center gap-2 w-full sm:w-auto sm:justify-end">
          <button
            onClick={handleDownloadPDFSim}
            className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-gray-700 border border-gray-200 hover:bg-gray-50 transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Unduh PDF</span>
          </button>
          {!isSpvView && (
            <button
              onClick={handleSaveDraft}
              className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold text-gray-700 bg-gray-100 border border-gray-300 hover:bg-gray-250 transition-colors cursor-pointer"
            >
              <Save className="w-3.5 h-3.5 text-gray-650" />
              <span>Simpan Draft</span>
            </button>
          )}
          {!isSpvView && onFinalize && (
            <button
              onClick={handleFinalSubmit}
              className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold text-white bg-emerald-700 border border-emerald-700 hover:bg-emerald-800 transition-colors cursor-pointer"
            >
              <CheckCircle className="w-3.5 h-3.5" />
              <span>Finalisasi Hasil</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Document Content Area */}
      <div className="bg-white border border-gray-200 shadow-sm rounded-2xl overflow-hidden font-sans">
        {/* Document Header Panel */}
        <div className="bg-[#024635] text-white px-6 py-7 text-center relative overflow-hidden">
          {/* Star sparkles illustration on the upper right corner */}
          <div className="absolute top-4 right-4 text-[#3acfa7] opacity-25">
            <svg className="w-24 h-24 stroke-1.5" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M50 10 C53 40, 60 47, 90 50 C60 53, 53 60, 50 90 C47 60, 40 53, 10 50 C40 47, 47 40, 50 10 Z" fill="currentColor"/>
              <path d="M82 20 H88 M85 17 V23" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              <circle cx="21" cy="65" r="3.5" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </div>
          <div className="text-[11px] font-bold tracking-[0.2em] text-[#34d399] uppercase mb-1">
            LAPORAN PERFORMANCE APPRAISAL (PA) RESMI
          </div>
          <h2 className="text-xl font-bold tracking-tight">KUARTAL {quarterLabel} — PT INFARM INDONESIA</h2>
          <div className="mt-3 inline-flex items-center gap-1.5 bg-[#013528] px-4 py-1.5 rounded-full text-[10px] tracking-wide border border-[#045944]">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
            <span className="font-semibold text-gray-200">KONFIDENSIAL — Terbatas untuk Pegawai & Pihak Berkepentingan</span>
          </div>
        </div>

        {/* Executive Meta Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 border-b border-gray-200">
          {/* Metadata */}
          <div className="p-6 sm:p-8 space-y-4 border-r border-gray-200">
            <div className="space-y-1">
              <span className="text-[10px] font-bold tracking-wider text-gray-400 uppercase">IDENTITAS PEGAWAI</span>
              <h3 className="text-2xl font-bold text-slate-900 tracking-tight">{emp.name}</h3>
              <p className="text-xs text-gray-500 font-medium">Employee ID: <span className="font-semibold text-gray-700">{emp.id}</span></p>
            </div>

            <div className="grid grid-cols-2 gap-y-4 gap-x-4 pt-4 border-t border-gray-100">
              <div>
                <label className="block text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-0.5">DEPARTEMEN</label>
                <span className="text-sm font-bold text-gray-700">{emp.dept}</span>
              </div>
              <div>
                <label className="block text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-0.5">PERIODE PENILAIAN</label>
                <span className="text-sm font-bold text-gray-700">{quarterLabel}</span>
              </div>
              <div>
                <label className="block text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-0.5">METODE EVALUASI</label>
                <span className="text-xs font-bold text-[#024635] leading-normal block">{has360 ? 'KPI Bulanan (50%) & 360° (50%)' : 'Rataan KPI Bulanan (100%)'}</span>
              </div>
              <div>
                <label className="block text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-0.5">TANGGAL LAPORAN</label>
                <span className="text-sm font-bold text-gray-700">{today}</span>
              </div>
            </div>
          </div>

          {/* Scores Overview Summary Box */}
          <div className="p-6 sm:p-8 bg-gray-50/50 flex flex-col justify-between">
            <div className="space-y-1">
              <span className="text-[10px] font-bold tracking-wider text-gray-400 uppercase">RINGKASAN SKOR AKHIR</span>
            </div>

            <div className="flex gap-4 items-stretch mt-3">
              {/* Box core Final Score */}
              <div className="flex-1 bg-[#024635] text-white rounded-2xl p-5 text-center flex flex-col items-center justify-center shadow-xs">
                <span className="text-[10px] font-bold text-[#a2ebd8] tracking-widest uppercase">FINAL SCORE</span>
                <span className="text-5xl font-black tracking-tight mt-1.5 mb-2 font-mono">
                  {finalScore !== null ? finalScore.toFixed(1) : '—'}
                </span>
                <span className="text-[9px] px-3 py-1 rounded-full font-extrabold bg-white text-[#024635] text-center shrink-0 w-full truncate">
                  {getCatLabel(finalScore)}
                </span>
              </div>

              {/* Box breakdowns */}
              <div className="flex-1 flex flex-col gap-3 justify-center">
                <div className="bg-white border border-gray-200 rounded-xl p-3 shadow-3xs">
                  <span className="block text-[9px] text-gray-400 font-bold uppercase tracking-wider">KOMPONEN KPI ({has360 ? '50' : '100'}%)</span>
                  <span className="text-xl font-black text-gray-805 font-mono mt-0.5 block leading-none">{kpiScore.toFixed(1)}</span>
                  <span className="text-[10px] text-emerald-700 font-bold font-sans mt-1 block">{getCatLabel(kpiScore)}</span>
                </div>
                <div className="bg-white border border-gray-200 rounded-xl p-3 shadow-3xs">
                  <span className="block text-[9px] text-gray-400 font-bold uppercase tracking-wider">KOMPONEN 360° ({has360 ? '50' : '0'}%)</span>
                  <span className="text-xl font-black text-gray-805 font-mono mt-0.5 block leading-none">
                    {has360 && s360Score !== null ? s360Score.toFixed(1) : 'N/A'}
                  </span>
                  <span className="text-[10px] text-indigo-700 font-bold font-sans mt-1 block">
                    {has360 && s360Score !== null ? getCatLabel(s360Score) : 'Tidak ada sesi 360°'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* SECTION 1: SKOR DETAIL */}
        <div className="border-b border-gray-200">
          <div className="bg-[#e6f4f1] border-l-4 border-[#015f43] px-5 py-3 font-semibold text-xs text-[#015f43] uppercase tracking-wider">
            1. REKAPITULASI MATRIKS PENILAIAN
          </div>
          <div className="p-4 sm:p-6 space-y-4">
            <div className="flex justify-between items-center text-xs pb-3 border-b border-gray-100">
              <span className="text-gray-650 font-semibold text-sm">Skor Rata-rata Kinerja Bulanan (KPI KPI)</span>
              <div className="flex items-center gap-3">
                <strong className="text-[#015f43] font-mono text-base font-black">{kpiScore.toFixed(1)}</strong>
                <span className={`text-[10px] px-2.5 py-1 rounded-full font-extrabold ${getCatBadgeClass(kpiScore)}`}>
                  {getCatLabel(kpiScore)}
                </span>
              </div>
            </div>

            <div className="flex justify-between items-center text-xs pb-3 border-b border-gray-100">
              <span className="text-gray-650 font-semibold text-sm">Skor 360° Budaya & Perilaku Kelompok (Peer + Leader Review)</span>
              <div className="flex items-center gap-3">
                <strong className="text-gray-850 font-mono text-base font-black">{has360 && s360Score !== null ? s360Score.toFixed(1) : 'N/A'}</strong>
                {has360 && s360Score !== null && (
                  <span className={`text-[10px] px-2.5 py-1 rounded-full font-extrabold ${getCatBadgeClass(s360Score)}`}>
                    {getCatLabel(s360Score)}
                  </span>
                )}
              </div>
            </div>

            {has360 && (
              <div className="flex justify-between items-center text-xs pb-3 border-b border-gray-100 bg-sky-50/20 px-3 py-2.5 rounded-xl border border-sky-100/50">
                <div>
                  <span className="text-sky-950 font-bold block">Skor Penilaian Mandiri (Self-Assessment)</span>
                  <span className="text-[10px] text-sky-700 font-semibold block mt-0.5">Nilai mandiri berdiri sendiri sebagai pembanding &amp; tidak memengaruhi nilai akhir.</span>
                </div>
                <div className="flex items-center gap-3">
                  <strong className="text-sky-900 font-mono text-base font-black">
                    {selfScore !== null ? selfScore.toFixed(1) : 'Belum Diisi'}
                  </strong>
                  {selfScore !== null && (
                    <span className={`text-[10px] px-2.5 py-1 rounded-full font-extrabold bg-sky-100 text-sky-850 border border-sky-205`}>
                      {getCatLabel(selfScore)}
                    </span>
                  )}
                </div>
              </div>
            )}

            <div className="bg-gray-50 border border-gray-200/60 p-4 rounded-2xl text-xs flex flex-col gap-2 mt-4 shadow-3xs">
              <div>
                <span className="font-bold text-gray-500 uppercase tracking-wider text-[10px]">Formula Penghitungan Nilai Akhir:</span>
              </div>
              <div className="font-mono text-xs text-[#015f43] bg-white px-3 py-2.5 rounded-xl border border-gray-200/80 shadow-3xs w-full">
                {has360 && s360Score !== null
                  ? `( ${kpiScore.toFixed(1)} × 50% ) + ( ${s360Score.toFixed(1)} × 50% ) = ${finalScore?.toFixed(1) || '—'}`
                  : `Rata-rata KPI ${kpiScore.toFixed(1)} (100% karena tidak ada komponen penilaian 360°)`}
              </div>
            </div>

            {/* Scale Legends */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3">
              {[
                { r: '<70', label: 'Di Bawah Ekspektasi', c: 'border-rose-200 text-rose-700 bg-rose-50/40' },
                { r: '70–79', label: 'Perlu Peningkatan', c: 'border-amber-200 text-amber-805 bg-amber-50/40' },
                { r: '80–89', label: 'Memenuhi Ekspektasi', c: 'border-blue-200 text-blue-700 bg-blue-50/40' },
                { r: '≥90', label: 'Melampaui Ekspektasi', c: 'border-emerald-250 text-emerald-900 bg-emerald-50/30' },
              ].map((sc, i) => (
                <div key={i} className={`border rounded-xl p-3 text-center ${sc.c} shadow-3xs`}>
                  <div className="font-mono font-black text-sm">{sc.r}</div>
                  <div className="text-[9px] font-bold tracking-tight mt-1 leading-tight uppercase">{sc.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* SECTION 2: RINGKASAN UMUM */}
        <div className="border-b border-gray-200">
          <div className="bg-[#e6f4f1] border-l-4 border-[#015f43] px-5 py-3 font-semibold text-xs text-[#015f43] uppercase tracking-wider">
            2. RINGKASAN UMUM HARIAN & REKAN KERJA
          </div>
          <div className="p-4 sm:p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <span className="block text-[11px] font-bold text-[#015f43] uppercase tracking-wider mb-3">KEKUATAN KUNCI YANG DIAKUI REKAN</span>
              <div className="space-y-2.5">
                {isSpvView ? (
                  kepribadianPoinRow.map((point, idx) => (
                    <div key={idx} className="flex gap-3 items-center text-xs text-gray-700 bg-white border border-gray-200 px-3.5 py-3 rounded-xl shadow-3xs">
                      <span className="text-emerald-700 font-extrabold text-base shrink-0">✓</span>
                      <span className="font-medium leading-relaxed">{point}</span>
                    </div>
                  ))
                ) : (
                  <div className="space-y-2.5">
                    {kepribadianPoinRow.map((point, idx) => (
                      <div key={idx} className="flex items-center gap-3 bg-white border border-gray-200 px-3 py-1 rounded-xl shadow-3xs">
                        <span className="text-emerald-700 font-extrabold text-base shrink-0 pl-1.5">✓</span>
                        <input
                          type="text"
                          value={point}
                          onChange={(e) => {
                            const updated = [...kepribadianPoinRow];
                            updated[idx] = e.target.value;
                            setKepribadianPoinRow(updated);
                          }}
                          className="flex-1 text-xs py-2 bg-transparent text-gray-700 font-medium leading-relaxed focus:outline-none"
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="bg-[#fefce8] border border-amber-200/80 p-5 rounded-2xl flex items-start gap-3.5 shadow-2xs">
              <span className="text-xl leading-none select-none mt-0.5">💡</span>
              <div className="flex-1 space-y-1.5">
                <span className="font-bold text-xs text-amber-950 block tracking-tight uppercase">Fokus Pengembangan Utama Kuartal Depan</span>
                {isSpvView ? (
                  <p className="text-xs leading-relaxed text-amber-900 font-semibold">
                    {fokusPengembangan}
                  </p>
                ) : (
                  <textarea
                    value={fokusPengembangan}
                    onChange={(e) => setFokusPengembangan(e.target.value)}
                    className="w-full text-xs p-3 border border-amber-200 rounded-xl bg-white text-amber-950 font-medium leading-relaxed shadow-3xs focus:outline-none focus:ring-1 focus:ring-amber-500"
                    rows={5}
                  />
                )}
              </div>
            </div>
          </div>
        </div>

        {/* SECTION 3: SKOR PER ASPEK BUDAYA */}
        {has360 && s360Score !== null && (
          <div className="border-b border-gray-200">
            <div className="bg-[#e6f4f1] border-l-4 border-[#015f43] px-5 py-3 font-semibold text-xs text-[#015f43] uppercase tracking-wider">
              3. MATRIKS DETAIL BUDAYA 360° (SKALA 0–100)
            </div>
            <div className="p-4 sm:p-6 space-y-4">
              {ASPEK.map((asp, idx) => {
                const code = aspekIdxToCode[idx] || 'A';
                const sc = getAspectRealScore(code, ASPEK_SCORES[idx]);
                const activeBarColor = sc >= 90 ? 'bg-[#015f43]' : sc >= 80 ? 'bg-[#0d9488]' : sc >= 70 ? 'bg-[#f59e0b]' : 'bg-[#e11d48]';
                return (
                  <div key={idx} className="space-y-1.5">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-bold text-gray-700 flex items-center gap-1.5">⭐ <span className="text-slate-800">{asp}</span></span>
                      <div className="flex items-center gap-3">
                        <span className="font-mono font-black text-gray-950 text-[13px]">{sc} / 100</span>
                        <span className={`text-[9px] px-2.5 py-0.5 rounded-full font-extrabold ${getCatBadgeClass(sc)}`}>
                          {getCatLabel(sc)}
                        </span>
                      </div>
                    </div>
                    <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden shadow-inner">
                      <div
                        style={{ width: `${sc}%` }}
                        className={`h-full rounded-full transition-all duration-500 ${activeBarColor}`}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}



        {/* SECTION 4: EVALUASI ASPEK BUDAYA & PERILAKU 360° */}
        {has360 ? (
          <div className="border-b border-gray-200">
            <div className="bg-[#e6f4f1] border-l-4 border-[#015f43] px-5 py-3 font-semibold text-xs text-[#015f43] uppercase tracking-wider">
              4. EVALUASI ASPEK BUDAYA & PERILAKU 360°
            </div>
            <div className="p-4 sm:p-6 space-y-5 text-xs leading-relaxed">
              <div className="bg-[#f0fdf4] border border-emerald-100 p-4 rounded-xl text-xs text-emerald-950 font-semibold leading-relaxed shadow-3xs flex gap-2.5 items-start">
                <Sparkles className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                <span>Berikut adalah rangkuman evaluasi 360° pelaku budaya perusahaan dari seluruh komentar penilai. Pihak manajemen melakukan kalibrasi atas aspek ini secara adil dan transparan.</span>
              </div>

              <div className="space-y-5">
                {[
                  'Jujur & Tanggung Jawab',
                  'Berusaha Semaksimal Mungkin',
                  'Selalu Menantang Diri',
                  'Lapang Hati & Terbuka',
                  'Selalu Bermawas Diri'
                ].map((aspectName) => {
                  const val = aspectSummaries[aspectName] || '';
                  return (
                    <div key={aspectName} className="space-y-2">
                      <div className="border border-emerald-600 bg-white rounded-lg px-3 py-2 flex items-center gap-2 shadow-3xs">
                        <span className="text-[#015f43] font-extrabold">★</span>
                        <span className="text-xs font-bold text-[#015f43]">{aspectName}</span>
                      </div>
                      <div className="bg-gray-50/40 border border-gray-200 rounded-xl p-3.5 shadow-3xs">
                        {isSpvView ? (
                          <p className="text-xs text-gray-750 leading-relaxed font-semibold">{val}</p>
                        ) : (
                          <textarea
                            value={val}
                            onChange={(e) => {
                              setAspectSummaries({
                                ...aspectSummaries,
                                [aspectName]: e.target.value
                              });
                            }}
                            className="w-full text-xs p-1 bg-transparent text-gray-700 font-medium leading-relaxed focus:outline-none"
                            rows={3}
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
          <div className="border-b border-gray-200 p-6">
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-900 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0" />
              <div>
                <strong className="block font-semibold mb-1">Hanya Penilaian Komponen KPI</strong>
                <span>Aspek evaluasi kelompok 360° tidak diaktifkan pada periode kuartal ini. Evaluasi final berfokus penuh terhadap output target kinerja yang dirangkum fungsional.</span>
              </div>
            </div>
          </div>
        )}

        {/* SECTION 5: DOKUMEN KOMENTAR RAW & RINCIAN INPUT (KHUSUS HRD ADMIN) */}
        {isHrdAdmin && (
          <div className="border-b border-gray-200 bg-slate-50/50">
            <div className="bg-slate-800 px-5 py-3.5 font-semibold text-xs text-white uppercase tracking-wider flex items-center gap-2">
              <span className="text-sm">📋</span>
              <span>5. RINCIAN KOMENTAR MURNI (RAW FEEDBACK) PER ASPEK & INDIKATOR</span>
              <span className="ml-auto text-[9px] bg-indigo-600 px-2 py-0.5 rounded text-indigo-50 font-extrabold tracking-wide">HRD VIEW</span>
            </div>
            
            <div className="p-4 sm:p-6 space-y-6">
              {!has360 ? (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-900 flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0" />
                  <div>
                    <strong className="block font-semibold mb-1">Evaluasi 360° Nonaktif</strong>
                    <span>Siklus kuartal ini dikonfigurasi tanpa 360° (100% KPI murni), sehingga tidak ada rincian umpan balik/komentar murni dari penilai.</span>
                  </div>
                </div>
              ) : !compiledEvaluations || compiledEvaluations.length === 0 ? (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-xs text-blue-900 flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0" />
                  <div>
                    <strong className="block font-semibold mb-1">Belum Ada Masukan Evaluasi</strong>
                    <span>Siklus kuartal ini mengaktifkan 360°, namun belum ada rekan kerja (raters) yang mengisi atau mengirimkan form evaluasi untuk pegawai ini.</span>
                  </div>
                </div>
              ) : (
                <>
                  <span className="block text-[10px] text-gray-500 font-bold uppercase tracking-wider animate-pulse">
                    Umpan Balik Murni (Raw Text) dari Raters berdasarkan Aspek Budaya &amp; Indikator:
                  </span>

                  <div className="space-y-6">
                    {(() => {
                      const dynamicAspectGroups = [
                        { name: 'Jujur & Tanggung Jawab', indices: [] as number[] },
                        { name: 'Berusaha Semaksimal Mungkin', indices: [] as number[] },
                        { name: 'Selalu Menantang Diri', indices: [] as number[] },
                        { name: 'Lapang Hati & Terbuka', indices: [] as number[] },
                        { name: 'Selalu Bermawas Diri', indices: [] as number[] }
                      ];
                      
                      questionsQuant.forEach((q, idx) => {
                        const code = getAspectCodeForQuestion(q, idx);
                        if (code === 'A') dynamicAspectGroups[0].indices.push(idx);
                        else if (code === 'B') dynamicAspectGroups[1].indices.push(idx);
                        else if (code === 'C') dynamicAspectGroups[2].indices.push(idx);
                        else if (code === 'D') dynamicAspectGroups[3].indices.push(idx);
                        else dynamicAspectGroups[4].indices.push(idx);
                      });

                      return dynamicAspectGroups.map((aspectGroup) => {
                      return (
                        <div key={aspectGroup.name} className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
                          {/* Aspect Subheader */}
                          <div className="bg-slate-100 px-4 py-2.5 border-b border-slate-200 flex items-center justify-between">
                            <span className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                              <span className="text-indigo-600">★</span> {aspectGroup.name}
                            </span>
                            <span className="text-[9px] text-slate-500 font-bold uppercase">
                              {aspectGroup.indices.length} Indikator
                            </span>
                          </div>

                          <div className="divide-y divide-slate-100">
                            {aspectGroup.indices.map((qIdx) => {
                              const qText = questionsQuant[qIdx] || `Indikator #${qIdx + 1}`;
                              
                              // Collect all feedback from compiledEvaluations for this indicator
                              const responses = compiledEvaluations
                                .map(ev => ev.qr?.[qIdx])
                                .filter((reason): reason is string => !!reason && reason.trim().length > 0);

                              return (
                                <div key={qIdx} className="p-4 space-y-2">
                                  {/* Indicator Title & aspect */}
                                  <div className="space-y-0.5">
                                    <span className="text-[11px] font-bold text-slate-800 block">
                                      Pertanyaan #{qIdx + 1} ({aspectGroup.name})
                                    </span>
                                    <p className="text-[10px] text-gray-450 italic leading-relaxed">
                                      &ldquo;{qText}&rdquo;
                                    </p>
                                  </div>

                                  {/* Responses List */}
                                  {responses.length > 0 ? (
                                    <ul className="list-disc pl-5 mt-1 space-y-1 text-[11px] text-gray-700 font-sans">
                                      {responses.map((reason, rIdx) => (
                                        <li key={rIdx} className="leading-relaxed italic">
                                          &ldquo;{reason}&rdquo;
                                        </li>
                                      ))}
                                    </ul>
                                  ) : (
                                    <span className="text-[10px] text-slate-400 pl-5 italic block">
                                      - Belum ada komentar tertulis untuk indikator ini.
                                    </span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    });
                  })()}
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Footer info brand */}
        <div className="bg-gray-100 border-t border-gray-200 px-6 py-3.5 text-center text-[10px] text-gray-400 font-semibold flex flex-col sm:flex-row items-center justify-between gap-1.5">
          <span>INFARM 360° PERFORMANCE EVALUATION SUITE</span>
          <span>SISTEM GENERATING OTOMATIS &copy; 2026 PT INFARM INDONESIA</span>
        </div>
      </div>
    </motion.div>
  );
};
export default PerformanceAppraisalDoc;
