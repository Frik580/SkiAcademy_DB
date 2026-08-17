export { ClientSkillProgressView } from './components/ClientSkillProgressView';
export { InstructorCard } from './components/InstructorCard';
export { InstructorReviewsModal } from './components/InstructorReviewsModal';
export { OnboardingModal } from './components/OnboardingModal';
export { PersonalCabinet } from './components/PersonalCabinet';
export type { PersonalCabinetProps } from './components/PersonalCabinet';
export { StudentSkillEvaluationModal } from './components/StudentSkillEvaluationModal';
// Backward-compatible exports. New consumers should import from features/journey.
export { YourJourneySection, LEVEL_MARKER_Y, LEVEL_PATH_BEND } from '../journey';
export type { PathBend } from '../journey';
export { useProfileStore } from './profileStore';
export { useAchievementsSync } from './sync/useAchievementsSync';
// Backward-compatible export. New consumers should import from features/instructor-workspace.
export { InstructorWorkspace } from '../instructor-workspace';
export { LessonRecommendationsList } from './components/personal_cabinet/LessonRecommendationsList';
export { RecommendationIndicator } from './components/personal_cabinet/RecommendationIndicator';
