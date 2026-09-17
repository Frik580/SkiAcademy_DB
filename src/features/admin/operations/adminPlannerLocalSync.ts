import {
  AdminPlannerRevisionPayloadSchema,
  type CommandResult,
} from '@ski-academy/shared-domain';
import { registerAdminPlannerRevisionFromCommand } from './adminPlannerRevisionCoordinator';

export function applyAdminPlannerCommandResult(result: CommandResult): void {
  if (result.status !== 'success' || result.payload === undefined) return;
  const payload = result.payload;
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return;
  const parsed = AdminPlannerRevisionPayloadSchema.safeParse({
    adminPlannerRevision: (payload as { adminPlannerRevision?: unknown }).adminPlannerRevision,
  });
  if (!parsed.success) return;
  registerAdminPlannerRevisionFromCommand(parsed.data.adminPlannerRevision);
}
