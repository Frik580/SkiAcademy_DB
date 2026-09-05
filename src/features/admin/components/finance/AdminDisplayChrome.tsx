import React from 'react';
import { useLanguage } from '../../../../app/providers/LanguageContext';

/**
 * Lightweight Admin chrome: fixed KZT display badge.
 * No FX rate editing or currency toggle (project is KZT-only).
 */
export const AdminDisplayChrome: React.FC = () => {
  const { t } = useLanguage();

  return (
    <div className="flex flex-wrap items-center justify-end gap-3">
      <div className="flex items-center gap-2">
        <span className="text-xs text-[var(--ink-dim)] font-mono uppercase tracking-wider">
          {t('currencyLabel') || 'Валюта'}:
        </span>
        <span className="px-3 py-1 border border-[var(--border)] bg-[var(--bg)] text-xs font-mono font-bold tracking-wider text-[var(--ink)] flex items-center gap-1.5 shadow-xs">
          ₸ KZT
        </span>
      </div>
    </div>
  );
};
