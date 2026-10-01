import { describe, expect, it } from 'vitest';
import { QueryOutboxDeadLetterReadModelInputSchema } from './outboxDeadLetterReadModel';

describe('QueryOutboxDeadLetterReadModelInputSchema', () => {
  it('accepts the canonical read transport request shape', () => {
    expect(
      QueryOutboxDeadLetterReadModelInputSchema.safeParse({
        scope: 'outbox_dead_letters',
        idempotencyKey: 'read:outbox_dead_letters:current:rs:live',
      }).success
    ).toBe(true);
  });

  it('rejects unknown fields because the schema is strict', () => {
    expect(
      QueryOutboxDeadLetterReadModelInputSchema.safeParse({
        scope: 'outbox_dead_letters',
        unexpectedField: true,
      }).success
    ).toBe(false);
  });
});
