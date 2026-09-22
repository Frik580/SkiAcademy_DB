import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TestSessionIdSchema } from '@ski-academy/shared-domain';
import {
  QUERY_BOOKING_INSTRUCTOR_CATALOGUE_READ_MODELS_CALLABLE,
  __resetCanonicalReadInFlightRegistryForTests,
  queryBookingInstructorCatalogueReadModels,
} from '../../src/lib/canonical/canonicalReadModelClient';

const callFunctionMock = vi.fn();

vi.mock('../../src/lib/functions/functionsClient', () => ({
  callFunction: (...args: unknown[]) => callFunctionMock(...args),
}));

describe('booking instructor catalogue client', () => {
  beforeEach(() => {
    callFunctionMock.mockReset();
    __resetCanonicalReadInFlightRegistryForTests();
    callFunctionMock.mockResolvedValue({ scope: 'booking_catalogue', items: [] });
  });

  it('does not send a TestSession id for the normal booking catalogue', async () => {
    await queryBookingInstructorCatalogueReadModels();
    expect(callFunctionMock).toHaveBeenCalledWith(
      QUERY_BOOKING_INSTRUCTOR_CATALOGUE_READ_MODELS_CALLABLE,
      {},
      expect.objectContaining({
        idempotencyKey: 'read:booking_instructor_catalogue:rs:live',
      })
    );
  });

  it('forwards an explicit administrator TestSession only when the caller supplies one', async () => {
    const sessionId = TestSessionIdSchema.parse('test_catalogue_client_a01');
    await queryBookingInstructorCatalogueReadModels({ requestedTestSessionId: sessionId });
    expect(callFunctionMock).toHaveBeenCalledWith(
      QUERY_BOOKING_INSTRUCTOR_CATALOGUE_READ_MODELS_CALLABLE,
      { requestedTestSessionId: sessionId },
      expect.objectContaining({
        idempotencyKey: `read:booking_instructor_catalogue:rs:${sessionId}`,
      })
    );
  });
});
