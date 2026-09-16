import React, { useMemo, useRef, useState } from 'react';
import { Camera, Loader2, Pencil, Plus, UserRound } from 'lucide-react';
import { useLanguage } from '../../../app/providers/LanguageContext';
import { ActionButton } from '../../../ui/ActionButton';
import type { UserProfile } from '../../../types';
import { uploadImage } from '../../../infrastructure/firebase';
import { logger } from '../../../shared';
import { optimizeProfileImage } from '../../student-cabinet/components/profileImage';
import type { ManagedParticipantOption } from '../../lesson-bookings/lessonBookingContracts';
import { useManagedParticipants } from '../../lesson-bookings/useManagedParticipants';
import { presentCanonicalCommandErrorWithContext } from '../../lesson-bookings/presentCanonicalCommandError';
import {
  buildManagedParticipantProfileUpdateInput,
  hasManagedParticipantProfileChanges,
  participantAvatarStoragePath,
  readParticipantProfileEditState,
  readAgeYearsFromParticipantAge,
  readBirthDateFromParticipantAge,
  resolveParticipantAvatarUrl,
  type CreateDependentParticipantInput,
  type ManagedParticipantProfileEditState,
} from '../participantManagementContracts';
import { useParticipantManagementCommands } from '../useParticipantManagementCommands';

interface ParticipantManagementPanelProps {
  readonly accountId: string;
  readonly userProfile?: UserProfile;
  readonly onUpdateAccountContact?: (patch: Pick<UserProfile, 'phoneNumber'>) => Promise<void>;
  readonly onInvalidAvatarFile?: () => void;
  readonly onAvatarUploadSuccess?: () => void;
  readonly onAvatarUploadError?: () => void;
}

type EditorMode =
  | { readonly kind: 'closed' }
  | { readonly kind: 'create' }
  | { readonly kind: 'edit'; readonly participant: ManagedParticipantOption };

const DEFAULT_CREATE_FORM: CreateDependentParticipantInput = {
  displayName: '',
  ageYears: 8,
  skillLevel: 'beginner',
  discipline: 'ski',
};

export const ParticipantManagementPanel: React.FC<ParticipantManagementPanelProps> = ({
  accountId,
  userProfile,
  onUpdateAccountContact,
  onInvalidAvatarFile,
  onAvatarUploadSuccess,
  onAvatarUploadError,
}) => {
  const { t } = useLanguage();
  const { participants, loading, error, reload } = useManagedParticipants(accountId);
  const { createDependentParticipant, updateManagedParticipantProfile } =
    useParticipantManagementCommands(accountId);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [editorMode, setEditorMode] = useState<EditorMode>({ kind: 'closed' });
  const [formError, setFormError] = useState<string | undefined>();
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [createForm, setCreateForm] =
    useState<CreateDependentParticipantInput>(DEFAULT_CREATE_FORM);
  const [editForm, setEditForm] = useState<ManagedParticipantProfileEditState | null>(null);
  const [phoneNumber, setPhoneNumber] = useState(userProfile?.phoneNumber ?? '');

  const selfParticipant = useMemo(
    () => participants.find((participant) => participant.authority === 'self'),
    [participants]
  );
  const dependentParticipants = useMemo(
    () => participants.filter((participant) => participant.authority === 'parent_guardian'),
    [participants]
  );

  const openCreate = () => {
    setFormError(undefined);
    setCreateForm(DEFAULT_CREATE_FORM);
    setEditorMode({ kind: 'create' });
  };

  const openEdit = (participant: ManagedParticipantOption) => {
    setFormError(undefined);
    setEditForm(readParticipantProfileEditState(participant));
    if (participant.authority === 'self') {
      setPhoneNumber(userProfile?.phoneNumber ?? '');
    }
    setEditorMode({ kind: 'edit', participant });
  };

  const closeEditor = () => {
    setEditorMode({ kind: 'closed' });
    setEditForm(null);
    setFormError(undefined);
  };

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!createForm.displayName.trim()) {
      setFormError(t('participantsDisplayNameRequired'));
      return;
    }
    setIsSaving(true);
    setFormError(undefined);
    try {
      await createDependentParticipant(createForm);
      await reload();
      closeEditor();
    } catch (err) {
      const presented = presentCanonicalCommandErrorWithContext(err, {
        t: t as (key: string) => string,
      });
      setFormError(presented.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editForm || editorMode.kind !== 'edit' || !editForm.displayName?.trim()) {
      setFormError(t('participantsDisplayNameRequired'));
      return;
    }
    setIsSaving(true);
    setFormError(undefined);
    try {
      const isSelf = editorMode.participant.authority === 'self';
      const phoneDirty = isSelf && (phoneNumber.trim() || '') !== (userProfile?.phoneNumber ?? '');
      const profileDirty = hasManagedParticipantProfileChanges(editorMode.participant, editForm);

      if (!profileDirty && !phoneDirty) {
        closeEditor();
        return;
      }

      if (profileDirty) {
        await updateManagedParticipantProfile(
          buildManagedParticipantProfileUpdateInput(editorMode.participant, editForm)
        );
      }

      if (phoneDirty && onUpdateAccountContact) {
        await onUpdateAccountContact({
          phoneNumber: phoneNumber.trim() || undefined,
        });
      }

      await reload();
      closeEditor();
    } catch (err) {
      const presented = presentCanonicalCommandErrorWithContext(err, {
        t: t as (key: string) => string,
      });
      setFormError(presented.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleAvatarFile = async (file: File) => {
    if (editorMode.kind !== 'edit' || !editForm) {
      return;
    }
    if (!file.type.startsWith('image/')) {
      onInvalidAvatarFile?.();
      return;
    }

    setIsUploadingAvatar(true);
    setFormError(undefined);
    try {
      const blob = await optimizeProfileImage(file);
      const avatarUrl = await uploadImage(
        blob,
        participantAvatarStoragePath(editorMode.participant.participantId)
      );
      const nextEditForm = { ...editForm, avatarUrl };
      setEditForm(nextEditForm);
      await updateManagedParticipantProfile(
        buildManagedParticipantProfileUpdateInput(editorMode.participant, nextEditForm)
      );
      await reload();
      setEditorMode({
        kind: 'edit',
        participant: {
          ...editorMode.participant,
          avatarUrl,
          revision: editorMode.participant.revision + 1,
        },
      });
      setEditForm({ ...nextEditForm });
      onAvatarUploadSuccess?.();
    } catch (err) {
      logger.error(err);
      const presented = presentCanonicalCommandErrorWithContext(err, {
        t: t as (key: string) => string,
      });
      setFormError(presented.message);
      onAvatarUploadError?.();
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const fieldClassName =
    'w-full min-h-[2.75rem] rounded-lg border border-[var(--border-subtle)] bg-[var(--profile-bg)] px-3 py-2.5 text-sm text-[var(--ink)] focus:outline-none focus:border-[var(--accent)] transition box-border';

  const editingSelf = editorMode.kind === 'edit' && editorMode.participant.authority === 'self';
  const editorAvatarUrl =
    editorMode.kind === 'edit' && editForm
      ? resolveParticipantAvatarUrl({
          avatarUrl: editForm.avatarUrl,
          authority: editorMode.participant.authority,
          legacySelfAvatarUrl: userProfile?.avatarUrl,
        })
      : undefined;

  return (
    <section className="space-y-4 rounded-xl border border-[var(--border-subtle)] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-[var(--ink)]">
            {t('participantsManageTitle')}
          </h3>
          <p className="mt-1 text-xs text-[var(--ink-dim)]">{t('participantsManageSubtitle')}</p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] px-3 py-1.5 text-xs font-medium"
        >
          <Plus className="h-3.5 w-3.5" />
          {t('participantsCreateDependent')}
        </button>
      </div>

      {loading ? (
        <p className="text-xs text-[var(--ink-dim)]">{t('loading')}</p>
      ) : error ? (
        <div className="space-y-2">
          <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>
          <button
            type="button"
            onClick={() => void reload()}
            className="text-xs font-medium text-[var(--accent)] hover:underline"
          >
            {t('retry')}
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {!selfParticipant && (
            <p className="text-xs text-amber-700 dark:text-amber-300">
              {t('participantsSelfMissing')}
            </p>
          )}

          {[...(selfParticipant ? [selfParticipant] : []), ...dependentParticipants].map(
            (participant) => {
              const avatarUrl = resolveParticipantAvatarUrl({
                avatarUrl: participant.avatarUrl,
                authority: participant.authority,
                legacySelfAvatarUrl: userProfile?.avatarUrl,
              });
              return (
                <div
                  key={participant.participantId}
                  className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border-subtle)] px-3 py-2.5"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--profile-bg)] text-[var(--ink-dim)]">
                      {avatarUrl ? (
                        <img
                          src={avatarUrl}
                          alt={participant.displayName}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <UserRound className="h-4 w-4" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-[var(--ink)]">
                        {participant.displayName}
                      </p>
                      <p className="mt-1 text-[10px] uppercase tracking-wide text-[var(--ink-dim)]">
                        {participant.authority === 'self'
                          ? t('participantAuthoritySelf')
                          : t('participantAuthorityDependent')}
                        {' · '}
                        {participant.discipline} · {participant.skillLevel}
                      </p>
                      <p className="mt-1 text-[10px] text-[var(--ink-dim)]">
                        {t('participantsManagedByYou')}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => openEdit(participant)}
                    className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-subtle)] px-2.5 py-1.5 text-xs"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    {t('participantsEditProfile')}
                  </button>
                </div>
              );
            }
          )}

          {dependentParticipants.length === 0 && selfParticipant && (
            <p className="text-xs text-[var(--ink-dim)]">{t('participantsNoDependents')}</p>
          )}
        </div>
      )}

      {editorMode.kind !== 'closed' && (
        <form
          onSubmit={editorMode.kind === 'create' ? handleCreate : handleUpdate}
          className="space-y-3 rounded-lg border border-[var(--border-subtle)] bg-black/5 p-4 dark:bg-white/5"
        >
          <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--ink-dim)]">
            {editorMode.kind === 'create'
              ? t('participantsCreateDependent')
              : t('participantsEditProfile')}
          </h4>

          {editorMode.kind === 'edit' && (
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploadingAvatar || isSaving}
                className="relative h-16 w-16 shrink-0 overflow-hidden rounded-full bg-[var(--profile-bg)]"
                title={t('changeProfilePhoto')}
              >
                {isUploadingAvatar && (
                  <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/40">
                    <Loader2 className="h-5 w-5 animate-spin text-white" />
                  </div>
                )}
                {editorAvatarUrl ? (
                  <img
                    src={editorAvatarUrl}
                    alt={editForm?.displayName ?? ''}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-[var(--ink-dim)]">
                    <UserRound className="h-6 w-6" />
                  </div>
                )}
                <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition hover:bg-black/25">
                  <Camera className="h-4 w-4 text-white opacity-70" />
                </div>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) {
                    void handleAvatarFile(file);
                  }
                  event.target.value = '';
                }}
              />
              <p className="text-xs text-[var(--ink-dim)]">{t('changeProfilePhoto')}</p>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-xs text-[var(--ink-dim)]">
              {t('participantsDisplayNameLabel')}
              <input
                type="text"
                value={
                  editorMode.kind === 'create'
                    ? createForm.displayName
                    : (editForm?.displayName ?? '')
                }
                onChange={(event) => {
                  const value = event.target.value;
                  if (editorMode.kind === 'create') {
                    setCreateForm((current) => ({ ...current, displayName: value }));
                  } else if (editForm) {
                    setEditForm({ ...editForm, displayName: value });
                  }
                }}
                className={fieldClassName}
              />
            </label>

            {editingSelf && (
              <label className="space-y-1 text-xs text-[var(--ink-dim)]">
                {t('phone')}
                <input
                  type="tel"
                  value={phoneNumber}
                  onChange={(event) => setPhoneNumber(event.target.value)}
                  placeholder={t('phoneOptional')}
                  className={fieldClassName}
                  disabled={!onUpdateAccountContact}
                />
              </label>
            )}

            <label className="space-y-1 text-xs text-[var(--ink-dim)]">
              {editorMode.kind === 'create' || editForm?.age.kind === 'age_years'
                ? t('participantsAgeLabel')
                : t('participantsBirthDateLabel')}
              {editorMode.kind === 'create' || editForm?.age.kind === 'age_years' ? (
                <input
                  type="number"
                  min={0}
                  max={125}
                  value={
                    editorMode.kind === 'create'
                      ? createForm.ageYears
                      : (readAgeYearsFromParticipantAge(editForm!.age) ?? '')
                  }
                  onChange={(event) => {
                    const years = Number(event.target.value);
                    if (editorMode.kind === 'create') {
                      setCreateForm((current) => ({ ...current, ageYears: years }));
                    } else if (editForm) {
                      setEditForm({
                        ...editForm,
                        age: { kind: 'age_years', years },
                      });
                    }
                  }}
                  className={fieldClassName}
                />
              ) : (
                <input
                  type="date"
                  value={readBirthDateFromParticipantAge(editForm!.age) ?? ''}
                  onChange={(event) => {
                    if (!editForm) return;
                    setEditForm({
                      ...editForm,
                      age: { kind: 'birth_date', birthDate: event.target.value },
                    });
                  }}
                  className={fieldClassName}
                />
              )}
            </label>

            <label className="space-y-1 text-xs text-[var(--ink-dim)]">
              {t('participantsSkillLabel')}
              <input
                type="text"
                value={
                  editorMode.kind === 'create'
                    ? createForm.skillLevel
                    : (editForm?.skillLevel ?? 'beginner')
                }
                onChange={(event) => {
                  const value = event.target.value;
                  if (editorMode.kind === 'create') {
                    setCreateForm((current) => ({ ...current, skillLevel: value }));
                  } else if (editForm) {
                    setEditForm({ ...editForm, skillLevel: value });
                  }
                }}
                className={fieldClassName}
              />
            </label>

            <label className="space-y-1 text-xs text-[var(--ink-dim)]">
              {t('participantsDisciplineLabel')}
              <select
                value={
                  editorMode.kind === 'create'
                    ? createForm.discipline
                    : (editForm?.discipline ?? 'ski')
                }
                onChange={(event) => {
                  const discipline = event.target.value as 'ski' | 'snowboard';
                  if (editorMode.kind === 'create') {
                    setCreateForm((current) => ({ ...current, discipline }));
                  } else if (editForm) {
                    setEditForm({ ...editForm, discipline });
                  }
                }}
                className={fieldClassName}
              >
                <option value="ski">{t('participantsDisciplineSki')}</option>
                <option value="snowboard">{t('participantsDisciplineSnowboard')}</option>
              </select>
            </label>
          </div>

          <label className="block space-y-1 text-xs text-[var(--ink-dim)]">
            {t('participantsInstructorCommentLabel')}
            <textarea
              rows={2}
              value={
                editorMode.kind === 'create'
                  ? (createForm.instructorComment ?? '')
                  : (editForm?.instructorComment ?? '')
              }
              onChange={(event) => {
                const value = event.target.value;
                if (editorMode.kind === 'create') {
                  setCreateForm((current) => ({ ...current, instructorComment: value }));
                } else if (editForm) {
                  setEditForm({ ...editForm, instructorComment: value });
                }
              }}
              className={`${fieldClassName} min-h-[4.5rem] resize-none`}
            />
          </label>

          {formError && <p className="text-xs text-rose-600 dark:text-rose-400">{formError}</p>}

          <div className="flex flex-wrap gap-2">
            <ActionButton
              type="submit"
              pending={isSaving}
              pendingLabel={t('saving')}
              className="btn-primary px-4 py-2 text-xs"
            >
              {t('saveChanges')}
            </ActionButton>
            <button
              type="button"
              onClick={closeEditor}
              className="rounded-lg border border-[var(--border-subtle)] px-4 py-2 text-xs"
            >
              {t('cancel')}
            </button>
          </div>
        </form>
      )}
    </section>
  );
};
