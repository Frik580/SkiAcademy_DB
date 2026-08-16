import { Award, Crosshair, Mountain, Play, type LucideIcon } from 'lucide-react';
import type { TranslationKey } from '../../../../lib/LanguageContext';
import type { Breakpoint, JourneyLevel, PathBend } from './types';

/**
 * ═══════════════════════════════════════════════════════════════════
 * ВЫСОТА МЕТОК УРОВНЕЙ — редактируй здесь
 * ═══════════════════════════════════════════════════════════════════
 *
 * Значения = % от ВЕРХА полосы пути (0 = самый верх, 100 = низ).
 * Чем МЕНЬШЕ число — тем ВЫШЕ метка на экране.
 *
 * Порядок: [Beginner, Carve, Performance, Expert]
 *
 * mobile  — < 640px
 * tablet  — 640px … 1023px
 * desktop — ≥ 1024px
 */
export const LEVEL_MARKER_Y: Record<Breakpoint, [number, number, number, number]> = {
  //          Beginner  Carve  Performance  Expert
  mobile: [100, 90, 65, 20],
  tablet: [100, 80, 45, 0],
  desktop: [100, 80, 45, 0],
};

/** Горизонтальные позиции меток в viewBox 0–400 (обычно не трогать). */
export const LEVEL_MARKER_X: [number, number, number, number] = [50, 150, 250, 350];

/**
 * Изгиб линии на каждом сегменте между уровнями.
 * Порядок: [Beginner→Carve, Carve→Performance, Performance→Expert]
 *
 * at     — где пик изгиба на отрезке (0…1): 0.25 ближе к старту, 0.75 к концу
 * amount — насколько уходит от прямой (viewBox Y):
 *          >0 вниз-вверх (нырок), <0 вверх-вниз (горб), 0 = прямая
 */
export const LEVEL_PATH_BEND: Record<Breakpoint, [PathBend, PathBend, PathBend]> = {
  mobile: [
    { at: 0.28, amount: 7 }, // 1→2: нырок ближе к началу
    { at: 0.72, amount: -6 }, // 2→3: горб ближе к концу
    { at: 0.42, amount: 5 }, // 3→4: лёгкий нырок чуть левее центра
  ],
  tablet: [
    { at: 0.28, amount: 7 },
    { at: 0.72, amount: -6 },
    { at: 0.42, amount: 5 },
  ],
  desktop: [
    { at: 0.28, amount: 7 },
    { at: 0.72, amount: -6 },
    { at: 0.42, amount: 5 },
  ],
};

export const JOURNEY_BG = {
  dark: 'https://storage.yandexcloud.net/carve/level/dark.png',
  light: 'https://storage.yandexcloud.net/carve/level/light.png',
} as const;

export const JOURNEY_LEVELS: JourneyLevel[] = [
  {
    id: 1,
    shape: 'diamond',
    labelKey: 'journeyLevelBeginner',
    skillKeys: ['journeySkillBalance', 'journeySkillFirstTurns', 'journeySkillSpeedControl'],
    skillsCount: 8,
    achievementsCount: 10,
    accent: '#7dd3fc',
  },
  {
    id: 2,
    shape: 'diamond',
    labelKey: 'journeyLevelCarve',
    skillKeys: [
      'journeySkillEdgeControl',
      'journeySkillParallelSkiing',
      'journeySkillCarving',
      'journeySkillRhythm',
    ],
    skillsCount: 12,
    achievementsCount: 15,
    accent: '#38bdf8',
  },
  {
    id: 3,
    shape: 'diamond',
    labelKey: 'journeyLevelPerformance',
    skillKeys: [
      'journeySkillHighSpeed',
      'journeySkillShortTurns',
      'journeySkillSteepTerrain',
      'journeySkillDynamicTransitions',
    ],
    skillsCount: 16,
    achievementsCount: 20,
    accent: '#a78bfa',
  },
  {
    id: 4,
    shape: 'diamond',
    labelKey: 'journeyLevelExpert',
    skillKeys: [
      'journeySkillAnySlope',
      'journeySkillAnySnow',
      'journeySkillAnySpeed',
      'journeySkillFreedom',
    ],
    skillsCount: 20,
    achievementsCount: 25,
    accent: '#e879f9',
  },
];

export const SUMMARY_STATS: { key: TranslationKey; icon: LucideIcon }[] = [
  { key: 'journeyStatAchievements', icon: Award },
  { key: 'journeyStatSkills', icon: Crosshair },
  { key: 'journeyStatLevels', icon: Mountain },
  { key: 'journeyStatVideo', icon: Play },
];

export const EQUAL_MARKER_STOPS: [number, number, number, number] = [0, 1 / 3, 2 / 3, 1];

export const CABINET_JOURNEY_MIN_SKILLS_BLOCK_PX = 150;
