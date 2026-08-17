import type { LucideIcon } from 'lucide-react';
import { Activity, Award, Compass, Layers, ShieldCheck, Zap } from 'lucide-react';
import {
  classifySkillItemToRadarDimension,
  type RadarDimensionKey,
  type SkillItem,
} from '../../../../domain/achievements';

export type { RadarDimensionKey } from '../../../../domain/achievements';

export type RadarDimensionFilter = 'all' | RadarDimensionKey;

export interface RadarExercise {
  item: SkillItem;
  earned: number;
  maxPoints: number;
  pinned: boolean;
  isMaxScore: boolean;
}

export interface RadarDimension {
  key: RadarDimensionKey;
  titleKey: string;
  defaultTitle: string;
  icon: LucideIcon;
  color: string;
  earned: number;
  max: number;
  percent: number;
  exercises: RadarExercise[];
}

export const APPLE = {
  ringMove: '#FA114F',
  ringExercise: '#A8E10C',
  ringStand: '#00D4FF',
  indigo: '#5E5CE6',
  green: '#30D158',
  orange: '#FF9F0A',
  purple: '#BF5AF2',
  simulation: '#FF9F0A',
} as const;

const DIMENSION_CONFIGS: Pick<
  RadarDimension,
  'key' | 'titleKey' | 'defaultTitle' | 'icon' | 'color'
>[] = [
  {
    key: 'technique',
    titleKey: 'scRadarAxisTechnique',
    defaultTitle: 'Техника',
    icon: Compass,
    color: APPLE.ringMove,
  },
  {
    key: 'control',
    titleKey: 'scRadarAxisControl',
    defaultTitle: 'Контроль',
    icon: ShieldCheck,
    color: APPLE.ringExercise,
  },
  {
    key: 'speed',
    titleKey: 'scRadarAxisSpeed',
    defaultTitle: 'Скорость',
    icon: Zap,
    color: APPLE.ringStand,
  },
  {
    key: 'balance',
    titleKey: 'scRadarAxisBalance',
    defaultTitle: 'Баланс',
    icon: Activity,
    color: APPLE.purple,
  },
  {
    key: 'coordination',
    titleKey: 'scRadarAxisCoordination',
    defaultTitle: 'Координация',
    icon: Layers,
    color: APPLE.indigo,
  },
  {
    key: 'terrain',
    titleKey: 'scRadarAxisTerrain',
    defaultTitle: 'Сложный склон',
    icon: Award,
    color: APPLE.orange,
  },
];

export const RADAR_DRAW_MS = 900;

export function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

export function createEmptyRadarSimulation(): Record<RadarDimensionKey, number> {
  return { technique: 0, control: 0, speed: 0, balance: 0, coordination: 0, terrain: 0 };
}

export function buildRadarDimensions({
  items,
  scores,
  targetStage,
  pinnedIds,
}: {
  items: SkillItem[];
  scores: Record<string, number>;
  targetStage: number;
  pinnedIds: Set<string>;
}): RadarDimension[] {
  const dimensionMap: Record<
    RadarDimensionKey,
    { earned: number; max: number; exercises: RadarExercise[] }
  > = {
    technique: { earned: 0, max: 0, exercises: [] },
    control: { earned: 0, max: 0, exercises: [] },
    speed: { earned: 0, max: 0, exercises: [] },
    balance: { earned: 0, max: 0, exercises: [] },
    coordination: { earned: 0, max: 0, exercises: [] },
    terrain: { earned: 0, max: 0, exercises: [] },
  };

  items
    .filter((item) => item.levelTarget <= targetStage)
    .forEach((item) => {
      const key = classifySkillItemToRadarDimension(item);
      const earned = scores[item.id] ?? 0;
      const isMaxScore = item.maxPoints > 0 && earned >= item.maxPoints;

      dimensionMap[key].earned += earned;
      dimensionMap[key].max += item.maxPoints;
      dimensionMap[key].exercises.push({
        item,
        earned,
        maxPoints: item.maxPoints,
        pinned: pinnedIds.has(item.id),
        isMaxScore,
      });
    });

  return DIMENSION_CONFIGS.map((config) => {
    const data = dimensionMap[config.key];
    return {
      ...config,
      earned: data.earned,
      max: data.max,
      percent: data.max > 0 ? Math.min(100, Math.round((data.earned / data.max) * 100)) : 0,
      exercises: data.exercises,
    };
  });
}

export function getChartDimensions(dimensions: RadarDimension[]): RadarDimension[] {
  return dimensions.filter((dimension) => dimension.exercises.length > 0);
}

export function getSelectedRadarDimension(
  dimensions: RadarDimension[],
  selectedKey: RadarDimensionFilter
): RadarDimension | null {
  return selectedKey === 'all'
    ? null
    : (dimensions.find((dimension) => dimension.key === selectedKey) ?? null);
}

export function getVisibleRadarExercises(
  dimensions: RadarDimension[],
  selectedDimension: RadarDimension | null,
  selectedKey: RadarDimensionFilter
): RadarExercise[] {
  return selectedKey === 'all'
    ? dimensions.flatMap((dimension) => dimension.exercises)
    : (selectedDimension?.exercises ?? []);
}

export function groupRadarExercisesByLevel(
  exercises: RadarExercise[]
): [number, RadarExercise[]][] {
  const levels = new Map<number, RadarExercise[]>();
  exercises.forEach((exercise) => {
    const level = exercise.item.levelTarget;
    const entries = levels.get(level) ?? [];
    entries.push(exercise);
    levels.set(level, entries);
  });
  return Array.from(levels.entries()).sort(([first], [second]) => first - second);
}

export function buildSimulatedSkillScores({
  scores,
  dimensions,
  simulatedValues,
}: {
  scores: Record<string, number>;
  dimensions: RadarDimension[];
  simulatedValues: Record<RadarDimensionKey, number>;
}): Record<string, number> {
  const simulatedScores = { ...scores };
  dimensions.forEach((dimension) => {
    const targetPercent = Math.max(dimension.percent, simulatedValues[dimension.key]);
    if (targetPercent <= dimension.percent) return;
    dimension.exercises.forEach(({ item }) => {
      const simulatedEarned = Math.round((targetPercent / 100) * item.maxPoints);
      simulatedScores[item.id] = Math.max(simulatedScores[item.id] ?? 0, simulatedEarned);
    });
  });
  return simulatedScores;
}

export function getSimulatedSkillIdsToPin(
  dimensions: RadarDimension[],
  simulatedValues: Record<RadarDimensionKey, number>
): string[] {
  return dimensions.flatMap((dimension) =>
    simulatedValues[dimension.key] > dimension.percent
      ? dimension.exercises
          .filter(({ isMaxScore, pinned }) => !isMaxScore && !pinned)
          .map(({ item }) => item.id)
      : []
  );
}

export function getRadarGeometry(ringCount: number) {
  const size = 230;
  const ringGap = 3;
  const strokeWidth = Math.max(9, Math.min(15, Math.floor((size / 2 - 10) / ringCount) - ringGap));
  return {
    size,
    ringGap,
    strokeWidth,
    outerRadius: size / 2 - strokeWidth / 2 - 4,
    center: size / 2,
  };
}
