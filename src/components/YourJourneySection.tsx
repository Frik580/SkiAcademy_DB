import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Award, Check, Crosshair, Mountain, Play, type LucideIcon } from 'lucide-react';
import { useLanguage, type TranslationKey } from '../lib/LanguageContext';
import {
  DEFAULT_SKILL_CONFIG,
  calculateSkillProgress,
  calculateStudentLevel,
  getJourneyLevelXpThresholds,
  type SkillConfig,
} from '../lib/skillData';
import { getDefaultWorkspacePath } from '../lib/workspaceRoutes';
import type { UserProfile } from '../types';
import { useTheme } from './useTheme';

type LevelShape = 'circle' | 'diamond' | 'hexagon' | 'triangle';
type Breakpoint = 'mobile' | 'tablet' | 'desktop';

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
const LEVEL_MARKER_X: [number, number, number, number] = [50, 150, 250, 350];

/**
 * Изгиб линии на каждом сегменте между уровнями.
 * Порядок: [Beginner→Carve, Carve→Performance, Performance→Expert]
 *
 * at     — где пик изгиба на отрезке (0…1): 0.25 ближе к старту, 0.75 к концу
 * amount — насколько уходит от прямой (viewBox Y):
 *          >0 вниз-вверх (нырок), <0 вверх-вниз (горб), 0 = прямая
 */
export type PathBend = { at: number; amount: number };

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

const JOURNEY_BG = {
  dark: 'https://storage.yandexcloud.net/carve/level/dark.png',
  light: 'https://storage.yandexcloud.net/carve/level/light.png',
} as const;

interface JourneyLevel {
  id: number;
  shape: LevelShape;
  labelKey: TranslationKey;
  skillKeys: TranslationKey[];
  skillsCount: number;
  achievementsCount: number;
  accent: string;
}

const JOURNEY_LEVELS: JourneyLevel[] = [
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

const SUMMARY_STATS: { key: TranslationKey; icon: LucideIcon }[] = [
  { key: 'journeyStatAchievements', icon: Award },
  { key: 'journeyStatSkills', icon: Crosshair },
  { key: 'journeyStatLevels', icon: Mountain },
  { key: 'journeyStatVideo', icon: Play },
];

function getBreakpoint(width: number): Breakpoint {
  if (width < 640) return 'mobile';
  if (width < 1024) return 'tablet';
  return 'desktop';
}

function useBreakpoint(): Breakpoint {
  const [bp, setBp] = useState<Breakpoint>(() =>
    typeof window === 'undefined' ? 'desktop' : getBreakpoint(window.innerWidth)
  );

  useEffect(() => {
    const onResize = () => setBp(getBreakpoint(window.innerWidth));
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return bp;
}

/**
 * Кривая через метки.
 * bends[i].at — позиция пика на сегменте; amount — знак и сила отклонения от прямой.
 */
function buildWavyPath(
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
function getLevelUpZoneStartRatio(passPercentage: number): number {
  return Math.min(1, Math.max(0, passPercentage / 100));
}

/**
 * Прогресс пользователя вдоль пути 0…1.
 * Внутри этапа позиция = earned / max XP этапа (не от порога прохождения),
 * чтобы метка стояла до зоны level-up, пока порог ещё не набран.
 */
function getJourneyPathProgress(userProfile: UserProfile, skillConfig: SkillConfig): number {
  const level = Math.min(4, Math.max(1, userProfile.level || 1));
  if (level >= 4) return 1;

  const progress = calculateSkillProgress(
    userProfile.skillScores || {},
    skillConfig.items,
    level,
    skillConfig.passPercentage ?? 80
  );
  const frac =
    progress.targetMaxPoints > 0
      ? Math.min(1, Math.max(0, progress.targetEarnedPoints / progress.targetMaxPoints))
      : 0;
  // 3 сегмента между 4 метками
  return (level - 1 + frac) / 3;
}

/** Зоны повышения уровня: логические доли 0…1 (равные сегменты уровней). */
function getJourneyLevelUpZones(passPercentage: number): Array<{ start: number; end: number }> {
  const zoneStart = getLevelUpZoneStartRatio(passPercentage);
  return [0, 1, 2].map((segment) => ({
    start: (segment + zoneStart) / 3,
    end: (segment + 1) / 3,
  }));
}

const EQUAL_MARKER_STOPS: [number, number, number, number] = [0, 1 / 3, 2 / 3, 1];

/**
 * Реальные позиции меток уровней вдоль длины волнистого пути (0…1).
 * Сегменты разной длины из‑за изгибов — нельзя делить путь на равные трети.
 */
function measureMarkerStops(
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
function mapLogicalPathProgress(
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

function createPathSampler(
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

const JourneyPath: React.FC<{
  ys: [number, number, number, number];
  bends: [PathBend, PathBend, PathBend];
  activeId: number | null;
  /** Логический прогресс 0…1 (равные сегменты уровней) */
  progress?: number | null;
  /** Прогресс отрисовки линии (0…1) */
  lineDrawProgress?: number;
  /** Зоны повышения уровня — логические доли 0…1 */
  levelUpZones?: Array<{ start: number; end: number }>;
  /** Реальные позиции меток на длине пути */
  markerStops?: [number, number, number, number];
}> = ({
  ys,
  bends,
  activeId,
  progress = null,
  lineDrawProgress = 1,
  levelUpZones = [],
  markerStops = EQUAL_MARKER_STOPS,
}) => {
  const d = buildWavyPath(LEVEL_MARKER_X, ys, bends);
  const measureRef = useRef<SVGPathElement>(null);
  const [pathLength, setPathLength] = useState(0);

  useLayoutEffect(() => {
    const el = measureRef.current;
    if (!el) return;
    setPathLength(el.getTotalLength());
  }, [d]);

  const mappedProgress =
    progress != null ? mapLogicalPathProgress(progress, markerStops) : null;
  const traveled =
    mappedProgress != null && pathLength > 0
      ? Math.min(1, Math.max(0, mappedProgress)) * pathLength
      : null;

  const strokeDashoffset =
    pathLength > 0 ? pathLength * (1 - Math.min(1, Math.max(0, lineDrawProgress))) : 0;

  return (
    <svg
      viewBox="0 0 400 100"
      preserveAspectRatio="none"
      className="absolute inset-0 w-full h-full overflow-visible"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="journey-path-grad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#67e8f9" />
          <stop offset="45%" stopColor="#38bdf8" />
          <stop offset="75%" stopColor="#a78bfa" />
          <stop offset="100%" stopColor="#e879f9" />
        </linearGradient>
        <filter id="journey-glow" x="-30%" y="-80%" width="160%" height="260%">
          <feGaussianBlur stdDeviation="2.8" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        {pathLength > 0 &&
          lineDrawProgress >= 1 &&
          levelUpZones.map((zone, index) => {
            const startLen = mapLogicalPathProgress(zone.start, markerStops) * pathLength;
            const endLen = mapLogicalPathProgress(zone.end, markerStops) * pathLength;
            if (endLen <= startLen) return null;
            const startPt = measureRef.current?.getPointAtLength(startLen);
            const endPt = measureRef.current?.getPointAtLength(endLen);
            if (!startPt || !endPt) return null;
            return (
              <linearGradient
                key={`journey-levelup-grad-${index}`}
                id={`journey-levelup-grad-${index}`}
                gradientUnits="userSpaceOnUse"
                x1={startPt.x}
                y1={startPt.y}
                x2={endPt.x}
                y2={endPt.y}
              >
                <stop offset="0%" stopColor="#f5d76e" stopOpacity="0" />
                <stop offset="100%" stopColor="#f0a020" stopOpacity="1" />
              </linearGradient>
            );
          })}
      </defs>
      <path
        ref={measureRef}
        d={d}
        fill="none"
        stroke="url(#journey-path-grad)"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={pathLength > 0 ? pathLength : undefined}
        strokeDashoffset={strokeDashoffset}
        opacity="0.22"
      />
      <path
        d={d}
        fill="none"
        stroke="url(#journey-path-grad)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={pathLength > 0 ? pathLength : undefined}
        strokeDashoffset={strokeDashoffset}
        filter="url(#journey-glow)"
        opacity={activeId ? 0.98 : 0.9}
      />
      {pathLength > 0 &&
        lineDrawProgress >= 1 &&
        levelUpZones.map((zone, index) => {
          const start = mapLogicalPathProgress(zone.start, markerStops) * pathLength;
          const end = mapLogicalPathProgress(zone.end, markerStops) * pathLength;
          const zoneLength = Math.max(0, end - start);
          if (zoneLength <= 0) return null;
          return (
            <path
              key={`level-up-zone-${index}`}
              d={d}
              fill="none"
              stroke={`url(#journey-levelup-grad-${index})`}
              strokeWidth="3.25"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray={`${zoneLength} ${pathLength}`}
              strokeDashoffset={-start}
            />
          );
        })}
      {traveled != null && lineDrawProgress >= 1 && (
        <path
          d={d}
          fill="none"
          stroke="url(#journey-path-grad)"
          strokeWidth="3.25"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={`${traveled} ${Math.max(0, pathLength - traveled)}`}
          filter="url(#journey-glow)"
          opacity="1"
        />
      )}
    </svg>
  );
};

/** Размер цифр XP (10→20px) по прогрессу текущего движения метки 0…1. */
function getJourneyMarkerXpFontSize(travelRatio: number, min = 10, max = 20): number {
  const t = Math.max(0, Math.min(1, travelRatio));
  return min * (max / min) ** t;
}

const UserPathMarker: React.FC<{
  point: { x: number; y: number };
  isDark: boolean;
  label: string;
  xp?: number;
  markerTravelRatio?: number;
  onClick?: () => void;
}> = ({ point, isDark, label, xp = 0, markerTravelRatio = 0, onClick }) => {
  const xpFontSizePx = getJourneyMarkerXpFontSize(markerTravelRatio);

  const innerContent = (
    <>
      <span className="relative block w-3.5 h-3.5 sm:w-4 sm:h-4">
        {/* Пульсирующее кольцо */}
        <span className="absolute inset-0 animate-ping" aria-hidden="true">
          <span className="block h-full w-full rotate-45 border-2 border-[#f5d76e]/55" />
        </span>
        <span className="journey-marker-pulse absolute inset-0" aria-hidden="true">
          <span
            className="block h-full w-full rotate-45 border-2 border-[#f0d060]"
            style={{
              background:
                'linear-gradient(145deg, #fff3b0 0%, #f5d76e 42%, #d4a017 78%, #a67c00 100%)',
              boxShadow: '0 0 12px rgba(245, 215, 110, 0.85), 0 0 22px rgba(212, 160, 23, 0.45)',
            }}
          />
        </span>
      </span>
      <div className="absolute left-1/2 bottom-full mb-3.5 -translate-x-1/2 whitespace-nowrap z-20 flex flex-col items-center gap-1">
        <div
          className={`bg-transparent font-mono font-bold tracking-wider flex items-baseline justify-center gap-1 ${
            isDark ? 'text-[#f5d76e]' : 'text-[#b8860b]'
          }`}
        >
          <span
            className="inline-block"
            style={{
              fontSize: `${xpFontSizePx}px`,
              lineHeight: '1',
            }}
          >
            {xp}
          </span>
          <span className="text-[10px] font-sans font-semibold opacity-85 leading-none">XP</span>
        </div>
        <span
          className={`rounded-full px-2.5 py-0.5 text-[9px] sm:text-[10px] font-semibold tracking-[0.12em] uppercase shadow-sm transition-opacity ${
            isDark
              ? 'bg-[#0b1220]/90 text-[#f5d76e] border border-[#f5d76e]/35'
              : 'bg-white/95 text-[#b8860b] border border-[#d4a017]/40'
          }`}
        >
          {label}
        </span>
      </div>
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        className="absolute z-30 -translate-x-1/2 -translate-y-1/2 cursor-pointer bg-transparent border-0 p-3 group"
        style={{
          left: `${(point.x / 400) * 100}%`,
          top: `${(point.y / 100) * 100}%`,
        }}
      >
        {innerContent}
      </button>
    );
  }

  return (
    <div
      className="absolute z-30 -translate-x-1/2 -translate-y-1/2 p-3 group cursor-default"
      style={{
        left: `${(point.x / 400) * 100}%`,
        top: `${(point.y / 100) * 100}%`,
      }}
    >
      {innerContent}
    </div>
  );
};

const LevelNode: React.FC<{
  shape: LevelShape;
  accent: string;
  active: boolean;
  isDark: boolean;
}> = ({ shape, accent, active, isDark }) => {
  const fill = isDark ? '#070b14' : '#f4f6fa';
  const glow = active ? `0 0 16px ${accent}cc, 0 0 32px ${accent}66` : `0 0 10px ${accent}88`;

  if (shape === 'circle') {
    return (
      <span
        className="inline-block w-[1.125rem] h-[1.125rem] rounded-full border-2 transition-shadow duration-300"
        style={{ borderColor: accent, backgroundColor: fill, boxShadow: glow }}
        aria-hidden="true"
      />
    );
  }

  if (shape === 'diamond') {
    return (
      <span
        className="inline-block w-3.5 h-3.5 rotate-45 border-2 transition-shadow duration-300"
        style={{ borderColor: accent, backgroundColor: fill, boxShadow: glow }}
        aria-hidden="true"
      />
    );
  }

  if (shape === 'hexagon') {
    return (
      <span
        className="inline-flex items-center justify-center w-5 h-5 text-[1.15rem] leading-none transition-all duration-300"
        style={{ color: accent, textShadow: `0 0 14px ${accent}` }}
        aria-hidden="true"
      >
        ⬢
      </span>
    );
  }

  return (
    <span
      className="inline-flex items-center justify-center w-5 h-5 text-[1.15rem] leading-none transition-all duration-300"
      style={{ color: accent, textShadow: `0 0 14px ${accent}` }}
      aria-hidden="true"
    >
      △
    </span>
  );
};

/** Все уровни в одной ячейке grid — высота слота = самый высокий дочерний блок. */
const CompactLevelCards: React.FC<{
  levels: Array<JourneyLevel & { xp: number }>;
  activeLevelId: number;
  visibleLevelCount: number;
  isDark: boolean;
  formatMeta: (skills: number, achievements: number) => string;
  onActivate: (id: number) => void;
  onClearHover: () => void;
}> = ({
  levels,
  activeLevelId,
  visibleLevelCount,
  isDark,
  formatMeta,
  onActivate,
  onClearHover,
}) => {
  const { t } = useLanguage();
  const containerRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Array<HTMLElement | null>>([]);
  const [layoutState, setLayoutState] = useState<{
    containerWidth: number;
    cardWidths: number[];
  }>({ containerWidth: 0, cardWidths: [] });

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const measure = () => {
      const cWidth = container.offsetWidth;
      const cWidths = cardRefs.current.map((el) => el?.offsetWidth || 0);
      setLayoutState({ containerWidth: cWidth, cardWidths: cWidths });
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(container);
    cardRefs.current.forEach((el) => el && ro.observe(el));
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [levels.length]);

  const calculateLeftForIndex = (idx: number) => {
    const cWidth = layoutState.containerWidth || containerRef.current?.offsetWidth || 0;
    const cardWidth = layoutState.cardWidths[idx] || cardRefs.current[idx]?.offsetWidth || 0;

    if (!cWidth || !cardWidth) return 0;

    const centerX = cWidth * ((idx + 0.5) / 4);
    const idealLeft = centerX - cardWidth / 2;
    let left = Math.max(0, Math.min(idealLeft, cWidth - cardWidth));

    const edgePad = 12;
    if (typeof window !== 'undefined' && containerRef.current) {
      const containerRect = containerRef.current.getBoundingClientRect();
      const screenLeft = containerRect.left + left;
      const screenRight = screenLeft + cardWidth;
      if (screenLeft < edgePad) {
        left += edgePad - screenLeft;
      }
      if (screenRight > window.innerWidth - edgePad) {
        left -= screenRight - (window.innerWidth - edgePad);
      }
      left = Math.max(0, Math.min(left, cWidth - cardWidth));
    }
    return left;
  };

  return (
    // grid + одна ячейка: row sizing берёт max среди детей
    <div ref={containerRef} className="relative w-full grid">
      {levels.map((level, index) => {
        const isRevealed = level.id <= visibleLevelCount;
        const isActive = level.id === activeLevelId && isRevealed;
        const leftOffset = calculateLeftForIndex(index);
        return (
          <article
            key={level.id}
            ref={(el) => {
              cardRefs.current[index] = el;
            }}
            className={`col-start-1 row-start-1 w-max max-w-full justify-self-start rounded-2xl border px-3.5 py-4 flex flex-col gap-3 transition-all duration-300 ${
              isActive ? 'opacity-100 z-10' : 'opacity-0 pointer-events-none z-0'
            } ${
              isDark
                ? 'bg-white/[0.08] border-white/20 shadow-[0_0_24px_rgba(62,207,255,0.12)]'
                : 'bg-white border-black/10 shadow-[0_8px_28px_rgba(17,17,17,0.08)]'
            }`}
            style={{ marginLeft: leftOffset }}
            aria-hidden={!isActive}
            onMouseEnter={() => onActivate(level.id)}
            onMouseLeave={onClearHover}
          >
            <ul className="space-y-1.5">
              {level.skillKeys.map((skillKey) => (
                <li
                  key={skillKey}
                  className={`flex items-start gap-1.5 text-[11px] sm:text-xs leading-snug ${
                    isDark ? 'text-white/70' : 'text-[var(--ink-dim)]'
                  }`}
                >
                  <Check
                    className="w-3 h-3 shrink-0 mt-0.5"
                    strokeWidth={2.5}
                    style={{ color: level.accent }}
                  />
                  <span>{t(skillKey)}</span>
                </li>
              ))}
            </ul>
            <p
              className={`text-[10px] sm:text-[11px] pt-1 border-t ${
                isDark ? 'text-white/35 border-white/10' : 'text-[var(--ink-dim)]/80 border-black/8'
              }`}
            >
              {formatMeta(level.skillsCount, level.achievementsCount)}
            </p>
          </article>
        );
      })}
    </div>
  );
};

interface YourJourneySectionProps {
  skillConfig?: SkillConfig;
  userProfile?: UserProfile | null;
  animateSequence?: boolean;
  /** В личном кабинете — секция на высоту видимой области (минус нижнее меню и шапка). */
  fillViewport?: boolean;
}

export const YourJourneySection: React.FC<YourJourneySectionProps> = ({
  skillConfig = DEFAULT_SKILL_CONFIG,
  userProfile = null,
  animateSequence = true,
  fillViewport = false,
}) => {
  const { t } = useLanguage();
  const { theme } = useTheme();
  const navigate = useNavigate();
  const isDark = theme === 'dark';
  const breakpoint = useBreakpoint();
  /** Текущий уровень по XP — его подсвечиваем при авторизации. */
  const currentUserLevelId = useMemo(() => {
    if (!userProfile || userProfile.hideProgressTracking) return null;
    return calculateStudentLevel(
      userProfile.skillScores || {},
      skillConfig.items,
      skillConfig.passPercentage ?? 80
    );
  }, [userProfile, skillConfig]);

  const [hoveredLevelId, setHoveredLevelId] = useState<number | null>(null);
  const [selectedLevelId, setSelectedLevelId] = useState<number | null>(() => {
    if (currentUserLevelId != null) return currentUserLevelId;
    return breakpoint !== 'desktop' ? 1 : null;
  });

  useEffect(() => {
    if (currentUserLevelId != null) {
      setSelectedLevelId(currentUserLevelId);
    }
  }, [currentUserLevelId]);

  /** На desktop все 4 карточки в ряд; иначе — только активная. */
  const showAllCards = breakpoint === 'desktop';
  // По умолчанию — уровень пользователя (если авторизован), иначе 1 на мобильном
  const activeLevelId =
    hoveredLevelId ?? selectedLevelId ?? (showAllCards ? null : (currentUserLevelId ?? 1));

  const markerYs = LEVEL_MARKER_Y[breakpoint];
  const pathBends = LEVEL_PATH_BEND[breakpoint];
  const pathD = useMemo(
    () => buildWavyPath(LEVEL_MARKER_X, markerYs, pathBends),
    [markerYs, pathBends]
  );

  const levelXp = useMemo(
    () => getJourneyLevelXpThresholds(skillConfig.items),
    [skillConfig.items]
  );

  const levelsWithXp = useMemo(
    () => JOURNEY_LEVELS.map((level, index) => ({ ...level, xp: levelXp[index] })),
    [levelXp]
  );

  const showUserPosition = Boolean(userProfile && !userProfile.hideProgressTracking);
  const pathBlockRef = useRef<HTMLDivElement>(null);
  const hasAnimatedMarkerRef = useRef(false);
  const hasAnimatedSequenceRef = useRef(false);

  const [lineDrawProgress, setLineDrawProgress] = useState(0);
  const [visibleLevelCount, setVisibleLevelCount] = useState(0);

  const userProgress = useMemo(() => {
    if (!showUserPosition || !userProfile) return null;
    return getJourneyPathProgress(userProfile, skillConfig);
  }, [showUserPosition, userProfile, skillConfig]);

  const levelUpZones = useMemo(
    () =>
      showUserPosition ? getJourneyLevelUpZones(skillConfig.passPercentage ?? 80) : [],
    [showUserPosition, skillConfig.passPercentage]
  );

  const [markerStops, setMarkerStops] =
    useState<[number, number, number, number]>(EQUAL_MARKER_STOPS);

  useLayoutEffect(() => {
    const stops = measureMarkerStops(LEVEL_MARKER_X, markerYs, pathBends);
    if (stops) setMarkerStops(stops);
  }, [markerYs, pathBends]);

  /** Анимированный прогресс метки (0 → userProgress). */
  const [displayProgress, setDisplayProgress] = useState<number | null>(null);
  const [userPoint, setUserPoint] = useState<{ x: number; y: number } | null>(null);
  const pathSampler = useMemo(() => createPathSampler(pathD), [pathD]);

  // Последовательная анимация линии и уровней (занимает ~5 секунд) — только если animateSequence === true
  useEffect(() => {
    if (!animateSequence) {
      hasAnimatedSequenceRef.current = true;
      setLineDrawProgress(1);
      setVisibleLevelCount(4);
      return;
    }

    const block = pathBlockRef.current;
    if (!block) return;

    const reduceMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (reduceMotion) {
      hasAnimatedSequenceRef.current = true;
      setLineDrawProgress(1);
      setVisibleLevelCount(4);
      return;
    }

    if (hasAnimatedSequenceRef.current) return;

    let rafId = 0;
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];

    const startAnimation = () => {
      if (cancelled || hasAnimatedSequenceRef.current) return;
      hasAnimatedSequenceRef.current = true;

      // 1. Появление линии (0 -> 1 за 2200мс)
      const LINE_DRAW_DURATION = 2200;
      const startTime = performance.now();

      const animateLine = (now: number) => {
        if (cancelled) return;
        const elapsed = now - startTime;
        const progress = Math.min(1, elapsed / LINE_DRAW_DURATION);
        const eased =
          progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;
        setLineDrawProgress(eased);

        if (progress < 1) {
          rafId = requestAnimationFrame(animateLine);
        } else {
          setLineDrawProgress(1);
        }
      };
      rafId = requestAnimationFrame(animateLine);

      // 2. Уровни появляются один за другим за оставшиеся ~2.8 секунды (итого ~5 сек)
      timers.push(
        setTimeout(() => {
          if (!cancelled) setVisibleLevelCount(1);
        }, 2200)
      );
      timers.push(
        setTimeout(() => {
          if (!cancelled) setVisibleLevelCount(2);
        }, 2850)
      );
      timers.push(
        setTimeout(() => {
          if (!cancelled) setVisibleLevelCount(3);
        }, 3500)
      );
      timers.push(
        setTimeout(() => {
          if (!cancelled) setVisibleLevelCount(4);
        }, 4150)
      );
    };

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry && entry.isIntersecting) {
          startAnimation();
          observer.disconnect();
        }
      },
      { threshold: 0.15 }
    );

    observer.observe(block);

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      timers.forEach((t) => clearTimeout(t));
      observer.disconnect();
    };
  }, [animateSequence]);

  useEffect(() => {
    if (userProgress == null || visibleLevelCount < 4) {
      if (userProgress == null) {
        setDisplayProgress(null);
        hasAnimatedMarkerRef.current = false;
      }
      return;
    }

    if (hasAnimatedMarkerRef.current) {
      setDisplayProgress(userProgress);
      return;
    }

    hasAnimatedMarkerRef.current = true;
    setDisplayProgress(0);

    const target = userProgress;
    const durationMs = 1000 + target * 800;
    const startedAt = performance.now();
    let rafId = 0;

    const tick = (now: number) => {
      const t = Math.min(1, (now - startedAt) / durationMs);
      setDisplayProgress(target * t);
      if (t < 1) {
        rafId = requestAnimationFrame(tick);
      } else {
        setDisplayProgress(target);
      }
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [userProgress, visibleLevelCount]);

  useLayoutEffect(() => {
    if (displayProgress == null || !pathSampler) {
      setUserPoint(null);
      return;
    }
    setUserPoint(pathSampler(mapLogicalPathProgress(displayProgress, markerStops)));
  }, [pathSampler, displayProgress, markerStops]);

  const totalUserXp = useMemo(() => {
    if (!userProfile) return 0;
    return calculateSkillProgress(userProfile.skillScores || {}, skillConfig.items).overall.earned;
  }, [userProfile, skillConfig.items]);

  const animatedXp = useMemo(() => {
    if (displayProgress == null || userProgress == null || userProgress <= 0) {
      return totalUserXp;
    }
    const t = Math.min(1, Math.max(0, displayProgress / userProgress));
    return Math.round(totalUserXp * t);
  }, [displayProgress, userProgress, totalUserXp]);

  /** 0…1 — доля пройденного пути в текущей анимации метки (для размера XP). */
  const markerTravelRatio = useMemo(() => {
    if (displayProgress == null || userProgress == null || userProgress <= 0) {
      return userProgress != null && userProgress <= 0 ? 1 : 0;
    }
    return Math.min(1, Math.max(0, displayProgress / userProgress));
  }, [displayProgress, userProgress]);

  const formatMeta = (skills: number, achievements: number) =>
    t('journeyLevelMeta')
      .replace('{skills}', String(skills))
      .replace('{achievements}', String(achievements));

  const bgUrl = isDark ? JOURNEY_BG.dark : JOURNEY_BG.light;

  const activateLevel = (levelId: number) => {
    setHoveredLevelId(levelId);
    // После наведения блок остаётся подсвеченным (как после клика)
    setSelectedLevelId(levelId);
  };

  const clearHover = () => {
    setHoveredLevelId(null);
  };

  const selectLevel = (levelId: number) => {
    setSelectedLevelId(levelId);
  };

  return (
    <section
      id="your-journey"
      className={`relative overflow-hidden border-y ${
        isDark ? 'bg-[#070b14] border-white/5' : 'bg-[#eef1f5] border-black/5'
      } ${fillViewport ? 'cabinet-journey-fill' : ''}`}
    >
      <img
        src={bgUrl}
        alt=""
        className="absolute inset-0 w-full h-full object-cover pointer-events-none select-none"
        draggable={false}
        aria-hidden="true"
      />
      <div
        className={`absolute inset-0 pointer-events-none ${
          isDark
            ? 'bg-gradient-to-b from-[#070b14]/55 via-transparent to-[#070b14]/88'
            : 'bg-gradient-to-b from-[#eef1f5]/50 via-transparent to-[#eef1f5]/85'
        }`}
        aria-hidden="true"
      />

      <div
        className={`relative z-10 max-w-5xl mx-auto px-5 sm:px-8 md:px-10 w-full ${
          fillViewport
            ? 'flex-1 flex flex-col justify-center min-h-0 py-6 sm:py-8 md:py-10 gap-6 sm:gap-8 md:gap-10'
            : 'py-14 md:py-20 space-y-10 md:space-y-12'
        }`}
      >
        <header className="text-center space-y-3 max-w-2xl mx-auto">
          <p
            className={`text-[11px] sm:text-xs font-medium tracking-[0.22em] uppercase ${
              isDark ? 'text-[#7ec8ff]' : 'text-[var(--accent)]'
            }`}
          >
            {t('journeyEyebrow')}
          </p>
          <h2
            className={`font-serif text-2xl sm:text-3xl md:text-4xl font-light tracking-tight leading-tight ${
              isDark ? 'text-white' : 'text-[var(--ink)]'
            }`}
          >
            {t('journeyTitle')}
          </h2>
          <div
            className={`space-y-0.5 text-sm leading-relaxed ${
              isDark ? 'text-white/55' : 'text-[var(--ink-dim)]'
            }`}
          >
            <p>{t('journeyDesc1')}</p>
            <p>{t('journeyDesc2')}</p>
          </div>
        </header>

        <div
          ref={pathBlockRef}
          className={
            fillViewport
              ? 'relative flex-1 flex flex-col justify-center min-h-0 space-y-3 sm:space-y-4'
              : 'relative space-y-4'
          }
        >
          {/* Полоса пути: метки + волнистая линия */}
          <div
            className={
              fillViewport
                ? 'relative w-full flex-1 min-h-[7.5rem] max-h-[11rem] sm:max-h-[13rem] md:max-h-[15rem]'
                : 'relative w-full h-36 sm:h-44 md:h-52'
            }
          >
            <JourneyPath
              ys={markerYs}
              bends={pathBends}
              activeId={activeLevelId}
              progress={displayProgress}
              lineDrawProgress={lineDrawProgress}
              levelUpZones={levelUpZones}
              markerStops={markerStops}
            />

            {userPoint && userProfile && displayProgress != null && (
              <UserPathMarker
                point={userPoint}
                isDark={isDark}
                label={t('journeyYouAreHere')}
                xp={animatedXp}
                markerTravelRatio={markerTravelRatio}
                onClick={
                  animateSequence ? () => navigate(getDefaultWorkspacePath(userProfile)) : undefined
                }
              />
            )}

            <div className="absolute inset-0 grid grid-cols-4">
              {levelsWithXp.map((level, index) => {
                const isActive = activeLevelId === level.id;
                const topPct = markerYs[index];
                const isRevealed = level.id <= visibleLevelCount;
                const showDropLine = showAllCards || isActive;
                return (
                  <div key={level.id} className="relative flex justify-center">
                    {showDropLine && (
                      <div
                        className={`absolute w-px border-l border-dashed transition-opacity duration-500 ${
                          isDark ? 'border-white/25' : 'border-black/15'
                        } ${isRevealed ? 'opacity-100' : 'opacity-0'}`}
                        style={{ top: `${topPct}%`, bottom: 0, left: '50%' }}
                        aria-hidden="true"
                      />
                    )}
                    <button
                      type="button"
                      className={`absolute -translate-x-1/2 -translate-y-1/2 left-1/2 z-10 bg-transparent border-0 p-3 cursor-pointer transition-all duration-500 transform ${
                        isRevealed
                          ? 'opacity-100 scale-100'
                          : 'opacity-0 scale-50 pointer-events-none'
                      }`}
                      style={{ top: `${topPct}%` }}
                      aria-label={t(level.labelKey)}
                      aria-pressed={isActive}
                      onMouseEnter={() => activateLevel(level.id)}
                      onMouseLeave={clearHover}
                      onFocus={() => activateLevel(level.id)}
                      onBlur={clearHover}
                      onClick={() => selectLevel(level.id)}
                    >
                      <LevelNode
                        shape={level.shape}
                        accent={level.accent}
                        active={isActive}
                        isDark={isDark}
                      />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/*
            Название + XP.
            Desktop: все карточки с навыками в ряд.
            Mobile/tablet: одна карточка под активной меткой, clamped в видимую область.
          */}
          <div className="grid grid-cols-4 gap-2 sm:gap-3 md:gap-4">
            {levelsWithXp.map((level) => {
              const isActive = activeLevelId === level.id;
              const isRevealed = level.id <= visibleLevelCount;
              return (
                <div
                  key={level.id}
                  className={`min-w-0 text-center space-y-0.5 px-0.5 transition-all duration-500 transform ${
                    isRevealed
                      ? 'opacity-100 translate-y-0'
                      : 'opacity-0 translate-y-3 pointer-events-none'
                  }`}
                  onMouseEnter={() => activateLevel(level.id)}
                  onMouseLeave={clearHover}
                >
                  <h3
                    className={`text-[10px] sm:text-xs md:text-sm font-semibold tracking-[0.08em] sm:tracking-[0.12em] uppercase ${
                      isDark ? 'text-white' : 'text-[var(--ink)]'
                    } ${isActive ? 'opacity-100' : 'opacity-80'}`}
                  >
                    {t(level.labelKey)}
                  </h3>
                  <p className="text-[11px] sm:text-xs font-medium" style={{ color: level.accent }}>
                    {level.xp} {t('journeyXp')}
                  </p>
                </div>
              );
            })}
          </div>

          {showAllCards ? (
            <div className="grid grid-cols-4 gap-3 sm:gap-4 items-end">
              {levelsWithXp.map((level) => {
                const isActive = activeLevelId === level.id;
                const isRevealed = level.id <= visibleLevelCount;
                return (
                  <article
                    key={level.id}
                    onMouseEnter={() => activateLevel(level.id)}
                    onMouseLeave={clearHover}
                    className={`w-full min-w-0 rounded-2xl border px-3.5 py-4 md:px-4 md:py-5 flex flex-col gap-3 transition-all duration-500 transform ${
                      isRevealed
                        ? 'opacity-100 translate-y-0'
                        : 'opacity-0 translate-y-4 pointer-events-none'
                    } ${
                      isDark
                        ? isActive
                          ? 'bg-white/[0.08] border-white/20 shadow-[0_0_24px_rgba(62,207,255,0.12)]'
                          : 'bg-black/35 border-white/10 backdrop-blur-[2px]'
                        : isActive
                          ? 'bg-white border-black/10 shadow-[0_8px_28px_rgba(17,17,17,0.08)]'
                          : 'bg-white/75 border-black/8'
                    }`}
                  >
                    <ul className="space-y-1.5">
                      {level.skillKeys.map((skillKey) => (
                        <li
                          key={skillKey}
                          className={`flex items-start gap-1.5 text-xs leading-snug ${
                            isDark ? 'text-white/70' : 'text-[var(--ink-dim)]'
                          }`}
                        >
                          <Check
                            className="w-3 h-3 shrink-0 mt-0.5"
                            strokeWidth={2.5}
                            style={{ color: level.accent }}
                          />
                          <span>{t(skillKey)}</span>
                        </li>
                      ))}
                    </ul>
                    <p
                      className={`text-[11px] pt-1 border-t ${
                        isDark
                          ? 'text-white/35 border-white/10'
                          : 'text-[var(--ink-dim)]/80 border-black/8'
                      }`}
                    >
                      {formatMeta(level.skillsCount, level.achievementsCount)}
                    </p>
                  </article>
                );
              })}
            </div>
          ) : (
            activeLevelId != null && (
              <CompactLevelCards
                levels={levelsWithXp}
                activeLevelId={activeLevelId}
                visibleLevelCount={visibleLevelCount}
                isDark={isDark}
                formatMeta={formatMeta}
                onActivate={activateLevel}
                onClearHover={clearHover}
              />
            )
          )}
        </div>

        {!userProfile && (
          <ul
            className={`flex flex-wrap items-center justify-center gap-x-6 gap-y-3 sm:gap-x-8 rounded-2xl border px-5 py-4 sm:px-8 transition-all duration-700 transform ${
              visibleLevelCount >= 4
                ? 'opacity-100 translate-y-0'
                : 'opacity-0 translate-y-4 pointer-events-none'
            } ${
              isDark
                ? 'border-white/10 bg-black/30 text-white/70 backdrop-blur-[2px]'
                : 'border-black/8 bg-white/80 text-[var(--ink-dim)]'
            }`}
          >
            {SUMMARY_STATS.map(({ key, icon: Icon }) => (
              <li key={key} className="inline-flex items-center gap-2 text-xs sm:text-sm">
                <Icon
                  className={`w-3.5 h-3.5 shrink-0 ${isDark ? 'text-[#7ec8ff]' : 'text-[var(--accent)]'}`}
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
                <span>{t(key)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
};
