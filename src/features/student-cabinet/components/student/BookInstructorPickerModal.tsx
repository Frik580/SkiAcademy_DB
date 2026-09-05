import React, { useMemo } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Star, X } from 'lucide-react';
import { Booking, Instructor, UserProfile } from '../../../../types';
import { useLanguage, translateInstructor } from '../../../../app/providers/LanguageContext';
import { useCurrency } from '../../../../app/providers/CurrencyContext';
import { getInstructorPickerGroups } from './studentCabinetUtils';
import { BodyScrollLock } from '../../../../ui/BodyScrollLock';

interface BookInstructorPickerModalProps {
  open: boolean;
  onClose: () => void;
  userProfile: UserProfile;
  bookings: Booking[];
  instructors: Instructor[];
  onSelectInstructor: (instructor: Instructor) => void;
  onBrowseCourses?: () => void;
}

export const BookInstructorPickerModal: React.FC<BookInstructorPickerModalProps> = ({
  open,
  onClose,
  userProfile,
  bookings,
  instructors,
  onSelectInstructor,
  onBrowseCourses,
}) => {
  const { language, t } = useLanguage();
  const { formatPrice } = useCurrency();
  const lang = language === 'ru' ? 'ru' : 'en';

  const groups = useMemo(
    () =>
      getInstructorPickerGroups(userProfile, bookings, instructors).map((group) => ({
        ...group,
        instructors: group.instructors.map((ins) => translateInstructor(ins, lang)),
      })),
    [userProfile, bookings, instructors, lang]
  );

  const hasInstructors = groups.some((group) => group.instructors.length > 0);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <div
          key="book-instructor-picker"
          data-instructor-picker-modal="true"
          className="fixed inset-0 z-[70] overflow-hidden"
          role="presentation"
        >
          <BodyScrollLock />
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="ui-modal-overlay fixed inset-0 h-[100dvh] w-screen max-w-none !rounded-none border-0"
            aria-hidden
          />

          <div className="fixed inset-0 z-10 flex items-end sm:items-center justify-center p-0 sm:p-6 pointer-events-none">
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 24 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              className="pointer-events-auto relative w-full max-w-lg max-h-[80vh] overflow-hidden rounded-t-2xl sm:rounded-2xl bg-[var(--card-bg)] text-[var(--ink)] border border-[var(--border)] shadow-2xl flex flex-col"
              role="dialog"
              aria-modal="true"
              aria-labelledby="book-instructor-picker-title"
            >
              <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-[var(--border)] shrink-0">
                <div className="min-w-0">
                  <h3 id="book-instructor-picker-title" className="text-lg font-serif font-light">
                    {t('scChooseInstructor')}
                  </h3>
                  <p className="text-sm text-[var(--ink-dim)] mt-0.5">
                    {t('scChooseInstructorSub')}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="p-2 rounded-full hover:bg-[var(--profile-bg)] transition-colors text-[var(--ink-dim)] hover:text-[var(--ink)] shrink-0"
                  aria-label={t('closeBtn')}
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="overflow-y-auto flex-1 px-5 py-4 space-y-5">
                {!hasInstructors ? (
                  <p className="text-sm text-[var(--ink-dim)] py-4 text-center">
                    {t('scNoAvailableInstructors')}
                  </p>
                ) : (
                  groups.map((group) => (
                    <section key={group.id} className="space-y-2">
                      <div>
                        <p className="text-xs font-medium tracking-widest uppercase text-[var(--ink-dim)]">
                          {t(group.labelKey)}
                        </p>
                        {group.subtitleKey && (
                          <p className="text-xs text-[var(--ink-dim)] mt-0.5">
                            {t(group.subtitleKey)}
                          </p>
                        )}
                      </div>
                      <ul className="space-y-2">
                        {group.instructors.map((instructor) => (
                          <li key={instructor.id}>
                            <button
                              type="button"
                              disabled={!instructor.isAvailable}
                              onClick={() => {
                                onSelectInstructor(instructor);
                                onClose();
                              }}
                              className={`w-full flex items-center gap-3 rounded-xl border px-3 py-3 text-left transition ${
                                instructor.isAvailable
                                  ? 'border-[var(--border-subtle)] hover:border-[var(--accent)] hover:bg-[var(--accent)]/5'
                                  : 'border-[var(--border-subtle)] opacity-55 cursor-not-allowed'
                              }`}
                            >
                              <img
                                src={instructor.avatarUrl}
                                alt=""
                                className="h-12 w-12 rounded-full object-cover shrink-0 bg-[var(--border-subtle)]"
                              />
                              <span className="flex-1 min-w-0">
                                <span className="block text-sm font-medium text-[var(--ink)] truncate">
                                  {instructor.name}
                                </span>
                                <span className="flex items-center gap-2 text-xs text-[var(--ink-dim)] mt-0.5">
                                  <span className="inline-flex items-center gap-0.5">
                                    <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
                                    {instructor.rating.toFixed(1)}
                                  </span>
                                  <span>
                                    {instructor.pricePerHourKZT != null &&
                                    Number.isFinite(instructor.pricePerHourKZT)
                                      ? formatPrice(instructor.pricePerHourKZT)
                                      : '—'}
                                    /{t('hr')}
                                  </span>
                                </span>
                              </span>
                              <span className="text-xs font-medium text-[var(--accent)] shrink-0">
                                {instructor.isAvailable
                                  ? t(group.bookLabelKey ?? 'bookNow')
                                  : t('instructorFull')}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </section>
                  ))
                )}
              </div>

              {onBrowseCourses && (
                <div className="shrink-0 px-5 py-4 border-t border-[var(--border)]">
                  <button
                    type="button"
                    onClick={() => {
                      onBrowseCourses();
                      onClose();
                    }}
                    className="w-full text-sm font-medium text-[var(--ink-dim)] hover:text-[var(--accent)] transition"
                  >
                    {t('scBrowseCourses')} →
                  </button>
                </div>
              )}
            </motion.div>
          </div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
};
