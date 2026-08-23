import { z } from 'zod';

export const VALIDATION_ISSUE_CODES = [
  'invalid_type',
  'invalid_value',
  'out_of_range',
  'invalid_format',
  'unknown_field',
  'invalid_union',
  'constraint',
] as const;

export type ValidationIssueCode = (typeof VALIDATION_ISSUE_CODES)[number];

export interface ValidationIssue {
  readonly code: ValidationIssueCode;
  readonly path: readonly (string | number)[];
  readonly message: string;
}

export type ValidationResult<Value> =
  | Readonly<{ ok: true; value: Value }>
  | Readonly<{ ok: false; issues: readonly ValidationIssue[] }>;

const ISSUE_MESSAGES: Record<ValidationIssueCode, string> = {
  invalid_type: 'Invalid value type',
  invalid_value: 'Invalid value',
  out_of_range: 'Value is out of range',
  invalid_format: 'Value has invalid format',
  unknown_field: 'Unknown field',
  invalid_union: 'Value does not match any allowed variant',
  constraint: 'Value violates a domain constraint',
};

function normalizeIssueCode(code: string): ValidationIssueCode {
  switch (code) {
    case 'invalid_type':
      return 'invalid_type';
    case 'invalid_value':
      return 'invalid_value';
    case 'too_big':
    case 'too_small':
    case 'not_multiple_of':
      return 'out_of_range';
    case 'invalid_format':
      return 'invalid_format';
    case 'unrecognized_keys':
      return 'unknown_field';
    case 'invalid_union':
      return 'invalid_union';
    default:
      return 'constraint';
  }
}

function normalizePath(path: readonly PropertyKey[]): readonly (string | number)[] {
  return path.map((segment) => (typeof segment === 'number' ? segment : String(segment)));
}

export function validateCanonical<Schema extends z.ZodType>(
  schema: Schema,
  input: unknown
): ValidationResult<z.output<Schema>> {
  const result = schema.safeParse(input);
  if (result.success) return { ok: true, value: result.data };

  const issues = result.error.issues
    .map((issue): ValidationIssue => {
      const code = normalizeIssueCode(issue.code);
      return { code, path: normalizePath(issue.path), message: ISSUE_MESSAGES[code] };
    })
    .sort((left, right) => {
      const byPath = JSON.stringify(left.path).localeCompare(JSON.stringify(right.path));
      return byPath || left.code.localeCompare(right.code);
    });

  return { ok: false, issues };
}
