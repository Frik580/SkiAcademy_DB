import React from 'react';
import { Phone } from 'lucide-react';
import { Booking, Course, Instructor, UserProfile } from '../../../../types';
import { useLanguage } from '../../../../lib/LanguageContext';
import { normalizeTelHref, resolveBookingCoachPhone } from './coachUtils';

interface BookingCallCoachButtonProps {
  booking: Booking;
  courses: Course[];
  instructors?: Instructor[];
  usersList?: UserProfile[];
  variant?: 'text' | 'outline';
  className?: string;
}

export const BookingCallCoachButton: React.FC<BookingCallCoachButtonProps> = ({
  booking,
  courses,
  instructors = [],
  usersList = [],
  variant = 'text',
  className = '',
}) => {
  const { t } = useLanguage();
  const phone = resolveBookingCoachPhone(booking, courses, usersList, instructors);
  if (!phone) return null;

  const baseClass =
    variant === 'outline'
      ? 'px-3 py-1.5 text-xs font-medium border border-[var(--border-subtle)] rounded-lg text-[var(--ink)] hover:border-[var(--accent)] transition inline-flex items-center gap-1.5'
      : 'text-sm font-medium text-[var(--ink)] hover:text-[var(--accent)] transition inline-flex items-center gap-1.5';

  return (
    <a href={normalizeTelHref(phone)} className={`${baseClass} ${className}`.trim()}>
      <Phone className={variant === 'outline' ? 'w-3.5 h-3.5' : 'w-4 h-4'} aria-hidden />
      {t('scCallCoach')}
    </a>
  );
};
