import { useEffect, useRef } from 'react';
import { queryCourseEnrollmentReadModels } from '../../lib/canonical/canonicalReadModelClient';
import { useAccountCourseSessionStore } from './accountCourseSessionStore';
import { mergeCourseEnrollmentRecords } from './courseEnrollmentViewModel';
import type { CourseEnrollmentCabinetItem } from './courseEnrollmentContracts';

let pending: { generation: number; promise: Promise<void> } | undefined;

/** Exhaust the bounded hot pages once per surface entry or command, never on a clock tick. */
export function refreshAccountCourseSessions(afterCommand = false): Promise<void> {
  const { accountId, generation } = useAccountCourseSessionStore.getState();
  if (!accountId) return Promise.resolve();
  if (pending?.generation === generation) {
    if (!afterCommand) return pending.promise;
    return pending.promise
      .catch(() => undefined)
      .then(() => {
        const state = useAccountCourseSessionStore.getState();
        if (state.accountId === accountId && state.generation === generation) {
          return refreshAccountCourseSessions();
        }
      });
  }
  const isCurrent = () => {
    const state = useAccountCourseSessionStore.getState();
    return state.accountId === accountId && state.generation === generation;
  };
  const promise = (async () => {
    let items = new Map<string, CourseEnrollmentCabinetItem>();
    let cursor: string | undefined;
    const cursors = new Set<string>();
    do {
      const page = await queryCourseEnrollmentReadModels({
        scope: 'account_hot',
        ...(cursor ? { cursor } : {}),
      });
      if (!isCurrent()) return;
      items = mergeCourseEnrollmentRecords(items, page);
      if (!page.hasMore) break;
      if (!page.nextCursor || cursors.has(page.nextCursor)) {
        throw new Error('Account course session pagination did not advance.');
      }
      cursor = page.nextCursor;
      cursors.add(cursor);
    } while (cursor !== undefined);
    if (isCurrent()) {
      useAccountCourseSessionStore.setState({ items: [...items.values()], error: undefined });
    }
  })()
    .catch((error: unknown) => {
      if (isCurrent()) {
        useAccountCourseSessionStore.setState({
          error: error instanceof Error ? error.message : String(error),
        });
      }
      throw error;
    })
    .finally(() => {
      if (pending?.generation === generation) pending = undefined;
    });
  pending = { generation, promise };
  return promise;
}

export function useAccountCourseSessionSync(
  enabled: boolean,
  accountId: string | undefined,
  authGeneration = 0
) {
  const ownership = useRef<{
    accountId?: string;
    authGeneration: number;
    token: object;
  }>();
  useEffect(() => {
    const store = useAccountCourseSessionStore.getState();
    const scopeAccountId = enabled ? accountId : undefined;
    if (
      !ownership.current ||
      ownership.current.accountId !== scopeAccountId ||
      ownership.current.authGeneration !== authGeneration ||
      store.accountId !== scopeAccountId
    ) {
      store.reset(scopeAccountId);
    }
    const token = {};
    ownership.current = { accountId: scopeAccountId, authGeneration, token };
    const generation = useAccountCourseSessionStore.getState().generation;
    if (enabled && accountId) void refreshAccountCourseSessions().catch(() => undefined);
    return () => {
      // StrictMode replays setup synchronously: retain its in-flight read, without a timer.
      queueMicrotask(() => {
        const current = useAccountCourseSessionStore.getState();
        if (ownership.current?.token === token && current.generation === generation)
          current.reset();
      });
    };
  }, [enabled, accountId, authGeneration]);
}
