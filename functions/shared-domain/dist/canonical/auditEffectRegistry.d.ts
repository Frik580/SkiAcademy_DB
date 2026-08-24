import type { AuditEffectKind } from './auditOutbox';
import type { CommandKind } from './commands/commandKinds';
import type { CorrelationId } from './identifiers';
export declare const AUDIT_EFFECT_REGISTRY_VERSION: "effect:v1";
export declare function hasAuditEffectRegistryEntry(commandKind: CommandKind): boolean;
export declare function allowedAuditEffectsForCommand(commandKind: CommandKind): readonly AuditEffectKind[];
export declare function validateAuditEffectsForCommand(correlationId: CorrelationId, commandKind: CommandKind, effects: readonly {
    kind: AuditEffectKind;
}[]): void;
