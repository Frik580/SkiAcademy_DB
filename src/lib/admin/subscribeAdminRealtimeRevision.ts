import type { z } from 'zod';
import { db, doc, onSnapshot } from '../../infrastructure/firebase';

export function subscribeAdminRealtimeRevision(input: {
  readonly collection: string;
  readonly documentId: string;
  readonly schema: z.ZodType<{ revision: number }>;
  readonly onRevision: (nextRevision: number) => void;
}): () => void {
  const ref = doc(db, input.collection, input.documentId);
  return onSnapshot(
    ref,
    (snapshot) => {
      const parsed = snapshot.exists() ? input.schema.safeParse(snapshot.data()) : undefined;
      input.onRevision(parsed?.success ? parsed.data.revision : 0);
    },
    () => {
      // Permission or transport errors are surfaced by the authoritative read-model query.
    }
  );
}
