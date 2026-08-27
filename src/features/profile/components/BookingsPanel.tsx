import React from 'react';
import { Course, Instructor, UserProfile } from '../../../types';
import type { LessonBookingCabinetItem } from '../../../features/lesson-bookings/lessonBookingContracts';
import type { BookingProposalCabinetItem } from '../../../features/booking-collaboration';
import { ClientBookingsList } from '../../../features/student-cabinet';
import { CustomerProposalInbox } from '../../../features/booking-collaboration';
import { ScPageIntro } from '../../../features/student-cabinet';
import { useLanguage } from '../../../app/providers/LanguageContext';
import { StudentCabinetTab } from '../../../features/student-cabinet';

export interface BookingsPanelProps {
  userProfile: UserProfile;
  bookings: LessonBookingCabinetItem[];
  courses?: Course[];
  instructors?: Instructor[];
  usersList?: UserProfile[];
  unreviewedCompletedBookings?: LessonBookingCabinetItem[];
  showWorkoutCalendar?: boolean;
  onDismissReview?: (id: string) => void;
  onCancel: (booking: LessonBookingCabinetItem) => void;
  onChat: (booking: LessonBookingCabinetItem) => void;
  hasUnreadChat?: (bookingId: string) => boolean;
  onWriteReview: (booking: LessonBookingCabinetItem) => void;
  onOpenLesson: (booking: LessonBookingCabinetItem) => void;
  onGoToTab?: (tab: StudentCabinetTab) => void;
  showBackLink?: boolean;
  collaborationProposals?: readonly BookingProposalCabinetItem[];
  onAcceptProposal?: (proposal: BookingProposalCabinetItem) => void | Promise<void>;
  onDeclineProposal?: (proposal: BookingProposalCabinetItem) => void | Promise<void>;
  proposalSubmittingId?: string;
  onWithdrawCancellation?: (booking: LessonBookingCabinetItem) => void | Promise<void>;
  onRescheduleBooking?: (booking: LessonBookingCabinetItem) => void;
  collaborationSubmittingId?: string;
}

export const BookingsPanel: React.FC<BookingsPanelProps> = ({
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
  collaborationProposals = [],
  onAcceptProposal,
  onDeclineProposal,
  proposalSubmittingId,
  onWithdrawCancellation,
  onRescheduleBooking,
  collaborationSubmittingId,
}) => {
  const { t } = useLanguage();
  const userBookings = bookings;

  return (
    <div className="space-y-6 pb-24 max-w-3xl mx-auto px-4 sm:px-6 w-full min-w-0">
      <div className="pt-6">
        <ScPageIntro
          onBack={showBackLink && onGoToTab ? () => onGoToTab('training') : undefined}
          backLabelKey="scNavTraining"
          title={t('scFullCalendar')}
        />
      </div>
      {onAcceptProposal && onDeclineProposal && (
        <CustomerProposalInbox
          proposals={collaborationProposals}
          onAccept={onAcceptProposal}
          onDecline={onDeclineProposal}
          submittingProposalId={proposalSubmittingId}
        />
      )}
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
        onWithdrawCancellation={onWithdrawCancellation}
        onRescheduleBooking={onRescheduleBooking}
        collaborationSubmittingId={collaborationSubmittingId}
      />
    </div>
  );
};
