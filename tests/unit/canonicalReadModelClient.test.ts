import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  QueryAdminIssueReadModelsInputSchema,
  QueryAdminFinanceReadModelsInputSchema,
  QueryLessonBookingReadModelsInputSchema,
} from '@ski-academy/shared-domain';
import {
  queryAdminIssueReadModels,
  queryAdminFinanceReadModels,
  queryBookingChangeRequestReadModels,
  queryBookingProposalReadModels,
  queryCourseCatalogReadModels,
  queryInstructorCourseAssignmentReadModels,
  queryLessonBookingReadModels,
  queryParticipantInstructorAccessReadModels,
} from '../../src/lib/canonical/canonicalReadModelClient';
import {
  QUERY_BOOKING_CHANGE_REQUEST_READ_MODELS_CALLABLE,
  QUERY_ADMIN_ISSUE_READ_MODELS_CALLABLE,
  QUERY_ADMIN_FINANCE_READ_MODELS_CALLABLE,
  QUERY_BOOKING_PROPOSAL_READ_MODELS_CALLABLE,
  QUERY_COURSE_CATALOG_READ_MODELS_CALLABLE,
  QUERY_INSTRUCTOR_COURSE_ASSIGNMENT_READ_MODELS_CALLABLE,
  QUERY_LESSON_BOOKING_READ_MODELS_CALLABLE,
  QUERY_PARTICIPANT_INSTRUCTOR_ACCESS_READ_MODELS_CALLABLE,
} from '../../src/lib/canonical/canonicalReadModelClient';

const callFunctionMock = vi.fn();

vi.mock('../../src/lib/functions/functionsClient', () => ({
  callFunction: (...args: unknown[]) => callFunctionMock(...args),
}));

describe('canonicalReadModelClient', () => {
  beforeEach(() => {
    callFunctionMock.mockReset();
  });
  it('calls queryLessonBookingReadModels callable for instructor_hot with transport idempotency key', async () => {
    callFunctionMock.mockResolvedValueOnce({
      scope: 'instructor_hot',
      items: [],
      hasMore: false,
    });

    const result = await queryLessonBookingReadModels({ scope: 'instructor_hot' });

    expect(result.scope).toBe('instructor_hot');
    expect(callFunctionMock).toHaveBeenCalledWith(
      QUERY_LESSON_BOOKING_READ_MODELS_CALLABLE,
      { scope: 'instructor_hot' },
      expect.objectContaining({
        idempotencyKey: 'read:lesson_booking:instructor_hot:start:none',
        maxAttempts: 1,
      })
    );
  });

  it('calls the canonical AdminIssue read callable and omits empty cursor fields', async () => {
    callFunctionMock.mockResolvedValueOnce({
      scope: 'admin_open',
      items: [],
      hasMore: false,
    });

    await queryAdminIssueReadModels({
      scope: 'admin_open',
      severity: 'critical',
      cursor: undefined,
    });

    expect(callFunctionMock).toHaveBeenCalledWith(
      QUERY_ADMIN_ISSUE_READ_MODELS_CALLABLE,
      { scope: 'admin_open', severity: 'critical' },
      {
        idempotencyKey: 'read:admin_issue:admin_open:all:critical:start',
        maxAttempts: 1,
      }
    );
    expect(
      QueryAdminIssueReadModelsInputSchema.safeParse(callFunctionMock.mock.calls[0]?.[1]).success
    ).toBe(true);
  });

  it('calls the canonical Admin finance read callable with target-scoped read identity', async () => {
    callFunctionMock.mockResolvedValueOnce({
      scope: 'admin_payment_detail',
    });

    await queryAdminFinanceReadModels({
      scope: 'admin_payment_detail',
      paymentId: 'payment_admin_client_test_01',
      cursor: 'cursor_admin_finance_page_2',
    });

    expect(callFunctionMock).toHaveBeenCalledWith(
      QUERY_ADMIN_FINANCE_READ_MODELS_CALLABLE,
      {
        scope: 'admin_payment_detail',
        paymentId: 'payment_admin_client_test_01',
        cursor: 'cursor_admin_finance_page_2',
      },
      expect.objectContaining({
        idempotencyKey: expect.stringMatching(/^read:admin_finance:[a-f0-9]{64}$/),
        maxAttempts: 1,
      })
    );
    expect(callFunctionMock.mock.calls[0]?.[2].idempotencyKey.length).toBeLessThanOrEqual(200);
    expect(
      QueryAdminFinanceReadModelsInputSchema.safeParse(callFunctionMock.mock.calls[0]?.[1]).success
    ).toBe(true);
  });

  it('keeps a long opaque Admin finance cursor out of the transport idempotency key', async () => {
    callFunctionMock.mockResolvedValueOnce({ scope: 'admin_payment_detail' });
    const cursor = Buffer.from(
      JSON.stringify({
        scope: 'admin_payment_detail',
        target: 'payment_01',
        padding: 'x'.repeat(400),
      })
    ).toString('base64url');

    await queryAdminFinanceReadModels({
      scope: 'admin_payment_detail',
      paymentId: 'payment_admin_client_test_01',
      cursor,
    });

    const options = callFunctionMock.mock.calls[0]?.[2];
    expect(options.idempotencyKey).toMatch(/^read:admin_finance:[a-f0-9]{64}$/);
    expect(options.idempotencyKey.length).toBeLessThanOrEqual(200);
    expect(options.idempotencyKey).not.toContain(cursor);
  });

  it('calls queryLessonBookingReadModels callable without Firestore access', async () => {
    callFunctionMock.mockResolvedValueOnce({
      scope: 'account_hot',
      items: [],
      hasMore: false,
    });

    const result = await queryLessonBookingReadModels({ scope: 'account_hot' });

    expect(result.scope).toBe('account_hot');
    expect(callFunctionMock).toHaveBeenCalledWith(
      QUERY_LESSON_BOOKING_READ_MODELS_CALLABLE,
      { scope: 'account_hot' },
      expect.objectContaining({ maxAttempts: 1 })
    );
  });

  it('omits cursor from first account_history transport payload', async () => {
    callFunctionMock.mockResolvedValueOnce({
      scope: 'account_history',
      items: [],
      hasMore: false,
    });

    await queryLessonBookingReadModels({ scope: 'account_history', cursor: undefined });

    const transportPayload = callFunctionMock.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(transportPayload).toEqual({ scope: 'account_history' });
    expect(transportPayload).not.toHaveProperty('cursor');
    expect(QueryLessonBookingReadModelsInputSchema.safeParse(transportPayload).success).toBe(true);
  });

  it('includes cursor for paginated account_history transport payload', async () => {
    const cursor = 'cursor_page_2_fixture';
    callFunctionMock.mockResolvedValueOnce({
      scope: 'account_history',
      items: [],
      hasMore: true,
      nextCursor: 'cursor_page_3_fixture',
    });

    await queryLessonBookingReadModels({ scope: 'account_history', cursor });

    expect(callFunctionMock).toHaveBeenCalledWith(
      QUERY_LESSON_BOOKING_READ_MODELS_CALLABLE,
      { scope: 'account_history', cursor },
      expect.objectContaining({
        idempotencyKey: `read:lesson_booking:account_history:${cursor}:none`,
        maxAttempts: 1,
      })
    );
    expect(
      QueryLessonBookingReadModelsInputSchema.safeParse(callFunctionMock.mock.calls[0]?.[1]).success
    ).toBe(true);
  });

  it('does not emit cursor: null in lesson booking transport payload', async () => {
    callFunctionMock.mockResolvedValueOnce({
      scope: 'account_history',
      items: [],
      hasMore: false,
    });

    await queryLessonBookingReadModels({
      scope: 'account_history',
      cursor: null as unknown as string,
    });

    const transportPayload = callFunctionMock.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(transportPayload).toEqual({ scope: 'account_history' });
    expect(transportPayload).not.toHaveProperty('cursor');
    expect(QueryLessonBookingReadModelsInputSchema.safeParse(transportPayload).success).toBe(true);
  });

  it('calls queryCourseCatalogReadModels callable with public scope', async () => {
    callFunctionMock.mockResolvedValueOnce({
      scope: 'public',
      items: [],
    });

    const result = await queryCourseCatalogReadModels({ scope: 'public' });

    expect(result.scope).toBe('public');
    expect(callFunctionMock).toHaveBeenCalledWith(
      QUERY_COURSE_CATALOG_READ_MODELS_CALLABLE,
      { scope: 'public' },
      expect.objectContaining({
        idempotencyKey: 'read:course_catalog:public:all',
        maxAttempts: 1,
      })
    );
  });

  it('calls queryInstructorCourseAssignmentReadModels callable with instructor_assigned scope', async () => {
    callFunctionMock.mockResolvedValueOnce({
      scope: 'instructor_assigned',
      items: [],
    });

    const result = await queryInstructorCourseAssignmentReadModels({
      scope: 'instructor_assigned',
    });

    expect(result.scope).toBe('instructor_assigned');
    expect(callFunctionMock).toHaveBeenCalledWith(
      QUERY_INSTRUCTOR_COURSE_ASSIGNMENT_READ_MODELS_CALLABLE,
      { scope: 'instructor_assigned' },
      expect.objectContaining({
        idempotencyKey: 'read:instructor_course_assignment:instructor_assigned',
        maxAttempts: 1,
      })
    );
  });

  it('calls collaboration read model callables with transport idempotency keys', async () => {
    callFunctionMock
      .mockResolvedValueOnce({ scope: 'account_open', items: [] })
      .mockResolvedValueOnce({ scope: 'instructor_open', items: [] })
      .mockResolvedValueOnce({ scope: 'account_manager', item: undefined });

    await queryBookingProposalReadModels({ scope: 'account_open' });
    await queryBookingChangeRequestReadModels({ scope: 'instructor_open' });
    await queryParticipantInstructorAccessReadModels({
      scope: 'account_manager',
      participantId: 'participant_fixture_01',
      instructorId: 'instructor_fixture_01',
    });

    expect(callFunctionMock).toHaveBeenNthCalledWith(
      1,
      QUERY_BOOKING_PROPOSAL_READ_MODELS_CALLABLE,
      { scope: 'account_open' },
      expect.objectContaining({
        idempotencyKey: 'read:booking_proposal:account_open',
        maxAttempts: 1,
      })
    );
    expect(callFunctionMock).toHaveBeenNthCalledWith(
      2,
      QUERY_BOOKING_CHANGE_REQUEST_READ_MODELS_CALLABLE,
      { scope: 'instructor_open' },
      expect.objectContaining({
        idempotencyKey: 'read:booking_change_request:instructor_open',
        maxAttempts: 1,
      })
    );
    expect(callFunctionMock).toHaveBeenNthCalledWith(
      3,
      QUERY_PARTICIPANT_INSTRUCTOR_ACCESS_READ_MODELS_CALLABLE,
      {
        scope: 'account_manager',
        participantId: 'participant_fixture_01',
        instructorId: 'instructor_fixture_01',
      },
      expect.objectContaining({
        idempotencyKey:
          'read:participant_instructor_access:account_manager:participant_fixture_01:instructor_fixture_01',
        maxAttempts: 1,
      })
    );
  });
});
