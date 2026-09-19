import {
  ADMIN_PEOPLE_REVISION_COLLECTION,
  ADMIN_PEOPLE_REVISION_DOCUMENT_ID,
  AdminPeopleRevisionDocumentSchema,
} from '@ski-academy/shared-domain';
import { subscribeAdminRealtimeRevision } from '../../../lib/admin/subscribeAdminRealtimeRevision';

export function subscribeAdminPeopleRevision(
  onRevision: (nextRevision: number) => void
): () => void {
  return subscribeAdminRealtimeRevision({
    collection: ADMIN_PEOPLE_REVISION_COLLECTION,
    documentId: ADMIN_PEOPLE_REVISION_DOCUMENT_ID,
    schema: AdminPeopleRevisionDocumentSchema,
    onRevision,
  });
}
