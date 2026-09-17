import {
  ADMIN_PLANNER_REVISION_COLLECTION,
  ADMIN_PLANNER_REVISION_DOCUMENT_ID,
  AdminPlannerRevisionDocumentSchema,
} from '@ski-academy/shared-domain';
import { subscribeAdminRealtimeRevision } from '../../../lib/admin/subscribeAdminRealtimeRevision';

export function subscribeAdminPlannerRevision(
  onRevision: (nextRevision: number) => void
): () => void {
  return subscribeAdminRealtimeRevision({
    collection: ADMIN_PLANNER_REVISION_COLLECTION,
    documentId: ADMIN_PLANNER_REVISION_DOCUMENT_ID,
    schema: AdminPlannerRevisionDocumentSchema,
    onRevision,
  });
}
