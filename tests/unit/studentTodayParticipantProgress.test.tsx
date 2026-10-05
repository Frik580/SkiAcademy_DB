import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ParticipantIdSchema,
  participantProgressDayKey,
  timestampFromDate,
} from '@ski-academy/shared-domain';
import { TodayProgressBlock } from '../../src/features/student-cabinet/components/student/StudentTodayProgressBlock';
import { buildParticipantTodayProgress } from '../../src/features/student-cabinet/components/student/studentTodayProgress';
import { useParticipantProgressStore } from '../../src/features/participant-progress/participantProgressStore';
import {
  toParticipantProgressView,
  type ParticipantProgressView,
} from '../../src/features/participant-progress/applyParticipantProgressToProfile';
import { useParticipantAchievementsStore } from '../../src/features/participant-achievements/participantAchievementsStore';
import { useAccountParticipantLessonStatsStore } from '../../src/features/lesson-bookings/accountParticipantLessonStatsStore';
import { DEFAULT_ACHIEVEMENTS_CONFIG, DEFAULT_SKILL_CONFIG } from '../../src/domain/achievements';
import { useCabinetProgressParticipantSelectionStore } from '../../src/features/student-cabinet/cabinetProgressParticipantSelectionStore';
import { useCabinetProgressParticipantSelection } from '../../src/features/student-cabinet/useCabinetProgressParticipantSelection';
import { CabinetParticipantAvatarSwitcher } from '../../src/features/student-cabinet/components/CabinetParticipantAvatarSwitcher';
import { toCabinetParticipantAvatarItems } from '../../src/features/student-cabinet/cabinetParticipantAvatarSwitcherContract';
import type { ManagedParticipantOption } from '../../src/features/lesson-bookings/lessonBookingContracts';

vi.mock('../../src/app/providers/LanguageContext', () => ({
  useLanguage: () => ({ language: 'en', t: (key: string) => key }),
}));
const now = new Date('2026-10-05T20:00:00Z'); // Already Oct 6 in the school, independently of the browser timezone.
const firstId = ParticipantIdSchema.parse('participant_daily_a');
const secondId = ParticipantIdSchema.parse('participant_daily_b');
const firstSkill = DEFAULT_SKILL_CONFIG.items.find((item) => item.maxPoints >= 20)!;
const secondSkill = DEFAULT_SKILL_CONFIG.items.find(
  (item) => item.maxPoints >= 20 && item.id !== firstSkill.id
)!;
const managed: ManagedParticipantOption[] = [firstId, secondId].map((id, index) => ({
  participantId: id,
  participantManagementId: 'management_' + id,
  displayName: index ? 'Bob' : 'Alice',
  authority: index ? 'parent_guardian' : 'self',
  discipline: 'ski',
  skillLevel: 'beginner',
  age: { kind: 'age_years', years: 10 },
  revision: 1,
}));
function row(
  id: string,
  score: number,
  baseline: number,
  skillId: string,
  level: number
): ParticipantProgressView {
  return {
    participantId: id,
    level,
    skillScores: { [skillId]: score },
    skillComments: {},
    revision: 1,
    dailyProgress: {
      date: participantProgressDayKey(now),
      timeZone: 'Asia/Almaty',
      baselineLevel: level,
      baselineSkillScores: { [skillId]: baseline },
      complete: true,
    },
  };
}
const a = row(firstId, 8, 3, firstSkill.id, 1);
const b = row(secondId, 15, 6, secondSkill.id, 3);
function Harness({ participants = managed }: { participants?: ManagedParticipantOption[] }) {
  const { selectedParticipantId, selectParticipant } = useCabinetProgressParticipantSelection({
    accountId: 'account_daily_test',
    participants,
    loading: false,
  });
  const progress = useParticipantProgressStore((state) =>
    selectedParticipantId ? state.byId[selectedParticipantId] : undefined
  );
  const profiles = toCabinetParticipantAvatarItems(participants);
  return (
    <>
      <CabinetParticipantAvatarSwitcher
        items={profiles}
        selectedParticipantId={selectedParticipantId}
        onSelect={selectParticipant}
        fallbackDisplayName="Owner"
        groupLabel="Participants"
        switchToParticipantLabel="Select {name}"
      />
      <TodayProgressBlock
        selectedParticipantId={selectedParticipantId}
        scopeParticipant={
          participants.length > 1
            ? profiles.find((item) => item.participantId === selectedParticipantId)
            : undefined
        }
        progress={buildParticipantTodayProgress(
          selectedParticipantId,
          progress,
          DEFAULT_SKILL_CONFIG,
          'en',
          now
        )}
        achievementsConfig={DEFAULT_ACHIEVEMENTS_CONFIG}
        skillConfig={DEFAULT_SKILL_CONFIG}
      />
    </>
  );
}
function block() {
  return screen.getByText('Today’s Progress').parentElement!.parentElement!;
}
function xp() {
  return screen.getByText('Today’s Earned XP').parentElement!;
}
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(now);
  useCabinetProgressParticipantSelectionStore.getState().reset();
  useParticipantProgressStore.getState().clear();
  useParticipantProgressStore.getState().setItems([a, b]);
  useAccountParticipantLessonStatsStore.getState().reset();
  useAccountParticipantLessonStatsStore
    .getState()
    .setLoading({ accountId: 'account_daily_test', generation: 1 });
  useAccountParticipantLessonStatsStore
    .getState()
    .replaceItems({ accountId: 'account_daily_test', generation: 1, items: [] });
  useParticipantAchievementsStore.getState().clear();
  useParticipantAchievementsStore.getState().setItems(
    [firstId, secondId].map((participantId, index) => ({
      participantId,
      revision: 1,
      earned: {
        [index ? 'ten_lessons' : 'first_lesson']: {
          earnedAt: timestampFromDate(now),
          source: 'participant_attendance' as const,
        },
      },
      updatedAt: timestampFromDate(now),
    }))
  );
});
afterEach(() => vi.useRealTimers());

describe('participant daily progress block', () => {
  it('switches XP, current level, trainer scores and persisted achievements through the shared header state', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const root = block();
    expect(xp()).toHaveTextContent('+5 XP');
    expect(within(root).getByText(/Current score: 8/)).toBeInTheDocument();
    expect(within(root).getByText('Level 1')).toBeInTheDocument();
    expect(within(root).queryByText(/Current score: 15/)).toBeNull();
    const beforeAchievements =
      within(root).getByText('New achievements today:').parentElement!.textContent;
    await user.click(screen.getByRole('button', { name: 'Select Bob' }));
    expect(block()).toBe(root);
    expect(xp()).toHaveTextContent('+9 XP');
    expect(within(root).getByText(/Current score: 15/)).toBeInTheDocument();
    expect(within(root).queryByText(/Current score: 8/)).toBeNull();
    expect(within(root).getByText('Level 3')).toBeInTheDocument();
    expect(within(root).getByText('New achievements today:').parentElement!.textContent).not.toBe(
      beforeAchievements
    );
    const scopes = root.querySelectorAll('[data-participant-scope]');
    expect(scopes).toHaveLength(1);
    expect(scopes[0]).toHaveTextContent('Bob');
    expect(
      screen
        .getByText('New achievements today:')
        .parentElement!.querySelector('[data-participant-scope]')
    ).toBeNull();
  });
  it('has one scope indicator in the whole-block header and none inside achievements', () => {
    render(<Harness />);
    expect(block().querySelectorAll('[data-participant-scope]')).toHaveLength(1);
    expect(
      screen.getByText('Today’s Progress').parentElement!.querySelector('[data-participant-scope]')
    ).toHaveTextContent('Alice');
    expect(
      screen
        .getByText('New achievements today:')
        .parentElement!.querySelector('[data-participant-scope]')
    ).toBeNull();
  });
  it('hides the whole-block badge for a sole participant', () => {
    render(<Harness participants={managed.slice(1)} />);
    expect(block().querySelector('[data-participant-scope]')).toBeNull();
    expect(xp()).toHaveTextContent('+9 XP');
  });
  it('reacts to the selected canonical row update without a reload or remount', () => {
    render(<Harness />);
    const root = block();
    act(() =>
      useParticipantProgressStore
        .getState()
        .upsertItem({ ...a, skillScores: { [firstSkill.id]: 10 }, revision: 2 })
    );
    expect(block()).toBe(root);
    expect(xp()).toHaveTextContent('+7 XP');
  });
  it('shows unknown daily evidence without claiming zero XP or no trainer scores', () => {
    useParticipantProgressStore.getState().upsertItem({ ...a, dailyProgress: undefined });
    render(<Harness />);
    expect(xp()).toHaveTextContent('— XP');
    expect(xp()).not.toHaveTextContent('+0 XP');
    expect(within(block()).getByText('Level 1')).toBeInTheDocument();
    expect(within(block()).getByText('New achievements today:')).toBeInTheDocument();
    expect(
      screen.getByText('Today’s exercise score history is not available yet.')
    ).toBeInTheDocument();
    expect(screen.queryByText('No exercise XP assigned by instructor today yet.')).toBeNull();
  });
  it('never uses another participant row or reconstructs daily XP from a current total', () => {
    expect(buildParticipantTodayProgress(firstId, b).level).toBeUndefined();
    expect(
      buildParticipantTodayProgress(firstId, { ...a, dailyProgress: undefined }).todayXP
    ).toBeNull();
    expect(
      buildParticipantTodayProgress(
        firstId,
        { ...a, dailyProgress: { ...a.dailyProgress!, complete: false } },
        DEFAULT_SKILL_CONFIG,
        'en',
        now
      ).todayXP
    ).toBeNull();
    expect(
      buildParticipantTodayProgress(
        firstId,
        a,
        DEFAULT_SKILL_CONFIG,
        'en',
        new Date('2026-10-06T19:00:00Z')
      ).exercises
    ).toEqual([]);
  });
  it('preserves daily evidence from the read model and measures net gains rather than duplicate updates', () => {
    const view = toParticipantProgressView({ ...a, participantId: firstId });
    expect(view.dailyProgress).toEqual(a.dailyProgress);
    expect(
      buildParticipantTodayProgress(
        firstId,
        { ...view, skillScores: { [firstSkill.id]: 6 } },
        DEFAULT_SKILL_CONFIG,
        'en',
        now
      ).todayXP
    ).toBe(3);
  });
});
