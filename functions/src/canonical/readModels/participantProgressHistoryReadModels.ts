import { FieldPath, type Firestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { warn } from 'firebase-functions/logger';
import { z } from 'zod';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import {
  CanonicalExecutionScopeSchema,
  CanonicalTimestampSchema,
  AggregateRevisionSchema,
  InstructorIdSchema,
  ParticipantIdSchema,
  ParticipantProgressHistoryEventIdSchema,
  ParticipantProgressHistoryItemSchema,
  ParticipantProgressSkillScoresSchema,
  ParticipantProgressSkillCommentsSchema,
  PARTICIPANT_PROGRESS_HISTORY_PAGE_SIZE,
  PARTICIPANT_PROGRESS_HISTORY_RESPONSE_BYTES_MAX,
  QueryParticipantProgressHistoryReadModelsResultSchema,
  documentMatchesReadScope,
  executionScopeFromReadScope,
  timestampFromDate,
  type CanonicalReadScope,
  type InstructorId,
  type ParticipantProgressHistoryItem,
  type QueryParticipantProgressHistoryReadModelsInput,
  type QueryParticipantProgressHistoryReadModelsResult,
} from '@ski-academy/shared-domain';
import { parseParticipant } from '../participantAccess/participantAccessStore';
import {
  instructorHasProgressAccess,
  ParticipantProgressReadDeniedError,
} from './participantProgressReadModels';
import { parseIfVisibleInReadScope } from './readModelScope';

export const PARTICIPANT_PROGRESS_HISTORY_SCAN_MAX = 100;
const CursorSchema = z
  .object({
    version: z.literal(1),
    participantId: ParticipantIdSchema,
    readScope: CanonicalExecutionScopeSchema,
    // Fractional corrupt revisions can still be passed safely during a bounded scan.
    revision: z.number().finite().nonnegative(),
    id: z
      .string()
      .min(1)
      .max(1500)
      .refine((id) => !id.includes('/')),
  })
  .strict();
type Cursor = z.output<typeof CursorSchema>;

const EventSchema = z.object({
  participantId: ParticipantIdSchema,
  revision: AggregateRevisionSchema,
  at: CanonicalTimestampSchema,
  kind: z.literal('update_participant_progress'),
  oldScores: ParticipantProgressSkillScoresSchema.optional(),
  newScores: ParticipantProgressSkillScoresSchema.optional(),
  oldComments: ParticipantProgressSkillCommentsSchema.optional(),
  newComments: ParticipantProgressSkillCommentsSchema.optional(),
});

/** Only compare a dimension when both historical snapshots are available. */
export function projectParticipantProgressHistoryEvent(
  id: string,
  persisted: unknown
): ParticipantProgressHistoryItem | undefined {
  const parsed = EventSchema.safeParse(persisted);
  if (!parsed.success) return undefined;
  const event = parsed.data;
  const skillChanges: ParticipantProgressHistoryItem['skillChanges'] = [];
  const commentChanges: ParticipantProgressHistoryItem['commentChanges'] = [];
  if (event.oldScores && event.newScores) {
    for (const skillId of [
      ...new Set([...Object.keys(event.oldScores), ...Object.keys(event.newScores)]),
    ].sort()) {
      const previousScore = Object.hasOwn(event.oldScores, skillId)
        ? event.oldScores[skillId]
        : undefined;
      const newScore = Object.hasOwn(event.newScores, skillId)
        ? event.newScores[skillId]
        : undefined;
      if (previousScore === newScore) continue;
      skillChanges.push({
        skillId,
        ...(previousScore === undefined ? {} : { previousScore }),
        ...(newScore === undefined ? {} : { newScore }),
      });
    }
  }
  if (event.oldComments && event.newComments) {
    for (const skillId of [
      ...new Set([...Object.keys(event.oldComments), ...Object.keys(event.newComments)]),
    ].sort()) {
      const previousText = Object.hasOwn(event.oldComments, skillId)
        ? event.oldComments[skillId]
        : undefined;
      const newText = Object.hasOwn(event.newComments, skillId)
        ? event.newComments[skillId]
        : undefined;
      if (previousText === newText) continue;
      commentChanges.push({
        skillId,
        ...(previousText === undefined ? {} : { previousText }),
        ...(newText === undefined ? {} : { newText }),
      });
    }
  }
  if (!skillChanges.length && !commentChanges.length) return undefined;
  // This field is written by the canonical assessment command, never by a client.
  const instructor = InstructorIdSchema.safeParse(
    (persisted as Record<string, unknown>).instructorId
  );
  const result = ParticipantProgressHistoryItemSchema.safeParse({
    id,
    participantId: event.participantId,
    revision: event.revision,
    at: event.at,
    kind: event.kind,
    ...(instructor.success ? { instructorId: instructor.data } : {}),
    skillChanges,
    commentChanges,
  });
  return result.success ? result.data : undefined;
}

const invalidCursor = () => new HttpsError('invalid-argument', 'The history cursor is invalid.');
const cursorKey = (secret: string) =>
  createHash('sha256').update(`participant-progress-history:v1\0${secret}`).digest();
function encodeCursor(cursor: Cursor, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', cursorKey(secret), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(cursor), 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64url');
}

function decodeCursor(
  value: string,
  input: QueryParticipantProgressHistoryReadModelsInput,
  readScope: CanonicalReadScope,
  secret: string
): Cursor {
  let cursor: Cursor;
  try {
    if (!/^[A-Za-z0-9_-]+$/.test(value)) throw invalidCursor();
    const bytes = Buffer.from(value, 'base64url');
    if (bytes.toString('base64url') !== value || bytes.length < 29) throw invalidCursor();
    const decipher = createDecipheriv('aes-256-gcm', cursorKey(secret), bytes.subarray(0, 12));
    decipher.setAuthTag(bytes.subarray(12, 28));
    const plaintext = Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]);
    cursor = CursorSchema.parse(JSON.parse(plaintext.toString('utf8')));
  } catch {
    throw invalidCursor();
  }
  if (
    cursor.participantId !== input.participantId ||
    JSON.stringify(cursor.readScope) !== JSON.stringify(executionScopeFromReadScope(readScope))
  ) {
    throw new ParticipantProgressReadDeniedError();
  }
  // Authenticated positions need no anchor read and remain valid if an old row disappears.
  return cursor;
}

export async function queryParticipantProgressHistoryReadModels(
  firestore: Firestore,
  input: QueryParticipantProgressHistoryReadModelsInput,
  options: {
    instructorId: InstructorId;
    readScope: CanonicalReadScope;
    cursorSecret: string;
    now?: () => Date;
  }
): Promise<QueryParticipantProgressHistoryReadModelsResult> {
  const { readScope, instructorId } = options;
  const person = parseIfVisibleInReadScope(
    (await firestore.collection('participants').doc(input.participantId).get()).data(),
    parseParticipant,
    readScope,
    'identity'
  );
  if (
    !person ||
    person.participantId !== input.participantId ||
    person.lifecycle.status !== 'active' ||
    !(await instructorHasProgressAccess(
      firestore,
      instructorId,
      person,
      timestampFromDate(options.now?.() ?? new Date())
    ))
  ) {
    throw new ParticipantProgressReadDeniedError();
  }
  let cursor = input.cursor
    ? decodeCursor(input.cursor, input, readScope, options.cursorSecret)
    : undefined;
  // Participant/revision query includes legacy LIVE documents without dataScope.
  // Scope is checked before projection; the total scan remains bounded.
  const base = firestore
    .collection('participant_progress_events')
    .where('participantId', '==', input.participantId)
    .where('revision', '>=', 0)
    .where('revision', '<=', Number.MAX_SAFE_INTEGER)
    .orderBy('revision', 'desc')
    .orderBy(FieldPath.documentId(), 'desc');
  const items: ParticipantProgressHistoryItem[] = [];
  let reads = 0;
  let bytes = 32768; // Reserve the envelope, encrypted cursor and JSON separators.
  let malformed = 0;
  let hasMore = false;
  try {
    while (reads < PARTICIPANT_PROGRESS_HISTORY_SCAN_MAX) {
      const limit = Math.min(
        PARTICIPANT_PROGRESS_HISTORY_PAGE_SIZE + 1,
        PARTICIPANT_PROGRESS_HISTORY_SCAN_MAX - reads
      );
      const page = await (cursor ? base.startAfter(cursor.revision, cursor.id) : base)
        .limit(limit)
        .get();
      reads += page.size;
      for (let i = 0; i < page.docs.length; i++) {
        const doc = page.docs[i]!;
        const data = doc.data();
        const visible = documentMatchesReadScope(readScope, data);
        const item = visible ? projectParticipantProgressHistoryEvent(doc.id, data) : undefined;
        if (
          visible &&
          data.kind === 'update_participant_progress' &&
          (!EventSchema.safeParse(data).success ||
            !ParticipantProgressHistoryEventIdSchema.safeParse(doc.id).success)
        )
          malformed++;
        const itemBytes = item ? Buffer.byteLength(JSON.stringify(item), 'utf8') + 1 : 0;
        if (item && bytes + itemBytes > PARTICIPANT_PROGRESS_HISTORY_RESPONSE_BYTES_MAX) {
          if (!items.length)
            throw new HttpsError('data-loss', 'A history observation exceeds the response limit.');
          hasMore = true;
          break;
        }
        cursor = CursorSchema.parse({
          version: 1,
          participantId: input.participantId,
          readScope: executionScopeFromReadScope(readScope),
          revision: data.revision,
          id: doc.id,
        });
        if (item) {
          items.push(item);
          bytes += itemBytes;
        }
        if (items.length === PARTICIPANT_PROGRESS_HISTORY_PAGE_SIZE) {
          hasMore = i < page.docs.length - 1 || page.size === limit;
          break;
        }
      }
      if (hasMore || items.length === PARTICIPANT_PROGRESS_HISTORY_PAGE_SIZE) break;
      if (page.size < limit) break;
      if (reads === PARTICIPANT_PROGRESS_HISTORY_SCAN_MAX) hasMore = true;
    }
  } finally {
    if (malformed)
      warn('Participant progress history contains malformed observations.', {
        malformedCount: malformed,
      });
  }
  return QueryParticipantProgressHistoryReadModelsResultSchema.parse({
    scope: 'instructor',
    participantId: input.participantId,
    items,
    ...(hasMore && cursor ? { nextCursor: encodeCursor(cursor, options.cursorSecret) } : {}),
  });
}
