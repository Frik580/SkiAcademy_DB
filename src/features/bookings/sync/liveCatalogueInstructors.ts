import { toInstructor } from '../../../infrastructure/firebase/firestoreMappers';
import { isLiveCompatibleIdentity } from '../../../lib/canonical/liveCompatibleClientRead';
import type { Instructor } from '../../../types';

export function liveCatalogueInstructors(
  documents: readonly { readonly id: string; readonly data: unknown }[]
): Instructor[] {
  return documents.flatMap((document) =>
    isLiveCompatibleIdentity(document.data) ? [toInstructor(document.id, document.data)] : []
  );
}
