import type { InstructorCourseViewModel } from './instructorCourseContracts';

export function buildInstructorCourseViewModelsList(
  coursesById: ReadonlyMap<string, InstructorCourseViewModel>
): InstructorCourseViewModel[] {
  return [...coursesById.values()].sort((left, right) =>
    left.title.localeCompare(right.title, undefined, { sensitivity: 'base' })
  );
}
