import {
  AdminLessonBookingsRevisionPayloadSchema,
  type CommandResult,
} from '@ski-academy/shared-domain';
import { registerAdminLessonBookingsRevisionFromCommand } from './adminLessonBookingsRevisionCoordinator';

export function applyAdminLessonBookingsCommandResult(result: CommandResult): void {
  if (result.status !== 'success' || result.payload === undefined) return;
  const payload = result.payload;
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return;
  const parsed = AdminLessonBookingsRevisionPayloadSchema.safeParse({
    adminLessonBookingsRevision: (payload as { adminLessonBookingsRevision?: unknown })
      .adminLessonBookingsRevision,
  });
  if (!parsed.success) return;
  registerAdminLessonBookingsRevisionFromCommand(parsed.data.adminLessonBookingsRevision);
}
