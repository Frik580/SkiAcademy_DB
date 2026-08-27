import { describe, expect, it, vi } from 'vitest';
import { queryLessonBookingReadModels } from '../../src/lib/canonical/canonicalReadModelClient';
import { QUERY_LESSON_BOOKING_READ_MODELS_CALLABLE } from '../../src/lib/canonical/canonicalReadModelClient';

const callFunctionMock = vi.fn();

vi.mock('../../src/lib/functions/functionsClient', () => ({
  callFunction: (...args: unknown[]) => callFunctionMock(...args),
}));

describe('canonicalReadModelClient', () => {
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
});
