import { describe, expect, it } from 'vitest';
import { CanonicalCommandClientError } from '../../src/lib/canonical/mapCanonicalCommandError';
import { presentCanonicalCommandError } from '../../src/features/instructor-courses/presentInstructorCourseCommandError';

describe('instructor course command error presentation', () => {
  it('marks stale_version as refresh-required', () => {
    const presented = presentCanonicalCommandError(
      new CanonicalCommandClientError('stale_version', {
        correlationId: 'correlation_stale',
        currentRevision: 12,
      })
    );
    expect(presented.code).toBe('stale_version');
    expect(presented.shouldRefresh).toBe(true);
    expect(presented.currentRevision).toBe(12);
  });
});
