import React, { useLayoutEffect, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import { useLanguage } from '../../../app/providers/LanguageContext';
import type { JourneyEarnedSkill, JourneyLevel } from './types';

export const LevelCardBody: React.FC<{
  level: JourneyLevel;
  isDark: boolean;
  earnedSkills?: JourneyEarnedSkill[] | null;
  onOpenDevelopment?: () => void;
  formatMeta: (skills: number, achievements: number) => string;
  compact?: boolean;
  scrollSkills?: boolean;
}> = ({
  level,
  isDark,
  earnedSkills,
  onOpenDevelopment,
  formatMeta,
  compact = false,
  scrollSkills = false,
}) => {
  const { t } = useLanguage();
  const showEarned = earnedSkills != null;
  const pinFooter = Boolean(onOpenDevelopment);
  const stretchLayout = scrollSkills || pinFooter;

  return (
    <div
      className={`flex flex-col gap-3 ${
        stretchLayout ? `h-full min-h-0 flex-1 ${scrollSkills ? 'overflow-hidden' : ''}` : ''
      }`}
    >
      <div
        className={`${stretchLayout ? 'min-h-0 flex-1' : ''} ${
          scrollSkills ? 'overflow-y-auto overscroll-contain touch-pan-y' : ''
        }`}
        data-journey-skills-scroll={scrollSkills ? '' : undefined}
      >
        {showEarned ? (
          earnedSkills.length > 0 ? (
            <ul className="space-y-1.5">
              {earnedSkills.map((skill) => (
                <li
                  key={skill.id}
                  className={`flex items-start gap-1.5 ${
                    compact ? 'sm:text-xs' : 'text-xs'
                  } leading-snug ${isDark ? 'text-white/70' : 'text-[var(--ink-dim)]'}`}
                >
                  <Check
                    className="w-3 h-3 shrink-0 mt-0.5"
                    strokeWidth={2.5}
                    style={{ color: level.accent }}
                  />
                  <span>{skill.title}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p
              className={`${compact ? 'sm:text-xs' : 'text-xs'} leading-snug ${
                isDark ? 'text-white/40' : 'text-[var(--ink-dim)]/70'
              }`}
            >
              {t('journeyNoEarnedSkills')}
            </p>
          )
        ) : (
          <ul className="space-y-1.5">
            {level.skillKeys.map((skillKey) => (
              <li
                key={skillKey}
                className={`flex items-start gap-1.5 ${
                  compact ? 'sm:text-xs' : 'text-xs'
                } leading-snug ${isDark ? 'text-white/70' : 'text-[var(--ink-dim)]'}`}
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
        )}
      </div>

      {onOpenDevelopment ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpenDevelopment();
          }}
          className={`mt-auto w-full shrink-0 pt-1 border-t text-left sm:text-xs font-medium transition-colors inline-flex items-center gap-1 ${
            isDark
              ? 'border-white/10 text-[#7ec8ff] hover:text-white'
              : 'border-black/8 text-[var(--accent)] hover:text-[var(--ink)]'
          }`}
        >
          {t('scMoreDetails')}
          <span aria-hidden>→</span>
        </button>
      ) : (
        <p
          className={`shrink-0 ${compact ? 'text-[10px] sm:text-[11px]' : 'text-[11px]'} pt-1 border-t ${
            isDark ? 'text-white/35 border-white/10' : 'text-[var(--ink-dim)]/80 border-black/8'
          }`}
        >
          {formatMeta(level.skillsCount, level.achievementsCount)}
        </p>
      )}
    </div>
  );
};

/** Все уровни в одной ячейке grid — высота слота = самый высокий дочерний блок. */
export const CompactLevelCards: React.FC<{
  levels: Array<JourneyLevel & { xp: number }>;
  activeLevelId: number;
  visibleLevelCount: number;
  isDark: boolean;
  formatMeta: (skills: number, achievements: number) => string;
  earnedSkillsByLevel: Record<number, JourneyEarnedSkill[]>;
  onOpenDevelopment?: () => void;
  onActivate: (id: number) => void;
  onClearHover: () => void;
  fillViewport?: boolean;
}> = ({
  levels,
  activeLevelId,
  visibleLevelCount,
  isDark,
  formatMeta,
  earnedSkillsByLevel,
  onOpenDevelopment,
  onActivate,
  onClearHover,
  fillViewport = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Array<HTMLElement | null>>([]);
  const [layoutState, setLayoutState] = useState<{
    containerWidth: number;
    cardWidths: number[];
  }>({ containerWidth: 0, cardWidths: [] });
  const [lockedHeight, setLockedHeight] = useState(0);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const measure = () => {
      const cWidth = container.offsetWidth;
      const maxH = Math.max(0, ...cardRefs.current.map((el) => el?.offsetHeight ?? 0));
      if (maxH > 0 && !fillViewport) {
        setLockedHeight((prev) => Math.max(prev, maxH));
      }
      setLayoutState({
        containerWidth: cWidth,
        cardWidths: cardRefs.current.map((el) => el?.offsetWidth || 0),
      });
    };

    measure();
    requestAnimationFrame(measure);
    const ro = new ResizeObserver(measure);
    ro.observe(container);
    cardRefs.current.forEach((el) => el && ro.observe(el));
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [levels.length, earnedSkillsByLevel, fillViewport]);

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
    <div
      ref={containerRef}
      className={`relative w-full min-w-0 ${
        fillViewport
          ? 'grid h-full min-h-0 grid-rows-[minmax(0,1fr)] overflow-hidden'
          : 'grid h-full'
      }`}
      style={
        !fillViewport && lockedHeight > 0
          ? { minHeight: lockedHeight, height: lockedHeight }
          : undefined
      }
    >
      {levels.map((level, index) => {
        const earnedSkills = onOpenDevelopment ? (earnedSkillsByLevel[level.id] ?? []) : null;
        const isEmpty = Boolean(onOpenDevelopment && (earnedSkills?.length ?? 0) === 0);
        const isRevealed = level.id <= visibleLevelCount;
        const isActive = !isEmpty && level.id === activeLevelId && isRevealed;
        const leftOffset = calculateLeftForIndex(index);
        return (
          <article
            key={level.id}
            ref={(el) => {
              cardRefs.current[index] = el;
            }}
            className={`col-start-1 row-start-1 w-max max-w-[min(100%,20rem)] justify-self-start rounded-2xl border px-3.5 py-4 flex flex-col min-w-0 transition-all duration-300 ${
              fillViewport ? 'h-full max-h-full min-h-0 overflow-hidden' : 'h-full'
            } ${
              isEmpty
                ? 'invisible opacity-0 pointer-events-none z-0'
                : isActive
                  ? 'opacity-100 z-10'
                  : 'opacity-0 pointer-events-none z-0'
            } ${
              isDark
                ? 'bg-white/[0.08] border-white/20 shadow-[0_0_24px_rgba(62,207,255,0.12)]'
                : 'bg-white border-black/10 shadow-[0_8px_28px_rgba(17,17,17,0.08)]'
            }`}
            style={{ marginLeft: leftOffset }}
            aria-hidden={isEmpty || !isActive}
            onMouseEnter={() => !isEmpty && onActivate(level.id)}
            onMouseLeave={onClearHover}
          >
            <LevelCardBody
              level={level}
              isDark={isDark}
              earnedSkills={earnedSkills}
              onOpenDevelopment={onOpenDevelopment}
              formatMeta={formatMeta}
              compact
              scrollSkills={fillViewport}
            />
          </article>
        );
      })}
    </div>
  );
};

export const DesktopSkillCards: React.FC<{
  levelsWithXp: Array<JourneyLevel & { xp: number }>;
  activeLevelId: number | null;
  currentUserLevelId: number | null;
  visibleLevelCount: number;
  effectiveFillViewport: boolean;
  isDark: boolean;
  showUserPosition: boolean;
  earnedSkillsByLevel: Record<number, JourneyEarnedSkill[]>;
  onOpenDevelopment?: () => void;
  formatMeta: (skills: number, achievements: number) => string;
  activateLevel: (levelId: number) => void;
  clearHover: () => void;
}> = ({
  levelsWithXp,
  activeLevelId,
  currentUserLevelId,
  visibleLevelCount,
  effectiveFillViewport,
  isDark,
  showUserPosition,
  earnedSkillsByLevel,
  onOpenDevelopment,
  formatMeta,
  activateLevel,
  clearHover,
}) => (
  <div
    className={`grid grid-cols-4 gap-3 sm:gap-4 items-stretch min-w-0 w-full ${
      effectiveFillViewport ? 'flex-1 min-h-0 overflow-hidden grid-rows-[minmax(0,1fr)]' : ''
    }`}
  >
    {levelsWithXp.map((level) => {
      const isActive = activeLevelId === level.id;
      const isCurrent = currentUserLevelId === level.id;
      const isRevealed = level.id <= visibleLevelCount;
      const isHighlighted = isCurrent || isActive;
      const earnedSkills = showUserPosition ? (earnedSkillsByLevel[level.id] ?? []) : null;
      const isEmpty = Boolean(showUserPosition && (earnedSkills?.length ?? 0) === 0);
      return (
        <article
          key={level.id}
          onMouseEnter={() => !isEmpty && activateLevel(level.id)}
          onMouseLeave={clearHover}
          className={`w-full min-w-0 rounded-2xl border px-3.5 py-4 md:px-4 md:py-5 flex flex-col transition-all duration-500 transform ${
            effectiveFillViewport ? 'h-full min-h-0 overflow-hidden' : 'h-full'
          } ${
            isEmpty
              ? 'invisible opacity-0 pointer-events-none'
              : isRevealed
                ? 'opacity-100 translate-y-0'
                : 'opacity-0 translate-y-4 pointer-events-none'
          } ${
            isDark
              ? isCurrent
                ? 'bg-white/[0.1] border-[#f5d76e]/45 shadow-[0_0_24px_rgba(245,215,110,0.18)]'
                : isHighlighted
                  ? 'bg-white/[0.08] border-white/20 shadow-[0_0_24px_rgba(62,207,255,0.12)]'
                  : 'bg-black/35 border-white/10 backdrop-blur-[2px]'
              : isCurrent
                ? 'bg-white border-[#d4a017]/45 shadow-[0_8px_28px_rgba(212,160,23,0.14)]'
                : isHighlighted
                  ? 'bg-white border-black/10 shadow-[0_8px_28px_rgba(17,17,17,0.08)]'
                  : 'bg-white/75 border-black/8'
          }`}
        >
          <LevelCardBody
            level={level}
            isDark={isDark}
            earnedSkills={earnedSkills}
            onOpenDevelopment={showUserPosition ? onOpenDevelopment : undefined}
            formatMeta={formatMeta}
            scrollSkills={effectiveFillViewport}
          />
        </article>
      );
    })}
  </div>
);

export const MobileSkillCards: React.FC<{
  activeLevelId: number | null;
  levelsWithXp: Array<JourneyLevel & { xp: number }>;
  visibleLevelCount: number;
  effectiveFillViewport: boolean;
  isDark: boolean;
  formatMeta: (skills: number, achievements: number) => string;
  earnedSkillsByLevel: Record<number, JourneyEarnedSkill[]>;
  onOpenDevelopment?: () => void;
  activateLevel: (levelId: number) => void;
  clearHover: () => void;
}> = ({
  activeLevelId,
  levelsWithXp,
  visibleLevelCount,
  effectiveFillViewport,
  isDark,
  formatMeta,
  earnedSkillsByLevel,
  onOpenDevelopment,
  activateLevel,
  clearHover,
}) => {
  if (activeLevelId == null) return null;

  return (
    <div
      className={`relative min-w-0 w-full hidden sm:block ${
        effectiveFillViewport ? 'flex-1 min-h-0 overflow-hidden' : 'shrink-0'
      }`}
    >
      <CompactLevelCards
        levels={levelsWithXp}
        activeLevelId={activeLevelId}
        visibleLevelCount={visibleLevelCount}
        isDark={isDark}
        formatMeta={formatMeta}
        earnedSkillsByLevel={earnedSkillsByLevel}
        onOpenDevelopment={onOpenDevelopment}
        onActivate={activateLevel}
        onClearHover={clearHover}
        fillViewport={effectiveFillViewport}
      />
    </div>
  );
};
