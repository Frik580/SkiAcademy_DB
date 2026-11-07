import { createRequire } from 'node:module';
import { test, expect } from '@playwright/test';
import {
  AUTH_EMULATOR_HOST,
  E2E_PROJECT_ID,
  FIRESTORE_EMULATOR_HOST,
  functionsCallableUrl,
} from './emulator-config';

const requireFunctions = createRequire(new URL('../functions/package.json', import.meta.url));
const { initializeApp, deleteApp } = requireFunctions(
  'firebase-admin/app'
) as typeof import('firebase-admin/app');
const { getFirestore } = requireFunctions(
  'firebase-admin/firestore'
) as typeof import('firebase-admin/firestore');

test('authenticated progress history callable reauthorizes each page over the real transport', async ({
  request,
}) => {
  process.env.FIRESTORE_EMULATOR_HOST = FIRESTORE_EMULATOR_HOST;
  const app = initializeApp({ projectId: E2E_PROJECT_ID }, 'history-callable-http');
  const db = getFirestore(app);
  const authResponse = await request.post(
    `${AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`,
    {
      data: {
        email: `history-${Date.now()}@e2e.test`,
        password: 'history-test-password',
        returnSecureToken: true,
      },
    }
  );
  expect(authResponse.ok()).toBe(true);
  const { idToken, localId } = await authResponse.json();
  const participantId = 'history_http_participant';
  const instructorId = 'history_http_instructor';
  const at = { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 };
  const metadata = {
    revision: 1,
    createdAt: at,
    updatedAt: at,
    audit: {
      createdByCommandId: 'seed_history',
      lastChangedByCommandId: 'seed_history',
      correlationId: 'history_http',
    },
  };
  const paths = [
    `users/${localId}`,
    `participants/${participantId}`,
    'bookings/history_http_booking',
  ];
  try {
    await db.doc(paths[0]!).set({
      accountId: localId,
      lifecycle: { status: 'active' },
      instructorId,
      isInstructor: true,
      ...metadata,
    });
    await db.doc(paths[1]!).set({
      participantId,
      displayName: 'History HTTP',
      discipline: 'ski',
      age: { kind: 'age_years', years: 20 },
      management: { kind: 'unmanaged_guest' },
      lifecycle: { status: 'active' },
      ...metadata,
    });
    await db.doc(paths[2]!).set({
      bookingId: 'history_http_booking',
      attribution: { bookingOrigin: 'admin', bookedBy: { kind: 'account', accountId: localId } },
      party: { kind: 'individual', participantIds: [participantId] },
      occurrence: {
        occurrenceId: 'history_http_occurrence',
        instructorId,
        interval: { startsAt: at, endsAt: { ...at, seconds: at.seconds + 3600 } },
        timeZone: 'Asia/Almaty',
        scheduleRevision: 1,
        serviceParty: { participantIds: [participantId], frozenAt: at },
      },
      lifecycle: { status: 'confirmed' },
      paymentId: 'history_http_payment',
      ...metadata,
    });
    const batch = db.batch();
    for (let revision = 1; revision <= 25; revision++) {
      const path = `participant_progress_events/${participantId}_${revision}`;
      paths.push(path);
      batch.set(db.doc(path), {
        participantId,
        revision,
        at,
        kind: 'update_participant_progress',
        oldScores: {},
        newScores: { carving: revision },
        oldComments: {},
        newComments: { carving: 'Observation' },
        instructorId: revision % 2 ? 'coach_one' : 'coach_two',
      });
    }
    await batch.commit();
    const url = functionsCallableUrl('queryParticipantProgressHistoryReadModels');
    const data = { scope: 'instructor', participantId, idempotencyKey: 'read:history:http' };
    const headers = { Authorization: `Bearer ${idToken}` };
    const unauthenticated = await request.post(url, { data: { data } });
    expect((await unauthenticated.json()).error.status).toBe('UNAUTHENTICATED');
    const first = await request.post(url, { headers, data: { data } });
    expect(first.ok()).toBe(true);
    const page = (await first.json()).result;
    expect(page.items).toHaveLength(20);
    expect(page.items[0].revision).toBe(25);
    expect(
      new Set(page.items.map((item: { instructorId: string }) => item.instructorId)).size
    ).toBe(2);
    const second = await request.post(url, {
      headers,
      data: { data: { ...data, cursor: page.nextCursor } },
    });
    expect((await second.json()).result.items).toHaveLength(5);
    const spoofed = await request.post(url, {
      headers,
      data: { data: { ...data, instructorId: 'spoofed' } },
    });
    expect((await spoofed.json()).error.status).toBe('INVALID_ARGUMENT');
    await db.doc(paths[2]!).update({
      lifecycle: { status: 'cancelled', cancelledAt: at, reasonCode: 'account_owner_cancelled' },
    });
    const revoked = await request.post(url, {
      headers,
      data: { data: { ...data, cursor: page.nextCursor } },
    });
    expect((await revoked.json()).error.status).toBe('PERMISSION_DENIED');
  } finally {
    const batch = db.batch();
    for (const path of paths) batch.delete(db.doc(path));
    await batch.commit();
    await deleteApp(app);
  }
});
