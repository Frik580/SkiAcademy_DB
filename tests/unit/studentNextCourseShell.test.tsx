import { buildResortConditionsPresentation } from '../../src/features/resort-conditions';
import { toYMD } from '../../src/features/student-cabinet/components/student/studentCabinetPresentation';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
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
  StudentCabinetWeatherSection: () => <output data-testid="weather-widget" />,
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
const participants: ManagedParticipantOption[] = ['a', 'b', 'c'].map((id) => ({
  participantId: id,
  participantManagementId: 'management_' + id,
  displayName: id === 'a' ? 'Alice Full Name' : id === 'b' ? 'Bob Full Name' : 'Charlie Full Name',
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
    resortSnapshot: buildResortConditionsPresentation({ status: 'loading', data: null }, 'celsius'),
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

describe('Shell → real BookingsPanel → account-level ClientBookingsList', () => {
  it('keeps account lessons and their participants through header switches while the calendar stays scoped', async () => {
    const user = userEvent.setup();
    const props = lessonShellProps();
    setup(props);
    expect(screen.getByText('Coach only_a')).toBeInTheDocument();
    expect(screen.getByText('Coach only_b')).toBeInTheDocument();
    vi.mocked(props.hasUnreadChat!).mockClear();
    await user.click(screen.getByRole('button', { name: 'calendar', exact: true }));
    expect(screen.getByText('Coach only_a')).toBeInTheDocument();
    expect(screen.getByText('Coach only_b')).toBeInTheDocument();
    expect(screen.getByText('Coach shared')).toBeInTheDocument();
    expect(
      calendarSpy.mock.lastCall?.[0].bookings.map((b: LessonBookingCabinetItem) => b.id)
    ).toEqual(['only_a', 'shared', 'done_a', 'done_shared']);
    expect(screen.getByTestId('calendar-scope')).toHaveTextContent('ea');
    const assertMembership = () => {
      const cards = screen.getAllByTestId('lesson-booking-card');
      expect(cards).toHaveLength(3);
      for (const [id, names] of [
        ['only_a', ['Alice Full Name']],
        ['only_b', ['Bob Full Name']],
        ['shared', ['Alice Full Name', 'Bob Full Name']],
      ] as const) {
        const card = document.getElementById('booking-card-' + id)!;
        const people = within(card).getByRole('list', { name: 'bookingParticipantsLabel' });
        expect(
          within(people)
            .getAllByRole('listitem')
            .map((person) => person.textContent)
        ).toEqual(names);
        expect(people.querySelector('img')).toHaveAttribute(
          'src',
          id === 'only_b' ? '/b.png' : '/a.png'
        );
      }
      const courseCards = screen.getAllByTestId('course-enrollment-card');
      expect(courseCards).toHaveLength(2);
      expect(
        within(courseCards.find((card) => card.dataset.enrollmentId === 'ea')!).getByText(
          'Alice Full Name'
        )
      ).toBeInTheDocument();
      expect(
        within(courseCards.find((card) => card.dataset.enrollmentId === 'eb')!).getByText(
          'Bob Full Name'
        )
      ).toBeInTheDocument();
    };
    assertMembership();
    expect(props.hasUnreadChat).toHaveBeenCalledWith('only_b');
    expect(
      screen.getAllByTitle('chatNewMessages').filter((element) => element.tagName === 'BUTTON')
    ).toHaveLength(3);
    expect(screen.getAllByRole('button', { name: 'cancelBookingRefund' })).toHaveLength(3);
    await user.click(
      screen.getAllByTitle('chatNewMessages').filter((element) => element.tagName === 'BUTTON')[0]
    );
    expect(props.onChat).toHaveBeenCalledWith(props.bookings[0]);
    await user.click(screen.getAllByRole('button', { name: 'cancelBookingRefund' })[0]);
    expect(props.onCancel).toHaveBeenCalledWith(props.bookings[0]);
    await user.click(screen.getAllByRole('button', { name: 'rescheduleBtn' })[0]);
    expect(props.onRescheduleBooking).toHaveBeenCalledWith(props.bookings[0]);
    await user.click(screen.getByRole('button', { name: 'Select Bob Full Name' }));
    expect(screen.getByText('Coach only_a')).toBeInTheDocument();
    expect(screen.getByText('Coach only_b')).toBeInTheDocument();
    expect(screen.getByText('Coach shared')).toBeInTheDocument();
    expect(screen.getByTestId('calendar-scope')).toHaveTextContent('eb');
    assertMembership();
    expect(
      calendarSpy.mock.lastCall?.[0].bookings.map((b: LessonBookingCabinetItem) => b.id)
    ).toEqual(['only_b', 'shared', 'done_b', 'done_shared']);
    await user.click(screen.getByRole('button', { name: 'Select Charlie Full Name' }));
    assertMembership();
    expect(calendarSpy.mock.lastCall?.[0].sessionItems).toEqual([]);
    await user.click(screen.getByRole('button', { name: 'home', exact: true }));
    expect(screen.getByText('Coach only_a')).toBeInTheDocument();
    expect(screen.getByText('Coach only_b')).toBeInTheDocument();
  });

  it('keeps all completed lessons, review actions and the past tab through header switches', async () => {
    const user = userEvent.setup();
    const props = lessonShellProps();
    setup(props);
    await user.click(screen.getByRole('button', { name: 'calendar', exact: true }));
    expect(
      calendarSpy.mock.lastCall?.[0].unreviewedCompletedBookings.map(
        (b: LessonBookingCabinetItem) => b.id
      )
    ).toEqual(['done_a', 'done_b', 'done_shared']);
    await user.click(screen.getByRole('button', { name: 'scCalendarPast' }));
    expect(screen.getByText('Coach done_a')).toBeInTheDocument();
    expect(screen.getByText('Coach done_b')).toBeInTheDocument();
    expect(screen.getByText('Coach done_shared')).toBeInTheDocument();
    const reviewButtons = screen.getAllByRole('button', { name: 'writeReviewBtn' });
    expect(reviewButtons).toHaveLength(3);
    await user.click(reviewButtons[0]);
    expect(props.onWriteReview).toHaveBeenCalledWith(props.bookings.find((b) => b.id === 'done_a'));
    await user.click(screen.getByRole('button', { name: 'Select Bob Full Name' }));
    expect(
      calendarSpy.mock.lastCall?.[0].unreviewedCompletedBookings.map(
        (b: LessonBookingCabinetItem) => b.id
      )
    ).toEqual(['done_a', 'done_b', 'done_shared']);
    expect(screen.getByText('Coach done_a')).toBeInTheDocument();
    expect(screen.getByText('Coach done_b')).toBeInTheDocument();
    expect(screen.getByText('Coach done_shared')).toBeInTheDocument();
  });

  it('keeps four course days as one enrollment card for B with the account avatar while A is selected', async () => {
    const user = userEvent.setup();
    const props = shellProps([enrollment('eb', 'b')]);
    const first = props.sessionItems![0];
    if (first.kind !== 'course_day') throw new Error('expected course day');
    props.sessionItems = Array.from({ length: 4 }, (_, index) => ({
      ...first,
      courseDayId: 'day_' + index,
      date: '2026-10-0' + (3 + index),
      dayOrder: index + 1,
    }));
    setup(props);
    await user.click(screen.getByRole('button', { name: 'calendar', exact: true }));
    const cards = screen.getAllByTestId('course-enrollment-card');
    expect(cards).toHaveLength(1);
    expect(cards[0]).toHaveAttribute('data-enrollment-id', 'eb');
    const people = within(cards[0]).getByRole('list', { name: 'bookingParticipantsLabel' });
    expect(within(people).getAllByRole('listitem')).toHaveLength(1);
    expect(within(people).getByText('Bob Full Name')).toBeInTheDocument();
    expect(people.querySelector('img')).toHaveAttribute('src', '/b.png');
    expect(within(cards[0]).getByText('scGroupCourse · 4 scCourseDayMany')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'scMoreDetails' }));
    expect(props.onViewCourseDetails).toHaveBeenCalledWith(props.courses[0], 'eb');
    await user.click(screen.getByRole('button', { name: 'Select Bob Full Name' }));
    expect(screen.getAllByTestId('course-enrollment-card')).toHaveLength(1);
    expect(
      within(screen.getByTestId('course-enrollment-card')).getByText('Bob Full Name')
    ).toBeInTheDocument();
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

function lessonProps(
  participantIds = ['a'],
  status: LessonBookingCabinetItem['status'] = 'confirmed',
  date = toYMD(new Date())
) {
  const todayLesson = { ...lesson('today_lesson', participantIds, status), date };
  const props = shellProps([]);
  props.bookings = [todayLesson];
  props.sessionItems = buildMixedCabinetSessionItems({
    lessonBookings: [todayLesson],
    courseEnrollments: [],
  });
  return props;
}
function selectHeader(participantId: string) {
  act(() =>
    useCabinetProgressParticipantSelectionStore
      .getState()
      .selectParticipant(participantId, participants)
  );
}

describe('account-level weather visibility', () => {
  it.each(['a', 'b', 'c'])(
    'shows A lesson today regardless of header participant %s',
    (selected) => {
      selectHeader(selected);
      setup(lessonProps());
      expect(screen.getByTestId('weather-widget')).toBeInTheDocument();
    }
  );
  it('hides weather when all account sessions are on another day', () => {
    setup(); // Both course days are tomorrow.
    expect(screen.queryByTestId('weather-widget')).not.toBeInTheDocument();
  });
  it('shows B CourseDay today with A selected', () => {
    vi.setSystemTime(new Date('2026-10-03T12:00:00'));
    setup(shellProps([enrollment('eb', 'b')]));
    expect(screen.getByTestId('weather-widget')).toBeInTheDocument();
  });
  it.each(['cancelled', 'rejected', 'completed'] as const)('ignores %s lessons today', (status) => {
    setup(lessonProps(['a'], status));
    expect(screen.queryByTestId('weather-widget')).not.toBeInTheDocument();
  });
  it.each(['confirmed', 'pending'] as const)(
    'retains existing active %s lesson semantics',
    (status) => {
      setup(lessonProps(['a'], status));
      expect(screen.getByTestId('weather-widget')).toBeInTheDocument();
    }
  );
  it('shows one multi-participant lesson when C is selected', () => {
    selectHeader('c');
    setup(lessonProps(['a', 'b']));
    expect(screen.getAllByTestId('weather-widget')).toHaveLength(1);
  });
  it('remains visible through actual A → B → C header switches and keeps calendar isolated', async () => {
    const user = userEvent.setup();
    setup(lessonProps());
    expect(screen.getByTestId('weather-widget')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Select Bob Full Name' }));
    expect(screen.getByTestId('weather-widget')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Select Charlie Full Name' }));
    expect(screen.getByTestId('weather-widget')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'calendar', exact: true }));
    expect(calendarSpy.mock.lastCall?.[0].sessionItems).toEqual([]);
    await user.click(screen.getByRole('button', { name: 'Select Alice Full Name' }));
    expect(calendarSpy.mock.lastCall?.[0].sessionItems).toHaveLength(1);
  });
  it.each(['confirmed', 'pending', 'pending_cancellation'] as const)(
    'shows active %s CourseDay today',
    (status) => {
      vi.setSystemTime(new Date('2026-10-03T12:00:00'));
      setup(shellProps([enrollment('eb', 'b', status)]));
      expect(screen.getByTestId('weather-widget')).toBeInTheDocument();
    }
  );
  it.each(['cancelled', 'withdrawn', 'completed'] as const)(
    'ignores inactive %s course enrollments',
    (status) => {
      vi.setSystemTime(new Date('2026-10-03T12:00:00'));
      setup(shellProps([enrollment('eb', 'b', status)]));
      expect(screen.queryByTestId('weather-widget')).not.toBeInTheDocument();
    }
  );
  it('keeps a lesson on the local day just after midnight, even on the previous UTC date', () => {
    const localMidnight = new Date('2026-10-03T00:05:00');
    vi.setSystemTime(localMidnight);
    setup(lessonProps(['a'], 'confirmed', '2026-10-03'));
    expect(screen.getByTestId('weather-widget')).toBeInTheDocument();
  });
  it('shows CourseDay normalized in the resort timezone across the UTC midnight boundary', () => {
    vi.setSystemTime(new Date('2026-10-03T00:05:00'));
    const course = enrollment('midnight_b', 'b');
    const day = course.courseSchedule.courseDays[0];
    const midnightCourse = {
      ...course,
      courseSchedule: {
        ...course.courseSchedule,
        courseDays: [
          {
            ...day,
            interval: {
              startsAt: { seconds: Date.parse('2026-10-02T19:10:00Z') / 1000, nanoseconds: 0 },
              endsAt: { seconds: Date.parse('2026-10-02T20:10:00Z') / 1000, nanoseconds: 0 },
            },
          },
        ],
      },
    };
    const props = shellProps([midnightCourse]);
    expect(props.sessionItems?.[0]).toMatchObject({ kind: 'course_day', date: '2026-10-03' });
    setup(props);
    expect(screen.getByTestId('weather-widget')).toBeInTheDocument();
  });
  it('hides weather for an account with no sessions', () => {
    setup(shellProps([]));
    expect(screen.queryByTestId('weather-widget')).not.toBeInTheDocument();
  });
  it('hides yesterday lesson just after local midnight', () => {
    vi.setSystemTime(new Date('2026-10-03T00:05:00'));
    setup(lessonProps(['a'], 'confirmed', '2026-10-02'));
    expect(screen.queryByTestId('weather-widget')).not.toBeInTheDocument();
  });
});

function countdownCard() {
  return screen.getByText('scCountdownToSession').parentElement!;
}
function upcomingLesson(id: string, ids: string[], time: string) {
  return { ...lesson(id, ids), date: '2026-10-02', time };
}
function countdownProps(bookings: LessonBookingCabinetItem[]) {
  const props = shellProps([]);
  props.bookings = bookings;
  props.sessionItems = buildMixedCabinetSessionItems({
    lessonBookings: bookings,
    courseEnrollments: [],
  });
  return props;
}

function currentCards() {
  return Array.from(screen.getByText('scCurrentSessions').nextElementSibling!.children);
}

function currentPeople(card: HTMLElement) {
  return within(card).getByRole('list', { name: 'bookingParticipantsLabel' });
}

describe('account-level current sessions through the real header', () => {
  it('keeps B, the instructor, card instance, and booking actions through A → B → A', () => {
    vi.setSystemTime(new Date('2026-10-02T12:30:00'));
    const booking = upcomingLesson('current_b', ['b'], '12:00');
    const props = countdownProps([booking]);
    props.usersList = [
      {
        uid: 'coach_user',
        instructorId: booking.instructorId,
        phoneNumber: '+7 777 123 45 67',
      } as UserProfile,
    ];
    setup(props);
    const card = currentCards()[0] as HTMLElement;
    const people = currentPeople(card);
    const assertCard = () => {
      expect(currentCards()).toHaveLength(1);
      expect(currentCards()[0]).toBe(card);
      expect(currentPeople(card)).toBe(people);
      expect(
        within(people)
          .getAllByRole('listitem')
          .map((item) => item.textContent)
      ).toEqual(['Bob Full Name']);
      expect(people.querySelector('img')).toHaveAttribute('src', '/b.png');
      expect(within(card).getByText('Coach current_b')).toBeInTheDocument();
      expect(within(people).queryByText('Coach current_b')).not.toBeInTheDocument();
      expect(within(card).getByRole('link', { name: 'scCallCoach' })).toHaveAttribute(
        'href',
        'tel:+77771234567'
      );
      fireEvent.click(within(card).getByRole('button', { name: 'scMoreDetails' }));
      expect(props.onOpenLesson).toHaveBeenLastCalledWith(booking);
      fireEvent.click(within(card).getByRole('button', { name: 'chat', exact: true }));
      expect(props.onChat).toHaveBeenLastCalledWith(booking);
    };
    assertCard();
    fireEvent.click(screen.getByRole('button', { name: 'Select Bob Full Name' }));
    assertCard();
    fireEvent.click(screen.getByRole('button', { name: 'Select Alice Full Name' }));
    assertCard();
  });

  it('shows A+B with account avatars when C is selected and preserves the card on switching', () => {
    vi.setSystemTime(new Date('2026-10-02T12:30:00'));
    selectHeader('c');
    setup(countdownProps([upcomingLesson('current_shared', ['a', 'b'], '12:00')]));
    const card = currentCards()[0] as HTMLElement;
    const people = currentPeople(card);
    expect(
      within(people)
        .getAllByRole('listitem')
        .map((item) => item.textContent)
    ).toEqual(['Alice Full Name', 'Bob Full Name']);
    expect([...people.querySelectorAll('img')].map((img) => img.getAttribute('src'))).toEqual([
      '/a.png',
      '/b.png',
    ]);
    fireEvent.click(screen.getByRole('button', { name: 'Select Alice Full Name' }));
    expect(currentCards()[0]).toBe(card);
    expect(currentPeople(card)).toHaveTextContent('Alice Full NameBob Full Name');
  });

  it('uses the existing avatar fallback for a participant without an image', () => {
    vi.setSystemTime(new Date('2026-10-02T12:30:00'));
    managedMock.mockReturnValue({
      participants: participants.map((person) =>
        person.participantId === 'b' ? { ...person, avatarUrl: undefined } : person
      ),
      loading: false,
      error: undefined,
      reload: vi.fn(),
    });
    setup(countdownProps([upcomingLesson('current_fallback', ['b'], '12:00')]));
    const people = currentPeople(currentCards()[0] as HTMLElement);
    expect(people.querySelector('img')).toBeNull();
    expect(people.querySelector('[data-participant-avatar-face]')).toHaveTextContent('B');
    expect(within(people).getByText('Bob Full Name')).toBeInTheDocument();
  });

  it('keeps active enrollment B scoped to B and its actions while header A is selected', () => {
    vi.setSystemTime(new Date('2026-10-03T10:30:00+05:00'));
    const props = shellProps();
    props.sessionItems = props.sessionItems!.map((item) =>
      item.kind === 'course_day' && item.participantId === 'a'
        ? { ...item, time: '16:00', endTime: '17:00' }
        : item
    );
    setup(props);
    const card = currentCards()[0] as HTMLElement;
    expect(currentCards()).toHaveLength(1);
    expect(
      within(currentPeople(card))
        .getAllByRole('listitem')
        .map((item) => item.textContent)
    ).toEqual(['Bob Full Name']);
    for (const name of ['Select Bob Full Name', 'Select Alice Full Name']) {
      fireEvent.click(screen.getByRole('button', { name }));
      expect(currentCards()[0]).toBe(card);
      fireEvent.click(within(card).getByRole('button', { name: 'scMoreDetails' }));
      expect(props.onViewCourseDetails).toHaveBeenLastCalledWith(props.courses[0], 'eb');
    }
  });

  it('renders simultaneous enrollments as independent cards with their own participants and actions', () => {
    vi.setSystemTime(new Date('2026-10-03T10:30:00+05:00'));
    const props = shellProps();
    setup(props);
    expect(currentCards()).toHaveLength(2);
    for (const element of currentCards()) {
      const card = element as HTMLElement;
      const people = currentPeople(card);
      expect(within(people).getAllByRole('listitem')).toHaveLength(1);
      const enrollmentId = people.textContent === 'Alice Full Name' ? 'ea' : 'eb';
      expect(people.textContent).toBe(enrollmentId === 'ea' ? 'Alice Full Name' : 'Bob Full Name');
      fireEvent.click(within(card).getByRole('button', { name: 'scMoreDetails' }));
      expect(props.onViewCourseDetails).toHaveBeenLastCalledWith(props.courses[0], enrollmentId);
    }
  });
});

describe('account-level countdown through the real header', () => {
  it('selects B at 14:00 ahead of A at 16:00 and preserves the running timer through A → B → C switches', () => {
    vi.useRealTimers();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-02T12:00:00'));
    const intervals = vi.spyOn(window, 'setInterval');
    setup(
      countdownProps([
        upcomingLesson('later_a', ['a'], '16:00'),
        upcomingLesson('nearest_b', ['b'], '14:00'),
      ])
    );
    const card = countdownCard();
    expect(within(card).getByText(/Coach nearest_b/)).toBeInTheDocument();
    expect(within(card).queryByText(/Coach later_a/)).not.toBeInTheDocument();
    const people = within(card).getByRole('list', { name: 'bookingParticipantsLabel' });
    expect(within(people).getByText('Bob Full Name')).toBeInTheDocument();
    expect(people.querySelector('img')).toHaveAttribute('src', '/b.png');
    const timer = card.querySelector('[aria-live="polite"]')!;
    const initialText = timer.textContent;
    expect(initialText).toBe('2:00:00');
    const intervalCount = intervals.mock.calls.filter((call) => call[1] === 1000).length;
    act(() => vi.advanceTimersByTime(1000));
    expect(timer.textContent).not.toBe(initialText);
    const elapsedText = timer.textContent;
    fireEvent.click(screen.getByRole('button', { name: 'Select Bob Full Name' }));
    expect(countdownCard()).toBe(card);
    expect(countdownCard().querySelector('[aria-live="polite"]')).toBe(timer);
    expect(timer.textContent).toBe(elapsedText);
    expect(intervals.mock.calls.filter((call) => call[1] === 1000)).toHaveLength(intervalCount);
    fireEvent.click(screen.getByRole('button', { name: 'Select Charlie Full Name' }));
    expect(countdownCard()).toBe(card);
    expect(within(card).getByText('Bob Full Name')).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1000));
    expect(timer.textContent).not.toBe(elapsedText);
    // The original expiry transition remains hidden even after a header switch.
    vi.setSystemTime(new Date('2026-10-02T14:00:00'));
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.queryByText('scCountdownToSession')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Select Alice Full Name' }));
    expect(screen.queryByText('scCountdownToSession')).not.toBeInTheDocument();
  });

  it('shows both booking participants with their account avatars', () => {
    setup(countdownProps([upcomingLesson('shared_countdown', ['a', 'b'], '14:00')]));
    const people = within(countdownCard()).getByRole('list', { name: 'bookingParticipantsLabel' });
    expect(
      within(people)
        .getAllByRole('listitem')
        .map((item) => item.textContent)
    ).toEqual(['Alice Full Name', 'Bob Full Name']);
    expect([...people.querySelectorAll('img')].map((img) => img.getAttribute('src'))).toEqual([
      '/a.png',
      '/b.png',
    ]);
  });

  it('shows only B for the nearest course day of enrollment B while A is selected', async () => {
    vi.setSystemTime(new Date('2026-10-03T08:00:00'));
    const user = userEvent.setup();
    const props = shellProps([enrollment('ea', 'a'), enrollment('eb', 'b')]);
    props.sessionItems = props.sessionItems!.map((item) =>
      item.kind === 'course_day' && item.participantId === 'a'
        ? { ...item, time: '16:00', endTime: '17:00' }
        : item
    );
    setup(props);
    const card = countdownCard();
    expect(within(card).getByText('Shared Alpine Course')).toBeInTheDocument();
    const people = within(card).getByRole('list', { name: 'bookingParticipantsLabel' });
    expect(within(people).getAllByRole('listitem')).toHaveLength(1);
    expect(within(people).getByText('Bob Full Name')).toBeInTheDocument();
    expect(people.querySelector('img')).toHaveAttribute('src', '/b.png');
    await user.click(screen.getByRole('button', { name: 'Select Bob Full Name' }));
    expect(countdownCard()).toBe(card);
    expect(within(card).getByText('Bob Full Name')).toBeInTheDocument();
  });
});
