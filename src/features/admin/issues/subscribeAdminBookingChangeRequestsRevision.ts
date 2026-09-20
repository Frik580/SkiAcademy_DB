import {
  ADMIN_BOOKING_CHANGE_REQUESTS_REVISION_COLLECTION,
  ADMIN_BOOKING_CHANGE_REQUESTS_REVISION_DOCUMENT_ID,
  AdminBookingChangeRequestsRevisionDocumentSchema,
} from '@ski-academy/shared-domain';
import { subscribeAdminRealtimeRevision } from '../../../lib/admin/subscribeAdminRealtimeRevision';

export function subscribeAdminBookingChangeRequestsRevision(
  onRevision: (nextRevision: number) => void
): () => void {
  return subscribeAdminRealtimeRevision({
    collection: ADMIN_BOOKING_CHANGE_REQUESTS_REVISION_COLLECTION,
    documentId: ADMIN_BOOKING_CHANGE_REQUESTS_REVISION_DOCUMENT_ID,
    schema: AdminBookingChangeRequestsRevisionDocumentSchema,
    onRevision,
  });
}
