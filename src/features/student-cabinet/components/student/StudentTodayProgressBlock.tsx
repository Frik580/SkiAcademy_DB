import { StudentDashboardTileHeader, StudentDashboardTileBody } from './StudentDashboardTile';
import { memo, useMemo } from 'react';
import { Award, Sparkles, Trophy, Zap } from 'lucide-react';

import './studentTodayAchievements.css';
import type { TodayProgressBlockInput } from './studentCabinetContracts';
import { useStudentCabinetTranslations } from './useStudentCabinetTranslations';
import { ParticipantScopeIndicator } from './ParticipantScopeIndicator';
import {
  useStudentTodayAchievements,
  hasStudentTodayProgress,
} from './useStudentTodayAchievements';
import { StudentDashboardTile } from './StudentDashboardTile';
import { STUDENT_DASHBOARD_TILES } from '../../../settings/studentDashboardLayout';

export const TodayProgressBlock = memo<TodayProgressBlockInput>(function TodayProgressBlock(input) {
  const todayAchievements = useStudentTodayAchievements(input);
  return <PresentedTodayProgressBlock {...input} todayAchievements={todayAchievements} />;
});

export const PresentedTodayProgressBlock = memo<
  TodayProgressBlockInput & { todayAchievements: ReturnType<typeof useStudentTodayAchievements> }
>(function PresentedTodayProgressBlock({
  dashboardSize,
  scopeParticipant,
  progress,
  todayAchievements,
}) {
  const { lang } = useStudentCabinetTranslations();
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

  if (!hasStudentTodayProgress(progress, todayAchievements)) return null;

  return (
    <StudentDashboardTile
      tileKey={STUDENT_DASHBOARD_TILES.todayAchievements.key}
      size={dashboardSize}
    >
      <section className="sc-today-achievements">
        <p className="sc-today-achievements-eyebrow">
          {lang === 'ru' ? 'Аналитика динамики' : 'Progress insights'}
        </p>
        <StudentDashboardTileHeader
          title={lang === 'ru' ? 'Достижения за сегодня' : 'Today’s Progress'}
          actions={
            <ParticipantScopeIndicator
              participant={scopeParticipant}
              visible={Boolean(scopeParticipant)}
            />
          }
        />
        <StudentDashboardTileBody>
          <div className="sc-today-achievements-content">
            <div className="sc-today-achievements-summary">
              <div
                className="sc-today-achievements-xp"
                data-positive={(todayXP ?? 0) > 0 || undefined}
              >
                <div className="sc-today-achievements-xp-icon">
                  <Zap className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-xs text-[var(--ink-dim)]">
                    {lang === 'ru' ? 'Заработанное за сегодня XP' : 'Today’s Earned XP'}
                  </p>
                  <p className="sc-today-achievements-xp-value">
                    {todayXP == null ? '—' : '+' + todayXP}{' '}
                    <span className="sc-today-achievements-xp-unit">XP</span>
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
                <div className="sc-today-achievements-level" data-level-up>
                  <Trophy className="w-3.5 h-3.5" />
                  <span className="text-xs font-semibold">
                    {lang === 'ru'
                      ? `Новый уровень: ${todayLevelUp}`
                      : `New Level: ${todayLevelUp}`}
                  </span>
                </div>
              )}

              {level && !todayLevelUp && (
                <div className="sc-today-achievements-level">
                  <span>{lang === 'ru' ? `Уровень ${level}` : `Level ${level}`}</span>
                </div>
              )}
            </div>

            {/* Exercises evaluated today by instructor */}
            <div className="sc-today-achievements-exercises">
              <p className="text-xs font-semibold text-[var(--ink)] flex items-center gap-1.5">
                <Award className="w-4 h-4 text-[var(--accent)]" />
                {lang === 'ru'
                  ? 'Оценки за упражнения от тренера:'
                  : 'Exercise scores from instructor:'}
              </p>

              {todayExerciseItems.length > 0 ? (
                <div className="sc-today-achievements-score-list">
                  {todayExerciseItems.map((item) => (
                    <div key={item.itemId} className="sc-today-achievements-score-row">
                      <div className="min-w-0 flex-1">
                        <p className="sc-today-achievements-exercise-title">{item.title}</p>
                        <p className="sc-today-achievements-score-detail">
                          {lang === 'ru'
                            ? `Текущий балл: ${item.newScore} / ${item.maxPoints} XP (макс. ${item.maxPoints} XP)`
                            : `Current score: ${item.newScore} / ${item.maxPoints} XP (max ${item.maxPoints} XP)`}
                        </p>
                      </div>
                      <div
                        className="sc-today-achievements-delta"
                        data-positive={item.delta > 0 || undefined}
                      >
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
              <div className="sc-today-achievements-earned">
                <p className="text-xs font-semibold text-[var(--ink)] flex items-center gap-1.5">
                  <Award className="w-4 h-4 text-[var(--sc-warning)]" />
                  {lang === 'ru' ? 'Новые достижения сегодня:' : 'New achievements today:'}
                </p>
                <div className="sc-today-achievements-badges">
                  {todayAchievements.map((ach, idx) => (
                    <span key={ach.id || idx} className="sc-today-achievements-badge">
                      <span className="sc-today-achievements-medal" aria-hidden="true">
                        <Award className="w-4 h-4" />
                      </span>
                      <span>{ach.label}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="sc-today-achievements-motivation">
              <Sparkles className="w-4 h-4 text-[var(--accent)] shrink-0 mt-0.5" />
              <p>{motivationalPhrase}</p>
            </div>
          </div>
        </StudentDashboardTileBody>
      </section>
    </StudentDashboardTile>
  );
});
