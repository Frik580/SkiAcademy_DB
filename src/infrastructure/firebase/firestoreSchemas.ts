import {
  BookingDocumentSchema,
  CourseDocumentSchema,
  UserProfileDocumentSchema,
} from '@ski-academy/shared-domain/entities';
import type { Booking, Course, UserProfile } from '../../types';
import { normalizeUserProfileRead } from './normalizeUserProfileRead';

export type ValidationResult<T> = { success: true; data: T } | { success: false; reason: string };

type SchemaIssue = {
  path: PropertyKey[];
  message: string;
};

function formatSchemaIssues(issues: SchemaIssue[] | undefined): string {
  if (!issues?.length) return 'document: invalid value';
  return issues
    .map((issue) => `${issue.path.map(String).join('.') || 'document'}: ${issue.message}`)
    .join('; ');
}

function toValidationResult<T>(result: {
  success: boolean;
  data?: unknown;
  error?: { issues: SchemaIssue[] };
}): ValidationResult<T> {
  if (result.success) return { success: true, data: result.data as T };
  return { success: false, reason: formatSchemaIssues(result.error?.issues) };
}

export const parseBooking = (fields: unknown, id: string): ValidationResult<Booking> => {
  const result = toValidationResult<Booking>(BookingDocumentSchema.safeParse(fields));
  return result.success ? { success: true, data: { ...result.data, id } } : result;
};

export const parseCourse = (fields: unknown, id: string): ValidationResult<Course> => {
  const result = toValidationResult<Course>(CourseDocumentSchema.safeParse(fields));
  return result.success ? { success: true, data: { ...result.data, id } } : result;
};

export const parseUserProfile = (fields: unknown): ValidationResult<UserProfile> =>
  toValidationResult<UserProfile>(UserProfileDocumentSchema.safeParse(fields));

export const readUserProfile = (fields: unknown, id = 'unknown'): ValidationResult<UserProfile> => {
  const normalized = normalizeUserProfileRead(fields, id);
  if (!normalized.success) return normalized;
  return parseUserProfile(normalized.data);
};
