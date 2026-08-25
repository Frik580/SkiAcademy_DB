import {
  AttendanceSchema,
  canonicalPaths,
  normalizeFirestoreDocument,
  type Attendance,
} from '@ski-academy/shared-domain';

export const ATTENDANCE_PLANNING_ESTIMATES = {
  attendanceBytes: 768,
} as const;

export function attendancePath(attendanceId: Attendance['attendanceId']): string {
  const path = canonicalPaths.attendance(attendanceId);
  return path.startsWith('/') ? path.slice(1) : path;
}

export function parseAttendance(data: Record<string, unknown> | undefined): Attendance | undefined {
  const normalized = normalizeFirestoreDocument(data);
  if (!normalized) return undefined;
  const parsed = AttendanceSchema.safeParse(normalized);
  return parsed.success ? parsed.data : undefined;
}

export function toFirestoreWritePayload(
  data: Record<string, unknown>
): Record<string, unknown> {
  return Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined));
}
