import {
  getJourneyLevelXpThresholds,
  getSkillItemTitle,
  type SkillConfig,
  type SkillItem,
} from '../../../../lib/skillData';
import type { Language } from '../../../../lib/i18n/translations';
import type { UserProfile } from '../../../../types';
import { EQUAL_MARKER_STOPS, JOURNEY_LEVELS } from './constants';
import type { JourneyEarnedSkill, PathBend } from './types';

/** Journey level id (1–4) → skill matrix stage (levelTarget 1–3). */
export function journeyLevelToSkillStage(journeyLevelId: number): 1 | 2 | 3 {
  if (journeyLevelId <= 1) return 1;
  if (journeyLevelId === 2) return 2;
  return 3;
}

/** Top earned skills for a journey level — up to `limit`, sorted by progress. */
export function getTopEarnedSkillsForJourneyLevel(
  journeyLevelId: number,
  items: SkillItem[],
  scores: Record<string, number>,
  language: Language,
  limit = 5
): Array<{ id: string; title: string }> {
  const stage = journeyLevelToSkillStage(journeyLevelId);
  return items
    .filter((item) => item.levelTarget === stage)
    .map((item) => {
      const earned = scores[item.id] || 0;
      const percent = item.maxPoints > 0 ? earned / item.maxPoints : 0;
      return {
        id: item.id,
        title: getSkillItemTitle(item, language),
        earned,
        percent,
      };
    })
    .filter((item) => item.earned > 0)
    .sort((a, b) => b.percent - a.percent || b.earned - a.earned)
    .slice(0, limit)
    .map(({ id, title }) => ({ id, title }));
}

export function isJourneyLevelUnlocked(
  levelId: number,
  earnedSkillsByLevel: Record<number, JourneyEarnedSkill[]>
): boolean {
  return (earnedSkillsByLevel[levelId]?.length ?? 0) > 0;
}

export function getFirstUnlockedJourneyLevelId(
  earnedSkillsByLevel: Record<number, JourneyEarnedSkill[]>
): number | null {
  return (
    JOURNEY_LEVELS.find((level) => isJourneyLevelUnlocked(level.id, earnedSkillsByLevel))?.id ??
    null
  );
}

export function resolveCompactJourneyActiveLevel(
  hoveredLevelId: number | null,
  selectedLevelId: number | null,
  currentUserLevelId: number | null,
  earnedSkillsByLevel: Record<number, JourneyEarnedSkill[]>
): number {
  for (const levelId of [hoveredLevelId, selectedLevelId, currentUserLevelId, 1]) {
    if (levelId != null && isJourneyLevelUnlocked(levelId, earnedSkillsByLevel)) {
      return levelId;
    }
  }
  return getFirstUnlockedJourneyLevelId(earnedSkillsByLevel) ?? 1;
}

/**
 * Кривая через метки.
 * bends[i].at — позиция пика на сегменте; amount — знак и сила отклонения от прямой.
 */
export function buildWavyPath(
  xs: readonly number[],
  ys: readonly number[],
  bends: readonly PathBend[]
): string {
  let d = `M ${xs[0]} ${ys[0]}`;
  for (let i = 0; i < xs.length - 1; i++) {
    const x0 = xs[i];
    const y0 = ys[i];
    const x1 = xs[i + 1];
    const y1 = ys[i + 1];
    const { at = 0.5, amount = 0 } = bends[i] ?? {};

    if (amount === 0) {
      d += ` L ${x1} ${y1}`;
      continue;
    }

    const dx = x1 - x0;
    const dy = y1 - y0;
    // Не прижимаем пик к концам — иначе ломается форма у меток
    const t = Math.min(0.85, Math.max(0.15, at));
    const px = x0 + dx * t;
    const py = Math.min(98, Math.max(2, y0 + dy * t + amount));

    // Контрольные точки на хорде до/после пика — изгиб локальный и смещённый
    const tIn = t * 0.4;
    const tOut = t + (1 - t) * 0.6;
    const pull = dx * 0.06;

    d += ` C ${x0 + dx * tIn} ${y0 + dy * tIn}, ${px - pull} ${py}, ${px} ${py}`;
    d += ` C ${px + pull} ${py}, ${x0 + dx * tOut} ${y0 + dy * tOut}, ${x1} ${y1}`;
  }
  return d;
}

/** Доля этапа (0…1), с которой начинается зона повышения уровня. */
export function getLevelUpZoneStartRatio(passPercentage: number): number {
  return Math.min(1, Math.max(0, passPercentage / 100));
}

/**
 * Прогресс пользователя вдоль пути 0…1.
 * Позиция = суммарный XP относительно порогов на графике (0, Carve, Performance, Expert),
 * чтобы метка совпадала с отображаемым XP (например, 125 XP — между Carve и Performance).
 */
export function getJourneyPathProgress(userProfile: UserProfile, skillConfig: SkillConfig): number {
  const scores = userProfile.skillScores || {};
  const items = skillConfig.items;
  const thresholds = getJourneyLevelXpThresholds(items);
  const totalEarned = items.reduce((acc, item) => acc + (scores[item.id] || 0), 0);

  if (totalEarned <= 0) return 0;
  if (totalEarned >= thresholds[3]) return 1;

  for (let i = 0; i < 3; i++) {
    const start = thresholds[i];
    const end = thresholds[i + 1];
    if (totalEarned < end) {
      const span = end - start;
      const frac = span > 0 ? (totalEarned - start) / span : 0;
      return (i + frac) / 3;
    }
  }
  return 1;
}

/** Зоны повышения уровня: логические доли 0…1 (равные сегменты уровней). */
export function getJourneyLevelUpZones(
  passPercentage: number
): Array<{ start: number; end: number }> {
  const zoneStart = getLevelUpZoneStartRatio(passPercentage);
  return [0, 1, 2].map((segment) => ({
    start: (segment + zoneStart) / 3,
    end: (segment + 1) / 3,
  }));
}

/**
 * Реальные позиции меток уровней вдоль длины волнистого пути (0…1).
 * Сегменты разной длины из‑за изгибов — нельзя делить путь на равные трети.
 */
export function measureMarkerStops(
  xs: readonly number[],
  ys: readonly number[],
  bends: readonly PathBend[]
): [number, number, number, number] | null {
  if (typeof document === 'undefined') return null;
  const segLens: number[] = [];
  for (let i = 0; i < 3; i++) {
    const segD = buildWavyPath([xs[i], xs[i + 1]], [ys[i], ys[i + 1]], [bends[i]]);
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', segD);
    const len = path.getTotalLength();
    if (!Number.isFinite(len) || len <= 0) return null;
    segLens.push(len);
  }
  const total = segLens[0] + segLens[1] + segLens[2];
  if (total <= 0) return null;
  return [0, segLens[0] / total, (segLens[0] + segLens[1]) / total, 1];
}

/** Логический прогресс уровня (равные трети) → доля длины реального пути. */
export function mapLogicalPathProgress(
  logical: number,
  stops: readonly [number, number, number, number] = EQUAL_MARKER_STOPS
): number {
  const t = Math.min(1, Math.max(0, logical));
  if (t <= 0) return stops[0];
  if (t >= 1) return stops[3];
  const x = t * 3;
  const seg = Math.min(2, Math.floor(x));
  const frac = x - seg;
  return stops[seg] + (stops[seg + 1] - stops[seg]) * frac;
}

export function createPathSampler(
  d: string
): ((progress: number) => { x: number; y: number } | null) | null {
  if (typeof document === 'undefined') return null;
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', d);
  const length = path.getTotalLength();
  if (!Number.isFinite(length) || length <= 0) return null;
  return (progress: number) => {
    const point = path.getPointAtLength(Math.min(1, Math.max(0, progress)) * length);
    return { x: point.x, y: point.y };
  };
}

/** Размер цифр XP (10→20px) по прогрессу текущего движения метки 0…1. */
export function getJourneyMarkerXpFontSize(travelRatio: number, min = 10, max = 20): number {
  const t = Math.max(0, Math.min(1, travelRatio));
  return min * (max / min) ** t;
}

export function measureElementHeightWithMargin(el: HTMLElement): number {
  const style = getComputedStyle(el);
  const marginTop = parseFloat(style.marginTop) || 0;
  const marginBottom = parseFloat(style.marginBottom) || 0;
  return el.offsetHeight + marginTop + marginBottom;
}
