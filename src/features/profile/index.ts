export { ClientSkillProgressView } from './components/ClientSkillProgressView';
export { BookingsPanel } from './components/BookingsPanel';
export { InstructorCard } from './components/InstructorCard';
export { InstructorReviewsModal } from './components/InstructorReviewsModal';
export { PersonalCabinet } from './components/PersonalCabinet';
export type { PersonalCabinetProps } from './components/PersonalCabinet';
export { ReviewFlow, useReviewFlow } from './components/ReviewFlow';
export { TodayChecklist } from './components/TodayChecklist';
export { WalletPanel } from './components/WalletPanel';
export { StudentSkillEvaluationModal } from './components/StudentSkillEvaluationModal';
// Backward-compatible exports. New consumers should import from features/journey.
export { YourJourneySection, LEVEL_MARKER_Y, LEVEL_PATH_BEND } from '../journey';
export type { PathBend } from '../journey';
export { useProfileStore } from './profileStore';
export { useAchievementsSync } from './sync/useAchievementsSync';
// Backward-compatible export. New consumers should import from features/instructor-workspace.
export { InstructorWorkspace } from '../instructor-workspace';
// Backward-compatible exports. New consumers should import from features/student-cabinet.
export { LessonRecommendationsList, RecommendationIndicator } from '../student-cabinet';
