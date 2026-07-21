import React from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { X } from 'lucide-react';
import { Course, UserProfile } from '../types';
import { useLanguage } from '../lib/LanguageContext';
import { Auth } from './Auth';

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
  const { language } = useLanguage();

  if (!isOpen || !course) return null;

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
          className="relative bg-[var(--bg)] border border-[var(--border)] shadow-2xl w-full max-w-md overflow-hidden transition-colors duration-300 rounded-none flex flex-col max-h-[90vh] z-10"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-5 border-b border-[var(--border)] bg-black/10 shrink-0">
            <div>
              <h3 className="font-serif text-lg font-light text-[var(--ink)]">
                {language === 'en' ? 'Course Enrollment' : 'Запись на курс'}
              </h3>
              <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-dim)] mt-0.5">
                {course.title}
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

          {/* Modal body */}
          <div className="p-6 overflow-y-auto space-y-4">
            <p className="text-[11px] font-mono text-[var(--ink-dim)] uppercase tracking-wider text-center leading-relaxed">
              {language === 'en'
                ? 'Sign in or register to complete your enrollment for this group course.'
                : 'Войдите или зарегистрируйтесь, чтобы завершить запись на данный групповой курс.'}
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
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
