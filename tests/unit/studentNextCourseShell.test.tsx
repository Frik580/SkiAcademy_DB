import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import {
  StudentCabinetShell,
  type StudentCabinetShellProps,
} from '../../src/features/student-cabinet/components/student/StudentCabinetShell';
import { CabinetParticipantAvatarSwitcher } from '../../src/features/student-cabinet/components/CabinetParticipantAvatarSwitcher';
import { useCabinetProgressParticipantSelection } from '../../src/features/student-cabinet/useCabinetProgressParticipantSelection';
import { useCabinetProgressParticipantSelectionStore } from '../../src/features/student-cabinet/cabinetProgressParticipantSelectionStore';
import { useParticipantProgressStore } from '../../src/features/participant-progress/participantProgressStore';
import { buildMixedCabinetSessionItems } from '../../src/features/course-enrollments/cabinetSessionItems';
import type {
  CabinetSessionItem,
  CourseEnrollmentCabinetItem,
} from '../../src/features/course-enrollments/courseEnrollmentContracts';
import type {
  LessonBookingCabinetItem,
  ManagedParticipantOption,
} from '../../src/features/lesson-bookings/lessonBookingContracts';
import type { TodayProgressBlockInput } from '../../src/features/student-cabinet/components/student/studentCabinetContracts';
import type { StudentCabinetTab } from '../../src/features/student-cabinet/components/student/studentCabinetUtils';
import type { Course, UserProfile } from '../../src/types';
import { selectEnrollmentForCourseParticipant } from '../../src/features/course-enrollments/courseProgressViewModel';

const { managedMock, calendarSpy, coursesSpy, progressSpy } = vi.hoisted(() => ({
  managedMock: vi.fn(),
  calendarSpy: vi.fn(),
  coursesSpy: vi.fn(),
  progressSpy: vi.fn(),
}));
vi.mock('../../src/app/providers/LanguageContext', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/app/providers/LanguageContext')>()),
  useLanguage: () => ({ language: 'en', t: (key: string) => key }),
}));
vi.mock('../../src/features/lesson-bookings/useAccountLessonBookingCalendarMonth', () => ({
  useAccountLessonBookingCalendarMonth: () => ({ loading: false, error: undefined }),
}));
vi.mock('../../src/features/lesson-bookings/useManagedParticipants', () => ({
  useManagedParticipants: managedMock,
}));
vi.mock('../../src/features/student-cabinet/useSelectedParticipantLessonFeedback', () => ({
  useSelectedParticipantLessonFeedback: () => {},
  togglePresentedParticipantLessonFeedbackItem: vi.fn(),
}));
vi.mock('../../src/features/participant-achievements', () => ({
  accountReviewEvidenceFromCanonicalPresentation: () => [],
  usePresentedParticipantAchievements: () => ({ evaluation: undefined }),
  useSelectedParticipantAchievementsRecorder: () => {},
}));
vi.mock('../../src/features/journey', () => ({ YourJourneySection: () => null }));
vi.mock('../../src/features/student-cabinet/components/student/StudentNeedsAttention', () => ({
  StudentNeedsAttention: () => null,
}));
vi.mock('../../src/features/student-cabinet/components/student/LazySkillRadarChart', () => ({
  LazySkillRadarChart: () => null,
}));
vi.mock('../../src/features/student-cabinet/components/student/StudentHomeBottomSections', () => ({
  StudentCabinetWeatherSection: () => null,
  StudentLatestRecommendationSection: () => null,
}));
vi.mock('../../src/features/student-cabinet/components/student/StudentTodayTasksBlock', () => ({
  TodayTasksBlock: () => null,
}));
vi.mock('../../src/features/student-cabinet/components/student/StudentNextStepCard', () => ({
  StudentNextStepCard: () => null,
}));
vi.mock('../../src/features/student-cabinet/components/student/StudentTodayProgressBlock', () => ({
  TodayProgressBlock: (props: TodayProgressBlockInput) => {
    progressSpy(props);
    return (
      <output data-testid="progress-scope">
        {props.selectedParticipantId}:{props.userProfile?.level}
      </output>
    );
  },
}));
vi.mock(
  '../../src/features/student-cabinet/components/student/StudentCabinetPanels',
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import('../../src/features/student-cabinet/components/student/StudentCabinetPanels')
      >();
    return {
      StudentCalendarPanel: (props: React.ComponentProps<typeof actual.StudentCalendarPanel>) => {
        calendarSpy(props);
        return (
          <>
            <actual.StudentCalendarPanel {...props} />
            <output data-testid="calendar-scope">
              {props.sessionItems
                .filter((item) => item.kind === 'course_day')
                .map((item) => item.enrollmentId)
                .join(',')}
            </output>
          </>
        );
      },
      StudentCoursesPanel: (props: { courseEnrollments: CourseEnrollmentCabinetItem[] }) => {
        coursesSpy(props);
        return (
          <output data-testid="courses-scope">
            {props.courseEnrollments.map((item) => item.enrollmentId).join(',')}
          </output>
        );
      },
      StudentDevelopmentPanel: () => null,
      StudentTrainingPanel: () => null,
    };
  }
);
vi.mock('../../src/features/student-cabinet/components/student/StudentHistoryPanel', () => ({
  StudentHistoryPanel: () => null,
}));
vi.mock('../../src/features/student-cabinet/components/student/StudentCoachPanel', () => ({
  StudentCoachPanel: () => null,
}));
vi.mock('../../src/features/student-cabinet/components/student/BookInstructorPickerModal', () => ({
  BookInstructorPickerModal: () => null,
}));
vi.mock('../../src/features/student-cabinet/components/student/StudentProfilePanels', () => ({
  StudentProfileHubPanel: () => null,
  StudentProfilePersonalPanel: () => null,
  StudentProfileParticipantsPanel: () => null,
  StudentProfileWalletPanel: () => null,
  StudentProfileJourneyPanel: () => null,
  StudentProfileSkillsPanel: () => null,
  StudentProfileCertificatesPanel: () => null,
  StudentProfileAchievementsPanel: () => null,
  StudentProfileSeasonPanel: () => null,
  StudentProfileVideosPanel: () => null,
  StudentProfilePreferencesPanel: () => null,
}));
vi.mock(
  '../../src/features/student-cabinet/components/student/StudentCabinetUI',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('../../src/features/student-cabinet/components/student/StudentCabinetUI')
    >()),
    StudentCabinetTabBar: ({ onSelect }: { onSelect: (tab: StudentCabinetTab) => void }) => (
      <nav>
        {(['home', 'calendar', 'courses'] as const).map((tab) => (
          <button key={tab} onClick={() => onSelect(tab)}>
            {tab}
          </button>
        ))}
      </nav>
    ),
  })
);

const accountId = 'account_next_course';
const participants: ManagedParticipantOption[] = ['a', 'b'].map((id) => ({
  participantId: id,
  participantManagementId: 'management_' + id,
  displayName: id === 'a' ? 'Alice Full Name' : 'Bob Full Name',
  avatarUrl: '/' + id + '.png',
  authority: 'parent_guardian',
  discipline: 'ski',
  skillLevel: 'beginner',
  age: { kind: 'age_years', years: 12 },
  revision: 1,
}));
function enrollment(
  enrollmentId: string,
  participantId: string,
  lifecycleStatus: CourseEnrollmentCabinetItem['lifecycleStatus'] = 'confirmed'
): CourseEnrollmentCabinetItem {
  return {
    enrollmentId,
    participantId,
    participantName: participantId,
    courseId: 'course_c',
    courseTitle: 'Shared Alpine Course',
    revision: 1,
    lifecycleStatus,
    scheduleStartDate: '2026-10-03',
    scheduleEndDate: '2026-10-03',
    bookingOrigin: 'account',
    updatedAtSeconds: 1,
    authorizedActions: { canWithdraw: false, canRequestCancellation: false },
    courseSchedule: {
      courseId: 'course_c',
      courseScheduleRevision: 1,
      courseDayCount: 1,
      startAt: { seconds: 1791003600, nanoseconds: 0 },
      finalCourseDayEndsAt: { seconds: 1791007200, nanoseconds: 0 },
      courseDays: [
        {
          courseDayId: 'day_c',
          dayOrder: 1,
          revision: 1,
          timeZone: 'Asia/Almaty',
          interval: {
            startsAt: { seconds: 1791003600, nanoseconds: 0 },
            endsAt: { seconds: 1791007200, nanoseconds: 0 },
          },
        },
      ],
    },
  };
}
function shellProps(
  enrollments = [enrollment('ea', 'a'), enrollment('eb', 'b')]
): StudentCabinetShellProps {
  return {
    userProfile: {
      uid: accountId,
      displayName: 'Account Owner',
      role: 'user',
      email: 'owner@example.test',
      hideProgressTracking: true,
    } as UserProfile,
    bookings: [],
    courses: [
      {
        id: 'course_c',
        title: 'Shared Alpine Course',
        duration: '1 day',
        description: '',
        dates: '2026-10-03',
        totalSeats: 8,
        availableSeats: 6,
        price: 10000,
        bgImageUrl: '',
      },
    ],
    instructors: [],
    reviews: [],
    unreviewedCompletedBookings: [],
    courseEnrollments: enrollments,
    sessionItems: buildMixedCabinetSessionItems({
      lessonBookings: [],
      courseEnrollments: enrollments,
    }),
    onCancel: vi.fn(),
    onChat: vi.fn(),
    onOpenLesson: vi.fn(),
    onWriteReview: vi.fn(),
    onSignOut: vi.fn(),
    onLevelBadgeClick: vi.fn(),
    onInvalidFile: vi.fn(),
    onUploadSuccess: vi.fn(),
    onUploadError: vi.fn(),
    onViewCourseDetails: vi.fn(),
    onRequireCourseAuth: vi.fn(),
    onBookInstructor: vi.fn(),
    onViewInstructorReviews: vi.fn(),
  };
}
function Header() {
  const selection = useCabinetProgressParticipantSelection({
    accountId,
    participants,
    loading: false,
  });
  return (
    <CabinetParticipantAvatarSwitcher
      items={participants}
      selectedParticipantId={selection.selectedParticipantId}
      onSelect={selection.selectParticipant}
      fallbackDisplayName="Account"
      groupLabel="header"
      switchToParticipantLabel="Select {name}"
    />
  );
}
function setup(props = shellProps()) {
  return render(
    <MemoryRouter>
      <Header />
      <StudentCabinetShell {...props} />
    </MemoryRouter>
  );
}
function assertCourseCard() {
  const lists = screen.getAllByRole('list', { name: 'bookingParticipantsLabel' });
  expect(lists).toHaveLength(1);
  const people = within(lists[0]).getAllByRole('listitem');
  expect(people).toHaveLength(2);
  expect(within(lists[0]).getByText('Alice Full Name')).toBeInTheDocument();
  expect(within(lists[0]).getByText('Bob Full Name')).toBeInTheDocument();
  expect(people.map((person) => person.querySelector('img')?.getAttribute('src'))).toEqual([
    '/a.png',
    '/b.png',
  ]);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(Date, 'now').mockReturnValue(new Date('2026-10-02T12:00:00').getTime());
  // Preserve native timers for userEvent; only freeze the Date constructor.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-02T12:00:00'));
  managedMock.mockReturnValue({ participants, loading: false, error: undefined, reload: vi.fn() });
  useCabinetProgressParticipantSelectionStore.getState().reset();
  useCabinetProgressParticipantSelectionStore
    .getState()
    .syncManagedSet({ accountId, participants, loading: false });
  useCabinetProgressParticipantSelectionStore.getState().selectParticipant('a', participants);
  useParticipantProgressStore.getState().clear();
  useParticipantProgressStore.getState().setItems(
    ['a', 'b'].map((participantId, index) => ({
      participantId,
      level: index + 2,
      skillScores: {},
      skillComments: {},
      revision: 1,
    }))
  );
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('Shell → Home → next course card', () => {
  it('opens details for the header participant instead of the representative enrollment', async () => {
    const user = userEvent.setup();
    const props = shellProps();
    const viewDetails = vi.fn(
      (course: Course, enrollmentId?: string) =>
        selectEnrollmentForCourseParticipant({
          enrollments: props.courseEnrollments ?? [],
          courseId: course.id,
          selectedParticipantId:
            useCabinetProgressParticipantSelectionStore.getState().selectedParticipantId,
          enrollmentId,
        })?.enrollmentId
    );
    props.onViewCourseDetails = viewDetails;
    setup(props);
    await user.click(screen.getByRole('button', { name: 'scMoreDetails' }));
    expect(viewDetails.mock.results.at(-1)?.value).toBe('ea');
    await user.click(screen.getByRole('button', { name: 'Select Bob Full Name' }));
    assertCourseCard();
    await user.click(screen.getByRole('button', { name: 'scMoreDetails' }));
    expect(viewDetails.mock.lastCall).toEqual([props.courses[0], undefined]);
    expect(viewDetails.mock.results.at(-1)?.value).toBe('eb');
  });
  it('shows A+B once across real header switches, while calendar, courses and progress stay scoped', async () => {
    const user = userEvent.setup();
    setup();
    assertCourseCard();
    expect(screen.getByTestId('progress-scope')).toHaveTextContent('a:2');
    await user.click(screen.getByRole('button', { name: 'Select Bob Full Name' }));
    assertCourseCard();
    expect(screen.getByTestId('progress-scope')).toHaveTextContent('b:3');
    await user.click(screen.getByRole('button', { name: 'calendar', exact: true }));
    expect(screen.getByTestId('calendar-scope')).toHaveTextContent('eb');
    expect(
      calendarSpy.mock.lastCall?.[0].sessionItems.map(
        (item: CabinetSessionItem) => item.kind === 'course_day' && item.participantId
      )
    ).toEqual(['b']);
    await user.click(screen.getByRole('button', { name: 'Select Alice Full Name' }));
    expect(screen.getByTestId('calendar-scope')).toHaveTextContent('ea');
    await user.click(screen.getByRole('button', { name: 'courses', exact: true }));
    expect(
      coursesSpy.mock.lastCall?.[0].courseEnrollments.map(
        (item: CourseEnrollmentCabinetItem) => item.participantId
      )
    ).toEqual(['a']);
    await user.click(screen.getByRole('button', { name: 'Select Bob Full Name' }));
    expect(
      coursesSpy.mock.lastCall?.[0].courseEnrollments.map(
        (item: CourseEnrollmentCabinetItem) => item.participantId
      )
    ).toEqual(['b']);
    await user.click(screen.getByRole('button', { name: 'home', exact: true }));
    assertCourseCard();
  });

  it('deduplicates participant IDs and excludes cancelled/completed enrollments through account state', () => {
    setup(
      shellProps([
        enrollment('ea', 'a'),
        enrollment('eb', 'b'),
        enrollment('eb_again', 'b'),
        enrollment('cancelled', 'cancelled_child', 'cancelled'),
        enrollment('completed', 'completed_child', 'completed'),
      ])
    );
    assertCourseCard();
    expect(screen.queryByText('cancelled_child')).not.toBeInTheDocument();
    expect(screen.queryByText('completed_child')).not.toBeInTheDocument();
  });

  it('retains both course participants even when the header selection is temporarily absent', () => {
    setup();
    act(() =>
      useCabinetProgressParticipantSelectionStore.setState({ selectedParticipantId: undefined })
    );
    assertCourseCard();
  });
});

function lesson(
  id: string,
  participantIds: string[],
  status: LessonBookingCabinetItem['status'] = 'confirmed'
): LessonBookingCabinetItem {
  return {
    id,
    bookingId: id,
    revision: 1,
    status,
    date: status === 'completed' ? '2026-10-01' : '2026-10-04',
    time: '10:00',
    durationHours: 1,
    instructorId: 'coach_' + id,
    instructorName: 'Coach ' + id,
    instructorAvatar: '',
    participantIds,
    participantDisplayNames: Object.fromEntries(participantIds.map((id) => [id, id])),
    participantNames: participantIds,
    partyKind: participantIds.length > 1 ? 'family_group' : 'individual',
    payment: { kind: 'withheld' },
    bookingOrigin: 'account',
    isLessonBooking: true,
    clientExercisedCapability: 'parent_guardian',
    authorizedActions: {
      canRequestCancellation: true,
      canWithdrawCancellation: false,
      canReschedule: true,
    },
  };
}
function lessonShellProps() {
  const props = shellProps();
  props.bookings = [lesson('only_a', ['a']), lesson('only_b', ['b']), lesson('shared', ['a', 'b'])];
  props.unreviewedCompletedBookings = [
    lesson('done_a', ['a'], 'completed'),
    lesson('done_b', ['b'], 'completed'),
    lesson('done_shared', ['a', 'b'], 'completed'),
  ];
  props.bookings = [...props.bookings, ...props.unreviewedCompletedBookings];
  props.sessionItems = buildMixedCabinetSessionItems({
    lessonBookings: props.bookings,
    courseEnrollments: props.courseEnrollments ?? [],
  });
  props.hasUnreadChat = vi.fn(() => true);
  props.onRescheduleBooking = vi.fn();
  return props;
}

describe('Shell → real BookingsPanel → ClientBookingsList participant isolation', () => {
  it('updates single and shared lessons through the header without reload and keeps course filtering', async () => {
    const user = userEvent.setup();
    const props = lessonShellProps();
    setup(props);
    expect(screen.getByText('Coach only_a')).toBeInTheDocument();
    expect(screen.getByText('Coach only_b')).toBeInTheDocument();
    vi.mocked(props.hasUnreadChat!).mockClear();
    await user.click(screen.getByRole('button', { name: 'calendar', exact: true }));
    expect(screen.getByText('Coach only_a')).toBeInTheDocument();
    expect(screen.queryByText('Coach only_b')).not.toBeInTheDocument();
    expect(screen.getByText('Coach shared')).toBeInTheDocument();
    expect(
      calendarSpy.mock.lastCall?.[0].bookings.map((b: LessonBookingCabinetItem) => b.id)
    ).toEqual(['only_a', 'shared', 'done_a', 'done_shared']);
    expect(screen.getByTestId('calendar-scope')).toHaveTextContent('ea');
    expect(props.hasUnreadChat).not.toHaveBeenCalledWith('only_b');
    expect(
      screen.getAllByTitle('chatNewMessages').filter((element) => element.tagName === 'BUTTON')
    ).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: 'cancelBookingRefund' })).toHaveLength(2);
    await user.click(
      screen.getAllByTitle('chatNewMessages').filter((element) => element.tagName === 'BUTTON')[0]
    );
    expect(props.onChat).toHaveBeenCalledWith(props.bookings[0]);
    await user.click(screen.getAllByRole('button', { name: 'cancelBookingRefund' })[0]);
    expect(props.onCancel).toHaveBeenCalledWith(props.bookings[0]);
    await user.click(screen.getAllByRole('button', { name: 'rescheduleBtn' })[0]);
    expect(props.onRescheduleBooking).toHaveBeenCalledWith(props.bookings[0]);
    await user.click(screen.getByRole('button', { name: 'Select Bob Full Name' }));
    expect(screen.queryByText('Coach only_a')).not.toBeInTheDocument();
    expect(screen.getByText('Coach only_b')).toBeInTheDocument();
    expect(screen.getByText('Coach shared')).toBeInTheDocument();
    expect(screen.getByTestId('calendar-scope')).toHaveTextContent('eb');
    expect(
      calendarSpy.mock.lastCall?.[0].bookings.map((b: LessonBookingCabinetItem) => b.id)
    ).toEqual(['only_b', 'shared', 'done_b', 'done_shared']);
    await user.click(screen.getByRole('button', { name: 'home', exact: true }));
    expect(screen.getByText('Coach only_a')).toBeInTheDocument();
    expect(screen.getByText('Coach only_b')).toBeInTheDocument();
  });

  it('scopes completed lessons and review prompts to each selected participant', async () => {
    const user = userEvent.setup();
    const props = lessonShellProps();
    setup(props);
    await user.click(screen.getByRole('button', { name: 'calendar', exact: true }));
    expect(
      calendarSpy.mock.lastCall?.[0].unreviewedCompletedBookings.map(
        (b: LessonBookingCabinetItem) => b.id
      )
    ).toEqual(['done_a', 'done_shared']);
    await user.click(screen.getByRole('button', { name: 'scCalendarPast' }));
    expect(screen.getByText('Coach done_a')).toBeInTheDocument();
    expect(screen.queryByText('Coach done_b')).not.toBeInTheDocument();
    expect(screen.getByText('Coach done_shared')).toBeInTheDocument();
    const reviewButtons = screen.getAllByRole('button', { name: 'writeReviewBtn' });
    expect(reviewButtons).toHaveLength(2);
    await user.click(reviewButtons[0]);
    expect(props.onWriteReview).toHaveBeenCalledWith(props.bookings.find((b) => b.id === 'done_a'));
    await user.click(screen.getByRole('button', { name: 'Select Bob Full Name' }));
    expect(
      calendarSpy.mock.lastCall?.[0].unreviewedCompletedBookings.map(
        (b: LessonBookingCabinetItem) => b.id
      )
    ).toEqual(['done_b', 'done_shared']);
    await user.click(screen.getByRole('button', { name: 'scCalendarPast' }));
    expect(screen.queryByText('Coach done_a')).not.toBeInTheDocument();
    expect(screen.getByText('Coach done_b')).toBeInTheDocument();
    expect(screen.getByText('Coach done_shared')).toBeInTheDocument();
  });

  it('preserves account lesson lists when selection is absent', async () => {
    const user = userEvent.setup();
    const props = lessonShellProps();
    setup(props);
    await user.click(screen.getByRole('button', { name: 'calendar', exact: true }));
    act(() =>
      useCabinetProgressParticipantSelectionStore.setState({ selectedParticipantId: undefined })
    );
    expect(calendarSpy.mock.lastCall?.[0].bookings).toEqual(props.bookings);
    expect(calendarSpy.mock.lastCall?.[0].unreviewedCompletedBookings).toEqual(
      props.unreviewedCompletedBookings
    );
    expect(screen.getByText('Coach only_a')).toBeInTheDocument();
    expect(screen.getByText('Coach only_b')).toBeInTheDocument();
    expect(screen.getByText('Coach shared')).toBeInTheDocument();
    expect(screen.getByTestId('calendar-scope')).toBeEmptyDOMElement();
  });
});
