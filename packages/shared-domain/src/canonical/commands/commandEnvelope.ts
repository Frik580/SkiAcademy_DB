import { z } from 'zod';
import { COMMAND_KINDS, type CommandKind } from './commandKinds';
import { CommandContextSchema } from './commandContext';
import { CommandIntentSchemaByKind } from './commandIntents';
import { containsForbiddenAuthoritativeFields } from './forbiddenFields';

export const CommandKindSchema = z.enum(COMMAND_KINDS);

function envelopeSchemaForKind<Kind extends CommandKind>(kind: Kind) {
  return z
    .object({
      kind: z.literal(kind),
      context: CommandContextSchema,
      intent: CommandIntentSchemaByKind[kind],
    })
    .strict();
}

const envelopeSchemas = COMMAND_KINDS.map((kind) => envelopeSchemaForKind(kind));

export const CommandEnvelopeSchema = z.discriminatedUnion(
  'kind',
  envelopeSchemas as [
    (typeof envelopeSchemas)[number],
    (typeof envelopeSchemas)[number],
    ...(typeof envelopeSchemas)[number][],
  ]
);

export type CommandEnvelope<Kind extends CommandKind = CommandKind> = Readonly<{
  kind: Kind;
  context: z.output<typeof CommandContextSchema>;
  intent: z.output<(typeof CommandIntentSchemaByKind)[Kind]>;
}>;

export function parseCommandEnvelope(input: unknown): z.ZodSafeParseResult<CommandEnvelope> {
  if (containsForbiddenAuthoritativeFields(input)) {
    return {
      success: false,
      error: new z.ZodError([
        {
          code: 'custom',
          path: ['intent'],
          message: 'Intent contains forbidden authoritative fields',
        },
      ]) as z.ZodError<CommandEnvelope>,
    };
  }

  return CommandEnvelopeSchema.safeParse(input);
}
