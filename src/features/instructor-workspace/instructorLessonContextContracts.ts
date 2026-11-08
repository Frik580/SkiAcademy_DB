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
  readonly homeworkSources?: readonly InstructorHomeworkSourceInput[];
  readonly skillConfig?: SkillConfig;
  readonly authors?: readonly { readonly id: string; readonly name: string }[];
  readonly onClose: () => void;
  readonly onOpenProgress: () => void;
  readonly onOpenFeedback: () => void;
}

export interface InstructorProgressHistoryProps {
  readonly participantId: string;
  readonly bookingId: string;
  readonly bookingStatus: BookingStatus;
  readonly skillConfig: SkillConfig;
  readonly authors?: readonly { readonly id: string; readonly name: string }[];
}

/** Confirmed Participant membership from the instructor lesson read model, never account identity. */
export interface InstructorHomeworkSourceInput {
  readonly threadId: string;
  readonly participantIds: readonly string[];
  readonly label: string;
}
