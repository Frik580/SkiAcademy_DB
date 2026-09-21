import {
  LIVE_CANONICAL_EXECUTION_SCOPE,
  instructorAssetStoragePath,
  type InstructorId,
  type OutboxObligationDraft,
} from '@ski-academy/shared-domain';

export const INSTRUCTOR_CATALOG_IMAGE_CLEANUP_TEMPLATE_ID =
  'instructor_catalog_image_cleanup' as const;
export const INSTRUCTOR_CATALOG_IMAGE_CLEANUP_TEMPLATE_VERSION = 'v1' as const;

export function instructorCatalogImageStoragePath(instructorId: InstructorId): string {
  return instructorAssetStoragePath(LIVE_CANONICAL_EXECUTION_SCOPE, instructorId);
}

export function instructorCatalogImageCleanupOutboxDraft(input: {
  readonly instructorId: InstructorId;
}): OutboxObligationDraft {
  return {
    deliveryEffectOrdinal: 0,
    recipient: { kind: 'instructor', id: input.instructorId },
    channel: 'in_app',
    templateId: INSTRUCTOR_CATALOG_IMAGE_CLEANUP_TEMPLATE_ID,
    templateVersion: INSTRUCTOR_CATALOG_IMAGE_CLEANUP_TEMPLATE_VERSION,
    renderInputs: {
      storagePath: instructorCatalogImageStoragePath(input.instructorId),
    },
    deliverySemantics: 'operational',
  };
}

/**
 * Best-effort Storage delete after the Firestore canonical transaction has
 * already committed. Failures must never roll back catalog deletion; the
 * staged outbox obligation remains the retryable/observable record.
 */
export async function bestEffortDeleteInstructorCatalogImage(
  instructorId: InstructorId
): Promise<void> {
  const storagePath = instructorCatalogImageStoragePath(instructorId);
  try {
    const { getStorage } = await import('firebase-admin/storage');
    await getStorage().bucket().file(storagePath).delete({ ignoreNotFound: true });
  } catch (error) {
    console.warn(
      JSON.stringify({
        event: 'instructor_catalog_image_cleanup_failed',
        instructorId,
        storagePath,
        error: error instanceof Error ? error.message : 'unknown',
      })
    );
  }
}
