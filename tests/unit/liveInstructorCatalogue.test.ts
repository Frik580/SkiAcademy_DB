import { createElement } from 'react';
import { act, renderHook } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TestSessionIdSchema } from '@ski-academy/shared-domain';
import { useAuthStore } from '../../src/features/auth/authStore';
import { useBookingsStore } from '../../src/features/bookings/bookingsStore';
import { liveCatalogueInstructors } from '../../src/features/bookings/sync/liveCatalogueInstructors';
import { useBookingsSync } from '../../src/features/bookings/sync/useBookingsSync';
import { useLessonBookingStore } from '../../src/features/lesson-bookings/lessonBookingStore';
import { getInstructorPickerGroups } from '../../src/features/student-cabinet/components/student/studentCabinetUtils';
import type { UserProfile } from '../../src/types';

const onSnapshot = vi.hoisted(() =>
  vi.fn(
    (
      _query: unknown,
      onNext: (snapshot: { docs: Array<{ id: string; data: () => unknown }> }) => void
    ) => {
      onNext({
        docs: [
          {
            id: 'e2e-instructor-1',
            data: () => ({
              name: 'E2E Test Coach',
              specialty: 'ski',
              languages: ['English'],
              experienceYears: 5,
              bio: '',
              avatarUrl: '',
              pricePerHour: 50,
              isAvailable: true,
              email: 'coach@test.example',
            }),
          },
        ],
      });
      return () => undefined;
    }
  )
);

vi.mock('../../src/infrastructure/firebase', () => ({
  collection: () => ({}),
  db: {},
  doc: () => ({}),
  handleFirestoreError: () => undefined,
  limit: () => ({}),
  onSnapshot,
  OperationType: { GET: 'GET', LIST: 'LIST' },
  query: () => ({}),
}));

vi.mock('../../src/lib/canonical/canonicalReadModelClient', () => ({
  queryAccountInstructorReviewReadModels: vi.fn(async () => ({
    scope: 'account_reviews',
    reviews: [],
    bookingStates: [],
  })),
  queryInstructorReviewReadModels: vi.fn(),
  queryPublicInstructorRatingSummaries: vi.fn(async () => ({
    scope: 'public_summaries',
    summaries: [],
  })),
}));

const sessionA = TestSessionIdSchema.parse('test_picker_sess_a01');

const profile: UserProfile = {
  uid: 'account_picker_student',
  email: 'student@example.com',
  displayName: 'Student',
  role: 'user',
  avatarUrl: '',
  balanceUSD: 0,
  level: 2,
};

function instructorDocument(
  id: string,
  fields: Record<string, unknown>
): { id: string; data: Record<string, unknown> } {
  return {
    id,
    data: {
      name: id,
      specialty: 'ski',
      languages: ['English'],
      experienceYears: 5,
      bio: '',
      avatarUrl: '',
      pricePerHour: 50,
      isAvailable: true,
      ...fields,
    },
  };
}

function pickerNames(documents: readonly { id: string; data: Record<string, unknown> }[]): string[] {
  const instructors = liveCatalogueInstructors(documents);
  return getInstructorPickerGroups(profile, [], instructors).flatMap((group) =>
    group.instructors.map((instructor) => instructor.name)
  );
}

describe('LIVE instructor catalogue for the signed-in coach picker', () => {
  it('keeps a legacy missing-scope instructor when the coach is otherwise eligible', () => {
    expect(
      pickerNames([
        instructorDocument('e2e-instructor-1', {
          name: 'E2E Test Coach',
          email: 'coach@test.example',
        }),
      ])
    ).toEqual(['E2E Test Coach']);
  });

  it('keeps an explicit LIVE instructor and hides explicit TEST instructors', () => {
    expect(
      pickerNames([
        instructorDocument('instructor-live', {
          name: 'Live Coach',
          dataScope: 'live',
          email: 'live@test.example',
        }),
        instructorDocument('instructor-test', {
          name: 'Hidden Test Coach',
          dataScope: 'test',
          testSessionId: sessionA,
          email: 'coach@example.com',
        }),
        instructorDocument('instructor-session-a', {
          name: 'Session A Coach',
          dataScope: 'test',
          testSessionId: sessionA,
        }),
      ])
    ).toEqual(['Live Coach']);
  });

  it('does not put an unavailable legacy instructor in the picker', () => {
    expect(
      pickerNames([
        instructorDocument('instructor-away', {
          name: 'Away Coach',
          isAvailable: false,
        }),
      ])
    ).toEqual([]);
    expect(
      liveCatalogueInstructors([
        instructorDocument('instructor-away', { name: 'Away Coach', isAvailable: false }),
      ]).map((instructor) => instructor.id)
    ).toEqual(['instructor-away']);
  });

  it('ignores email text when classifying catalogue visibility', () => {
    const visible = liveCatalogueInstructors([
      instructorDocument('instructor-email', {
        name: 'Email Coach',
        email: 'contains-test@example.com',
      }),
    ]);
    const hidden = liveCatalogueInstructors([
      instructorDocument('instructor-hidden-email', {
        name: 'Plain Email Coach',
        email: 'coach@example.com',
        dataScope: 'test',
        testSessionId: sessionA,
      }),
    ]);
    expect(visible.map((instructor) => instructor.name)).toEqual(['Email Coach']);
    expect(hidden).toEqual([]);
  });
});

describe('instructor catalogue reload after sign-in', () => {
  beforeEach(() => {
    onSnapshot.mockClear();
    useAuthStore.setState({ firebaseUser: null, authLoading: false, authGeneration: 0 });
    useLessonBookingStore.getState().reset();
    useBookingsStore.setState({ instructors: [], reviewSyncRequest: 0 });
  });

  it('republishes the LIVE catalogue after auth reset clears it', async () => {
    renderHook(() => useBookingsSync(), {
      wrapper: ({ children }) =>
        createElement(MemoryRouter, { initialEntries: ['/cabinet'] }, children),
    });

    expect(useBookingsStore.getState().instructors.map((instructor) => instructor.name)).toEqual([
      'E2E Test Coach',
    ]);

    await act(async () => {
      useAuthStore.getState().setFirebaseUser({ uid: 'account_picker_student' } as never);
    });

    expect(onSnapshot).toHaveBeenCalledTimes(2);
    expect(useBookingsStore.getState().instructors.map((instructor) => instructor.name)).toEqual([
      'E2E Test Coach',
    ]);
  });
});
