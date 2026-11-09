import {
  AlertTriangle, BarChart3, CalendarDays, CheckCircle2, FileText, Folder, Hourglass, Info, KeyRound, Lock,
  Mail, Map as MapIcon, Puzzle, RefreshCw, Rocket, Scale, Trash2, Unlock, Users, XCircle, type LucideIcon,
} from 'lucide-react';

/*
 * Penerjemah emoji → ikon lucide (Design System Infarm: tanpa emoji di UI). Beberapa komponen bersama
 * (ConfirmDialog, EmptyState) menerima prop `icon` berupa STRING yang diisi emoji oleh pemanggil — agar
 * pemanggil tak perlu diubah, string itu dipetakan ke ikon garis di sini. Emoji tak dikenal → ikon cadangan.
 * Tanpa hook → aman di Server maupun Client Component.
 */
const EMOJI_ICON: Record<string, LucideIcon> = {
  '⚠': AlertTriangle,
  '✅': CheckCircle2,
  '✔': CheckCircle2,
  '🔄': RefreshCw,
  '📨': Mail,
  '✉': Mail,
  '🔑': KeyRound,
  '📁': Folder,
  '📂': Folder,
  '👥': Users,
  '🧩': Puzzle,
  '🗑': Trash2,
  '📊': BarChart3,
  '📈': BarChart3,
  '⏳': Hourglass,
  '⌛': Hourglass,
  '⚖': Scale,
  '📝': FileText,
  '📄': FileText,
  '🔒': Lock,
  '🔐': Lock,
  '🔓': Unlock,
  '🗓': CalendarDays,
  '📅': CalendarDays,
  '🗺': MapIcon,
  '🚀': Rocket,
  'ℹ': Info,
  '❌': XCircle,
  '⛔': XCircle,
};

/** Emoji (dengan/tanpa variation selector U+FE0F) → ikon lucide; `null` bila tak dikenal. */
export function iconForEmoji(emoji: string): LucideIcon | null {
  const key = emoji.replace(/[︎️]/g, '').trim();
  return EMOJI_ICON[key] ?? null;
}

/**
 * Render prop `icon` komponen bersama: string (emoji) → ikon lucide (cadangan `fallback`); elemen React lain
 * dirender apa adanya.
 */
export function renderIcon(icon: React.ReactNode, fallback: LucideIcon, className: string): React.ReactNode {
  if (icon == null || icon === false || icon === '' || typeof icon === 'string' || typeof icon === 'number') {
    const Icon = (typeof icon === 'string' && iconForEmoji(icon)) || fallback;
    return <Icon className={className} aria-hidden />;
  }
  return icon;
}
