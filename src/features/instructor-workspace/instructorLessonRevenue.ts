import {
  INSTRUCTOR_LESSON_REVENUE_STATE_PATH,
  InstructorLessonRevenueSummarySchema,
  type InstructorLessonRevenueState,
} from '@ski-academy/shared-domain';
import { db, doc, onSnapshot } from '../../infrastructure/firebase';
import { resolveInstructorLessonRevenue } from '../../lib/canonical/canonicalReadModelClient';

export function revenueStateFromProjection(
  ready: boolean,
  summary: unknown
): InstructorLessonRevenueState {
  if (!ready) return { status: 'unavailable' };
  const parsed = InstructorLessonRevenueSummarySchema.safeParse(
    summary ?? {
      retainedAmount: 0,
      unavailableCount: 0,
      revision: 0,
    }
  );
  if (!parsed.success || parsed.data.unavailableCount > 0) return { status: 'unavailable' };
  return { status: 'loaded', retainedAmount: parsed.data.retainedAmount };
}

export type InstructorRevenueRead =
  InstructorLessonRevenueState | { status: 'checking' | 'denied' };

type RevenuePaths = Awaited<ReturnType<typeof resolveInstructorLessonRevenue>>;

function accessFailure(error: unknown): InstructorRevenueRead {
  const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
  switch (code) {
    case 'permission-denied':
    case 'unauthenticated':
    case 'functions/permission-denied':
    case 'functions/unauthenticated':
    case 'functions/failed-precondition': // The server-resolved test session is unavailable.
      return { status: 'denied' };
    default:
      return { status: 'error' };
  }
}

function subscribeToProjection(
  { summaryPath, statePath }: RevenuePaths,
  onState: (state: InstructorLessonRevenueState) => void,
  onError: (error: unknown) => void
) {
  let ready: boolean | undefined;
  let summary: unknown;
  let summaryConfirmed = false;
  const publish = () =>
    onState(
      ready !== undefined && summaryConfirmed
        ? revenueStateFromProjection(ready, summary)
        : { status: 'loading' }
    );
  const stopState = onSnapshot(
    doc(db, statePath),
    { includeMetadataChanges: true },
    (snapshot) => {
      ready =
        snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites
          ? undefined
          : snapshot.data()?.ready === true;
      publish();
    },
    onError
  );
  const stopSummary = onSnapshot(
    doc(db, summaryPath),
    { includeMetadataChanges: true },
    (snapshot) => {
      summaryConfirmed = !snapshot.metadata.fromCache && !snapshot.metadata.hasPendingWrites;
      summary = summaryConfirmed && snapshot.exists() ? snapshot.data() : undefined;
      publish();
    },
    onError
  );
  return () => {
    stopState();
    stopSummary();
  };
}

/** One server-resolved pair of exact documents for the current account and instructor. */
export function observeInstructorLessonRevenue({
  key,
  instructorId,
  dataScope,
  testSessionId,
  isCurrent,
  onState,
}: {
  key: string;
  instructorId: string;
  dataScope: 'live' | 'test';
  testSessionId?: string;
  isCurrent: () => boolean;
  onState: (state: InstructorRevenueRead) => void;
}) {
  let stopped = false;
  let checking = false;
  let requestGeneration = 0;
  let subscription: { paths: RevenuePaths; stop: () => void } | undefined;
  let projection: InstructorLessonRevenueState = { status: 'loading' };
  const current = () => !stopped && isCurrent();
  const clear = () => {
    requestGeneration += 1;
    checking = false;
    const previous = subscription;
    subscription = undefined;
    projection = { status: 'loading' };
    previous?.stop();
  };
  const fail = (state: InstructorRevenueRead) => {
    clear();
    onState(state);
  };

  const refresh = async () => {
    if (!current() || checking) return;
    checking = true;
    const generation = ++requestGeneration;
    onState({ status: subscription ? 'checking' : 'loading' });
    let paths: RevenuePaths;
    try {
      paths = await resolveInstructorLessonRevenue(key);
    } catch (error) {
      if (current() && generation === requestGeneration) fail(accessFailure(error));
      return;
    }
    if (!current() || generation !== requestGeneration) return;
    const [collection, scope, instructors, resolvedId, extra] =
      typeof paths?.summaryPath === 'string' ? paths.summaryPath.split('/') : [];
    const matchingScope =
      dataScope === 'live'
        ? scope === 'live' && testSessionId === undefined
        : testSessionId === undefined
          ? scope?.startsWith('test_')
          : scope === `test_${testSessionId}`;
    if (
      collection !== 'instructor_lesson_revenue' ||
      !matchingScope ||
      instructors !== 'instructors' ||
      resolvedId !== instructorId ||
      extra !== undefined ||
      paths.statePath !== INSTRUCTOR_LESSON_REVENUE_STATE_PATH
    ) {
      fail({ status: 'denied' });
      return;
    }

    checking = false;
    if (
      subscription?.paths.summaryPath === paths.summaryPath &&
      subscription.paths.statePath === paths.statePath
    ) {
      onState(projection);
      return;
    }

    clear();
    onState(projection);
    const next = {
      paths,
      stop: subscribeToProjection(
        paths,
        (state) => {
          if (!current() || subscription !== next) return;
          projection = state;
          if (!checking) onState(state);
        },
        (error) => {
          if (current() && subscription === next) fail(accessFailure(error));
        }
      ),
    };
    subscription = next;
  };

  return {
    refresh,
    stop: () => {
      stopped = true;
      clear();
    },
  };
}
