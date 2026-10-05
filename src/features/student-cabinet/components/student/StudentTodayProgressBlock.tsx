import { memo, useMemo } from 'react';
import { Award, Sparkles, Trophy, Zap } from 'lucide-react';
import { participantProgressDayKey } from '@ski-academy/shared-domain';

import { ScTintCard } from './StudentCabinetUI';
import type { TodayProgressBlockInput } from './studentCabinetContracts';
import { useStudentCabinetTranslations } from './useStudentCabinetTranslations';
import { ParticipantScopeIndicator } from './ParticipantScopeIndicator';
import { usePresentedParticipantAchievements } from '../../../participant-achievements';

const SUBSECTION_LABEL = 'text-[10px] font-medium tracking-widest uppercase text-[var(--ink-dim)]';
const NO_ACCOUNT_REVIEWS: readonly { createdAtIso: string }[] = [];

export const TodayProgressBlock = memo<TodayProgressBlockInput>(function TodayProgressBlock({
  scopeParticipant,
  progress,
  selectedParticipantId,
  achievementsConfig,
  skillConfig,
}) {
  const { lang } = useStudentCabinetTranslations();
  const { achievements } = usePresentedParticipantAchievements({
    selectedParticipantId,
    language: lang,
    accountReviews: NO_ACCOUNT_REVIEWS,
    achievementsConfig,
    skillConfig,
  });

  const dayKey = participantProgressDayKey(new Date());
  const todayAchievements = useMemo(
    () =>
      achievements.filter(
        (item) => item.earnedAt && participantProgressDayKey(new Date(item.earnedAt)) === dayKey
      ),
    [achievements, dayKey]
  );
  const { todayXP, todayLevelUp, exercises: todayExerciseItems, level } = progress;
  const motivationalPhrase = useMemo(() => {
    if (lang === 'en') {
      if ((todayXP ?? 0) > 0 || todayLevelUp || todayAchievements.length > 0) {
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

    const index = (new Date().getDate() + (todayXP ?? 0)) % phrases.length;
    return phrases[index];
  }, [lang, todayXP, todayLevelUp, todayAchievements.length]);

  if (
    (todayXP == null || todayXP === 0) &&
    !todayLevelUp &&
    todayAchievements.length === 0 &&
    todayExerciseItems.length === 0
  ) {
    return null;
  }

  return (
    <div className="pt-5 space-y-2">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <p className={SUBSECTION_LABEL}>
          {lang === 'ru' ? 'Достижения за сегодня' : 'Today’s Progress'}
        </p>
        <ParticipantScopeIndicator
          participant={scopeParticipant}
          visible={Boolean(scopeParticipant)}
        />
      </div>
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
                {todayXP == null ? '—' : '+' + todayXP}{' '}
                <span className="text-xs font-semibold text-[#30D158]">XP</span>
              </p>
              {todayXP == null && (
                <p className="text-xs text-[var(--ink-dim)]">
                  {lang === 'ru'
                    ? 'Дневная история оценок ещё недоступна.'
                    : 'Daily score history is not available yet.'}
                </p>
              )}
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

          {level && !todayLevelUp && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--surface-tint)] text-[var(--ink-dim)] text-xs font-medium">
              <span>{lang === 'ru' ? `Уровень ${level}` : `Level ${level}`}</span>
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
              {todayXP == null
                ? lang === 'ru'
                  ? 'История оценок за сегодня ещё недоступна.'
                  : 'Today’s exercise score history is not available yet.'
                : lang === 'ru'
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
