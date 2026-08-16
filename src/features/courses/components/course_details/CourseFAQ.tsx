import React, { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronDown, HelpCircle } from 'lucide-react';
import { useLanguage } from '../../../../lib/LanguageContext';
import type { CourseFaqItem } from './courseEnrichedData';

interface CourseFAQProps {
  faq: CourseFaqItem[];
}

export const CourseFAQ: React.FC<CourseFAQProps> = ({ faq }) => {
  const { t } = useLanguage();
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2 border-b border-[var(--border)] pb-2">
        <HelpCircle className="w-4 h-4 text-teal-500" />
        <h3 className="text-xs font-mono uppercase tracking-widest text-[var(--ink)] font-bold">
          {t('courseFaqTitle')}
        </h3>
      </div>
      <div className="space-y-2 font-sans">
        {faq.map((item, idx) => {
          const isExpanded = expandedFaq === idx;
          return (
            <div
              key={idx}
              className="border border-[var(--border)]/80 bg-black/5 dark:bg-white/5 overflow-hidden transition-colors"
            >
              <button
                onClick={() => setExpandedFaq(isExpanded ? null : idx)}
                className="w-full px-4 py-3.5 text-left flex items-center justify-between gap-4 font-bold text-xs text-[var(--ink)] transition-colors hover:bg-black/10 dark:hover:bg-white/10 cursor-pointer"
              >
                <span>{item.q}</span>
                <ChevronDown
                  className={`w-4 h-4 text-[var(--ink-dim)] transition-transform duration-300 shrink-0 ${
                    isExpanded ? 'rotate-180' : ''
                  }`}
                />
              </button>

              <AnimatePresence initial={false}>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.25, ease: 'easeInOut' }}
                  >
                    <div className="px-4 pb-4 pt-1 text-xs text-[var(--ink-dim)] leading-relaxed border-t border-[var(--border)]/30 font-light">
                      {item.a}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </section>
  );
};
