import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AUTH_EMULATOR_HOST,
  DEFAULT_LESSON_DURATION_MINUTES,
  E2E_PROJECT_ID,
  functionsCallableUrl,
} from './emulator-config';

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const requireRoot = createRequire(join(rootDir, 'package.json'));
const { BookingIdSchema } = requireRoot('@ski-academy/shared-domain');

export interface AuthenticatedBookingAttemptInput {
  readonly accountId: string;
  readonly email: string;
  readonly password: string;
  readonly instructorId: string;
  readonly participantIds: readonly string[];
  readonly localDate: string;
  readonly localTime: string;
  readonly timezone: string;
  readonly durationMinutes?: number;
  readonly bookingId?: string;
  readonly exercisedCapability?: 'account_owner' | 'parent_guardian';
}

export interface CallableAttemptResult {
  readonly ok: boolean;
  readonly status: number;
  readonly resultStatus?: string;
  readonly errorCode?: string;
  readonly errorMessage?: string;
}

type CallablePayload = {
  result?: { status?: string; error?: { code?: string; message?: string } };
  error?: {
    status?: string;
    message?: string;
    details?: { code?: string; message?: string };
  };
};

async function signInForIdToken(email: string, password: string): Promise<string> {
  const response = await fetch(
    `${AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-api-key`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    }
  );

  const payload = (await response.json()) as { idToken?: string; error?: { message?: string } };
  if (!response.ok || !payload.idToken) {
    throw new Error(payload.error?.message ?? `Failed to sign in ${email} for callable E2E helper.`);
  }

  return payload.idToken;
}

function parseCallableResponse(
  responseStatus: number,
  payload: CallablePayload
): CallableAttemptResult {
  if (payload.result?.status === 'success') {
    return { ok: true, status: responseStatus, resultStatus: 'success' };
  }

  const nestedError = payload.result?.error;
  const transportCode = payload.error?.details?.code;
  const errorCode = nestedError?.code ?? transportCode ?? payload.error?.status;
  const errorMessage =
    nestedError?.message ?? payload.error?.details?.message ?? payload.error?.message;

  return {
    ok: false,
    status: responseStatus,
    resultStatus: payload.result?.status ?? 'error',
    errorCode,
    errorMessage,
  };
}

export async function attemptAuthenticatedBooking(
  input: AuthenticatedBookingAttemptInput
): Promise<CallableAttemptResult> {
  const bookingId = BookingIdSchema.parse(
    input.bookingId ?? `booking_e2e_callable_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  );
  const idempotencyKey = `create-confirmed:${bookingId}`;
  const idToken = await signInForIdToken(input.email, input.password);

  const response = await fetch(functionsCallableUrl('executeCanonicalCommand'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({
      data: {
        kind: 'create_confirmed_booking',
        intent: {
          bookingId,
          instructorId: input.instructorId,
          participantIds: [...input.participantIds],
        },
        idempotencyKey,
        correlationId: `correlation_e2e_${bookingId}`,
        exercisedCapability: input.exercisedCapability ?? 'parent_guardian',
        calendarInput: {
          localDate: input.localDate,
          localTime: input.localTime,
          durationMinutes: input.durationMinutes ?? DEFAULT_LESSON_DURATION_MINUTES,
        },
        timezone: input.timezone,
      },
    }),
  });

  return parseCallableResponse(response.status, (await response.json()) as CallablePayload);
}

export async function attemptAuthenticatedCancellation(input: {
  readonly email: string;
  readonly password: string;
  readonly bookingId: string;
  readonly expectedRevision: number;
  readonly exercisedCapability?: 'account_owner' | 'parent_guardian';
}): Promise<CallableAttemptResult> {
  const idempotencyKey = `cancel:${input.bookingId}:${input.expectedRevision}`;
  const idToken = await signInForIdToken(input.email, input.password);

  const response = await fetch(functionsCallableUrl('executeCanonicalCommand'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({
      data: {
        kind: 'request_booking_cancellation',
        intent: { bookingId: input.bookingId },
        idempotencyKey,
        correlationId: `correlation_e2e_cancel_${input.bookingId}`,
        expectedRevision: input.expectedRevision,
        exercisedCapability: input.exercisedCapability ?? 'parent_guardian',
      },
    }),
  });

  return parseCallableResponse(response.status, (await response.json()) as CallablePayload);
}

export { E2E_PROJECT_ID };
