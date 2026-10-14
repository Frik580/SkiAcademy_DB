import type {
  LevelOperation,
  ParticipantLevelState,
  ParticipantProgressReadModel,
} from '@ski-academy/shared-domain';
import type { SkillConfig } from '../../domain/achievements';
export type { LevelOperation, ParticipantLevelState, ParticipantProgressReadModel, SkillConfig };
export interface LevelProgressInput {
  level: number;
  skillScores: Record<string, number>;
  levelState?: ParticipantLevelState;
}
