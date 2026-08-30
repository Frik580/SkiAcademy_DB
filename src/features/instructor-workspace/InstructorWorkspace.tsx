import React from 'react';
import { UserProfile, Instructor, Booking, Review, Course } from '../../types';
import { SkillConfig } from '../../domain/achievements';
import { BookingChatModal } from '../bookings/components/BookingChatModal';
import { StudentSkillEvaluationModal } from '../profile/components/StudentSkillEvaluationModal';
import { useInstructorWorkspace } from './components/useInstructorWorkspace';
import { InstructorNotLinked } from './components/InstructorNotLinked';
import { InstructorDashboardHeader } from './components/InstructorDashboardHeader';
import { InstructorBookingList } from './components/InstructorBookingList';
import { InstructorCourseSection } from './components/InstructorCourseSection';
import { InstructorStudents } from './components/InstructorStudents';
import { InstructorReviews } from './components/InstructorReviews';
import { useNotifications } from '../notifications';
import { useLanguage } from '../../app/providers/LanguageContext';
import { CreateProposalModal, useInstructorBookingCollaboration } from '../booking-collaboration';

export interface InstructorWorkspaceProps {
  userProfile: UserProfile;
  instructors: Instructor[];
  allBookings: Booking[];
  reviews: Review[];
  courses: Course[];
  usersList: UserProfile[];
  skillConfig?: SkillConfig;
}

export const InstructorWorkspace: React.FC<InstructorWorkspaceProps> = (props) => {
  const workspace = useInstructorWorkspace(props);
  const { addNotification } = useNotifications();
  const { t: shellT } = useLanguage();
  const collaboration = useInstructorBookingCollaboration({
    accountId: props.userProfile.uid,
    instructorId: props.userProfile.instructorId,
    onNotify: (type, title, message) => addNotification(type, title, message),
    t: shellT as (key: string) => string,
  });
  const {
    userProfile,
    instructors,
    courses,
    usersList,
    skillConfig,
    selectedChatBooking,
    closeChatModal,
    evalModalState,
    closeEvalModal,
    handleSaveStudentScores,
    t,
  } = workspace;

  if (!userProfile.instructorId) {
    return <InstructorNotLinked t={t} />;
  }

  return (
    <div className="space-y-8 animate-fade-in">
      <InstructorDashboardHeader workspace={workspace} />
      <InstructorCourseSection
        accountId={userProfile.uid}
        instructorId={userProfile.instructorId!}
        t={t}
      />
      <InstructorBookingList workspace={workspace} collaboration={collaboration} />
      <InstructorStudents workspace={workspace} />
      <InstructorReviews workspace={workspace} />

      {selectedChatBooking && (
        <BookingChatModal
          booking={selectedChatBooking as unknown as Booking}
          currentUserProfile={userProfile}
          onClose={closeChatModal}
          instructors={instructors}
          courses={courses}
          usersList={usersList}
          fromInstructorPanel
        />
      )}

      <StudentSkillEvaluationModal
        isOpen={evalModalState.isOpen}
        onClose={closeEvalModal}
        studentUid={evalModalState.studentUid}
        studentName={evalModalState.studentName}
        studentLevel={evalModalState.studentLevel}
        existingScores={evalModalState.existingScores}
        existingComments={evalModalState.existingComments}
        skillConfig={skillConfig}
        onSaveScores={handleSaveStudentScores}
      />

      <CreateProposalModal
        open={collaboration.createProposalParticipant !== null}
        participantLabel={collaboration.createProposalParticipant?.label}
        onClose={() => collaboration.setCreateProposalParticipant(null)}
        onSubmit={collaboration.handleCreateProposal}
      />
    </div>
  );
};
