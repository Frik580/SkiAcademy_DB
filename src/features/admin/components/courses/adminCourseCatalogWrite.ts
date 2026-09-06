import {
  CourseCatalogContentInputSchema,
  type CourseCatalogContentInput,
} from '@ski-academy/shared-domain';

const REQUIRED_STRING_KEYS = new Set(['duration', 'description', 'dates', 'bgImageUrl']);

/**
 * Strict writable catalog DTO.
 *
 * READ models may expose empty optional strings/arrays. WRITE must omit those
 * empties so:
 * - untouched Edit does not look dirty;
 * - Firebase callable encode (`undefined == null` → null) cannot turn Zod's
 *   enumerable `undefined` optional keys into schema-invalid `null`.
 */
export function compactCourseCatalogContentInput(
  input: CourseCatalogContentInput
): CourseCatalogContentInput {
  const compacted: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined || value === null) continue;
    if (key === 'isHidden' && value === false) continue;
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed === '' && !REQUIRED_STRING_KEYS.has(key)) continue;
      compacted[key] = REQUIRED_STRING_KEYS.has(key) ? value : trimmed;
      continue;
    }
    if (Array.isArray(value)) {
      if (value.length === 0) continue;
      compacted[key] = value;
      continue;
    }
    compacted[key] = value;
  }
  return CourseCatalogContentInputSchema.parse(compacted);
}

export function catalogContentInputsEqual(
  left: CourseCatalogContentInput,
  right: CourseCatalogContentInput
): boolean {
  return (
    JSON.stringify(compactCourseCatalogContentInput(left)) ===
    JSON.stringify(compactCourseCatalogContentInput(right))
  );
}
