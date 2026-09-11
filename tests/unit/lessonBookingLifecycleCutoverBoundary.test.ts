import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function readRepoFile(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

describe('T32.9A.9A individual Booking lifecycle cutover boundary', () => {
  it('does not export legacy individual Booking callables or the legacy auto-completion writer', () => {
    const functionsIndex = readRepoFile('functions/src/index.ts');
    for (const exportName of [
      'createBooking',
      'addBooking',
      'createGuestBooking',
      'updateBookingSchedule',
      'linkGuestBooking',
      'completeBooking',
      'cancelBooking',
      'confirmBooking',
      'deleteBooking',
      'requestBookingCancellation',
      'scheduledAutoCompleteBookings',
    ]) {
      expect(functionsIndex).not.toContain(`export const ${exportName}`);
    }
    expect(functionsIndex).not.toContain("from './bookings/autoComplete'");
  });

  it('keeps active app routes off legacy Booking reads and recommendation writes', () => {
    const bookingSync = readRepoFile('src/features/bookings/sync/useBookingsSync.ts');
    const instructorRoute = readRepoFile('src/app/routes/InstructorRouteContainer.tsx');
    const instructorWorkspace = readRepoFile(
      'src/features/instructor-workspace/components/useInstructorWorkspace.ts'
    );
    const instructorCard = readRepoFile(
      'src/features/instructor-workspace/components/InstructorBookingCard.tsx'
    );
    const cabinetRoute = readRepoFile('src/app/routes/CabinetRouteContainer.tsx');
    const firebaseInfrastructure = readRepoFile('src/infrastructure/firebase/firebase.ts');

    expect(bookingSync).not.toContain("collection(db, 'bookings')");
    expect(bookingSync).not.toContain('getRealtimeBookingsQuery');
    expect(bookingSync).not.toContain('getBookingHistoryPage');
    expect(instructorRoute).not.toContain('state.bookings');
    expect(instructorWorkspace).not.toContain('saveBookingRecommendationsService');
    expect(instructorWorkspace).not.toContain('completeBookingService');
    expect(instructorWorkspace).not.toContain('confirmBookingService');
    expect(instructorCard).not.toContain('InstructorRecommendationsEditor');
    expect(instructorCard).not.toContain('saveBookingRecommendationsService');
    expect(instructorCard).not.toContain('booking.recommendations');
    expect(instructorCard).not.toContain('completedRecommendationIds');
    expect(instructorCard).toContain('InstructorParticipantLessonFeedbackEditor');
    expect(instructorCard).not.toContain('instructorCompleteLesson');
    expect(instructorCard).not.toContain('completeBooking');
    expect(instructorCard).not.toContain("collection(db, 'attendance'");
    expect(instructorCard).not.toContain("doc(db, 'attendance'");
    expect(cabinetRoute).not.toContain('onToggleRecommendation=');
    expect(cabinetRoute).not.toContain('toggleRecommendationService');
    expect(firebaseInfrastructure).not.toContain("updateDoc(doc(db, 'bookings'");
  });

  it('keeps canonical lesson feedback contracts off legacy Booking recommendation writers', () => {
    const commandIntents = readRepoFile(
      'packages/shared-domain/src/canonical/commands/commandIntents.ts'
    );
    const feedbackDomain = readRepoFile(
      'packages/shared-domain/src/canonical/participantLessonFeedback.ts'
    );
    const feedbackCommands = readRepoFile(
      'functions/src/canonical/lessonFeedback/participantLessonFeedbackCommands.ts'
    );
    const feedbackReadModels = readRepoFile(
      'functions/src/canonical/readModels/participantLessonFeedbackReadModels.ts'
    );
    expect(commandIntents).toContain('save_participant_lesson_feedback');
    expect(commandIntents).toContain('set_participant_lesson_feedback_item_completion');
    expect(commandIntents).not.toContain('saveBookingRecommendations');
    expect(commandIntents).not.toContain('toggleRecommendation');
    expect(feedbackDomain).not.toContain('completedRecommendationIds');
    expect(feedbackDomain).not.toContain('bookings.recommendations');
    expect(feedbackCommands).not.toContain('saveBookingRecommendationsService');
    expect(feedbackCommands).not.toContain('toggleRecommendationService');
    expect(feedbackCommands).not.toContain('completedRecommendationIds');
    expect(feedbackCommands).not.toContain('recommendations:');
    expect(feedbackReadModels).not.toContain('completedRecommendationIds');
    expect(feedbackReadModels).not.toContain('booking.recommendations');
  });

  it('keeps Instructor Workspace lesson feedback on canonical read/write only', () => {
    const instructorCard = readRepoFile(
      'src/features/instructor-workspace/components/InstructorBookingCard.tsx'
    );
    const feedbackEditor = readRepoFile(
      'src/features/instructor-workspace/components/InstructorParticipantLessonFeedbackEditor.tsx'
    );
    const feedbackHook = readRepoFile(
      'src/features/instructor-workspace/useInstructorParticipantLessonFeedbackEditor.ts'
    );
    const feedbackService = readRepoFile(
      'src/features/participant-lesson-feedback/participantLessonFeedbackService.ts'
    );
    const feedbackView = readRepoFile(
      'src/features/participant-lesson-feedback/participantLessonFeedbackView.ts'
    );

    expect(feedbackService).toContain('save_participant_lesson_feedback');
    expect(feedbackService).toContain('queryParticipantLessonFeedbackReadModels');
    expect(feedbackService).toContain("scope: 'instructor_lesson'");
    expect(feedbackService).not.toContain('saveBookingRecommendationsService');
    expect(feedbackService).not.toContain('toggleRecommendationService');
    expect(feedbackService).not.toContain('instructorId');
    expect(feedbackService).not.toContain('completedRecommendationIds');
    expect(feedbackView).not.toContain('booking.recommendations');
    expect(feedbackView).not.toContain('completedRecommendationIds');
    expect(feedbackEditor).not.toContain('saveBookingRecommendationsService');
    expect(feedbackEditor).not.toContain('completedItemIds');
    expect(feedbackEditor).not.toContain('type="checkbox"');
    expect(feedbackHook).not.toContain('saveBookingRecommendationsService');
    expect(feedbackHook).not.toContain('booking.recommendations');
    expect(feedbackHook).not.toContain('location.reload');
    expect(feedbackHook).not.toContain('window.location');
    expect(instructorCard).not.toContain('location.reload');
    expect(instructorCard).not.toContain('window.location');
    expect(feedbackEditor).not.toContain('location.reload');
    expect(feedbackEditor).not.toContain('window.location');
  });

  it('keeps Student Cabinet lesson feedback on canonical participant reads and completion', () => {
    const home = readRepoFile(
      'src/features/student-cabinet/components/student/StudentCabinetHome.tsx'
    );
    const latest = readRepoFile(
      'src/features/student-cabinet/components/student/StudentHomeBottomSections.tsx'
    );
    const needsAttention = readRepoFile(
      'src/features/student-cabinet/components/student/StudentNeedsAttention.tsx'
    );
    const today = readRepoFile(
      'src/features/student-cabinet/components/student/studentSkillProgress.ts'
    );
    const coach = readRepoFile(
      'src/features/student-cabinet/components/student/StudentCoachPanel.tsx'
    );
    const historyCard = readRepoFile(
      'src/features/student-cabinet/components/student/HistoryLessonCard.tsx'
    );
    const lessonDetails = readRepoFile(
      'src/features/student-cabinet/components/LessonDetailsModal.tsx'
    );
    const sessionBlocks = readRepoFile(
      'src/features/student-cabinet/components/student/StudentTodaySessionBlocks.tsx'
    );
    const calendarList = readRepoFile(
      'src/features/student-cabinet/components/ClientBookingsList.tsx'
    );
    const shell = readRepoFile(
      'src/features/student-cabinet/components/student/StudentCabinetShell.tsx'
    );
    const feedbackService = readRepoFile(
      'src/features/participant-lesson-feedback/participantLessonFeedbackService.ts'
    );
    const loadHook = readRepoFile(
      'src/features/student-cabinet/useSelectedParticipantLessonFeedback.ts'
    );

    for (const source of [
      home,
      latest,
      needsAttention,
      today,
      coach,
      historyCard,
      lessonDetails,
      sessionBlocks,
      calendarList,
      shell,
    ]) {
      expect(source).not.toContain('booking.recommendations');
      expect(source).not.toContain('completedRecommendationIds');
      expect(source).not.toContain('toggleRecommendationService');
      expect(source).not.toContain('getLatestCoachRecommendation');
      expect(source).not.toContain('getRecommendationTasks');
      expect(source).not.toContain('window.location.reload');
      expect(source).not.toContain('router.refresh');
    }

    expect(coach).not.toContain('getInstructorRecommendations');
    expect(home).toContain('usePresentedParticipantLessonFeedback');
    expect(lessonDetails).toContain('ParticipantLessonFeedbackList');
    expect(feedbackService).toContain("scope: 'managed_participant'");
    expect(feedbackService).toContain('set_participant_lesson_feedback_item_completion');
    expect(loadHook).not.toContain('setSelectedParticipantId');
    expect(loadHook).not.toContain('window.location.reload');
  });

  it('keeps Student Cabinet upcoming individual Bookings on canonical account_hot owner', () => {
    const storeSync = readRepoFile('src/store/useStoreSync.ts');
    const lessonSync = readRepoFile('src/features/lesson-bookings/useLessonBookingReadSync.ts');
    const cabinetRoute = readRepoFile('src/app/routes/CabinetRouteContainer.tsx');
    const bookingSync = readRepoFile('src/features/bookings/sync/useBookingsSync.ts');
    const accountLessonGate = readRepoFile('src/store/accountLessonBookingSync.ts');

    expect(storeSync).toContain('useLessonBookingReadSync(isCustomerCanonicalLessonPath');
    expect(storeSync).toContain('shouldSyncAccountLessonBookings');
    expect(storeSync).not.toContain("userProfile?.role === 'user'");
    expect(accountLessonGate).toContain("input.pathname.startsWith('/cabinet')");
    expect(lessonSync).toContain("scope: 'account_hot'");
    expect(lessonSync).toContain('queryLessonBookingReadModels');
    expect(cabinetRoute).toContain('useLessonBookingStore(selectLessonBookingItems)');
    expect(cabinetRoute).not.toContain('state.bookings');
    expect(bookingSync).toContain('setBookings([])');
    expect(bookingSync).not.toContain("collection(db, 'bookings')");
  });
});

describe('T32.9A.9B.3 canonical lesson feedback isolation', () => {
  const appRoutes = [
    'src/app/routes/AppRoutes.tsx',
    'src/app/routes/CabinetRouteContainer.tsx',
    'src/app/routes/InstructorRouteContainer.tsx',
    'src/app/routes/AdminRouteContainer.tsx',
    'src/app/routes/HomeRouteContainer.tsx',
  ];

  it('does not let app routes import legacy recommendation writers', () => {
    for (const path of appRoutes) {
      const source = readRepoFile(path);
      expect(source).not.toContain('saveBookingRecommendationsService');
      expect(source).not.toContain('toggleRecommendationService');
      expect(source).not.toContain('InstructorRecommendationsEditor');
      expect(source).not.toContain('lessonRecommendations');
    }
  });

  it('keeps Instructor Workspace off legacy recommendation writers and readers', () => {
    const instructorWorkspace = readRepoFile(
      'src/features/instructor-workspace/components/useInstructorWorkspace.ts'
    );
    const instructorCard = readRepoFile(
      'src/features/instructor-workspace/components/InstructorBookingCard.tsx'
    );
    const instructorRoot = readRepoFile(
      'src/features/instructor-workspace/InstructorWorkspace.tsx'
    );
    const chatWindow = readRepoFile('src/features/bookings/components/booking_chat/ChatWindow.tsx');
    const chatModal = readRepoFile('src/features/bookings/components/BookingChatModal.tsx');

    expect(
      existsSync(
        join(
          process.cwd(),
          'src/features/instructor-workspace/components/InstructorRecommendationsEditor.tsx'
        )
      )
    ).toBe(false);
    expect(instructorWorkspace).not.toContain('saveBookingRecommendationsService');
    expect(instructorWorkspace).not.toContain('toggleRecommendationService');
    expect(instructorWorkspace).not.toContain('booking.recommendations');
    expect(instructorWorkspace).not.toContain('completedRecommendationIds');
    expect(instructorCard).not.toContain('InstructorRecommendationsEditor');
    expect(instructorCard).not.toContain('saveBookingRecommendationsService');
    expect(instructorCard).not.toContain('booking.recommendations');
    expect(instructorCard).not.toContain('completedRecommendationIds');
    expect(instructorRoot).not.toContain('onToggleRecommendation');
    expect(instructorRoot).toContain('BookingChatModal');
    expect(chatWindow).not.toContain('LessonRecommendationsList');
    expect(chatWindow).not.toContain('hasBookingRecommendations');
    expect(chatWindow).not.toContain('booking.recommendations');
    expect(chatWindow).not.toContain('completedRecommendationIds');
    expect(chatWindow).not.toContain('onToggleRecommendation');
    expect(chatModal).not.toContain('onToggleRecommendation');
    expect(chatModal).not.toContain('booking.recommendations');
    expect(chatModal).not.toContain('completedRecommendationIds');
  });

  it('keeps Student Cabinet off Booking.recommendations readers and completedRecommendationIds writers', () => {
    const cabinetSources = [
      'src/features/student-cabinet/components/student/StudentCabinetShell.tsx',
      'src/features/student-cabinet/components/student/StudentCabinetHome.tsx',
      'src/features/student-cabinet/components/student/StudentCoachPanel.tsx',
      'src/features/student-cabinet/components/student/StudentNeedsAttention.tsx',
      'src/features/student-cabinet/components/student/HistoryLessonCard.tsx',
      'src/features/student-cabinet/components/LessonDetailsModal.tsx',
      'src/features/student-cabinet/components/PersonalCabinetModals.tsx',
      'src/features/profile/components/PersonalCabinet.tsx',
    ];
    for (const path of cabinetSources) {
      const source = readRepoFile(path);
      expect(source).not.toContain('booking.recommendations');
      expect(source).not.toContain('completedRecommendationIds');
      expect(source).not.toContain('toggleRecommendationService');
      expect(source).not.toContain('saveBookingRecommendationsService');
      expect(source).not.toContain('LessonRecommendationsList');
    }
    expect(
      existsSync(join(process.cwd(), 'src/features/student-cabinet/lessonRecommendations.ts'))
    ).toBe(false);
    expect(
      existsSync(
        join(process.cwd(), 'src/features/student-cabinet/components/LessonRecommendationsList.tsx')
      )
    ).toBe(false);
  });

  it('keeps canonical lesson feedback off legacy recommendation services and Booking dual-write', () => {
    const canonicalSources = [
      'packages/shared-domain/src/canonical/participantLessonFeedback.ts',
      'packages/shared-domain/src/canonical/readModels/participantLessonFeedbackReadModel.ts',
      'functions/src/canonical/lessonFeedback/participantLessonFeedbackCommands.ts',
      'functions/src/canonical/readModels/participantLessonFeedbackReadModels.ts',
      'src/features/participant-lesson-feedback/participantLessonFeedbackService.ts',
      'src/features/participant-lesson-feedback/participantLessonFeedbackStore.ts',
      'src/features/instructor-workspace/useInstructorParticipantLessonFeedbackEditor.ts',
    ];
    for (const path of canonicalSources) {
      const source = readRepoFile(path);
      expect(source).not.toContain('saveBookingRecommendationsService');
      expect(source).not.toContain('toggleRecommendationService');
      expect(source).not.toContain("updateDoc(doc(db, 'bookings'");
      expect(source).not.toContain('booking.recommendations');
    }
    const commands = readRepoFile(
      'functions/src/canonical/lessonFeedback/participantLessonFeedbackCommands.ts'
    );
    expect(commands).not.toContain('completedRecommendationIds');
    expect(commands).not.toContain('recommendations:');
    const bookingService = readRepoFile('src/features/bookings/bookingService.ts');
    expect(bookingService).not.toContain('saveBookingRecommendationsService');
    expect(bookingService).not.toContain('toggleRecommendationService');
    expect(bookingService).not.toContain('completedRecommendationIds');
    expect(bookingService).not.toContain('sanitizeRecommendations');
    const bookingActions = readRepoFile('src/features/bookings/useBookingActions.ts');
    expect(bookingActions).not.toContain('toggleRecommendationService');
    expect(bookingActions).not.toContain('handleToggleRecommendation');
    expect(bookingActions).not.toContain('completedRecommendationIds');
  });

  it('keeps legacy recommendation client writes denied and chat homework intact', () => {
    const rules = readRepoFile('firestore.rules');
    expect(rules).toContain('match /participant_lesson_feedback/{feedbackId}');
    expect(rules).toContain(
      'Legacy bookings.recommendations / completedRecommendationIds client writes are closed.'
    );
    expect(rules).toContain("changedKeys().hasOnly(['isHomework', 'homeworkForUserIds'])");
    const chatService = readRepoFile('src/features/chat/chatService.ts');
    expect(chatService).toContain('setChatMessageHomework');
    expect(chatService).toContain('isHomework');
    expect(chatService).toContain('homeworkForUserIds');
    const chatModal = readRepoFile('src/features/bookings/components/BookingChatModal.tsx');
    expect(chatModal).toContain('setChatMessageHomework');
    expect(chatModal).toContain('isHomework');
    expect(chatModal).toContain('HomeworkPanel');
    expect(chatModal).toContain('buildHomeworkForUserIds');
    const homework = readRepoFile('src/domain/chat/chatHomework.ts');
    expect(homework).toContain('isHomeworkVisibleToStudent');
    expect(homework).toContain('buildHomeworkForUserIds');
  });

  it('keeps the canonical lesson-feedback aggregate separate from Booking and dead GroupCourse leftover off', () => {
    const functionsIndex = readRepoFile('functions/src/index.ts');
    expect(functionsIndex).toContain('export const executeCanonicalCommand');
    expect(functionsIndex).toContain('export const queryParticipantLessonFeedbackReadModels');
    const paths = readRepoFile('packages/shared-domain/src/canonical/paths.ts');
    expect(paths).toContain("participantLessonFeedback: 'participant_lesson_feedback'");
    expect(paths).not.toContain('bookings.recommendations');
    const groupCourseCard = readRepoFile('src/features/courses/components/GroupCourseCard.tsx');
    expect(groupCourseCard).not.toContain('lessonRecommendations');
    expect(groupCourseCard).not.toContain('enrollmentBooking');
    expect(groupCourseCard).not.toContain('hasPendingRecommendations');
    expect(groupCourseCard).not.toContain('RecommendationIndicator');
  });
});
