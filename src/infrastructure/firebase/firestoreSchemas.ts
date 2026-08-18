import {
  BookingDocumentSchema,
  CourseDocumentSchema,
  UserProfileDocumentSchema,
} from '@ski-academy/shared-domain/entities';
import type { Booking, Course, UserProfile } from '../../types';

export type ValidationResult<T> = { success: true; data: T } | { success: false; reason: string };

function toValidationResult<T>(result: {
  success: boolean;
  data?: unknown;
  error?: { issues: Array<{ path: PropertyKey[]; message: string }> };
}): ValidationResult<T> {
  if (result.success) return { success: true, data: result.data as T };
  const issue = result.error?.issues[0];
  const field = issue?.path.join('.') || 'document';
  return { success: false, reason: `${field}: ${issue?.message ?? 'invalid value'}` };
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
