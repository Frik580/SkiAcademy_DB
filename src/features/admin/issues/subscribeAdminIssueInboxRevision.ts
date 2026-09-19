import {
  ADMIN_ISSUE_INBOX_REVISION_COLLECTION,
  ADMIN_ISSUE_INBOX_REVISION_DOCUMENT_ID,
  AdminIssueInboxRevisionDocumentSchema,
} from '@ski-academy/shared-domain';
import { subscribeAdminRealtimeRevision } from '../../../lib/admin/subscribeAdminRealtimeRevision';

export function subscribeAdminIssueInboxRevision(
  onRevision: (nextRevision: number) => void
): () => void {
  return subscribeAdminRealtimeRevision({
    collection: ADMIN_ISSUE_INBOX_REVISION_COLLECTION,
    documentId: ADMIN_ISSUE_INBOX_REVISION_DOCUMENT_ID,
    schema: AdminIssueInboxRevisionDocumentSchema,
    onRevision,
  });
}
