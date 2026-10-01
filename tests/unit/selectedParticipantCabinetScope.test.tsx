import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ActivityLog, Review, UserProfile } from '../../src/types';
import type { LessonBookingCabinetItem } from '../../src/features/lesson-bookings/lessonBookingContracts';
import type { CourseEnrollmentCabinetItem } from '../../src/features/course-enrollments';
import { buildMixedCabinetSessionItems } from '../../src/features/course-enrollments/cabinetSessionItems';
import {
  selectBookingsForParticipant,
  selectCabinetDataForParticipant,
} from '../../src/features/student-cabinet/selectedParticipantCabinetScope';
import { cabinetItemToLegacyPresentation } from '../../src/features/lesson-bookings/mergeCabinetBookings';
import { getHistoryEvents } from '../../src/features/student-cabinet/components/student/studentHistory';
import {
  StudentCabinetShell,
  type StudentCabinetShellProps,
} from '../../src/features/student-cabinet/components/student/StudentCabinetShell';
import { useCabinetProgressParticipantSelectionStore } from '../../src/features/student-cabinet/cabinetProgressParticipantSelectionStore';
import { useCabinetProgressParticipantSelection } from '../../src/features/student-cabinet/useCabinetProgressParticipantSelection';
import type { BookingProposalCabinetItem } from '../../src/features/booking-collaboration';
import { useParticipantProgressStore } from '../../src/features/participant-progress/participantProgressStore';
import { useParticipantLessonFeedbackStore } from '../../src/features/participant-lesson-feedback/participantLessonFeedbackStore';
import { usePresentedParticipantLessonFeedback } from '../../src/features/student-cabinet/usePresentedParticipantLessonFeedback';
import type { ManagedParticipantOption } from '../../src/features/lesson-bookings/lessonBookingContracts';

const participants: ManagedParticipantOption[] = ['A', 'B'].map((participantId) => ({
  participantId,
  participantManagementId: `management_${participantId}`,
  displayName: participantId,
  authority: 'parent_guardian',
  discipline: 'ski',
  skillLevel: 'beginner',
  age: { kind: 'age_years', years: 10 },
  revision: 1,
}));

vi.mock('../../src/features/lesson-bookings/useManagedParticipants', () => ({
  useManagedParticipants: () => ({ participants, loading: false, reload: vi.fn() }),
}));
vi.mock('../../src/features/participant-lesson-feedback/participantLessonFeedbackService', () => ({
  queryManagedParticipantLessonFeedback: () => new Promise(() => undefined),
}));
vi.mock('../../src/features/participant-achievements', () => ({
  accountReviewEvidenceFromCanonicalPresentation: () => [],
  usePresentedParticipantAchievements: () => ({ evaluation: undefined }),
  useSelectedParticipantAchievementsRecorder: () => undefined,
}));
vi.mock(
  '../../src/features/student-cabinet/components/student/useStudentCabinetTranslations',
  () => ({
    useStudentCabinetTranslations: () => ({ t: (key: string) => key }),
  })
);
vi.mock('../../src/features/participants/components/ParticipantPicker', () => ({
  ParticipantPicker: () => null,
}));
vi.mock('../../src/features/student-cabinet/components/student/BookInstructorPickerModal', () => ({
  BookInstructorPickerModal: () => null,
}));
vi.mock('../../src/features/student-cabinet/components/student/StudentCabinetHome', () => ({
  StudentCabinetHome: ScopeProbe,
}));
vi.mock('../../src/features/student-cabinet/components/student/StudentHistoryPanel', () => ({
  StudentHistoryPanel: ScopeProbe,
}));
vi.mock('../../src/features/student-cabinet/components/student/StudentCoachPanel', () => ({
  StudentCoachPanel: ScopeProbe,
}));
vi.mock('../../src/features/student-cabinet/components/student/StudentCabinetPanels', () => ({
  StudentCalendarPanel: ScopeProbe,
  StudentCoursesPanel: ScopeProbe,
  StudentDevelopmentPanel: ScopeProbe,
  StudentTrainingPanel: () => null,
}));
vi.mock('../../src/features/student-cabinet/components/student/StudentProfilePanels', () => ({
  StudentProfileHubPanel: () => null,
  StudentProfilePersonalPanel: ScopeProbe,
  StudentProfileParticipantsPanel: ScopeProbe,
  StudentProfileWalletPanel: ScopeProbe,
  StudentProfileJourneyPanel: ScopeProbe,
  StudentProfileSkillsPanel: ScopeProbe,
  StudentProfileCertificatesPanel: ScopeProbe,
  StudentProfileAchievementsPanel: ScopeProbe,
  StudentProfileSeasonPanel: ScopeProbe,
  StudentProfileVideosPanel: ScopeProbe,
  StudentProfilePreferencesPanel: ScopeProbe,
}));
const tabs = [
  'home',
  'calendar',
  'history',
  'courses',
  'development',
  'coach',
  'profile_journey',
  'profile_achievements',
  'profile_season',
  'profile_wallet',
  'profile_preferences',
  'profile_personal',
  'profile_participants',
] as const;
vi.mock('../../src/features/student-cabinet/components/student/StudentCabinetUI', () => ({
  studentCabinetFooterHeight: 0,
  StudentCabinetTabBar: ({ onSelect }: { onSelect: (tab: string) => void }) => (
    <nav>
      {tabs.map((tab) => (
        <button key={tab} onClick={() => onSelect(tab)}>
          {tab}
        </button>
      ))}
    </nav>
  ),
}));

function ScopeProbe(props: {
  bookings: readonly { id: string }[];
  userProfile: UserProfile;
  selectedParticipantId?: string;
  sessionItems?: readonly import('../../src/features/course-enrollments').CabinetSessionItem[];
  courseEnrollments?: readonly CourseEnrollmentCabinetItem[];
  activityLogs?: readonly ActivityLog[];
  reviews?: readonly Review[];
}) {
  const feedback = usePresentedParticipantLessonFeedback();
  return (
    <output data-testid="scope">
      {JSON.stringify({
        selected: props.selectedParticipantId,
        lessons: props.bookings.map((item) => item.id),
        sessions: props.sessionItems?.map((item) =>
          item.kind === 'lesson' ? item.session.id : item.enrollmentId
        ),
        enrollments: props.courseEnrollments?.map((item) => item.enrollmentId),
        logs: props.activityLogs?.map((item) => item.id),
        reviewLessons: props.reviews?.map((item) => item.bookingId),
        profile: props.userProfile,
        feedback: feedback.items.map((item) => item.participantId),
      })}
    </output>
  );
}

function HeaderSwitcher() {
  return (
    <div>
      {participants.map((participant) => (
        <button
          key={participant.participantId}
          onClick={() =>
            useCabinetProgressParticipantSelectionStore
              .getState()
              .selectParticipant(participant.participantId, participants)
          }
        >
          select {participant.participantId}
        </button>
      ))}
    </div>
  );
}

function lesson(
  id: string,
  participantIds?: readonly string[],
  status: LessonBookingCabinetItem['status'] = 'confirmed'
): LessonBookingCabinetItem {
  return {
    id,
    bookingId: id,
    revision: 1,
    status,
    date: '2026-10-02',
    time: '10:00',
    durationHours: 1,
    instructorId: `coach_${id}`,
    instructorName: `Coach ${id}`,
    instructorAvatar: '',
    participantNames: ['Same name'],
    participantIds,
    partyKind: participantIds && participantIds.length > 1 ? 'family_group' : 'individual',
    payment: { kind: 'withheld' },
    bookingOrigin: 'account',
    isLessonBooking: true,
  };
}

function enrollment(participantId: string): CourseEnrollmentCabinetItem {
  return {
    enrollmentId: `enrollment_${participantId}`,
    courseId: 'course_shared',
    participantId,
    revision: 1,
    participantName: participantId,
    lifecycleStatus: 'confirmed',
    courseTitle: 'Camp',
    scheduleStartDate: '2026-10-02',
    scheduleEndDate: '2026-10-02',
    bookingOrigin: 'account',
    authorizedActions: { canWithdraw: true, canRequestCancellation: true },
    updatedAtSeconds: 1,
    courseSchedule: {
      courseId: 'course_shared',
      courseScheduleRevision: 1,
      courseDayCount: 1,
      startAt: { seconds: 1790902800, nanoseconds: 0 },
      finalCourseDayEndsAt: { seconds: 1790906400, nanoseconds: 0 },
      courseDays: [
        {
          courseDayId: 'day_shared',
          dayOrder: 1,
          revision: 1,
          timeZone: 'Asia/Almaty',
          interval: {
            startsAt: { seconds: 1790902800, nanoseconds: 0 },
            endsAt: { seconds: 1790906400, nanoseconds: 0 },
          },
        },
      ],
    },
  };
}

const bookings = [
  lesson('lessonA', ['A']),
  lesson('lessonB', ['B']),
  lesson('lessonAB', ['A', 'B']),
];
const courseEnrollments = [enrollment('A'), enrollment('B')];
const reviews = ['lessonA', 'lessonB', 'lessonAB', 'unknown'].map(
  (bookingId) =>
    ({
      id: `review_${bookingId}`,
      userId: 'account_01',
      bookingId,
      date: '2026-10-02',
      rating: 5,
    }) as Review
);
const activityLogs: ActivityLog[] = [
  ...bookings.map((booking) => ({
    id: `log_${booking.id}`,
    userId: 'account_01',
    actorId: 'coach',
    type: 'booking_completed' as const,
    timestamp: '2026-10-02',
    metadata: { bookingId: booking.id },
  })),
  {
    id: 'unowned_skill',
    userId: 'account_01',
    actorId: 'coach',
    type: 'skill_scores_updated',
    timestamp: '2026-10-02',
    metadata: { bookingId: 'lessonAB', skillDeltas: [{ itemId: 'carving', delta: 10 }] },
  },
  {
    id: 'unowned_level',
    userId: 'account_01',
    actorId: 'coach',
    type: 'level_up',
    timestamp: '2026-10-02',
    metadata: { newLevel: 4 },
  },
];
const input = {
  bookings,
  courseEnrollments,
  reviews,
  activityLogs,
  sessionItems: buildMixedCabinetSessionItems({ lessonBookings: bookings, courseEnrollments }),
  unreviewedCompletedBookings: bookings,
  collaborationProposals: [],
};

describe('selected participant cabinet scope', () => {
  it.each(['A', 'B'])(
    'isolates lessons, shared lessons, calendar, courses, notices and review history for %s',
    (participantId) => {
      const scoped = selectCabinetDataForParticipant({
        ...input,
        selectedParticipantId: participantId,
      });
      expect(scoped.bookings.map((item) => item.id)).toEqual([
        `lesson${participantId}`,
        'lessonAB',
      ]);
      expect(
        scoped.sessionItems.filter((item) => item.kind === 'lesson').map((item) => item.session.id)
      ).toEqual(expect.arrayContaining([`lesson${participantId}`, 'lessonAB']));
      expect(scoped.sessionItems).toHaveLength(3);
      expect(
        scoped.sessionItems
          .filter((item) => item.kind === 'course_day')
          .map((item) => item.enrollmentId)
      ).toEqual([`enrollment_${participantId}`]);
      expect(scoped.courseEnrollments.map((item) => item.enrollmentId)).toEqual([
        `enrollment_${participantId}`,
      ]);
      expect(scoped.reviews.map((item) => item.bookingId)).toEqual([
        `lesson${participantId}`,
        'lessonAB',
      ]);
      expect(scoped.activityLogs.map((item) => item.id)).toEqual([
        `log_lesson${participantId}`,
        'log_lessonAB',
      ]);
      expect(scoped.unreviewedCompletedBookings.map((item) => item.id)).toEqual([
        `lesson${participantId}`,
        'lessonAB',
      ]);
    }
  );

  it('isolates completed, cancelled and no-show history without using account identity', () => {
    const historical = ['completed', 'cancelled', 'no_show'].flatMap((status) => [
      lesson(`A_${status}`, ['A'], status as LessonBookingCabinetItem['status']),
      lesson(`B_${status}`, ['B'], status as LessonBookingCabinetItem['status']),
    ]);
    const scoped = selectCabinetDataForParticipant({
      ...input,
      bookings: historical,
      selectedParticipantId: 'B',
    });
    expect(scoped.bookings.map((item) => item.id)).toEqual([
      'B_completed',
      'B_cancelled',
      'B_no_show',
    ]);
    const history = getHistoryEvents(
      { uid: 'account_01', level: 1 } as UserProfile,
      scoped.bookings.map((item) => cabinetItemToLegacyPresentation(item, 'account_01')),
      [],
      'en',
      (key) => key,
      scoped.activityLogs,
      scoped.reviews
    );
    expect(history.some((item) => item.bookingId === 'B_completed')).toBe(true);
    expect(history.some((item) => item.bookingId === 'B_no_show')).toBe(true);
    expect(history.every((item) => !item.bookingId || item.bookingId.startsWith('B_'))).toBe(true);
  });

  it('fails closed for missing/empty ownership, absent selection and unrelated participants, including self', () => {
    const legacy = [
      lesson('legacy'),
      lesson('empty', []),
      { ...lesson('legacy_course'), isLessonBooking: false },
    ];
    for (const participantId of ['A', 'B', 'participant_self', undefined]) {
      expect(selectBookingsForParticipant(legacy, participantId)).toEqual([]);
    }
    for (const selectedParticipantId of [undefined, 'unmanaged']) {
      const scoped = selectCabinetDataForParticipant({ ...input, selectedParticipantId });
      expect(Object.values(scoped).every((items) => items.length === 0)).toBe(true);
    }
  });

  it('uses explicit ownership for guest/guardian lessons too and never infers it from names', () => {
    expect(
      selectBookingsForParticipant([{ ...lesson('guest', ['B']), bookingOrigin: 'guest' }], 'A')
    ).toEqual([]);
    expect(
      selectBookingsForParticipant([{ ...lesson('guest', ['B']), bookingOrigin: 'guest' }], 'B')
    ).toHaveLength(1);
  });

  it('scopes proposals by their canonical party, including shared proposals', () => {
    const proposals: BookingProposalCabinetItem[] = [['A'], ['B'], ['A', 'B']].map(
      (participantIds, index) => ({
        proposalId: `proposal_${index}`,
        revision: 1,
        participantIds,
        instructorId: 'coach',
        participantDisplayName: 'Same name',
        instructorDisplayName: 'Coach',
        date: '2026-10-02',
        time: '10:00',
        durationHours: 1,
        lifecycleStatus: 'open',
        lifecycleLabel: 'Open',
        sourceScope: 'account_open',
        authorizedActions: { canAccept: true, canDecline: true, canWithdraw: false },
      })
    );
    const scoped = selectCabinetDataForParticipant({
      ...input,
      collaborationProposals: proposals,
      selectedParticipantId: 'B',
    });
    expect(scoped.collaborationProposals.map((item) => item.proposalId)).toEqual([
      'proposal_1',
      'proposal_2',
    ]);
  });
});

describe('cabinet shell participant switching without remounting the cabinet', () => {
  beforeEach(() => {
    useCabinetProgressParticipantSelectionStore.getState().reset();
    useCabinetProgressParticipantSelectionStore
      .getState()
      .syncManagedSet({ accountId: 'account_01', participants, loading: false });
    useCabinetProgressParticipantSelectionStore.getState().selectParticipant('A', participants);
    useParticipantProgressStore.getState().clear();
    useParticipantProgressStore.setState({
      byId: {
        A: {
          participantId: 'A',
          level: 2,
          skillScores: { carving: 20 },
          skillComments: { carving: 'A comment' },
          revision: 1,
        },
        B: {
          participantId: 'B',
          level: 3,
          skillScores: { carving: 30 },
          skillComments: { carving: 'B comment' },
          revision: 1,
        },
      },
    });
    useParticipantLessonFeedbackStore.getState().clear();
    for (const participantId of ['A', 'B']) {
      useParticipantLessonFeedbackStore.getState().replaceParticipantItems(participantId, [
        {
          feedbackId: `feedback_${participantId}` as never,
          participantId: participantId as never,
          lessonBookingId: `lesson${participantId}` as never,
          instructorId: 'coach' as never,
          revision: 1,
          lessonDate: '2026-10-02',
          items: [{ itemId: 'one', text: participantId, completed: false }],
        },
      ]);
    }
  });

  it('rejects stale account, removed and forged selections before reconciliation effects', () => {
    const observed: Array<{ accountId: string; selected?: string }> = [];
    const { rerender } = renderHook(
      (props: { accountId: string; participants: ManagedParticipantOption[] }) => {
        const selection = useCabinetProgressParticipantSelection({ ...props, loading: false });
        observed.push({ accountId: props.accountId, selected: selection.selectedParticipantId });
        return selection;
      },
      { initialProps: { accountId: 'account_01', participants } }
    );
    act(() =>
      useCabinetProgressParticipantSelectionStore.setState({ selectedParticipantId: 'unmanaged' })
    );
    expect(observed.at(-1)?.selected).toBeUndefined();
    act(() =>
      useCabinetProgressParticipantSelectionStore.getState().selectParticipant('A', participants)
    );
    const removalStart = observed.length;
    rerender({ accountId: 'account_01', participants: [participants[1]] });
    expect(observed.slice(removalStart).every((item) => item.selected !== 'A')).toBe(true);
    rerender({ accountId: 'different_account', participants });
    expect(
      observed
        .filter((item) => item.accountId === 'different_account')
        .every((item) => item.selected === undefined)
    ).toBe(true);
  });

  it.each(tabs)('updates %s through A → B → A and keeps account fields stable', (tab) => {
    const accountProfile = {
      uid: 'account_01',
      displayName: 'Account owner',
      email: 'account@example.com',
      phone: '+77000000000',
      avatarUrl: '',
      role: 'user',
      balanceUSD: 25000,
      temperatureUnit: 'C',
      hideProgressTracking: false,
      participantTodayChecklists: {
        A: {
          todaySkillItemIds: ['a_skill'],
          customTodayTasks: [{ id: 'a_task', text: 'A task' }],
          completedTodayTaskIds: [],
          dismissedTodayTaskIds: [],
        },
        B: {
          todaySkillItemIds: ['b_skill'],
          customTodayTasks: [{ id: 'b_task', text: 'B task' }],
          completedTodayTaskIds: ['b_task'],
          dismissedTodayTaskIds: [],
        },
      },
    } as UserProfile;
    const noop = () => undefined;
    const props: StudentCabinetShellProps = {
      ...input,
      userProfile: accountProfile,
      courses: [],
      instructors: [],
      onCancel: noop,
      onChat: noop,
      onOpenLesson: noop,
      onWriteReview: noop,
      onSignOut: noop,
      onLevelBadgeClick: noop,
      onInvalidFile: noop,
      onUploadSuccess: noop,
      onUploadError: noop,
      onViewCourseDetails: noop,
      onRequireCourseAuth: noop,
      onBookInstructor: noop,
      onViewInstructorReviews: noop,
    };
    render(
      <MemoryRouter>
        <HeaderSwitcher />
        <StudentCabinetShell {...props} />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole('button', { name: tab, exact: true }));
    const read = () => JSON.parse(screen.getByTestId('scope').textContent ?? '{}');
    const a = read();
    expect(a.lessons).toEqual(
      tab === 'profile_wallet' ? ['lessonA', 'lessonB', 'lessonAB'] : ['lessonA', 'lessonAB']
    );
    expect(a.feedback).toEqual(['A']);
    fireEvent.click(screen.getByRole('button', { name: 'select B' }));
    const b = read();
    expect(b.lessons).toEqual(tab === 'profile_wallet' ? a.lessons : ['lessonB', 'lessonAB']);
    expect(b.feedback).toEqual(['B']);
    expect(b.profile.level).toBe(3);
    expect(b.profile.skillComments).toEqual({ carving: 'B comment' });
    expect(b.profile.customTodayTasks).toEqual([{ id: 'b_task', text: 'B task' }]);
    for (const field of [
      'uid',
      'displayName',
      'email',
      'phone',
      'balanceUSD',
      'temperatureUnit',
      'hideProgressTracking',
      'participantTodayChecklists',
    ]) {
      expect(b.profile[field]).toEqual(a.profile[field]);
    }
    if (tab === 'home' || tab === 'calendar') {
      expect(b.sessions).toHaveLength(3);
      expect(b.sessions).toEqual(expect.arrayContaining(['lessonB', 'lessonAB', 'enrollment_B']));
    }
    if (tab === 'courses') expect(b.enrollments).toEqual(['enrollment_B']);
    if (tab === 'history' || tab === 'profile_journey') {
      expect(b.reviewLessons).toEqual(['lessonB', 'lessonAB']);
      expect(b.logs).toEqual(['log_lessonB', 'log_lessonAB']);
    }
    fireEvent.click(screen.getByRole('button', { name: 'select A' }));
    expect(read()).toEqual(a);
  });
});
