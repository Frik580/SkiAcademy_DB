import React, { useLayoutEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../../../app/providers/LanguageContext';
import { getDefaultWorkspacePath } from '../../../lib/workspaceRoutes';
import type { UserProfile } from '../../../types';
import { EQUAL_MARKER_STOPS, LEVEL_MARKER_X } from './constants';
import { buildWavyPath, getJourneyMarkerXpFontSize, mapLogicalPathProgress } from './journeyUtils';
import type {
  JourneyEarnedSkill,
  JourneyLevel,
  JourneyMarkerParticipantInput,
  LevelShape,
  PathBend,
} from './types';
import { ParticipantAvatarFace } from '../../student-cabinet/components/CabinetParticipantAvatarSwitcher';

export const JourneyPath: React.FC<{
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
  const measureRef = React.useRef<SVGPathElement>(null);
  const [pathLength, setPathLength] = useState(0);

  useLayoutEffect(() => {
    const el = measureRef.current;
    if (!el) return;
    setPathLength(el.getTotalLength());
  }, [d]);

  const mappedProgress = progress != null ? mapLogicalPathProgress(progress, markerStops) : null;
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
      className="journey-path absolute inset-0 w-full h-full overflow-visible"
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
            // Нелинейный рост прозрачности 0→1 (ease-out) — усиливается раньше
            const opacityStops = [0, 0.15, 0.3, 0.45, 0.6, 0.8, 1].map((t) => ({
              offset: `${t * 100}%`,
              opacity: 1 - (1 - t) ** 2,
              color: t < 0.5 ? '#f5d76e' : '#f0a020',
            }));
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
                {opacityStops.map((stop) => (
                  <stop
                    key={stop.offset}
                    offset={stop.offset}
                    stopColor={stop.color}
                    stopOpacity={stop.opacity}
                  />
                ))}
              </linearGradient>
            );
          })}
      </defs>
      <path
        ref={measureRef}
        className="journey-track-halo"
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
        className="journey-track"
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
              className="journey-level-up-zone"
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
          className="journey-traveled"
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

export const UserPathMarker: React.FC<{
  participant?: JourneyMarkerParticipantInput;
  accent?: string;
  point: { x: number; y: number };
  isDark: boolean;
  label: string;
  xp?: number;
  markerTravelRatio?: number;
  onClick?: () => void;
}> = ({
  point,
  isDark,
  label,
  xp = 0,
  markerTravelRatio = 0,
  onClick,
  participant,
  accent = '#f0d060',
}) => {
  const xpFontSizePx = getJourneyMarkerXpFontSize(markerTravelRatio);

  const innerContent = (
    <>
      {participant ? (
        <span
          className="ui-avatar relative block h-7 w-7 shrink-0 overflow-hidden rounded-full border-2 sm:h-8 sm:w-8"
          style={{ borderColor: accent, boxShadow: `0 0 0 2px ${isDark ? '#0b1220' : '#fff'}` }}
          role="img"
          aria-label={participant.displayName}
          title={participant.displayName}
        >
          <ParticipantAvatarFace url={participant.avatarUrl} name={participant.displayName} />
        </span>
      ) : (
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
      )}
      <div className="journey-marker-caption absolute left-1/2 bottom-full mb-3.5 -translate-x-1/2 whitespace-nowrap z-20 flex flex-col items-center gap-1">
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
        data-caption-align={point.x >= 250 ? 'end' : 'start'}
        onClick={onClick}
        aria-label={participant ? `${label}: ${participant.displayName}` : label}
        className="journey-user-marker absolute z-30 -translate-x-1/2 -translate-y-1/2 cursor-pointer bg-transparent border-0 p-3 group"
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
      data-caption-align={point.x >= 250 ? 'end' : 'start'}
      className="journey-user-marker absolute z-30 -translate-x-1/2 -translate-y-1/2 p-3 group cursor-default"
      style={{
        left: `${(point.x / 400) * 100}%`,
        top: `${(point.y / 100) * 100}%`,
      }}
    >
      {innerContent}
    </div>
  );
};

export const LevelNode: React.FC<{
  shape: LevelShape;
  accent: string;
  active: boolean;
  current?: boolean;
  isDark: boolean;
}> = ({ shape, accent, active, current = false, isDark }) => {
  const fill = isDark ? '#070b14' : '#f4f6fa';
  const emphasized = active || current;
  const glow = current
    ? `0 0 18px ${accent}ee, 0 0 36px ${accent}99, 0 0 8px ${accent}`
    : emphasized
      ? `0 0 16px ${accent}cc, 0 0 32px ${accent}66`
      : `0 0 10px ${accent}88`;
  const borderWidth = current ? 3 : 2;
  const scaleClass = current ? 'scale-125' : '';

  if (shape === 'circle') {
    return (
      <span
        className={`inline-block w-[1.125rem] h-[1.125rem] rounded-full transition-all duration-300 ${scaleClass}`}
        style={{
          borderColor: accent,
          borderWidth,
          borderStyle: 'solid',
          backgroundColor: fill,
          boxShadow: glow,
        }}
        aria-hidden="true"
      />
    );
  }

  if (shape === 'diamond') {
    return (
      <span
        className={`inline-block w-3.5 h-3.5 rotate-45 transition-all duration-300 ${scaleClass}`}
        style={{
          borderColor: accent,
          borderWidth,
          borderStyle: 'solid',
          backgroundColor: current ? accent : fill,
          boxShadow: glow,
        }}
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

export const JourneyPathStrip: React.FC<{
  isCabinet?: boolean;
  markerParticipant?: JourneyMarkerParticipantInput;
  effectiveFillViewport: boolean;
  markerYs: [number, number, number, number];
  pathBends: [PathBend, PathBend, PathBend];
  activeLevelId: number | null;
  displayProgress: number | null;
  lineDrawProgress: number;
  levelUpZones: Array<{ start: number; end: number }>;
  markerStops: [number, number, number, number];
  userPoint: { x: number; y: number } | null;
  userProfile: UserProfile | null;
  animatedXp: number;
  markerTravelRatio: number;
  animateSequence: boolean;
  levelsWithXp: Array<JourneyLevel & { xp: number }>;
  showUserPosition: boolean;
  earnedSkillsByLevel: Record<number, JourneyEarnedSkill[]>;
  isCompactJourneyLayout: boolean;
  showAllCards: boolean;
  currentUserLevelId: number | null;
  visibleLevelCount: number;
  isDark: boolean;
  activateLevel: (levelId: number) => void;
  clearHover: () => void;
  selectLevel: (levelId: number) => void;
}> = ({
  isCabinet = false,
  markerParticipant,
  effectiveFillViewport,
  markerYs,
  pathBends,
  activeLevelId,
  displayProgress,
  lineDrawProgress,
  levelUpZones,
  markerStops,
  userPoint,
  userProfile,
  animatedXp,
  markerTravelRatio,
  animateSequence,
  levelsWithXp,
  showUserPosition,
  earnedSkillsByLevel,
  isCompactJourneyLayout,
  showAllCards,
  currentUserLevelId,
  visibleLevelCount,
  isDark,
  activateLevel,
  clearHover,
  selectLevel,
}) => {
  const { t } = useLanguage();
  const navigate = useNavigate();

  return (
    <div className="journey-path-strip flex flex-col gap-4 sm:gap-5 md:gap-6 shrink-0">
      {/* Полоса пути: метки + волнистая линия */}
      <div
        className={`journey-rail ${
          effectiveFillViewport
            ? 'relative w-full h-40 sm:h-48 md:h-52 shrink-0'
            : 'relative w-full h-48 sm:h-56 md:h-64 shrink-0'
        }`}
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
            participant={markerParticipant}
            accent={levelsWithXp.find((level) => level.id === currentUserLevelId)?.accent}
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
            const earnedSkills = showUserPosition ? (earnedSkillsByLevel[level.id] ?? []) : null;
            const isLocked =
              isCompactJourneyLayout && showUserPosition && (earnedSkills?.length ?? 0) === 0;
            const isActive = activeLevelId === level.id;
            const isCurrent = currentUserLevelId === level.id;
            const topPct = markerYs[index];
            const isRevealed = level.id <= visibleLevelCount;
            const showDropLine = showAllCards || isActive || isCurrent;
            return (
              <div key={level.id} className="relative flex justify-center">
                {showDropLine && (
                  <div
                    className={`journey-drop-line absolute w-px border-l border-dashed transition-opacity duration-500 ${
                      isDark ? 'border-white/25' : 'border-black/15'
                    } ${isRevealed ? 'opacity-100' : 'opacity-0'} ${
                      isCurrent ? (isDark ? 'border-[#f5d76e]/50' : 'border-[#d4a017]/45') : ''
                    }`}
                    style={{ top: `${topPct}%`, bottom: 0, left: '50%' }}
                    aria-hidden="true"
                  />
                )}
                <button
                  data-journey-state={
                    isCurrent
                      ? 'current'
                      : currentUserLevelId != null && level.id < currentUserLevelId
                        ? 'passed'
                        : 'upcoming'
                  }
                  type="button"
                  className={`journey-stage-node absolute -translate-x-1/2 -translate-y-1/2 left-1/2 z-10 bg-transparent border-0 p-3 transition-all duration-500 transform ${
                    isRevealed ? 'opacity-100 scale-100' : 'opacity-0 scale-50 pointer-events-none'
                  } ${isLocked ? 'cursor-default pointer-events-none' : 'cursor-pointer'}`}
                  style={{ top: `${topPct}%` }}
                  aria-label={t(level.labelKey)}
                  aria-pressed={isActive || isCurrent}
                  aria-current={isCurrent ? 'step' : undefined}
                  aria-disabled={isLocked || undefined}
                  onMouseEnter={() => !isLocked && activateLevel(level.id)}
                  onMouseLeave={clearHover}
                  onFocus={() => !isLocked && activateLevel(level.id)}
                  onBlur={clearHover}
                  onClick={() => !isLocked && selectLevel(level.id)}
                >
                  <LevelNode
                    shape={isCabinet ? 'circle' : level.shape}
                    accent={level.accent}
                    active={isActive}
                    current={isCurrent}
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
      <div className="journey-stage-labels grid grid-cols-4 gap-2 sm:gap-3 md:gap-4 shrink-0">
        {levelsWithXp.map((level) => {
          const earnedSkills = showUserPosition ? (earnedSkillsByLevel[level.id] ?? []) : null;
          const isLocked =
            isCompactJourneyLayout && showUserPosition && (earnedSkills?.length ?? 0) === 0;
          const isActive = activeLevelId === level.id;
          const isCurrent = currentUserLevelId === level.id;
          const isRevealed = level.id <= visibleLevelCount;
          return (
            <div
              key={level.id}
              className={`min-w-0 text-center space-y-0.5 px-0.5 transition-all duration-500 transform ${
                isCompactJourneyLayout ? 'min-h-[3.25rem] sm:min-h-[3.5rem]' : ''
              } ${
                isRevealed
                  ? 'opacity-100 translate-y-0'
                  : 'opacity-0 translate-y-3 pointer-events-none'
              } ${isLocked ? 'pointer-events-none cursor-default' : ''}`}
              onMouseEnter={() => !isLocked && activateLevel(level.id)}
              onMouseLeave={clearHover}
            >
              <h3
                className={`sm:text-xs md:text-sm font-semibold tracking-[0.08em] sm:tracking-[0.12em] uppercase transition-opacity ${
                  isCurrent
                    ? isDark
                      ? 'text-[#f5d76e]'
                      : 'text-[#b8860b]'
                    : isDark
                      ? 'text-white'
                      : 'text-[var(--ink)]'
                } ${isCurrent ? 'opacity-100' : isActive ? 'opacity-100' : 'opacity-55'}`}
              >
                {t(level.labelKey)}
              </h3>
              <p
                className={`sm:text-xs font-medium ${
                  isCurrent ? (isDark ? 'text-[#f5d76e]' : 'text-[#b8860b]') : ''
                }`}
                style={isCurrent ? undefined : { color: level.accent }}
              >
                {level.xp} {t('journeyXp')}
              </p>
              {isCurrent && (
                <p
                  className={`text-[9px] sm:text-[10px] font-semibold tracking-[0.14em] uppercase ${
                    isDark ? 'text-[#f5d76e]/80' : 'text-[#b8860b]/90'
                  }`}
                >
                  {t('journeyCurrentLevel')}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
