import type { ExercisedCapability } from '../auditOutbox';
import type { CommandActorKind } from './actors';
export { EXERCISED_CAPABILITIES, type ExercisedCapability } from '../auditOutbox';
export declare function capabilitiesForActorKind(actorKind: CommandActorKind): readonly ExercisedCapability[];
export declare function isCapabilityAllowedForActorKind(actorKind: CommandActorKind, capability: ExercisedCapability): boolean;
export declare function isAdministratorCapabilityExercisedByAccount(actorKind: CommandActorKind, capability: ExercisedCapability): boolean;
export declare function systemActorCannotMasqueradeAsAdministrator(actorKind: CommandActorKind, capability: ExercisedCapability): boolean;
