import { LessonDifficulty } from './booking';

export type ActivityLogType =
  | 'booking_completed'
  | 'level_up'
  | 'skill_scores_updated'
  | 'review_created'
  | 'recommendation_completed'
  | 'recommendations_completed_all'
  | 'achievement_earned';

export interface SkillDeltaMeta {
  itemId: string;
  title?: string;
  oldScore?: number;
  newScore?: number;
  delta: number;
  maxPoints?: number;
}

export interface ActivityLogMetadata {
  bookingId?: string;
  instructorId?: string;
  instructorName?: string;
  lessonTitle?: string;
  difficulty?: LessonDifficulty;
  durationHours?: number;
  time?: string;
  oldLevel?: number;
  newLevel?: number;
  pointsDelta?: number;
  reviewId?: string;
  rating?: number;
  recommendationId?: string;
  recommendationText?: string;
  achievementId?: string;
  sectionName?: string;
  achievementLabelRu?: string;
  achievementLabelEn?: string;
  skillDeltas?: SkillDeltaMeta[];
  /** Skill item ids that received coach comments in this evaluation. */
  commentedSkillIds?: string[];
}

export interface ActivityLog {
  id: string;
  userId: string;
  actorId: string;
  type: ActivityLogType;
  timestamp: string;
  metadata?: ActivityLogMetadata;
}
