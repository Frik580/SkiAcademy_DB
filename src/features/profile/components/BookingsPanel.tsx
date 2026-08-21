import React from 'react';
import { Booking, Course, Instructor, UserProfile } from '../../../types';
import { ClientBookingsList } from '../../../features/student-cabinet';
import { ScPageIntro } from '../../../features/student-cabinet';
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
      <div className="pt-6">
        <ScPageIntro
          onBack={showBackLink && onGoToTab ? () => onGoToTab('training') : undefined}
          backLabelKey="scNavTraining"
          title={t('scFullCalendar')}
        />
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
        onCancel={onCancel}
        onChat={onChat}
        hasUnreadChat={hasUnreadChat}
      />
    </div>
  );
};
