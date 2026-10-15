import {
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

/** Two exact documents, server-resolved identity/scope, no history reads or polling. */
export function subscribeInstructorLessonRevenue(
  onState: (state: InstructorLessonRevenueState) => void
): () => void {
  let stopped = false;
  const unsubscribes: (() => void)[] = [];
  onState({ status: 'loading' });
  void resolveInstructorLessonRevenue()
    .then(({ summaryPath, statePath }) => {
      if (stopped) return;
      let ready: boolean | undefined;
      let summary: unknown;
      let summaryReceived = false;
      const publish = () => {
        if (!stopped && ready !== undefined && summaryReceived) {
          onState(revenueStateFromProjection(ready, summary));
        }
      };
      const fail = () => {
        if (stopped) return;
        onState({ status: 'error' });
        stopped = true;
        unsubscribes.forEach((unsubscribe) => unsubscribe());
      };
      unsubscribes.push(
        onSnapshot(
          doc(db, statePath),
          { includeMetadataChanges: true },
          (snapshot) => {
            if (snapshot.metadata.fromCache) return;
            ready = snapshot.data()?.ready === true;
            publish();
          },
          fail
        )
      );
      unsubscribes.push(
        onSnapshot(
          doc(db, summaryPath),
          { includeMetadataChanges: true },
          (snapshot) => {
            if (snapshot.metadata.fromCache) return;
            summary = snapshot.exists() ? snapshot.data() : undefined;
            summaryReceived = true;
            publish();
          },
          fail
        )
      );
    })
    .catch(() => {
      if (!stopped) onState({ status: 'error' });
    });
  return () => {
    stopped = true;
    unsubscribes.forEach((unsubscribe) => unsubscribe());
  };
}
