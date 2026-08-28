import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { timestampFromDate } from '@ski-academy/shared-domain';
import { useCourseEnrollmentStore } from '../../src/features/course-enrollments/courseEnrollmentStore';

const executeAuthenticatedMock = vi.fn();
const executeGuestMock = vi.fn();
const queryEnrollmentMock = vi.fn();
const queryCatalogMock = vi.fn();

vi.mock('../../src/lib/canonical/canonicalCommandClient', () => ({
  executeAuthenticatedCanonicalCommand: (...args: unknown[]) => executeAuthenticatedMock(...args),
  executeGuestCanonicalCommand: (...args: unknown[]) => executeGuestMock(...args),
  previewAuthenticatedCommandIdentity: () => ({ commandKey: 'command_fixture_01' }),
}));

vi.mock('../../src/lib/canonical/canonicalReadModelClient', () => ({
  queryCourseEnrollmentReadModels: (...args: unknown[]) => queryEnrollmentMock(...args),
  queryCourseCatalogReadModels: (...args: unknown[]) => queryCatalogMock(...args),
}));

import { useCourseEnrollmentCommands } from '../../src/features/course-enrollments/useCourseEnrollmentCommands';

describe('courseEnrollment commands integration', () => {
  beforeEach(() => {
    useCourseEnrollmentStore.getState().reset();
    executeAuthenticatedMock.mockReset();
    executeGuestMock.mockReset();
    queryEnrollmentMock.mockReset();
    queryCatalogMock.mockReset();
    localStorage.clear();
  });

  it('creates authenticated enrollment and refetches hot enrollments and catalog', async () => {
    const accountId = 'account_fixture_01';
    executeAuthenticatedMock.mockResolvedValueOnce({ status: 'success', payload: {} });
    queryEnrollmentMock.mockResolvedValueOnce({
      scope: 'account_hot',
      items: [],
      hasMore: false,
    });
    queryCatalogMock.mockResolvedValueOnce({ scope: 'public', items: [] });

    const { result } = renderHook(() => useCourseEnrollmentCommands(accountId));
    await result.current.createAuthenticatedEnrollment({
      courseId: 'course_fixture_01',
      participantIds: ['participant_fixture_01'],
      exercisedCapability: 'account_owner',
      identity: {
        enrollmentId: '',
        idempotencyKey: 'create-course-enrollment:course_fixture_01:participant_fixture_01',
      },
    });

    expect(executeAuthenticatedMock).toHaveBeenCalledWith(
      accountId,
      expect.objectContaining({
        kind: 'create_course_enrollments',
      })
    );
    expect(queryEnrollmentMock).toHaveBeenCalledWith({ scope: 'account_hot' });
    expect(queryCatalogMock).toHaveBeenCalledWith({ scope: 'public' });
  });

  it('creates guest enrollment and persists credential', async () => {
    const enrollmentId = 'enrollment_guest_fixture_01';
    const credential = {
      enrollmentId,
      guestSubjectId: 'guest_fixture_01',
      nonce: 'nonce_fixture_16chars',
      signature: 'c'.repeat(64),
      expiresAt: timestampFromDate(new Date('2099-01-01T00:00:00.000Z')),
    };
    executeGuestMock.mockResolvedValueOnce({
      status: 'success',
      payload: { guestLinkCredentials: [credential] },
    });

    const { result } = renderHook(() => useCourseEnrollmentCommands(undefined));
    const returned = await result.current.createGuestEnrollment({
      courseId: 'course_fixture_01',
      enrollmentId,
      participantId: 'participant_guest_fixture_01',
      identity: {
        enrollmentId,
        idempotencyKey: `create-guest-course-enrollment:${enrollmentId}`,
      },
      guestDisplayName: 'Guest',
      guestSkillLevel: 'beginner',
      guestDiscipline: 'ski',
      guestAgeYears: 20,
    });

    expect(returned).toEqual(credential);
    expect(localStorage.getItem(`ski_academy_guest_course_enrollment_credential:${enrollmentId}`)).toBeTruthy();
  });
});
