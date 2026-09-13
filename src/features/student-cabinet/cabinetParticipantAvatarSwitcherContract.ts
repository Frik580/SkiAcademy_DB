import type { ManagedParticipantOption } from '../lesson-bookings/lessonBookingContracts';
import { resolveParticipantAvatarUrl } from '../participants/participantManagementContracts';

export interface CabinetParticipantAvatarItem {
  readonly participantId: string;
  readonly displayName: string;
  readonly authority: 'self' | 'parent_guardian';
  readonly avatarUrl?: string;
}

export interface CabinetParticipantAvatarSwitcherProps {
  readonly items: readonly CabinetParticipantAvatarItem[];
  readonly selectedParticipantId?: string;
  readonly onSelect: (participantId: string) => void;
  readonly fallbackDisplayName: string;
  readonly fallbackAvatarUrl?: string;
  readonly groupLabel: string;
  /** e.g. "Switch to participant {name}" / "Переключиться на участника {name}" */
  readonly switchToParticipantLabel: string;
  readonly showName?: boolean;
}

/** Self first, then dependents in read-model order. */
export function orderCabinetParticipantAvatarItems(
  participants: readonly ManagedParticipantOption[]
): ManagedParticipantOption[] {
  const self = participants.filter((participant) => participant.authority === 'self');
  const dependents = participants.filter((participant) => participant.authority !== 'self');
  return [...self, ...dependents];
}

export function toCabinetParticipantAvatarItems(
  participants: readonly ManagedParticipantOption[],
  legacySelfAvatarUrl?: string
): CabinetParticipantAvatarItem[] {
  return orderCabinetParticipantAvatarItems(participants).map((participant) => {
    const avatarUrl = resolveParticipantAvatarUrl({
      avatarUrl: participant.avatarUrl,
      authority: participant.authority,
      legacySelfAvatarUrl,
    });
    return {
      participantId: participant.participantId,
      displayName: participant.displayName,
      authority: participant.authority,
      ...(avatarUrl ? { avatarUrl } : {}),
    };
  });
}

export function firstNameOf(displayName: string): string {
  const trimmed = displayName.trim();
  if (!trimmed) return displayName;
  return trimmed.split(/\s+/)[0] ?? trimmed;
}

export function formatSwitchToParticipantLabel(template: string, name: string): string {
  return template.replace('{name}', name);
}
