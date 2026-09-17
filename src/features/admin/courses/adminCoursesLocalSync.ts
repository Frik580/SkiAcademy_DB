import { AdminCoursesRevisionPayloadSchema, type CommandResult } from '@ski-academy/shared-domain';
import { registerAdminCoursesRevisionFromCommand } from './adminCoursesRevisionCoordinator';

export function applyAdminCoursesCommandResult(result: CommandResult): void {
  if (result.status !== 'success' || result.payload === undefined) return;
  const payload = result.payload;
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return;
  const parsed = AdminCoursesRevisionPayloadSchema.safeParse({
    adminCoursesRevision: (payload as { adminCoursesRevision?: unknown }).adminCoursesRevision,
  });
  if (!parsed.success) return;
  registerAdminCoursesRevisionFromCommand(parsed.data.adminCoursesRevision);
}
