import React from 'react';
import { motion } from 'motion/react';
import { Award, Target, Flame, TrendingUp } from 'lucide-react';

interface ChartProps {
  deptScores: [string, number][];
  aspekScores: { aspek: string; score: number }[];
  categories: { label: string; count: number; color: string }[];
  recommendations: { label: string; count: number; color: string }[];
  has360?: boolean;
  selectedQuarterLabel?: string;
}

export const VisualCharts: React.FC<ChartProps> = ({
  deptScores,
  aspekScores,
  categories,
  recommendations,
  has360 = true,
  selectedQuarterLabel = '',
}) => {
  return (
    <div className="space-y-6">
      {/* Stat Mini Visual Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600">
            <Award className="w-6 h-6" />
          </div>
          <div>
            <div className="text-2xl font-semibold text-gray-800">88.4</div>
            <div className="text-xs text-gray-400">Rataan Nilai Organisasi</div>
          </div>
        </div>

        <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600">
            <Target className="w-6 h-6" />
          </div>
          <div>
            <div className="text-2xl font-semibold text-gray-800">78%</div>
            <div className="text-xs text-gray-400">Penyelesaian Form 360°</div>
          </div>
        </div>

        <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600">
            <Flame className="w-6 h-6" />
          </div>
          <div>
            <div className="text-2xl font-semibold text-gray-800">4</div>
            <div className="text-xs text-gray-400">Perlu Coaching Khusus</div>
          </div>
        </div>

        <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600">
            <TrendingUp className="w-6 h-6" />
          </div>
          <div>
            <div className="text-2xl font-semibold text-gray-800">Melampaui</div>
            <div className="text-xs text-gray-400">Kategori Dominan</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Category Count Distribution Graph */}
        <div className="bg-white border border-gray-200/80 rounded-2xl p-5 shadow-xs">
          <h4 className="text-sm font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <span>📊</span> Distribusi Kategori Kinerja
          </h4>
          <div className="space-y-4">
            {categories.map((cat, idx) => {
              const maxCount = Math.max(...categories.map(c => c.count), 1);
              const percentage = (cat.count / 60) * 100; // 60 total
              return (
                <div key={idx} className="space-y-1">
                  <div className="flex justify-between text-xs font-medium text-gray-600">
                    <span>{cat.label}</span>
                    <span className="text-gray-900 font-mono">{cat.count} Pegawai ({percentage.toFixed(1)}%)</span>
                  </div>
                  <div className="h-4 bg-gray-100 rounded-full overflow-hidden flex">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${(cat.count / maxCount) * 100}%` }}
                      transition={{ duration: 0.8, delay: idx * 0.1 }}
                      style={{ backgroundColor: cat.color }}
                      className="h-full rounded-full shadow-inner"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Recommendation Plan Graph */}
        <div className="bg-white border border-gray-200/80 rounded-2xl p-5 shadow-xs">
          <h4 className="text-sm font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <span>🎯</span> Rencana Tindak Lanjut Organisasi
          </h4>
          <div className="space-y-4">
            {recommendations.map((rec, idx) => {
              const maxCount = Math.max(...recommendations.map(c => c.count), 1);
              const percentage = (rec.count / 60) * 100;
              return (
                <div key={idx} className="space-y-1">
                  <div className="flex justify-between text-xs font-medium text-gray-600">
                    <span>{rec.label}</span>
                    <span className="text-gray-900 font-mono">{rec.count} Pegawai ({percentage.toFixed(1)}%)</span>
                  </div>
                  <div className="h-4 bg-gray-100 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${(rec.count / maxCount) * 100}%` }}
                      transition={{ duration: 0.8, delay: idx * 0.1 }}
                      style={{ backgroundColor: rec.color }}
                      className="h-full rounded-full shadow-inner opacity-90"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Department Averages Grid Column */}
        <div className="bg-white border border-gray-200/80 rounded-2xl p-5 shadow-xs">
          <h4 className="text-sm font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <span>🏢</span> Skor KPI Rata-rata per Departemen
          </h4>
          <div className="space-y-4">
            {deptScores.map(([dept, score], idx) => {
              return (
                <div key={idx} className="space-y-1">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-semibold text-gray-700">{dept}</span>
                    <span className="text-xs font-bold text-emerald-800 font-mono bg-emerald-50 px-2 py-0.5 rounded-md">{score.toFixed(1)}</span>
                  </div>
                  <div className="h-3 bg-gray-100 rounded-md overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${score}%` }}
                      transition={{ duration: 1, delay: idx * 0.08 }}
                      className="h-full bg-emerald-600 rounded-md"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Culture Core Assessment Metrics */}
        <div className="bg-white border border-gray-200/80 rounded-2xl p-5 shadow-xs relative overflow-hidden">
          {!has360 && (
            <div className="absolute top-0 left-0 bg-amber-500/10 border-b border-amber-200 w-full px-4 py-2 flex items-center justify-between text-[10px] text-amber-800 font-bold tracking-tight animate-pulse z-10">
              <span className="flex items-center gap-1.5 uppercase font-extrabold text-[9px] sm:text-[10px]">
                ⚠️ Evaluasi Budaya 360° Tidak Aktif di {selectedQuarterLabel || 'Kuartal Ini'}
              </span>
              <span className="bg-amber-500 text-white px-2 py-0.5 rounded text-[8px] sm:text-[9px] font-black uppercase tracking-wider">
                Skor Terakhir (Q1 2026)
              </span>
            </div>
          )}
          <h4 className={`text-sm font-semibold text-gray-800 flex items-center gap-2 ${!has360 ? 'mt-8 mb-4' : 'mb-4'}`}>
            <span>✨</span> Evaluasi Budaya 360° (Rataan Sub-Aspek)
          </h4>
          <div className="space-y-4">
            {aspekScores.map((asp, idx) => {
              const scoreColor = asp.score >= 90 ? 'bg-indigo-600' : asp.score >= 80 ? 'bg-indigo-500' : 'bg-amber-500';
              return (
                <div key={idx} className="space-y-1">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-medium text-gray-700">⭐ {asp.aspek}</span>
                    <span className="text-xs font-semibold text-indigo-900 font-mono bg-indigo-50 px-2 py-0.5 rounded-md">{asp.score} / 100</span>
                  </div>
                  <div className="h-3 bg-gray-100 rounded-md overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${asp.score}%` }}
                      transition={{ duration: 1, delay: idx * 0.08 }}
                      className={`h-full rounded-md ${scoreColor}`}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          {!has360 && (
            <div className="mt-4 p-2.5 bg-gray-50 border border-gray-150 rounded-xl">
              <p className="text-[10px] text-gray-500 italic font-medium leading-relaxed">
                * Keterangan: Karena penilaian 360° (Evaluasi Sosiometris) dinonaktifkan di {selectedQuarterLabel || 'periode ini'}, visualisasi di atas menggunakan rekam jejak historis peninjauan terakhir untuk konsistensi matriks budaya organisasi.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
export default VisualCharts;
