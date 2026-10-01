import { describe, expect, it } from 'vitest';
import type { ZodType } from 'zod';
import * as readModels from './index';

const TRANSPORT_IDEMPOTENCY_KEY = 'read:canonical:current:rs:live';
const INPUT_SCHEMA_NAME = /^Query.+ReadModels?InputSchema$/;

interface ZodObjectBranch {
  readonly type: 'object';
  readonly shape: Readonly<Record<string, ZodType>>;
  readonly def: { readonly catchall?: { readonly type?: string } };
}

interface ZodUnionBranch {
  readonly type: 'union';
  readonly options: readonly ZodSchemaNode[];
}

type ZodSchemaNode = ZodObjectBranch | ZodUnionBranch | { readonly type: string };

function isSchemaNode(value: unknown): value is ZodSchemaNode {
  return (
    Boolean(value) &&
    typeof value === 'object' &&
    'type' in value &&
    typeof value.type === 'string' &&
    'safeParse' in value
  );
}

function collectObjectBranches(schema: ZodSchemaNode, path: string): ZodObjectBranch[] {
  if (schema.type === 'object' && 'shape' in schema) {
    return [schema];
  }
  if (schema.type === 'union' && 'options' in schema && Array.isArray(schema.options)) {
    return schema.options.flatMap((option, index) =>
      collectObjectBranches(option, `${path}[${index}]`)
    );
  }
  throw new Error(`Unsupported canonical read input schema at ${path}: ${schema.type}`);
}

const canonicalReadInputSchemas = Object.entries(readModels).flatMap(([name, value]) =>
  INPUT_SCHEMA_NAME.test(name) && isSchemaNode(value) ? [{ name, schema: value }] : []
);

describe('canonical read input transport contract', () => {
  it('discovers the exported query input schemas', () => {
    expect(canonicalReadInputSchemas.map(({ name }) => name)).toEqual(
      expect.arrayContaining([
        'QueryOutboxDeadLetterReadModelInputSchema',
        'QueryEmailDeliverySettingsReadModelInputSchema',
        'QueryLessonBookingReadModelsInputSchema',
      ])
    );
  });

  it.each(canonicalReadInputSchemas)(
    '$name accepts optional transport idempotencyKey on every strict branch',
    ({ name, schema }) => {
      const branches = collectObjectBranches(schema, name);
      expect(branches.length).toBeGreaterThan(0);
      for (const branch of branches) {
        const idempotencyKey = branch.shape.idempotencyKey;
        expect(idempotencyKey?.type).toBe('optional');
        expect(idempotencyKey?.safeParse(TRANSPORT_IDEMPOTENCY_KEY).success).toBe(true);
        expect(idempotencyKey?.safeParse(undefined).success).toBe(true);
        expect(branch.def.catchall?.type).toBe('never');
      }
    }
  );
});
