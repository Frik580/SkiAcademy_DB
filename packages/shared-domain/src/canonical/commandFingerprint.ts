import { z } from 'zod';
import { canonicalJsonStringify } from './canonicalJson';
import { canonicalDeterministicHash } from './deterministicIdentity';
import type { CommandEnvelope } from './commands/commandEnvelope';
import type { CommandKind } from './commands/commandKinds';
import type { ExercisedCapability } from './auditOutbox';

const FINGERPRINT_PREFIX = 'command-fingerprint:v1';

export interface CommandFingerprintInput {
  readonly kind: CommandKind;
  readonly exercisedCapability: ExercisedCapability;
  readonly intent: unknown;
  readonly calendarInput?: CommandEnvelope['context']['calendarInput'];
  readonly timezone?: CommandEnvelope['context']['timezone'];
}

export const CommandFingerprintSchema = z
  .string()
  .regex(/^[a-f0-9]{64}$/, 'fingerprint must be a SHA-256 hex digest');

export type CommandFingerprint = z.output<typeof CommandFingerprintSchema>;

export function buildCommandFingerprintInput(envelope: CommandEnvelope): CommandFingerprintInput {
  const { kind, context, intent } = envelope;
  return {
    kind,
    exercisedCapability: context.exercisedCapability,
    intent,
    ...(context.calendarInput === undefined ? {} : { calendarInput: context.calendarInput }),
    ...(context.timezone === undefined ? {} : { timezone: context.timezone }),
  };
}

export function canonicalizeCommandFingerprintInput(
  input: CommandFingerprintInput
): Record<string, unknown> {
  return {
    calendarInput: input.calendarInput ?? null,
    exercisedCapability: input.exercisedCapability,
    intent: input.intent,
    kind: input.kind,
    timezone: input.timezone ?? null,
  };
}

export function computeCommandFingerprint(input: CommandFingerprintInput): CommandFingerprint {
  const canonicalPayload = canonicalJsonStringify(canonicalizeCommandFingerprintInput(input));
  return CommandFingerprintSchema.parse(
    canonicalDeterministicHash([FINGERPRINT_PREFIX, canonicalPayload])
  );
}

export function computeCommandFingerprintFromEnvelope(
  envelope: CommandEnvelope
): CommandFingerprint {
  return computeCommandFingerprint(buildCommandFingerprintInput(envelope));
}
