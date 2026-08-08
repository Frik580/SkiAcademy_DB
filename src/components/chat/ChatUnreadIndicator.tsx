import React from 'react';
import { useLanguage } from '../../lib/LanguageContext';

interface ChatUnreadIndicatorProps {
  show: boolean;
  className?: string;
}

export const ChatUnreadIndicator: React.FC<ChatUnreadIndicatorProps> = ({
  show,
  className = '',
}) => {
  const { t } = useLanguage();
  if (!show) return null;

  return (
    <span
      className={`inline-flex h-2 w-2 shrink-0 rounded-full bg-[var(--accent)] ring-2 ring-[var(--card-bg)] animate-pulse ${className}`}
      title={t('chatNewMessages')}
      aria-label={t('chatNewMessages')}
    />
  );
};
