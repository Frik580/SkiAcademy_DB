import {
  BookingProposalSchema,
  canonicalPaths,
  normalizeFirestoreDocument,
  readAggregateRevision,
  type BookingProposal,
} from '@ski-academy/shared-domain';

export const BOOKING_PROPOSAL_PLANNING_ESTIMATES = {
  proposalBytes: 768,
} as const;

export function toTransactionPath(path: string): string {
  return path.startsWith('/') ? path.slice(1) : path;
}

export function bookingProposalPath(proposalId: BookingProposal['proposalId']): string {
  return toTransactionPath(canonicalPaths.bookingProposal(proposalId));
}

export function parseBookingProposal(
  data: Record<string, unknown> | undefined
): BookingProposal | undefined {
  const normalized = normalizeFirestoreDocument(data);
  if (!normalized) return undefined;
  const parsed = BookingProposalSchema.safeParse(normalized);
  return parsed.success ? parsed.data : undefined;
}

export function readProposalRevision(data: Record<string, unknown> | undefined): number | undefined {
  return readAggregateRevision(data);
}

export function toFirestoreWritePayload(
  data: Record<string, unknown>
): Record<string, unknown> {
  return Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined));
}
