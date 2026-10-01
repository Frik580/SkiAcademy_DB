import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ParticipantLessonFeedbackReadModel } from '@ski-academy/shared-domain';
import { DEFAULT_SKILL_CONFIG } from '../../src/domain/achievements';
import { resolveSelfParticipantIdFromAccount } from '../../src/features/participant-progress/applyParticipantProgressToProfile';
import { updateParticipantTodayChecklistService } from '../../src/features/profile/profileService';
import { useProfileStore } from '../../src/features/profile/profileStore';
import { useCabinetProgressParticipantSelectionStore } from '../../src/features/student-cabinet/cabinetProgressParticipantSelectionStore';
import {
  applyParticipantTodayChecklistToProfile,
  resolveParticipantTodayChecklist,
} from '../../src/features/student-cabinet/participantTodayChecklist';
import { buildCanonicalRecommendationTodayTasks } from '../../src/features/student-cabinet/studentLessonFeedbackPresentation';
import {
  buildAddCustomTodayTaskUpdate,
  buildRemoveTodayTaskUpdate,
  buildToggleSkillTodayUpdate,
  buildToggleTodayCompleteUpdate,
} from '../../src/features/student-cabinet/todayChecklist';
import {
  getPrioritySkillItems,
  getTodayTasks,
} from '../../src/features/student-cabinet/components/student/studentSkillProgress';
import type { UserProfile } from '../../src/types';

vi.mock('../../src/features/profile/profileService', () => ({
  updateUserProfileService: vi.fn(),
  updateUserRoleService: vi.fn(),
  addUserService: vi.fn(),
  updateUserDataWithoutMoneyService: vi.fn(),
  dismissReviewService: vi.fn(),
  updateParticipantTodayChecklistService: vi.fn(async () => undefined),
}));

const accountId = 'account-today-1';
const selfId = resolveSelfParticipantIdFromAccount(accountId)!;
const participantA = 'participant-a';
const participantB = 'participant-b';
const participantC = 'participant-c';
const today = new Date().toISOString().split('T')[0];

const baseProfile = (): UserProfile => ({
  uid: accountId,
  email: 'owner@example.com',
  displayName: 'Account Owner',
  role: 'user',
  avatarUrl: '',
  hideProgressTracking: false,
  level: 1,
  skillScores: {},
  todaySkillItemIds: ['legacy-skill'],
  customTodayTasks: [{ id: 'legacy-custom', text: 'Legacy stretch' }],
  completedTodayTaskIds: ['skill:legacy-skill'],
  completedTodayDate: today,
  dismissedTodayTaskIds: ['legacy-rec'],
  participantTodayChecklists: {
    [participantA]: {
      todaySkillItemIds: ['skill-a', 'skill-x'],
      customTodayTasks: [{ id: 'custom-a', text: 'Task A' }],
      completedTodayTaskIds: ['skill:skill-x'],
      completedTodayDate: today,
      dismissedTodayTaskIds: ['booking_a_item_1'],
    },
    [participantB]: {
      todaySkillItemIds: ['skill-b', 'skill-x'],
      customTodayTasks: [{ id: 'custom-b', text: 'Task B' }],
      completedTodayTaskIds: [],
      completedTodayDate: today,
      dismissedTodayTaskIds: [],
    },
  },
});

const mergeChecklist = (profile: UserProfile, update: Partial<UserProfile>): UserProfile => ({
  ...profile,
  participantTodayChecklists:
    update.participantTodayChecklists ?? profile.participantTodayChecklists,
});

const skillIds = (profile: UserProfile) => profile.todaySkillItemIds ?? [];

describe('participant today checklist isolation', () => {
  it('switches pinned exercises with the selected participant', () => {
    const profile = baseProfile();
    expect(skillIds(applyParticipantTodayChecklistToProfile(profile, participantA))).toEqual([
      'skill-a',
      'skill-x',
    ]);
    expect(skillIds(applyParticipantTodayChecklistToProfile(profile, participantB))).toEqual([
      'skill-b',
      'skill-x',
    ]);
    expect(skillIds(applyParticipantTodayChecklistToProfile(profile, participantB))).not.toContain(
      'skill-a'
    );
  });

  it('keeps custom tasks on the participant that created them', () => {
    const profile = baseProfile();
    const tasksA = getTodayTasks(
      applyParticipantTodayChecklistToProfile(profile, participantA),
      'en'
    );
    const tasksB = getTodayTasks(
      applyParticipantTodayChecklistToProfile(profile, participantB),
      'en'
    );
    expect(tasksA.map((task) => task.label)).toContain('Task A');
    expect(tasksA.map((task) => task.label)).not.toContain('Task B');
    expect(tasksB.map((task) => task.label)).toContain('Task B');
    expect(tasksB.map((task) => task.label)).not.toContain('Task A');
  });

  it('does not share completion of the same skill task', () => {
    const profile = baseProfile();
    const doneFor = (participantId: string) =>
      getTodayTasks(applyParticipantTodayChecklistToProfile(profile, participantId), 'en').find(
        (task) => task.id === 'skill:skill-x'
      )?.done;
    expect(doneFor(participantA)).toBe(true);
    expect(doneFor(participantB)).toBe(false);
  });

  it('pins a development exercise only for the selected participant', () => {
    const profile = baseProfile();
    const update = buildToggleSkillTodayUpdate(profile, participantB, 'l1_1', true);
    const merged = mergeChecklist(profile, update);
    const pinnedFor = (participantId: string) =>
      getPrioritySkillItems(
        applyParticipantTodayChecklistToProfile(merged, participantId),
        DEFAULT_SKILL_CONFIG,
        20
      ).find((item) => item.id === 'l1_1')?.pinned;

    expect(update.participantTodayChecklists?.[participantA]?.todaySkillItemIds).toEqual([
      'skill-a',
      'skill-x',
    ]);
    expect(pinnedFor(participantB)).toBe(true);
    expect(pinnedFor(participantA)).toBe(false);
    expect(skillIds(applyParticipantTodayChecklistToProfile(merged, participantA))).not.toContain(
      'l1_1'
    );
  });

  it('unpins an exercise for one participant without changing the other', () => {
    const profile = baseProfile();
    const update = buildToggleSkillTodayUpdate(profile, participantB, 'skill-b', false);
    const merged = mergeChecklist(profile, update);
    expect(skillIds(applyParticipantTodayChecklistToProfile(merged, participantB))).not.toContain(
      'skill-b'
    );
    expect(skillIds(applyParticipantTodayChecklistToProfile(merged, participantA))).toEqual([
      'skill-a',
      'skill-x',
    ]);
  });

  it('keeps instructor recommendations and dismissals on their participant', () => {
    const profile = baseProfile();
    const feedback = (
      participantId: string,
      lessonBookingId: string,
      text: string
    ): ParticipantLessonFeedbackReadModel => ({
      feedbackId: `feedback_${participantId}` as never,
      participantId: participantId as never,
      lessonBookingId: lessonBookingId as never,
      instructorId: 'instructor_01' as never,
      items: [{ itemId: 'item_1', text, completed: false }],
      revision: 1,
      lessonDate: '2026-09-10',
    });
    const fromDate = new Date('2026-09-11T12:00:00');
    const items = [
      feedback(participantA, 'booking_a', 'Recommendation A'),
      feedback(participantB, 'booking_b', 'Recommendation B'),
    ];
    const recommendationsFor = (participantId: string) => {
      const view = applyParticipantTodayChecklistToProfile(profile, participantId);
      return buildCanonicalRecommendationTodayTasks({
        items,
        participantId,
        dismissedTaskIds: new Set(view.dismissedTodayTaskIds ?? []),
        language: 'en',
        fromDate,
      });
    };

    const recA = recommendationsFor(participantA);
    const recB = recommendationsFor(participantB);
    expect(recA.map((task) => task.label)).toEqual([]);
    expect(recB.map((task) => task.label)).toEqual(['Recommendation B']);

    const todayB = getTodayTasks(
      applyParticipantTodayChecklistToProfile(profile, participantB),
      'en',
      undefined,
      recB
    );
    expect(todayB.map((task) => task.label)).toContain('Recommendation B');
    expect(todayB.map((task) => task.label)).not.toContain('Recommendation A');
  });

  it('shows an empty checklist for a participant with no training state', () => {
    const view = applyParticipantTodayChecklistToProfile(baseProfile(), participantC);
    expect(view.todaySkillItemIds).toEqual([]);
    expect(view.customTodayTasks).toEqual([]);
    expect(view.completedTodayTaskIds).toEqual([]);
    expect(view.dismissedTodayTaskIds).toEqual([]);
    expect(view.todaySkillItemIds).not.toContain('legacy-skill');
    expect(view.todaySkillItemIds).not.toContain('skill-a');
  });

  it('reads legacy account checklist only for self and copies it on the first write', () => {
    const profile = baseProfile();
    const selfView = applyParticipantTodayChecklistToProfile(profile, selfId);
    expect(selfView.todaySkillItemIds).toEqual(['legacy-skill']);
    expect(selfView.customTodayTasks?.map((task) => task.text)).toEqual(['Legacy stretch']);

    const update = buildToggleSkillTodayUpdate(profile, selfId, 'skill-new', true);
    expect(update.todaySkillItemIds).toBeUndefined();
    expect(update.customTodayTasks).toBeUndefined();
    expect(update.participantTodayChecklists?.[selfId]?.todaySkillItemIds).toEqual([
      'legacy-skill',
      'skill-new',
    ]);
    expect(update.participantTodayChecklists?.[participantA]?.todaySkillItemIds).toEqual([
      'skill-a',
      'skill-x',
    ]);

    const migrated = mergeChecklist(profile, update);
    migrated.todaySkillItemIds = ['legacy-skill', 'should-not-reappear'];
    expect(resolveParticipantTodayChecklist(migrated, selfId).todaySkillItemIds).toEqual([
      'legacy-skill',
      'skill-new',
    ]);
    expect(resolveParticipantTodayChecklist(migrated, participantB).todaySkillItemIds).toEqual([
      'skill-b',
      'skill-x',
    ]);
  });

  it('restores each participant checklist when selection returns', () => {
    const profile = baseProfile();
    const firstA = applyParticipantTodayChecklistToProfile(profile, participantA);
    const switched = applyParticipantTodayChecklistToProfile(profile, participantB);
    const returned = applyParticipantTodayChecklistToProfile(profile, participantA);
    expect(skillIds(switched)).toEqual(['skill-b', 'skill-x']);
    expect(skillIds(returned)).toEqual(skillIds(firstA));
    expect(returned.customTodayTasks).toEqual(firstA.customTodayTasks);
    expect(returned.completedTodayTaskIds).toEqual(firstA.completedTodayTaskIds);
    expect(returned.dismissedTodayTaskIds).toEqual(firstA.dismissedTodayTaskIds);
  });

  it('leaves wallet, preferences, and account identity outside the checklist write', () => {
    const profile = baseProfile();
    const view = applyParticipantTodayChecklistToProfile(profile, participantB);
    expect(view.uid).toBe(accountId);
    expect(view.displayName).toBe('Account Owner');
    expect(view.hideProgressTracking).toBe(false);
    expect(view.email).toBe(profile.email);

    const update = buildAddCustomTodayTaskUpdate(profile, participantB, 'Only B');
    expect(Object.keys(update ?? {})).toEqual(['participantTodayChecklists']);
    expect(update?.displayName).toBeUndefined();
    expect(update?.hideProgressTracking).toBeUndefined();
    expect(update?.participantTodayChecklists?.[participantA]?.customTodayTasks).toEqual([
      { id: 'custom-a', text: 'Task A' },
    ]);
    expect(
      update?.participantTodayChecklists?.[participantB]?.customTodayTasks?.map((task) => task.text)
    ).toEqual(['Task B', 'Only B']);

    const completed = buildToggleTodayCompleteUpdate(
      profile,
      participantB,
      'custom:custom-b',
      true
    );
    expect(completed.participantTodayChecklists?.[participantA]?.completedTodayTaskIds).toEqual([
      'skill:skill-x',
    ]);
    expect(completed.participantTodayChecklists?.[participantB]?.completedTodayTaskIds).toEqual([
      'custom:custom-b',
    ]);

    const removed = buildRemoveTodayTaskUpdate(profile, participantA, {
      id: 'custom:custom-a',
      kind: 'custom',
      customTaskId: 'custom-a',
    });
    expect(removed.participantTodayChecklists?.[participantA]?.customTodayTasks).toEqual([]);
    expect(removed.participantTodayChecklists?.[participantB]?.customTodayTasks).toEqual([
      { id: 'custom-b', text: 'Task B' },
    ]);
  });
});

describe('participant today checklist writes follow header selection', () => {
  const updateChecklist = vi.mocked(updateParticipantTodayChecklistService);

  beforeEach(() => {
    updateChecklist.mockClear();
    useCabinetProgressParticipantSelectionStore.getState().reset();
    useProfileStore.setState({ userProfile: baseProfile() });
  });

  it('writes and restores only the selected participant', async () => {
    const participants = [{ participantId: participantA }, { participantId: participantB }];
    useCabinetProgressParticipantSelectionStore
      .getState()
      .selectParticipant(participantB, participants);

    await useProfileStore.getState().handleToggleSkillToday('l1_1', true);

    expect(updateChecklist).toHaveBeenCalledTimes(1);
    expect(updateChecklist.mock.calls[0]?.[0]).toBe(accountId);
    expect(updateChecklist.mock.calls[0]?.[1]).toBe(participantB);
    expect(updateChecklist.mock.calls[0]?.[2].todaySkillItemIds).toEqual([
      'skill-b',
      'skill-x',
      'l1_1',
    ]);

    const afterPin = useProfileStore.getState().userProfile!;
    expect(afterPin.displayName).toBe('Account Owner');
    expect(afterPin.hideProgressTracking).toBe(false);
    expect(afterPin.participantTodayChecklists?.[participantA]?.todaySkillItemIds).toEqual([
      'skill-a',
      'skill-x',
    ]);
    expect(skillIds(applyParticipantTodayChecklistToProfile(afterPin, participantB))).toContain(
      'l1_1'
    );

    useCabinetProgressParticipantSelectionStore
      .getState()
      .selectParticipant(participantA, participants);
    expect(skillIds(applyParticipantTodayChecklistToProfile(afterPin, participantA))).toEqual([
      'skill-a',
      'skill-x',
    ]);

    useCabinetProgressParticipantSelectionStore
      .getState()
      .selectParticipant(participantB, participants);
    await useProfileStore.getState().handleToggleSkillToday('l1_1', false);
    const afterUnpin = useProfileStore.getState().userProfile!;
    expect(
      skillIds(applyParticipantTodayChecklistToProfile(afterUnpin, participantB))
    ).not.toContain('l1_1');
    expect(skillIds(applyParticipantTodayChecklistToProfile(afterUnpin, participantA))).toEqual([
      'skill-a',
      'skill-x',
    ]);
  });

  it('does not write the account checklist when no participant is selected', async () => {
    const before = useProfileStore.getState().userProfile;
    await useProfileStore.getState().handleToggleSkillToday('l1_1', true);
    expect(updateChecklist).not.toHaveBeenCalled();
    expect(useProfileStore.getState().userProfile).toEqual(before);
  });
});
