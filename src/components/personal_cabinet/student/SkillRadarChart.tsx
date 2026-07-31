import React, { useState, useMemo, useEffect } from 'react';
import { UserProfile } from '../../../types';
import { SkillConfig, DEFAULT_SKILL_CONFIG, SkillItem, calculateSkillProgress, classifySkillItemToRadarDimension, RadarDimensionKey } from '../../../lib/skillData';
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
  /** Tighter hero embed: responsive chart, no legend strip */
  embed?: boolean;
  className?: string;
}

/** Apple HIG system colors — dark appearance + Activity Rings */
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
  { key: 'technique', titleKey: 'scRadarAxisTechnique', defaultTitle: 'Техника', icon: Compass, color: APPLE.indigo },
  { key: 'control', titleKey: 'scRadarAxisControl', defaultTitle: 'Контроль', icon: ShieldCheck, color: APPLE.ringExercise },
  { key: 'speed', titleKey: 'scRadarAxisSpeed', defaultTitle: 'Скорость', icon: Zap, color: APPLE.ringMove },
  { key: 'balance', titleKey: 'scRadarAxisBalance', defaultTitle: 'Баланс', icon: Activity, color: APPLE.ringStand },
  { key: 'coordination', titleKey: 'scRadarAxisCoordination', defaultTitle: 'Координация', icon: Layers, color: APPLE.purple },
  { key: 'terrain', titleKey: 'scRadarAxisTerrain', defaultTitle: 'Сложный склон', icon: Award, color: APPLE.orange },
];

function polarToCartesian(cx: number, cy: number, r: number, angleRad: number) {
  return { x: cx + r * Math.cos(angleRad), y: cy + r * Math.sin(angleRad) };
}

function describeArcSegment(
  cx: number,
  cy: number,
  r: number,
  startAngle: number,
  endAngle: number
): string {
  const start = polarToCartesian(cx, cy, r, startAngle);
  const end = polarToCartesian(cx, cy, r, endAngle);
  const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`;
}

function getSegmentGapRad(radius: number, strokeWidth: number): number {
  const capPadRad = (strokeWidth / 2 / radius) * 1.15;
  return Math.max(0.12, capPadRad * 2 + 0.07);
}

function getArcAngles(index: number, total: number, gapRad: number) {
  const slice = (Math.PI * 2) / total;
  const start = index * slice - Math.PI / 2 + gapRad / 2;
  const end = (index + 1) * slice - Math.PI / 2 - gapRad / 2;
  return { start, end, mid: (start + end) / 2, span: end - start };
}

function angleAtPercent(start: number, span: number, percent: number) {
  return start + span * (Math.max(0, Math.min(100, percent)) / 100);
}

const RADAR_DRAW_MS = 700;

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
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] animate-pulse" aria-hidden />
            )}
          </button>
        );
      })}
    </div>
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
  const [selectedDimensionKey, setSelectedDimensionKey] = useState<RadarDimensionFilter>(
    embed ? 'technique' : 'all'
  );
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

    const map: Record<RadarDimensionKey, { earned: number; max: number; exercises: RadarDimension['exercises'] }> = {
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
  }, [items, userProfile.skillScores, targetStage, passPercentage, pinnedIds]);

  /** Only dimensions that have exercises for the current level stage */
  const chartDimensions = useMemo(
    () => dimensionData.filter((d) => d.exercises.length > 0),
    [dimensionData]
  );

  useEffect(() => {
    if (chartDimensions.length === 0) return;
    if (embed && selectedDimensionKey === 'all') {
      setSelectedDimensionKey(chartDimensions[0].key);
      return;
    }
    if (
      selectedDimensionKey !== 'all' &&
      !chartDimensions.some((d) => d.key === selectedDimensionKey)
    ) {
      setSelectedDimensionKey(embed ? chartDimensions[0].key : 'all');
    }
  }, [chartDimensions, selectedDimensionKey, embed]);

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

  const radarPadding = compact ? (embed ? 38 : 43) : 53;
  const chartBase = compact ? (embed ? 360 : 384) : 480;
  const size = chartBase + radarPadding * 2;
  const center = size / 2;
  const radius = compact ? (embed ? 110 : 122) : 154;
  const numSides = chartDimensions.length;
  const strokeWidth = compact ? (embed ? 22 : 24) : 29;
  const segmentGapRad = numSides > 1 ? getSegmentGapRad(radius, strokeWidth) : 0;
  const glowMargin = strokeWidth + 8;
  const hasAxisFocus = selectedDimensionKey !== 'all';

  const hubDimension = selectedDimension ?? chartDimensions[0] ?? null;
  const hubAnimatedPercent = hubDimension
    ? Math.round(hubDimension.percent * drawProgress)
    : 0;

  const isSimulating = chartDimensions.some((d) => simulatedValues[d.key] > d.percent);

  const handleResetSimulation = () => {
    setSimulatedValues({ technique: 0, control: 0, speed: 0, balance: 0, coordination: 0, terrain: 0 });
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

  const radarSvg =
    numSides === 0 ? (
      <p className="text-sm text-[var(--ink-dim)] text-center py-8">
        {t('scRadarNoExercises').replace('{n}', String(targetStage))}
      </p>
    ) : (
    <div className={`relative flex items-center justify-center w-full overflow-visible ${embed ? 'max-w-[min(100%,23.5rem)] mx-auto' : 'max-w-[min(100%,31rem)] mx-auto'}`}>
      <svg
        viewBox={`0 0 ${size} ${size}`}
        className="w-full h-auto block"
        style={{ overflow: 'visible' }}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={t('scRadarTitle')}
      >
        <defs>
          <filter
            id="radar-arc-glow"
            filterUnits="userSpaceOnUse"
            x={-glowMargin}
            y={-glowMargin}
            width={size + glowMargin * 2}
            height={size + glowMargin * 2}
          >
            <feGaussianBlur stdDeviation="2.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {numSides === 1 ? (
          <>
            <circle
              cx={center}
              cy={center}
              r={radius}
              fill="none"
              stroke={chartDimensions[0].color}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              opacity={0.28 * drawProgress}
            />
            {isSimulating && simulatedValues[chartDimensions[0].key] > chartDimensions[0].percent && (
              <circle
                cx={center}
                cy={center}
                r={radius}
                fill="none"
                stroke={APPLE.simulation}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeDasharray={`${(2 * Math.PI * radius * (Math.max(chartDimensions[0].percent, simulatedValues[chartDimensions[0].key]) - chartDimensions[0].percent)) / 100} ${2 * Math.PI * radius}`}
                transform={`rotate(${-90 + (360 * chartDimensions[0].percent) / 100} ${center} ${center})`}
                opacity={0.85}
              />
            )}
            <circle
              cx={center}
              cy={center}
              r={radius}
              fill="none"
              stroke={chartDimensions[0].color}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeDasharray={`${(2 * Math.PI * radius * chartDimensions[0].percent * drawProgress) / 100} ${2 * Math.PI * radius}`}
              transform={`rotate(-90 ${center} ${center})`}
            />
          </>
        ) : (
          chartDimensions.map((dim, i) => {
            const { start, end, span } = getArcAngles(i, numSides, segmentGapRad);
            const isSelected = selectedDimensionKey !== 'all' && dim.key === selectedDimensionKey;
            const animatedPercent = dim.percent * drawProgress;
            const currentEnd = angleAtPercent(start, span, animatedPercent);
            const simVal = Math.max(dim.percent, simulatedValues[dim.key]);
            const simEnd = angleAtPercent(start, span, simVal);
            const trackPath = describeArcSegment(center, center, radius, start, end);
            const currentPath =
              animatedPercent > 0
                ? describeArcSegment(center, center, radius, start, currentEnd)
                : '';
            const simPath =
              isSimulating && simVal > dim.percent
                ? describeArcSegment(center, center, radius, currentEnd, simEnd)
                : '';

            return (
              <g
                key={`arc-${dim.key}`}
                opacity={hasAxisFocus && !isSelected ? 0.38 : 1}
                className="transition-opacity duration-300"
              >
                <path
                  d={trackPath}
                  fill="none"
                  stroke={dim.color}
                  strokeWidth={strokeWidth}
                  strokeLinecap="round"
                  opacity={0.28 * drawProgress}
                />
                {simPath && (
                  <path
                    d={simPath}
                    fill="none"
                    stroke={APPLE.simulation}
                    strokeWidth={strokeWidth - 1}
                    strokeLinecap="round"
                    opacity={0.85}
                    className="transition-all duration-500"
                  />
                )}
                {currentPath && (
                  <path
                    d={currentPath}
                    fill="none"
                    stroke={dim.color}
                    strokeWidth={strokeWidth}
                    strokeLinecap="round"
                    filter={isSelected && drawProgress >= 1 ? 'url(#radar-arc-glow)' : undefined}
                  />
                )}
                <path
                  d={trackPath}
                  fill="none"
                  stroke="transparent"
                  strokeWidth={strokeWidth + 14}
                  strokeLinecap="round"
                  className="cursor-pointer"
                  onClick={() => setSelectedDimensionKey(dim.key)}
                />
              </g>
            );
          })
        )}

        {hubDimension && (
          <text
            x={center}
            y={center + (compact ? (embed ? 10 : 11) : 13)}
            textAnchor="middle"
            fontSize={compact ? (embed ? '36' : '38') : '48'}
            fontWeight="300"
            fill={hubDimension.color}
            fillOpacity={Math.min(1, drawProgress * 1.2)}
            className="font-serif tabular-nums pointer-events-none"
          >
            {hubAnimatedPercent}%
          </text>
        )}
      </svg>
    </div>
    );

  const legendStrip = numSides > 0 ? (
    <div className="flex flex-wrap items-center justify-center gap-x-3 sm:gap-x-5 gap-y-1.5 text-[10px] sm:text-xs text-[var(--ink-dim)] px-1 max-w-full text-center leading-snug">
      <span className="inline-flex items-center gap-1.5">
        <span className="w-4 h-1 rounded-full bg-gradient-to-r from-[#5E5CE6] via-[#A8E10C] to-[#FA114F]" />
        {t('scRadarCurrentScore')}
      </span>
      {isSimulating && (
        <span className="inline-flex items-center gap-1.5 text-[var(--ink)]">
          <span className="w-2 h-2 rounded-full bg-[#FF9F0A]" />
          {t('scRadarSimulatedScore')}
        </span>
      )}
    </div>
  ) : null;

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
                ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]'
                : 'border-[var(--border-subtle)] text-[var(--ink-dim)] hover:text-[var(--ink)]'
            }`}
          >
            {titleText}
          </button>
        );
      })}
    </div>
  );

  if (compact) {
    return (
      <div className={`space-y-3 sm:space-y-4 min-w-0 w-full ${className}`}>
        <div className="flex flex-col items-center gap-2 sm:gap-3 min-w-0 w-full">
          {radarSvg}
          {!embed && legendStrip}
        </div>
        {chartDimensions.length > 0 && dimensionPills}
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
        <div className="flex flex-col items-center gap-3">
          <p className="w-full text-[10px] font-medium tracking-widest uppercase text-[var(--ink-dim)]">
            {t('scRadarLevelMatrix').replace('{n}', String(targetStage))}
          </p>
          {radarSvg}
          {legendStrip}
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
                                        {pinned ? <Check className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
                                      </button>
                                    )}
                                    <div className="min-w-0 flex-1">
                                      <p className="text-sm leading-snug text-[var(--ink)]">{item.title}</p>
                                      {coachComment && (
                                        <p className="text-xs mt-0.5 leading-relaxed text-[var(--ink)] italic">
                                          &ldquo;{coachComment}&rdquo;
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                  <span
                                    className={`shrink-0 text-xs tabular-nums ${
                                      isMaxScore ? 'font-semibold text-[#30D158]' : 'text-[var(--ink-dim)]'
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
              <p className="text-sm text-[var(--ink-dim)] leading-relaxed">{t('scRadarSimulateDesc')}</p>

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
