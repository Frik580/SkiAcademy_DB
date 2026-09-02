import {
  AdministrativeAvailabilityBlockSchema,
  canonicalPaths,
  normalizeFirestoreDocument,
  type AdministrativeAvailabilityBlock,
  type AdministrativeAvailabilityBlockId,
} from '@ski-academy/shared-domain';

export const ADMINISTRATIVE_BLOCK_PLANNING_ESTIMATES = {
  blockBytes: 768,
} as const;

export function toTransactionPath(path: string): string {
  return path.startsWith('/') ? path.slice(1) : path;
}

export function administrativeAvailabilityBlockPath(
  blockId: AdministrativeAvailabilityBlockId
): string {
  return toTransactionPath(canonicalPaths.administrativeAvailabilityBlock(blockId));
}

export function parseAdministrativeAvailabilityBlock(
  data: Record<string, unknown> | undefined
): AdministrativeAvailabilityBlock | undefined {
  const normalized = normalizeFirestoreDocument(data);
  if (!normalized) return undefined;
  const parsed = AdministrativeAvailabilityBlockSchema.safeParse(normalized);
  return parsed.success ? parsed.data : undefined;
}

export function toFirestoreWritePayload(data: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined));
}
