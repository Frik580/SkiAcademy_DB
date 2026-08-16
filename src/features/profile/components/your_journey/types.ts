import type { TranslationKey } from '../../../../lib/LanguageContext';
import type { SkillConfig } from '../../../../lib/skillData';
import type { UserProfile } from '../../../../types';

export type LevelShape = 'circle' | 'diamond' | 'hexagon' | 'triangle';
export type Breakpoint = 'mobile' | 'tablet' | 'desktop';

export type PathBend = { at: number; amount: number };

export interface JourneyLevel {
  id: number;
  shape: LevelShape;
  labelKey: TranslationKey;
  skillKeys: TranslationKey[];
  skillsCount: number;
  achievementsCount: number;
  accent: string;
}

export type JourneyEarnedSkill = { id: string; title: string };

export interface YourJourneySectionProps {
  skillConfig?: SkillConfig;
  userProfile?: UserProfile | null;
  animateSequence?: boolean;
  /** В личном кабинете — секция на высоту видимой области (минус нижнее меню и шапка). */
  fillViewport?: boolean;
  /** Открыть «Систему развития» из карточки уровня. */
  onOpenDevelopment?: () => void;
}
