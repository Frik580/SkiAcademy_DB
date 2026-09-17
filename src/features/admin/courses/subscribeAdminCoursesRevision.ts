import {
  ADMIN_COURSES_REVISION_COLLECTION,
  ADMIN_COURSES_REVISION_DOCUMENT_ID,
  AdminCoursesRevisionDocumentSchema,
} from '@ski-academy/shared-domain';
import { subscribeAdminRealtimeRevision } from '../../../lib/admin/subscribeAdminRealtimeRevision';

export function subscribeAdminCoursesRevision(
  onRevision: (nextRevision: number) => void
): () => void {
  return subscribeAdminRealtimeRevision({
    collection: ADMIN_COURSES_REVISION_COLLECTION,
    documentId: ADMIN_COURSES_REVISION_DOCUMENT_ID,
    schema: AdminCoursesRevisionDocumentSchema,
    onRevision,
  });
}
