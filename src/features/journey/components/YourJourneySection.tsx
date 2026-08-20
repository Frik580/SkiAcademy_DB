import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  DEFAULT_SKILL_CONFIG,
  calculateSkillProgress,
  calculateStudentLevel,
  getJourneyLevelXpThresholds,
} from '../../../domain/achievements';
import { useLanguage } from '../../../app/providers/LanguageContext';
import { useTheme } from '../../../hooks/useTheme';
import { AchievementGrid } from './AchievementGrid';
import {
  EQUAL_MARKER_STOPS,
  JOURNEY_BG,
  JOURNEY_LEVELS,
  LEVEL_MARKER_X,
  LEVEL_MARKER_Y,
  LEVEL_PATH_BEND,
} from './constants';
import { JourneyPathStrip } from './JourneyProgress';
import {
  buildWavyPath,
  createPathSampler,
  getFirstUnlockedJourneyLevelId,
  getJourneyLevelUpZones,
  getJourneyPathProgress,
  getTopEarnedSkillsForJourneyLevel,
  isJourneyLevelUnlocked,
  mapLogicalPathProgress,
  measureMarkerStops,
  resolveCompactJourneyActiveLevel,
} from './journeyUtils';
import { MobileSkillCards, DesktopSkillCards } from './SkillTree';
import { TrainingStreak } from './TrainingStreak';
import type { JourneyEarnedSkill, YourJourneySectionProps } from './types';
import { useBreakpoint } from './useBreakpoint';
import { useCabinetJourneyLayout } from './useCabinetJourneyLayout';
import { optimizedImageUrl } from '../../../lib/optimizedImageUrl';

export const YourJourneySection: React.FC<YourJourneySectionProps> = ({
  skillConfig = DEFAULT_SKILL_CONFIG,
  userProfile = null,
  animateSequence = true,
  fillViewport = false,
  onOpenDevelopment,
}) => {
  const { t, language } = useLanguage();
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const breakpoint = useBreakpoint();
  const showAllCards = breakpoint === 'desktop';
  const isCompactJourneyLayout = !showAllCards;
  const showUserPosition = Boolean(userProfile && !userProfile.hideProgressTracking);
  /** Текущий уровень по XP — его подсвечиваем при авторизации. */
  const currentUserLevelId = useMemo(() => {
    if (!userProfile || userProfile.hideProgressTracking) return null;
    return calculateStudentLevel(
      userProfile.skillScores || {},
      skillConfig.items,
      skillConfig.passPercentage ?? 80
    );
  }, [userProfile, skillConfig]);

  const xpToNextLevel = useMemo(() => {
    if (!userProfile || userProfile.hideProgressTracking) return null;
    const level = userProfile.level || currentUserLevelId || 1;
    if (level >= 4) return { remaining: 0, isMax: true as const };
    const progress = calculateSkillProgress(
      userProfile.skillScores || {},
      skillConfig.items,
      level,
      skillConfig.passPercentage ?? 80
    );
    return { remaining: progress.remainingPointsNeeded, isMax: false as const };
  }, [userProfile, skillConfig, currentUserLevelId]);

  const [hoveredLevelId, setHoveredLevelId] = useState<number | null>(null);
  const [selectedLevelId, setSelectedLevelId] = useState<number | null>(() => {
    if (currentUserLevelId != null) return currentUserLevelId;
    return breakpoint !== 'desktop' ? 1 : null;
  });

  const earnedSkillsByLevel = useMemo(() => {
    const scores = userProfile?.skillScores || {};
    const map: Record<number, JourneyEarnedSkill[]> = {};
    for (const level of JOURNEY_LEVELS) {
      map[level.id] = getTopEarnedSkillsForJourneyLevel(
        level.id,
        skillConfig.items,
        scores,
        language,
        5
      );
    }
    return map;
  }, [userProfile?.skillScores, skillConfig.items, language]);

  useEffect(() => {
    if (currentUserLevelId == null) return;

    if (isCompactJourneyLayout && showUserPosition) {
      const preferred = isJourneyLevelUnlocked(currentUserLevelId, earnedSkillsByLevel)
        ? currentUserLevelId
        : getFirstUnlockedJourneyLevelId(earnedSkillsByLevel);
      if (preferred != null) {
        setSelectedLevelId(preferred);
      }
      return;
    }

    setSelectedLevelId(currentUserLevelId);
  }, [currentUserLevelId, isCompactJourneyLayout, showUserPosition, earnedSkillsByLevel]);

  const activeLevelId = useMemo(() => {
    if (showAllCards) {
      return hoveredLevelId ?? selectedLevelId ?? null;
    }

    if (showUserPosition) {
      return resolveCompactJourneyActiveLevel(
        hoveredLevelId,
        selectedLevelId,
        currentUserLevelId,
        earnedSkillsByLevel
      );
    }

    return hoveredLevelId ?? selectedLevelId ?? currentUserLevelId ?? 1;
  }, [
    showAllCards,
    showUserPosition,
    hoveredLevelId,
    selectedLevelId,
    currentUserLevelId,
    earnedSkillsByLevel,
  ]);

  const { sectionRef, effectiveFillViewport } = useCabinetJourneyLayout(
    fillViewport && showAllCards,
    `${breakpoint}-${activeLevelId ?? 'none'}`
  );

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
    () => (showUserPosition ? getJourneyLevelUpZones(skillConfig.passPercentage ?? 80) : []),
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
    if (userProgress == null) {
      setDisplayProgress(null);
      hasAnimatedMarkerRef.current = false;
      return;
    }

    if (animateSequence && visibleLevelCount < 4) {
      return;
    }

    if (!animateSequence || hasAnimatedMarkerRef.current) {
      setDisplayProgress(userProgress);
      hasAnimatedMarkerRef.current = true;
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
  }, [userProgress, visibleLevelCount, animateSequence]);

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

  const bgUrl = optimizedImageUrl(isDark ? JOURNEY_BG.dark : JOURNEY_BG.light, 1920);

  const activateLevel = (levelId: number) => {
    if (
      isCompactJourneyLayout &&
      showUserPosition &&
      !isJourneyLevelUnlocked(levelId, earnedSkillsByLevel)
    ) {
      return;
    }
    setHoveredLevelId(levelId);
    // После наведения блок остаётся подсвеченным (как после клика)
    setSelectedLevelId(levelId);
  };

  const clearHover = () => {
    setHoveredLevelId(null);
  };

  const selectLevel = (levelId: number) => {
    if (
      isCompactJourneyLayout &&
      showUserPosition &&
      !isJourneyLevelUnlocked(levelId, earnedSkillsByLevel)
    ) {
      return;
    }
    setSelectedLevelId(levelId);
  };

  return (
    <section
      ref={sectionRef}
      id="your-journey"
      className={`journey-section relative overflow-hidden shrink-0 ${
        isDark ? 'bg-[#070b14]' : 'bg-[#eef1f5]'
      } ${effectiveFillViewport ? 'cabinet-journey-fill' : ''}`}
    >
      <img
        src={bgUrl}
        alt=""
        loading="lazy"
        decoding="async"
        fetchPriority="low"
        className="absolute inset-0 w-full h-full object-cover pointer-events-none select-none"
        draggable={false}
        aria-hidden="true"
      />
      <div
        className={`absolute inset-0 pointer-events-none ${
          isDark
            ? 'bg-gradient-to-b from-[#070b14]/55 via-transparent to-transparent'
            : 'bg-gradient-to-b from-[#eef1f5]/50 via-transparent to-transparent'
        }`}
        aria-hidden="true"
      />

      <div
        className={`relative z-10 max-w-5xl mx-auto px-5 sm:px-8 md:px-10 w-full ${
          effectiveFillViewport
            ? 'flex-1 flex flex-col min-h-0 pt-6 sm:pt-8 md:pt-10 pb-22 sm:pb-22 md:pb-22 gap-6 sm:gap-8 md:gap-10'
            : 'py-8 sm:py-14 md:py-20 space-y-6 sm:space-y-10 md:space-y-12'
        }`}
      >
        <header className="text-center space-y-3 max-w-2xl mx-auto shrink-0">
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
          {showUserPosition && xpToNextLevel ? (
            <TrainingStreak isDark={isDark} xpToNextLevel={xpToNextLevel} />
          ) : (
            <div
              className={`space-y-0.5 text-sm leading-relaxed ${
                isDark ? 'text-white/55' : 'text-[var(--ink-dim)]'
              }`}
            >
              <p>{t('journeyDesc1')}</p>
              <p>{t('journeyDesc2')}</p>
            </div>
          )}
        </header>

        <div
          ref={pathBlockRef}
          className={
            effectiveFillViewport
              ? 'relative flex-1 flex flex-col min-h-0 space-y-3 sm:space-y-4'
              : isCompactJourneyLayout
                ? 'relative flex flex-col space-y-3 sm:space-y-4'
                : 'relative space-y-4'
          }
        >
          <JourneyPathStrip
            effectiveFillViewport={effectiveFillViewport}
            markerYs={markerYs}
            pathBends={pathBends}
            activeLevelId={activeLevelId}
            displayProgress={displayProgress}
            lineDrawProgress={lineDrawProgress}
            levelUpZones={levelUpZones}
            markerStops={markerStops}
            userPoint={userPoint}
            userProfile={userProfile}
            animatedXp={animatedXp}
            markerTravelRatio={markerTravelRatio}
            animateSequence={animateSequence}
            levelsWithXp={levelsWithXp}
            showUserPosition={showUserPosition}
            earnedSkillsByLevel={earnedSkillsByLevel}
            isCompactJourneyLayout={isCompactJourneyLayout}
            showAllCards={showAllCards}
            currentUserLevelId={currentUserLevelId}
            visibleLevelCount={visibleLevelCount}
            isDark={isDark}
            activateLevel={activateLevel}
            clearHover={clearHover}
            selectLevel={selectLevel}
          />

          {showAllCards ? (
            <DesktopSkillCards
              levelsWithXp={levelsWithXp}
              activeLevelId={activeLevelId}
              currentUserLevelId={currentUserLevelId}
              visibleLevelCount={visibleLevelCount}
              effectiveFillViewport={effectiveFillViewport}
              isDark={isDark}
              showUserPosition={showUserPosition}
              earnedSkillsByLevel={earnedSkillsByLevel}
              onOpenDevelopment={onOpenDevelopment}
              formatMeta={formatMeta}
              activateLevel={activateLevel}
              clearHover={clearHover}
            />
          ) : (
            <MobileSkillCards
              activeLevelId={activeLevelId}
              levelsWithXp={levelsWithXp}
              visibleLevelCount={visibleLevelCount}
              effectiveFillViewport={effectiveFillViewport}
              isDark={isDark}
              formatMeta={formatMeta}
              earnedSkillsByLevel={earnedSkillsByLevel}
              onOpenDevelopment={showUserPosition ? onOpenDevelopment : undefined}
              activateLevel={activateLevel}
              clearHover={clearHover}
            />
          )}
        </div>

        {!userProfile && <AchievementGrid isDark={isDark} visibleLevelCount={visibleLevelCount} />}
      </div>
    </section>
  );
};
