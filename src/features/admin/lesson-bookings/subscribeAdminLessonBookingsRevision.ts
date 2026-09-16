import {
  ADMIN_LESSON_BOOKINGS_REVISION_COLLECTION,
  ADMIN_LESSON_BOOKINGS_REVISION_DOCUMENT_ID,
  AdminLessonBookingsRevisionDocumentSchema,
} from '@ski-academy/shared-domain';
import { subscribeAdminRealtimeRevision } from '../../../lib/admin/subscribeAdminRealtimeRevision';

export function subscribeAdminLessonBookingsRevision(
  onRevision: (nextRevision: number) => void
): () => void {
  return subscribeAdminRealtimeRevision({
    collection: ADMIN_LESSON_BOOKINGS_REVISION_COLLECTION,
    documentId: ADMIN_LESSON_BOOKINGS_REVISION_DOCUMENT_ID,
    schema: AdminLessonBookingsRevisionDocumentSchema,
    onRevision,
  });
}
