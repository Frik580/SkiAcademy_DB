import { AdminPeopleRevisionPayloadSchema, type CommandResult } from '@ski-academy/shared-domain';
import { registerAdminPeopleRevisionFromCommand } from './adminPeopleRevisionCoordinator';

export function applyAdminPeopleCommandResult(result: CommandResult): void {
  if (result.status !== 'success' || result.payload === undefined) return;
  const payload = result.payload;
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return;
  const parsed = AdminPeopleRevisionPayloadSchema.safeParse({
    adminPeopleRevision: (payload as { adminPeopleRevision?: unknown }).adminPeopleRevision,
  });
  if (!parsed.success) return;
  registerAdminPeopleRevisionFromCommand(parsed.data.adminPeopleRevision);
}
