import React from 'react';
import { Booking, Course, Instructor, UserProfile } from '../../../types';
import { ClientBookingsList } from '../../../features/student-cabinet';
import { StudentPanelBackLink } from '../../../features/student-cabinet';
import { useLanguage } from '../../../app/providers/LanguageContext';
import { StudentCabinetTab } from '../../../features/student-cabinet';

export interface BookingsPanelProps {
  userProfile: UserProfile;
  bookings: Booking[];
  courses?: Course[];
  instructors?: Instructor[];
  usersList?: UserProfile[];
  unreviewedCompletedBookings?: Booking[];
  showWorkoutCalendar?: boolean;
  onDismissReview?: (id: string) => void;
  onReschedule: (booking: Booking) => void;
  onCancel: (booking: Booking) => void;
  onChat: (booking: Booking) => void;
  hasUnreadChat?: (bookingId: string) => boolean;
  onWriteReview: (booking: Booking) => void;
  onOpenLesson: (booking: Booking) => void;
  onGoToTab?: (tab: StudentCabinetTab) => void;
  showBackLink?: boolean;
}

export const BookingsPanel: React.FC<BookingsPanelProps> = ({
  userProfile,
  bookings,
  courses = [],
  instructors = [],
  usersList = [],
  unreviewedCompletedBookings = [],
  showWorkoutCalendar = true,
  onDismissReview,
  onReschedule,
  onCancel,
  onChat,
  hasUnreadChat,
  onWriteReview,
  onOpenLesson,
  onGoToTab,
  showBackLink = true,
}) => {
  const { t } = useLanguage();
  const userBookings = bookings.filter((b) => b.userId === userProfile.uid && !b.isDeleted);

  return (
    <div className="space-y-6 pb-24 max-w-3xl mx-auto px-4 sm:px-6 w-full min-w-0">
      <div className="pt-6 space-y-4">
        {showBackLink && onGoToTab && (
          <StudentPanelBackLink onClick={() => onGoToTab('training')} labelKey="scNavTraining" />
        )}
        <h1 className="text-2xl font-serif font-light text-[var(--ink)]">{t('scFullCalendar')}</h1>
      </div>
      <ClientBookingsList
        userBookings={userBookings}
        courses={courses}
        instructors={instructors}
        usersList={usersList}
        unreviewedCompletedBookings={unreviewedCompletedBookings}
        showWorkoutCalendar={showWorkoutCalendar}
        onDismissReview={onDismissReview}
        onWriteReview={onWriteReview}
        onOpenLesson={onOpenLesson}
        onReschedule={onReschedule}
        onCancel={onCancel}
        onChat={onChat}
        hasUnreadChat={hasUnreadChat}
      />
    </div>
  );
};
