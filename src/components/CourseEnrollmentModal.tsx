import React, { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import confetti from 'canvas-confetti';
import { X, User, Phone, Mail, Send, Loader2 } from 'lucide-react';
import { Course, UserProfile, Booking } from '../types';
import { useLanguage, getGroupCourseLabel, getGroupScheduleLabel } from '../lib/LanguageContext';
import { useCurrency } from '../lib/CurrencyContext';
import { db, setDoc, doc } from '../lib/firebase';
import { withBookingCreatedAt } from '../lib/bookingCreatedAt';
import { useNotifications } from './PushNotificationHub';
import { Auth } from './Auth';
import { AuthModeSliderSwitch } from './booking_modal/AuthModeSliderSwitch';
import { logger } from '../lib/logger';
import { BodyScrollLock } from './ui/BodyScrollLock';

interface CourseEnrollmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  course: Course | null;
  onAuthSuccess: (profile: UserProfile) => void;
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

  if (!isOpen || !course) return null;

  const handleSubmitGuest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!guestName.trim()) {
      addNotification('warning', t('missingDetails'), t('guestNameLabel'));
      return;
    }
    if (!guestPhone.trim()) {
      addNotification('warning', t('missingDetails'), t('guestPhoneLabel'));
      return;
    }

    setIsSubmitting(true);
    const localizedTitle = getGroupCourseLabel(course.title, language);
    const datePart = course.dates.split('•')[0]?.trim() || course.dates;
    const schedulePart = getGroupScheduleLabel(language);

    const guestBooking: Booking = {
      id: `guest_course_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      userId: `guest_${Date.now()}`,
      courseId: course.id,
      instructorId: `course_${course.id}`,
      instructorName: `${t('guestCourseRequestPrefix')} ${localizedTitle}`,
      instructorAvatar: course.bgImageUrl || '',
      date: datePart,
      time: schedulePart,
      durationHours: 10,
      totalPrice: course.price,
      status: 'pending',
      difficulty: 'intermediate',
      notes: guestNotes.trim()
        ? `Заявка на курс "${localizedTitle}". Пожелания: ${guestNotes.trim()}`
        : `Заявка на курс "${localizedTitle}"`,
      isGuest: true,
      guestName: guestName.trim(),
      guestPhone: guestPhone.trim(),
      guestEmail: guestEmail.trim(),
    };

    try {
      await setDoc(doc(db, 'bookings', guestBooking.id), withBookingCreatedAt(guestBooking));
      addNotification('success', t('guestApplicationSuccess'), t('guestApplicationSuccessDesc'));
      confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
      onClose();
    } catch (err) {
      logger.error('Error submitting guest course booking:', err);
      try {
        const existingStr = localStorage.getItem('alpine_glide_bookings_admin');
        const existing: Booking[] = existingStr ? JSON.parse(existingStr) : [];
        existing.push(guestBooking);
        localStorage.setItem('alpine_glide_bookings_admin', JSON.stringify(existing));
        addNotification('success', t('guestApplicationSuccess'), t('guestApplicationSuccessDesc'));
        confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
        onClose();
      } catch {
        addNotification('error', t('bookingError'), t('bookingRecordFailed'));
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
        <BodyScrollLock />
        {/* Backdrop overlay */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="ui-modal-overlay absolute inset-0"
        />

        {/* Content Container */}
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 12 }}
          transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          className="ui-modal relative shadow-2xl w-full max-w-lg overflow-hidden transition-colors duration-300 flex flex-col max-h-[80vh] z-10 rounded-none theme-air:rounded-[var(--radius)] bg-[var(--card-bg)] text-[var(--ink)] border border-[var(--border)] m-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-5 border-b border-[var(--border)] bg-black/5 dark:bg-white/5 shrink-0">
            <div>
              <h3 className="font-serif text-lg font-light text-[var(--ink)]">
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

                <div className="border border-[var(--border)] p-4 bg-transparent rounded-none theme-air:rounded-[var(--radius-md)]">
                  <Auth
                    onSuccess={(profile) => {
                      onAuthSuccess(profile);
                      onEnroll(course.id, profile);
                      onClose();
                    }}
                  />
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmitGuest} className="space-y-4">
                <div className="p-3 bg-[var(--accent-muted)] border border-[var(--border)] text-xs text-[var(--ink)] leading-relaxed rounded-none theme-air:rounded-[var(--radius-md)]">
                  💡 {t('guestBookingNotice')}
                </div>

                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2.5 sm:gap-3 items-end">
                    <div className="flex flex-col justify-end">
                      <label className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-dim)] flex items-center gap-1.5 mb-1 theme-air:font-sans theme-air:text-xs min-h-[20px]">
                        <User className="w-3.5 h-3.5 shrink-0" />{' '}
                        <span className="truncate">{t('guestNameLabel')} *</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={guestName}
                        onChange={(e) => setGuestName(e.target.value)}
                        placeholder={t('guestNamePlaceholder')}
                        className="ui-field-plain focus:outline-none focus:border-[var(--ink)] theme-air:focus:border-[var(--accent)]"
                      />
                    </div>
                    <div className="flex flex-col justify-end">
                      <label className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-dim)] flex items-center gap-1.5 mb-1 theme-air:font-sans theme-air:text-xs min-h-[20px]">
                        <Phone className="w-3.5 h-3.5 shrink-0" />{' '}
                        <span className="truncate">{t('guestPhoneLabel')} *</span>
                      </label>
                      <input
                        type="tel"
                        required
                        value={guestPhone}
                        onChange={(e) => setGuestPhone(e.target.value)}
                        placeholder={t('guestPhonePlaceholder')}
                        className="ui-field-plain focus:outline-none focus:border-[var(--ink)] theme-air:focus:border-[var(--accent)]"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-dim)] flex items-center gap-1.5 mb-1 theme-air:font-sans theme-air:text-xs">
                      <Mail className="w-3.5 h-3.5" /> {t('guestEmailLabel')}
                    </label>
                    <input
                      type="email"
                      value={guestEmail}
                      onChange={(e) => setGuestEmail(e.target.value)}
                      placeholder={t('guestEmailPlaceholder')}
                      className="ui-field-plain focus:outline-none focus:border-[var(--ink)] theme-air:focus:border-[var(--accent)]"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-dim)] flex items-center gap-1.5 mb-1 theme-air:font-sans theme-air:text-xs">
                    {t('personalGoalsNotes')}
                  </label>
                  <textarea
                    value={guestNotes}
                    onChange={(e) => setGuestNotes(e.target.value)}
                    placeholder={t('personalGoalsPlaceholder')}
                    className="ui-field-plain focus:outline-none focus:border-[var(--ink)] theme-air:focus:border-[var(--accent)] h-16 resize-none"
                  />
                </div>

                <div className="p-3.5 border border-[var(--border)] bg-black/5 dark:bg-white/5 rounded-none theme-air:rounded-[var(--radius-md)] space-y-1">
                  <div className="flex justify-between items-baseline">
                    <span className="text-xs font-mono uppercase tracking-widest text-[var(--ink)] theme-air:font-sans theme-air:normal-case theme-air:text-sm">
                      {t('courseTotalTuition')}
                    </span>
                    <span className="text-lg font-extrabold text-[var(--accent)] font-mono theme-air:font-sans">
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
    </AnimatePresence>
  );
};
