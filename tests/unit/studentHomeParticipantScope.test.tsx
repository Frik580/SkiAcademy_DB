import { mkdirSync, writeFileSync } from 'node:fs';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SkillRadarChart } from '../../src/features/student-cabinet/components/student/SkillRadarChart';
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
import type { Booking, UserProfile } from '../../src/types';
import type { ManagedParticipantOption } from '../../src/features/lesson-bookings/lessonBookingContracts';
import { getJourneyPathProgress } from '../../src/features/journey/components/journeyUtils';
import { usePresentedParticipantAchievements } from '../../src/features/participant-achievements';
import { useSettingsStore } from '../../src/features/settings/settingsStore';
import { DEFAULT_STUDENT_DASHBOARD_LAYOUT } from '../../src/features/settings/studentDashboardLayout';
import type { CabinetSessionItem } from '../../src/features/course-enrollments';

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
  useSettingsStore.getState().setStudentDashboardLayout(undefined);
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

describe('Student Home dashboard grid', () => {
  const tileOrder = () =>
    [
      ...screen
        .getByTestId('student-dashboard-grid')
        .querySelectorAll<HTMLElement>('[data-dashboard-item]'),
    ].map((node) => node.getAttribute('data-dashboard-item'));
  const columnOrder = (column: 'left' | 'right') =>
    [
      ...screen
        .getByTestId('student-dashboard-grid')
        .querySelector(`[data-dashboard-column="${column}"]`)!.children,
    ].map((node) => node.getAttribute('data-dashboard-item'));

  it('renders Journey full width above and outside the grid, independently of remote order and size', () => {
    const view = render(
      <MemoryRouter>
        <StudentCabinetHome {...input('alice')} />
      </MemoryRouter>
    );
    const journey = view.container.querySelector('#your-journey')!;
    const fullWidthBlock = journey.parentElement!;
    const home = fullWidthBlock.parentElement!;
    const grid = screen.getByTestId('student-dashboard-grid');
    expect(fullWidthBlock).toHaveClass('w-full', 'shrink-0');
    expect(home).toHaveClass('space-y-0', 'pb-24', 'w-full', 'min-w-0');
    expect(home).not.toHaveClass('max-w-7xl', 'px-4', 'sm:px-6');
    expect(journey.closest('[data-dashboard-tile]')).toBeNull();
    expect(grid.contains(journey)).toBe(false);
    expect(home.firstElementChild).toBe(fullWidthBlock);
    expect(home.children[1].contains(grid)).toBe(true);
    const before = marker('Alice Student').style.left;
    act(() =>
      useSettingsStore.getState().setStudentDashboardLayout({
        version: 1,
        order: ['weather', 'masteryPath', 'skillRadar'],
        tiles: { masteryPath: { desktopSize: 'small' }, weather: { desktopSize: 'full' } },
      })
    );
    expect(view.container.querySelector('#your-journey')).toBe(journey);
    expect(journey.parentElement).toBe(fullWidthBlock);
    expect(marker('Alice Student').style.left).toBe(before);
    expectMarkerProgress('Alice Student', 'alice');
    expect(tileOrder()).not.toContain('masteryPath');
    expect(tileOrder().slice(0, 2)).toEqual(['weather', 'skillRadar']);
    expect(
      screen.getByText('scWeatherOnSlope').closest('[data-dashboard-item]')!.parentElement
    ).toBe(grid);
    view.rerender(
      <MemoryRouter>
        <StudentCabinetHome {...input('bob')} />
      </MemoryRouter>
    );
    expectMarkerProgress('Bob Student', 'bob');
    expect(marker('Bob Student').style.left).not.toBe(before);
    expect(view.container.querySelector('#your-journey')!.parentElement).toBe(fullWidthBlock);
    expect(grid.querySelector('#your-journey')).toBeNull();
  });

  it('uses the same shell, header and body for all ten tiles while leaving Journey independent', () => {
    let desktop = true;
    const listeners = new Set<() => void>();
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query === '(min-width: 1280px)' && desktop,
      addEventListener: (_event: string, callback: () => void) => listeners.add(callback),
      removeEventListener: (_event: string, callback: () => void) => listeners.delete(callback),
    }));
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2099, 0, 1, 9, 0));
    const upcoming: CabinetSessionItem = {
      kind: 'lesson',
      session: {
        id: 'future_visual',
        bookingId: 'future_visual',
        revision: 1,
        status: 'confirmed',
        date: '2099-01-01',
        time: '09:30',
        durationHours: 1,
        instructorId: 'coach',
        instructorName: 'Coach',
        instructorAvatar: '',
        participantIds: ['alice', 'bob'],
        participantNames: ['Alice Student', 'Bob Student'],
        partyKind: 'family_group',
        payment: { kind: 'withheld' },
        bookingOrigin: 'account',
        isLessonBooking: true,
      },
    };
    const current: CabinetSessionItem = {
      ...upcoming,
      session: {
        ...upcoming.session,
        id: 'current_visual',
        bookingId: 'current_visual',
        time: '08:30',
      },
    };
    const reviewBooking: Booking = {
      id: 'review_visual',
      userId: accountProfile.uid,
      instructorId: 'coach',
      instructorName: 'Coach',
      instructorAvatar: '',
      date: '2098-12-31',
      time: '10:00',
      durationHours: 1,
      totalPrice: 100,
      status: 'completed',
      difficulty: 'beginner',
    };
    const view = render(
      <MemoryRouter>
        <StudentCabinetHome
          {...input('alice')}
          bookings={[reviewBooking]}
          nextSessionItems={[current, upcoming]}
        />
      </MemoryRouter>
    );
    const grid = screen.getByTestId('student-dashboard-grid');
    expect(new Set(tileOrder())).toEqual(new Set(DEFAULT_STUDENT_DASHBOARD_LAYOUT.order));
    expect(columnOrder('left')).toEqual([
      'currentSessions',
      'countdown',
      'nextStep',
      'skillRadar',
      'needsAttention',
      'instructorRecommendations',
      'weather',
    ]);
    expect(columnOrder('right')).toEqual(['todayTasks', 'nextSession', 'todayAchievements']);
    for (const tile of Array.from(grid.querySelectorAll('[data-dashboard-tile]'))) {
      expect(tile).toHaveClass('ui-card', 'p-4', 'sm:p-5');
      const header = tile.querySelector('[data-dashboard-header]')!;
      expect(header).toHaveClass('flex', 'items-center', 'h-12', 'min-h-12');
      expect(header.querySelector('[data-dashboard-title]')).toHaveClass(
        'text-sm',
        'font-semibold',
        'leading-5',
        'tracking-normal',
        'h-10'
      );
      expect(tile.querySelectorAll('[data-dashboard-header]')).toHaveLength(1);
      expect(tile.querySelectorAll('[data-dashboard-body]')).toHaveLength(1);
      expect(header.nextElementSibling).toHaveAttribute('data-dashboard-body');
      expect(header.nextElementSibling).toHaveClass('mt-4');
    }
    const journey = view.container.querySelector('#your-journey')!;
    expect(journey.closest('[data-dashboard-tile]')).toBeNull();
    expect(journey.querySelector('[data-dashboard-header]')).toBeNull();

    // Optional export uses this real ten-tile render for isolated Chromium layout verification.
    if (process.env.STUDENT_DASHBOARD_VISUAL_DIR) {
      const radar = render(
        <SkillRadarChart
          userProfile={input('alice').userProfile}
          skillConfig={DEFAULT_SKILL_CONFIG}
          compact
          embed
        />
      );
      const fixture = grid.cloneNode(true) as HTMLElement;
      fixture
        .querySelector('[data-testid="radar-scores"]')!
        .replaceWith(radar.container.firstElementChild!.cloneNode(true));
      mkdirSync(process.env.STUDENT_DASHBOARD_VISUAL_DIR, { recursive: true });
      writeFileSync(process.env.STUDENT_DASHBOARD_VISUAL_DIR + '/tiles.html', fixture.outerHTML);
      act(() => {
        desktop = false;
        for (const listener of listeners) listener();
      });
      const mobileFixture = grid.cloneNode(true) as HTMLElement;
      mobileFixture
        .querySelector('[data-testid="radar-scores"]')!
        .replaceWith(radar.container.firstElementChild!.cloneNode(true));
      writeFileSync(
        process.env.STUDENT_DASHBOARD_VISUAL_DIR + '/tiles-mobile.html',
        mobileFixture.outerHTML
      );
    }
  });

  it('fixes desktop column membership while consuming saved order and ignoring sizes or auto-grow', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query === '(min-width: 1280px)',
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    useSettingsStore.getState().setStudentDashboardLayout({
      version: 1,
      order: ['weather', 'todayTasks', 'nextStep'],
      tiles: {
        weather: { desktopSize: 'full', allowAutoGrow: true },
        todayTasks: { desktopSize: 'small', allowAutoGrow: true },
      },
    });
    const measure = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect');
    const view = render(
      <MemoryRouter>
        <StudentCabinetHome {...base} />
      </MemoryRouter>
    );
    const grid = screen.getByTestId('student-dashboard-grid');
    expect(grid).toHaveClass(
      'grid-cols-1',
      'md:grid-cols-2',
      'xl:grid-cols-3',
      'gap-4',
      'xl:gap-5',
      'items-start'
    );
    expect(columnOrder('left')).toEqual([
      'weather',
      'nextStep',
      'skillRadar',
      'instructorRecommendations',
    ]);
    expect(columnOrder('right')).toEqual(['todayTasks', 'nextSession']);
    expect(grid.querySelector('[data-dashboard-column="left"]')).toHaveClass(
      'contents',
      'xl:col-span-1',
      'xl:flex',
      'xl:flex-col',
      'xl:gap-5'
    );
    expect(grid.querySelector('[data-dashboard-column="right"]')).toHaveClass(
      'contents',
      'xl:col-span-2',
      'xl:flex',
      'xl:flex-col',
      'xl:gap-5'
    );
    const weather = grid.querySelector('[data-dashboard-tile="weather"]');
    const tasks = grid.querySelector('[data-dashboard-tile="todayTasks"]');
    act(() =>
      useSettingsStore.getState().setStudentDashboardLayout({
        version: 1,
        order: ['nextSession', 'weather', 'skillRadar'],
        tiles: { weather: { desktopSize: 'small', allowAutoGrow: false } },
      })
    );
    expect(columnOrder('left')).toEqual([
      'weather',
      'skillRadar',
      'nextStep',
      'instructorRecommendations',
    ]);
    expect(columnOrder('right')).toEqual(['nextSession', 'todayTasks']);
    expect(grid.querySelector('[data-dashboard-tile="weather"]')).toBe(weather);
    expect(grid.querySelector('[data-dashboard-tile="todayTasks"]')).toBe(tasks);
    view.rerender(
      <MemoryRouter>
        <StudentCabinetHome
          {...base}
          hasAnyParticipantSessionToday={false}
          userProfile={{ ...accountProfile, hideProgressTracking: true }}
        />
      </MemoryRouter>
    );
    expect(columnOrder('left')).toEqual(['instructorRecommendations']);
    expect(columnOrder('right')).toEqual(['nextSession', 'todayTasks']);
    for (const item of grid.querySelectorAll<HTMLElement>('[data-dashboard-item]')) {
      expect(item.querySelectorAll('[data-dashboard-tile]')).toHaveLength(1);
      expect(item.style.height).toBe('');
      expect(item.querySelector<HTMLElement>('[data-dashboard-tile]')!.style.cssText).toBe('');
    }
    expect(grid.style.height).toBe('');
    expect(grid.querySelector('[data-dashboard-lane]')).toBeNull();
    expect(
      measure.mock.instances.some((element) => element.hasAttribute('data-dashboard-tile'))
    ).toBe(false);
    measure.mockRestore();
  });

  it('preserves mobile/tablet DOM order and card instances across desktop resizing', () => {
    let desktop = true;
    const listeners = new Set<() => void>();
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query === '(min-width: 1280px)' && desktop,
      addEventListener: (_event: string, callback: () => void) => listeners.add(callback),
      removeEventListener: (_event: string, callback: () => void) => listeners.delete(callback),
    }));
    const view = render(
      <MemoryRouter>
        <StudentCabinetHome {...input('alice')} />
      </MemoryRouter>
    );
    const grid = screen.getByTestId('student-dashboard-grid');
    const cards = [...grid.querySelectorAll('[data-dashboard-tile]')];
    act(() =>
      useSettingsStore.getState().setStudentDashboardLayout({
        version: 1,
        order: ['weather', 'todayTasks', 'nextStep', 'todayAchievements'],
      })
    );
    expect(columnOrder('right')).toEqual(['todayTasks', 'todayAchievements', 'nextSession']);
    for (const card of cards) expect(grid.contains(card)).toBe(true);
    act(() => {
      desktop = false;
      for (const listener of listeners) listener();
    });
    expect(tileOrder().slice(0, 4)).toEqual([
      'weather',
      'todayTasks',
      'nextStep',
      'todayAchievements',
    ]);
    for (const card of cards)
      expect(
        grid.querySelector(`[data-dashboard-tile="${card.getAttribute('data-dashboard-tile')}"]`)
      ).toBe(card);
    expect(columnOrder('left')).toEqual([]);
    expect(columnOrder('right')).toEqual([]);
    act(() => {
      desktop = true;
      for (const listener of listeners) listener();
    });
    for (const card of cards) expect(grid.contains(card)).toBe(true);
    expect(columnOrder('right')).toEqual(['todayTasks', 'todayAchievements', 'nextSession']);
    expect(new Set(cards.map((card) => card.getAttribute('data-dashboard-tile'))).size).toBe(
      cards.length
    );
    expect(grid.querySelectorAll('[data-dashboard-column]')).toHaveLength(2);
    expect(grid.querySelectorAll('[data-dashboard-item]')).toHaveLength(cards.length);
    expect(view.container.querySelectorAll('[data-testid="student-dashboard-grid"]')).toHaveLength(
      1
    );
  });
  it('renders visible default tiles in DOM order without empty grid items', () => {
    render(
      <MemoryRouter>
        <StudentCabinetHome {...base} />
      </MemoryRouter>
    );
    const visible = [
      'todayTasks',
      'nextStep',
      'nextSession',
      'skillRadar',
      'instructorRecommendations',
      'weather',
    ];
    expect(tileOrder()).toEqual(
      DEFAULT_STUDENT_DASHBOARD_LAYOUT.order.filter((key) => visible.includes(key))
    );
    expect(tileOrder()).not.toContain('countdown');
    expect(tileOrder()).not.toContain('currentSessions');
    expect(tileOrder()).not.toContain('todayAchievements');
    expect(tileOrder()).not.toContain('needsAttention');
    // The next-session empty state still provides the calendar, as before.
    expect(screen.getByText('scNoUpcomingSession')).toBeInTheDocument();
    expect(screen.getByText('scFullCalendar')).toBeInTheDocument();
  });

  it('applies realtime layout updates in DOM order without remounting cards', () => {
    render(
      <MemoryRouter>
        <StudentCabinetHome {...base} />
      </MemoryRouter>
    );
    const weather = screen.getByText('scWeatherOnSlope').closest('section');
    act(() =>
      useSettingsStore.getState().setStudentDashboardLayout({
        version: 1,
        order: ['weather', 'countdown', 'skillRadar'],
        tiles: { weather: { desktopSize: 'full' } },
      })
    );
    expect(tileOrder().slice(0, 2)).toEqual(['weather', 'skillRadar']);
    expect(screen.getByText('scWeatherOnSlope').closest('section')).toBe(weather);
    expect(weather!.closest('[data-dashboard-item]')!.parentElement).toBe(
      screen.getByTestId('student-dashboard-grid')
    );
    expect(useSettingsStore.getState().studentDashboardLayout.order.slice(0, 3)).toEqual([
      'weather',
      'countdown',
      'skillRadar',
    ]);
  });

  it('hides and restores conditional tiles at their saved positions without changing account/participant scope', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2099, 0, 1, 9, 0));
    const lesson: CabinetSessionItem = {
      kind: 'lesson',
      session: {
        id: 'tile_lesson',
        bookingId: 'tile_lesson',
        revision: 1,
        status: 'confirmed',
        date: '2099-01-01',
        time: '09:30',
        durationHours: 1,
        instructorId: 'coach',
        instructorName: 'Coach',
        instructorAvatar: '',
        participantIds: ['alice', 'bob'],
        participantNames: ['Alice Student', 'Bob Student'],
        partyKind: 'family_group',
        payment: { kind: 'withheld' },
        bookingOrigin: 'account',
        isLessonBooking: true,
      },
    };
    useSettingsStore.getState().setStudentDashboardLayout({
      version: 1,
      order: ['weather', 'currentSessions', 'countdown', 'nextSession'],
    });
    const view = render(
      <MemoryRouter>
        <StudentCabinetHome {...base} nextSessionItems={[lesson]} />
      </MemoryRouter>
    );
    expect(tileOrder().slice(0, 3)).toEqual(['weather', 'countdown', 'nextSession']);
    view.rerender(
      <MemoryRouter>
        <StudentCabinetHome
          {...base}
          nextSessionItems={[]}
          hasAnyParticipantSessionToday={false}
          userProfile={{ ...accountProfile, hideProgressTracking: true }}
        />
      </MemoryRouter>
    );
    expect(tileOrder()).not.toContain('weather');
    expect(tileOrder()).not.toContain('countdown');
    expect(tileOrder()).not.toContain('skillRadar');
    view.rerender(
      <MemoryRouter>
        <StudentCabinetHome {...base} nextSessionItems={[lesson]} />
      </MemoryRouter>
    );
    expect(tileOrder().slice(0, 3)).toEqual(['weather', 'countdown', 'nextSession']);
    vi.setSystemTime(new Date(2099, 0, 1, 10, 0));
    view.rerender(
      <MemoryRouter>
        <StudentCabinetHome {...base} nextSessionItems={[{ ...lesson }]} />
      </MemoryRouter>
    );
    expect(tileOrder().slice(0, 3)).toEqual(['weather', 'currentSessions', 'nextSession']);
    expect(useSettingsStore.getState().studentDashboardLayout.order.slice(0, 4)).toEqual([
      'weather',
      'currentSessions',
      'countdown',
      'nextSession',
    ]);
  });

  it('removes the countdown grid item when its existing timer expires', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query === '(min-width: 1280px)',
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2099, 0, 1, 9, 29, 59));
    const lesson: CabinetSessionItem = {
      kind: 'lesson',
      session: {
        id: 'timer_lesson',
        bookingId: 'timer_lesson',
        revision: 1,
        status: 'confirmed',
        date: '2099-01-01',
        time: '09:30',
        durationHours: 1,
        instructorId: 'coach',
        instructorName: 'Coach',
        instructorAvatar: '',
        participantIds: ['alice'],
        participantNames: ['Alice Student'],
        partyKind: 'individual',
        payment: { kind: 'withheld' },
        bookingOrigin: 'account',
        isLessonBooking: true,
      },
    };
    render(
      <MemoryRouter>
        <StudentCabinetHome {...base} nextSessionItems={[lesson]} />
      </MemoryRouter>
    );
    expect(tileOrder()).toContain('countdown');
    act(() => vi.advanceTimersByTime(1001));
    expect(tileOrder()).not.toContain('countdown');
  });
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
