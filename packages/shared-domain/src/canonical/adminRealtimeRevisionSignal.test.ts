import { describe, expect, it } from 'vitest';
import { reduceAdminRealtimeRevisionSignal } from './adminRealtimeRevisionSignal';

describe('reduceAdminRealtimeRevisionSignal', () => {
  it('skips the initial snapshot and duplicate revisions, then refreshes once', () => {
    const initial = reduceAdminRealtimeRevisionSignal({ initialized: false }, 10);
    expect(initial).toEqual({ initialized: true, lastRevision: 10, shouldRefresh: false });

    const duplicate = reduceAdminRealtimeRevisionSignal(initial, 10);
    expect(duplicate.shouldRefresh).toBe(false);

    const changed = reduceAdminRealtimeRevisionSignal(duplicate, 11);
    expect(changed).toEqual({ initialized: true, lastRevision: 11, shouldRefresh: true });
  });
});
