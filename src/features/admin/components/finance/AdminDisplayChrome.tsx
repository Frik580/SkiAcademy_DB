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
        <span className="type-caption text-[var(--ink-dim)] uppercase">
          {t('currencyLabel') || 'Валюта'}:
        </span>
        <span className="px-3 py-1 border border-[var(--border)] bg-[var(--bg)] type-caption font-medium text-[var(--ink)] flex items-center gap-1.5 shadow-xs">
          ₸ KZT
        </span>
      </div>
    </div>
  );
};
