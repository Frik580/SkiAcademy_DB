import React from 'react';
import { ClipboardList } from 'lucide-react';
import { useLanguage } from '../../lib/LanguageContext';

interface RecommendationIndicatorProps {
  pending?: boolean;
  className?: string;
}

export const RecommendationIndicator: React.FC<RecommendationIndicatorProps> = ({
  pending = true,
  className = '',
}) => {
  const { t } = useLanguage();

  return (
    <span
      className={`inline-flex items-center justify-center shrink-0 ${className}`}
      title={pending ? t('scPendingRecommendations') : t('scRecommendations')}
      aria-label={pending ? t('scPendingRecommendations') : t('scRecommendations')}
    >
      <ClipboardList
        className={`w-3.5 h-3.5 ${pending ? 'text-[var(--accent)]' : 'text-[var(--ink-dim)]'}`}
        strokeWidth={2}
      />
    </span>
  );
};
