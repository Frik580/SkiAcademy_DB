import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StudentCabinetHome } from '../../src/features/student-cabinet/components/student/StudentCabinetHome';
import type { StudentCabinetHomeContext } from '../../src/features/student-cabinet/components/student/studentCabinetContracts';
import { CabinetParticipantAvatarSwitcher } from '../../src/features/student-cabinet/components/CabinetParticipantAvatarSwitcher';
import { toCabinetParticipantAvatarItems } from '../../src/features/student-cabinet/cabinetParticipantAvatarSwitcherContract';
import { useCabinetProgressParticipantSelection } from '../../src/features/student-cabinet/useCabinetProgressParticipantSelection';
import { useCabinetProgressParticipantSelectionStore } from '../../src/features/student-cabinet/cabinetProgressParticipantSelectionStore';
import {
  applyParticipantProgressToProfile,
  selectCabinetProgressView,
} from '../../src/features/participant-progress/applyParticipantProgressToProfile';
import { DEFAULT_SKILL_CONFIG } from '../../src/domain/achievements';
import type { UserProfile } from '../../src/types';
import type { ManagedParticipantOption } from '../../src/features/lesson-bookings/lessonBookingContracts';
import { getJourneyPathProgress } from '../../src/features/journey/components/journeyUtils';
import { usePresentedParticipantAchievements } from '../../src/features/participant-achievements';

vi.mock('../../src/app/providers/LanguageContext', () => ({
  useLanguage: () => ({ language: 'en', t: (key: string) => key }),
}));
vi.mock('../../src/features/profile', () => ({
  TodayChecklist: ({ tasks }: { tasks: { id: string; label: string }[] }) => (
    <ul aria-label="tasks">
      {tasks.map((task) => (
        <li key={task.id}>{task.label}</li>
      ))}
    </ul>
  ),
}));
vi.mock('../../src/features/student-cabinet/components/student/LazySkillRadarChart', () => ({
  LazySkillRadarChart: ({ userProfile }: { userProfile: UserProfile }) => (
    <div data-testid="radar-scores">{JSON.stringify(userProfile.skillScores)}</div>
  ),
}));
vi.mock('../../src/features/student-cabinet/usePresentedParticipantLessonFeedback', () => ({
  usePresentedParticipantLessonFeedback: () => ({
    participantId: undefined,
    items: [],
    incomplete: [],
    contextByLessonId: new Map(),
    flagsByLessonId: new Map(),
    latestView: null,
    latestHighlight: null,
    isLoadingPlaceholder: false,
    feedbackForLesson: () => null,
  }),
}));
vi.mock('../../src/features/participant-achievements', () => ({
  accountReviewEvidenceFromCanonicalPresentation: () => [],
  usePresentedParticipantAchievements: vi.fn(
    ({ selectedParticipantId }: { selectedParticipantId?: string }) => ({
      achievements: selectedParticipantId
        ? [
            {
              id: 'achievement',
              label: selectedParticipantId + ' achievement',
              earnedAt: new Date().toISOString(),
            },
          ]
        : [],
    })
  ),
}));

const participants: ManagedParticipantOption[] = ['alice', 'bob', 'other'].map((id) => ({
  participantId: id,
  participantManagementId: 'management_' + id,
  displayName: id === 'alice' ? 'Alice Student' : id === 'bob' ? 'Bob Student' : 'Other Student',
  avatarUrl: '/' + id + '.png',
  authority: id === 'alice' ? 'self' : 'parent_guardian',
  discipline: 'ski',
  skillLevel: 'beginner',
  age: { kind: 'age_years', years: 10 },
  revision: 1,
}));
const skillId = DEFAULT_SKILL_CONFIG.items[0].id;
const progressById = {
  alice: {
    participantId: 'alice',
    level: 1,
    skillScores: { [skillId]: 1 },
    skillComments: {},
    revision: 1,
  },
  bob: {
    participantId: 'bob',
    level: 2,
    skillScores: { [skillId]: 15 },
    skillComments: {},
    revision: 1,
  },
};
const accountProfile = {
  uid: 'account_test',
  email: 'test@example.com',
  role: 'user',
  displayName: 'Account Owner',
  avatarUrl: '/account.png',
  balanceUSD: 0,
  isClientActive: true,
} as UserProfile;

const base: StudentCabinetHomeContext = {
  userProfile: accountProfile,
  bookings: [],
  sessionItems: [],
  courses: [],
  instructors: [],
  reviews: [],
  skillConfig: DEFAULT_SKILL_CONFIG,
  hasAnyParticipantSessionToday: true,
  onOpenSession: vi.fn(),
  onOpenLesson: vi.fn(),
  onWriteReview: vi.fn(),
  onGoToTab: vi.fn(),
  onOpenDevelopmentSection: vi.fn(),
  onContinueDevelopment: vi.fn(),
  onViewCourseDetails: vi.fn(),
  onRequireCourseAuth: vi.fn(),
  onBookInstructor: vi.fn(),
  onViewInstructorReviews: vi.fn(),
  resortSnapshot: {
    status: 'ready',
    unit: 'celsius',
    nameRu: 'Курорт',
    nameEn: 'Resort',
    temperature: null,
    apparentTemperature: null,
    conditionKey: null,
    wind: null,
    gusts: null,
    snow: null,
    visibility: null,
    updatedAt: null,
    liftsOpen: null,
    liftsTotal: null,
    trailsOpen: null,
    resortStatusKey: null,
  },
};

function input(id: string, managed = participants): StudentCabinetHomeContext {
  return {
    ...base,
    participantProfiles: toCabinetParticipantAvatarItems(managed, accountProfile.avatarUrl),
    selectedParticipantId: id,
    participantProgress: selectCabinetProgressView(progressById, id),
    userProfile: {
      ...applyParticipantProgressToProfile(
        accountProfile,
        selectCabinetProgressView(progressById, id)
      ),
      customTodayTasks: [{ id: 'custom', text: id + ' task' }],
    },
  };
}
function marker(name: string) {
  return screen.getByRole('img', { name }).parentElement as HTMLElement;
}
function expectMarkerProgress(name: string, id: string) {
  // jsdom has no SVG geometry. The geometry shim below uses x = length, y = 50;
  // production XP thresholds, path mapping, sampler and marker placement stay real.
  const progress = getJourneyPathProgress(input(id).userProfile, DEFAULT_SKILL_CONFIG);
  expect(parseFloat(marker(name).style.left)).toBeCloseTo(progress * 100);
  expect(marker(name).style.top).toBe('50%');
}
function scopeIn(title: string) {
  return screen
    .getByText(title)
    .parentElement!.querySelector('[data-participant-scope]') as HTMLElement;
}
function HeaderAndHome() {
  const { selectedParticipantId, selectParticipant } = useCabinetProgressParticipantSelection({
    accountId: accountProfile.uid,
    participants,
    loading: false,
  });
  return (
    <>
      <CabinetParticipantAvatarSwitcher
        items={toCabinetParticipantAvatarItems(participants)}
        selectedParticipantId={selectedParticipantId}
        onSelect={selectParticipant}
        fallbackDisplayName="Account Owner"
        groupLabel="Participants"
        switchToParticipantLabel="Select {name}"
      />
      <StudentCabinetHome {...input(selectedParticipantId ?? '')} />
    </>
  );
}

beforeEach(() => {
  vi.mocked(usePresentedParticipantAchievements).mockClear();
  useCabinetProgressParticipantSelectionStore.getState().reset();
  Object.defineProperty(SVGElement.prototype, 'getTotalLength', {
    configurable: true,
    value: () => 400,
  });
  Object.defineProperty(SVGElement.prototype, 'getPointAtLength', {
    configurable: true,
    value: (length: number) => ({ x: length, y: 50 }),
  });
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('Student Home participant scope', () => {
  it('does not pass account review evidence into the participant daily achievements block', () => {
    render(
      <MemoryRouter>
        <StudentCabinetHome
          {...input('bob')}
          reviews={[
            {
              id: 'account_review',
              instructorId: 'coach',
              userId: accountProfile.uid,
              userName: 'Owner',
              userAvatar: '',
              rating: 5,
              date: new Date().toISOString(),
            },
          ]}
        />
      </MemoryRouter>
    );
    expect(usePresentedParticipantAchievements).toHaveBeenCalledWith(
      expect.objectContaining({ selectedParticipantId: 'bob', accountReviews: [] })
    );
  });
  it('hides ordinary badges for one participant but always shows their journey avatar', () => {
    const view = render(
      <MemoryRouter>
        <StudentCabinetHome {...input('alice', participants.slice(0, 1))} />
      </MemoryRouter>
    );
    expect(view.container.querySelector('[data-participant-scope]')).toBeNull();
    expect(screen.getByRole('img', { name: 'Alice Student' }).querySelector('img')).toHaveAttribute(
      'src',
      '/alice.png'
    );
    expect(screen.getByText('journeyYouAreHere')).toBeInTheDocument();
    expectMarkerProgress('Alice Student', 'alice');
  });

  it('labels the participant sections, leaves mixed Today and global weather unlabelled', () => {
    render(
      <MemoryRouter>
        <StudentCabinetHome {...input('bob')} />
      </MemoryRouter>
    );
    for (const title of [
      'scQuickActions',
      'scNextStepTitle',
      'scRadarTitle',
      'scLatestCoachRecommendation',
      'Today’s Progress',
    ]) {
      expect(scopeIn(title)).toHaveTextContent('Bob Student');
      expect(scopeIn(title).querySelector('img')).toHaveAttribute('src', '/bob.png');
      expect(scopeIn(title).querySelector('button')).toBeNull();
    }
    expect(document.querySelector('#your-journey header [data-participant-scope]')).toBeNull();
    expect(screen.getByRole('img', { name: 'Bob Student' })).toBeInTheDocument();
    const progressBlock = screen.getByText('Today’s Progress').parentElement!.parentElement!;
    expect(progressBlock.querySelectorAll('[data-participant-scope]')).toHaveLength(1);
    expect(
      screen
        .getByText('New achievements today:')
        .parentElement!.querySelector('[data-participant-scope]')
    ).toBeNull();
    expect(
      screen
        .getByText('scWeatherOnSlope')
        .closest('section')!
        .querySelector('[data-participant-scope]')
    ).toBeNull();
    expect(screen.getByText('scTodaySection').querySelector('[data-participant-scope]')).toBeNull();
    expect(
      screen.queryByText('Account Owner', { selector: '[data-participant-scope] span' })
    ).not.toBeInTheDocument();
  });

  it('switches through the shared header state without remounting Home or global weather', async () => {
    const user = userEvent.setup();
    const view = render(
      <MemoryRouter>
        <HeaderAndHome />
      </MemoryRouter>
    );
    const home = document.querySelector('#your-journey')!.parentElement!.parentElement;
    const weather = screen.getByText('scWeatherOnSlope').closest('section');
    expectMarkerProgress('Alice Student', 'alice');
    const before = marker('Alice Student').style.left;
    await user.click(screen.getByRole('button', { name: 'Select Bob Student' }));
    expect(useCabinetProgressParticipantSelectionStore.getState().selectedParticipantId).toBe(
      'bob'
    );
    for (const badge of view.container.querySelectorAll('[data-participant-scope]')) {
      expect(badge).toHaveAttribute('data-participant-scope', 'bob');
      expect(badge).toHaveTextContent('Bob Student');
    }
    expect(screen.getByRole('img', { name: 'Bob Student' }).querySelector('img')).toHaveAttribute(
      'src',
      '/bob.png'
    );
    expectMarkerProgress('Bob Student', 'bob');
    expect(marker('Bob Student').style.left).not.toBe(before);
    expect(screen.getByRole('list', { name: 'tasks' })).toHaveTextContent('bob task');
    expect(screen.getByTestId('radar-scores')).toHaveTextContent(
      JSON.stringify(progressById.bob.skillScores)
    );
    expect(document.querySelector('#your-journey')!.parentElement!.parentElement).toBe(home);
    expect(screen.getByText('scWeatherOnSlope').closest('section')).toBe(weather);
  });

  it('uses initials for a dependent without copying the account avatar', () => {
    const managed = participants.map((person) => ({ ...person, avatarUrl: undefined }));
    render(
      <MemoryRouter>
        <StudentCabinetHome {...input('bob', managed)} />
      </MemoryRouter>
    );
    const avatar = screen.getByRole('img', { name: 'Bob Student' });
    expect(avatar.querySelector('img')).toBeNull();
    expect(avatar).toHaveTextContent('B');
    expect(scopeIn('scRadarTitle').querySelector('img')).toBeNull();
  });

  it('preserves actual membership of a lesson after selecting an unrelated participant', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2099-01-01T00:00:00Z'));
    const lesson = {
      kind: 'lesson' as const,
      session: {
        id: 'family_lesson',
        bookingId: 'family_lesson',
        revision: 1,
        status: 'confirmed' as const,
        date: '2099-01-02',
        time: '10:00',
        durationHours: 1,
        instructorId: 'coach',
        instructorName: 'Coach',
        instructorAvatar: '',
        participantIds: ['alice', 'bob'],
        participantNames: ['Alice Student', 'Bob Student'],
        partyKind: 'family_group' as const,
        payment: { kind: 'withheld' as const },
        bookingOrigin: 'account' as const,
        isLessonBooking: true as const,
      },
    };
    const view = render(
      <MemoryRouter>
        <StudentCabinetHome {...input('alice')} nextSessionItems={[lesson]} />
      </MemoryRouter>
    );
    const people = screen.getByRole('list', { name: 'bookingParticipantsLabel' });
    expect(
      within(people)
        .getAllByRole('listitem')
        .map((item) => item.textContent)
    ).toEqual(['Alice Student', 'Bob Student']);
    view.rerender(
      <MemoryRouter>
        <StudentCabinetHome {...input('other')} nextSessionItems={[lesson]} />
      </MemoryRouter>
    );
    expect(screen.getByRole('list', { name: 'bookingParticipantsLabel' })).toBe(people);
    expect(people).not.toHaveTextContent('Other Student');
    expect(people.querySelectorAll('img')).toHaveLength(2);
  });

  it('updates long display names and fallback initials on the existing badges', () => {
    const view = render(
      <MemoryRouter>
        <StudentCabinetHome {...input('bob')} />
      </MemoryRouter>
    );
    const name = 'ОченьДлинноеИмяУчастникаБезПробелов'.repeat(5);
    const managed = participants.map((person) =>
      person.participantId === 'bob'
        ? { ...person, displayName: name, avatarUrl: undefined }
        : person
    );
    act(() =>
      view.rerender(
        <MemoryRouter>
          <StudentCabinetHome {...input('bob', managed)} />
        </MemoryRouter>
      )
    );
    expect(scopeIn('scRadarTitle')).toHaveAttribute('title', name);
    expect(screen.getByRole('img', { name })).toHaveTextContent('О');
  });
});
