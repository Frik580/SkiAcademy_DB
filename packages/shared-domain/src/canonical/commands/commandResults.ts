import { z } from 'zod';
import { CorrelationIdSchema } from '../identifiers';
import { CommandKindSchema } from './commandEnvelope';
import type { CommandKind } from './commandKinds';

export const CommandSuccessResultSchema = z
  .object({
    status: z.literal('success'),
    kind: CommandKindSchema,
    correlationId: CorrelationIdSchema,
  })
  .strict();

export type CommandSuccessResult<Kind extends CommandKind = CommandKind> = Readonly<{
  status: 'success';
  kind: Kind;
  correlationId: z.output<typeof CorrelationIdSchema>;
}>;

export type CommandResult<Kind extends CommandKind = CommandKind> =
  | CommandSuccessResult<Kind>
  | Readonly<{
      status: 'error';
      kind: Kind;
      correlationId: z.output<typeof CorrelationIdSchema>;
      error: import('../errors').CommandErrorTransport;
    }>;

export function commandSuccessResult<Kind extends CommandKind>(
  kind: Kind,
  correlationId: z.output<typeof CorrelationIdSchema>
): CommandSuccessResult<Kind> {
  return { status: 'success', kind, correlationId };
}

export function commandErrorResult<Kind extends CommandKind>(
  kind: Kind,
  correlationId: z.output<typeof CorrelationIdSchema>,
  error: import('../errors').CommandErrorTransport
): CommandResult<Kind> {
  return { status: 'error', kind, correlationId, error };
}
