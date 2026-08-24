import {
  AdminIssueSchema,
  canonicalPaths,
  normalizeFirestoreDocument,
  type AdminIssue,
} from '@ski-academy/shared-domain';

export const ADMIN_ISSUE_PLANNING_ESTIMATES = {
  issueBytes: 1_024,
} as const;

export function toTransactionPath(path: string): string {
  return path.startsWith('/') ? path.slice(1) : path;
}

export function adminIssuePath(issueId: AdminIssue['issueId']): string {
  return toTransactionPath(canonicalPaths.adminIssue(issueId));
}

export function parseAdminIssue(data: Record<string, unknown> | undefined): AdminIssue | undefined {
  const normalized = normalizeFirestoreDocument(data);
  if (!normalized) return undefined;
  const parsed = AdminIssueSchema.safeParse(normalized);
  return parsed.success ? parsed.data : undefined;
}

export function toFirestoreWritePayload(data: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined));
}
