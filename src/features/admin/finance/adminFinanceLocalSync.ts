import {
  AdminFinanceRevisionPayloadSchema,
  type CommandResult,
} from '@ski-academy/shared-domain';
import { registerAdminFinanceRevisionFromCommand } from './adminFinanceRevisionCoordinator';

export function applyAdminFinanceCommandResult(result: CommandResult): void {
  if (result.status !== 'success' || result.payload === undefined) return;
  const payload = result.payload;
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return;
  const parsed = AdminFinanceRevisionPayloadSchema.safeParse({
    adminFinanceRevision: (payload as { adminFinanceRevision?: unknown }).adminFinanceRevision,
  });
  if (!parsed.success) return;
  registerAdminFinanceRevisionFromCommand(parsed.data.adminFinanceRevision);
}
