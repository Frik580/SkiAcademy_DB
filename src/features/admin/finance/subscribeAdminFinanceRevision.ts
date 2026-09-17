import {
  ADMIN_FINANCE_REVISION_COLLECTION,
  ADMIN_FINANCE_REVISION_DOCUMENT_ID,
  AdminFinanceRevisionDocumentSchema,
} from '@ski-academy/shared-domain';
import { subscribeAdminRealtimeRevision } from '../../../lib/admin/subscribeAdminRealtimeRevision';

export function subscribeAdminFinanceRevision(
  onRevision: (nextRevision: number) => void
): () => void {
  return subscribeAdminRealtimeRevision({
    collection: ADMIN_FINANCE_REVISION_COLLECTION,
    documentId: ADMIN_FINANCE_REVISION_DOCUMENT_ID,
    schema: AdminFinanceRevisionDocumentSchema,
    onRevision,
  });
}
