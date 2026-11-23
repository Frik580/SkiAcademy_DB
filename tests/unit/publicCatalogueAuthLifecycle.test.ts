import { createElement, type ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { User } from 'firebase/auth';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '../../src/features/auth/authStore';
import { useSessionSync } from '../../src/features/auth/sync/useSessionSync';
import { useBookingsStore } from '../../src/features/bookings/bookingsStore';
import { useBookingsSync } from '../../src/features/bookings/sync/useBookingsSync';
import { useCourseCatalogReadSync } from '../../src/features/course-enrollments/useCourseEnrollmentReadSync';
import { useCoursesStore } from '../../src/features/courses/coursesStore';
import { useCoursesSync } from '../../src/features/courses/sync/useCoursesSync';
import { useLessonBookingStore } from '../../src/features/lesson-bookings/lessonBookingStore';
import { useUiStore } from '../../src/features/shell/uiStore';
import { resetAuthScopedCatalogues, resetUserScopedStores } from '../../src/store/resetDataStores';

const firebase = vi.hoisted(() => ({
  auth: { currentUser: null as User | null },
  observeAuth: vi.fn(),
  signOut: vi.fn(),
  read: vi.fn(),
  watch: vi.fn(),
  error: vi.fn(),
}));

vi.mock('firebase/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('firebase/auth')>()),
  onAuthStateChanged: firebase.observeAuth,
}));
vi.mock('../../src/infrastructure/firebase', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/infrastructure/firebase')>()),
  auth: firebase.auth,
  doc: (_db: unknown, path: string) => path,
  onSnapshot: firebase.watch,
  handleFirestoreError: firebase.error,
}));
vi.mock('../../src/lib/functions/functionsClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/lib/functions/functionsClient')>()),
  callFunction: firebase.read,
}));
vi.mock('../../src/features/auth/authService', () => ({
  signOutService: firebase.signOut,
  getCurrentAuthenticatedUser: () => firebase.auth.currentUser,
}));
const catalogue = vi.hoisted(() => ({
  courses: vi.fn(),
  instructors: vi.fn(),
  accountReviews: vi.fn(),
}));
vi.mock('../../src/lib/canonical/canonicalReadModelClient', () => ({
  queryCourseCatalogReadModels: catalogue.courses,
  queryBookingInstructorCatalogueReadModels: catalogue.instructors,
  queryAccountInstructorReviewReadModels: catalogue.accountReviews,
  queryInstructorReviewReadModels: vi.fn(),
  queryPublicInstructorRatingSummaries: async () => ({ scope: 'public_summaries', summaries: [] }),
}));

const liveCourse = {
  id: 'course_live',
  data: { title: 'Live course', price: 25000, capacity: { totalSeats: 4, availableSeats: 4 } },
};
const liveContent = {
  id: liveCourse.id,
  data: { duration: '2 days', description: 'Course', dates: 'January', bgImageUrl: '/ski.jpg' },
};
const newCourse = { ...liveCourse, id: 'course_new' };
const newContent = { id: newCourse.id, data: { ...liveContent.data, discipline: 'ski' } };
const instructor = (id: string) => ({
  instructorId: id,
  name: id,
  specialty: 'ski',
  isAvailable: true,
  pricePerHourKZT: 25000,
});
const instructorResponse = (id: string) => ({ items: [instructor(id)] });
const time = { seconds: 1, nanoseconds: 0 };
const courseResponse = (id: string) => ({
  items: [
    {
      ...liveCourse.data,
      courseId: id,
      revision: 1,
      scheduleSummary: { startAt: time, finalCourseDayEndsAt: time, courseDayCount: 1 },
      courseSchedule: { courseDays: [{ timeZone: 'Asia/Almaty' }] },
      capacity: { ...liveCourse.data.capacity, isEnrollmentEligible: true },
      presentation: { description: id },
    },
  ],
});
const courseIds = () => useCoursesStore.getState().courses.map(({ id }) => id);
const instructorIds = () => useBookingsStore.getState().instructors.map(({ id }) => id);

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

function publishAuth(uid?: string) {
  firebase.auth.currentUser = uid ? ({ uid } as User) : null;
  firebase.observeAuth.mock.calls.at(-1)![1](firebase.auth.currentUser);
}

function mount(pathname = '/') {
  return renderHook(
    () => {
      useSessionSync();
      useBookingsSync();
      useCoursesSync(true);
      useCourseCatalogReadSync(true);
      return useNavigate();
    },
    {
      wrapper: ({ children }: { children: ReactNode }) =>
        createElement(MemoryRouter, { initialEntries: [pathname] }, children),
    }
  );
}

async function expectGuestCatalogue() {
  await waitFor(() => {
    expect(courseIds()).toEqual(['course_live']);
    expect(instructorIds()).toEqual(['ins_live']);
    expect(useCoursesStore.getState().publicCoursesStatus).toBe('ready');
    expect(useBookingsStore.getState().instructorCatalogueStatus).toBe('ready');
  });
}

describe('public catalogue across Firebase Auth transitions', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    firebase.auth.currentUser = null;
    useAuthStore.setState({ firebaseUser: null, authLoading: true, authGeneration: 0 });
    useUiStore.getState().setIsAuthModalOpen(false);
    resetUserScopedStores();
    resetAuthScopedCatalogues();
    firebase.observeAuth.mockImplementation((_auth, receive) => {
      receive(firebase.auth.currentUser);
      return vi.fn();
    });
    firebase.watch.mockImplementation(() => vi.fn());
    firebase.read.mockImplementation(async (_name, { collection }) => ({
      docs:
        collection === 'courses'
          ? [liveCourse]
          : collection === 'course_catalog_content'
            ? [liveContent]
            : collection === 'instructors'
              ? [{ id: 'ins_live', data: instructor('ins_live') }]
              : [],
      cursor: null,
      revision: '1',
      runtimePath: 'client_read_runtime/live/collections/' + collection,
    }));
    catalogue.courses.mockImplementation(async ({ scope }) =>
      scope === 'public' ? { items: [] } : courseResponse('course_signed_in')
    );
    catalogue.instructors.mockResolvedValue(instructorResponse('ins_signed_in'));
    catalogue.accountReviews.mockResolvedValue({
      scope: 'account_reviews',
      reviews: [],
      bookingStates: [],
    });
  });

  it('clears private state immediately and restores guest catalogues only after Firebase sign-out', async () => {
    mount();
    await expectGuestCatalogue();
    const oldListeners = firebase.watch.mock.results.map(({ value }) => value);
    await act(async () => publishAuth('account-a'));
    expect(courseIds()).toEqual(['course_signed_in']);
    expect(instructorIds()).toEqual(['ins_signed_in']);
    expect(oldListeners).toHaveLength(3);
    oldListeners.forEach((stop) => expect(stop).toHaveBeenCalledOnce());
    useLessonBookingStore.getState().setLoaded(true);
    useUiStore.getState().setSelectedInstructor(useBookingsStore.getState().instructors[0]);
    useUiStore.getState().setSelectedCourseForDetails(useCoursesStore.getState().courses[0]);

    const signOut = deferred<void>();
    firebase.signOut.mockReturnValue(signOut.promise);
    firebase.read.mockClear();
    catalogue.courses.mockClear();
    let operation!: Promise<void>;
    act(() => {
      operation = useAuthStore.getState().handleSignOut();
    });
    expect(firebase.auth.currentUser?.uid).toBe('account-a');
    expect(useLessonBookingStore.getState().loaded).toBe(false);
    expect(courseIds()).toEqual([]);
    expect(instructorIds()).toEqual([]);
    expect(useUiStore.getState().selectedInstructor).toBeNull();
    expect(useUiStore.getState().selectedCourseForDetails).toBeNull();
    expect(firebase.read).not.toHaveBeenCalled();
    expect(catalogue.courses).not.toHaveBeenCalled();

    await act(async () => {
      publishAuth();
      signOut.resolve();
      await operation;
    });
    await expectGuestCatalogue();
    expect(firebase.read).toHaveBeenCalledTimes(3);
    expect(firebase.watch).toHaveBeenCalledTimes(6);
    expect(catalogue.courses).toHaveBeenCalledExactlyOnceWith({ scope: 'public' });
  });

  it('keeps the same public subscriptions when the guest closes the auth modal without signing in', async () => {
    mount();
    await expectGuestCatalogue();
    act(() => useUiStore.getState().setIsAuthModalOpen(true));
    act(() => useUiStore.getState().setIsAuthModalOpen(false));
    await expectGuestCatalogue();
    expect(firebase.watch).toHaveBeenCalledTimes(3);
    expect(useAuthStore.getState().authGeneration).toBe(0);
  });

  function refreshCatalogue(collection: 'courses' | 'course_catalog_content', revision: string) {
    const path = 'client_read_runtime/live/collections/' + collection;
    const [, receive] = firebase.watch.mock.calls.findLast(([signal]) => signal === path)!;
    return act(async () => receive({ data: () => ({ revision }) }));
  }

  it.each(['courses', 'course_catalog_content'] as const)(
    'publishes a new guest card only when both snapshots contain it, with %s arriving first',
    async (first) => {
      mount();
      await expectGuestCatalogue();
      const read = firebase.read.getMockImplementation()!;
      const updatedCourse = { ...liveCourse, data: { ...liveCourse.data, price: 50000 } };
      const updatedContent = {
        ...liveContent,
        data: { ...liveContent.data, discipline: 'snowboard' },
      };
      firebase.read.mockImplementation(async (name, query) => {
        const result = await read(name, query);
        if (query.collection === 'courses') return { ...result, docs: [updatedCourse, newCourse] };
        if (query.collection === 'course_catalog_content') {
          return { ...result, docs: [updatedContent, newContent] };
        }
        return result;
      });

      await refreshCatalogue(first, '2');
      expect(courseIds()).toEqual([liveCourse.id]);
      expect(useCoursesStore.getState().publicCoursesStatus).toBe('ready');
      expect(useCoursesStore.getState().courses[0]).toMatchObject(
        first === 'courses' ? { price: 50000 } : { discipline: 'snowboard' }
      );

      const second = first === 'courses' ? 'course_catalog_content' : 'courses';
      await refreshCatalogue(second, '2');
      expect(useCoursesStore.getState().courses).toMatchObject([
        { id: liveCourse.id, price: 50000, discipline: 'snowboard' },
        { id: newCourse.id, discipline: 'ski' },
      ]);
    }
  );

  it('publishes new legacy cards with complete presentation and no discipline', async () => {
    mount();
    await expectGuestCatalogue();
    const legacyCourse = {
      id: 'course_legacy',
      data: {
        ...liveContent.data,
        title: 'Legacy course',
        totalSeats: 4,
        availableSeats: 4,
        price: 25000,
      },
    };
    const read = firebase.read.getMockImplementation()!;
    firebase.read.mockImplementation(async (name, query) => {
      const result = await read(name, query);
      if (query.collection === 'courses') {
        return { ...result, docs: [liveCourse, legacyCourse, newCourse] };
      }
      if (query.collection === 'course_catalog_content') {
        return { ...result, docs: [liveContent, { ...liveContent, id: newCourse.id }] };
      }
      return result;
    });
    await refreshCatalogue('courses', '2');
    expect(courseIds()).toEqual([liveCourse.id, legacyCourse.id]);
    expect(useCoursesStore.getState().courses[1]?.discipline).toBeUndefined();

    await refreshCatalogue('course_catalog_content', '2');
    expect(courseIds()).toEqual([liveCourse.id, legacyCourse.id, newCourse.id]);
    expect(useCoursesStore.getState().courses[2]?.discipline).toBeUndefined();
  });

  it('drops deleted cards immediately and forgets their confirmation', async () => {
    mount();
    await expectGuestCatalogue();
    const read = firebase.read.getMockImplementation()!;
    let courses: Array<typeof liveCourse> = [];
    firebase.read.mockImplementation(async (name, query) => ({
      ...(await read(name, query)),
      docs: query.collection === 'courses' ? courses : [],
    }));

    await refreshCatalogue('courses', '2');
    expect(courseIds()).toEqual([]);
    await refreshCatalogue('course_catalog_content', '2');
    courses = [liveCourse];
    await refreshCatalogue('courses', '3');
    expect(courseIds()).toEqual([]);
    expect(useCoursesStore.getState().publicCoursesStatus).toBe('ready');
  });

  it('keeps confirmed updates and waits for valid content through a transient refresh error', async () => {
    mount();
    await expectGuestCatalogue();
    const read = firebase.read.getMockImplementation()!;
    let failContent = true;
    let pendingContent = { id: newCourse.id, data: {} };
    firebase.read.mockImplementation(async (name, query) => {
      const result = await read(name, query);
      if (query.collection === 'course_catalog_content') {
        if (failContent) throw new Error('content unavailable');
        return { ...result, docs: [liveContent, pendingContent] };
      }
      if (query.collection === 'courses') {
        return {
          ...result,
          docs: [{ ...liveCourse, data: { ...liveCourse.data, price: 50000 } }, newCourse],
        };
      }
      return result;
    });
    await refreshCatalogue('course_catalog_content', '2');
    await refreshCatalogue('courses', '2');
    expect(courseIds()).toEqual([liveCourse.id]);
    expect(useCoursesStore.getState().courses[0]?.price).toBe(50000);
    expect(useCoursesStore.getState().publicCoursesStatus).toBe('error');

    failContent = false;
    await refreshCatalogue('course_catalog_content', '3');
    expect(courseIds()).toEqual([liveCourse.id]);
    expect(useCoursesStore.getState().publicCoursesStatus).toBe('ready');

    pendingContent = newContent;
    await refreshCatalogue('course_catalog_content', '4');
    expect(useCoursesStore.getState().courses[1]).toMatchObject({
      id: newCourse.id,
      discipline: 'ski',
    });
  });

  it.each(['scope change', 'unmount'])(
    'ignores both late responses and signals after %s',
    async (event) => {
      const { result, unmount } = mount();
      await expectGuestCatalogue();
      const path = 'client_read_runtime/live/collections/courses';
      const index = firebase.watch.mock.calls.findIndex(([signal]) => signal === path);
      const [, receive] = firebase.watch.mock.calls[index];
      const stop = firebase.watch.mock.results[index].value;
      const read = firebase.read.getMockImplementation()!;
      const obsolete = deferred<unknown>();
      firebase.read.mockReturnValueOnce(obsolete.promise);
      await refreshCatalogue('courses', '2');

      if (event === 'scope change') act(() => result.current('/instructor'));
      else unmount();
      expect(stop).toHaveBeenCalledOnce();
      const calls = firebase.read.mock.calls.length;
      await act(async () => {
        receive({ data: () => ({ revision: '3' }) });
        obsolete.resolve({
          ...(await read('queryScopedClientDocuments', { collection: 'courses' })),
          docs: [newCourse],
        });
      });
      expect(firebase.read).toHaveBeenCalledTimes(calls);
      expect(courseIds()).toEqual(event === 'scope change' ? [] : [liveCourse.id]);
    }
  );

  it('reports an initial content error and publishes only confirmed courses after retry', async () => {
    const read = firebase.read.getMockImplementation()!;
    const content = {
      id: liveCourse.id,
      data: {
        duration: '2 days',
        description: 'Course',
        dates: 'January',
        bgImageUrl: '/ski.jpg',
        discipline: 'ski',
      },
    };
    firebase.read.mockImplementation(async (name, query) => {
      if (query.collection === 'course_catalog_content') throw new Error('content unavailable');
      return read(name, query);
    });
    mount();
    await waitFor(() => expect(useCoursesStore.getState().publicCoursesStatus).toBe('error'));
    expect(courseIds()).toEqual([]);

    firebase.read.mockImplementation(async (name, query) => {
      const result = await read(name, query);
      return query.collection === 'course_catalog_content'
        ? { ...result, docs: [content] }
        : result;
    });
    act(() => useCoursesStore.getState().retryPublicCourses());
    expect(useCoursesStore.getState().publicCoursesStatus).toBe('loading');
    await expectGuestCatalogue();
    expect(useCoursesStore.getState().courses[0]?.discipline).toBe('ski');

    const path = 'client_read_runtime/live/collections/course_catalog_content';
    const [, receiveSignal] = firebase.watch.mock.calls.find(([signal]) => signal === path)!;
    const freshRead = firebase.read.getMockImplementation()!;
    firebase.read.mockImplementation(async (name, query) => {
      if (query.collection === 'course_catalog_content') throw new Error('refresh unavailable');
      return freshRead(name, query);
    });
    act(() => receiveSignal({ data: () => ({ revision: '2' }) }));
    await waitFor(() => expect(useCoursesStore.getState().publicCoursesStatus).toBe('error'));
    expect(useCoursesStore.getState().courses[0]?.discipline).toBe('ski');

    firebase.read.mockImplementation(read);
    act(() => receiveSignal({ data: () => ({ revision: '3' }) }));
    await expectGuestCatalogue();
    expect(useCoursesStore.getState().courses[0]?.discipline).toBeUndefined();
  });

  it('clears the joined guest catalogue when the server denies access to content', async () => {
    mount();
    await expectGuestCatalogue();
    const listener = (collection: string) =>
      firebase.watch.mock.calls.find(([path]) => path.endsWith('/' + collection))![1];
    const read = firebase.read.getMockImplementation()!;
    firebase.read.mockImplementation(async (name, query) => {
      if (query.collection === 'course_catalog_content') {
        throw Object.assign(new Error('denied'), { code: 'functions/permission-denied' });
      }
      return read(name, query);
    });
    act(() => listener('course_catalog_content')({ data: () => ({ revision: '2' }) }));
    await waitFor(() => expect(useCoursesStore.getState().publicCoursesStatus).toBe('error'));
    expect(courseIds()).toEqual([]);

    await act(async () => listener('courses')({ data: () => ({ revision: '2' }) }));
    expect(courseIds()).toEqual([]);
    expect(useCoursesStore.getState().publicCoursesStatus).toBe('error');

    firebase.read.mockImplementation(read);
    act(() => useCoursesStore.getState().retryPublicCourses());
    await expectGuestCatalogue();
  });

  it('discards a delayed guest response on sign-in and starts a fresh LIVE catalogue on sign-out', async () => {
    const read = firebase.read.getMockImplementation()!;
    const guestContent = deferred<unknown>();
    firebase.read.mockImplementation(async (name, query) =>
      query.collection === 'course_catalog_content' ? guestContent.promise : read(name, query)
    );
    mount();
    await waitFor(() =>
      expect(firebase.read).toHaveBeenCalledWith(
        'queryScopedClientDocuments',
        expect.objectContaining({ collection: 'course_catalog_content' }),
        expect.anything()
      )
    );
    expect(courseIds()).toEqual([]);
    await act(async () => publishAuth('account-test'));
    expect(courseIds()).toEqual(['course_signed_in']);
    await act(async () =>
      guestContent.resolve(
        await read('queryScopedClientDocuments', { collection: 'course_catalog_content' })
      )
    );
    expect(courseIds()).toEqual(['course_signed_in']);

    firebase.read.mockImplementation(read);
    firebase.signOut.mockImplementation(async () => publishAuth());
    await act(async () => useAuthStore.getState().handleSignOut());
    await expectGuestCatalogue();
  });

  it('ignores pending A responses when a rapid logout is followed by sign-in as B', async () => {
    const coursesA = deferred<ReturnType<typeof courseResponse>>();
    const instructorsA = deferred<ReturnType<typeof instructorResponse>>();
    const reviewsA = deferred<unknown>();
    mount('/cabinet');
    await expectGuestCatalogue();
    catalogue.courses.mockReturnValueOnce(coursesA.promise);
    catalogue.instructors.mockReturnValueOnce(instructorsA.promise);
    catalogue.accountReviews.mockReturnValueOnce(reviewsA.promise);
    await act(async () => publishAuth('account-a'));
    expect(catalogue.accountReviews).toHaveBeenCalled();
    firebase.signOut.mockImplementation(async () => publishAuth());
    await act(async () => useAuthStore.getState().handleSignOut());
    await expectGuestCatalogue();
    catalogue.courses.mockResolvedValueOnce(courseResponse('course_b'));
    catalogue.instructors.mockResolvedValueOnce(instructorResponse('ins_b'));
    await act(async () => publishAuth('account-b'));
    await act(async () => {
      coursesA.resolve(courseResponse('course_a'));
      instructorsA.resolve(instructorResponse('ins_a'));
      reviewsA.resolve({
        scope: 'account_reviews',
        reviews: [],
        bookingStates: [{ bookingId: 'booking_a' }],
      });
    });
    expect(courseIds()).toEqual(['course_b']);
    expect(instructorIds()).toEqual(['ins_b']);
    expect(useBookingsStore.getState().reviewBookingStates).toEqual([]);
    expect(useAuthStore.getState().authGeneration).toBe(3);
  });

  it.each(['courses', 'instructors'] as const)(
    'reconnects the failed public %s listener on retry without duplicating subscriptions',
    async (collection) => {
      mount();
      await expectGuestCatalogue();
      const signal = 'client_read_runtime/live/collections/' + collection;
      const status = () =>
        collection === 'courses'
          ? useCoursesStore.getState().publicCoursesStatus
          : useBookingsStore.getState().instructorCatalogueStatus;
      const failedListenerIndex = firebase.watch.mock.calls.findIndex(([path]) => path === signal);
      const stop = firebase.watch.mock.results[failedListenerIndex].value;
      act(() => firebase.watch.mock.calls[failedListenerIndex][2](new Error('signal failed')));
      expect(status()).toBe('error');
      expect(firebase.error).toHaveBeenCalledOnce();

      act(
        collection === 'courses'
          ? useCoursesStore.getState().retryPublicCourses
          : useBookingsStore.getState().retryInstructorCatalogue
      );
      expect(status()).toBe('loading');
      await expectGuestCatalogue();
      expect(stop).toHaveBeenCalledOnce();
      expect(firebase.watch.mock.calls.filter(([path]) => path === signal)).toHaveLength(2);
      const unaffected = collection === 'courses' ? 'instructors' : 'courses';
      expect(
        firebase.watch.mock.calls.filter(([path]) => path.endsWith('/' + unaffected))
      ).toHaveLength(1);
    }
  );
});
