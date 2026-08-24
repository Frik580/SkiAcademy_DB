import { z } from 'zod';
import { COMMAND_SOURCES, type CommandSource } from '../auditOutbox';
import { CausationIdSchema, CorrelationIdSchema } from '../identifiers';
import { AggregateRevisionSchema, IanaTimeZoneSchema } from '../primitives';
import { CommandActorSchema } from './actors';
import { EXERCISED_CAPABILITIES } from './capabilities';

export { COMMAND_SOURCES, type CommandSource } from '../auditOutbox';

export const IdempotencyKeySchema = z
  .string()
  .regex(/^[A-Za-z0-9._:-]{1,200}$/, 'idempotencyKey has an invalid format');

export type IdempotencyKey = z.output<typeof IdempotencyKeySchema>;

export const CommandTransportMetadataSchema = z
  .record(
    z
      .string()
      .regex(/^[a-z][a-z0-9_]{0,31}$/),
    z.string().max(256)
  )
  .refine((value) => Object.keys(value).length <= 16, 'Transport metadata is bounded');

export type CommandTransportMetadata = z.output<typeof CommandTransportMetadataSchema>;

export const CommandCalendarInputSchema = z
  .object({
    localDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    localTime: z.string().regex(/^\d{2}:\d{2}$/),
    durationMinutes: z.number().finite().int().positive().max(24 * 60),
  })
  .strict();

export type CommandCalendarInput = z.output<typeof CommandCalendarInputSchema>;

export const CommandContextSchema = z
  .object({
    actor: CommandActorSchema,
    exercisedCapability: z.enum(EXERCISED_CAPABILITIES),
    idempotencyKey: IdempotencyKeySchema,
    correlationId: CorrelationIdSchema,
    causationId: CausationIdSchema.optional(),
    expectedRevision: AggregateRevisionSchema.optional(),
    source: z.enum(COMMAND_SOURCES),
    transportMetadata: CommandTransportMetadataSchema.optional(),
    calendarInput: CommandCalendarInputSchema.optional(),
    timezone: IanaTimeZoneSchema.optional(),
  })
  .strict();

export type CommandContext = z.output<typeof CommandContextSchema>;

export interface AuthoritativeCommandClock {
  now(): Date;
  decidedAt(): Date;
}

export interface CommandExecutionEnvironment {
  readonly clock: AuthoritativeCommandClock;
}

export const SOURCE_ACTOR_KIND_CONSTRAINTS: Record<
  CommandSource,
  readonly ('account' | 'guest' | 'system' | 'provider')[]
> = {
  client_callable: ['account'],
  admin_callable: ['account'],
  guest_callable: ['guest'],
  scheduler: ['system'],
  provider_callback: ['provider'],
  system_reconciliation: ['system'],
};

export function isSourceCompatibleWithActorKind(
  source: CommandSource,
  actorKind: CommandContext['actor']['kind']
): boolean {
  return SOURCE_ACTOR_KIND_CONSTRAINTS[source].includes(actorKind);
}
