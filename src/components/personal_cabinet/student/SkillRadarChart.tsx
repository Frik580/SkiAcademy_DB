import React, { useState, useMemo, useEffect } from 'react';
import { UserProfile } from '../../../types';
import {
  SkillConfig,
  DEFAULT_SKILL_CONFIG,
  SkillItem,
  calculateSkillProgress,
  classifySkillItemToRadarDimension,
  RadarDimensionKey,
} from '../../../lib/skillData';
import { useLanguage } from '../../../lib/LanguageContext';
import { ScSectionTitle } from './StudentCabinetUI';
import {
  Compass,
  Zap,
  ShieldCheck,
  Award,
  Check,
  Plus,
  RotateCcw,
  Activity,
  Layers,
  ChevronRight,
} from 'lucide-react';

export type { RadarDimensionKey } from '../../../lib/skillData';

type RadarDimensionFilter = 'all' | RadarDimensionKey;

export interface RadarDimension {
  key: RadarDimensionKey;
  titleKey: string;
  defaultTitle: string;
  icon: React.FC<{ className?: string }>;
  color: string;
  earned: number;
  max: number;
  percent: number;
  exercises: {
    item: SkillItem;
    earned: number;
    maxPoints: number;
    pinned: boolean;
    isMaxScore: boolean;
  }[];
}

interface SkillRadarChartProps {
  userProfile: UserProfile;
  skillConfig?: SkillConfig;
  onToggleSkillToday?: (skillItemId: string, pinned: boolean) => void;
  onPinSkillsToday?: (skillItemIds: string[]) => void | Promise<void>;
  compact?: boolean;
  /** Tighter hero embed: responsive chart */
  embed?: boolean;
  className?: string;
}

/** Apple Fitness Activity Rings palette */
const APPLE = {
  ringMove: '#FA114F',
  ringExercise: '#A8E10C',
  ringStand: '#00D4FF',
  indigo: '#5E5CE6',
  green: '#30D158',
  orange: '#FF9F0A',
  purple: '#BF5AF2',
  simulation: '#FF9F0A',
} as const;

const DIMENSION_CONFIGS: {
  key: RadarDimensionKey;
  titleKey: string;
  defaultTitle: string;
  icon: React.FC<{ className?: string }>;
  color: string;
}[] = [
  { key: 'technique', titleKey: 'scRadarAxisTechnique', defaultTitle: 'Техника', icon: Compass, color: APPLE.ringMove },
  { key: 'control', titleKey: 'scRadarAxisControl', defaultTitle: 'Контроль', icon: ShieldCheck, color: APPLE.ringExercise },
  { key: 'speed', titleKey: 'scRadarAxisSpeed', defaultTitle: 'Скорость', icon: Zap, color: APPLE.ringStand },
  { key: 'balance', titleKey: 'scRadarAxisBalance', defaultTitle: 'Баланс', icon: Activity, color: APPLE.purple },
  { key: 'coordination', titleKey: 'scRadarAxisCoordination', defaultTitle: 'Координация', icon: Layers, color: APPLE.indigo },
  { key: 'terrain', titleKey: 'scRadarAxisTerrain', defaultTitle: 'Сложный склон', icon: Award, color: APPLE.orange },
];

const RADAR_DRAW_MS = 900;

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { id: T; label: string; badge?: boolean }[];
}) {
  return (
    <div
      className="inline-flex items-center gap-0.5 p-0.5 rounded-full bg-[var(--border-subtle)]/70 shrink-0"
      role="tablist"
    >
      {options.map(({ id, label, badge }) => {
        const active = value === id;
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(id)}
            className={`relative flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium rounded-full transition-all duration-200 ${
              active
                ? 'bg-[var(--card-bg)] text-[var(--ink)] shadow-sm'
                : 'text-[var(--ink-dim)] hover:text-[var(--ink)]'
            }`}
          >
            {label}
            {badge && (
              <span className="w-1.5 h-1.5 rounded-full bg-[#FF9F0A] animate-pulse" aria-hidden />
            )}
          </button>
        );
      })}
    </div>
  );
}

function ActivityRing({
  cx,
  cy,
  r,
  strokeWidth,
  color,
  percent,
  drawProgress,
  simPercent,
  selected,
  dimmed,
  onClick,
}: {
  cx: number;
  cy: number;
  r: number;
  strokeWidth: number;
  color: string;
  percent: number;
  drawProgress: number;
  simPercent?: number;
  selected: boolean;
  dimmed: boolean;
  onClick: (e: React.MouseEvent) => void;
}) {
  const circumference = 2 * Math.PI * r;
  const animated = Math.max(0, Math.min(100, percent)) * drawProgress;
  const progressLen = (circumference * animated) / 100;
  const sim = simPercent != null ? Math.max(percent, simPercent) : percent;
  const simLen = (circumference * (sim - percent)) / 100;
  const hasSim = sim > percent;

  return (
    <g
      opacity={dimmed ? 0.28 : 1}
      className="transition-opacity duration-300"
      style={{ cursor: 'pointer' }}
      onClick={onClick}
    >
      {/* Track — dark tint of ring color */}
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        opacity={0.18}
      />
      {/* Simulated gain (orange) */}
      {hasSim && (
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke={APPLE.simulation}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${simLen} ${circumference}`}
          transform={`rotate(${-90 + (360 * percent) / 100} ${cx} ${cy})`}
          opacity={0.9}
          className="transition-all duration-500"
        />
      )}
      {/* Progress */}
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={`${progressLen} ${circumference}`}
        transform={`rotate(-90 ${cx} ${cy})`}
        className={
          selected && drawProgress >= 1
            ? '[filter:drop-shadow(0_0_1.5px_var(--ring-glow))] dark:[filter:drop-shadow(0_0_4px_var(--ring-glow))]'
            : undefined
        }
        style={{ ['--ring-glow' as string]: color }}
      />
      {/* Hit area */}
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke="transparent"
        strokeWidth={strokeWidth + 10}
      />
    </g>
  );
}

export const SkillRadarChart: React.FC<SkillRadarChartProps> = ({
  userProfile,
  skillConfig = DEFAULT_SKILL_CONFIG,
  onToggleSkillToday,
  onPinSkillsToday,
  compact = false,
  embed = false,
  className = '',
}) => {
  const { t } = useLanguage();
  const currentLevel = userProfile.level || 1;
  const items = skillConfig?.items || DEFAULT_SKILL_CONFIG.items;
  const passPercentage = skillConfig?.passPercentage ?? 80;
  const pinnedIds = new Set(userProfile.todaySkillItemIds ?? []);

  const [activeTab, setActiveTab] = useState<'radar' | 'simulator'>('radar');
  const [selectedDimensionKey, setSelectedDimensionKey] = useState<RadarDimensionFilter>('all');
  const [simulatedValues, setSimulatedValues] = useState<Record<RadarDimensionKey, number>>({
    technique: 0,
    control: 0,
    speed: 0,
    balance: 0,
    coordination: 0,
    terrain: 0,
  });
  const [drawProgress, setDrawProgress] = useState(0);

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      setDrawProgress(1);
      return;
    }

    let raf = 0;
    const start = performance.now();

    const frame = (now: number) => {
      const t = Math.min(1, (now - start) / RADAR_DRAW_MS);
      setDrawProgress(easeOutCubic(t));
      if (t < 1) raf = requestAnimationFrame(frame);
    };

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  const targetStage = Math.min(currentLevel, 3);

  const dimensionData = useMemo(() => {
    const scores = userProfile.skillScores || {};
    const displayItems = items.filter((i) => i.levelTarget <= targetStage);

    const map: Record<
      RadarDimensionKey,
      { earned: number; max: number; exercises: RadarDimension['exercises'] }
    > = {
      technique: { earned: 0, max: 0, exercises: [] },
      control: { earned: 0, max: 0, exercises: [] },
      speed: { earned: 0, max: 0, exercises: [] },
      balance: { earned: 0, max: 0, exercises: [] },
      coordination: { earned: 0, max: 0, exercises: [] },
      terrain: { earned: 0, max: 0, exercises: [] },
    };

    displayItems.forEach((item) => {
      const dimKey = classifySkillItemToRadarDimension(item);
      const earned = scores[item.id] ?? 0;
      const isMaxScore = item.maxPoints > 0 && earned >= item.maxPoints;
      const pinned = pinnedIds.has(item.id);

      map[dimKey].earned += earned;
      map[dimKey].max += item.maxPoints;
      map[dimKey].exercises.push({ item, earned, maxPoints: item.maxPoints, pinned, isMaxScore });
    });

    return DIMENSION_CONFIGS.map((cfg) => {
      const data = map[cfg.key];
      const max = data.max;
      const percent = max > 0 ? Math.min(100, Math.round((data.earned / max) * 100)) : 0;

      return {
        ...cfg,
        earned: data.earned,
        max: data.max,
        percent,
        exercises: data.exercises,
      } as RadarDimension;
    });
  }, [items, userProfile.skillScores, targetStage, pinnedIds]);

  const chartDimensions = useMemo(
    () => dimensionData.filter((d) => d.exercises.length > 0),
    [dimensionData]
  );

  useEffect(() => {
    if (chartDimensions.length === 0) return;
    if (
      selectedDimensionKey !== 'all' &&
      !chartDimensions.some((d) => d.key === selectedDimensionKey)
    ) {
      setSelectedDimensionKey('all');
    }
  }, [chartDimensions, selectedDimensionKey]);

  const selectedDimension = useMemo(() => {
    if (selectedDimensionKey === 'all') return null;
    return chartDimensions.find((d) => d.key === selectedDimensionKey) ?? null;
  }, [chartDimensions, selectedDimensionKey]);

  const visibleExercises = useMemo(() => {
    if (selectedDimensionKey === 'all') {
      return chartDimensions.flatMap((d) => d.exercises);
    }
    return selectedDimension?.exercises ?? [];
  }, [selectedDimensionKey, chartDimensions, selectedDimension]);

  const progressSummary = useMemo(
    () => calculateSkillProgress(userProfile.skillScores || {}, items, targetStage, passPercentage),
    [userProfile.skillScores, items, targetStage, passPercentage]
  );

  const simulatedSummary = useMemo(() => {
    const simScores = { ...(userProfile.skillScores || {}) };

    dimensionData.forEach((dim) => {
      if (dim.exercises.length === 0) return;
      const targetPercent = Math.max(dim.percent, simulatedValues[dim.key]);
      if (targetPercent > dim.percent) {
        dim.exercises.forEach(({ item }) => {
          const currentEarned = simScores[item.id] ?? 0;
          const simEarned = Math.round((targetPercent / 100) * item.maxPoints);
          simScores[item.id] = Math.max(currentEarned, simEarned);
        });
      }
    });

    return calculateSkillProgress(simScores, items, targetStage, passPercentage);
  }, [userProfile.skillScores, dimensionData, simulatedValues, items, targetStage, passPercentage]);

  const ringCount = Math.max(1, chartDimensions.length);
  const size = compact ? (embed ? 210 : 230) : 280;
  const ringGap = 3;
  const maxStroke = compact ? (embed ? 15 : 16) : 18;
  const strokeWidth = Math.max(
    9,
    Math.min(maxStroke, Math.floor((size / 2 - 10) / ringCount) - ringGap)
  );
  const outerRadius = size / 2 - strokeWidth / 2 - 4;
  const center = size / 2;
  const hasAxisFocus = selectedDimensionKey !== 'all';

  const isSimulating = chartDimensions.some((d) => simulatedValues[d.key] > d.percent);

  const handleResetSimulation = () => {
    setSimulatedValues({
      technique: 0,
      control: 0,
      speed: 0,
      balance: 0,
      coordination: 0,
      terrain: 0,
    });
  };

  const handleApplySimulatedTasks = () => {
    const toPin: string[] = [];
    dimensionData.forEach((dim) => {
      if (dim.exercises.length === 0) return;
      if (simulatedValues[dim.key] > dim.percent) {
        dim.exercises.forEach(({ item, isMaxScore, pinned }) => {
          if (!isMaxScore && !pinned) toPin.push(item.id);
        });
      }
    });
    if (toPin.length === 0) return;
    if (onPinSkillsToday) {
      void onPinSkillsToday(toPin);
      return;
    }
    if (!onToggleSkillToday) return;
    toPin.forEach((id) => onToggleSkillToday(id, true));
  };

  const ringsSvg =
    ringCount === 0 ? (
      <p className="text-sm text-[var(--ink-dim)] text-center py-8">
        {t('scRadarNoExercises').replace('{n}', String(targetStage))}
      </p>
    ) : (
      <svg
        viewBox={`0 0 ${size} ${size}`}
        className="block h-auto w-[13rem] sm:w-[11.5rem] lg:w-[10.5rem] cursor-pointer"
        role="img"
        aria-label={t('scRadarTitle')}
        onClick={() => setSelectedDimensionKey('all')}
      >
        <rect width={size} height={size} fill="transparent" />
        {chartDimensions.map((dim, i) => {
          const r = outerRadius - i * (strokeWidth + ringGap);
          if (r < strokeWidth) return null;
          const isSelected =
            selectedDimensionKey === 'all' || dim.key === selectedDimensionKey;
          const simVal = Math.max(dim.percent, simulatedValues[dim.key]);

          return (
            <ActivityRing
              key={dim.key}
              cx={center}
              cy={center}
              r={r}
              strokeWidth={strokeWidth}
              color={dim.color}
              percent={dim.percent}
              drawProgress={drawProgress}
              simPercent={isSimulating && simVal > dim.percent ? simVal : undefined}
              selected={isSelected}
              dimmed={hasAxisFocus && dim.key !== selectedDimensionKey}
              onClick={(e) => {
                e.stopPropagation();
                setSelectedDimensionKey(dim.key);
              }}
            />
          );
        })}
      </svg>
    );

  /** Home embed: side legend from sm+. Development: always mobile-style row under rings. */
  const sideLegend = Boolean(embed);

  const fitnessLegend = ringCount > 0 && (
    <ul
      className={`flex flex-row flex-wrap justify-center gap-x-3 gap-y-2 shrink-0 items-center ${
        sideLegend
          ? 'sm:flex-col sm:flex-nowrap sm:justify-center sm:gap-2.5 sm:items-start'
          : ''
      }`}
    >
      {chartDimensions.map((dim) => {
        const titleText = t(dim.titleKey as any) || dim.defaultTitle;
        const active = dim.key === selectedDimensionKey;
        const simVal = Math.max(dim.percent, simulatedValues[dim.key]);
        const showSim = isSimulating && simVal > dim.percent;

        return (
          <li key={`legend-${dim.key}`}>
            <button
              type="button"
              onClick={() => setSelectedDimensionKey(dim.key)}
              className={`text-center rounded-lg px-0.5 py-0.5 transition ${
                sideLegend ? 'sm:text-left' : ''
              } ${active ? 'opacity-100' : hasAxisFocus ? 'opacity-45' : 'opacity-100'} hover:opacity-100`}
            >
              <p
                className={`font-semibold tracking-wide text-[var(--ink)] leading-tight ${
                  sideLegend ? 'text-[10px] sm:text-xs' : 'text-[10px]'
                }`}
              >
                {titleText}
              </p>
              <p
                className={`font-semibold tabular-nums leading-tight mt-0.5 ${
                  sideLegend ? 'text-xs sm:text-[15px]' : 'text-xs'
                }`}
                style={{ color: dim.color }}
              >
                {Math.round(dim.percent * drawProgress)}%
                {showSim && (
                  <span className="text-[#FF9F0A] font-medium">
                    {' '}
                    → {simVal}%
                  </span>
                )}
                {sideLegend && (
                  <span className="hidden sm:inline text-[var(--ink-dim)] font-normal text-[11px] ml-1.5">
                    {dim.earned}/{dim.max}
                  </span>
                )}
              </p>
            </button>
          </li>
        );
      })}
    </ul>
  );

  const activityCard = (
    <div
      className={`rounded-[1.35rem] px-3.5 py-3.5 sm:px-4 sm:py-4 max-w-full bg-transparent border border-black/10 dark:border-transparent dark:bg-[#1C1C1E] ${
        embed ? 'w-full lg:w-fit' : 'w-full'
      }`}
    >
      <div
        className={`flex flex-col items-center gap-3 ${
          sideLegend ? 'sm:flex-row sm:gap-3.5 sm:justify-center lg:justify-start' : ''
        }`}
      >
        <div className="shrink-0 flex items-center justify-center">{ringsSvg}</div>
        {fitnessLegend}
      </div>
    </div>
  );

  const dimensionPills = (
    <div className={`flex flex-wrap gap-2 ${embed ? 'justify-center' : ''}`}>
      {!embed && (
        <button
          type="button"
          onClick={() => setSelectedDimensionKey('all')}
          className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
            selectedDimensionKey === 'all'
              ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]'
              : 'border-[var(--border-subtle)] text-[var(--ink-dim)] hover:text-[var(--ink)]'
          }`}
        >
          {t('scDevFilterAll')}
        </button>
      )}
      {chartDimensions.map((dim) => {
        const active = dim.key === selectedDimensionKey;
        const titleText = t(dim.titleKey as any) || dim.defaultTitle;
        return (
          <button
            key={`pill-${dim.key}`}
            type="button"
            onClick={() => setSelectedDimensionKey(dim.key)}
            title={titleText}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
              active
                ? 'border-transparent text-black'
                : 'border-[var(--border-subtle)] text-[var(--ink-dim)] hover:text-[var(--ink)]'
            }`}
            style={active ? { backgroundColor: dim.color } : undefined}
          >
            {titleText}
          </button>
        );
      })}
    </div>
  );

  if (compact) {
    return (
      <div className={`space-y-3 min-w-0 w-full ${className}`}>
        {activityCard}
        {chartDimensions.length > 0 && !embed && (
          <div className="px-0.5">{dimensionPills}</div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <SegmentedControl
          value={activeTab}
          onChange={setActiveTab}
          options={[
            { id: 'radar', label: t('scRadarViewRadar') },
            { id: 'simulator', label: t('scRadarViewSimulator'), badge: isSimulating },
          ]}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8 items-start">
        <div className="flex flex-col gap-3">
          <p className="text-[10px] font-medium tracking-widest uppercase text-[var(--ink-dim)]">
            {t('scRadarLevelMatrix').replace('{n}', String(targetStage))}
          </p>
          {activityCard}
        </div>

        <div className="space-y-4">
          {activeTab === 'radar' ? (
            <>
              {dimensionPills}

              {selectedDimension && (
                <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--profile-bg)] px-4 py-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white"
                      style={{ backgroundColor: selectedDimension.color }}
                    >
                      <selectedDimension.icon className="h-4 w-4" />
                    </span>
                    <p className="text-sm font-medium text-[var(--ink)]">
                      {t(selectedDimension.titleKey as any) || selectedDimension.defaultTitle}
                    </p>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <ScSectionTitle>
                    {selectedDimensionKey === 'all'
                      ? t('scDevAllExercises')
                      : t('scRadarSelectedAxisExercises').replace(
                          '{axis}',
                          selectedDimension
                            ? t(selectedDimension.titleKey as any) || selectedDimension.defaultTitle
                            : ''
                        )}
                  </ScSectionTitle>
                  <span className="text-[11px] text-[var(--ink-dim)] tabular-nums">
                    {t('scRadarItemsCount').replace('{n}', String(visibleExercises.length))}
                  </span>
                </div>

                {visibleExercises.length === 0 ? (
                  <p className="text-sm text-[var(--ink-dim)] py-2">
                    {t('scRadarNoExercises').replace('{n}', String(targetStage))}
                  </p>
                ) : (
                  <div className="space-y-5">
                    {Array.from(
                      visibleExercises.reduce((map, ex) => {
                        const levelNum = ex.item.levelTarget;
                        const list = map.get(levelNum) ?? [];
                        list.push(ex);
                        map.set(levelNum, list);
                        return map;
                      }, new Map<number, typeof visibleExercises>())
                    )
                      .sort(([a], [b]) => a - b)
                      .map(([levelNum, levelExercises]) => (
                        <div key={`level-${levelNum}`} className="space-y-2">
                          <h4 className="text-[10px] font-medium uppercase tracking-wider text-[var(--ink-dim)] px-0.5">
                            {t('instructorLevel')} {levelNum}
                          </h4>
                          <ul className="space-y-2">
                            {levelExercises.map(({ item, earned, maxPoints, pinned, isMaxScore }) => {
                              const coachComment = userProfile.skillComments?.[item.id]?.trim();
                              return (
                                <li
                                  key={item.id}
                                  className="rounded-lg border border-[var(--border-subtle)] bg-[var(--profile-bg)] px-4 py-3 flex items-start justify-between gap-3"
                                >
                                  <div className="flex items-start gap-2.5 min-w-0 flex-1">
                                    {isMaxScore ? (
                                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#30D158]/12 text-[#30D158]">
                                        <Check className="h-3 w-3" />
                                      </span>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() => onToggleSkillToday?.(item.id, !pinned)}
                                        disabled={!onToggleSkillToday}
                                        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition ${
                                          pinned
                                            ? 'border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-foreground)]'
                                            : 'border-[var(--border-subtle)] text-[var(--ink-dim)] hover:border-[var(--accent)] hover:text-[var(--accent)]'
                                        } disabled:opacity-50`}
                                        title={pinned ? t('scRemoveFromToday') : t('scAddToToday')}
                                      >
                                        {pinned ? (
                                          <Check className="h-3 w-3" />
                                        ) : (
                                          <Plus className="h-3 w-3" />
                                        )}
                                      </button>
                                    )}
                                    <div className="min-w-0 flex-1">
                                      <p className="text-sm leading-snug text-[var(--ink)]">
                                        {item.title}
                                      </p>
                                      {coachComment && (
                                        <p className="text-xs mt-0.5 leading-relaxed text-[var(--ink)] italic">
                                          &ldquo;{coachComment}&rdquo;
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                  <span
                                    className={`shrink-0 text-xs tabular-nums ${
                                      isMaxScore
                                        ? 'font-semibold text-[#30D158]'
                                        : 'text-[var(--ink-dim)]'
                                    }`}
                                  >
                                    {earned}/{maxPoints}
                                  </span>
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-[var(--ink-dim)] leading-relaxed">
                {t('scRadarSimulateDesc')}
              </p>

              <div className="space-y-3">
                {chartDimensions.map((dim) => {
                  const currentSimVal = Math.max(dim.percent, simulatedValues[dim.key]);
                  const titleText = t(dim.titleKey as any) || dim.defaultTitle;

                  return (
                    <div
                      key={`sim-slider-${dim.key}`}
                      className="rounded-xl border border-[var(--border-subtle)] bg-[var(--profile-bg)] px-4 py-3 space-y-2.5"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium text-[var(--ink)]">{titleText}</span>
                        <div className="tabular-nums flex items-center gap-1 text-[var(--ink-dim)]">
                          <span>{dim.percent}%</span>
                          {currentSimVal > dim.percent && (
                            <span className="text-[#FF9F0A] font-semibold inline-flex items-center gap-0.5">
                              <ChevronRight className="h-3 w-3" />
                              {currentSimVal}%
                            </span>
                          )}
                        </div>
                      </div>
                      <input
                        type="range"
                        min={dim.percent}
                        max={100}
                        step={5}
                        value={currentSimVal}
                        onChange={(e) =>
                          setSimulatedValues((prev) => ({
                            ...prev,
                            [dim.key]: parseInt(e.target.value, 10),
                          }))
                        }
                        className="w-full h-1 accent-[var(--accent)] cursor-pointer"
                        style={{ accentColor: dim.color }}
                      />
                    </div>
                  );
                })}
              </div>

              <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--profile-bg)] px-4 py-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-[var(--ink-dim)] tracking-wide">
                    {t('scRadarSimulatedProgress').replace('{level}', String(targetStage))}
                  </span>
                  <span className="text-sm font-semibold tabular-nums text-[var(--ink)]">
                    {simulatedSummary.targetEarnedPoints}/{simulatedSummary.targetRequiredPoints}
                  </span>
                </div>

                <div className="relative h-2.5 rounded-full overflow-hidden bg-[var(--border-subtle)]">
                  <div
                    className="absolute inset-y-0 left-0 rounded-full bg-[var(--accent)] opacity-35 transition-all duration-500"
                    style={{
                      width: `${Math.min(100, (progressSummary.targetEarnedPoints / progressSummary.targetRequiredPoints) * 100)}%`,
                    }}
                  />
                  <div
                    className="absolute inset-y-0 left-0 rounded-full bg-[#FF9F0A] shadow-[inset_0_1px_0_rgba(255,255,255,0.22)] transition-all duration-500"
                    style={{
                      width: `${Math.min(100, (simulatedSummary.targetEarnedPoints / simulatedSummary.targetRequiredPoints) * 100)}%`,
                    }}
                  />
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
                  {isSimulating ? (
                    <button
                      type="button"
                      onClick={handleResetSimulation}
                      className="text-xs text-[var(--ink-dim)] hover:text-[var(--ink)] inline-flex items-center gap-1 transition"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      {t('scRadarResetSimulation')}
                    </button>
                  ) : (
                    <span className="text-xs text-[var(--ink-dim)]">{t('scRadarAdjustSliders')}</span>
                  )}

                  {(onPinSkillsToday || onToggleSkillToday) && isSimulating && (
                    <button
                      type="button"
                      onClick={handleApplySimulatedTasks}
                      className="text-xs font-medium text-[var(--accent)] hover:opacity-80 transition inline-flex items-center gap-1"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      {t('scRadarApplyGoalTasks')}
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
