import { FieldPath, Timestamp, type Firestore, type Query } from 'firebase-admin/firestore';
import { requireAdministratorAccountSessionPolicy } from './administratorSession';
import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { z } from 'zod';
import {
  AccountIdSchema,
  LIVE_CANONICAL_READ_SCOPE,
  documentMatchesReadScope,
  normalizeFirestoreDocument,
} from '@ski-academy/shared-domain';
import { scopedReadCursor } from './scopedReadCursor';
import { requireActiveAccount } from './activeAccount';
import { resolveCanonicalReadScope } from '../canonical/testSessions/canonicalReadScopeResolver';
import { createFirestoreCanonicalExecutionScopeStore } from '../canonical/testSessions/canonicalExecutionScopeResolver';
import { rethrowReadScopeHttpsError } from '../canonical/readModels/readModelScope';

export const PUBLIC_CLIENT_COLLECTIONS = [
  'instructors',
  'courses',
  'course_catalog_content',
  'availability_slots',
  'availability_hour_locks',
] as const;
export const PRIVATE_CLIENT_COLLECTIONS = [
  'users',
  'bookings',
  'notifications',
  'activity_logs',
  'wallet_ledger',
] as const;
const collections = [...PUBLIC_CLIENT_COLLECTIONS, ...PRIVATE_CLIENT_COLLECTIONS] as const;
const fields = ['userId', 'instructorId', 'status', 'timestamp', 'date', '__name__'] as const;
const Input = z
  .object({
    collection: z.enum(collections),
    take: z.number().int().min(1).max(200),
    where: z
      .array(
        z
          .object({
            field: z.enum(fields),
            op: z.enum(['==', 'in', '<']),
            value: z.union([z.string().max(256), z.array(z.string().max(256)).max(30)]),
          })
          .strict()
      )
      .max(4)
      .default([]),
    order: z
      .array(z.object({ field: z.enum(fields), direction: z.enum(['asc', 'desc']) }).strict())
      .max(2)
      .default([]),
    cursor: z.string().max(4096).optional(),
    requestedTestSessionId: z.string().max(128).optional(),
    idempotencyKey: z.string().max(256).optional(),
  })
  .strict();

function deny(): never {
  throw new HttpsError('permission-denied', 'This read is not permitted.');
}
/** Replaces unscoped SDK lists. Legacy LIVE documents remain visible on the server.
 * Each physical page is bounded; callers choose pagination. No background drain. */
export function createQueryScopedClientDocuments(db: Firestore, secret: string) {
  return async (request: CallableRequest<unknown>) => {
    const parsed = Input.safeParse(request.data);
    if (!parsed.success) throw new HttpsError('invalid-argument', 'Invalid document query.');
    const input = parsed.data;
    const uid = request.auth?.uid;
    const profile = uid ? (await db.doc(`users/${uid}`).get()).data() : undefined;
    const actor = uid ? (await db.doc(`test_actors/${uid}`).get()).data() : undefined;
    const admin = !!uid && !actor && profile?.role === 'admin';
    const publicCollection = (PUBLIC_CLIENT_COLLECTIONS as readonly string[]).includes(
      input.collection
    );
    const bootstrap =
      !!uid &&
      publicCollection &&
      !actor &&
      (!profile ||
        (!('lifecycle' in profile) &&
          profile.role === 'user' &&
          documentMatchesReadScope(LIVE_CANONICAL_READ_SCOPE, profile)));
    if (uid && !bootstrap) requireActiveAccount(uid, profile);
    if (publicCollection && input.where.some((f) => f.field !== '__name__' || f.op !== '==')) {
      throw new HttpsError('invalid-argument', 'Unsupported public filter.');
    }
    if (!publicCollection && !uid) deny();
    if (input.collection === 'users' && !admin) deny();
    if (!publicCollection && input.collection !== 'users' && !admin) {
      const ownUser = input.where.some(
        (f) => f.field === 'userId' && f.op === '==' && f.value === uid
      );
      const instructor =
        input.collection === 'bookings' &&
        typeof profile?.instructorId === 'string' &&
        input.where.some(
          (f) => f.field === 'instructorId' && f.op === '==' && f.value === profile.instructorId
        );
      if (!ownUser && !instructor) deny();
    }
    const scope = await resolveCanonicalReadScope(createFirestoreCanonicalExecutionScopeStore(db), {
      ...(uid && !bootstrap
        ? { accountId: AccountIdSchema.parse(uid), accountLifecycleStatus: 'active' as const }
        : {}),
      isAdministrator: admin,
      requestedTestSessionId: input.requestedTestSessionId,
    }).catch(rethrowReadScopeHttpsError);
    if (admin && !publicCollection && scope.dataScope === 'live') {
      requireAdministratorAccountSessionPolicy(profile, request.auth?.token);
    }
    if (input.collection === 'users' && scope.dataScope !== 'live') deny();
    const scopeKey = scope.dataScope === 'live' ? 'live' : `test/sessions/${scope.testSessionId}`;
    const runtimePath =
      publicCollection || input.collection === 'users'
        ? `client_read_runtime/${scopeKey}/collections/${input.collection}`
        : `client_read_runtime/${scopeKey}/accounts/${uid}/collections/${input.collection}`;
    // Read signal before data so a concurrent write cannot be missed on subscribe.
    const revision = (await db.doc(runtimePath).get()).get('revision') ?? null;
    let query: Query = db.collection(input.collection);
    if (scope.dataScope === 'test')
      query = query
        .where('dataScope', '==', 'test')
        .where('testSessionId', '==', scope.testSessionId);
    for (const filter of input.where) query = query.where(filter.field, filter.op, filter.value);
    const order = input.order.length
      ? input.order
      : [{ field: '__name__' as const, direction: 'asc' as const }];
    for (const item of order)
      query = query.orderBy(
        item.field === '__name__' ? FieldPath.documentId() : item.field,
        item.direction
      );
    if (!order.some((item) => item.field === '__name__'))
      query = query.orderBy(FieldPath.documentId(), order[order.length - 1].direction);
    const codec = scopedReadCursor(
      secret,
      JSON.stringify({
        uid: uid ?? '',
        scopeKey,
        collection: input.collection,
        where: input.where,
        order,
      })
    );
    if (input.cursor) query = query.startAfter(...codec.decode(input.cursor));
    // Scope filtering precedes logical pagination. Hidden rows never affect
    // returned counts, continuation or known-ID not-found responses.
    const visible: FirebaseFirestore.QueryDocumentSnapshot[] = [];
    let physical = 0;
    for (;;) {
      const physicalLimit = Math.min(
        1000 - physical,
        200,
        Math.max(50, input.take + 1 - visible.length)
      );
      const page = await query.limit(physicalLimit).get();
      physical += page.size;
      for (const snapshot of page.docs) {
        const data = snapshot.data();
        if (!documentMatchesReadScope(scope, data) || snapshot.id === 'school_global_stats')
          continue;
        if (
          !publicCollection &&
          !admin &&
          data.userId !== uid &&
          !(
            input.collection === 'bookings' &&
            typeof profile?.instructorId === 'string' &&
            data.instructorId === profile.instructorId
          )
        )
          continue;
        visible.push(snapshot);
        if (visible.length > input.take) break;
      }
      if (visible.length > input.take || page.size < physicalLimit) break;
      if (physical >= 1000)
        throw new HttpsError('resource-exhausted', 'Compatibility read budget exceeded.');
      query = query.startAfter(page.docs[page.docs.length - 1]);
    }
    const selected = visible.slice(0, input.take);
    const docs = selected.map((snapshot) => ({
      id: snapshot.id,
      data: normalizeFirestoreDocument(snapshot.data()),
    }));
    const last = selected.at(-1);
    const cursorValues = last
      ? order.map((item) => (item.field === '__name__' ? last.id : last.get(item.field)))
      : [];
    if (last && !order.some((item) => item.field === '__name__')) cursorValues.push(last.id);
    const cursor =
      last && visible.length > input.take
        ? codec.encode(
            cursorValues.map((value) =>
              value instanceof Timestamp ? { timestamp: [value.seconds, value.nanoseconds] } : value
            )
          )
        : undefined;
    // Recheck authority after reading data, including revocation/assignment changes.
    const current = await resolveCanonicalReadScope(
      createFirestoreCanonicalExecutionScopeStore(db),
      {
        ...(uid && !bootstrap
          ? { accountId: AccountIdSchema.parse(uid), accountLifecycleStatus: 'active' as const }
          : {}),
        isAdministrator: uid
          ? (await db.doc(`users/${uid}`).get()).get('role') === 'admin' &&
            !(await db.doc(`test_actors/${uid}`).get()).exists
          : false,
        requestedTestSessionId: input.requestedTestSessionId,
      }
    ).catch(rethrowReadScopeHttpsError);
    if (JSON.stringify(current) !== JSON.stringify(scope)) deny();
    if (uid && !bootstrap) {
      const freshProfile = (await db.doc(`users/${uid}`).get()).data();
      requireActiveAccount(uid, freshProfile);
      if (admin && !publicCollection && scope.dataScope === 'live') {
        requireAdministratorAccountSessionPolicy(freshProfile, request.auth?.token);
      }
      for (const field of ['role', 'instructorId', 'revision', 'dataScope', 'testSessionId']) {
        if (freshProfile?.[field] !== profile?.[field]) deny();
      }
    }
    if (bootstrap && uid && (await db.doc(`test_actors/${uid}`).get()).exists) deny();
    const signalled = [
      'instructors',
      'courses',
      'course_catalog_content',
      'users',
      'notifications',
      'activity_logs',
    ].includes(input.collection);
    return { docs, cursor: cursor ?? null, runtimePath: signalled ? runtimePath : null, revision };
  };
}

/** No private payload in signals; only affected owners get private invalidation. */
export async function invalidateScopedClientDocuments(
  db: Firestore,
  collection: string,
  before: Record<string, unknown> | undefined,
  after: Record<string, unknown> | undefined,
  eventId: string
) {
  if (!(collections as readonly string[]).includes(collection)) return;
  const paths = new Set<string>();
  for (const data of [before, after]) {
    if (!data) continue;
    const scopeKey =
      data.dataScope === 'test' && typeof data.testSessionId === 'string'
        ? `test/sessions/${data.testSessionId}`
        : documentMatchesReadScope(LIVE_CANONICAL_READ_SCOPE, data)
          ? 'live'
          : undefined;
    if (!scopeKey) continue;
    if ((PUBLIC_CLIENT_COLLECTIONS as readonly string[]).includes(collection))
      paths.add(`client_read_runtime/${scopeKey}/collections/${collection}`);
    else if (typeof data.userId === 'string' && /^[A-Za-z0-9_-]+$/.test(data.userId))
      paths.add(
        `client_read_runtime/${scopeKey}/accounts/${data.userId}/collections/${collection}`
      );
    if (collection === 'users') paths.add('client_read_runtime/live/collections/users');
  }
  await Promise.all([...paths].map((path) => db.doc(path).set({ revision: eventId })));
}
