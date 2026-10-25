import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { LanguageProvider } from '../../../src/app/providers/LanguageContext';
import { NotificationProvider } from '../../../src/features/notifications';
import { InstructorWorkspace } from '../../../src/features/instructor-workspace/InstructorWorkspace';
import { StudentSkillEvaluationModal } from '../../../src/features/profile/components/StudentSkillEvaluationModal';
import { AdminModal } from '../../../src/features/admin/components/AdminModal';
import { ParticipantLevelManager } from '../../../src/features/participant-progress/ParticipantLevelManager';
import { useParticipantProgressStore } from '../../../src/features/participant-progress';
import { emptyParticipantProgressView } from '../../../src/features/participant-progress';
import type { InstructorLessonBookingItem } from '../../../src/features/booking-collaboration';
import type { UserProfile } from '../../../src/types';
import '../../../src/index.css';

const params = new URLSearchParams(location.search);
localStorage.setItem('alpine_glide_lang', params.get('language') === 'en' ? 'en' : 'ru');
localStorage.setItem('theme', params.get('theme') === 'dark' ? 'dark' : 'light');
document.documentElement.classList.toggle('dark', params.get('theme') === 'dark');
const progress = emptyParticipantProgressView('participant_modal_01');
useParticipantProgressStore.setState({ byId: { [progress.participantId]: progress } });
const booking = {
  bookingId: 'booking_modal_01',
  revision: 1,
  instructorId: 'instructor_modal_01',
  instructorName: 'Coach',
  status: 'completed',
  date: '2026-10-01',
  time: '10:00',
  durationHours: 1,
  startsAtEpochMs: 1790830800000,
  endsAtEpochMs: 1790834400000,
  participantIds: [progress.participantId],
  participantNames: ['Test Student'],
  participants: [{ participantId: progress.participantId, displayName: 'Test Student' }],
  partyKind: 'individual',
  bookingOrigin: 'account',
  attendance: [
    {
      participantId: progress.participantId,
      attendanceStatus: 'present',
      revision: 1,
      authorizedActions: { canRecordPresent: false, canRecordAbsent: false },
    },
  ],
  authorizedActions: {
    canRequestCancellation: false,
    canWithdrawCancellation: false,
    canReschedule: false,
    canCreateChangeRequest: false,
  },
} as InstructorLessonBookingItem;

// Component integration fixture. No authenticated session; never submit canonical commands.
export function Fixture() {
  const [admin, setAdmin] = useState(false);
  const [skills, setSkills] = useState(false);
  const adminRole = 'admin';
  return (
    <LanguageProvider>
      <NotificationProvider>
        <main style={{ minHeight: 2400, padding: 16 }}>
          <p>Isolated modal verification — no authenticated workflow</p>
          <button data-testid="admin-open" onClick={() => setAdmin(true)}>
            Admin level
          </button>
          <button data-testid="skills-open" onClick={() => setSkills(true)}>
            Skills
          </button>
          <div style={{ marginTop: 650 }}>
            <InstructorWorkspace
              userProfile={
                {
                  uid: 'account_modal_01',
                  instructorId: booking.instructorId,
                  role: 'instructor',
                } as UserProfile
              }
              instructors={[]}
              lessonBookings={[booking]}
              reviews={[]}
              courses={[]}
              usersList={[]}
            />
          </div>
          {admin && (
            <AdminModal
              title="Admin level"
              closeLabel="Close"
              onClose={() => setAdmin(false)}
              width="lg"
            >
              <ParticipantLevelManager
                accountId="account_modal_01"
                participantId={progress.participantId}
                role={adminRole}
                initial={progress}
              />
            </AdminModal>
          )}
          <StudentSkillEvaluationModal
            isOpen={skills}
            onClose={() => setSkills(false)}
            participantId={progress.participantId}
            studentName="Test Student"
            studentLevel={1}
            existingScores={progress.skillScores}
            existingComments={progress.skillComments}
            onSaveScores={async () => {
              throw new Error('Canonical writes are disabled in this fixture');
            }}
          />
        </main>
      </NotificationProvider>
    </LanguageProvider>
  );
}
createRoot(document.getElementById('root')!).render(<Fixture />);
