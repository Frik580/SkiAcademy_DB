import { describe, expect, it } from 'vitest';
import {
  CourseDayIdSchema,
  CourseIdSchema,
  CourseProvisioningManifestSchema,
  InstructorIdSchema,
  KztMinorUnitsSchema,
} from '../../index';
import { parseCommandIntent } from './commandIntents';

const courseId = CourseIdSchema.parse('course_create_only_contract');
const instructorId = InstructorIdSchema.parse('instructor_create_only_contract');
const manifest = CourseProvisioningManifestSchema.parse({
  courseId,
  title: 'Create only contract',
  price: KztMinorUnitsSchema.parse(10_000),
  totalSeats: 4,
  capacityPolicy: { kind: 'seed_full' },
  instructorRosterIds: [instructorId],
  timeZone: 'Asia/Almaty',
  days: [{
    courseDayId: CourseDayIdSchema.parse('course_day_create_only_contract'),
    dayOrder: 1,
    localDate: '2026-10-01',
    localTime: '10:00',
    durationMinutes: 60,
    instructorId,
  }],
});

describe('apply_canonical_course_provisioning_manifest intent', () => {
  it('rejects the removed promotion-only createOnly flag', () => {
    const base = { manifest, dryRun: false };
    expect(parseCommandIntent('apply_canonical_course_provisioning_manifest', base).success).toBe(true);
    expect(parseCommandIntent('apply_canonical_course_provisioning_manifest', { ...base, createOnly: true }).success).toBe(false);
    expect(parseCommandIntent('provision_canonical_course', { manifest, createOnly: true }).success).toBe(false);
  });
});
