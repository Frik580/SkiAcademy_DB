import React from 'react';
import { UserProfile, Instructor, Booking, Review, Course } from '../types';
import { SkillConfig } from '../lib/skillData';
import { BookingChatModal } from './BookingChatModal';
import { StudentSkillEvaluationModal } from './StudentSkillEvaluationModal';
import { useInstructorWorkspace } from './instructor_workspace/useInstructorWorkspace';
import { InstructorNotLinked } from './instructor_workspace/InstructorNotLinked';
import { InstructorDashboardHeader } from './instructor_workspace/InstructorDashboardHeader';
import { InstructorBookingList } from './instructor_workspace/InstructorBookingList';
import { InstructorStudents } from './instructor_workspace/InstructorStudents';
import { InstructorReviews } from './instructor_workspace/InstructorReviews';

interface InstructorWorkspaceProps {
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
  const {
    userProfile,
    instructors,
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
      <InstructorBookingList workspace={workspace} />
      <InstructorStudents workspace={workspace} />
      <InstructorReviews workspace={workspace} />

      {selectedChatBooking && (
        <BookingChatModal
          booking={selectedChatBooking as unknown as Booking}
          currentUserProfile={userProfile}
          onClose={closeChatModal}
          instructors={instructors}
          usersList={usersList}
        />
      )}

      <StudentSkillEvaluationModal
        isOpen={evalModalState.isOpen}
        onClose={closeEvalModal}
        studentUid={evalModalState.studentUid}
        studentName={evalModalState.studentName}
        studentLevel={evalModalState.studentLevel}
        existingScores={evalModalState.existingScores}
        skillConfig={skillConfig}
        onSaveScores={handleSaveStudentScores}
      />
    </div>
  );
};
