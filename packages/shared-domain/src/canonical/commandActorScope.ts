import type { CommandActor } from './commands/actors';

const ACTOR_SCOPE_SEPARATOR = '\u001f';

export function encodeCommandActorScope(actor: CommandActor): string {
  switch (actor.kind) {
    case 'account':
      return ['actor-scope:v1', 'account', actor.accountId].join(ACTOR_SCOPE_SEPARATOR);
    case 'guest':
      return ['actor-scope:v1', 'guest', actor.guestSubjectId].join(ACTOR_SCOPE_SEPARATOR);
    case 'system':
      return ['actor-scope:v1', 'system', actor.systemActorId].join(ACTOR_SCOPE_SEPARATOR);
    case 'provider':
      return ['actor-scope:v1', 'provider', actor.providerId].join(ACTOR_SCOPE_SEPARATOR);
  }
}
