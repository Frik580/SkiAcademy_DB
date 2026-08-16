import React from 'react';
import { Lock } from 'lucide-react';
import { type TranslationKey } from '../../../../lib/LanguageContext';

interface InstructorNotLinkedProps {
  t: (key: TranslationKey) => string;
}

export const InstructorNotLinked: React.FC<InstructorNotLinkedProps> = ({ t }) => (
  <div className="border border-slate-200/70 dark:border-slate-800/70 p-8 space-y-6 animate-fade-in bg-[var(--card-bg)] text-center max-w-xl mx-auto my-12 rounded-xs shadow-xs">
    <div className="w-16 h-16 border border-slate-200/60 dark:border-slate-800/60 rounded-full flex items-center justify-center mx-auto text-accent bg-accent-muted dark:bg-accent-muted">
      <Lock className="w-8 h-8" />
    </div>
    <div className="space-y-2">
      <h3 className="text-xl font-serif font-light text-[var(--ink)] tracking-tight">
        {t('instructorProfileNotLinked')}
      </h3>
      <p className="text-xs text-[var(--ink-dim)] font-mono uppercase tracking-wider leading-relaxed pt-2">
        {t('instructorProfileNotLinkedDesc')}
      </p>
      <p className="text-xs text-[var(--ink-dim)] font-mono uppercase tracking-wider leading-relaxed pt-2">
        {t('instructorContactAdmin')}
      </p>
    </div>
  </div>
);
