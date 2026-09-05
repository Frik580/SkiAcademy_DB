import {
  AccountIdSchema,
  InstructorIdSchema,
  canonicalDeterministicHash,
  type AccountId,
  type InstructorId,
} from '@ski-academy/shared-domain';
import { Loader2, Plus, Search, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { uploadImage } from '../../../infrastructure/firebase';
import { toCanonicalCommandClientError } from '../../../lib/canonical/mapCanonicalCommandError';
import { ACCOUNT_DIRECTORY_SEARCH_DEBOUNCE_MS } from '../identity/accountDirectorySearch';
import { executeAdminIdentityAttempt } from '../identity/useAdminIdentityCommands';
import { useAdminIdentityReadModels } from '../identity/useAdminIdentityReadModels';
import { adminClientAccountSearchParams, adminPlannerSearchParams } from '../adminNavigation';
import { formatDateLocalYMD } from '../components/schedule/scheduleUtils';
import {
  ADMIN_INSTRUCTOR_CREATE_REASON,
  ADMIN_INSTRUCTOR_DIRECTORY_PAGE_SIZE,
  ADMIN_INSTRUCTOR_LIFECYCLE_REASON,
  ADMIN_INSTRUCTOR_LINK_REASON,
  ADMIN_INSTRUCTOR_PROFILE_REASON,
  ADMIN_INSTRUCTOR_UNLINK_REASON,
  EMPTY_ADMIN_INSTRUCTOR_PROFILE_DRAFT,
  adminInstructorAttemptKey,
  adminInstructorProfileDraftFromDetail,
  parseInstructorLanguagesCsv,
  type AdminInstructorProfileDraft,
} from './adminInstructorContracts';
import {
  AdminInstructorAccountPicker,
  type AdminInstructorAccountPickerOption,
} from './AdminInstructorAccountPicker';
import { AdminInstructorDetail } from './AdminInstructorDetail';
import { AdminInstructorList } from './AdminInstructorList';
import { AdminInstructorProfileEditor } from './AdminInstructorProfileEditor';
import { useAdminInstructorTranslations } from './useAdminInstructorTranslations';

interface AdminInstructorDirectoryProps {
  readonly adminAccountId: string;
}

function entropy(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID().replaceAll('-', '');
  }
  return `${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
}

function optimizeInstructorImage(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('File is not an image'));
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const maxSize = 400;
        const width = img.width;
        const height = img.height;
        let sourceX = 0;
        let sourceY = 0;
        let sourceWidth = width;
        let sourceHeight = height;
        if (width > height) {
          sourceX = (width - height) / 2;
          sourceWidth = height;
        } else {
          sourceY = (height - width) / 2;
          sourceHeight = width;
        }
        canvas.width = maxSize;
        canvas.height = maxSize;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Failed to get 2D context'));
          return;
        }
        ctx.drawImage(img, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, maxSize, maxSize);
        canvas.toBlob(
          (blob) => {
            if (blob) resolve(blob);
            else reject(new Error('Failed to create blob from canvas'));
          },
          'image/jpeg',
          0.8
        );
      };
      img.onerror = () => reject(new Error('Failed to load image source'));
      img.src = event.target?.result as string;
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

export function AdminInstructorDirectory({ adminAccountId }: AdminInstructorDirectoryProps) {
  const { text } = useAdminInstructorTranslations();
  const [, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedInstructorId, setSelectedInstructorId] = useState<InstructorId | undefined>();
  const [showAdd, setShowAdd] = useState(false);
  const [linking, setLinking] = useState(false);
  const [profileEditing, setProfileEditing] = useState(false);
  const [createInstructorId, setCreateInstructorId] = useState<InstructorId | undefined>();
  const [profileDraft, setProfileDraft] = useState<AdminInstructorProfileDraft>(
    EMPTY_ADMIN_INSTRUCTOR_PROFILE_DRAFT
  );
  const [createAccountId, setCreateAccountId] = useState<AccountId | undefined>();
  const [createAccountRevision, setCreateAccountRevision] = useState(1);
  const [accountSearch, setAccountSearch] = useState('');
  const [debouncedAccountSearch, setDebouncedAccountSearch] = useState('');
  const [pending, setPending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();

  useEffect(() => {
    if (search.trim() === '') {
      setDebouncedSearch('');
      return;
    }
    const handle = window.setTimeout(() => {
      setDebouncedSearch(search);
    }, ACCOUNT_DIRECTORY_SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
  }, [search]);

  useEffect(() => {
    if (accountSearch.trim() === '') {
      setDebouncedAccountSearch('');
      return;
    }
    const handle = window.setTimeout(() => {
      setDebouncedAccountSearch(accountSearch);
    }, ACCOUNT_DIRECTORY_SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
  }, [accountSearch]);

  const appliedSearch = search.trim() === '' ? '' : debouncedSearch;
  const appliedAccountSearch = accountSearch.trim() === '' ? '' : debouncedAccountSearch;
  const accountPickerOpen = showAdd || linking;

  const reads = useAdminIdentityReadModels({
    enabled: true,
    directory: 'instructors',
    search: appliedSearch,
    pageSize: ADMIN_INSTRUCTOR_DIRECTORY_PAGE_SIZE,
    selectedInstructorId,
  });

  const accountReads = useAdminIdentityReadModels({
    enabled: accountPickerOpen,
    directory: 'accounts',
    search: appliedAccountSearch,
    pageSize: ADMIN_INSTRUCTOR_DIRECTORY_PAGE_SIZE,
  });

  useEffect(() => {
    if (!reads.instructorDetail || profileEditing) return;
    setProfileDraft(adminInstructorProfileDraftFromDetail(reads.instructorDetail));
  }, [profileEditing, reads.instructorDetail]);

  const list = reads.instructors;

  const accountOptions: AdminInstructorAccountPickerOption[] = accountReads.accounts.items.map(
    (item) => ({
      accountId: item.accountId,
      displayName: item.displayName,
      ...(item.email ? { email: item.email } : {}),
      lifecycle: item.lifecycle,
      revision: item.revision ?? 1,
      linked: item.instructorLink.isInstructor || Boolean(item.instructorLink.instructorId),
    })
  );

  const runAttempt = async (
    attempt: Parameters<typeof executeAdminIdentityAttempt>[1],
    confirmMessage?: string
  ) => {
    if (confirmMessage && typeof window !== 'undefined' && !window.confirm(confirmMessage)) {
      return false;
    }
    setPending(true);
    setError(undefined);
    setNotice(undefined);
    try {
      await executeAdminIdentityAttempt(adminAccountId, attempt);
      setNotice(text.saved);
      setProfileEditing(false);
      setLinking(false);
      setShowAdd(false);
      setCreateAccountId(undefined);
      setCreateAccountRevision(1);
      setCreateInstructorId(undefined);
      setAccountSearch('');
      await reads.refresh();
      if (accountPickerOpen) await accountReads.refresh();
      return true;
    } catch (caught) {
      const clientError = toCanonicalCommandClientError(caught, 'admin_instructors');
      setError(
        clientError.code === 'stale_version'
          ? text.stale
          : clientError.code === 'forbidden'
            ? text.permissionDenied
            : clientError.message || text.mutationFailed
      );
      if (clientError.code === 'stale_version') {
        await reads.refresh();
      }
      return false;
    } finally {
      setPending(false);
    }
  };

  const actionRevision = (
    kind:
      | 'update_instructor_catalog_profile'
      | 'deactivate_instructor_catalog'
      | 'reactivate_instructor_catalog'
      | 'link_account_instructor_catalog'
      | 'unlink_account_instructor_catalog',
    fallback = 1
  ) =>
    reads.instructorDetail?.authorizedActions.find((item) => item.kind === kind)
      ?.expectedRevision ?? fallback;

  const parsePriceKzt = (raw: string): number | undefined => {
    const value = Number(raw.trim());
    if (!Number.isFinite(value) || !Number.isInteger(value) || value < 1) return undefined;
    return value;
  };

  const handleUploadPhoto = async (file: File, instructorIdForPath: string) => {
    setUploading(true);
    setError(undefined);
    try {
      const optimized = await optimizeInstructorImage(file);
      const url = await uploadImage(optimized, `instructors/${instructorIdForPath}.jpg`);
      setProfileDraft((previous) => ({ ...previous, avatarUrl: url }));
    } catch {
      setError(text.mutationFailed);
    } finally {
      setUploading(false);
    }
  };

  const handleCreate = async () => {
    if (!createAccountId) {
      setError(text.accountRequired);
      return;
    }
    if (!profileDraft.name.trim()) {
      setError(text.nameRequired);
      return;
    }
    const pricePerHourKZT = parsePriceKzt(profileDraft.pricePerHourKZT);
    if (pricePerHourKZT === undefined) {
      setError(text.priceRequired);
      return;
    }
    const instructorId =
      createInstructorId ??
      InstructorIdSchema.parse(canonicalDeterministicHash(['instructor_catalog:v1', entropy()]));
    const languages = parseInstructorLanguagesCsv(profileDraft.languages);
    const experienceYearsRaw = profileDraft.experienceYears.trim();
    const experienceYears = experienceYearsRaw === '' ? undefined : Number(experienceYearsRaw);
    const ok = await runAttempt({
      kind: 'create_instructor_catalog_entry',
      instructorId,
      accountId: createAccountId,
      name: profileDraft.name.trim(),
      pricePerHourKZT,
      specialty: profileDraft.specialty,
      ...(languages.length > 0 ? { languages } : {}),
      ...(experienceYears !== undefined &&
      Number.isFinite(experienceYears) &&
      Number.isInteger(experienceYears)
        ? { experienceYears }
        : {}),
      ...(profileDraft.bio.trim() ? { bio: profileDraft.bio.trim() } : {}),
      ...(profileDraft.avatarUrl.trim() ? { avatarUrl: profileDraft.avatarUrl.trim() } : {}),
      ...(profileDraft.phoneNumber.trim() ? { phoneNumber: profileDraft.phoneNumber.trim() } : {}),
      expectedRevision: createAccountRevision,
      idempotencyKey: adminInstructorAttemptKey('create_catalog', instructorId),
      reasonExplanation: ADMIN_INSTRUCTOR_CREATE_REASON,
    });
    if (ok) {
      setSelectedInstructorId(instructorId);
      setProfileDraft(EMPTY_ADMIN_INSTRUCTOR_PROFILE_DRAFT);
      setCreateInstructorId(undefined);
    }
  };

  const handleSaveProfile = async () => {
    const detail = reads.instructorDetail;
    if (!detail) return;
    if (!profileDraft.name.trim()) {
      setError(text.nameRequired);
      return;
    }
    const pricePerHourKZT = parsePriceKzt(profileDraft.pricePerHourKZT);
    if (pricePerHourKZT === undefined) {
      setError(text.priceRequired);
      return;
    }
    const languages = parseInstructorLanguagesCsv(profileDraft.languages);
    const experienceYearsRaw = profileDraft.experienceYears.trim();
    const experienceYears = experienceYearsRaw === '' ? undefined : Number(experienceYearsRaw);
    await runAttempt({
      kind: 'update_instructor_catalog_profile',
      instructorId: detail.instructorId,
      name: profileDraft.name.trim(),
      pricePerHourKZT,
      specialty: profileDraft.specialty,
      languages,
      ...(experienceYears !== undefined &&
      Number.isFinite(experienceYears) &&
      Number.isInteger(experienceYears)
        ? { experienceYears }
        : {}),
      ...(profileDraft.bio.trim() ? { bio: profileDraft.bio.trim() } : {}),
      ...(profileDraft.avatarUrl.trim() ? { avatarUrl: profileDraft.avatarUrl.trim() } : {}),
      ...(profileDraft.phoneNumber.trim() ? { phoneNumber: profileDraft.phoneNumber.trim() } : {}),
      expectedRevision: actionRevision('update_instructor_catalog_profile', detail.revision),
      idempotencyKey: adminInstructorAttemptKey('update_profile', detail.instructorId),
      reasonExplanation: ADMIN_INSTRUCTOR_PROFILE_REASON,
    });
  };

  const accountPicker = (
    <AdminInstructorAccountPicker
      search={accountSearch}
      options={accountOptions}
      selectedAccountId={createAccountId}
      loading={accountReads.accounts.loading}
      hasMore={accountReads.accounts.hasMore}
      loadingMore={accountReads.accounts.loadingMore}
      text={text}
      onSearchChange={setAccountSearch}
      onSelect={(option) => {
        setCreateAccountId(option.accountId);
        setCreateAccountRevision(option.revision);
        if (showAdd && !profileDraft.name.trim()) {
          setProfileDraft((previous) => ({
            ...previous,
            name: option.displayName,
          }));
        }
        if (linking && reads.instructorDetail) {
          void runAttempt({
            kind: 'link_account_instructor_catalog',
            accountId: option.accountId,
            instructorId: reads.instructorDetail.instructorId,
            expectedRevision: option.revision,
            idempotencyKey: adminInstructorAttemptKey(
              'link_account',
              reads.instructorDetail.instructorId
            ),
            reasonExplanation: ADMIN_INSTRUCTOR_LINK_REASON,
          });
        }
      }}
      onLoadMore={() => accountReads.loadMore()}
    />
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[16rem] flex-1">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ink-dim)]" />
          <input
            type="search"
            aria-label={text.search}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={text.searchHint}
            className="w-full border border-[var(--border)] bg-transparent py-2 pl-10 pr-4 font-mono text-xs text-[var(--ink)] placeholder-[var(--ink-dim)] focus:border-[var(--ink)] focus:outline-none"
          />
        </div>
        <button
          type="button"
          onClick={() => {
            setShowAdd(true);
            setSelectedInstructorId(undefined);
            setProfileEditing(false);
            setLinking(false);
            setCreateAccountId(undefined);
            setCreateInstructorId(
              InstructorIdSchema.parse(
                canonicalDeterministicHash(['instructor_catalog:v1', entropy()])
              )
            );
            setProfileDraft(EMPTY_ADMIN_INSTRUCTOR_PROFILE_DRAFT);
            setError(undefined);
            setNotice(undefined);
          }}
          className="inline-flex items-center gap-1.5 border border-[var(--border)] px-3 py-2 text-xs font-mono font-bold uppercase tracking-wider"
        >
          <Plus className="h-3.5 w-3.5" />
          {text.addInstructor}
        </button>
      </div>
      {error ? (
        <p role="alert" className="text-xs text-red-600">
          {error}
        </p>
      ) : null}
      {notice ? <p className="text-xs text-[var(--ink-dim)]">{notice}</p> : null}

      {showAdd ? (
        <section className="space-y-4 border border-[var(--border)] p-4">
          <h3 className="font-serif text-base font-light">{text.addInstructor}</h3>
          {accountPicker}
          <AdminInstructorProfileEditor
            draft={profileDraft}
            pending={pending}
            uploading={uploading}
            text={text}
            submitLabel={text.createInstructor}
            onChange={setProfileDraft}
            onSave={() => void handleCreate()}
            onCancel={() => {
              setShowAdd(false);
              setCreateAccountId(undefined);
              setCreateInstructorId(undefined);
              setProfileDraft(EMPTY_ADMIN_INSTRUCTOR_PROFILE_DRAFT);
              setAccountSearch('');
            }}
            onUploadPhoto={(file) => {
              const pathId =
                createInstructorId ??
                InstructorIdSchema.parse(
                  canonicalDeterministicHash(['instructor_catalog:v1', entropy()])
                );
              if (!createInstructorId) setCreateInstructorId(pathId);
              void handleUploadPhoto(file, pathId);
            }}
          />
        </section>
      ) : null}

      <div className={`grid gap-6 ${selectedInstructorId && !showAdd ? 'lg:grid-cols-12' : ''}`}>
        <section className={selectedInstructorId && !showAdd ? 'min-w-0 lg:col-span-7' : 'min-w-0'}>
          {list.error ? (
            <div className="space-y-2 border border-[var(--border)] p-4">
              <p role="alert" className="text-xs text-red-600">
                {list.error === 'permission-denied' ? text.permissionDenied : text.readFailed}
              </p>
              <button
                type="button"
                onClick={() => void reads.refresh()}
                className="border border-[var(--border)] px-3 py-2 text-xs font-mono uppercase tracking-wider"
              >
                {text.retry}
              </button>
            </div>
          ) : null}
          {list.loading ? (
            <p className="flex items-center gap-2 text-xs text-[var(--ink-dim)]">
              <Loader2 className="h-4 w-4 animate-spin" />
              {text.loading}
            </p>
          ) : null}
          {!list.loading && !list.error && list.items.length === 0 ? (
            <p className="border border-[var(--border)] py-8 text-center font-mono text-xs text-[var(--ink-dim)]">
              {appliedSearch ? text.emptySearch : text.emptyDirectory}
            </p>
          ) : null}
          {list.items.length > 0 ? (
            <AdminInstructorList
              items={list.items}
              selectedInstructorId={selectedInstructorId}
              text={text}
              onOpen={(instructorId) => {
                setSelectedInstructorId(instructorId);
                setShowAdd(false);
                setProfileEditing(false);
                setLinking(false);
              }}
            />
          ) : null}
          {list.hasMore ? (
            <button
              type="button"
              disabled={list.loadingMore}
              onClick={() => reads.loadMore()}
              className="mt-3 border border-[var(--border)] px-3 py-1.5 text-xs font-mono font-bold uppercase tracking-wider disabled:opacity-50"
            >
              {list.loadingMore ? text.loading : text.loadMore}
            </button>
          ) : null}
        </section>

        {selectedInstructorId && !showAdd ? (
          <aside className="min-w-0 border border-[var(--border)] p-6 lg:col-span-5">
            {reads.detailLoading ? (
              <div className="flex items-start justify-between gap-3">
                <p className="flex items-center gap-2 text-xs text-[var(--ink-dim)]">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {text.loading}
                </p>
                <button
                  type="button"
                  aria-label={text.closeDetail}
                  onClick={() => {
                    setSelectedInstructorId(undefined);
                    setProfileEditing(false);
                    setLinking(false);
                  }}
                  className="shrink-0 border border-[var(--border)] p-1.5 text-[var(--ink-dim)] transition hover:border-[var(--ink)] hover:text-[var(--ink)]"
                >
                  <X className="h-3.5 w-3.5" aria-hidden />
                </button>
              </div>
            ) : null}
            {reads.detailError ? (
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <p role="alert" className="text-xs text-red-600">
                    {reads.detailError === 'permission-denied'
                      ? text.permissionDenied
                      : text.detailFailed}
                  </p>
                  <button
                    type="button"
                    aria-label={text.closeDetail}
                    onClick={() => {
                      setSelectedInstructorId(undefined);
                      setProfileEditing(false);
                      setLinking(false);
                    }}
                    className="shrink-0 border border-[var(--border)] p-1.5 text-[var(--ink-dim)] transition hover:border-[var(--ink)] hover:text-[var(--ink)]"
                  >
                    <X className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => void reads.refresh()}
                  className="border border-[var(--border)] px-3 py-2 text-xs font-mono uppercase tracking-wider"
                >
                  {text.retry}
                </button>
              </div>
            ) : null}
            {!reads.detailLoading && !reads.detailError && reads.instructorDetail ? (
              <AdminInstructorDetail
                detail={reads.instructorDetail}
                profileEditing={profileEditing}
                linking={linking}
                profileDraft={profileDraft}
                pending={pending}
                uploading={uploading}
                linkPicker={accountPicker}
                text={text}
                onClose={() => {
                  setSelectedInstructorId(undefined);
                  setProfileEditing(false);
                  setLinking(false);
                }}
                onStartEdit={() => setProfileEditing(true)}
                onProfileChange={setProfileDraft}
                onSaveProfile={() => void handleSaveProfile()}
                onCancelEdit={() => {
                  setProfileEditing(false);
                  if (reads.instructorDetail) {
                    setProfileDraft(adminInstructorProfileDraftFromDetail(reads.instructorDetail));
                  }
                }}
                onUploadPhoto={(file) =>
                  void handleUploadPhoto(file, reads.instructorDetail!.instructorId)
                }
                onPause={() => {
                  const detail = reads.instructorDetail;
                  if (!detail) return;
                  const hasFuture =
                    detail.futureLessonCommitmentCount > 0 ||
                    detail.futureCourseDayAssignmentCount > 0;
                  void runAttempt(
                    {
                      kind: 'deactivate_instructor_catalog',
                      instructorId: detail.instructorId,
                      expectedRevision: actionRevision(
                        'deactivate_instructor_catalog',
                        detail.revision
                      ),
                      idempotencyKey: adminInstructorAttemptKey('deactivate', detail.instructorId),
                      reasonExplanation: ADMIN_INSTRUCTOR_LIFECYCLE_REASON,
                    },
                    hasFuture ? text.confirmPauseWithFuture : text.confirmPause
                  );
                }}
                onResume={() => {
                  const detail = reads.instructorDetail;
                  if (!detail) return;
                  void runAttempt({
                    kind: 'reactivate_instructor_catalog',
                    instructorId: detail.instructorId,
                    expectedRevision: actionRevision(
                      'reactivate_instructor_catalog',
                      detail.revision
                    ),
                    idempotencyKey: adminInstructorAttemptKey('reactivate', detail.instructorId),
                    reasonExplanation: ADMIN_INSTRUCTOR_LIFECYCLE_REASON,
                  });
                }}
                onStartLink={() => {
                  setLinking(true);
                  setCreateAccountId(undefined);
                  setAccountSearch('');
                }}
                onCancelLink={() => {
                  setLinking(false);
                  setCreateAccountId(undefined);
                  setAccountSearch('');
                }}
                onStopBeingInstructor={() => {
                  const detail = reads.instructorDetail;
                  if (!detail?.linkedAccountId) return;
                  if (detail.unlinkBlockedByCommitments) {
                    setError(text.unlinkBlocked);
                    return;
                  }
                  void runAttempt(
                    {
                      kind: 'unlink_account_instructor_catalog',
                      accountId: detail.linkedAccountId,
                      instructorId: detail.instructorId,
                      expectedRevision: actionRevision(
                        'unlink_account_instructor_catalog',
                        detail.revision
                      ),
                      idempotencyKey: adminInstructorAttemptKey('unlink', detail.instructorId),
                      reasonExplanation: ADMIN_INSTRUCTOR_UNLINK_REASON,
                    },
                    text.confirmStopBeingInstructor
                  );
                }}
                onOpenClient={(accountId) => {
                  const parsed = AccountIdSchema.safeParse(accountId);
                  if (!parsed.success) return;
                  setSearchParams(
                    (previous) => adminClientAccountSearchParams(previous, parsed.data),
                    { replace: true }
                  );
                }}
                onOpenPlanner={() => {
                  const detail = reads.instructorDetail;
                  setSearchParams(
                    (previous) =>
                      adminPlannerSearchParams(previous, {
                        localDate: formatDateLocalYMD(new Date()),
                        instructorId: detail?.instructorId,
                      }),
                    { replace: true }
                  );
                }}
              />
            ) : null}
            {!reads.detailLoading && !reads.detailError && !reads.instructorDetail ? (
              <p className="text-xs text-[var(--ink-dim)]">{text.missingInstructor}</p>
            ) : null}
          </aside>
        ) : null}
      </div>
    </div>
  );
}

export type { AdminInstructorDirectoryProps };
