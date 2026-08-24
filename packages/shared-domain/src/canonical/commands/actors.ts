import { z } from 'zod';
import {
  AccountIdSchema,
  GuestSubjectIdSchema,
  ProviderIdSchema,
  SystemActorIdSchema,
  type AccountId,
  type GuestSubjectId,
  type ProviderId,
  type SystemActorId,
} from '../identifiers';

export const COMMAND_ACTOR_KINDS = ['account', 'guest', 'system', 'provider'] as const;
export type CommandActorKind = (typeof COMMAND_ACTOR_KINDS)[number];

export const AccountCommandActorSchema = z
  .object({
    kind: z.literal('account'),
    accountId: AccountIdSchema,
  })
  .strict();

export const GuestCommandActorSchema = z
  .object({
    kind: z.literal('guest'),
    guestSubjectId: GuestSubjectIdSchema,
  })
  .strict();

export const SystemCommandActorSchema = z
  .object({
    kind: z.literal('system'),
    systemActorId: SystemActorIdSchema,
  })
  .strict();

export const ProviderCommandActorSchema = z
  .object({
    kind: z.literal('provider'),
    providerId: ProviderIdSchema,
  })
  .strict();

export const CommandActorSchema = z.discriminatedUnion('kind', [
  AccountCommandActorSchema,
  GuestCommandActorSchema,
  SystemCommandActorSchema,
  ProviderCommandActorSchema,
]);

export type CommandActor = z.output<typeof CommandActorSchema>;
export type AccountCommandActor = z.output<typeof AccountCommandActorSchema>;
export type GuestCommandActor = z.output<typeof GuestCommandActorSchema>;
export type SystemCommandActor = z.output<typeof SystemCommandActorSchema>;
export type ProviderCommandActor = z.output<typeof ProviderCommandActorSchema>;

export function accountCommandActor(accountId: AccountId): AccountCommandActor {
  return { kind: 'account', accountId };
}

export function guestCommandActor(guestSubjectId: GuestSubjectId): GuestCommandActor {
  return { kind: 'guest', guestSubjectId };
}

export function systemCommandActor(systemActorId: SystemActorId): SystemCommandActor {
  return { kind: 'system', systemActorId };
}

export function providerCommandActor(providerId: ProviderId): ProviderCommandActor {
  return { kind: 'provider', providerId };
}
