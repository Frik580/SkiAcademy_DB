import { z } from 'zod';
export declare const VALIDATION_ISSUE_CODES: readonly ["invalid_type", "invalid_value", "out_of_range", "invalid_format", "unknown_field", "invalid_union", "constraint"];
export type ValidationIssueCode = (typeof VALIDATION_ISSUE_CODES)[number];
export interface ValidationIssue {
    readonly code: ValidationIssueCode;
    readonly path: readonly (string | number)[];
    readonly message: string;
}
export type ValidationResult<Value> = Readonly<{
    ok: true;
    value: Value;
}> | Readonly<{
    ok: false;
    issues: readonly ValidationIssue[];
}>;
export declare function validateCanonical<Schema extends z.ZodType>(schema: Schema, input: unknown): ValidationResult<z.output<Schema>>;
