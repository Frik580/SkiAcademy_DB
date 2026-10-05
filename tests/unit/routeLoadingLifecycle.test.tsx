import React, { useEffect } from 'react';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserProfile } from '../../src/types';
import type { AppRoutesProps } from '../../src/app/routes/routeTypes';
let AppRoutes: typeof import('../../src/app/routes/AppRoutes').AppRoutes;
let AppShell: typeof import('../../src/app/AppShell').AppShell;
import { RouteGate } from '../../src/features/shell/RouteGate';

const state = vi.hoisted(() => {
  let releaseCode!: () => void;
  const codeReady = new Promise<void>((resolve) => {
    releaseCode = resolve;
  });
  const empty: never[] = [];
  return {
    auth: { authLoading: true, firebaseUser: null as { uid: string } | null },
    profile: { profileLoading: false, userProfile: null as UserProfile | null },
    empty,
    noop: vi.fn(),
    heroMount: vi.fn(),
    navbarMount: vi.fn(),
    navbarUnmount: vi.fn(),
    heroUnmount: vi.fn(),
    cabinetRender: vi.fn(),
    codeReady,
    releaseCode,
    visits: [] as string[],
  };
});

vi.mock('../../src/features/auth/authStore', () => ({
  useAuthStore: (select: (value: typeof state.auth) => unknown) => select(state.auth),
}));
vi.mock('../../src/features/profile/profileStore', () => ({
  useProfileStore: (select: (value: Record<string, unknown>) => unknown) =>
    select({
      ...state.profile,
      usersList: state.empty,
      dismissedReviewIds: state.empty,
      activityLogs: state.empty,
      handleDismissReview: state.noop,
    }),
}));
vi.mock('../../src/features/shell', async () => ({
  ...(await vi.importActual('../../src/features/shell/RouteGate')),
  ModalHost: () => null,
  useUiStore: (select: (value: Record<string, unknown>) => unknown) => select({}),
}));
vi.mock('../../src/features/shell/uiStore', () => ({
  useUiStore: (select: (value: Record<string, unknown>) => unknown) => select({}),
}));
vi.mock('../../src/app/providers/LanguageContext', () => ({
  useLanguage: () => ({ t: (key: string) => key, language: 'en' }),
}));
vi.mock('../../src/hooks/useTheme', () => ({ useTheme: () => ({ theme: 'dark' }) }));
vi.mock('../../src/hooks/useInstructorFilters', () => ({
  useInstructorFilters: () => ({ filteredInstructors: state.empty }),
}));
vi.mock('../../src/features/journey', () => ({ YourJourneySection: () => null }));
vi.mock('../../src/features/profile/instructors', () => ({ InstructorCard: () => null }));
vi.mock('../../src/features/resort-conditions', () => ({ ConditionsStrip: () => null }));
vi.mock('../../src/features/courses', () => ({
  GroupCoursesSection: () => null,
  LessonFilters: () => null,
  useCoursesStore: (select: (value: Record<string, unknown>) => unknown) =>
    select({ courses: state.empty }),
}));
vi.mock('../../src/features/courses/coursesStore', () => ({
  useCoursesStore: (select: (value: Record<string, unknown>) => unknown) =>
    select({ courses: state.empty }),
}));
vi.mock('../../src/features/settings', () => ({
  useSettingsStore: (select: (value: Record<string, unknown>) => unknown) =>
    select({ filtersEnabled: false }),
}));
vi.mock('../../src/features/settings/settingsStore', () => ({
  useSettingsStore: (select: (value: Record<string, unknown>) => unknown) => select({}),
}));
vi.mock('../../src/features/bookings/bookingsStore', () => ({
  useBookingsStore: (select: (value: Record<string, unknown>) => unknown) =>
    select({
      reviews: state.empty,
      reviewBookingStates: state.empty,
      instructors: state.empty,
    }),
}));
vi.mock('../../src/features/wallet/walletStore', () => ({
  useWalletStore: (select: (value: Record<string, unknown>) => unknown) =>
    select({ walletLedgerEntries: state.empty }),
}));
vi.mock('../../src/features/lesson-bookings', () => ({
  useManagedParticipants: () => ({ participants: state.empty }),
  useLessonBookingStore: () => state.empty,
  selectLessonBookingItems: () => state.empty,
  useLessonBookingCommands: () => ({}),
  resolveLessonBookingCommandRefreshStrategy: () => ({}),
}));
vi.mock('../../src/features/course-enrollments', () => ({
  useCourseEnrollmentStore: () => state.empty,
  selectCourseEnrollmentItems: () => state.empty,
  selectAllCourseCatalogOperationalStates: () => ({}),
  buildMixedCabinetSessionItems: () => state.empty,
  useCourseEnrollmentCommands: () => ({}),
}));
vi.mock('../../src/features/student-cabinet/cabinetProgressParticipantSelectionStore', () => ({
  useCabinetProgressParticipantSelectionStore: () => undefined,
}));
vi.mock('../../src/features/courses/courseEnrollmentCtaTrace', () => ({
  traceCourseEnrollmentCtaIdentity: () => {},
}));
vi.mock('../../src/features/notifications', () => ({
  useNotifications: () => ({ addNotification: state.noop }),
  useNotificationActions: () => ({ handleMarkNotificationsAsRead: state.noop }),
  useUnreadNotificationCount: () => 0,
}));
vi.mock('../../src/features/reviews', () => ({ createCanonicalInstructorReview: state.noop }));
vi.mock('../../src/features/profile/cabinet', () => ({
  PersonalCabinet: () => {
    state.cabinetRender();
    return <div data-testid="personal-cabinet" />;
  },
}));
vi.mock('../../src/app/routes/CabinetRouteContainer', async () => {
  await state.codeReady;
  return vi.importActual('../../src/app/routes/CabinetRouteContainer');
});
vi.mock('../../src/app/routes/AdminRouteContainer', () => ({
  AdminRouteContainer: () => <div data-testid="admin" />,
}));
vi.mock('../../src/app/routes/InstructorRouteContainer', () => ({
  InstructorRouteContainer: () => <div data-testid="instructor" />,
}));
vi.mock('../../src/app/components/HeroCarousel', () => ({
  HeroCarousel: () => {
    useEffect(() => {
      state.heroMount();
      return () => {
        state.heroUnmount();
      };
    }, []);
    return <div data-testid="hero" />;
  },
}));

vi.mock('../../src/hooks/useResortStats', () => ({
  useResortStats: () => ({
    resortConfig: { slides: [] },
    presentation: {},
    isResortConfigReady: true,
  }),
}));
vi.mock('../../src/features/bookings', () => ({
  useBookingsStore: (select: (value: Record<string, unknown>) => unknown) =>
    select({ reviewBookingStates: state.empty }),
}));
vi.mock('../../src/features/participant-progress', () => ({
  useParticipantProgressStore: () => ({}),
  overlaySelfParticipantProgress: (profile: UserProfile) => profile,
}));
vi.mock('../../src/app/components/Navbar', () => ({
  Navbar: () => {
    useEffect(() => {
      state.navbarMount();
      return () => {
        state.navbarUnmount();
      };
    }, []);
    return <nav data-testid="shell-navbar" />;
  },
}));
const props = {
  resortData: { resortConfig: { slides: [] }, isResortConfigReady: true, presentation: {} },
  setIsFahrenheit: () => {},
  onRefreshResortStats: () => {},
  onSignOut: () => {},
} as unknown as AppRoutesProps;
const profile = (extra: Partial<UserProfile> = {}) =>
  ({ uid: 'account', role: 'client', ...extra }) as UserProfile;

function LocationProbe() {
  const { pathname } = useLocation();
  useEffect(() => {
    state.visits.push(pathname);
  }, [pathname]);
  return <div data-testid="location">{pathname}</div>;
}
function Navigation() {
  const navigate = useNavigate();
  return <button onClick={() => navigate('/cabinet')}>Open cabinet</button>;
}
function Frame({ children }: { children?: React.ReactNode }) {
  return (
    <>
      <nav data-testid="navbar" />
      <LocationProbe />
      <Navigation />
      {children ?? <AppRoutes {...props} />}
    </>
  );
}
function open(path: string) {
  const tree = <Frame />;
  const result = render(<MemoryRouter initialEntries={[path]}>{tree}</MemoryRouter>);
  return {
    ...result,
    update: () =>
      result.rerender(
        <MemoryRouter initialEntries={[path]}>
          <Frame />
        </MemoryRouter>
      ),
  };
}

beforeEach(async () => {
  vi.resetModules();
  state.codeReady = new Promise<void>((resolve) => {
    state.releaseCode = resolve;
  });
  AppRoutes = (await import('../../src/app/routes/AppRoutes')).AppRoutes;
  AppShell = (await import('../../src/app/AppShell')).AppShell;
  state.auth.authLoading = true;
  state.auth.firebaseUser = null;
  state.profile.profileLoading = false;
  state.profile.userProfile = null;
  state.visits.length = 0;
  vi.clearAllMocks();
});
afterEach(cleanup);

describe('cabinet route loading ownership', () => {
  it('keeps the SAME loading DOM while code, auth and profile resolve; never mounts protected content early', async () => {
    const view = open('/cabinet');
    const loading = screen.getByRole('status');
    const navbar = screen.getByTestId('navbar');
    expect(screen.queryByTestId('personal-cabinet')).not.toBeInTheDocument();
    state.auth.authLoading = false;
    state.auth.firebaseUser = { uid: 'account' };
    state.profile.profileLoading = true;
    view.update();
    expect(screen.getByRole('status')).toBe(loading);
    expect(screen.getByTestId('location')).toHaveTextContent('/cabinet');
    state.profile.profileLoading = false;
    state.profile.userProfile = profile();
    view.update();
    expect(screen.getByRole('status')).toBe(loading);
    expect(state.cabinetRender).not.toHaveBeenCalled();
    await act(async () => {
      state.releaseCode();
    });
    await screen.findByTestId('personal-cabinet');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByTestId('navbar')).toBe(navbar);
    expect(state.visits).toEqual(['/cabinet']);
  });

  it('keeps the same surface when code resolves BEFORE the profile', async () => {
    const view = open('/cabinet');
    const loading = screen.getByRole('status');
    await act(async () => {
      state.releaseCode();
      await import('../../src/app/routes/CabinetRouteContainer');
    });
    expect(screen.getByRole('status')).toBe(loading);
    state.auth.authLoading = false;
    state.profile.profileLoading = true;
    view.update();
    expect(screen.getByRole('status')).toBe(loading);
    expect(state.cabinetRender).not.toHaveBeenCalled();
    state.profile.profileLoading = false;
    state.profile.userProfile = profile();
    view.update();
    expect(screen.getByTestId('personal-cabinet')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('redirects a resolved guest without ever rendering PersonalCabinet', async () => {
    state.auth.authLoading = false;
    open('/cabinet');
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/'));
    expect(state.cabinetRender).not.toHaveBeenCalled();
    expect(screen.getByTestId('hero')).toBeInTheDocument();
  });

  it('uses the cached route for client navigation and preserves navbar', async () => {
    state.auth.authLoading = false;
    state.profile.userProfile = profile({ role: 'admin' });
    state.releaseCode();
    const warmup = open('/cabinet');
    await screen.findByTestId('personal-cabinet');
    warmup.unmount();
    const view = open('/');
    const navbar = screen.getByTestId('navbar');
    await act(async () => {
      screen.getByRole('button', { name: 'Open cabinet' }).click();
    });
    expect(screen.getByTestId('personal-cabinet')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByTestId('navbar')).toBe(navbar);
    view.unmount();
  });
});

describe('public Home lifecycle', () => {
  it('H1-H3: keeps Hero mounted through auth -> profile -> resolved missing profile', () => {
    const view = open('/');
    const hero = screen.getByTestId('hero');
    state.auth.authLoading = false;
    state.auth.firebaseUser = { uid: 'account' };
    state.profile.profileLoading = true;
    view.update();
    expect(screen.getByTestId('hero')).toBe(hero);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(state.visits).toEqual(['/']);
    state.profile.profileLoading = false;
    view.update();
    expect(screen.getByTestId('hero')).toBe(hero);
    expect(state.heroMount).toHaveBeenCalledTimes(1);
    expect(state.heroUnmount).not.toHaveBeenCalled();
  });

  it.each([
    [profile(), '/cabinet'],
    [profile({ isInstructor: true }), '/instructor'],
  ])('waits for profile readiness then redirects once to %s', async (user, destination) => {
    state.auth.authLoading = false;
    state.profile.profileLoading = true;
    state.profile.userProfile = user;
    const view = open('/');
    expect(screen.getByTestId('hero')).toBeInTheDocument();
    expect(state.visits).toEqual(['/']);
    state.profile.profileLoading = false;
    view.update();
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(destination));
    expect(state.visits).toEqual(['/', destination]);
  });

  it('preserves admin Home behavior after authoritative profile resolution', () => {
    state.auth.authLoading = false;
    state.profile.userProfile = profile({ role: 'admin', isInstructor: true });
    open('/');
    expect(screen.getByTestId('hero')).toBeInTheDocument();
    expect(state.visits).toEqual(['/']);
  });
});

describe('RouteGate authorization remains independent from loading', () => {
  it.each(['auth', 'admin', 'instructor'] as const)(
    '%s never renders protected children or redirects while pending',
    (gateType) => {
      const user = profile({ role: 'admin' });
      const tree = () => (
        <Frame>
          <RouteGate gateType={gateType} userProfile={user}>
            <div data-testid="protected" />
          </RouteGate>
        </Frame>
      );
      const view = render(<MemoryRouter initialEntries={['/private']}>{tree()}</MemoryRouter>);
      const loading = screen.getByRole('status');
      state.auth.authLoading = false;
      state.profile.profileLoading = true;
      view.rerender(<MemoryRouter initialEntries={['/private']}>{tree()}</MemoryRouter>);
      expect(screen.getByRole('status')).toBe(loading);
      expect(screen.queryByTestId('protected')).not.toBeInTheDocument();
      expect(state.visits).toEqual(['/private']);
      state.profile.profileLoading = false;
      view.rerender(<MemoryRouter initialEntries={['/private']}>{tree()}</MemoryRouter>);
      expect(screen.getByTestId('protected')).toBeInTheDocument();
    }
  );

  it.each([
    ['auth', null, '/'],
    ['admin', profile(), '/'],
    ['instructor', profile(), '/cabinet'],
  ] as const)('%s rejects unauthorized resolved access', (gateType, user, destination) => {
    state.auth.authLoading = false;
    render(
      <MemoryRouter initialEntries={['/private']}>
        <Frame>
          <RouteGate gateType={gateType} userProfile={user}>
            <div data-testid="protected" />
          </RouteGate>
        </Frame>
      </MemoryRouter>
    );
    expect(screen.getByTestId('location')).toHaveTextContent(destination);
    expect(screen.queryByTestId('protected')).not.toBeInTheDocument();
  });
});

describe('AppShell owns application chrome', () => {
  it('keeps its Navbar mounted once while cabinet code/auth/profile resolve', async () => {
    const tree = () => (
      <MemoryRouter initialEntries={['/cabinet']}>
        <AppShell />
      </MemoryRouter>
    );
    const view = render(tree());
    const navbar = screen.getByTestId('shell-navbar');
    const loading = screen.getByRole('status');
    expect(screen.getAllByRole('navigation')).toHaveLength(1);
    state.auth.authLoading = false;
    state.profile.profileLoading = true;
    view.rerender(tree());
    expect(screen.getByRole('status')).toBe(loading);
    expect(screen.getByTestId('shell-navbar')).toBe(navbar);
    await act(async () => {
      state.releaseCode();
      await import('../../src/app/routes/CabinetRouteContainer');
    });
    expect(screen.getByRole('status')).toBe(loading);
    state.profile.profileLoading = false;
    state.profile.userProfile = profile();
    view.rerender(tree());
    expect(screen.getByTestId('personal-cabinet')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByTestId('shell-navbar')).toBe(navbar);
    expect(state.navbarMount).toHaveBeenCalledTimes(1);
    expect(state.navbarUnmount).not.toHaveBeenCalled();
  });
});
