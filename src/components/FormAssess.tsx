// @ts-nocheck — TODO(migrasi): komponen UI legacy AI Studio; tipekan saat dimigrasi.
import React, { useState, useMemo } from 'react';
import { motion } from 'motion/react';
import { User } from '../types';
import { Q_QUANT, Q_QUAL } from '../data';
import { Send, Sparkles, XCircle, ChevronLeft, Save, ClipboardList, CheckCircle2, X } from 'lucide-react';
import { getAspectCodeForQuestion, cleanQuestionText, getQuestionMeta } from '../utils/questionHelper';

interface FormAssessProps {
  target: { id: string; name: string; dept: string };
  onCancel: () => void;
  onSubmit: (answers: { q: Record<number, number>; t: Record<number, string>; qr?: Record<number, string> }, isDraft?: boolean) => void;
  customQQuant?: string[];
  customQQual?: string[];
  initialAnswers?: { q: Record<number, number>; t: Record<number, string>; qr?: Record<number, string> } | null;
}

const ASPECTS_METADATA = [
  { code: 'A', name: 'A. Jujur & Tanggung Jawab' },
  { code: 'B', name: 'B. Semaksimal Mungkin' },
  { code: 'C', name: 'C. Menantang Diri' },
  { code: 'D', name: 'D. Lapang Hati' },
  { code: 'E', name: 'E. Bermawas Diri' }
];


const QUESTION_DETAILS: Record<number, { title: string; desc: string }> = {
  0: { title: 'Pegang Komitmen', desc: 'Menyelesaikan pekerjaan sesuai waktu yang sudah disepakati. Dapat diandalkan untuk deliver janji dengan konsisten.' },
  1: { title: 'Transparansi', desc: 'Menyampaikan informasi apa adanya, baik kabar baik maupun hambatan, tanpa menutupi kesalahan.' },
  2: { title: 'Akui Kesalahan & Evaluasi', desc: 'Mengakui kekeliruan secara sportif dan berinisiatif mencari solusi serta belajar agar tidak mengulangi kesalahan.' },
  3: { title: 'Totalitas & Kerja Keras', desc: 'Memberikan usaha terbaik melebihi standar minimum dalam menyelesaikan setiap tanggung jawab.' },
  4: { title: 'Kualitas Hasil Kerja', desc: 'Memastikan output pekerjaan rapi, akurat, minim kesalahan, dan sesuai standar mutu perusahaan.' },
  5: { title: 'Inisiatif Tinggi', desc: 'Aktif mencari solusi tanpa menunggu diperintah, membantu meningkatkan efisiensi tim.' },
  6: { title: 'Belajar & Berkembang', desc: 'Terus meningkatkan keahlian, mempelajari hal baru, dan bersemangat menghadapi tugas yang lebih menantang.' },
  7: { title: 'Adaptasi Perubahan', desc: 'Cepat menyesuaikan diri dengan metode kerja baru, restrukturisasi, atau target yang berubah.' },
  8: { title: 'Kerjasama Tim', desc: 'Berkomunikasi secara kondusif, menghargai perbedaan pendapat, dan aktif berkontribusi demi tujuan bersama.' },
  9: { title: 'Umpan Balik Positif', desc: 'Menerima kritik dengan kepala dingin dan menjadikannya bahan evaluasi diri secara konstruktif.' },
  10: { title: 'Profesionalisme & Etika', desc: 'Menjaga perilaku terpuji, sopan santun, mematuhi peraturan kerja, serta menjaga reputasi perusahaan.' },
  11: { title: 'Manajemen Waktu', desc: 'Disiplin jam kerja, handal menentukan prioritas tugas, dan mampu mengelola stres secara dewasa.' }
};

const QUESTION_RATINGS_GUIDE: Record<number, { val: number; label: string; desc: string; eg: string }[]> = {
  0: [
    { val: 5, label: 'Selalu', desc: 'Menyelesaikan pekerjaan tepat waktu/lebih awal, handal 100%.', eg: 'Selesai tepat waktu tanpa perlu diingatkan.' },
    { val: 4, label: 'Sering', desc: '80%+ tugas selesai tepat waktu, jarang butuh diingatkan.', eg: 'Hanya sesekali terlambat karena kendala tak terduga.' },
    { val: 3, label: 'Kadang', desc: 'Pekerjaan selesai tepat waktu tapi perlu beberapa reminder.', eg: 'Kadang on-time, beberapa kali butuh kelonggaran waktu.' },
    { val: 2, label: 'Jarang', desc: 'Banyak pekerjaan terlambat, sering perlu dikejar-kejar.', eg: 'Sering melewati deadline yang sudah disepakati.' },
    { val: 1, label: 'Hampir Tidak Pernah', desc: 'Hampir semua pekerjaan terlambat, perlu diingatkan harian.', eg: 'Selalu mengulur-ulur tugas sehingga merusak timeline.' }
  ],
  1: [
    { val: 5, label: 'Selalu', desc: 'Sangat terbuka menyampaikan kendala/kesalahan sejak awal.', eg: 'Segera melapor ketika ada kesalahan input agar cepat dikoreksi.' },
    { val: 4, label: 'Sering', desc: 'Terbuka menyampaikan kendala saat ditanya atau koordinasi.', eg: 'Melaporkan masalah ketika progres terhambat.' },
    { val: 3, label: 'Kadang', desc: 'Kadang ragu terbuka, menyampaikan masalah jika sudah besar.', eg: 'Baru terbuka saat sistem mengalami error serius.' },
    { val: 2, label: 'Jarang', desc: 'Cenderung menyimpan masalah kecil karena takut ditegur.', eg: 'Menunda laporan keterlambatan pengiriman hingga ditanya.' },
    { val: 1, label: 'Hampir Tidak Pernah', desc: 'Menyembunyikan kesalahan sengaja untuk perlindungan diri.', eg: 'Menutupi komplain pelanggan agar tidak ketahuan atasan.' }
  ],
  2: [
    { val: 5, label: 'Selalu', desc: 'Mengakui kesalahan secara sportif dan aktif mencari solusi.', eg: 'Mengaku salah input data, lalu merevisinya dengan cepat.' },
    { val: 4, label: 'Sering', desc: 'Mau mengakui kesalahan jika ditegur dan bersedia belajar.', eg: 'Mengaku salah hitung stock, lalu ikut stock opname ulang.' },
    { val: 3, label: 'Kadang', desc: 'Mengaku setelah ada bukti kuat namun butuh didekati dahulu.', eg: 'Mengaku bersalah tapi bingung mencari solusinya.' },
    { val: 2, label: 'Jarang', desc: 'Cenderung membela diri atau mencari kambing hitam luar.', eg: 'Menyalahkan koneksi internet lambat saat telat kirim laporan.' },
    { val: 1, label: 'Hampir Tidak Pernah', desc: 'Sangat defensif, menyalahkan sistem atau orang lain keras.', eg: 'Menunjuk rekan kerja lain atas kesalahannya sendiri.' }
  ],
  3: [
    { val: 5, label: 'Selalu', desc: 'Dedicated, menyelesaikan tugas melampaui ekspektasi kerja.', eg: 'Menyusun laporan detail berikut analisis mendalam sukarela.' },
    { val: 4, label: 'Sering', desc: 'Bekerja penuh semangat dan menjaga standar kerapian yang baik.', eg: 'Proaktif merapikan area kerja tim setelah pameran selesai.' },
    { val: 3, label: 'Kadang', desc: 'Bekerja pas sesuai job description tanpa mau berlebih.', eg: 'Selesai bertugas langsung istirahat/pulang tanpa peduli tim.' },
    { val: 2, label: 'Jarang', desc: 'Bekerja seadanya, sekadar gugur kewajiban atau asal jadi.', eg: 'Mengirim draf slides acak-acakan yang kurang profesional.' },
    { val: 1, label: 'Hampir Tidak Pernah', desc: 'Menghindari tugas pokok dan menunjukkan etos kerja buruk.', eg: 'Sering bermain handphone atau mengobrol di jam produktif.' }
  ],
  4: [
    { val: 5, label: 'Selalu', desc: 'Hasil kerja sempurna, tanpa kesalahan, siap pakai pimpinan.', eg: 'Laporan keuangan 100% akurat tanpa typo.' },
    { val: 4, label: 'Sering', desc: 'Sangat rapi, hanya ada revisi kecil yang tidak krusial.', eg: 'Desain visual promosi dengan estetika rapi dan informasi lengkap.' },
    { val: 3, label: 'Kadang', desc: 'Kualitas cukup, tapi kerap ditemukan komplain/salah input.', eg: 'Masih dijumpai salah ketik beberapa nama klien di invoice.' },
    { val: 2, label: 'Jarang', desc: 'Kurang rapi, sering menyulitkan karena harus dirombak ulang.', eg: 'Data stok gudang selisih jauh dengan fisik karena tidak teliti.' },
    { val: 1, label: 'Hampir Tidak Pernah', desc: 'Sangat mengecewakan, tidak rapi, dan tidak berstandar.', eg: 'Formulir diserahkan dalam keadaan kosong dan rusak format.' }
  ],
  5: [
    { val: 5, label: 'Selalu', desc: 'Proaktif mencari solusi masalah baru tanpa minta perintah.', eg: 'Membuat excel makro otomatis untuk hemat 2 jam kerja tim.' },
    { val: 4, label: 'Sering', desc: 'Sering mengusulkan ide perbaikan sistem demi kelancaran.', eg: 'Memberi ide tata letak barang dagangan agar mudah dicari.' },
    { val: 3, label: 'Kadang', desc: 'Mandiri untuk tugas rutin, tapi pasif untuk tugas baru.', eg: 'Menunggu arahan manajer sebelum melayani tipe prospek baru.' },
    { val: 2, label: 'Jarang', desc: 'Hanya bergerak jika diarahkan atau ditegur langsung.', eg: 'Melihat kertas tercecer tapi mendiamkannya sebelum ditegur.' },
    { val: 1, label: 'Hampir Tidak Pernah', desc: 'Sangat pasif, tugas sendiri pun sering kali terbengkalai.', eg: 'Sering lapor logbook harian terlambat atau tidak mengisi sama sekali.' }
  ],
  6: [
    { val: 5, label: 'Selalu', desc: 'Sangat haus ilmu, cepat menguasai hal baru & berbagi ilmu.', eg: 'Mempelajari trik AI secara mandiri lalu mengajari rekan setim.' },
    { val: 4, label: 'Sering', desc: 'Bersemangat belajar keterampilan baru dan mau menerima kritik.', eg: 'Antusias mendaftarkan diri pada program upskilling divisi.' },
    { val: 3, label: 'Kadang', desc: 'Mau belajar hal baru hanya saat tuntutan sistem/jabatan.', eg: 'Mempelajari software kasir baru karena diwajibkan toko.' },
    { val: 2, label: 'Jarang', desc: 'Enggan keluar dari zona nyaman, kurang minat berkembang.', eg: 'Menolak cara input modern karena merasa cara manual cukup.' },
    { val: 1, label: 'Hampir Tidak Pernah', desc: 'Menolak keras hal baru dan memusuhi ilmu praktis modern.', eg: 'Marah bila diminta beralih memakai komputer untuk arsip.' }
  ],
  7: [
    { val: 5, label: 'Selalu', desc: 'Agile, tetap produktif tinggi walau kondisi berubah drastis.', eg: 'Mengubah taktik promosi penjualan dalam 2 hari demi target.' },
    { val: 4, label: 'Sering', desc: 'Cepat menyesuaikan diri dengan sistem kerja kerja baru tanpa mengeluh.', eg: 'Langsung memakai format laporan baru sesuai arahan SPV.' },
    { val: 3, label: 'Kadang', desc: 'Butuh waktu transisi sebelum akhirnya bisa menerima perubahan.', eg: 'Sempat kesulitan beradaptasi dengan pembagian shift baru.' },
    { val: 2, label: 'Jarang', desc: 'Lambat menerima sistem baru, sering nostalgia cara lama.', eg: 'Mengeluhkan software baru terus, membuat tugasnya terlambat.' },
    { val: 1, label: 'Hampir Tidak Pernah', desc: 'Menentang keras perubahan sistem & sengaja melambatkan diri.', eg: 'Menolak menggunakan platform kolaborasi & tetap mengirim email manual.' }
  ],
  8: [
    { val: 5, label: 'Selalu', desc: 'Sangat suportif, meredakan konflik, & mengutamakan sinergi.', eg: 'Sukarela mem-backup tugas desain rekan kerja yang sakit keras.' },
    { val: 4, label: 'Sering', desc: 'Komunikatif, ramah, & terbuka membantu rekan yang kesulitan.', eg: 'Aktif menyumbang gagasan positif saat rapat kerja tim.' },
    { val: 3, label: 'Kadang', desc: 'Fokus pada tugas sendiri, kooperatif tapi kurang bergaul.', eg: 'Menyelesaikan bagian presentasinya sendiri tanpa peduli yang lain.' },
    { val: 2, label: 'Jarang', desc: 'Kurang komunikatif, cenderung individualis & malas berbagi.', eg: 'Menyimpan data riset untuk diri sendiri, enggan membagi ke tim.' },
    { val: 1, label: 'Hampir Tidak Pernah', desc: 'Egois, toxic, & sering merusak kerukunan internal tim.', eg: 'Mengucilkan rekan setim karena sentimen atau masalah pribadi.' }
  ],
  9: [
    { val: 5, label: 'Selalu', desc: 'Terbuka luas pada kritik, berterima kasih & langsung berbenah.', eg: 'Kritik gaya bicara cepat langsung diperbaiki keesokan harinya.' },
    { val: 4, label: 'Sering', desc: 'Menerima masukan dengan sopan dan berusaha menyesuaikan diri.', eg: 'Mendengar arahan pimpinan dengan baik & mengubah pendekatan kerja.' },
    { val: 3, label: 'Kadang', desc: 'Bisa mendengarkan kritik walau terlihat tidak nyaman/murung.', eg: 'Diam saja saat dievaluasi, tapi perlahan kinerjanya membaik.' },
    { val: 2, label: 'Jarang', desc: 'Defensif, banyak cari pembenaran bila dinilai kinerjanya.', eg: 'Langsung membantah SPV yang mengevaluasi kecepatan kerjanya.' },
    { val: 1, label: 'Hampir Tidak Pernah', desc: 'Marah, mendendam, & mengabaikan feedback sepenuhnya.', eg: 'Menghindari & mendiamkan teman kerja yang memberi saran.' }
  ],
  10: [
    { val: 5, label: 'Selalu', desc: 'Sangat jujur, menjaga rahasia, sopan santun teladan.', eg: 'Selalu hadir tepat waktu, tutur bahasa sopan ke semua kalangan.' },
    { val: 4, label: 'Sering', desc: 'Profesional, patuh SOP, & menjaga perkataan tulus sopan.', eg: 'Memakai seragam rapi dan merespons pembicaraan dengan ramah.' },
    { val: 3, label: 'Kadang', desc: 'Sopan tapi sesekali melanggar aturan kecil yang tak sengaja.', eg: 'Datang terlambat 5 menit karena macet jalanan luar biasa.' },
    { val: 2, label: 'Jarang', desc: 'Sering abai aturan kecil, bersenda gurau kurang sopan.', eg: 'Menggunakan sandal santai saat rapat atau di ruang lobi utama.' },
    { val: 1, label: 'Hampir Tidak Pernah', desc: 'Krisis etika, tidak sopan, atau mengabaikan martabat kerja.', eg: 'Memaki secara terbuka di grup koordinasi resmi kantor.' }
  ],
  11: [
    { val: 5, label: 'Selalu', desc: 'Disiplin ekstrem, cerdas atur prioritas, tak pernah overtime darurat.', eg: 'Menyusun timeline rapi & menuntaskan tugas H-1 sebelum deadline.' },
    { val: 4, label: 'Sering', desc: 'Mampu menyusun skala prioritas, disiplin selesaikan tugas harian.', eg: 'Membuat daftar tugas harian sehingga operasional lancar.' },
    { val: 3, label: 'Kadang', desc: 'Tugas rutin aman, tapi keteteran bila ada tugas mendadak.', eg: 'Kerjaan tepat waktu, tapi update draf agak telat karena ada rapat.' },
    { val: 2, label: 'Jarang', desc: 'Sering bingung menentukan prioritas, tugas penting terlewat.', eg: 'Sibuk merapikan meja seharian saat dokumen asuransi penting mepet.' },
    { val: 1, label: 'Hampir Tidak Pernah', desc: 'Sangat berantakan, selalu terlambat, absen tanpa kabar.', eg: 'Mangkir dari jam kerja tanpa izin pimpinan untuk nongkrong.' }
  ]
};

export const FormAssess: React.FC<FormAssessProps> = ({
  target,
  onCancel,
  onSubmit,
  customQQuant,
  customQQual,
  initialAnswers
}) => {
  const [qAnswers, setQAnswers] = useState<Record<number, number>>(() => initialAnswers?.q || {});
  const [tAnswers, setTAnswers] = useState<Record<number, string>>(() => initialAnswers?.t || {});
  const [qReasons, setQReasons] = useState<Record<number, string>>(() => initialAnswers?.qr || {});

  const [selectedAspect, setSelectedAspect] = useState<string>('A');
  const [selectedIdx, setSelectedIdx] = useState<number>(0);

  const questionsQuant = customQQuant || Q_QUANT;

  const ASPECTS = useMemo(() => {
    const map: Record<string, number[]> = { A: [], B: [], C: [], D: [], E: [] };
    questionsQuant.forEach((q, idx) => {
      const code = getAspectCodeForQuestion(q, idx);
      if (map[code]) {
        map[code].push(idx);
      } else {
        map.E.push(idx);
      }
    });
    return ASPECTS_METADATA.map(meta => ({
      code: meta.code,
      name: meta.name,
      countLabel: `(${map[meta.code].length})`,
      indices: map[meta.code]
    }));
  }, [questionsQuant]);

  const setQ = (qIndex: number, value: number) => {
    setQAnswers(prev => ({ ...prev, [qIndex]: value }));
  };

  const setQR = (qIndex: number, value: string) => {
    setQReasons(prev => ({ ...prev, [qIndex]: value }));
  };

  const handleAspectChange = (aspectCode: string) => {
    setSelectedAspect(aspectCode);
    const aspect = ASPECTS.find(a => a.code === aspectCode);
    if (aspect && aspect.indices.length > 0) {
      if (!aspect.indices.includes(selectedIdx)) {
        setSelectedIdx(aspect.indices[0]);
      }
    }
  };

  const getQuestionMetaLocal = (idx: number) => {
    return getQuestionMeta(idx, questionsQuant);
  };

  const totalQuestions = questionsQuant.length * 2;
  const qAnsweredCount = Object.keys(qAnswers).length;
  const qrAnsweredCount = Object.values(qReasons).filter((v: unknown): v is string => typeof v === 'string' && v.trim().length > 0).length;
  const totalAnswered = qAnsweredCount + qrAnsweredCount;
  const progressPercent = totalQuestions > 0 ? Math.round((totalAnswered / totalQuestions) * 100) : 0; // standard progress calculation

  const handleSubmit = () => {
    // Advanced contextual validation focusing on aspects pathing
    for (let i = 0; i < questionsQuant.length; i++) {
      if (qAnswers[i] === undefined) {
        const aspect = ASPECTS.find(a => a.indices.includes(i));
        if (aspect) {
          setSelectedAspect(aspect.code);
          setSelectedIdx(i);
        }
        alert(`Tolong berikan penilaian rating kuantitatif pada pertanyaan Q${i + 1}: "${getQuestionMetaLocal(i).title}"`);
        return;
      }
      if (!qReasons[i] || qReasons[i].trim().length < 4) {
        const aspect = ASPECTS.find(a => a.indices.includes(i));
        if (aspect) {
          setSelectedAspect(aspect.code);
          setSelectedIdx(i);
        }
        alert(`Tolong isi bukti perilaku / alasan pengisian untuk pertanyaan Q${i + 1}: "${getQuestionMetaLocal(i).title}" minimal 4 karakter.`);
        return;
      }
    }

    onSubmit({ q: qAnswers, t: tAnswers, qr: qReasons });
  };

  const handleSaveDraft = () => {
    onSubmit({ q: qAnswers, t: tAnswers, qr: qReasons }, true);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -15 }}
      className="max-w-5xl mx-auto space-y-6"
    >
      {/* Top Identity Banner */}
      <div className="bg-emerald-800 text-emerald-50 rounded-2xl p-5 shadow-xs relative overflow-hidden flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
          <Sparkles className="w-20 h-20" />
        </div>
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-emerald-700/80 border border-emerald-600 flex items-center justify-center font-bold text-lg text-emerald-100 uppercase shadow-inner">
            {target.name.split(' ').slice(0, 2).map(n => n[0]).join('')}
          </div>
          <div>
            <span className="text-[10px] font-bold text-emerald-300 uppercase tracking-wider block">Target Penilaian 360°</span>
            <h3 className="text-md font-bold leading-tight">{target.name}</h3>
            <span className="text-xs text-emerald-200 block mt-0.5 font-medium">{target.dept} Department · ID: {target.id}</span>
          </div>
        </div>

        {/* Dynamic score tracker box */}
        <div className="bg-emerald-900/60 rounded-xl px-4 py-2 border border-emerald-700/50 flex flex-col items-center justify-center self-start md:self-auto min-w-[110px]">
          <span className="text-[10px] font-bold text-emerald-300 tracking-wider">PROGRESS</span>
          <span className="text-xl font-bold text-white leading-tight mt-0.5">{totalAnswered}/{totalQuestions}</span>
          <span className="text-[9px] text-emerald-200 mt-0.5">Pertanyaan Terisi</span>
        </div>
      </div>

      {/* Progress slider bar indicator */}
      <div className="bg-white border border-gray-200/85 rounded-xl p-3 flex items-center gap-3 shadow-2xs">
        <div className="h-2.5 bg-gray-100 flex-1 rounded-full overflow-hidden">
          <div
            style={{ width: `${progressPercent}%` }}
            className="h-full bg-emerald-600 rounded-full transition-all duration-305 ease-out shadow-inner"
          />
        </div>
        <span className="text-xs font-bold text-emerald-800 font-mono w-10 text-right">{progressPercent}%</span>
      </div>

      {/* SECTION A: QUANTITATIVE */}
      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden flex flex-col">
        {/* Section header banner */}
        <div className="bg-emerald-50 px-5 py-4 border-b border-gray-200 flex items-center gap-2.5">
          <div className="w-6 h-6 rounded-full bg-emerald-800 text-white flex items-center justify-center font-bold text-xs shadow-xs">
            A
          </div>
          <div>
            <h4 className="text-xs font-bold text-emerald-950 uppercase tracking-wider">Bagian A: Penilaian Kuantitatif Budaya</h4>
            <span className="text-[10px] text-gray-500 font-medium">Isi skor dengan memilih aspek serta masing-masing indikator perilaku di bawah ini</span>
          </div>
        </div>

        {/* Rating Guide / Penjelasan Penilaian Umum */}
        <div className="p-4 bg-gray-50/50 border-b border-gray-150">
          <div className="bg-stone-50/80 border border-stone-150 rounded-xl p-4 text-xs text-gray-700">
            <div className="flex items-center gap-2 font-bold text-[12px] text-gray-850 pb-2 border-b border-gray-200 mb-3">
              <ClipboardList className="w-4 h-4 text-emerald-800" />
              <span>Panduan Penilaian Umum (General Evaluation Guide):</span>
            </div>
            <div className="space-y-2.5">
              <p className="text-gray-650 leading-relaxed">
                Sistem penilaian 360° ini dirancang untuk mengkalibrasi budaya kerja secara objektif, adil, dan transparan bagi seluruh anggota tim. Harap perhatikan hal-hal berikut sewaktu melakukan pengisian:
              </p>
              <ul className="list-disc list-inside space-y-1.5 pl-1.5 text-gray-600">
                <li>
                  <strong className="text-gray-800 font-bold">Penilaian Berbasis Perilaku Nyata</strong>: Berikan rating berdasarkan fakta pengamatan kerja nyata sehari-hari, bukan berdasarkan kedekatan atau sentimen personal.
                </li>
                <li>
                  <strong className="text-gray-800 font-bold">Skala Penilaian Konsisten</strong>: Pilihan rating berkisar dari <strong className="text-gray-800 font-bold">1 (Hampir Tidak Pernah)</strong> hingga <strong className="text-gray-800 font-bold">5 (Selalu)</strong>. Sesuaikan dengan tingkat konsistensi tindakan target di lapangan.
                </li>
                <li>
                  <strong className="text-gray-800 font-bold">Wajib Mengisi Bukti Perilaku</strong>: Anda wajib mencantumkan contoh peristiwa nyata atau alasan objektif minimal <strong className="text-gray-800 font-bold">4 karakter</strong> di kolom komentar untuk melengkapi skor kuantitatif.
                </li>
                <li>
                  <strong className="text-gray-800 font-bold">Sistem Navigasi Aspek</strong>: Gunakan filter aspek budaya di bawah ini untuk berpindah indikator pertanyaan dengan lancar dan terstruktur.
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* SPLIT: rail aspek (kiri) + editor pertanyaan (kanan) */}
        <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr]">
        {/* LEFT: Pilih Aspek Budaya (vertikal) */}
        <div className="p-4 bg-gray-50/20 border-b lg:border-b-0 lg:border-r border-gray-200">
          <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">
            Pilih Aspek Budaya:
          </label>
          <div className="flex flex-col gap-2">
            {ASPECTS.map((aspect) => {
              const isActive = selectedAspect === aspect.code;
              const completedCount = aspect.indices.filter(
                (idx) => qAnswers[idx] !== undefined && qReasons[idx]?.trim().length >= 4
              ).length;
              const isAllDone = completedCount === aspect.indices.length;

              return (
                <button
                  key={aspect.code}
                  onClick={() => handleAspectChange(aspect.code)}
                  type="button"
                  className={`p-3 rounded-xl border text-left flex flex-col justify-between h-[85px] transition-all duration-150 cursor-pointer ${
                    isActive
                      ? 'border-emerald-800 bg-emerald-50/50 text-emerald-950 ring-1 ring-emerald-800'
                      : 'border-gray-200 bg-white hover:bg-gray-50 text-gray-700'
                  }`}
                >
                  <span className={`text-[10px] leading-tight block ${isActive ? 'font-extrabold' : 'font-semibold'}`}>
                    {aspect.name}
                  </span>
                  <div className="flex items-center justify-between w-full mt-1.5 pt-1 text-[10px] font-bold text-gray-500">
                    <span>{aspect.countLabel}</span>
                    {isAllDone ? (
                      <CheckCircle2 className="w-4.5 h-4.5 text-emerald-700 shrink-0" />
                    ) : (
                      <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-stone-100 text-stone-600 font-mono font-bold">
                        {completedCount}/{aspect.indices.length}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* RIGHT: indikator + editor pertanyaan aktif */}
        <div className="flex flex-col">
        {/* Indicators Filter Buttons Row: Continues absolute numbering from Q previous Aspect */}
        <div className="px-4 py-3 bg-stone-50/35 border-b border-gray-200">
          <div className="flex flex-wrap gap-2">
            {ASPECTS.find(a => a.code === selectedAspect)?.indices.map((idx) => {
              const qNum = idx + 1;
              const meta = getQuestionMetaLocal(idx);
              const isActive = selectedIdx === idx;
              const isFilled = qAnswers[idx] !== undefined && qReasons[idx]?.trim().length >= 4;

              return (
                <button
                  key={idx}
                  onClick={() => setSelectedIdx(idx)}
                  type="button"
                  className={`px-3 py-2 rounded-xl border text-left transition-all duration-120 flex flex-col justify-center min-w-[120px] max-w-[185px] flex-1 cursor-pointer ${
                    isActive
                      ? 'border-sky-500 bg-sky-50 text-sky-800 font-extrabold outline-none ring-1 ring-sky-500'
                      : isFilled
                      ? 'border-emerald-250 bg-emerald-50/10 text-emerald-800 font-medium'
                      : 'border-gray-200 bg-gray-50/60 text-gray-700 hover:bg-gray-100 font-semibold'
                  }`}
                >
                  <span className="text-[9px] text-gray-400 font-bold block">Q{qNum}</span>
                  <span className="text-[11px] leading-tight line-clamp-1">{meta.title}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Active Question Core Editor Panel */}
        <div className="p-5">
          {(() => {
            const meta = getQuestionMetaLocal(selectedIdx);
            const qNum = selectedIdx + 1;
            const currentRating = qAnswers[selectedIdx];
            const currentReason = qReasons[selectedIdx] || '';

            return (
              <div className="border border-gray-200/80 rounded-2xl p-5 bg-white shadow-3xs space-y-4">
                {/* Header row */}
                <div className="flex items-center justify-between">
                  <h5 className="font-extrabold text-sm text-gray-900 flex items-center gap-1.5">
                    <span>Q{qNum}: {meta.title}</span>
                  </h5>
                  <button
                    type="button"
                    onClick={() => {
                      const nextQ = { ...qAnswers };
                      delete nextQ[selectedIdx];
                      setQAnswers(nextQ);
                      const nextQR = { ...qReasons };
                      delete nextQR[selectedIdx];
                      setQReasons(nextQR);
                    }}
                    title="Hapus jawaban untuk pertanyaan ini"
                    className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-150/40 rounded-lg transition-colors cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Question precise explanation box with blue left border */}
                <div className="border-l-4 border-sky-500 bg-sky-50/30 p-4 rounded-r-xl text-xs text-sky-950 font-medium leading-relaxed">
                  {meta.desc}
                </div>

                {/* Specific Rating Explanation per Question (Moved below question) */}
                <div className="bg-stone-50/75 border border-stone-150 rounded-xl p-4 text-[11px] text-gray-700 space-y-3">
                  <div className="font-extrabold text-[11.5px] text-gray-800 pb-1.5 border-b border-gray-200 flex items-center gap-1.5">
                    <ClipboardList className="w-3.5 h-3.5 text-emerald-850" />
                    <span>Penjelasan Setiap Rating (Rating Guide for Q{qNum}):</span>
                  </div>
                  <div className="grid grid-cols-1 gap-2.5">
                    {((QUESTION_RATINGS_GUIDE[selectedIdx] || [
                      { val: 5, label: 'Selalu', desc: 'Indikator dijalankan secara sempurna tanpa kesalahan.', eg: 'Selalu konsisten.' },
                      { val: 4, label: 'Sering', desc: 'Indikator dijalankan secara konsisten pada sebagian besar tugas.', eg: 'Sering konsisten.' },
                      { val: 3, label: 'Kadang', desc: 'Sesuai ekspektasi standar rutin kerja, belum terlalu istimewa.', eg: 'Kadang konsisten.' },
                      { val: 2, label: 'Jarang', desc: 'Kerja kurang terarah, sering butuh dipantau intens.', eg: 'Kurang teratur.' },
                      { val: 1, label: 'Hampir Tidak Pernah', desc: 'Sangat kurang disiplin, mengabaikan esensi indikator.', eg: 'Hampir tidak pernah dilakukan.' }
                    ])).map((item) => (
                      <div key={item.val} className="flex gap-2.5 items-start">
                        <span className="font-black text-emerald-800 font-mono w-4 px-1 rounded bg-emerald-50 text-center shrink-0 border border-emerald-100">{item.val}</span>
                        <div className="flex-1 leading-normal text-gray-650">
                          <strong className="text-gray-900 font-bold">{item.label}</strong>
                          <span className="text-gray-400 font-bold mx-1.5">|</span>
                          <span>{item.desc}</span>
                          <span className="block text-[10px] text-gray-400 italic mt-0.5 font-medium">&rarr; Contoh tindakan nyata: {item.eg}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Rating Input Group */}
                <div className="bg-stone-50/45 border border-gray-200 p-4 rounded-2xl">
                  <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest block mb-2.5">
                    Rating (klik untuk pilih):
                  </span>
                  <div className="grid grid-cols-5 gap-1.5 sm:gap-3 max-w-lg">
                    {[1, 2, 3, 4, 5].map((val) => {
                      const isSelected = currentRating === val;
                      const label =
                        val === 1 ? 'Hampir Tidak Pernah' : val === 2 ? 'Jarang' : val === 3 ? 'Kadang' : val === 4 ? 'Sering' : 'Selalu';
                      return (
                        <div key={val} className="flex flex-col items-center gap-1 flex-1">
                          <button
                            type="button"
                            onClick={() => setQ(selectedIdx, val)}
                            className={`w-full py-2.5 text-xs sm:text-sm font-extrabold rounded-xl border transition-all duration-120 flex items-center justify-center cursor-pointer ${
                              isSelected
                                ? 'bg-emerald-800 text-white border-emerald-800 shadow-md scale-102'
                                : 'bg-white hover:bg-gray-100 border-gray-200 shadow-3xs text-gray-800'
                            }`}
                          >
                            {val}
                          </button>
                          <span
                            className={`text-[9.5px] text-center font-bold tracking-tight leading-tight mt-0.5 ${
                              isSelected ? 'text-emerald-800 font-black' : 'text-gray-400'
                            }`}
                          >
                            {label}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Commentary Group */}
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-extrabold text-emerald-800 uppercase tracking-wider flex items-center gap-1">
                    <span>Komentar / Bukti Tindakan Kalibrasi :</span>
                    <span className="text-rose-500 font-bold">*</span>
                  </label>
                  <textarea
                    value={currentReason}
                    onChange={(e) => setQR(selectedIdx, e.target.value)}
                    placeholder="Jelaskan rating Anda dengan contoh konkret (situasi nyata, perilaku yang terlihat, frekuensi)&#10;Contoh: Saat deadline ketat, dia tetap calm dan fokus tanpa mengeluh, membantu teman yang ketinggalan."
                    rows={3}
                    className="w-full text-xs p-3.5 border border-gray-250 rounded-xl focus:ring-1 focus:ring-emerald-700 bg-gray-50/20 text-gray-850 font-sans leading-relaxed resize-y outline-none"
                  />
                  <div className="flex justify-between items-center text-[10px] text-gray-400">
                    <span>Sampaikan saran & tindakan secara realistis objektif</span>
                    <span
                      className={
                        currentReason.trim().length >= 4 ? 'text-emerald-700 font-extrabold' : 'text-rose-500 font-extrabold font-mono'
                      }
                    >
                      {currentReason ? `${currentReason.trim().length} karakter (Min. 4)` : 'Wajib Diisi'}
                    </span>
                  </div>
                </div>

                {/* Footer Micro navigation layout */}
                <div className="flex justify-between items-center pt-2 text-[10px] sm:text-xs font-bold text-gray-500 border-t border-gray-100">
                  <button
                    type="button"
                    disabled={selectedIdx === 0}
                    onClick={() => {
                      const prevIdx = selectedIdx - 1;
                      if (prevIdx >= 0) {
                        const aspect = ASPECTS.find((a) => a.indices.includes(prevIdx));
                        if (aspect) {
                          setSelectedAspect(aspect.code);
                        }
                        setSelectedIdx(prevIdx);
                      }
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 border border-gray-200 bg-white hover:bg-gray-50 rounded-lg disabled:opacity-35 disabled:cursor-not-allowed transition-all cursor-pointer text-gray-700"
                  >
                    <ChevronLeft className="w-3.5 h-3.5 text-gray-500" />
                    <span>Sebelumnya</span>
                  </button>
                  <span className="font-mono text-gray-400 bg-gray-100 px-2 py-0.5 rounded text-[9px] font-bold">
                    PROGRES: {qAnsweredCount}/{questionsQuant.length} PERTANYAAN
                  </span>
                  <button
                    type="button"
                    disabled={selectedIdx === questionsQuant.length - 1}
                    onClick={() => {
                      const nextIdx = selectedIdx + 1;
                      if (nextIdx < questionsQuant.length) {
                        const aspect = ASPECTS.find((a) => a.indices.includes(nextIdx));
                        if (aspect) {
                          setSelectedAspect(aspect.code);
                        }
                        setSelectedIdx(nextIdx);
                      }
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 border border-gray-200 bg-white hover:bg-gray-50 rounded-lg disabled:opacity-35 disabled:cursor-not-allowed transition-all cursor-pointer text-gray-700"
                  >
                    <span>Selanjutnya</span>
                    <ChevronLeft className="w-3.5 h-3.5 text-gray-500 rotate-180" />
                  </button>
                </div>
              </div>
            );
          })()}
        </div>
        </div>{/* /RIGHT */}
        </div>{/* /grid split */}
      </div>

      {/* Control Buttons Bottom Sheet */}
      <div className="bg-gray-100 border border-gray-200 p-4 rounded-2xl shadow-2xs flex flex-col sm:flex-row justify-between gap-3 text-xs font-bold">
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-gray-700 bg-white hover:bg-gray-50 border border-gray-250 transition-colors cursor-pointer"
        >
          <XCircle className="w-4 h-4 text-gray-400" />
          <span>Batalkan Pengisian</span>
        </button>

        <div className="flex gap-2 text-xs font-bold">
          <button
            type="button"
            onClick={handleSaveDraft}
            className="inline-flex items-center justify-center gap-1.5 px-4.5 py-2 rounded-xl text-indigo-900 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 transition-colors cursor-pointer"
          >
            <Save className="w-4 h-4 text-indigo-700" />
            <span>Simpan Draf</span>
          </button>

          <button
            type="button"
            onClick={handleSubmit}
            className="inline-flex items-center justify-center gap-1 px-5 py-2 rounded-xl text-white bg-emerald-800 hover:bg-emerald-900 shadow-sm transition-colors cursor-pointer"
          >
            <Send className="w-4 h-4 text-emerald-100" />
            <span>Kirim Penilaian 360°</span>
          </button>
        </div>
      </div>
    </motion.div>
  );
};
export default FormAssess;
