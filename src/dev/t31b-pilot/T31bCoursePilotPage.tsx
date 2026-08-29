import React, { useCallback, useMemo, useState } from 'react';
import {
  computeCourseProvisioningManifestFingerprint,
  deriveSchedulePlanFromManifest,
  parseCommandResultPayload,
  type CanonicalTimestamp,
  type CommandResult,
} from '@ski-academy/shared-domain';
import { useAuthStore } from '../../features/auth';
import { useProfileStore } from '../../features/profile';
import {
  deriveAuthenticatedCommandId,
  executeAuthenticatedCanonicalCommand,
} from '../../lib/canonical/canonicalCommandClient';
import { queryCourseCatalogReadModels } from '../../lib/canonical/canonicalReadModelClient';
import { mapCanonicalCommandResultError } from '../../lib/canonical/mapCanonicalCommandError';
import {
  T31B_PILOT_APPLY_IDEMPOTENCY_KEY,
  T31B_PILOT_DRY_RUN_IDEMPOTENCY_KEY,
  T31B_PILOT_EXPECTED_FINGERPRINT,
  T31B_PILOT_MANIFEST,
} from './t31bPilotManifest';

const PRODUCTION_PROJECT_ID = 'ski-school-8f3ca';
const APPLY_CONFIRM_MESSAGE =
  'This will write ONE production course: BASE — First Turns. Continue?';

interface DryRunSummary {
  courseId: string;
  plannedCourseDayCount: number;
  startAt: CanonicalTimestamp;
  finalCourseDayEndsAt: CanonicalTimestamp;
  capacity: number;
  instructorRosterIds: readonly string[];
  manifestFingerprint: string;
  status: string;
}

interface ApplySummary {
  success: boolean;
  commandId: string;
  correlationId: string;
  courseId: string;
  manifestFingerprint: string;
  highLevelResult: string;
}

function summarizeDryRun(
  result: CommandResult<'apply_canonical_course_provisioning_manifest'>
): DryRunSummary | null {
  if (result.status !== 'success') {
    return null;
  }
  const parsed = parseCommandResultPayload(
    'apply_canonical_course_provisioning_manifest',
    result.payload
  );
  if (!parsed.success) {
    return null;
  }

  const schedulePlan = deriveSchedulePlanFromManifest(T31B_PILOT_MANIFEST);
  const manifestFingerprint = computeCourseProvisioningManifestFingerprint(T31B_PILOT_MANIFEST);

  return {
    courseId: parsed.data.courseId,
    plannedCourseDayCount: parsed.data.plannedCourseDayCount,
    startAt: schedulePlan.startAt,
    finalCourseDayEndsAt: schedulePlan.finalCourseDayEndsAt,
    capacity: parsed.data.availableSeats,
    instructorRosterIds: T31B_PILOT_MANIFEST.instructorRosterIds,
    manifestFingerprint,
    status: result.status,
  };
}

function summarizeApply(
  accountId: string,
  result: CommandResult<'apply_canonical_course_provisioning_manifest'>
): ApplySummary {
  const manifestFingerprint = computeCourseProvisioningManifestFingerprint(T31B_PILOT_MANIFEST);
  const commandId = deriveAuthenticatedCommandId(accountId, T31B_PILOT_APPLY_IDEMPOTENCY_KEY);

  if (result.status === 'error') {
    return {
      success: false,
      commandId,
      correlationId: result.correlationId,
      courseId: T31B_PILOT_MANIFEST.courseId,
      manifestFingerprint,
      highLevelResult: `${result.error.code}: ${result.error.message ?? result.error.code}`,
    };
  }

  const parsed = parseCommandResultPayload(
    'apply_canonical_course_provisioning_manifest',
    result.payload
  );
  const scheduleComplete =
    parsed.success && parsed.data.scheduleComplete === true ? 'schedule complete' : 'applied';

  return {
    success: true,
    commandId,
    correlationId: result.correlationId,
    courseId: parsed.success ? parsed.data.courseId : T31B_PILOT_MANIFEST.courseId,
    manifestFingerprint,
    highLevelResult: scheduleComplete,
  };
}

function formatJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

export const T31bCoursePilotPage: React.FC = () => {
  const firebaseUser = useAuthStore((state) => state.firebaseUser);
  const authLoading = useAuthStore((state) => state.authLoading);
  const userProfile = useProfileStore((state) => state.userProfile);
  const profileLoading = useProfileStore((state) => state.profileLoading);

  const [dryRunResult, setDryRunResult] =
    useState<CommandResult<'apply_canonical_course_provisioning_manifest'> | null>(null);
  const [dryRunError, setDryRunError] = useState<string | null>(null);
  const [applyResult, setApplyResult] =
    useState<CommandResult<'apply_canonical_course_provisioning_manifest'> | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [dryRunLoading, setDryRunLoading] = useState(false);
  const [applyLoading, setApplyLoading] = useState(false);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [catalogResult, setCatalogResult] = useState<unknown>(null);

  const isSignedIn = Boolean(firebaseUser);
  const isAdmin = userProfile?.role === 'admin';
  const accountId = firebaseUser?.uid;
  const controlsDisabled = !isSignedIn || !isAdmin || authLoading || profileLoading;

  const dryRunSummary = useMemo(
    () => (dryRunResult ? summarizeDryRun(dryRunResult) : null),
    [dryRunResult]
  );

  const dryRunSucceeded = useMemo(() => {
    if (!dryRunResult || dryRunResult.status !== 'success' || !dryRunSummary) {
      return false;
    }
    return dryRunSummary.manifestFingerprint === T31B_PILOT_EXPECTED_FINGERPRINT;
  }, [dryRunResult, dryRunSummary]);

  const applySummary = useMemo(() => {
    if (!applyResult || !accountId) {
      return null;
    }
    return summarizeApply(accountId, applyResult);
  }, [applyResult, accountId]);

  const runDryRun = useCallback(async () => {
    if (!accountId) {
      return;
    }
    setDryRunLoading(true);
    setDryRunError(null);
    setDryRunResult(null);
    setApplyResult(null);
    setApplyError(null);

    try {
      const result = await executeAuthenticatedCanonicalCommand(accountId, {
        kind: 'apply_canonical_course_provisioning_manifest',
        intent: {
          manifest: T31B_PILOT_MANIFEST,
          dryRun: true,
        },
        idempotencyKey: T31B_PILOT_DRY_RUN_IDEMPOTENCY_KEY,
      });
      const mappedError = mapCanonicalCommandResultError(result);
      if (mappedError) {
        setDryRunError(mappedError.message);
      }
      setDryRunResult(result);
    } catch (error) {
      setDryRunError(error instanceof Error ? error.message : 'Dry-run failed.');
    } finally {
      setDryRunLoading(false);
    }
  }, [accountId]);

  const runCatalogQuery = useCallback(async () => {
    setCatalogLoading(true);
    setCatalogError(null);
    setCatalogResult(null);
    try {
      const result = await queryCourseCatalogReadModels({ scope: 'public' });
      const baseItem = result.items.find((item) => item.courseId === T31B_PILOT_MANIFEST.courseId);
      setCatalogResult({
        scope: result.scope,
        totalItems: result.items.length,
        courseIds: result.items.map((item) => item.courseId),
        baseItem: baseItem ?? null,
        baseAbsent: baseItem === undefined,
        rawResult: result,
      });
    } catch (error) {
      setCatalogError(error instanceof Error ? error.message : 'Catalog query failed.');
    } finally {
      setCatalogLoading(false);
    }
  }, []);

  const runApply = useCallback(async () => {
    if (!accountId || !dryRunSucceeded) {
      return;
    }
    if (!window.confirm(APPLY_CONFIRM_MESSAGE)) {
      return;
    }

    setApplyLoading(true);
    setApplyError(null);
    setApplyResult(null);

    try {
      const result = await executeAuthenticatedCanonicalCommand(accountId, {
        kind: 'apply_canonical_course_provisioning_manifest',
        intent: {
          manifest: T31B_PILOT_MANIFEST,
          dryRun: false,
        },
        idempotencyKey: T31B_PILOT_APPLY_IDEMPOTENCY_KEY,
      });
      const mappedError = mapCanonicalCommandResultError(result);
      if (mappedError) {
        setApplyError(mappedError.message);
      }
      setApplyResult(result);
    } catch (error) {
      setApplyError(error instanceof Error ? error.message : 'Apply failed.');
    } finally {
      setApplyLoading(false);
    }
  }, [accountId, dryRunSucceeded]);

  if (!isSignedIn && !authLoading) {
    return (
      <main style={{ padding: '2rem', fontFamily: 'monospace' }}>
        <p>Sign in as administrator first</p>
      </main>
    );
  }

  return (
    <main style={{ padding: '2rem', fontFamily: 'monospace', maxWidth: '960px' }}>
      <h1 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>
        PRODUCTION: {PRODUCTION_PROJECT_ID}
      </h1>
      <p style={{ marginBottom: '0.25rem' }}>Dry-run does not write</p>
      <p style={{ marginBottom: '1.5rem' }}>Apply writes to production</p>

      <section style={{ marginBottom: '1.5rem' }}>
        <h2>Auth</h2>
        <p>authLoading: {String(authLoading)}</p>
        <p>profileLoading: {String(profileLoading)}</p>
        <p>signedIn: {String(isSignedIn)}</p>
        <p>email: {firebaseUser?.email ?? '(none)'}</p>
        <p>role: {userProfile?.role ?? '(none)'}</p>
        <p>isAdmin: {String(isAdmin)}</p>
      </section>

      <section style={{ marginBottom: '1.5rem' }}>
        <button type="button" onClick={runDryRun} disabled={controlsDisabled || dryRunLoading}>
          {dryRunLoading ? 'Running dry-run…' : 'Production dry-run'}
        </button>
        <button
          type="button"
          onClick={runApply}
          disabled={controlsDisabled || !dryRunSucceeded || applyLoading}
          style={{ marginLeft: '1rem' }}
        >
          {applyLoading ? 'Applying…' : 'Apply'}
        </button>
        <button
          type="button"
          onClick={runCatalogQuery}
          disabled={catalogLoading}
          style={{ marginLeft: '1rem' }}
        >
          {catalogLoading ? 'Querying catalog…' : 'Query operational catalog'}
        </button>
      </section>

      {dryRunError ? (
        <section style={{ marginBottom: '1.5rem', color: 'crimson' }}>
          <h2>Dry-run error</h2>
          <pre>{dryRunError}</pre>
        </section>
      ) : null}

      {dryRunSummary ? (
        <section style={{ marginBottom: '1.5rem' }}>
          <h2>Dry-run summary</h2>
          <pre>{formatJson(dryRunSummary)}</pre>
        </section>
      ) : null}

      {dryRunResult ? (
        <section style={{ marginBottom: '1.5rem' }}>
          <h2>Dry-run response</h2>
          <pre>{formatJson(dryRunResult)}</pre>
        </section>
      ) : null}

      {applyError ? (
        <section style={{ marginBottom: '1.5rem', color: 'crimson' }}>
          <h2>Apply error</h2>
          <pre>{applyError}</pre>
        </section>
      ) : null}

      {applySummary ? (
        <section style={{ marginBottom: '1.5rem' }}>
          <h2>Apply summary</h2>
          <pre>{formatJson(applySummary)}</pre>
        </section>
      ) : null}

      {applyResult ? (
        <section style={{ marginBottom: '1.5rem' }}>
          <h2>Apply response</h2>
          <pre>{formatJson(applyResult)}</pre>
        </section>
      ) : null}

      {catalogError ? (
        <section style={{ marginBottom: '1.5rem', color: 'crimson' }}>
          <h2>Catalog query error</h2>
          <pre>{catalogError}</pre>
        </section>
      ) : null}

      {catalogResult ? (
        <section style={{ marginBottom: '1.5rem' }}>
          <h2>Operational catalog (public scope)</h2>
          <pre>{formatJson(catalogResult)}</pre>
        </section>
      ) : null}
    </main>
  );
};
