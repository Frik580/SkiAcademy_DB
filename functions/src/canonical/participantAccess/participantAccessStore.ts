import {
  AccountSchema,
  InstructorRelationshipSchema,
  ParticipantBlockSchema,
  ParticipantManagementActiveOwnerGuardSchema,
  ParticipantManagementSchema,
  ParticipantSchema,
  canonicalPaths,
  normalizeFirestoreDocument,
  readAggregateRevision,
  type Account,
  type InstructorRelationship,
  type Participant,
  type ParticipantBlock,
  type ParticipantManagement,
  type ParticipantManagementActiveOwnerGuard,
} from '@ski-academy/shared-domain';

export const PARTICIPANT_ACCESS_PLANNING_ESTIMATES = {
  participantBytes: 768,
  managementBytes: 512,
  relationshipBytes: 640,
  blockBytes: 512,
  accountBytes: 384,
} as const;

export function toTransactionPath(path: string): string {
  return path.startsWith('/') ? path.slice(1) : path;
}

export function participantPath(participantId: Participant['participantId']): string {
  return toTransactionPath(canonicalPaths.participant(participantId));
}

export function participantManagementPath(
  participantManagementId: ParticipantManagement['participantManagementId']
): string {
  return toTransactionPath(canonicalPaths.participantManagement(participantManagementId));
}

export function participantManagementActiveOwnerPath(
  participantId: Participant['participantId']
): string {
  return toTransactionPath(canonicalPaths.participantManagementActiveOwner(participantId));
}

export function instructorRelationshipPath(
  instructorRelationshipId: InstructorRelationship['instructorRelationshipId']
): string {
  return toTransactionPath(canonicalPaths.instructorRelationship(instructorRelationshipId));
}

export function participantBlockPath(participantBlockId: ParticipantBlock['participantBlockId']): string {
  return toTransactionPath(canonicalPaths.participantBlock(participantBlockId));
}

export function accountPath(accountId: Account['accountId']): string {
  return toTransactionPath(canonicalPaths.account(accountId));
}

export function parseParticipant(
  data: Record<string, unknown> | undefined
): Participant | undefined {
  const normalized = normalizeFirestoreDocument(data);
  if (!normalized) return undefined;
  const parsed = ParticipantSchema.safeParse(normalized);
  return parsed.success ? parsed.data : undefined;
}

export function parseParticipantManagement(
  data: Record<string, unknown> | undefined
): ParticipantManagement | undefined {
  const normalized = normalizeFirestoreDocument(data);
  if (!normalized) return undefined;
  const parsed = ParticipantManagementSchema.safeParse(normalized);
  return parsed.success ? parsed.data : undefined;
}

export function parseActiveOwnerGuard(
  data: Record<string, unknown> | undefined
): ParticipantManagementActiveOwnerGuard | undefined {
  const normalized = normalizeFirestoreDocument(data);
  if (!normalized) return undefined;
  const parsed = ParticipantManagementActiveOwnerGuardSchema.safeParse(normalized);
  return parsed.success ? parsed.data : undefined;
}

export function parseInstructorRelationship(
  data: Record<string, unknown> | undefined
): InstructorRelationship | undefined {
  const normalized = normalizeFirestoreDocument(data);
  if (!normalized) return undefined;
  const parsed = InstructorRelationshipSchema.safeParse(normalized);
  return parsed.success ? parsed.data : undefined;
}

export function parseParticipantBlock(
  data: Record<string, unknown> | undefined
): ParticipantBlock | undefined {
  const normalized = normalizeFirestoreDocument(data);
  if (!normalized) return undefined;
  const parsed = ParticipantBlockSchema.safeParse(normalized);
  return parsed.success ? parsed.data : undefined;
}

export function parseAccount(data: Record<string, unknown> | undefined): Account | undefined {
  const normalized = normalizeFirestoreDocument(data);
  if (!normalized) return undefined;
  const parsed = AccountSchema.safeParse(normalized);
  return parsed.success ? parsed.data : undefined;
}

export function readRevision(data: Record<string, unknown> | undefined): number | undefined {
  return readAggregateRevision(data);
}
