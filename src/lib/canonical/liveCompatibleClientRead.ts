import {
  LIVE_CANONICAL_READ_SCOPE,
  documentMatchesReadScope,
  identityDocumentMatchesReadScope,
} from '@ski-academy/shared-domain';

/**
 * Client-side LIVE compatibility filter for remaining direct Firestore listeners.
 * Server callables remain authoritative. TEST client surfaces stay deferred to
 * T42B-6/T42B-8; this only prevents TEST rows from appearing on LIVE listeners.
 */
export function isLiveCompatibleResource(data: unknown): boolean {
  return documentMatchesReadScope(LIVE_CANONICAL_READ_SCOPE, data);
}

export function isLiveCompatibleIdentity(data: unknown): boolean {
  return identityDocumentMatchesReadScope(LIVE_CANONICAL_READ_SCOPE, data);
}
