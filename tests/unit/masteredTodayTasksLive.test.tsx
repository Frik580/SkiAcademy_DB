import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useCurrentUserProfileSync } from '../../src/features/profile/sync/useCurrentUserProfileSync';
import { useProfileStore } from '../../src/features/profile/profileStore';
import { TodayChecklist } from '../../src/features/profile/components/TodayChecklist';
import { applyParticipantTodayChecklistToProfile } from '../../src/features/student-cabinet/participantTodayChecklist';
import { getTodayTasks } from '../../src/features/student-cabinet/components/student/studentSkillProgress';
import { SkillRadarChart } from '../../src/features/student-cabinet/components/student/SkillRadarChart';
import type { UserProfile } from '../../src/types';
import { DEFAULT_SKILL_CONFIG } from '../../src/domain/achievements';

const live = vi.hoisted(() => ({
  receive: undefined as undefined | ((snapshot: unknown) => void),
}));
vi.mock('../../src/features/auth/authStore', () => ({
  useAuthStore: (select: (state: unknown) => unknown) =>
    select({ firebaseUser: { uid: 'account-live-today' } }),
}));
vi.mock('../../src/infrastructure/firebase', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/infrastructure/firebase')>()),
  onSnapshot: vi.fn((_ref, receive) => {
    live.receive = receive;
    return vi.fn();
  }),
}));
vi.mock('../../src/app/providers/LanguageContext', () => ({
  useLanguage: () => ({ language: 'en', t: (key: string) => key }),
}));

const skill = {
  ...DEFAULT_SKILL_CONFIG.items[0],
  id: 'carving',
  title: 'Карвинг',
  titleEn: 'Carving',
  maxPoints: 25,
};
const config = { ...DEFAULT_SKILL_CONFIG, items: [skill] };
const participantId = 'participant-live-today';
function CabinetToday() {
  useCurrentUserProfileSync();
  const profile = useProfileStore((state) => state.userProfile);
  if (!profile) return null;
  const selected = applyParticipantTodayChecklistToProfile(profile, participantId);
  return <TodayChecklist tasks={getTodayTasks(selected, 'en', config)} bookings={[]} />;
}
afterEach(() => {
  useProfileStore.getState().resetProfileState();
  vi.unstubAllGlobals();
});

describe('mastered Today task live update', () => {
  it('removes the task from the mounted UI on the saved account snapshot, without refreshing progress or remounting', () => {
    render(<CabinetToday />);
    const account = {
      uid: 'account-live-today',
      email: 'live@example.com',
      displayName: 'Student',
      role: 'user',
      participantTodayChecklists: {
        [participantId]: {
          todaySkillItemIds: ['carving'],
          customTodayTasks: [{ id: 'stretch', text: 'Stretch' }],
          completedTodayTaskIds: ['skill:carving'],
          completedTodayDate: '2026-01-01',
        },
      },
    };
    const emit = (profile: unknown) =>
      act(() => live.receive!({ exists: () => true, id: account.uid, data: () => profile }));
    emit(account);
    expect(screen.getByText('Carving')).toBeInTheDocument();
    emit({
      ...account,
      participantTodayChecklists: {
        [participantId]: {
          ...account.participantTodayChecklists[participantId],
          todaySkillItemIds: [],
        },
      },
    });
    expect(screen.queryByText('Carving')).not.toBeInTheDocument();
    expect(screen.getByText('Stretch')).toBeInTheDocument();
    expect(
      useProfileStore.getState().userProfile?.participantTodayChecklists?.[participantId]
        ?.completedTodayTaskIds
    ).toEqual(['skill:carving']);
  });

  it('keeps the existing max-score add guard and makes a lowered current score available again', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    const toggle = vi.fn();
    const profile = {
      uid: 'account-live-today',
      level: 1,
      skillScores: { carving: 25 },
      todaySkillItemIds: [],
    } as unknown as UserProfile;
    const { rerender } = render(
      <SkillRadarChart userProfile={profile} skillConfig={config} onToggleSkillToday={toggle} />
    );
    expect(screen.queryByTitle('scAddToToday')).not.toBeInTheDocument();
    expect(toggle).not.toHaveBeenCalled();
    rerender(
      <SkillRadarChart
        userProfile={{ ...profile, skillScores: { carving: 24 } }}
        skillConfig={config}
        onToggleSkillToday={toggle}
      />
    );
    const add = screen.getByTitle('scAddToToday');
    expect(add).toBeEnabled();
    expect(toggle).not.toHaveBeenCalled();
    fireEvent.click(add);
    expect(toggle).toHaveBeenCalledWith('carving', true);
  });
});
