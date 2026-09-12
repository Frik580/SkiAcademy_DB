import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readRepoFile } from '../helpers/readRepoFile';

describe('guest course enrollment canonical cutover', () => {
  it('keeps the production frontend on the canonical guest command', () => {
    const commands = readRepoFile('src/features/course-enrollments/useCourseEnrollmentCommands.ts');
    const modal = readRepoFile('src/features/courses/components/CourseEnrollmentModal.tsx');

    expect(commands).toContain('executeGuestCanonicalCommand');
    expect(commands).toContain("kind: 'create_course_enrollments'");
    expect(commands).toContain('persistGuestCourseEnrollmentCredential');
    expect(modal).toContain('createGuestEnrollment');
    expect(commands).not.toContain("'createGuestCourseEnrollment'");
  });

  it('does not export or retain the legacy callable implementation and wrapper', () => {
    const functionsIndex = readRepoFile('functions/src/index.ts');

    expect(functionsIndex).not.toContain('createGuestCourseEnrollmentHandler');
    expect(functionsIndex).not.toMatch(/export const createGuestCourseEnrollment\b/);
    expect(
      existsSync(resolve(process.cwd(), 'functions/src/courses/createGuestCourseEnrollment.ts'))
    ).toBe(false);
    expect(
      existsSync(
        resolve(process.cwd(), 'src/features/courses/createGuestCourseEnrollmentCallable.ts')
      )
    ).toBe(false);
  });
});
