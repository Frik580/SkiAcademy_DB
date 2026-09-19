import type {
  AdminIssueId,
  AttendanceAdminIssueResultPayload,
  CommandResult,
} from '@ski-academy/shared-domain';
import { AttendanceAdminIssueResultPayloadSchema } from '@ski-academy/shared-domain';
import { registerAdminIssueInboxRevisionFromCommand } from './adminIssueInboxRevisionCoordinator';

export interface AdminIssueInboxServerConfirmedPatch {
  readonly resolvedAdminIssueIds: readonly AdminIssueId[];
  readonly openedAdminIssueIds: readonly AdminIssueId[];
  readonly adminIssueInboxRevision?: number;
}

type AdminIssueInboxPatchListener = (patch: AdminIssueInboxServerConfirmedPatch) => void;

const listeners = new Set<AdminIssueInboxPatchListener>();

export function subscribeAdminIssueInboxLocalPatches(
  listener: AdminIssueInboxPatchListener
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function notifyAdminIssueInboxServerConfirmedPatch(
  patch: AdminIssueInboxServerConfirmedPatch
): void {
  if (patch.resolvedAdminIssueIds.length === 0 && patch.openedAdminIssueIds.length === 0) {
    return;
  }
  for (const listener of listeners) {
    listener(patch);
  }
}

export function applyAdminIssueInboxCommandResult(result: CommandResult): void {
  if (result.status !== 'success' || result.payload === undefined) return;
  const parsed = AttendanceAdminIssueResultPayloadSchema.safeParse(result.payload);
  if (!parsed.success) return;
  const payload: AttendanceAdminIssueResultPayload = parsed.data;
  const openedAdminIssueIds = payload.openedAdminIssueIds ?? [];
  notifyAdminIssueInboxServerConfirmedPatch({
    resolvedAdminIssueIds: payload.resolvedAdminIssueIds,
    openedAdminIssueIds,
    ...(payload.adminIssueInboxRevision === undefined
      ? {}
      : { adminIssueInboxRevision: payload.adminIssueInboxRevision }),
  });
  if (payload.adminIssueInboxRevision !== undefined && openedAdminIssueIds.length === 0) {
    registerAdminIssueInboxRevisionFromCommand(payload.adminIssueInboxRevision);
  }
}

export function removeResolvedAdminIssueInboxItems<T extends { readonly issueId: string }>(
  items: readonly T[],
  resolvedAdminIssueIds: readonly string[]
): T[] {
  if (resolvedAdminIssueIds.length === 0) return [...items];
  const resolved = new Set(resolvedAdminIssueIds);
  return items.filter((item) => !resolved.has(item.issueId));
}
