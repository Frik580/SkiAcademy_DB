import { useSyncExternalStore } from 'react';
import {
  DEFAULT_SCHOOL_TIME_ZONE,
  resolveSchoolTimeZone,
  resolveLessonBookingSeason,
  type LessonBookingSeason,
} from '@ski-academy/shared-domain';
import { db, doc, onSnapshot, runTransaction } from '../../infrastructure/firebase';

const configRef = doc(db, 'resort_data', 'config');
type SchoolTimeZoneState = {
  readonly timeZone: string;
  readonly ready: boolean;
  readonly error?: Error;
  readonly season?: LessonBookingSeason;
};
const initial: SchoolTimeZoneState = { timeZone: DEFAULT_SCHOOL_TIME_ZONE, ready: false };
let state = initial;
const listeners = new Set<() => void>();
let unsubscribe: (() => void) | undefined;
function publish(next: SchoolTimeZoneState) {
  state = next;
  listeners.forEach((listener) => listener());
}
function startSubscription() {
  if (!unsubscribe) {
    unsubscribe = onSnapshot(
      configRef,
      { includeMetadataChanges: true },
      (snapshot) => {
        try {
          const timeZone = resolveSchoolTimeZone(snapshot.exists() ? snapshot.data() : undefined);
          publish({
            timeZone,
            season: resolveLessonBookingSeason(
              snapshot.exists() ? snapshot.data().season : undefined
            ),
            ready: !snapshot.metadata.fromCache && !snapshot.metadata.hasPendingWrites,
          });
        } catch (error) {
          publish({ ...initial, error: error instanceof Error ? error : new Error(String(error)) });
        }
      },
      (error) => publish({ ...initial, error })
    );
  }
}
export function retrySchoolTimeZone(): void {
  unsubscribe?.();
  unsubscribe = undefined;
  publish(initial);
  if (listeners.size > 0) startSubscription();
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  startSubscription();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      unsubscribe?.();
      unsubscribe = undefined;
      state = initial;
    }
  };
}
export function useSchoolTimeZone() {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => initial
  );
}
export function requireSchoolTimeZone(): string {
  if (!state.ready)
    throw state.error ?? new Error('School time zone has not been confirmed by the server.');
  return state.timeZone;
}
/** Compare-and-set only the timezone field; other resort settings remain untouched. */
export async function saveSchoolTimeZone(
  timeZone: string,
  expectedTimeZone: string
): Promise<void> {
  resolveSchoolTimeZone({ timeZone });
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(configRef);
    const current = resolveSchoolTimeZone(snapshot.exists() ? snapshot.data() : undefined);
    if (current !== expectedTimeZone)
      throw new Error('School time zone changed. Reload the setting before saving.');
    transaction.set(configRef, { timeZone }, { merge: true });
  });
}
