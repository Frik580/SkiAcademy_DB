import {
  AggregateRevisionSchema,
  BookingProposalIdSchema,
  InstructorIdSchema,
  ParticipantIdSchema,
  nextAggregateRevision,
  timestampFromDate,
  type BookingProposalId,
  type CanonicalTimestamp,
  type InstructorId,
  type ParticipantId,
} from '@ski-academy/shared-domain';
import { z } from 'zod';
import type { CanonicalAtomicTransactionSession } from '../transactions';

export const BOOKING_PROPOSAL_OPEN_INDEX_PLANNING_ESTIMATES = {
  indexBytes: 256,
} as const;

const BookingProposalOpenIndexSchema = z
  .object({
    participantId: ParticipantIdSchema,
    instructorId: InstructorIdSchema,
    openProposalIds: z.array(BookingProposalIdSchema),
    revision: AggregateRevisionSchema,
    updatedAt: z.unknown(),
  })
  .strict();

export type BookingProposalOpenIndex = Readonly<z.output<typeof BookingProposalOpenIndexSchema>>;

export function toTransactionPath(path: string): string {
  return path.startsWith('/') ? path.slice(1) : path;
}

export function bookingProposalOpenIndexPath(input: {
  readonly participantId: ParticipantId;
  readonly instructorId: InstructorId;
}): string {
  return toTransactionPath(
    `booking_proposal_open_index/${input.participantId}__${input.instructorId}`
  );
}

export function parseBookingProposalOpenIndex(
  data: Record<string, unknown> | undefined
): BookingProposalOpenIndex | undefined {
  if (!data) return undefined;
  const parsed = BookingProposalOpenIndexSchema.safeParse(data);
  return parsed.success ? parsed.data : undefined;
}

export function toOpenIndexWritePayload(
  data: Record<string, unknown>
): Record<string, unknown> {
  return Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined));
}

export async function readBookingProposalOpenIndex(
  session: CanonicalAtomicTransactionSession,
  input: {
    readonly participantId: ParticipantId;
    readonly instructorId: InstructorId;
  }
): Promise<BookingProposalOpenIndex | undefined> {
  const indexPath = bookingProposalOpenIndexPath(input);
  const indexRead = await session.tx.get({ path: indexPath });
  session.plan.planRead({ path: indexPath, category: 'aggregate' });
  return parseBookingProposalOpenIndex(indexRead.exists ? indexRead.data : undefined);
}

export function planOpenProposalIndexMutation(
  session: CanonicalAtomicTransactionSession,
  input: {
    readonly participantId: ParticipantId;
    readonly instructorId: InstructorId;
    readonly exists: boolean;
  }
): void {
  session.plan.planMutation({
    path: bookingProposalOpenIndexPath(input),
    kind: input.exists ? 'update' : 'create',
    category: 'aggregate',
    estimatedPayloadBytes: BOOKING_PROPOSAL_OPEN_INDEX_PLANNING_ESTIMATES.indexBytes,
  });
}

export function commitAddOpenProposalToIndex(
  session: CanonicalAtomicTransactionSession,
  input: {
    readonly participantId: ParticipantId;
    readonly instructorId: InstructorId;
    readonly proposalId: BookingProposalId;
    readonly existingIndex: BookingProposalOpenIndex | undefined;
    readonly decidedAt: CanonicalTimestamp;
  }
): void {
  const indexPath = bookingProposalOpenIndexPath(input);
  const openProposalIds = input.existingIndex
    ? [...new Set([...input.existingIndex.openProposalIds, input.proposalId])]
    : [input.proposalId];
  const indexDocument = BookingProposalOpenIndexSchema.parse({
    participantId: input.participantId,
    instructorId: input.instructorId,
    openProposalIds,
    revision: input.existingIndex
      ? nextAggregateRevision(input.existingIndex.revision)
      : AggregateRevisionSchema.parse(1),
    updatedAt: input.decidedAt,
  });

  if (input.existingIndex) {
    session.tx.update({ path: indexPath }, toOpenIndexWritePayload(indexDocument as Record<string, unknown>));
  } else {
    session.tx.create({ path: indexPath }, toOpenIndexWritePayload(indexDocument as Record<string, unknown>));
  }
}

export function commitRemoveOpenProposalsFromIndex(
  session: CanonicalAtomicTransactionSession,
  input: {
    readonly participantId: ParticipantId;
    readonly instructorId: InstructorId;
    readonly proposalIds: readonly BookingProposalId[];
    readonly existingIndex: BookingProposalOpenIndex | undefined;
    readonly decidedAt: CanonicalTimestamp;
  }
): void {
  if (!input.existingIndex || input.proposalIds.length === 0) {
    return;
  }

  const removeSet = new Set(input.proposalIds);
  const openProposalIds = input.existingIndex.openProposalIds.filter(
    (proposalId) => !removeSet.has(proposalId)
  );
  const indexPath = bookingProposalOpenIndexPath(input);

  if (openProposalIds.length === 0) {
    session.tx.delete({ path: indexPath });
    return;
  }

  const indexDocument = BookingProposalOpenIndexSchema.parse({
    participantId: input.participantId,
    instructorId: input.instructorId,
    openProposalIds,
    revision: nextAggregateRevision(input.existingIndex.revision),
    updatedAt: input.decidedAt,
  });
  session.tx.update({ path: indexPath }, toOpenIndexWritePayload(indexDocument as Record<string, unknown>));
}

export function commitRemoveOpenProposalFromIndex(
  session: CanonicalAtomicTransactionSession,
  input: {
    readonly participantId: ParticipantId;
    readonly instructorId: InstructorId;
    readonly proposalId: BookingProposalId;
    readonly existingIndex: BookingProposalOpenIndex | undefined;
    readonly decidedAt: CanonicalTimestamp;
  }
): void {
  if (!input.existingIndex) {
    return;
  }

  const openProposalIds = input.existingIndex.openProposalIds.filter(
    (proposalId) => proposalId !== input.proposalId
  );
  const indexPath = bookingProposalOpenIndexPath(input);

  if (openProposalIds.length === 0) {
    session.tx.delete({ path: indexPath });
    return;
  }

  const indexDocument = BookingProposalOpenIndexSchema.parse({
    participantId: input.participantId,
    instructorId: input.instructorId,
    openProposalIds,
    revision: nextAggregateRevision(input.existingIndex.revision),
    updatedAt: input.decidedAt,
  });
  session.tx.update({ path: indexPath }, toOpenIndexWritePayload(indexDocument as Record<string, unknown>));
}

export function timestampFromCommandContext(decidedAt: Date): CanonicalTimestamp {
  return timestampFromDate(decidedAt);
}
