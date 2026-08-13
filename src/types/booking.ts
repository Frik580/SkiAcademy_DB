export type LessonDifficulty = 'beginner' | 'intermediate' | 'advanced' | 'freeride' | 'freestyle';

export interface LessonRecommendation {
  id: string;
  text: string;
}

export type BookingStatus =
  'pending' | 'confirmed' | 'cancelled' | 'completed' | 'pending_cancellation';

export interface Booking {
  id: string;
  userId: string;
  instructorId: string;
  instructorName: string;
  instructorAvatar: string;
  date: string;
  time: string;
  durationHours: number;
  totalPrice: number;
  status: BookingStatus;
  difficulty: LessonDifficulty;
  notes?: string;
  cancellationReason?: string;
  isDeleted?: boolean;
  isGuest?: boolean;
  guestName?: string;
  guestPhone?: string;
  guestEmail?: string;
  /** Canonical course id for group course enrollments (`instructorId` is `course_{courseId}`). */
  courseId?: string;
  /** Instructor-assigned recommendation checklist for this lesson */
  recommendations?: LessonRecommendation[];
  /** IDs of recommendations marked done by the client */
  completedRecommendationIds?: string[];
  /** UTC ISO timestamp when the lesson ends; used for server-side auto-completion. */
  endsAt?: string;
  /** UTC ISO timestamp when the booking record was created. */
  createdAt?: string;
}

export interface AvailabilitySlot {
  bookingId: string;
  instructorId: string;
  date: string;
  time: string;
  durationHours: number;
  slotType: 'lesson' | 'block';
}
