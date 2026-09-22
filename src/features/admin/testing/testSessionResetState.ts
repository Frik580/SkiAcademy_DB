import type { TestSessionLifecycleResult } from '@ski-academy/shared-domain';

export type TestSessionResetUiPhase =
  | 'idle'
  | 'preview_loading'
  | 'preview_ready'
  | 'preview_expired'
  | 'executing'
  | 'complete'
  | 'failed';

export function manifestDestructiveTotal(counts: Readonly<Record<string, number>>): number {
  return Object.values(counts).reduce((sum, count) => sum + count, 0);
}

/** Optional server warning markers; successful previews keep both at zero. */
export function parseManifestSafetyMarkers(warnings: readonly string[]): {
  readonly liveTargetCount: number;
  readonly foreignSessionTargetCount: number;
} {
  let liveTargetCount = 0;
  let foreignSessionTargetCount = 0;
  for (const warning of warnings) {
    const liveMatch = /^live_targets:(\d+)$/.exec(warning);
    const foreignMatch = /^foreign_session_targets:(\d+)$/.exec(warning);
    if (liveMatch) liveTargetCount = Number(liveMatch[1]);
    if (foreignMatch) foreignSessionTargetCount = Number(foreignMatch[1]);
  }
  return { liveTargetCount, foreignSessionTargetCount };
}

export function isManifestExpired(expiresAtIso: string, nowMs: number): boolean {
  return nowMs >= Date.parse(expiresAtIso);
}

export function canExecuteResetPreview(input: {
  readonly manifest: NonNullable<TestSessionLifecycleResult['manifest']>;
  readonly boundTestSessionId: string;
  readonly previewTestSessionId: string;
  readonly nowMs: number;
}): boolean {
  const safety = parseManifestSafetyMarkers(input.manifest.warnings);
  if (input.boundTestSessionId !== input.previewTestSessionId) return false;
  if (isManifestExpired(input.manifest.expiresAt, input.nowMs)) return false;
  if (safety.liveTargetCount > 0 || safety.foreignSessionTargetCount > 0) return false;
  return true;
}

export function lifecycleErrorMessageKey(code: string): string {
  const known = new Set([
    'TEST_MAINTENANCE_IN_PROGRESS',
    'TEST_MAINTENANCE_SCOPE_VIOLATION',
    'TEST_MAINTENANCE_MANIFEST_STALE',
    'TEST_MAINTENANCE_MANIFEST_EXPIRED',
    'TEST_MAINTENANCE_LEASE_CONFLICT',
    'TEST_MAINTENANCE_FAILED',
    'TEST_MAINTENANCE_CONFIRMATION_INVALID',
    'TEST_SESSION_NOT_FOUND',
    'TEST_SESSION_NOT_ACTIVE',
    'TEST_SESSION_TRANSITION_FORBIDDEN',
    'LIFECYCLE_FORBIDDEN',
  ]);
  if (known.has(code)) return `adminTestingLifecycleError_${code}`;
  return 'adminTestingLifecycleError_TEST_MAINTENANCE_FAILED';
}
