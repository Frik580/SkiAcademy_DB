export interface CanonicalCoursesManagerInput {
  readonly currentAccountId: string;
  readonly onRequestConfirm: (message: string, onConfirm: () => void | Promise<void>) => void;
  readonly onOpenEnrollments?: (courseId: string) => void;
}
