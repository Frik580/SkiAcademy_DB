import {
  AdminBookingChangeRequestsRevisionPayloadSchema,
  type CommandResult,
} from '@ski-academy/shared-domain';
import { registerAdminBookingChangeRequestsRevisionFromCommand } from './adminBookingChangeRequestsRevisionCoordinator';

export function applyAdminBookingChangeRequestsCommandResult(result: CommandResult): void {
  if (result.status !== 'success' || result.payload === undefined) return;
  const payload = result.payload;
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return;
  const parsed = AdminBookingChangeRequestsRevisionPayloadSchema.safeParse({
    adminBookingChangeRequestsRevision: (
      payload as { adminBookingChangeRequestsRevision?: unknown }
    ).adminBookingChangeRequestsRevision,
  });
  if (!parsed.success) return;
  registerAdminBookingChangeRequestsRevisionFromCommand(
    parsed.data.adminBookingChangeRequestsRevision
  );
}
