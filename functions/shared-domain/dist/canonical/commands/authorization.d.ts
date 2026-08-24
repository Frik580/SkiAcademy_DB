import type { CommandActor } from './actors';
import { type ExercisedCapability } from './capabilities';
import { type CommandContext } from './commandContext';
export type CommandAuthorizationDecision = 'authorized' | 'forbidden' | 'unauthorized';
export declare function evaluateActorCapabilityPairing(actor: CommandActor, capability: ExercisedCapability): CommandAuthorizationDecision;
export declare function evaluateCommandContextAuthorization(context: CommandContext): CommandAuthorizationDecision;
export declare function administratorCapabilityExercisedByAccount(context: CommandContext): boolean;
