import React, { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import type { OutboxDeadLetterSignal } from '@ski-academy/shared-domain';
import { useLanguage } from '../../../../app/providers/LanguageContext';
import { queryOutboxDeadLetterReadModel } from '../../../../lib/canonical/canonicalReadModelClient';
import { AdminCollapsibleSection } from './AdminCollapsibleSection';

export const OutboxDeadLetterSection: React.FC = () => {
  const { t, language } = useLanguage();
  const [items, setItems] = useState<readonly OutboxDeadLetterSignal[] | undefined>();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void queryOutboxDeadLetterReadModel({ scope: 'outbox_dead_letters' })
      .then((result) => {
        if (!cancelled) setItems(result.items);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const locale = language === 'ru' ? 'ru-RU' : 'en-US';

  return (
    <AdminCollapsibleSection
      id="outbox_dead_letters"
      title={t('outboxDeadLetterTitle')}
      subtitle={t('outboxDeadLetterSub')}
      icon={AlertTriangle}
      defaultOpen
    >
      {failed ? (
        <p className="text-[10px] font-mono uppercase tracking-wider text-red-500" role="alert">
          {t('outboxDeadLetterLoadFailed')}
        </p>
      ) : items === undefined ? null : items.length === 0 ? (
        <p className="text-xs text-[var(--ink-dim)]">{t('outboxDeadLetterEmpty')}</p>
      ) : (
        <ul className="space-y-2 max-w-3xl">
          {items.map((item) => (
            <li
              key={item.outboxId}
              className="border border-[var(--border)] p-3 bg-black/5 dark:bg-white/5 space-y-1"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-xs font-mono text-[var(--ink)]">{item.templateId}</span>
                <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-dim)]">
                  {item.channel}
                </span>
              </div>
              <p className="text-[10px] font-mono text-[var(--ink-dim)] break-all">
                {item.outboxId}
              </p>
              <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink)]">
                {item.errorCode}
                {' · '}
                {t('outboxDeadLetterAttempts')} {item.attemptCount}
                {' · '}
                {new Date(item.deadLetteredAt.seconds * 1000).toLocaleString(locale)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </AdminCollapsibleSection>
  );
};
