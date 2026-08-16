import React from 'react';
import { UserProfile, Instructor, Booking, Review, Course } from '../../../types';
import { SkillConfig } from '../../../lib/skillData';
import { BookingChatModal } from '../../../components/BookingChatModal';
import { StudentSkillEvaluationModal } from '../../../components/StudentSkillEvaluationModal';
import { useInstructorWorkspace } from '../../../components/instructor_workspace/useInstructorWorkspace';
import { InstructorNotLinked } from '../../../components/instructor_workspace/InstructorNotLinked';
import { InstructorDashboardHeader } from '../../../components/instructor_workspace/InstructorDashboardHeader';
import { InstructorBookingList } from '../../../components/instructor_workspace/InstructorBookingList';
import { InstructorStudents } from '../../../components/instructor_workspace/InstructorStudents';
import { InstructorReviews } from '../../../components/instructor_workspace/InstructorReviews';

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
      <InstructorBookingList workspace={workspace} />
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
    </div>
  );
};
