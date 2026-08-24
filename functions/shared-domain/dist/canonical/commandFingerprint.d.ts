import { z } from 'zod';
import type { CommandEnvelope } from './commands/commandEnvelope';
import type { CommandKind } from './commands/commandKinds';
import type { ExercisedCapability } from './auditOutbox';
export interface CommandFingerprintInput {
    readonly kind: CommandKind;
    readonly exercisedCapability: ExercisedCapability;
    readonly intent: unknown;
    readonly calendarInput?: CommandEnvelope['context']['calendarInput'];
    readonly timezone?: CommandEnvelope['context']['timezone'];
}
export declare const CommandFingerprintSchema: z.ZodString;
export type CommandFingerprint = z.output<typeof CommandFingerprintSchema>;
export declare function buildCommandFingerprintInput(envelope: CommandEnvelope): CommandFingerprintInput;
export declare function canonicalizeCommandFingerprintInput(input: CommandFingerprintInput): Record<string, unknown>;
export declare function computeCommandFingerprint(input: CommandFingerprintInput): CommandFingerprint;
export declare function computeCommandFingerprintFromEnvelope(envelope: CommandEnvelope): CommandFingerprint;
