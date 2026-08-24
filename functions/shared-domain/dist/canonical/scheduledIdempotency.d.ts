import { z } from 'zod';
import { type IdempotencyKey } from './commands/commandContext';
import type { CommandKind } from './commands/commandKinds';
import type { SystemActorId } from './identifiers';
export declare const ScheduledIdempotencySubjectIdSchema: z.ZodString;
export declare function buildScheduledCommandIdempotencyKey(input: {
    readonly systemActorId: SystemActorId;
    readonly commandKind: CommandKind;
    readonly subjectId: string;
    readonly occurrenceId?: string;
}): IdempotencyKey;
export declare function buildProviderCallbackIdempotencyKey(providerEventId: string): IdempotencyKey;
