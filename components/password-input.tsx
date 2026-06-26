'use client';

import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

/**
 * Input sandi dengan tombol "mata coret" untuk lihat/sembunyikan tulisan sandi.
 * Gaya input mengikuti field standar aplikasi (+ ruang kanan untuk ikon).
 */
export function PasswordInput({
  value, onChange, autoComplete, placeholder, required = true, className = '',
}: {
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
  placeholder?: string;
  required?: boolean;
  className?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        type={show ? 'text' : 'password'}
        required={required}
        autoComplete={autoComplete}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full text-sm px-3 py-2 pr-10 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600 ${className}`}
      />
      <button
        type="button"
        tabIndex={-1}
        onClick={() => setShow((s) => !s)}
        title={show ? 'Sembunyikan sandi' : 'Tampilkan sandi'}
        className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600"
      >
        {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  );
}
