import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const transportSources = [
  'src/features/instructor-courses/useInstructorCourseAttendanceCommands.ts',
  'src/features/instructor-courses/useInstructorCourseReadSync.ts',
];

const canonicalUiSources = [
  'src/features/instructor-workspace/components/InstructorCourseSection.tsx',
  'src/features/instructor-courses/instructorCourseViewModel.ts',
  'src/features/instructor-courses/useInstructorCourseAttendanceMutation.ts',
  'src/features/instructor-courses/useInstructorCourseReadSync.ts',
];

describe('instructor course transport guard', () => {
  it('does not write attendance directly to Firestore from instructor course commands', () => {
    for (const relativePath of transportSources) {
      const source = readFileSync(resolve(process.cwd(), relativePath), 'utf8');
      expect(source).not.toMatch(/collection\(db,\s*['"]attendance['"]\)/);
      expect(source).not.toMatch(/from ['"].*infrastructure\/firebase['"]/);
      expect(source).toMatch(/canonicalReadModelClient|canonicalCommandClient/);
    }
  });

  it('keeps the CourseDay mutation UI behind canonical feature transports', () => {
    for (const relativePath of canonicalUiSources) {
      const source = readFileSync(resolve(process.cwd(), relativePath), 'utf8');
      expect(source).not.toMatch(/record_course_day_attendance/);
      expect(source).not.toMatch(/\b(?:setDoc|addDoc|updateDoc|deleteDoc)\s*\(/);
      expect(source).not.toMatch(/from ['"].*infrastructure\/firebase['"]/);
      expect(source).not.toMatch(/usersList|legacy\s+course|booking\.userId/);
    }
  });
});
