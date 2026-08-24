import type { AggregateRevision } from './primitives';
import type { CorrelationId } from './identifiers';
export interface RevisionedAggregateSnapshot {
    readonly revision: AggregateRevision;
}
export interface AssertExpectedRevisionInput {
    readonly correlationId: CorrelationId;
    readonly expectedRevision: AggregateRevision | undefined;
    readonly currentRevision: AggregateRevision | undefined;
    readonly requireExpectedRevision?: boolean;
}
export declare function assertExpectedRevision(input: AssertExpectedRevisionInput): void;
export declare function nextAggregateRevision(current: AggregateRevision): AggregateRevision;
export declare function readAggregateRevision(data: Record<string, unknown> | undefined): AggregateRevision | undefined;
