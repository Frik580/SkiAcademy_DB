import React from 'react';
import { Star } from 'lucide-react';
import { useInstructorWorkspace } from './useInstructorWorkspace';

interface InstructorReviewsProps {
  workspace: ReturnType<typeof useInstructorWorkspace>;
}

export const InstructorReviews: React.FC<InstructorReviewsProps> = ({ workspace }) => {
  const { t, instructorReviews } = workspace;

  return (
    <div className="space-y-4">
      <h4 className="text-lg font-serif font-light text-[var(--ink)] tracking-tight border-b border-slate-200/80 dark:border-slate-800/80 pb-3">
        {t('instructorFeedback')} ({instructorReviews.length})
      </h4>

      {instructorReviews.length === 0 ? (
        <div className="py-10 border border-dashed border-slate-200 dark:border-slate-800 text-center bg-[var(--card-bg)] rounded-xs font-mono text-xs text-[var(--ink-dim)]">
          {t('instructorNoReviews')}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {instructorReviews.map((rev) => (
            <div
              key={rev.id}
              className="border border-slate-200/70 dark:border-slate-800/70 p-4 space-y-3 bg-[var(--card-bg)] rounded-xs shadow-xs"
            >
              <div className="flex justify-between items-start gap-4">
                <div className="flex items-center gap-2.5">
                  <img
                    src={rev.userAvatar}
                    alt={rev.userName}
                    className="w-8 h-8 rounded-full border border-slate-200/60 dark:border-slate-800/60 object-cover bg-slate-100 dark:bg-slate-800"
                    referrerPolicy="no-referrer"
                  />
                  <div>
                    <h5 className="font-serif text-xs text-[var(--ink)] font-bold leading-none">
                      {rev.userName}
                    </h5>
                    <span className="text-[8px] font-mono text-[var(--ink-dim)] mt-1.5 block">
                      {rev.date}
                    </span>
                  </div>
                </div>
                <div className="flex gap-0.5 text-amber-400">
                  {Array.from({ length: rev.rating }).map((_, i) => (
                    <Star key={i} className="w-3.5 h-3.5 fill-current" />
                  ))}
                </div>
              </div>
              <p className="text-xs text-[var(--ink-dim)] leading-relaxed italic font-mono">
                {'"'}
                {rev.comment}
                {'"'}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
