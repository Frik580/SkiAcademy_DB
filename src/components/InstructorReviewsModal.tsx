import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Instructor, Review } from '../types';
import { X, Star, MessageSquare, Calendar, User } from 'lucide-react';
import { useLanguage } from '../lib/LanguageContext';

interface InstructorReviewsModalProps {
  isOpen: boolean;
  onClose: () => void;
  instructor: Instructor | null;
  reviews: Review[];
}

export const InstructorReviewsModal: React.FC<InstructorReviewsModalProps> = ({
  isOpen,
  onClose,
  instructor,
  reviews,
}) => {
  const { t } = useLanguage();
  const [activeInstructor, setActiveInstructor] = React.useState<Instructor | null>(instructor);

  React.useEffect(() => {
    if (instructor) {
      setActiveInstructor(instructor);
    }
  }, [instructor]);

  const targetInstructor = activeInstructor || instructor;
  if (!targetInstructor) return null;

  // Filter reviews for this instructor
  const instructorReviews = reviews.filter((r) => r.instructorId === targetInstructor.id);

  // Calculate stats
  const totalReviews = instructorReviews.length;
  const avgRating =
    totalReviews > 0
      ? (instructorReviews.reduce((sum, r) => sum + r.rating, 0) / totalReviews).toFixed(1)
      : targetInstructor.rating.toFixed(1);

  // Distribution of stars
  const ratingDistribution = [0, 0, 0, 0, 0]; // 1 to 5 stars
  instructorReviews.forEach((r) => {
    const idx = Math.max(1, Math.min(5, Math.round(r.rating))) - 1;
    ratingDistribution[idx]++;
  });

  return (
    <AnimatePresence>
      {isOpen && targetInstructor && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="ui-modal-overlay fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 15 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="ui-modal shadow-2xl w-full max-w-xl overflow-hidden transition-colors duration-300 flex flex-col max-h-[85vh] rounded-2xl bg-[var(--card-bg)] text-[var(--ink)] border border-[var(--border)] relative"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-[var(--border)] bg-black/5 dark:bg-white/5 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 overflow-hidden bg-black/5 dark:bg-white/5 border border-[var(--border)] rounded-full shrink-0 filter grayscale">
                  <img
                    src={targetInstructor.avatarUrl}
                    alt={targetInstructor.name}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div>
                  <h3 className="font-serif text-lg font-light text-[var(--ink)]">
                    {t('reviewsForInstructor')} {targetInstructor.name}
                  </h3>
                  <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-dim)] mt-0.5">
                    {targetInstructor.experienceYears} {t('yearsOfCoachingExperience')}
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2 rounded-full hover:bg-[var(--profile-bg)] transition-colors text-[var(--ink-dim)] hover:text-[var(--ink)] cursor-pointer z-10"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content Area with scroll */}
            <div className="p-6 overflow-y-auto space-y-6 flex-1">
              {/* Summary / Stats Block */}
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-5 bg-black/5 dark:bg-white/5 p-4 border border-[var(--border)] rounded-xl">
                {/* Big Rating */}
                <div className="sm:col-span-5 flex flex-col items-center justify-center text-center sm:border-r border-[var(--border)] pr-2 font-mono">
                  <span className="text-4xl font-light text-[var(--ink)] leading-none">
                    {avgRating}
                  </span>
                  <div className="flex items-center gap-0.5 mt-2 text-amber-500">
                    {[1, 2, 3, 4, 5].map((star) => {
                      const val = Number(avgRating);
                      const isFilled = star <= Math.round(val);
                      return (
                        <Star
                          key={star}
                          className={`w-3.5 h-3.5 ${isFilled ? 'fill-amber-400 stroke-amber-500' : 'text-slate-200 dark:text-slate-700'}`}
                        />
                      );
                    })}
                  </div>
                  <span className="text-[10px] text-[var(--ink-dim)] uppercase tracking-wider mt-2.5 font-medium flex items-center gap-1">
                    <MessageSquare className="w-3 h-3" />
                    {totalReviews} {t('reviewsTotal')}
                  </span>
                </div>

                {/* Progress distribution bars */}
                <div className="sm:col-span-7 flex flex-col justify-center space-y-1.5 font-mono text-[10px]">
                  {[5, 4, 3, 2, 1].map((stars) => {
                    const count = ratingDistribution[stars - 1];
                    const percentage = totalReviews > 0 ? (count / totalReviews) * 100 : 0;
                    return (
                      <div key={stars} className="flex items-center gap-2.5 text-[var(--ink-dim)]">
                        <span className="w-3 text-right font-semibold">{stars}</span>
                        <Star className="w-3 h-3 fill-amber-400 stroke-amber-500 text-amber-500 shrink-0" />
                        <div className="flex-1 h-1.5 bg-black/20 dark:bg-white/10 overflow-hidden rounded-none">
                          <div
                            className="h-full bg-[var(--ink)] transition-all duration-500"
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                        <span className="w-6 text-right font-medium text-[var(--ink-dim)]">
                          {count}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* List of individual reviews */}
              <div className="space-y-4">
                <h4 className="text-[10px] font-mono text-[var(--ink-dim)] uppercase tracking-wider">
                  {t('reviewFeed')}
                </h4>

                {instructorReviews.length === 0 ? (
                  <div className="py-12 text-center border border-dashed border-[var(--border)] rounded-none bg-black/5">
                    <MessageSquare className="w-8 h-8 text-[var(--ink-dim)] mx-auto mb-2 opacity-55" />
                    <p className="text-xs text-[var(--ink)] font-mono">
                      {t('noInstructorWrittenReviews')}
                    </p>
                    <p className="text-[10px] text-[var(--ink-dim)] font-mono mt-1 uppercase tracking-wider">
                      {t('firstInstructorReviewPrompt')}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {instructorReviews.map((rev) => (
                      <div
                        key={rev.id}
                        className="p-4 bg-black/5 border border-[var(--border)] rounded-none flex flex-col space-y-2.5 transition duration-300 hover:border-[var(--ink-dim)]"
                      >
                        {/* Review Header: User details, rating and date */}
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-none overflow-hidden bg-black/15 border border-[var(--border)] flex items-center justify-center shrink-0">
                              {rev.userAvatar ? (
                                <img
                                  src={rev.userAvatar}
                                  alt={rev.userName}
                                  className="w-full h-full object-cover filter grayscale"
                                />
                              ) : (
                                <User className="w-4 h-4 text-[var(--ink-dim)]" />
                              )}
                            </div>
                            <div>
                              <div className="text-xs font-bold text-[var(--ink)]">
                                {rev.userName || 'Anonymous'}
                              </div>
                              <div className="flex items-center gap-0.5 text-amber-500 mt-0.5">
                                {[1, 2, 3, 4, 5].map((star) => (
                                  <Star
                                    key={star}
                                    className={`w-3 h-3 ${star <= rev.rating ? 'fill-amber-400 stroke-amber-500' : 'text-slate-200 dark:text-slate-700'}`}
                                  />
                                ))}
                              </div>
                            </div>
                          </div>
                          <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-dim)] flex items-center gap-1 shrink-0">
                            <Calendar className="w-3 h-3" />
                            {rev.date}
                          </span>
                        </div>

                        {/* Review text comment */}
                        <p className="text-xs text-[var(--ink)] leading-relaxed pl-10">
                          {rev.comment}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-[var(--border)] bg-black/10 flex justify-end shrink-0">
              <button
                onClick={onClose}
                className="px-4 py-2 border border-[var(--border)] bg-[var(--ink)] hover:bg-transparent text-[var(--bg)] hover:text-[var(--ink)] rounded-none text-xs font-mono uppercase tracking-widest transition cursor-pointer"
              >
                {t('closeBtn')}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
