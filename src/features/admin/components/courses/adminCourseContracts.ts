export interface AdminCourseInstructorInput {
  readonly instructorId: string;
  readonly name: string;
}

export interface CanonicalCoursesManagerInput {
  readonly currentAccountId: string;
  readonly instructors: readonly AdminCourseInstructorInput[];
  readonly onRequestConfirm: (
    message: string,
    onConfirm: () => void | Promise<void>
  ) => void;
}
