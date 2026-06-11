import { Q_QUANT } from '../data';

export const QUESTION_DETAILS_FALLBACK: Record<number, { title: string; desc: string }> = {
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

export const getAspectCodeForQuestion = (text: string, index: number): 'A' | 'B' | 'C' | 'D' | 'E' => {
  if (text.startsWith('[A]') || text.startsWith('A:')) return 'A';
  if (text.startsWith('[B]') || text.startsWith('B:')) return 'B';
  if (text.startsWith('[C]') || text.startsWith('C:')) return 'C';
  if (text.startsWith('[D]') || text.startsWith('D:')) return 'D';
  if (text.startsWith('[E]') || text.startsWith('E:')) return 'E';
  
  if (index >= 0 && index <= 2) return 'A';
  if (index >= 3 && index <= 5) return 'B';
  if (index >= 6 && index <= 7) return 'C';
  if (index >= 8 && index <= 9) return 'D';
  return 'E';
};

export const cleanQuestionText = (text: string): string => {
  if (!text) return '';
  let cleaned = text;
  if (cleaned.startsWith('[A]') || cleaned.startsWith('[B]') || cleaned.startsWith('[C]') || cleaned.startsWith('[D]') || cleaned.startsWith('[E]')) {
    cleaned = cleaned.substring(3).trim();
  } else if (cleaned.startsWith('A:') || cleaned.startsWith('B:') || cleaned.startsWith('C:') || cleaned.startsWith('D:') || cleaned.startsWith('E:')) {
    cleaned = cleaned.substring(2).trim();
  }
  return cleaned;
};

export const getQuestionMeta = (idx: number, questionsQuant: string[]) => {
  const original = QUESTION_DETAILS_FALLBACK[idx] || { title: `Indikator #${idx + 1}`, desc: 'Deskripsi kuesioner kustom yang ditambahkan oleh HRD Admin.' };
  if (questionsQuant && questionsQuant[idx]) {
    const raw = questionsQuant[idx];
    const text = cleanQuestionText(raw);
    const splitChar = text.includes(' - ') ? ' - ' : '-';
    const parts = text.split(splitChar);
    if (parts.length > 1) {
      return { title: parts[0]?.trim() || '', desc: parts.slice(1).join(' - ')?.trim() || '' };
    }
    return { title: text, desc: original.desc };
  }
  return original;
};
