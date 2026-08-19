import { describe, expect, it, vi } from 'vitest';
import {
  createFunctionsClient,
  FunctionsClientError,
} from '../../src/lib/functions/functionsClient';

describe('functionsClient', () => {
  it('retries a transient failure only when an idempotency key is supplied', async () => {
    const invoke = vi
      .fn()
      .mockRejectedValueOnce({ code: 'functions/unavailable', message: 'Temporary outage' })
      .mockResolvedValueOnce({ bookingId: 'booking-1' });
    const wait = vi.fn().mockResolvedValue(undefined);
    const logFailure = vi.fn();
    const callFunction = createFunctionsClient({ invoke, wait, logFailure });

    await expect(
      callFunction('createBooking', { id: 'booking-1' }, { idempotencyKey: 'booking-1' })
    ).resolves.toEqual({ bookingId: 'booking-1' });

    expect(invoke).toHaveBeenCalledTimes(2);
    expect(invoke).toHaveBeenCalledWith('createBooking', {
      id: 'booking-1',
      idempotencyKey: 'booking-1',
    });
    expect(wait).toHaveBeenCalledWith(250);
    expect(logFailure).not.toHaveBeenCalled();
  });

  it('normalizes and logs a final infrastructure failure', async () => {
    const logFailure = vi.fn();
    const callFunction = createFunctionsClient({
      invoke: vi.fn().mockRejectedValue({ code: 'functions/internal', message: 'Server failure' }),
      wait: vi.fn().mockResolvedValue(undefined),
      logFailure,
    });

    await expect(
      callFunction('enrollInCourse', { courseId: 'course-1' }, { idempotencyKey: 'course-1' })
    ).rejects.toMatchObject({
      name: 'FunctionsClientError',
      code: 'functions/internal',
    } satisfies Partial<FunctionsClientError>);

    expect(logFailure).toHaveBeenCalledTimes(1);
    expect(logFailure).toHaveBeenCalledWith(
      'enrollInCourse',
      expect.objectContaining({ code: 'functions/internal' })
    );
  });

  it('does not log expected domain errors', async () => {
    const logFailure = vi.fn();
    const callFunction = createFunctionsClient({
      invoke: vi
        .fn()
        .mockRejectedValue({ code: 'functions/failed-precondition', message: 'COURSE_FULL' }),
      logFailure,
    });

    await expect(
      callFunction('enrollInCourse', { courseId: 'course-1' }, { idempotencyKey: 'course-1' })
    ).rejects.toMatchObject({ code: 'functions/failed-precondition' });

    expect(logFailure).not.toHaveBeenCalled();
  });
});
