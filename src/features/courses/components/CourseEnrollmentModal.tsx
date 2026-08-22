import React, { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import confetti from 'canvas-confetti';
import { X, User, Phone, Mail, Send, Loader2 } from 'lucide-react';
import { Course, UserProfile } from '../../../types';
import { useLanguage, getGroupCourseLabel } from '../../../app/providers/LanguageContext';
import { useCurrency } from '../../../app/providers/CurrencyContext';
import { useNotifications } from '../../../features/notifications';
import { Auth } from '../../../features/auth';
import { AuthModeSliderSwitch } from '../../../features/bookings';
import { BodyScrollLock } from '../../../ui/BodyScrollLock';
import { createGuestCourseEnrollmentViaCallable } from '../../../features/courses/createGuestCourseEnrollmentCallable';

interface CourseEnrollmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  course: Course | null;
  onAuthSuccess?: (profile: UserProfile) => void;
  onEnroll: (courseId: string, customProfile?: UserProfile) => void;
}

export const CourseEnrollmentModal: React.FC<CourseEnrollmentModalProps> = ({
  isOpen,
  onClose,
  course,
  onAuthSuccess,
  onEnroll,
}) => {
  const { t, language } = useLanguage();
  const { formatPrice } = useCurrency();
  const { addNotification } = useNotifications();

  const [unauthTab, setUnauthTab] = useState<'guest' | 'auth'>('guest');
  const [guestName, setGuestName] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [guestNotes, setGuestNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isSubmittingRef = useRef(false);
  const guestEnrollmentAttemptKeyRef = useRef<string | null>(null);

  useEffect(() => {
    guestEnrollmentAttemptKeyRef.current = null;
  }, [course?.id, isOpen]);

  if (!course || typeof document === 'undefined') return null;

  const handleSubmitGuest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmittingRef.current || isSubmitting) return;
    if (!guestName.trim()) {
      addNotification('warning', t('missingDetails'), t('guestNameLabel'));
      return;
    }
    if (!guestPhone.trim()) {
      addNotification('warning', t('missingDetails'), t('guestPhoneLabel'));
      return;
    }

    isSubmittingRef.current = true;
    setIsSubmitting(true);
    const idempotencyKey = guestEnrollmentAttemptKeyRef.current ?? crypto.randomUUID();
    guestEnrollmentAttemptKeyRef.current = idempotencyKey;

    try {
      await createGuestCourseEnrollmentViaCallable({
        courseId: course.id,
        guestName: guestName.trim(),
        guestPhone: guestPhone.trim(),
        guestEmail: guestEmail.trim(),
        guestNotes: guestNotes.trim(),
        language,
        idempotencyKey,
      });
      addNotification('success', t('guestApplicationSuccess'), t('guestApplicationSuccessDesc'));
      confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
      onClose();
    } catch (err) {
      addNotification('error', t('bookingError'), t('bookingRecordFailed'));
    } finally {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div
          data-course-enrollment-modal="true"
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
            aria-hidden="true"
          />

          <div className="pointer-events-none fixed inset-0 z-10 flex items-end justify-center p-0 sm:items-center sm:p-6">
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 24 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              role="dialog"
              aria-modal="true"
              aria-labelledby="course-enrollment-modal-title"
              className="ui-modal pointer-events-auto relative z-10 flex max-h-[80vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl rounded-b-none border border-[var(--border)] bg-[var(--card-bg)] text-[var(--ink)] shadow-2xl transition-colors duration-300 rounded-t-[var(--radius)] rounded-b-none sm:rounded-2xl sm:rounded-[var(--radius)]"
              onClick={(e) => e.stopPropagation()}
            >
              <div
                className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-[var(--border)] sm:hidden"
                aria-hidden="true"
              />
              {/* Header */}
              <div className="flex items-center justify-between p-5 border-b border-[var(--border)] bg-black/5 dark:bg-white/5 shrink-0">
                <div>
                  <h3
                    id="course-enrollment-modal-title"
                    className="font-serif text-lg font-light text-[var(--ink)]"
                  >
                    {t('courseEnrollment')}
                  </h3>
                  <p className="text-xs text-[var(--ink-dim)] mt-0.5">
                    {getGroupCourseLabel(course.title, language)} •{' '}
                    {formatPrice(course.price, course.priceKZT)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="p-2 rounded-full hover:bg-black/10 dark:hover:bg-white/10 transition-colors text-[var(--ink-dim)] hover:text-[var(--ink)] cursor-pointer z-10"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Navigation Slider Switch */}
              <div className="px-4 py-2 border-b border-[var(--border)] bg-black/5 dark:bg-white/5 shrink-0">
                <AuthModeSliderSwitch
                  unauthTab={unauthTab}
                  onChange={setUnauthTab}
                  guestLabel={t('guestBookingTab')}
                  authLabel={t('authTab')}
                />
              </div>

              {/* Modal body */}
              <div className="p-5 md:p-6 overflow-y-auto space-y-4 flex-1 min-h-0">
                {unauthTab === 'auth' ? (
                  <div className="space-y-4">
                    <p className="text-xs text-[var(--ink-dim)] text-center leading-relaxed">
                      {t('courseEnrollmentAuthPrompt')}
                    </p>

                    <div className="border border-[var(--border)] p-4 bg-transparent rounded-none rounded-[var(--radius-md)]">
                      <Auth
                        onSuccess={(profile) => {
                          onAuthSuccess?.(profile);
                          onEnroll(course.id, profile);
                          onClose();
                        }}
                      />
                    </div>
                  </div>
                ) : (
                  <form onSubmit={handleSubmitGuest} className="space-y-4">
                    <div className="p-3 bg-[var(--accent-muted)] border border-[var(--border)] text-xs text-[var(--ink)] leading-relaxed rounded-none rounded-[var(--radius-md)]">
                      💡 {t('guestBookingNotice')}
                    </div>

                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-2.5 sm:gap-3 items-end">
                        <div className="flex flex-col justify-end">
                          <label className="uppercase tracking-wider text-[var(--ink-dim)] flex items-center gap-1.5 mb-1 font-sans text-xs min-h-[20px]">
                            <User className="w-3.5 h-3.5 shrink-0" />{' '}
                            <span className="truncate">{t('guestNameLabel')} *</span>
                          </label>
                          <input
                            type="text"
                            required
                            value={guestName}
                            onChange={(e) => setGuestName(e.target.value)}
                            placeholder={t('guestNamePlaceholder')}
                            className="ui-field-plain focus:outline-none focus:border-[var(--ink)] focus:border-[var(--accent)]"
                          />
                        </div>
                        <div className="flex flex-col justify-end">
                          <label className="uppercase tracking-wider text-[var(--ink-dim)] flex items-center gap-1.5 mb-1 font-sans text-xs min-h-[20px]">
                            <Phone className="w-3.5 h-3.5 shrink-0" />{' '}
                            <span className="truncate">{t('guestPhoneLabel')} *</span>
                          </label>
                          <input
                            type="tel"
                            required
                            value={guestPhone}
                            onChange={(e) => setGuestPhone(e.target.value)}
                            placeholder={t('guestPhonePlaceholder')}
                            className="ui-field-plain focus:outline-none focus:border-[var(--ink)] focus:border-[var(--accent)]"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="uppercase tracking-wider text-[var(--ink-dim)] flex items-center gap-1.5 mb-1 font-sans text-xs">
                          <Mail className="w-3.5 h-3.5" /> {t('guestEmailLabel')}
                        </label>
                        <input
                          type="email"
                          value={guestEmail}
                          onChange={(e) => setGuestEmail(e.target.value)}
                          placeholder={t('guestEmailPlaceholder')}
                          className="ui-field-plain focus:outline-none focus:border-[var(--ink)] focus:border-[var(--accent)]"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="uppercase tracking-wider text-[var(--ink-dim)] flex items-center gap-1.5 mb-1 font-sans text-xs">
                        {t('guestCourseNotes')}
                      </label>
                      <textarea
                        value={guestNotes}
                        onChange={(e) => setGuestNotes(e.target.value)}
                        placeholder={t('personalGoalsPlaceholder')}
                        className="ui-field-plain focus:outline-none focus:border-[var(--ink)] focus:border-[var(--accent)] h-16 resize-none"
                      />
                    </div>

                    <div className="p-3.5 border border-[var(--border)] bg-black/5 dark:bg-white/5 rounded-none rounded-[var(--radius-md)] space-y-1">
                      <div className="flex justify-between items-baseline">
                        <span className="text-xs text-[var(--ink)] font-sans normal-case text-sm">
                          {t('courseTotalTuition')}
                        </span>
                        <span className="text-lg font-extrabold text-[var(--accent)] font-sans">
                          {formatPrice(course.price, course.priceKZT)}
                        </span>
                      </div>
                      <div className="text-xs text-[var(--ink-dim)]">📅 {course.dates}</div>
                    </div>

                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="btn-primary w-full py-3 flex items-center justify-center gap-2"
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          {t('submitting')}
                        </>
                      ) : (
                        <>
                          <Send className="w-3.5 h-3.5" />
                          {t('submitGuestCourseApplication')}
                        </>
                      )}
                    </button>
                  </form>
                )}
              </div>
            </motion.div>
          </div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
};
