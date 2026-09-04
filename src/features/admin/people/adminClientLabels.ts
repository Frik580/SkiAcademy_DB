import type { AdminClientManagedParticipant } from './adminClientContracts';
import type { useAdminClientTranslations } from './useAdminClientTranslations';

type ClientText = ReturnType<typeof useAdminClientTranslations>['text'];

export function adminClientLifecycleLabel(
  lifecycle: 'active' | 'disabled' | 'uninitialized',
  text: ClientText
): string {
  if (lifecycle === 'active') return text.lifecycleActive;
  if (lifecycle === 'disabled') return text.lifecycleDisabled;
  return text.lifecycleUninitialized;
}

export function adminClientParticipantLifecycleLabel(
  lifecycle: 'active' | 'archived',
  text: ClientText
): string {
  return lifecycle === 'archived' ? text.participantArchived : text.participantActive;
}

export function adminClientRelationshipLabel(
  authority: 'self' | 'parent_guardian',
  text: ClientText
): string {
  return authority === 'self' ? text.relationshipSelf : text.relationshipGuardian;
}

export function adminClientDisciplineLabel(
  discipline: 'ski' | 'snowboard' | undefined,
  text: ClientText
): string | undefined {
  if (discipline === 'ski') return text.ski;
  if (discipline === 'snowboard') return text.snowboard;
  return undefined;
}

export function adminClientSkillLevelLabel(skillLevel: string | undefined): string | undefined {
  return skillLevel?.trim() || undefined;
}

export function adminClientAgeLabel(
  age: AdminClientManagedParticipant['age'] | undefined,
  text: ClientText
): string | undefined {
  if (!age) return undefined;
  if (age.kind === 'birth_date') return age.birthDate;
  return `${age.years} ${text.ageYears}`;
}

export function formatAdminClientKzt(amount: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'KZT',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}
