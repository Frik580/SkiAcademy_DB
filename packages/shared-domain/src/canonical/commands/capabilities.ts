import type { ExercisedCapability } from '../auditOutbox';
import type { CommandActorKind } from './actors';

export { EXERCISED_CAPABILITIES, type ExercisedCapability } from '../auditOutbox';

const ACCOUNT_CAPABILITIES: readonly ExercisedCapability[] = [
  'account_owner',
  'parent_guardian',
  'administrator',
  'instructor',
];

const ACTOR_CAPABILITY_MATRIX: Record<CommandActorKind, readonly ExercisedCapability[]> = {
  account: ACCOUNT_CAPABILITIES,
  guest: ['guest'],
  system: ['system'],
  provider: ['provider_callback'],
};

export function capabilitiesForActorKind(actorKind: CommandActorKind): readonly ExercisedCapability[] {
  return ACTOR_CAPABILITY_MATRIX[actorKind];
}

export function isCapabilityAllowedForActorKind(
  actorKind: CommandActorKind,
  capability: ExercisedCapability
): boolean {
  return ACTOR_CAPABILITY_MATRIX[actorKind].includes(capability);
}

export function isAdministratorCapabilityExercisedByAccount(
  actorKind: CommandActorKind,
  capability: ExercisedCapability
): boolean {
  return actorKind === 'account' && capability === 'administrator';
}

export function systemActorCannotMasqueradeAsAdministrator(
  actorKind: CommandActorKind,
  capability: ExercisedCapability
): boolean {
  return actorKind === 'system' && capability === 'administrator';
}
