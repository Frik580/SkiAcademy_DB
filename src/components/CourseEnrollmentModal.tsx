import React, { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import confetti from 'canvas-confetti';
import { X, User, Phone, Mail, Send, Loader2 } from 'lucide-react';
import { Course, UserProfile, Booking } from '../types';
import { useLanguage, getGroupCourseLabel, getGroupScheduleLabel } from '../lib/LanguageContext';
import { db, setDoc, doc } from '../lib/firebase';
import { useNotifications } from './PushNotificationHub';
import { Auth } from './Auth';
import { logger } from '../lib/logger';

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
      await setDoc(doc(db, 'bookings', guestBooking.id), guestBooking);
      addNotification(
        'success',
        t('guestApplicationSuccess'),
        t('guestApplicationSuccessDesc')
      );
      confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
      onClose();
    } catch (err) {
      logger.error('Error submitting guest course booking:', err);
      try {
        const existingStr = localStorage.getItem('alpine_glide_bookings_admin');
        const existing: Booking[] = existingStr ? JSON.parse(existingStr) : [];
        existing.push(guestBooking);
        localStorage.setItem('alpine_glide_bookings_admin', JSON.stringify(existing));
        addNotification(
          'success',
          t('guestApplicationSuccess'),
          t('guestApplicationSuccessDesc')
        );
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
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        {/* Backdrop overlay */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/75 backdrop-blur-md"
        />

        {/* Content Container */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="relative bg-[var(--bg)] border border-[var(--border)] shadow-2xl w-full max-w-lg overflow-hidden transition-colors duration-300 rounded-none flex flex-col max-h-[90vh] z-10"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-5 border-b border-[var(--border)] bg-black/10 shrink-0">
            <div>
              <h3 className="font-serif text-lg font-light text-[var(--ink)]">
                {t('courseEnrollment')}
              </h3>
              <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-dim)] mt-0.5">
                {getGroupCourseLabel(course.title, language)} • ${course.price}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 border border-[var(--border)] bg-black/5 hover:border-[var(--ink)] hover:bg-black/10 text-[var(--ink-dim)] hover:text-[var(--ink)] transition cursor-pointer rounded-none"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Navigation Tabs */}
          <div className="grid grid-cols-2 border-b border-[var(--border)] bg-black/5 font-mono text-xs shrink-0">
            <button
              type="button"
              onClick={() => setUnauthTab('guest')}
              className={`py-2.5 px-3 text-center font-bold uppercase tracking-wider transition cursor-pointer ${
                unauthTab === 'guest'
                  ? 'bg-[var(--bg)] text-[var(--ink)] border-b-2 border-sky-600 dark:border-sky-400'
                  : 'text-[var(--ink-dim)] hover:text-[var(--ink)]'
              }`}
            >
              📝 {t('guestBookingTab')}
            </button>
            <button
              type="button"
              onClick={() => setUnauthTab('auth')}
              className={`py-2.5 px-3 text-center font-bold uppercase tracking-wider transition cursor-pointer ${
                unauthTab === 'auth'
                  ? 'bg-[var(--bg)] text-[var(--ink)] border-b-2 border-sky-600 dark:border-sky-400'
                  : 'text-[var(--ink-dim)] hover:text-[var(--ink)]'
              }`}
            >
              🔐 {t('authTab')}
            </button>
          </div>

          {/* Modal body */}
          <div className="p-6 overflow-y-auto space-y-4">
            {unauthTab === 'auth' ? (
              <div className="space-y-4">
                <p className="text-[11px] font-mono text-[var(--ink-dim)] uppercase tracking-wider text-center leading-relaxed">
                  {t('courseEnrollmentAuthPrompt')}
                </p>

                <div className="border border-[var(--border)] p-4 bg-black/10">
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
                <div className="bg-amber-500/10 border border-amber-500/30 p-3 text-[11px] font-mono text-amber-700 dark:text-amber-300 leading-relaxed">
                  💡 {t('guestBookingNotice')}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-dim)] flex items-center gap-1">
                      <User className="w-3 h-3" /> {t('guestNameLabel')} *
                    </label>
                    <input
                      type="text"
                      required
                      value={guestName}
                      onChange={(e) => setGuestName(e.target.value)}
                      placeholder={t('guestNamePlaceholder')}
                      className="w-full px-3 py-2 border border-[var(--border)] text-xs bg-transparent text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] transition rounded-none font-sans"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-dim)] flex items-center gap-1">
                      <Phone className="w-3 h-3" /> {t('guestPhoneLabel')} *
                    </label>
                    <input
                      type="tel"
                      required
                      value={guestPhone}
                      onChange={(e) => setGuestPhone(e.target.value)}
                      placeholder={t('guestPhonePlaceholder')}
                      className="w-full px-3 py-2 border border-[var(--border)] text-xs bg-transparent text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] transition rounded-none font-mono"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-dim)] flex items-center gap-1">
                    <Mail className="w-3 h-3" /> {t('guestEmailLabel')}
                  </label>
                  <input
                    type="email"
                    value={guestEmail}
                    onChange={(e) => setGuestEmail(e.target.value)}
                    placeholder={t('guestEmailPlaceholder')}
                    className="w-full px-3 py-2 border border-[var(--border)] text-xs bg-transparent text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] transition rounded-none font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-dim)]">
                    {t('personalGoalsNotes')}
                  </label>
                  <textarea
                    value={guestNotes}
                    onChange={(e) => setGuestNotes(e.target.value)}
                    placeholder={t('personalGoalsPlaceholder')}
                    className="w-full px-3 py-2 border border-[var(--border)] text-xs bg-transparent text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] transition h-14 resize-none rounded-none"
                  />
                </div>

                <div className="bg-black/10 rounded-none p-3 border border-[var(--border)] space-y-1">
                  <div className="flex justify-between items-baseline">
                    <span className="text-xs font-mono uppercase tracking-widest text-[var(--ink)]">{t('courseTotalTuition')}</span>
                    <span className="text-lg font-extrabold text-sky-600 dark:text-sky-400 font-mono">${course.price}</span>
                  </div>
                  <div className="text-[10px] font-mono text-[var(--ink-dim)]">
                    📅 {course.dates}
                  </div>
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
