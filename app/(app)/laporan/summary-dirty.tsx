'use client';

import { createContext, useContext, useState } from 'react';

/**
 * Berbagi status "ringkasan aspek belum disimpan" antara AspectSummaryEditor
 * (penanda dirty) dan ReportActions (guard Rilis/Finalisasi). Tanpa ini keduanya
 * terpisah → HRD bisa merilis tanpa menyimpan ringkasan terbaru tanpa peringatan.
 */
const Ctx = createContext<{ dirty: boolean; setDirty: (v: boolean) => void }>({
  dirty: false,
  setDirty: () => {},
});

export function useSummaryDirty() {
  return useContext(Ctx);
}

export function SummaryDirtyProvider({ children }: { children: React.ReactNode }) {
  const [dirty, setDirty] = useState(false);
  return <Ctx.Provider value={{ dirty, setDirty }}>{children}</Ctx.Provider>;
}
