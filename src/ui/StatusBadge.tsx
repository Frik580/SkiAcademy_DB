import React from 'react';
import { BookingStatus } from '../types';
import { useLanguage } from '../lib/LanguageContext';
import { getBookingStatusLabel } from '../lib/i18n/bookingLabels';

export type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'accent' | 'neutral';

export interface StatusBadgeProps {
  status?: BookingStatus | string;
  variant?: BadgeVariant;
  label?: string;
  showDot?: boolean;
  size?: 'xs' | 'sm' | 'md';
  className?: string;
}

interface StyleConfig {
  bg: string;
  text: string;
  border: string;
  dot: string;
  pulse?: boolean;
}

const VARIANT_MAP: Record<string, StyleConfig> = {
  confirmed: {
    bg: 'bg-emerald-500/10 dark:bg-emerald-950/40',
    text: 'text-emerald-700 dark:text-emerald-300',
    border: 'border-emerald-500/20 dark:border-emerald-500/30',
    dot: 'bg-emerald-500',
  },
  completed: {
    bg: 'bg-[color-mix(in_srgb,var(--accent)_12%,transparent)]',
    text: 'text-[var(--accent)]',
    border: 'border-[color-mix(in_srgb,var(--accent)_25%,transparent)]',
    dot: 'bg-[var(--accent)]',
  },
  pending: {
    bg: 'bg-amber-500/10 dark:bg-amber-950/40',
    text: 'text-amber-700 dark:text-amber-300',
    border: 'border-amber-500/20 dark:border-amber-500/30',
    dot: 'bg-amber-500',
    pulse: true,
  },
  pending_cancellation: {
    bg: 'bg-rose-500/10 dark:bg-rose-950/40',
    text: 'text-rose-700 dark:text-rose-300',
    border: 'border-rose-500/20 dark:border-rose-500/30',
    dot: 'bg-rose-500',
    pulse: true,
  },
  cancelled: {
    bg: 'bg-slate-500/10 dark:bg-slate-800/40',
    text: 'text-slate-600 dark:text-slate-400',
    border: 'border-slate-500/20 dark:border-slate-700/40',
    dot: 'bg-slate-400',
  },
  success: {
    bg: 'bg-emerald-500/10 dark:bg-emerald-950/40',
    text: 'text-emerald-700 dark:text-emerald-300',
    border: 'border-emerald-500/20 dark:border-emerald-500/30',
    dot: 'bg-emerald-500',
  },
  warning: {
    bg: 'bg-amber-500/10 dark:bg-amber-950/40',
    text: 'text-amber-700 dark:text-amber-300',
    border: 'border-amber-500/20 dark:border-amber-500/30',
    dot: 'bg-amber-500',
    pulse: true,
  },
  danger: {
    bg: 'bg-rose-500/10 dark:bg-rose-950/40',
    text: 'text-rose-700 dark:text-rose-300',
    border: 'border-rose-500/20 dark:border-rose-500/30',
    dot: 'bg-rose-500',
  },
  info: {
    bg: 'bg-sky-500/10 dark:bg-sky-950/40',
    text: 'text-sky-700 dark:text-sky-300',
    border: 'border-sky-500/20 dark:border-sky-500/30',
    dot: 'bg-sky-500',
  },
  accent: {
    bg: 'bg-[color-mix(in_srgb,var(--accent)_12%,transparent)]',
    text: 'text-[var(--accent)]',
    border: 'border-[color-mix(in_srgb,var(--accent)_25%,transparent)]',
    dot: 'bg-[var(--accent)]',
  },
  neutral: {
    bg: 'bg-slate-500/10 dark:bg-slate-800/40',
    text: 'text-slate-600 dark:text-slate-400',
    border: 'border-slate-500/20 dark:border-slate-700/40',
    dot: 'bg-slate-400',
  },
};

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  variant,
  label,
  showDot = true,
  size = 'sm',
  className = '',
}) => {
  const { language } = useLanguage();

  const key = status || variant || 'neutral';
  const config = VARIANT_MAP[key] || VARIANT_MAP.neutral;

  let displayLabel = label;
  if (!displayLabel && status) {
    displayLabel = getBookingStatusLabel(status, language);
  }

  const sizeClasses = {
    xs: 'px-1.5 py-0.5 text-[9px] gap-1',
    sm: 'px-2 py-0.5 text-xs gap-1.5',
    md: 'px-2.5 py-1 text-xs gap-2',
  }[size];

  const dotSize = {
    xs: 'w-1 h-1',
    sm: 'w-1.5 h-1.5',
    md: 'w-2 h-2',
  }[size];

  return (
    <span
      className={`inline-flex items-center rounded-full font-medium border ${config.bg} ${config.text} ${config.border} ${sizeClasses} ${className}`}
    >
      {showDot && (
        <span
          className={`rounded-full shrink-0 ${config.dot} ${dotSize} ${config.pulse ? 'animate-pulse' : ''}`}
        />
      )}
      <span className="truncate">{displayLabel || key}</span>
    </span>
  );
};
