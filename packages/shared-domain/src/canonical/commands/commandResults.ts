import { z } from 'zod';
import { CorrelationIdSchema } from '../identifiers';
import { CommandKindSchema } from './commandEnvelope';
import type { CommandKind } from './commandKinds';
import {
  CommandResultPayloadSchemaByKind,
  type CommandResultPayloadForKind,
} from './commandResultPayloads';

export const CommandSuccessResultSchema = z
  .object({
    status: z.literal('success'),
    kind: CommandKindSchema,
    correlationId: CorrelationIdSchema,
    payload: z.unknown().optional(),
  })
  .strict();

export type CommandSuccessResult<Kind extends CommandKind = CommandKind> = Readonly<{
  status: 'success';
  kind: Kind;
  correlationId: z.output<typeof CorrelationIdSchema>;
}> &
  (Kind extends keyof typeof CommandResultPayloadSchemaByKind
    ? Readonly<{ payload?: CommandResultPayloadForKind<Kind> }>
    : Readonly<{ payload?: never }>);

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
  correlationId: z.output<typeof CorrelationIdSchema>,
  payload?: Kind extends keyof typeof CommandResultPayloadSchemaByKind
    ? CommandResultPayloadForKind<Kind>
    : never
): CommandSuccessResult<Kind> {
  if (payload === undefined) {
    return { status: 'success', kind, correlationId } as CommandSuccessResult<Kind>;
  }
  return {
    status: 'success',
    kind,
    correlationId,
    payload: CommandResultPayloadSchemaByKind[kind as keyof typeof CommandResultPayloadSchemaByKind].parse(
      payload
    ),
  } as unknown as CommandSuccessResult<Kind>;
}

export function commandErrorResult<Kind extends CommandKind>(
  kind: Kind,
  correlationId: z.output<typeof CorrelationIdSchema>,
  error: import('../errors').CommandErrorTransport
): CommandResult<Kind> {
  return { status: 'error', kind, correlationId, error };
}
