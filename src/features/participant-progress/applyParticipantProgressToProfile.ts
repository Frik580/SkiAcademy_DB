import type { UserProfile } from '../../types';
import { AccountIdSchema } from '@ski-academy/shared-domain/canonical/identifiers';
import { selfParticipantIdFromAccountId } from '@ski-academy/shared-domain/canonical/deterministicIdentity';
import { type ParticipantProgressReadModel } from '@ski-academy/shared-domain';
import type { ParticipantDailyProgress } from '@ski-academy/shared-domain';

export interface ParticipantProgressView {
  readonly participantId: string;
  readonly level: number;
  readonly skillScores: Record<string, number>;
  readonly skillComments: Record<string, string>;
  readonly revision: number;
  readonly dailyProgress?: ParticipantDailyProgress;
}

export function toParticipantProgressView(
  item: ParticipantProgressReadModel
): ParticipantProgressView {
  return {
    participantId: item.participantId,
    level: item.level,
    skillScores: { ...item.skillScores },
    skillComments: { ...item.skillComments },
    revision: item.revision,
    ...(item.dailyProgress ? { dailyProgress: item.dailyProgress } : {}),
  };
}

export function emptyParticipantProgressView(participantId: string): ParticipantProgressView {
  return {
    participantId,
    level: 1,
    skillScores: {},
    skillComments: {},
    revision: 0,
  };
}

export function resolveSelfParticipantIdFromAccount(accountId: string): string | undefined {
  const parsed = AccountIdSchema.safeParse(accountId);
  if (!parsed.success) return undefined;
  return selfParticipantIdFromAccountId(parsed.data);
}

/**
 * Overlay canonical participant progress onto the signed-in account profile
 * for existing presentational consumers. This overlay does not resolve the
 * Today checklist; cabinet presentation applies participantTodayChecklists
 * separately. hideProgressTracking stays account-scoped.
 * Missing canonical progress is empty start. Leftover `/users` level/skillScores/
 * skillComments are stripped and are never fallback authority.
 */
export function applyParticipantProgressToProfile(
  profile: UserProfile,
  progress: ParticipantProgressView | undefined
): UserProfile {
  if (!progress) {
    return {
      ...profile,
      level: undefined,
      skillScores: undefined,
      skillComments: undefined,
    };
  }
  return {
    ...profile,
    level: progress.level,
    skillScores: { ...progress.skillScores },
    skillComments: { ...progress.skillComments },
  };
}

export function overlaySelfParticipantProgress(
  profile: UserProfile,
  byId: Readonly<Record<string, ParticipantProgressView>>
): UserProfile {
  const selfId = resolveSelfParticipantIdFromAccount(profile.uid);
  if (!selfId) {
    return applyParticipantProgressToProfile(profile, undefined);
  }
  return applyParticipantProgressToProfile(
    profile,
    byId[selfId] ?? emptyParticipantProgressView(selfId)
  );
}

/**
 * Resolve progress for exactly one Participant. Never returns another
 * Participant's cached row, even if the store still holds it.
 */
export function selectCabinetProgressView(
  byId: Readonly<Record<string, ParticipantProgressView>>,
  participantId: string | undefined
): ParticipantProgressView | undefined {
  if (!participantId) {
    return undefined;
  }
  const cached = byId[participantId];
  if (cached && cached.participantId === participantId) {
    return cached;
  }
  return emptyParticipantProgressView(participantId);
}
