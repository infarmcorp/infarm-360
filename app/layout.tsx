import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Infarm 360° Performance Appraisal',
  description: 'Portal penilaian kinerja 360° internal Infarm',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
