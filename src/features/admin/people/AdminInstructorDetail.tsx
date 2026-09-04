import type { AccountId } from '@ski-academy/shared-domain';
import type { ReactNode } from 'react';
import type {
  AdminInstructorDetailView,
  AdminInstructorProfileDraft,
} from './adminInstructorContracts';
import { AdminInstructorProfileEditor } from './AdminInstructorProfileEditor';
import type { useAdminInstructorTranslations } from './useAdminInstructorTranslations';

interface AdminInstructorDetailProps {
  readonly detail: AdminInstructorDetailView;
  readonly profileEditing: boolean;
  readonly linking: boolean;
  readonly profileDraft: AdminInstructorProfileDraft;
  readonly pending: boolean;
  readonly uploading: boolean;
  readonly linkPicker: ReactNode;
  readonly text: ReturnType<typeof useAdminInstructorTranslations>['text'];
  readonly onStartEdit: () => void;
  readonly onProfileChange: (draft: AdminInstructorProfileDraft) => void;
  readonly onSaveProfile: () => void;
  readonly onCancelEdit: () => void;
  readonly onUploadPhoto: (file: File) => void;
  readonly onPause: () => void;
  readonly onResume: () => void;
  readonly onStartLink: () => void;
  readonly onCancelLink: () => void;
  readonly onStopBeingInstructor: () => void;
  readonly onOpenClient: (accountId: AccountId) => void;
  readonly onOpenPlanner: () => void;
}

function specialtyLabel(
  specialty: AdminInstructorDetailView['specialty'],
  text: AdminInstructorDetailProps['text']
): string {
  if (specialty === 'snowboard') return text.specialtySnowboard;
  if (specialty === 'both') return text.specialtyBoth;
  if (specialty === 'ski') return text.specialtySki;
  return '—';
}

function lifecycleLabel(
  lifecycle: AdminInstructorDetailView['linkedAccountLifecycle'],
  text: AdminInstructorDetailProps['text']
): string {
  if (lifecycle === 'disabled') return text.accountDisabled;
  if (lifecycle === 'uninitialized') return text.accountUninitialized;
  if (lifecycle === 'active') return text.accountActive;
  return '—';
}

export function AdminInstructorDetail({
  detail,
  profileEditing,
  linking,
  profileDraft,
  pending,
  uploading,
  linkPicker,
  text,
  onStartEdit,
  onProfileChange,
  onSaveProfile,
  onCancelEdit,
  onUploadPhoto,
  onPause,
  onResume,
  onStartLink,
  onCancelLink,
  onStopBeingInstructor,
  onOpenClient,
  onOpenPlanner,
}: AdminInstructorDetailProps) {
  const canUpdate = detail.authorizedActions.some(
    (action) => action.kind === 'update_instructor_catalog_profile'
  );
  const canPause = detail.authorizedActions.some(
    (action) => action.kind === 'deactivate_instructor_catalog'
  );
  const canResume = detail.authorizedActions.some(
    (action) => action.kind === 'reactivate_instructor_catalog'
  );
  const canLink = detail.authorizedActions.some(
    (action) => action.kind === 'link_account_instructor_catalog'
  );
  const canUnlink = detail.authorizedActions.some(
    (action) => action.kind === 'unlink_account_instructor_catalog'
  );
  const hasFutureCommitments =
    detail.futureLessonCommitmentCount > 0 || detail.futureCourseDayAssignmentCount > 0;

  return (
    <div className="space-y-4">
      <header className="space-y-1 border-b border-[var(--border)] pb-3">
        <div className="flex items-start gap-3">
          {detail.avatarUrl ? (
            <img src={detail.avatarUrl} alt="" className="h-14 w-14 shrink-0 object-cover" />
          ) : null}
          <div className="min-w-0">
            <h3 className="font-serif text-lg font-light">{detail.name}</h3>
            <p className="text-xs text-[var(--ink-dim)]">
              {specialtyLabel(detail.specialty, text)}
              {detail.pricePerHourKZT !== undefined
                ? ` · ${detail.pricePerHourKZT.toLocaleString('ru-RU')} ₸/ч`
                : ''}
            </p>
            <p className="text-xs text-[var(--ink-dim)]">
              {detail.isAvailable ? text.available : text.paused}
            </p>
          </div>
        </div>
      </header>

      <section className="space-y-1 text-xs">
        <h4 className="text-sm font-medium">{text.account}</h4>
        {detail.linkedAccountId ? (
          <>
            <p>{detail.linkedAccountDisplayName ?? detail.linkedAccountId}</p>
            {detail.linkedAccountLifecycle ? (
              <p className="font-mono text-[10px] uppercase text-[var(--ink-dim)]">
                {text.linkedAccountLifecycle}: {lifecycleLabel(detail.linkedAccountLifecycle, text)}
              </p>
            ) : null}
          </>
        ) : (
          <p className="text-[var(--ink-dim)]">{text.accountNotLinked}</p>
        )}
      </section>

      <section className="space-y-1 text-xs">
        <h4 className="text-sm font-medium">{text.commitments}</h4>
        <p>
          {text.futureLessons}: {detail.futureLessonCommitmentCount}
        </p>
        <p>
          {text.futureCourseDays}: {detail.futureCourseDayAssignmentCount}
        </p>
        {detail.unlinkBlockedByCommitments ? (
          <p role="status" className="text-[var(--ink-dim)]">
            {text.unlinkBlocked}
          </p>
        ) : null}
      </section>

      {!profileEditing && !linking ? (
        <div className="flex flex-wrap gap-2">
          {canUpdate ? (
            <button
              type="button"
              disabled={pending}
              onClick={onStartEdit}
              className="border border-[var(--border)] px-3 py-2 text-xs font-mono uppercase tracking-wider disabled:opacity-50"
            >
              {text.editProfile}
            </button>
          ) : null}
          {canPause ? (
            <button
              type="button"
              disabled={pending}
              onClick={onPause}
              className="border border-[var(--border)] px-3 py-2 text-xs font-mono uppercase tracking-wider disabled:opacity-50"
            >
              {text.pauseNewBookings}
            </button>
          ) : null}
          {canResume ? (
            <button
              type="button"
              disabled={pending}
              onClick={onResume}
              className="border border-[var(--border)] px-3 py-2 text-xs font-mono uppercase tracking-wider disabled:opacity-50"
            >
              {text.resumeNewBookings}
            </button>
          ) : null}
          {canLink ? (
            <button
              type="button"
              disabled={pending}
              onClick={onStartLink}
              className="border border-[var(--border)] px-3 py-2 text-xs font-mono uppercase tracking-wider disabled:opacity-50"
            >
              {text.linkAccount}
            </button>
          ) : null}
          {canUnlink ? (
            <button
              type="button"
              disabled={pending || detail.unlinkBlockedByCommitments}
              onClick={onStopBeingInstructor}
              className="border border-[var(--border)] px-3 py-2 text-xs font-mono uppercase tracking-wider disabled:opacity-50"
            >
              {text.stopBeingInstructor}
            </button>
          ) : null}
          {detail.linkedAccountId ? (
            <button
              type="button"
              onClick={() => onOpenClient(detail.linkedAccountId!)}
              className="border border-[var(--border)] px-3 py-2 text-xs font-mono uppercase tracking-wider"
            >
              {text.openClient}
            </button>
          ) : null}
          <button
            type="button"
            onClick={onOpenPlanner}
            className="border border-[var(--border)] px-3 py-2 text-xs font-mono uppercase tracking-wider"
          >
            {text.openPlanner}
          </button>
        </div>
      ) : null}

      {canPause && hasFutureCommitments && !profileEditing && !linking ? (
        <p className="text-[10px] font-mono leading-relaxed text-[var(--ink-dim)]">
          {text.confirmPauseWithFuture}
        </p>
      ) : null}

      {profileEditing ? (
        <section className="space-y-2 border border-[var(--border)] p-4">
          <h4 className="text-sm font-medium">{text.profile}</h4>
          <AdminInstructorProfileEditor
            draft={profileDraft}
            pending={pending}
            uploading={uploading}
            text={text}
            submitLabel={text.saveProfile}
            onChange={onProfileChange}
            onSave={onSaveProfile}
            onCancel={onCancelEdit}
            onUploadPhoto={onUploadPhoto}
          />
        </section>
      ) : null}

      {linking ? (
        <section className="space-y-2 border border-[var(--border)] p-4">
          {linkPicker}
          <button
            type="button"
            onClick={onCancelLink}
            className="border border-[var(--border)] px-3 py-2 text-xs font-mono uppercase tracking-wider"
          >
            {text.cancel}
          </button>
        </section>
      ) : null}

      {!profileEditing ? (
        <dl className="space-y-1 text-xs">
          {detail.phoneNumber ? (
            <div>
              <dt className="font-mono text-[10px] uppercase text-[var(--ink-dim)]">
                {text.phone}
              </dt>
              <dd>{detail.phoneNumber}</dd>
            </div>
          ) : null}
          {detail.languages && detail.languages.length > 0 ? (
            <div>
              <dt className="font-mono text-[10px] uppercase text-[var(--ink-dim)]">
                {text.languages}
              </dt>
              <dd>{detail.languages.join(', ')}</dd>
            </div>
          ) : null}
          {detail.experienceYears !== undefined ? (
            <div>
              <dt className="font-mono text-[10px] uppercase text-[var(--ink-dim)]">
                {text.experienceYears}
              </dt>
              <dd>{detail.experienceYears}</dd>
            </div>
          ) : null}
          {detail.bio ? (
            <div>
              <dt className="font-mono text-[10px] uppercase text-[var(--ink-dim)]">{text.bio}</dt>
              <dd className="whitespace-pre-wrap">{detail.bio}</dd>
            </div>
          ) : null}
        </dl>
      ) : null}
    </div>
  );
}
