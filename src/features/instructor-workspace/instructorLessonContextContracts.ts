import type { BookingStatus } from '../../types';
import type { SkillConfig } from '../../domain/achievements';

export interface InstructorLessonContextInput {
  readonly participantId: string;
  readonly bookingId: string;
  readonly studentName: string;
  readonly avatar?: string;
  readonly discipline?: 'ski' | 'snowboard';
  readonly date: string;
  readonly time: string;
  readonly status: BookingStatus;
  readonly canAssess: boolean;
  readonly canReadFeedback: boolean;
}

export interface InstructorLessonContextDialogProps {
  readonly context: InstructorLessonContextInput;
  readonly skillConfig?: SkillConfig;
  readonly authors?: readonly { readonly id: string; readonly name: string }[];
  readonly onClose: () => void;
  readonly onOpenProgress: () => void;
  readonly onOpenFeedback: () => void;
}
