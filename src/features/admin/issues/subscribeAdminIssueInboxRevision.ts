import {
  ADMIN_ISSUE_INBOX_REVISION_COLLECTION,
  ADMIN_ISSUE_INBOX_REVISION_DOCUMENT_ID,
  AdminIssueInboxRevisionDocumentSchema,
} from '@ski-academy/shared-domain';
import { db, doc, onSnapshot } from '../../../infrastructure/firebase';

export function subscribeAdminIssueInboxRevision(
  onRevision: (nextRevision: number) => void
): () => void {
  const ref = doc(
    db,
    ADMIN_ISSUE_INBOX_REVISION_COLLECTION,
    ADMIN_ISSUE_INBOX_REVISION_DOCUMENT_ID
  );
  return onSnapshot(
    ref,
    (snapshot) => {
      const parsed = snapshot.exists()
        ? AdminIssueInboxRevisionDocumentSchema.safeParse(snapshot.data())
        : undefined;
      onRevision(parsed?.success ? parsed.data.revision : 0);
    },
    () => {
      // Permission or transport errors are surfaced by the existing inbox read-model query.
    }
  );
}
