import type { CommandActor } from './actors';
import {
  isCapabilityAllowedForActorKind,
  systemActorCannotMasqueradeAsAdministrator,
  type ExercisedCapability,
} from './capabilities';
import { isSourceCompatibleWithActorKind, type CommandContext } from './commandContext';

export type CommandAuthorizationDecision = 'authorized' | 'forbidden' | 'unauthorized';

export function evaluateActorCapabilityPairing(
  actor: CommandActor,
  capability: ExercisedCapability
): CommandAuthorizationDecision {
  if (systemActorCannotMasqueradeAsAdministrator(actor.kind, capability)) {
    return 'forbidden';
  }

  if (!isCapabilityAllowedForActorKind(actor.kind, capability)) {
    return 'forbidden';
  }

  return 'authorized';
}

export function evaluateCommandContextAuthorization(
  context: CommandContext
): CommandAuthorizationDecision {
  if (!isSourceCompatibleWithActorKind(context.source, context.actor.kind)) {
    return 'forbidden';
  }

  return evaluateActorCapabilityPairing(context.actor, context.exercisedCapability);
}

export function administratorCapabilityExercisedByAccount(
  context: CommandContext
): boolean {
  return (
    context.actor.kind === 'account' && context.exercisedCapability === 'administrator'
  );
}
