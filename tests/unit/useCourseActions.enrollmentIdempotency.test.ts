/* eslint-disable @typescript-eslint/no-explicit-any */
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Course, UserProfile } from '../../src/types';
import type { CourseEnrollmentCabinetItem } from '../../src/features/course-enrollments/courseEnrollmentContracts';
import type { CourseCatalogOperationalState } from '../../src/features/course-enrollments/courseEnrollmentContracts';

const { mockCreateAuthenticatedEnrollment, mockNotify, mockConfetti } = vi.hoisted(() => ({
  mockCreateAuthenticatedEnrollment: vi.fn(),
  mockNotify: vi.fn(),
  mockConfetti: vi.fn(),
}));

vi.mock('canvas-confetti', () => ({ default: (...args: unknown[]) => mockConfetti(...args) }));

vi.mock(
  '../../src/features/course-enrollments/useCourseEnrollmentCommands',
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import('../../src/features/course-enrollments/useCourseEnrollmentCommands')
      >();
    return {
      ...actual,
      useCourseEnrollmentCommands: () => ({
        createAuthenticatedEnrollment: mockCreateAuthenticatedEnrollment,
        createGuestEnrollment: vi.fn(),
        withdrawEnrollment: vi.fn(),
        requestCancellation: vi.fn(),
      }),
    };
  }
);

vi.mock('../../src/features/courses/courseService', () => ({
  addCourseService: vi.fn(),
  updateCourseService: vi.fn(),
  deleteCourseService: vi.fn(),
  notifyCourseModifiedService: vi.fn(),
  CanonicalCourseAdminWriteBlockedError: class CanonicalCourseAdminWriteBlockedError extends Error {},
}));

vi.mock('../../src/features/auth/authService', () => ({
  getCurrentAuthenticatedUser: () => ({ uid: 'account_fixture_01' }),
}));

vi.mock('../../src/features/lesson-bookings', () => ({
  presentCanonicalCommandErrorWithContext: (error: unknown) => ({
    code: (error as { code?: string })?.code ?? 'unknown',
    message: error instanceof Error ? error.message : 'error',
  }),
}));

import { useCourseActions } from '../../src/features/courses/useCourseActions';
import { useAuthStore } from '../../src/features/auth/authStore';
import { useProfileStore } from '../../src/features/profile/profileStore';
import { useWalletStore } from '../../src/features/wallet/walletStore';
import { selectEffectiveBalance } from '../../src/features/wallet/walletSelectors';
import { useCoursesStore } from '../../src/features/courses/coursesStore';
import { useCourseEnrollmentStore } from '../../src/features/course-enrollments/courseEnrollmentStore';
import { setStoreContext } from '../../src/store/storeContext';

const COURSE_ID = 'course_fixture_01';
const PARTICIPANT_ID = 'participant_fixture_01';
const COURSE_PRICE = 250_000;
const INITIAL_BALANCE = 500_000;

const course: Course = {
  id: COURSE_ID,
  title: 'Beginner Camp',
  description: '',
  shortDescription: '',
  price: COURSE_PRICE,
  priceKZT: COURSE_PRICE,
  availableSeats: 7,
  totalSeats: 8,
  dates: '',
  duration: '',
  level: 'beginner',
  instructorIds: [],
  bgImageUrl: '',
  isHidden: false,
};

const profile: UserProfile = {
  uid: 'account_fixture_01',
  email: 'client@example.com',
  displayName: 'Client',
  role: 'user',
  avatarUrl: '',
  balanceUSD: 0,
  isClientActive: true,
};

function enrollmentItem(
  overrides: Partial<CourseEnrollmentCabinetItem> = {}
): CourseEnrollmentCabinetItem {
  return {
    enrollmentId: 'enrollment_fixture_01',
    revision: 1,
    courseId: COURSE_ID,
    participantId: PARTICIPANT_ID,
    participantName: 'Alice',
    lifecycleStatus: 'confirmed',
    courseTitle: 'Beginner Camp',
    courseSchedule: {
      courseId: COURSE_ID,
      courseScheduleRevision: 1,
      courseDayCount: 1,
      startAt: { seconds: 1_800_000_000, nanoseconds: 0 },
      finalCourseDayEndsAt: { seconds: 1_800_010_000, nanoseconds: 0 },
      courseDays: [
        {
          courseDayId: 'course_day_fixture_01',
          dayOrder: 1,
          interval: {
            startsAt: { seconds: 1_800_000_000, nanoseconds: 0 },
            endsAt: { seconds: 1_800_010_000, nanoseconds: 0 },
          },
          timeZone: 'Asia/Almaty',
          revision: 1,
        },
      ],
    },
    scheduleStartDate: '2027-01-15',
    scheduleEndDate: '2027-01-15',
    bookingOrigin: 'account',
    authorizedActions: { canWithdraw: true, canRequestCancellation: false },
    updatedAtSeconds: 1_800_000_000,
    ...overrides,
  };
}

function catalogState(
  overrides: Partial<CourseCatalogOperationalState> = {}
): CourseCatalogOperationalState {
  return {
    courseId: COURSE_ID,
    revision: 2,
    title: 'Beginner Camp',
    priceMinorUnits: COURSE_PRICE,
    totalSeats: 8,
    availableSeats: 7,
    isCapacityFrozen: false,
    isEnrollmentEligible: true,
    isFull: false,
    scheduleSummaryStartDate: '2027-01-15',
    scheduleSummaryEndDate: '2027-01-15',
    courseDayCount: 1,
    courseSchedule: enrollmentItem().courseSchedule,
    ...overrides,
  };
}

describe('useCourseActions.handleBookCourse equivalent enrollment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setStoreContext({
      notify: mockNotify,
      t: (key: string) => key,
      language: () => 'en',
    });
    useAuthStore.setState({
      firebaseUser: { uid: profile.uid, email: profile.email } as any,
    });
    useProfileStore.setState({ userProfile: profile });
    useCoursesStore.setState({ courses: [course] } as any);
    useWalletStore.setState({
      canonicalBalanceKzt: INITIAL_BALANCE,
      canonicalWalletExists: true,
      canonicalWalletLoaded: true,
      optimisticBalanceDelta: 0,
    });
    useCourseEnrollmentStore.getState().reset();
    useCourseEnrollmentStore.getState().mergeCatalog(new Map([[COURSE_ID, catalogState()]]));
    mockCreateAuthenticatedEnrollment.mockResolvedValue({ outcome: 'created' });
  });

  it('skips command and wallet debit when participant is already enrolled locally', async () => {
    useCourseEnrollmentStore
      .getState()
      .mergeItems(new Map([['enrollment_fixture_01', enrollmentItem()]]));
    const seatsBefore = useCourseEnrollmentStore
      .getState()
      .catalogByCourseId.get(COURSE_ID)?.availableSeats;

    const { result } = renderHook(() => useCourseActions());
    await act(async () => {
      await result.current.handleBookCourse(COURSE_ID, {
        participantIds: [PARTICIPANT_ID],
        exercisedCapability: 'account_owner',
      });
    });

    expect(mockCreateAuthenticatedEnrollment).not.toHaveBeenCalled();
    expect(selectEffectiveBalance(useWalletStore.getState())).toBe(INITIAL_BALANCE);
    expect(useWalletStore.getState().optimisticBalanceDelta).toBe(0);
    expect(
      useCourseEnrollmentStore.getState().catalogByCourseId.get(COURSE_ID)?.availableSeats
    ).toBe(seatsBefore);
    expect(mockNotify).toHaveBeenCalledWith('warning', 'alreadyEnrolled', 'alreadyEnrolledDesc');
    expect(mockConfetti).not.toHaveBeenCalled();
    expect(mockNotify).not.toHaveBeenCalledWith(
      'success',
      'enrollmentConfirmed',
      expect.any(String)
    );
  });

  it('skips second same-session submit after created success even if store is stale', async () => {
    mockCreateAuthenticatedEnrollment.mockResolvedValue({ outcome: 'created' });

    const { result } = renderHook(() => useCourseActions());
    await act(async () => {
      await result.current.handleBookCourse(COURSE_ID, {
        participantIds: [PARTICIPANT_ID],
        exercisedCapability: 'account_owner',
      });
    });

    // Simulate stale cache: enrollment missing after first success.
    useCourseEnrollmentStore.getState().reset();
    useCourseEnrollmentStore.getState().mergeCatalog(new Map([[COURSE_ID, catalogState()]]));
    mockCreateAuthenticatedEnrollment.mockClear();
    mockNotify.mockClear();
    mockConfetti.mockClear();
    // Keep the post-success optimistic debit as-is; retry must not debit again.
    const balanceAfterFirst = selectEffectiveBalance(useWalletStore.getState());

    await act(async () => {
      await result.current.handleBookCourse(COURSE_ID, {
        participantIds: [PARTICIPANT_ID],
        exercisedCapability: 'account_owner',
      });
    });

    expect(mockCreateAuthenticatedEnrollment).not.toHaveBeenCalled();
    expect(selectEffectiveBalance(useWalletStore.getState())).toBe(balanceAfterFirst);
    expect(mockNotify).toHaveBeenCalledWith('warning', 'alreadyEnrolled', 'alreadyEnrolledDesc');
    expect(mockConfetti).not.toHaveBeenCalled();
  });

  it('reconciles equivalent success without debit, capacity change, or duplicate success toast', async () => {
    const seatsBefore = useCourseEnrollmentStore
      .getState()
      .catalogByCourseId.get(COURSE_ID)?.availableSeats;
    mockCreateAuthenticatedEnrollment.mockImplementation(async () => {
      useCourseEnrollmentStore
        .getState()
        .mergeItems(new Map([['enrollment_fixture_01', enrollmentItem()]]));
      // Catalog stays at the already-decremented seats after equivalent replay.
      useCourseEnrollmentStore
        .getState()
        .mergeCatalog(new Map([[COURSE_ID, catalogState({ availableSeats: 7, revision: 2 })]]));
      return { outcome: 'already_exists' };
    });

    const { result } = renderHook(() => useCourseActions());
    await act(async () => {
      await result.current.handleBookCourse(COURSE_ID, {
        participantIds: [PARTICIPANT_ID],
        exercisedCapability: 'account_owner',
      });
    });

    expect(mockCreateAuthenticatedEnrollment).toHaveBeenCalledTimes(1);
    expect(selectEffectiveBalance(useWalletStore.getState())).toBe(INITIAL_BALANCE);
    expect(useWalletStore.getState().optimisticBalanceDelta).toBe(0);
    expect(
      useCourseEnrollmentStore.getState().catalogByCourseId.get(COURSE_ID)?.availableSeats
    ).toBe(seatsBefore);
    expect(mockNotify).toHaveBeenCalledWith('warning', 'alreadyEnrolled', 'alreadyEnrolledDesc');
    expect(mockConfetti).not.toHaveBeenCalled();
    expect(mockNotify).not.toHaveBeenCalledWith(
      'success',
      'enrollmentConfirmed',
      expect.any(String)
    );
  });

  it('applies a single optimistic debit and success toast on first created enrollment', async () => {
    mockCreateAuthenticatedEnrollment.mockImplementation(async () => {
      useCourseEnrollmentStore
        .getState()
        .mergeItems(new Map([['enrollment_fixture_01', enrollmentItem()]]));
      useCourseEnrollmentStore
        .getState()
        .mergeCatalog(new Map([[COURSE_ID, catalogState({ availableSeats: 7, revision: 3 })]]));
      return { outcome: 'created' };
    });

    const { result } = renderHook(() => useCourseActions());
    await act(async () => {
      await result.current.handleBookCourse(COURSE_ID, {
        participantIds: [PARTICIPANT_ID],
        exercisedCapability: 'account_owner',
      });
    });

    expect(mockCreateAuthenticatedEnrollment).toHaveBeenCalledTimes(1);
    expect(selectEffectiveBalance(useWalletStore.getState())).toBe(INITIAL_BALANCE - COURSE_PRICE);
    expect(useWalletStore.getState().optimisticBalanceDelta).toBe(-COURSE_PRICE);
    expect(useCourseEnrollmentStore.getState().items.has('enrollment_fixture_01')).toBe(true);
    expect(
      useCourseEnrollmentStore.getState().catalogByCourseId.get(COURSE_ID)?.availableSeats
    ).toBe(7);
    expect(mockNotify).toHaveBeenCalledWith(
      'success',
      'enrollmentConfirmed',
      expect.stringContaining('Beginner Camp')
    );
    expect(mockConfetti).toHaveBeenCalledTimes(1);
  });

  it('rolls back optimistic wallet and capacity state when the command fails', async () => {
    const seatsBefore = useCourseEnrollmentStore
      .getState()
      .catalogByCourseId.get(COURSE_ID)?.availableSeats;
    mockCreateAuthenticatedEnrollment.mockRejectedValueOnce(
      Object.assign(new Error('insufficient funds'), { code: 'insufficient_funds' })
    );

    const { result } = renderHook(() => useCourseActions());
    await act(async () => {
      await result.current.handleBookCourse(COURSE_ID, {
        participantIds: [PARTICIPANT_ID],
        exercisedCapability: 'account_owner',
      });
    });

    expect(selectEffectiveBalance(useWalletStore.getState())).toBe(INITIAL_BALANCE);
    expect(useWalletStore.getState().optimisticBalanceDelta).toBe(0);
    expect(useCourseEnrollmentStore.getState().items.size).toBe(0);
    expect(
      useCourseEnrollmentStore.getState().catalogByCourseId.get(COURSE_ID)?.availableSeats
    ).toBe(seatsBefore);
    expect(mockConfetti).not.toHaveBeenCalled();
    expect(mockNotify).toHaveBeenCalledWith('error', 'bookingFailed', 'bookingFailedDesc');
  });

  it('blocks command only for the selected enrolled participant, not siblings', async () => {
    const siblingId = 'participant_fixture_02';
    useCourseEnrollmentStore
      .getState()
      .mergeItems(new Map([['enrollment_fixture_01', enrollmentItem()]]));

    const { result } = renderHook(() => useCourseActions());
    await act(async () => {
      await result.current.handleBookCourse(COURSE_ID, {
        participantIds: [PARTICIPANT_ID],
        exercisedCapability: 'account_owner',
      });
    });
    expect(mockCreateAuthenticatedEnrollment).not.toHaveBeenCalled();

    mockNotify.mockClear();
    mockCreateAuthenticatedEnrollment.mockResolvedValue({ outcome: 'created' });
    await act(async () => {
      await result.current.handleBookCourse(COURSE_ID, {
        participantIds: [siblingId],
        exercisedCapability: 'account_owner',
      });
    });

    expect(mockCreateAuthenticatedEnrollment).toHaveBeenCalledTimes(1);
    expect(mockCreateAuthenticatedEnrollment).toHaveBeenCalledWith(
      expect.objectContaining({
        courseId: COURSE_ID,
        participantIds: [siblingId],
      })
    );
    expect(mockNotify).toHaveBeenCalledWith(
      'success',
      'enrollmentConfirmed',
      expect.stringContaining('Beginner Camp')
    );
  });
});
