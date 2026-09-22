import { describe, expect, it } from 'vitest';
import {
  canExecuteResetPreview,
  isManifestExpired,
  manifestDestructiveTotal,
  parseManifestSafetyMarkers,
} from '../../src/features/admin/testing/testSessionResetState';

const baseManifest = {
  manifestId: 'me7b2aa5d9574d8623134e970f5460acf',
  manifestHash: '2e6b1dd6a221ef03debcdeb6afe3b3f761d0db0ed935cf9cfce5fa0f188f6702',
  inventoryRevision: 3,
  createdAt: '2026-09-22T10:00:00.000Z',
  expiresAt: '2026-09-22T10:10:00.000Z',
  counts: { bookings: 2, payments: 1 },
  preserve: ['test_session'],
  warnings: [] as string[],
};

describe('testSessionResetState', () => {
  it('sums destructive counts', () => {
    expect(manifestDestructiveTotal(baseManifest.counts)).toBe(3);
  });

  it('parses safety warning markers', () => {
    expect(parseManifestSafetyMarkers([])).toEqual({
      liveTargetCount: 0,
      foreignSessionTargetCount: 0,
    });
    expect(
      parseManifestSafetyMarkers(['live_targets:2', 'foreign_session_targets:1'])
    ).toEqual({ liveTargetCount: 2, foreignSessionTargetCount: 1 });
  });

  it('blocks execute when expired, foreign, live, or wrong session', () => {
    const now = Date.parse('2026-09-22T10:05:00.000Z');
    expect(
      canExecuteResetPreview({
        manifest: baseManifest,
        boundTestSessionId: 'test_a',
        previewTestSessionId: 'test_a',
        nowMs: now,
      })
    ).toBe(true);
    expect(
      canExecuteResetPreview({
        manifest: { ...baseManifest, expiresAt: '2026-09-22T09:00:00.000Z' },
        boundTestSessionId: 'test_a',
        previewTestSessionId: 'test_a',
        nowMs: now,
      })
    ).toBe(false);
    expect(
      canExecuteResetPreview({
        manifest: {
          ...baseManifest,
          warnings: ['live_targets:1'],
        },
        boundTestSessionId: 'test_a',
        previewTestSessionId: 'test_a',
        nowMs: now,
      })
    ).toBe(false);
    expect(
      canExecuteResetPreview({
        manifest: baseManifest,
        boundTestSessionId: 'test_a',
        previewTestSessionId: 'test_b',
        nowMs: now,
      })
    ).toBe(false);
  });

  it('detects manifest expiry', () => {
    expect(isManifestExpired('2026-09-22T10:00:00.000Z', Date.parse('2026-09-22T10:00:01.000Z'))).toBe(
      true
    );
  });
});
