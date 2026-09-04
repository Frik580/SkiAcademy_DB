import type { AggregateRevision } from './primitives';
import { AggregateRevisionSchema } from './primitives';
import { CanonicalCommandError } from './errors';
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

export function assertExpectedRevision(input: AssertExpectedRevisionInput): void {
  const { correlationId, expectedRevision, currentRevision, requireExpectedRevision } = input;

  if (expectedRevision === undefined) {
    if (requireExpectedRevision) {
      throw new CanonicalCommandError('validation', {
        correlationId,
        details: { field: 'expectedRevision', reason: 'required' },
      });
    }
    return;
  }

  if (currentRevision === undefined) {
    throw new CanonicalCommandError('stale_version', {
      correlationId,
      currentRevision: AggregateRevisionSchema.parse(0),
    });
  }

  if (currentRevision !== expectedRevision) {
    throw new CanonicalCommandError('stale_version', {
      correlationId,
      currentRevision,
    });
  }
}

export function nextAggregateRevision(current: AggregateRevision): AggregateRevision {
  return AggregateRevisionSchema.parse(current + 1);
}

export function readAggregateRevision(
  data: Record<string, unknown> | undefined
): AggregateRevision | undefined {
  // Absent document payload stays undefined so non-existent aggregates still fail
  // assertExpectedRevision. An existing document without a revision field is the
  // authoritative initial revision 0 (matches assertExpectedRevision reporting).
  if (!data) {
    return undefined;
  }
  if (!('revision' in data)) {
    return AggregateRevisionSchema.parse(0);
  }
  const parsed = AggregateRevisionSchema.safeParse(data.revision);
  return parsed.success ? parsed.data : undefined;
}
