import type {
  AdminCourseEnrollmentRosterItem,
  LessonBookingReadModel,
} from '@ski-academy/shared-domain';

export type AdminTrainingKindFilter = 'all' | 'lesson' | 'course';
export type AdminTrainingScope = 'current' | 'history' | 'pending_guest';

export type AdminTrainingRecord =
  | {
      readonly kind: 'lesson';
      readonly id: string;
      readonly data: LessonBookingReadModel;
    }
  | {
      readonly kind: 'course';
      readonly id: string;
      readonly data: AdminCourseEnrollmentRosterItem;
    };
