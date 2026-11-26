import { createHash } from 'node:crypto';
import { warn } from 'firebase-functions/logger';
import { HttpsError } from 'firebase-functions/v2/https';
import { CorrelationIdSchema } from '@ski-academy/shared-domain';

interface SecurityCommandEvent {
  readonly actor: { readonly kind: 'account' | 'guest'; readonly id?: string };
  readonly commandKind: string;
  readonly resultCode: string;
  readonly scope: 'LIVE' | 'TEST' | 'unresolved';
  readonly correlationId?: string;
}

const MAX_EVENTS_PER_MINUTE = 30;
const SECURITY_DENIAL_CODES = new Set([
  'unauthorized',
  'forbidden',
  'blocked_relationship',
  'cross_scope_forbidden',
  'ADMIN_TOTP_REQUIRED',
  'TEST_SESSION_FORBIDDEN',
  'TEST_ACTOR_DISABLED',
  'TEST_ACTOR_REQUEST_FORBIDDEN',
  'TEST_ACTOR_ACCOUNT_INACTIVE',
]);
let windowMinute = -1;
let emitted = 0;

export function takeSecurityLogSlot(): boolean {
  const minute = Math.floor(Date.now() / 60_000);
  if (minute !== windowMinute) {
    windowMinute = minute;
    emitted = 0;
  }
  if (emitted >= MAX_EVENTS_PER_MINUTE) return false;
  emitted += 1;
  return true;
}

export function logSecurityCommandEvent(event: SecurityCommandEvent): void {
  if (!takeSecurityLogSlot()) return;
  const correlation = CorrelationIdSchema.safeParse(event.correlationId);
  warn('Canonical security command event', {
    actor: {
      kind: event.actor.kind,
      ...(event.actor.id
        ? { reference: createHash('sha256').update(event.actor.id).digest('hex') }
        : {}),
    },
    commandKind: event.commandKind,
    resultCode: event.resultCode,
    scope: event.scope,
    ...(correlation.success ? { correlationId: correlation.data } : {}),
  });
}

export function securityDenialCode(error: unknown): string | undefined {
  if (!(error instanceof HttpsError)) return undefined;
  const details = error.details as { code?: unknown } | undefined;
  if (error.code === 'unauthenticated' && details?.code === 'unauthorized') {
    return details.code;
  }
  if (
    (error.code === 'unauthenticated' && details?.code === 'ADMIN_SESSION_INVALID') ||
    (error.code === 'failed-precondition' && details?.code === 'ADMIN_RECENT_AUTH_REQUIRED')
  ) {
    return details.code;
  }
  if (error.code !== 'permission-denied') return undefined;
  if (typeof details?.code === 'string' && SECURITY_DENIAL_CODES.has(details.code)) {
    return details.code;
  }
  return 'permission-denied';
}
