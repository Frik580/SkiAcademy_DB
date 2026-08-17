import { memo, useMemo } from 'react';
import { Award, Sparkles, Trophy, Zap } from 'lucide-react';
import type { ActivityLog, Booking, Course, Review, UserProfile } from '../../../../types';
import { useLanguage } from '../../../../app/providers/LanguageContext';
import {
  type AchievementsConfig,
  DEFAULT_SKILL_CONFIG,
  type SkillConfig,
  getSkillItemTitle,
} from '../../../../domain/achievements';
import { getTodayAchievements, isTimestampOnLocalDate, type TodayTask } from './studentCabinetUtils';
import { ScTintCard } from './StudentCabinetUI';

const SUBSECTION_LABEL = 'text-[10px] font-medium tracking-widest uppercase text-[var(--ink-dim)]';

export const TodayProgressBlock = memo<{
  userProfile?: UserProfile;
  bookings: Booking[];
  courses: Course[];
  reviews: Review[];
  activityLogs?: ActivityLog[];
  achievementsConfig?: AchievementsConfig;
  skillConfig?: SkillConfig;
  todayTasks: TodayTask[];
}>(function TodayProgressBlock({
  userProfile,
  bookings,
  courses,
  reviews,
  activityLogs = [],
  achievementsConfig,
  skillConfig,
}) {
  const { language } = useLanguage();
  const lang = language === 'ru' ? 'ru' : 'en';

  const todayLogs = useMemo(() => {
    const logs = activityLogs.filter(
      (log) => log.timestamp && isTimestampOnLocalDate(log.timestamp)
    );
    // Sort oldest first so logs replay in chronological order
    return [...logs].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
  }, [activityLogs]);

  const todayExerciseItems = useMemo(() => {
    const exerciseMap = new Map<
      string,
      {
        itemId: string;
        title: string;
        logDeltasSum: number;
        firstOldScore: number;
        lastNewScore: number;
        maxPoints: number;
      }
    >();

    const skillItems = skillConfig?.items || DEFAULT_SKILL_CONFIG.items;

    for (const log of todayLogs) {
      if (
        (log.type === 'skill_scores_updated' || log.type === 'level_up') &&
        Array.isArray(log.metadata?.skillDeltas)
      ) {
        for (const item of log.metadata.skillDeltas) {
          if (!item.itemId) continue;
          const deltaVal = typeof item.delta === 'number' ? item.delta : 0;
          const newScoreVal = typeof item.newScore === 'number' ? item.newScore : 0;
          const oldScoreVal =
            typeof item.oldScore === 'number' ? item.oldScore : Math.max(0, newScoreVal - deltaVal);

          const foundItem = skillItems.find((i) => i.id === item.itemId);
          const maxPoints = item.maxPoints ?? foundItem?.maxPoints ?? 20;
          const title = foundItem ? getSkillItemTitle(foundItem, lang) : item.title || item.itemId;

          const existing = exerciseMap.get(item.itemId);
          if (existing) {
            existing.lastNewScore = newScoreVal;
            existing.logDeltasSum += deltaVal;
          } else {
            exerciseMap.set(item.itemId, {
              itemId: item.itemId,
              title,
              logDeltasSum: deltaVal,
              firstOldScore: Math.max(0, oldScoreVal),
              lastNewScore: newScoreVal,
              maxPoints,
            });
          }
        }
      }
    }

    return Array.from(exerciseMap.values())
      .map((item) => {
        const liveScore = userProfile?.skillScores?.[item.itemId];
        const currentScoreRaw = typeof liveScore === 'number' ? liveScore : item.lastNewScore;
        const currentScore = Math.min(item.maxPoints, Math.max(0, currentScoreRaw));

        // Calculate positive gain today relative to the score before today's changes
        const netIncrease = currentScore - item.firstOldScore;
        const earnedToday = netIncrease > 0 ? Math.min(item.maxPoints, netIncrease) : 0;

        return {
          itemId: item.itemId,
          title: item.title,
          delta: earnedToday,
          newScore: currentScore,
          maxPoints: item.maxPoints,
        };
      })
      .filter((item) => item.delta > 0);
  }, [todayLogs, skillConfig, userProfile?.skillScores, lang]);

  const todayXP = useMemo(() => {
    return Math.max(
      0,
      todayExerciseItems.reduce((acc, item) => acc + item.delta, 0)
    );
  }, [todayExerciseItems]);

  const todayLevelUp = useMemo(() => {
    const levelLog = todayLogs.find((l) => l.type === 'level_up');
    if (levelLog && levelLog.metadata?.newLevel) {
      return Number(levelLog.metadata.newLevel);
    }
    return null;
  }, [todayLogs]);

  const todayAchievements = useMemo(() => {
    if (!userProfile) return [];
    return getTodayAchievements(
      userProfile,
      bookings,
      skillConfig,
      lang,
      activityLogs,
      reviews,
      courses,
      achievementsConfig
    ).map((item) => ({ id: item.id, label: item.label }));
  }, [
    userProfile,
    bookings,
    skillConfig,
    lang,
    activityLogs,
    reviews,
    courses,
    achievementsConfig,
  ]);

  const motivationalPhrase = useMemo(() => {
    if (lang === 'en') {
      if (todayXP > 0 || todayLevelUp || todayAchievements.length > 0) {
        return 'Fantastic progress today! Keep pushing your limits on the slope! ⛷️';
      }
      return 'Ready for today’s challenges? Conquer your tasks and reach new heights! 🏔️';
    }

    const phrases = [
      'Отличная работа сегодня! Каждый спуск и поворот приближают тебя к мастерству. 🏔️',
      'Потрясающий прогресс за сегодня! Горы покоряются тем, кто уверенно идет вперед. ⛷️',
      'Ты сегодня на высоте! Скорость и техника под контролем — продолжай в том же духе! 🏂',
      'Мощный день! Твои усилия и усердные тренировки приносят отличные результаты. 🚀',
      'Прекрасный результат сегодня! Гордимся твоими успехами и целеустремленностью. ✨',
    ];

    const index = (new Date().getDate() + todayXP) % phrases.length;
    return phrases[index];
  }, [lang, todayXP, todayLevelUp, todayAchievements.length]);

  if (
    todayXP === 0 &&
    !todayLevelUp &&
    todayAchievements.length === 0 &&
    todayExerciseItems.length === 0
  ) {
    return null;
  }

  return (
    <div className="pt-5 space-y-2">
      <p className={SUBSECTION_LABEL}>
        {lang === 'ru' ? 'Достижения за сегодня' : 'Today’s Progress'}
      </p>
      <ScTintCard tint="accent" className="p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--divider)] pb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-[#30D158]/15 text-[#30D158] flex items-center justify-center shrink-0">
              <Zap className="w-4 h-4" />
            </div>
            <div>
              <p className="text-xs text-[var(--ink-dim)]">
                {lang === 'ru' ? 'Заработанное за сегодня XP' : 'Today’s Earned XP'}
              </p>
              <p className="text-lg font-bold text-[var(--ink)] tabular-nums">
                +{todayXP} <span className="text-xs font-semibold text-[#30D158]">XP</span>
              </p>
            </div>
          </div>

          {todayLevelUp && (
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#FFD60A]/15 border border-[#FFD60A]/30 text-[#FFD60A]">
              <Trophy className="w-3.5 h-3.5" />
              <span className="text-xs font-bold uppercase tracking-wide">
                {lang === 'ru' ? `Новый уровень: ${todayLevelUp}` : `New Level: ${todayLevelUp}`}
              </span>
            </div>
          )}

          {userProfile?.level && !todayLevelUp && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--surface-tint)] text-[var(--ink-dim)] text-xs font-medium">
              <span>
                {lang === 'ru' ? `Уровень ${userProfile.level}` : `Level ${userProfile.level}`}
              </span>
            </div>
          )}
        </div>

        {/* Exercises evaluated today by instructor */}
        <div className="space-y-2 pt-1">
          <p className="text-xs font-semibold text-[var(--ink)] flex items-center gap-1.5">
            <Award className="w-4 h-4 text-[#30D158]" />
            {lang === 'ru'
              ? 'Оценки за упражнения от тренера:'
              : 'Exercise scores from instructor:'}
          </p>

          {todayExerciseItems.length > 0 ? (
            <div className="space-y-1.5">
              {todayExerciseItems.map((item) => (
                <div
                  key={item.itemId}
                  className="flex items-center justify-between p-2.5 rounded-lg bg-[var(--surface-card)] border border-[var(--border-subtle)] text-xs gap-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-[var(--ink)] truncate">{item.title}</p>
                    <p className="text-[11px] text-[var(--ink-dim)] mt-0.5">
                      {lang === 'ru'
                        ? `Текущий балл: ${item.newScore} / ${item.maxPoints} XP (макс. ${item.maxPoints} XP)`
                        : `Current score: ${item.newScore} / ${item.maxPoints} XP (max ${item.maxPoints} XP)`}
                    </p>
                  </div>
                  <div className="shrink-0 font-bold text-[#30D158] bg-[#30D158]/10 px-2.5 py-1 rounded-md border border-[#30D158]/20 text-xs tabular-nums">
                    {item.delta >= 0 ? `+${item.delta}` : item.delta} XP
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-[var(--ink-dim)] italic py-0.5">
              {lang === 'ru'
                ? 'За сегодня тренер еще не выставлял баллы за упражнения.'
                : 'No exercise XP assigned by instructor today yet.'}
            </p>
          )}
        </div>

        {todayAchievements.length > 0 && (
          <div className="space-y-1.5 pt-2 border-t border-[var(--divider)]">
            <p className="text-xs font-semibold text-[var(--ink)] flex items-center gap-1.5">
              <Award className="w-4 h-4 text-[#FFD60A]" />
              {lang === 'ru' ? 'Новые достижения сегодня:' : 'New achievements today:'}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {todayAchievements.map((ach, idx) => (
                <span
                  key={ach.id || idx}
                  className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-md bg-[#FFD60A]/15 text-[#FFD60A] font-medium border border-[#FFD60A]/30"
                >
                  <Sparkles className="w-3 h-3" />
                  {ach.label}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="pt-1 flex items-start gap-2 text-xs text-[var(--ink-dim)] leading-relaxed italic bg-[var(--surface-card)]/50 p-2.5 rounded-lg border border-[var(--border-subtle)]">
          <Sparkles className="w-4 h-4 text-[#64D2FF] shrink-0 mt-0.5" />
          <p>{motivationalPhrase}</p>
        </div>
      </ScTintCard>
    </div>
  );
});
