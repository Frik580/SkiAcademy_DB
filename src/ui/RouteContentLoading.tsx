import React from 'react';
import { useLanguage } from '../app/providers/LanguageContext';
import { CardSkeleton, Skeleton } from './Skeleton';

/** Content-only loading surface; the real application chrome belongs to AppShell. */
export const RouteContentLoading: React.FC = () => {
  const { t } = useLanguage();
  return (
    <div
      className="w-full min-h-[calc(100svh-4rem)] max-w-7xl mx-auto p-6 space-y-6"
      role="status"
      aria-busy="true"
      aria-label={t('loading')}
    >
      <div className="flex items-center justify-between">
        <Skeleton className="h-6 w-48" />
        <span className="ui-section-eyebrow text-xs">{t('loading')}</span>
      </div>
      <CardSkeleton count={3} />
    </div>
  );
};
