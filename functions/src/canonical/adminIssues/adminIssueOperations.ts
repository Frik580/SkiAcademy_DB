import {
  CanonicalCommandError,
  adminIssueDedupeKeyFromIdentity,
  adminIssueIdFromDedupeKey,
  createOpenAdminIssue,
  reuseOrReopenAdminIssue,
  type AdminIssue,
  type AdminIssueDedupeIdentityInput,
  type CorrelationId,
} from '@ski-academy/shared-domain';
import { adminIssuePath, parseAdminIssue } from './adminIssueStore';

export function plannedAdminIssuePath(identity: AdminIssueDedupeIdentityInput): string {
  return adminIssuePath(adminIssueIdFromDedupeKey(adminIssueDedupeKeyFromIdentity(identity)));
}

export function parseExistingAdminIssueOrCollision(
  correlationId: CorrelationId,
  data: Record<string, unknown> | undefined
): AdminIssue | undefined {
  if (!data) return undefined;
  const parsed = parseAdminIssue(data);
  if (!parsed) {
    throw new CanonicalCommandError('audit_integrity_violation', { correlationId });
  }
  return parsed;
}

export function openOrReuseAdminIssue(input: {
  readonly existing: AdminIssue | undefined;
  readonly identity: AdminIssueDedupeIdentityInput;
  readonly now: import('@ski-academy/shared-domain').CanonicalTimestamp;
  readonly correlationId: CorrelationId;
  readonly commandId: string;
  readonly causationId?: string;
}): { readonly issue: AdminIssue; readonly mutationKind: 'create' | 'update' } {
  if (input.existing === undefined) {
    return {
      issue: createOpenAdminIssue(input),
      mutationKind: 'create',
    };
  }
  return {
    issue: reuseOrReopenAdminIssue(input.existing, input),
    mutationKind: 'update',
  };
}
