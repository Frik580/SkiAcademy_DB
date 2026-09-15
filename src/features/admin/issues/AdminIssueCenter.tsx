import {
  AdminIssueIdSchema,
  ADMIN_ISSUE_SEVERITIES,
  BookingChangeRequestIdSchema,
  type AdminBookingChangeRequestInboxItem,
  type AdminIssueDetailReadModel,
  type AdminIssueInboxItem,
} from '@ski-academy/shared-domain';
import { ChevronRight, Info, Loader2, RefreshCw, Search, ShieldAlert, X } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  ADMIN_ISSUE_CATEGORY_QUERY_KEY,
  ADMIN_ISSUE_QUERY_KEY,
  ADMIN_ISSUE_SEVERITY_QUERY_KEY,
  ADMIN_ISSUE_VIEW_QUERY_KEY,
  ADMIN_CHANGE_REQUEST_QUERY_KEY,
  ADMIN_FINANCE_PAYMENT_QUERY_KEY,
  ADMIN_LESSON_BOOKING_QUERY_KEY,
  ADMIN_COURSE_ENROLLMENT_QUERY_KEY,
  ADMIN_TAB_QUERY_KEY,
  parseAdminIssueCategory,
  parseAdminIssueSeverity,
  parseAdminIssueView,
} from '../adminNavigation';
import {
  ADMIN_ISSUE_BLOCKING_KEYS,
  ADMIN_ISSUE_CATEGORY_LABEL_KEYS,
  ADMIN_ISSUE_GUIDANCE_KEYS,
  ADMIN_ISSUE_INBOX_CATEGORIES,
  ADMIN_ISSUE_KIND_LABEL_KEYS,
  ADMIN_ISSUE_PRIMARY_DESTINATION_KEYS,
  adminIssueHasGuestPresentation,
  adminIssueMatchesCategory,
  adminIssuePrimaryDestination,
  adminIssueSearchHaystack,
  type AdminIssueInboxCategory,
} from './adminIssuePresentation';
import { useAdminAttentionChangeRequests } from './useAdminAttentionChangeRequests';
import { useAdminIssueReadModels } from './useAdminIssueReadModels';
import { useAdminIssueTranslations } from './useAdminIssueTranslations';

function timestampDate(value: { seconds: number }): Date {
  return new Date(value.seconds * 1_000);
}

function severityClasses(severity: AdminIssueInboxItem['severity']): string {
  if (severity === 'critical') {
    return 'border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300';
  }
  if (severity === 'urgent') {
    return 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300';
  }
  return 'border-[var(--border)] bg-black/5 text-[var(--ink-dim)]';
}

type AttentionInboxEntry =
  | {
      readonly source: 'admin_issue';
      readonly id: string;
      readonly sortSeconds: number;
      readonly issue: AdminIssueInboxItem;
    }
  | {
      readonly source: 'booking_change_request';
      readonly id: string;
      readonly sortSeconds: number;
      readonly changeRequest: AdminBookingChangeRequestInboxItem;
    };

function mergeAttentionInbox(
  issues: readonly AdminIssueInboxItem[],
  changeRequests: readonly AdminBookingChangeRequestInboxItem[]
): AttentionInboxEntry[] {
  const entries: AttentionInboxEntry[] = [
    ...issues.map((issue) => ({
      source: 'admin_issue' as const,
      id: issue.issueId,
      sortSeconds: issue.updatedAt.seconds,
      issue,
    })),
    ...changeRequests.map((changeRequest) => ({
      source: 'booking_change_request' as const,
      id: changeRequest.requestId,
      sortSeconds: changeRequest.createdAt.seconds,
      changeRequest,
    })),
  ];
  return entries.sort((left, right) => {
    if (left.sortSeconds !== right.sortSeconds) return right.sortSeconds - left.sortSeconds;
    return left.id.localeCompare(right.id);
  });
}

function formatInterval(
  locale: string,
  startsAt: { seconds: number },
  timeZone?: string
): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
    ...(timeZone ? { timeZone } : {}),
  }).format(timestampDate(startsAt));
}

export function AdminIssueCenter() {
  const { t, language } = useAdminIssueTranslations();
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const view = parseAdminIssueView(searchParams.get(ADMIN_ISSUE_VIEW_QUERY_KEY));
  const severity = parseAdminIssueSeverity(searchParams.get(ADMIN_ISSUE_SEVERITY_QUERY_KEY));
  const category = parseAdminIssueCategory(searchParams.get(ADMIN_ISSUE_CATEGORY_QUERY_KEY));
  const selectedIssueParam = searchParams.get(ADMIN_ISSUE_QUERY_KEY);
  const selectedIssueResult = AdminIssueIdSchema.safeParse(selectedIssueParam);
  const selectedIssueId = selectedIssueResult.success ? selectedIssueResult.data : undefined;
  const selectedChangeRequestParam = searchParams.get(ADMIN_CHANGE_REQUEST_QUERY_KEY);
  const selectedChangeRequestResult = BookingChangeRequestIdSchema.safeParse(
    selectedChangeRequestParam
  );
  const selectedChangeRequestId = selectedChangeRequestResult.success
    ? selectedChangeRequestResult.data
    : undefined;

  const { list, detail, retryList, retryDetail, loadMore } = useAdminIssueReadModels({
    enabled: true,
    scope: view === 'history' ? 'admin_history' : 'admin_open',
    ...(severity === undefined ? {} : { severity }),
    ...(selectedIssueId === undefined ? {} : { selectedIssueId }),
  });
  const changeRequests = useAdminAttentionChangeRequests({
    enabled: view === 'open',
    ...(selectedChangeRequestId === undefined
      ? {}
      : { selectedRequestId: selectedChangeRequestId }),
  });

  const updateQuery = useCallback(
    (updates: Readonly<Record<string, string | undefined>>) => {
      setSearchParams(
        (previous) => {
          const next = new URLSearchParams(previous);
          for (const [key, value] of Object.entries(updates)) {
            if (value === undefined) next.delete(key);
            else next.set(key, value);
          }
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  const locale = language === 'ru' ? 'ru-RU' : 'en-US';
  const formatDate = (value: { seconds: number }) =>
    new Intl.DateTimeFormat(locale, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(timestampDate(value));
  const formatOccurrence = (item: AdminBookingChangeRequestInboxItem) =>
    formatInterval(locale, item.occurrence.startsAt, item.occurrence.timeZone);
  const formatMoney = (canonicalKzt: number) =>
    new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: 'KZT',
      maximumFractionDigits: 0,
    }).format(canonicalKzt);
  const formatIssueTime = (item: AdminIssueInboxItem) =>
    item.lessonStartsAt
      ? formatInterval(locale, item.lessonStartsAt, item.lessonTimeZone)
      : undefined;

  const inboxEntries =
    view === 'open'
      ? mergeAttentionInbox(list.items, changeRequests.list.items)
      : list.items.map((issue) => ({
          source: 'admin_issue' as const,
          id: issue.issueId,
          sortSeconds: issue.updatedAt.seconds,
          issue,
        }));
  const hasGuestCategory = adminIssueHasGuestPresentation(list.items);
  const visibleCategories = ADMIN_ISSUE_INBOX_CATEGORIES.filter(
    (value) => value !== 'guest' || hasGuestCategory
  );
  const normalizedSearch = search.trim().toLowerCase();
  const visibleEntries = useMemo(() => {
    return inboxEntries.filter((entry) => {
      if (category) {
        if (entry.source === 'booking_change_request') {
          if (category !== 'change_request') return false;
        } else if (!adminIssueMatchesCategory(entry.issue, category as AdminIssueInboxCategory)) {
          return false;
        }
      }
      if (!normalizedSearch) return true;
      if (entry.source === 'booking_change_request') {
        const haystack = [
          entry.changeRequest.instructor.displayName,
          ...entry.changeRequest.participants.map((participant) => participant.displayName),
          entry.changeRequest.reason,
        ]
          .join(' ')
          .toLowerCase();
        return haystack.includes(normalizedSearch);
      }
      return (
        adminIssueSearchHaystack(entry.issue).includes(normalizedSearch) ||
        t(ADMIN_ISSUE_KIND_LABEL_KEYS[entry.issue.kind]).toLowerCase().includes(normalizedSearch)
      );
    });
  }, [category, inboxEntries, normalizedSearch, t]);

  const inboxLoading =
    list.loading || (view === 'open' && changeRequests.list.loading && inboxEntries.length === 0);
  const inboxError = list.error;
  const selectedChangeRequest =
    changeRequests.detail.item ??
    changeRequests.list.items.find((item) => item.requestId === selectedChangeRequestId);
  const selectedListIssue = list.items.find((item) => item.issueId === selectedIssueId);
  const retryInbox = () => {
    void retryList();
    if (view === 'open') void changeRequests.retryList();
  };
  const selectedOpen = Boolean(selectedIssueParam || selectedChangeRequestParam);

  const openIssueDestination = (
    item: AdminIssueInboxItem | AdminIssueDetailReadModel,
    destination = adminIssuePrimaryDestination(item)
  ) => {
    if (destination === 'payment' && 'payment' in item && item.payment) {
      updateQuery({
        [ADMIN_TAB_QUERY_KEY]: 'finance',
        [ADMIN_FINANCE_PAYMENT_QUERY_KEY]: item.payment.paymentId,
      });
      return;
    }
    if (item.subjectRef.subjectKind === 'booking') {
      updateQuery({
        [ADMIN_TAB_QUERY_KEY]: 'operations',
        [ADMIN_LESSON_BOOKING_QUERY_KEY]: item.subjectRef.bookingId,
      });
      return;
    }
    updateQuery({
      [ADMIN_TAB_QUERY_KEY]: 'operations',
      [ADMIN_COURSE_ENROLLMENT_QUERY_KEY]: item.subjectRef.enrollmentId,
    });
  };

  const issueEntityLabel = (item: AdminIssueInboxItem) =>
    item.courseTitle ??
    t(item.subjectRef.subjectKind === 'booking' ? 'adminIssueLessonContext' : 'adminIssueCourseContext');

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(300px,0.8fr)]">
      <section aria-label={t('adminIssueInboxTitle')} className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex border border-[var(--border)]">
            <button
              type="button"
              aria-pressed={view === 'open'}
              onClick={() =>
                updateQuery({
                  [ADMIN_ISSUE_VIEW_QUERY_KEY]: 'open',
                  [ADMIN_ISSUE_QUERY_KEY]: undefined,
                  [ADMIN_CHANGE_REQUEST_QUERY_KEY]: undefined,
                })
              }
              className={`px-3 py-2 text-xs font-mono uppercase tracking-wider ${
                view === 'open' ? 'bg-[var(--ink)] text-[var(--bg)]' : 'text-[var(--ink-dim)]'
              }`}
            >
              {t('adminIssueActionable')}
            </button>
            <button
              type="button"
              aria-pressed={view === 'history'}
              onClick={() =>
                updateQuery({
                  [ADMIN_ISSUE_VIEW_QUERY_KEY]: 'history',
                  [ADMIN_ISSUE_QUERY_KEY]: undefined,
                  [ADMIN_CHANGE_REQUEST_QUERY_KEY]: undefined,
                })
              }
              className={`px-3 py-2 text-xs font-mono uppercase tracking-wider ${
                view === 'history' ? 'bg-[var(--ink)] text-[var(--bg)]' : 'text-[var(--ink-dim)]'
              }`}
            >
              {t('adminIssueResolved')}
            </button>
          </div>

          <label className="flex items-center gap-2 text-xs text-[var(--ink-dim)]">
            <span>{t('adminIssueSeverity')}</span>
            <select
              aria-label={t('adminIssueSeverity')}
              value={severity ?? ''}
              onChange={(event) =>
                updateQuery({
                  [ADMIN_ISSUE_SEVERITY_QUERY_KEY]: event.target.value || undefined,
                  [ADMIN_ISSUE_QUERY_KEY]: undefined,
                })
              }
              className="border border-[var(--border)] bg-[var(--bg)] px-2 py-2 text-xs text-[var(--ink)]"
            >
              <option value="">{t('adminIssueAllSeverities')}</option>
              {ADMIN_ISSUE_SEVERITIES.map((value) => (
                <option key={value} value={value}>
                  {t(
                    value === 'critical'
                      ? 'adminIssueSeverityCritical'
                      : value === 'urgent'
                        ? 'adminIssueSeverityUrgent'
                        : 'adminIssueSeverityNormal'
                  )}
                </option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-2 text-xs text-[var(--ink-dim)]">
            <span>{t('adminIssueCategory')}</span>
            <select
              aria-label={t('adminIssueCategory')}
              value={category ?? ''}
              onChange={(event) =>
                updateQuery({
                  [ADMIN_ISSUE_CATEGORY_QUERY_KEY]: event.target.value || undefined,
                  [ADMIN_ISSUE_QUERY_KEY]: undefined,
                  [ADMIN_CHANGE_REQUEST_QUERY_KEY]: undefined,
                })
              }
              className="border border-[var(--border)] bg-[var(--bg)] px-2 py-2 text-xs text-[var(--ink)]"
            >
              <option value="">{t('adminIssueCategoryAll')}</option>
              {visibleCategories.map((value) => (
                <option key={value} value={value}>
                  {t(ADMIN_ISSUE_CATEGORY_LABEL_KEYS[value])}
                </option>
              ))}
            </select>
          </label>

          <label className="relative min-w-40 flex-1 text-xs text-[var(--ink-dim)]">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2" />
            <input
              type="search"
              aria-label={t('adminIssueSearch')}
              placeholder={t('adminIssueSearchPlaceholder')}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="w-full border border-[var(--border)] bg-[var(--bg)] py-2 pl-7 pr-2 text-xs text-[var(--ink)]"
            />
          </label>

          <button
            type="button"
            onClick={() => void retryInbox()}
            className="inline-flex items-center gap-2 border border-[var(--border)] px-3 py-2 text-xs font-mono uppercase tracking-wider"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            {t('adminIssueRefresh')}
          </button>
        </div>

        {view === 'open' && changeRequests.list.error && !list.error ? (
          <div role="alert" className="border border-red-500/30 bg-red-500/5 p-4 text-sm">
            <p className="text-red-700 dark:text-red-300">
              {t(
                changeRequests.list.error === 'permission-denied'
                  ? 'adminIssuePermissionDenied'
                  : 'adminIssueReadFailed'
              )}
            </p>
            <button
              type="button"
              onClick={() => void changeRequests.retryList()}
              className="mt-3 inline-flex items-center gap-2 border border-[var(--border)] px-3 py-2 text-xs font-mono uppercase tracking-wider"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              {t('retry')}
            </button>
          </div>
        ) : null}

        {inboxLoading ? (
          <div
            role="status"
            className="flex min-h-36 items-center justify-center gap-2 text-sm text-[var(--ink-dim)]"
          >
            <Loader2 className="h-4 w-4 animate-spin" />
            {t('adminIssueLoading')}
          </div>
        ) : inboxError ? (
          <div role="alert" className="border border-red-500/30 bg-red-500/5 p-4 text-sm">
            <p className="text-red-700 dark:text-red-300">
              {t(
                inboxError === 'permission-denied'
                  ? 'adminIssuePermissionDenied'
                  : 'adminIssueReadFailed'
              )}
            </p>
            <button
              type="button"
              onClick={() => void retryInbox()}
              className="mt-3 inline-flex items-center gap-2 border border-[var(--border)] px-3 py-2 text-xs font-mono uppercase tracking-wider"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              {t('retry')}
            </button>
          </div>
        ) : inboxEntries.length === 0 ? (
          <div className="border border-dashed border-[var(--border)] p-8 text-center">
            <Info className="mx-auto mb-3 h-5 w-5 text-[var(--ink-dim)]" />
            <p className="text-sm text-[var(--ink-dim)]">
              {t(view === 'open' ? 'adminAttentionEmptyOpen' : 'adminIssueEmptyHistory')}
            </p>
          </div>
        ) : visibleEntries.length === 0 ? (
          <div className="border border-dashed border-[var(--border)] p-8 text-center">
            <p className="text-sm text-[var(--ink-dim)]">{t('adminIssueEmptySearch')}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {visibleEntries.map((entry) =>
              entry.source === 'booking_change_request' ? (
                <button
                  type="button"
                  key={entry.changeRequest.requestId}
                  onClick={() =>
                    updateQuery({
                      [ADMIN_CHANGE_REQUEST_QUERY_KEY]: entry.changeRequest.requestId,
                      [ADMIN_ISSUE_QUERY_KEY]: undefined,
                    })
                  }
                  className={`w-full border p-4 text-left transition hover:border-[var(--ink-dim)] ${
                    selectedChangeRequestId === entry.changeRequest.requestId
                      ? 'border-[var(--ink)] bg-black/5'
                      : 'border-[var(--border)]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[10px] font-mono uppercase tracking-wider text-amber-700 dark:text-amber-300">
                          {t('adminIssueActionRequired')}
                        </span>
                      </div>
                      <h4 className="text-sm text-[var(--ink)]">
                        {t('adminAttentionChangeRequestKind')}
                      </h4>
                      <p className="truncate text-xs text-[var(--ink-dim)]">
                        {entry.changeRequest.participants
                          .map((participant) => participant.displayName)
                          .join(', ')}
                      </p>
                      <p className="truncate text-xs text-[var(--ink-dim)]">
                        {entry.changeRequest.instructor.displayName}
                      </p>
                      <p className="text-[11px] text-[var(--ink-dim)]">
                        {formatOccurrence(entry.changeRequest)}
                      </p>
                    </div>
                    <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-[var(--ink-dim)]" />
                  </div>
                </button>
              ) : (
                <button
                  type="button"
                  key={entry.issue.issueId}
                  onClick={() =>
                    updateQuery({
                      [ADMIN_ISSUE_QUERY_KEY]: entry.issue.issueId,
                      [ADMIN_CHANGE_REQUEST_QUERY_KEY]: undefined,
                    })
                  }
                  className={`w-full border p-4 text-left transition hover:border-[var(--ink-dim)] ${
                    selectedIssueId === entry.issue.issueId
                      ? 'border-[var(--ink)] bg-black/5'
                      : 'border-[var(--border)]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`border px-2 py-1 text-[10px] font-mono uppercase tracking-wider ${severityClasses(
                            entry.issue.severity
                          )}`}
                        >
                          {t(
                            entry.issue.severity === 'critical'
                              ? 'adminIssueSeverityCritical'
                              : entry.issue.severity === 'urgent'
                                ? 'adminIssueSeverityUrgent'
                                : 'adminIssueSeverityNormal'
                          )}
                        </span>
                        {entry.issue.presentationOrigin === 'guest' ? (
                          <span className="border border-[var(--border)] px-2 py-1 text-[10px] font-mono uppercase tracking-wider text-[var(--ink-dim)]">
                            {t('adminIssueGuestOrigin')}
                          </span>
                        ) : null}
                      </div>
                      <h4 className="text-sm text-[var(--ink)]">
                        {t(ADMIN_ISSUE_KIND_LABEL_KEYS[entry.issue.kind])}
                      </h4>
                      <p className="truncate text-xs text-[var(--ink)]">
                        {entry.issue.subjectDisplayName ?? t('adminIssueUnknownSubject')}
                      </p>
                      <p className="truncate text-xs text-[var(--ink-dim)]">
                        {issueEntityLabel(entry.issue)}
                      </p>
                      {formatIssueTime(entry.issue) ? (
                        <p className="text-[11px] text-[var(--ink-dim)]">
                          {formatIssueTime(entry.issue)}
                        </p>
                      ) : null}
                    </div>
                    <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-[var(--ink-dim)]" />
                  </div>
                </button>
              )
            )}
            {list.hasMore && (
              <button
                type="button"
                disabled={list.loadingMore}
                onClick={() => void loadMore()}
                className="w-full border border-[var(--border)] px-4 py-3 text-xs font-mono uppercase tracking-wider disabled:opacity-50"
              >
                {list.loadingMore ? t('adminIssueLoading') : t('adminIssueLoadMore')}
              </button>
            )}
          </div>
        )}
      </section>

      <aside
        aria-label={t('adminIssueDetailTitle')}
        className={`border border-[var(--border)] bg-[var(--bg)] p-4 ${
          selectedOpen
            ? 'fixed inset-0 z-30 overflow-auto lg:static lg:z-auto'
            : 'hidden min-h-56 lg:flex lg:items-center lg:justify-center'
        }`}
      >
        {selectedChangeRequestParam ? (
          !selectedChangeRequestResult.success ? (
            <div role="alert" className="space-y-3 text-sm text-red-700">
              <p>{t('adminIssueNotFound')}</p>
              <button
                type="button"
                onClick={() => updateQuery({ [ADMIN_CHANGE_REQUEST_QUERY_KEY]: undefined })}
                className="border border-[var(--border)] px-3 py-2 text-xs"
              >
                {t('adminIssueClose')}
              </button>
            </div>
          ) : changeRequests.detail.loading && !selectedChangeRequest ? (
            <div role="status" className="flex min-h-48 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : changeRequests.detail.error ? (
            <div role="alert" className="space-y-3 text-sm text-red-700">
              <p>
                {t(
                  changeRequests.detail.error === 'permission-denied'
                    ? 'adminIssuePermissionDenied'
                    : 'adminIssueReadFailed'
                )}
              </p>
              <button
                type="button"
                onClick={() => void changeRequests.retryDetail()}
                className="inline-flex items-center gap-2 border border-[var(--border)] px-3 py-2 text-xs"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                {t('retry')}
              </button>
            </div>
          ) : !selectedChangeRequest ? (
            <p className="text-sm text-[var(--ink-dim)]">{t('adminIssueNotFound')}</p>
          ) : (
            <div className="space-y-5">
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-base text-[var(--ink)]">
                  {t('adminAttentionChangeRequestKind')}
                </h3>
                <button
                  type="button"
                  aria-label={t('adminIssueClose')}
                  onClick={() => updateQuery({ [ADMIN_CHANGE_REQUEST_QUERY_KEY]: undefined })}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="flex gap-3 border border-amber-500/30 bg-amber-500/5 p-3">
                <ShieldAlert className="h-4 w-4 shrink-0 text-amber-600" />
                <div className="text-xs">
                  <p className="font-medium text-[var(--ink)]">{t('adminIssueActionRequired')}</p>
                  <p className="mt-1 text-[var(--ink-dim)]">
                    {t('adminLessonInstructorRequestedChange')}
                  </p>
                </div>
              </div>

              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-xs">
                <dt className="text-[var(--ink-dim)]">{t('adminAttentionInstructor')}</dt>
                <dd>{selectedChangeRequest.instructor.displayName}</dd>
                <dt className="text-[var(--ink-dim)]">{t('adminAttentionParticipants')}</dt>
                <dd>
                  {selectedChangeRequest.participants
                    .map((participant) => participant.displayName)
                    .join(', ')}
                </dd>
                <dt className="text-[var(--ink-dim)]">{t('adminAttentionLessonTime')}</dt>
                <dd>{formatOccurrence(selectedChangeRequest)}</dd>
                <dt className="text-[var(--ink-dim)]">{t('adminAttentionReason')}</dt>
                <dd>{selectedChangeRequest.reason}</dd>
                <dt className="text-[var(--ink-dim)]">{t('adminAttentionCreatedAt')}</dt>
                <dd>{formatDate(selectedChangeRequest.createdAt)}</dd>
              </dl>

              <button
                type="button"
                onClick={() =>
                  updateQuery({
                    [ADMIN_TAB_QUERY_KEY]: 'operations',
                    [ADMIN_LESSON_BOOKING_QUERY_KEY]: selectedChangeRequest.bookingId,
                    [ADMIN_CHANGE_REQUEST_QUERY_KEY]: selectedChangeRequest.requestId,
                  })
                }
                className="inline-flex items-center gap-2 border border-[var(--border)] px-3 py-2 text-xs font-mono uppercase tracking-wider"
              >
                {t('adminIssueReviewRequest')}
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          )
        ) : !selectedIssueParam ? (
          <div className="hidden text-center text-sm text-[var(--ink-dim)] lg:block">
            {t('adminIssueSelectPrompt')}
          </div>
        ) : !selectedIssueResult.success ? (
          <div role="alert" className="space-y-3 text-sm text-red-700">
            <p>{t('adminIssueNotFound')}</p>
            <button
              type="button"
              onClick={() => updateQuery({ [ADMIN_ISSUE_QUERY_KEY]: undefined })}
              className="border border-[var(--border)] px-3 py-2 text-xs"
            >
              {t('adminIssueClose')}
            </button>
          </div>
        ) : detail.loading ? (
          <div role="status" className="flex min-h-48 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : detail.error ? (
          <div role="alert" className="space-y-3 text-sm text-red-700">
            <p>
              {t(
                detail.error === 'permission-denied'
                  ? 'adminIssuePermissionDenied'
                  : 'adminIssueReadFailed'
              )}
            </p>
            <button
              type="button"
              onClick={() => void retryDetail()}
              className="inline-flex items-center gap-2 border border-[var(--border)] px-3 py-2 text-xs"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              {t('retry')}
            </button>
          </div>
        ) : !detail.item ? (
          <p className="text-sm text-[var(--ink-dim)]">{t('adminIssueNotFound')}</p>
        ) : (
          <div className="space-y-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base text-[var(--ink)]">
                  {t(ADMIN_ISSUE_KIND_LABEL_KEYS[detail.item.kind])}
                </h3>
                {detail.item.presentationOrigin === 'guest' ||
                selectedListIssue?.presentationOrigin === 'guest' ? (
                  <p className="mt-1 text-xs text-[var(--ink-dim)]">{t('adminIssueGuestOrigin')}</p>
                ) : null}
              </div>
              <button
                type="button"
                aria-label={t('adminIssueClose')}
                onClick={() => updateQuery({ [ADMIN_ISSUE_QUERY_KEY]: undefined })}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div
              className={`flex gap-3 border p-3 ${
                detail.item.actionRequirement === 'action_required'
                  ? 'border-amber-500/30 bg-amber-500/5'
                  : 'border-[var(--border)]'
              }`}
            >
              {detail.item.actionRequirement === 'action_required' ? (
                <ShieldAlert className="h-4 w-4 shrink-0 text-amber-600" />
              ) : (
                <Info className="h-4 w-4 shrink-0" />
              )}
              <div className="text-xs">
                <p className="font-medium text-[var(--ink)]">
                  {detail.item.actionRequirement === 'action_required'
                    ? t('adminIssueActionRequired')
                    : t('adminIssueInformational')}
                </p>
                <p className="mt-1 text-[var(--ink-dim)]">
                  {t(ADMIN_ISSUE_GUIDANCE_KEYS[detail.item.resolutionGuidance])}
                </p>
              </div>
            </div>

            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-xs">
              <dt className="text-[var(--ink-dim)]">{t('adminIssueSeverity')}</dt>
              <dd>
                {t(
                  detail.item.severity === 'critical'
                    ? 'adminIssueSeverityCritical'
                    : detail.item.severity === 'urgent'
                      ? 'adminIssueSeverityUrgent'
                      : 'adminIssueSeverityNormal'
                )}
              </dd>
              <dt className="text-[var(--ink-dim)]">{t('adminIssueBlocking')}</dt>
              <dd>{t(ADMIN_ISSUE_BLOCKING_KEYS[detail.item.blockingCondition])}</dd>
              <dt className="text-[var(--ink-dim)]">{t('adminIssueSubject')}</dt>
              <dd>
                {detail.item.courseTitle ??
                  selectedListIssue?.courseTitle ??
                  t(
                    detail.item.subjectRef.subjectKind === 'booking'
                      ? 'adminIssueLessonContext'
                      : 'adminIssueCourseContext'
                  )}
              </dd>
              {(detail.item.subjectDisplayName ||
                detail.item.participant ||
                selectedListIssue?.subjectDisplayName) && (
                <>
                  <dt className="text-[var(--ink-dim)]">{t('adminIssueParticipant')}</dt>
                  <dd>
                    {detail.item.participant?.displayName ??
                      detail.item.subjectDisplayName ??
                      selectedListIssue?.subjectDisplayName}
                  </dd>
                </>
              )}
              {(detail.item.lessonStartsAt || selectedListIssue?.lessonStartsAt) && (
                <>
                  <dt className="text-[var(--ink-dim)]">{t('adminAttentionLessonTime')}</dt>
                  <dd>
                    {formatIssueTime({
                      ...detail.item,
                      lessonStartsAt:
                        detail.item.lessonStartsAt ?? selectedListIssue?.lessonStartsAt,
                      lessonTimeZone:
                        detail.item.lessonTimeZone ?? selectedListIssue?.lessonTimeZone,
                    })}
                  </dd>
                </>
              )}
              <dt className="text-[var(--ink-dim)]">{t('adminIssueOpenedAt')}</dt>
              <dd>{formatDate(detail.item.lifecycle.openedAt)}</dd>
              {detail.item.lessonEndsAt && (
                <>
                  <dt className="text-[var(--ink-dim)]">{t('adminIssueLessonEnded')}</dt>
                  <dd>{formatDate(detail.item.lessonEndsAt)}</dd>
                </>
              )}
              {detail.item.attendanceDeadlineAt && (
                <>
                  <dt className="text-[var(--ink-dim)]">{t('adminIssueAttendanceDeadline')}</dt>
                  <dd>{formatDate(detail.item.attendanceDeadlineAt)}</dd>
                </>
              )}
              {detail.item.missingAttendanceCount !== undefined && (
                <>
                  <dt className="text-[var(--ink-dim)]">{t('adminIssueMissingAttendanceCount')}</dt>
                  <dd>{detail.item.missingAttendanceCount}</dd>
                </>
              )}
            </dl>

            <button
              type="button"
              onClick={() => openIssueDestination(detail.item!)}
              className="inline-flex items-center gap-2 border border-[var(--border)] px-3 py-2 text-xs font-mono uppercase tracking-wider"
            >
              {t(ADMIN_ISSUE_PRIMARY_DESTINATION_KEYS[adminIssuePrimaryDestination(detail.item)])}
              <ChevronRight className="h-3.5 w-3.5" />
            </button>

            {detail.item.payment && adminIssuePrimaryDestination(detail.item) !== 'payment' && (
              <div className="border-t border-[var(--border)] pt-4">
                <h4 className="text-xs font-mono uppercase tracking-wider">
                  {t('adminIssuePaymentSummary')}
                </h4>
                <p className="mt-2 text-xs text-[var(--ink-dim)]">
                  {detail.item.payment.paymentStatus} · {t('adminIssueOutstanding')}:{' '}
                  {formatMoney(detail.item.payment.outstandingAmount)}
                </p>
                <button
                  type="button"
                  onClick={() =>
                    updateQuery({
                      [ADMIN_TAB_QUERY_KEY]: 'finance',
                      [ADMIN_FINANCE_PAYMENT_QUERY_KEY]: detail.item!.payment!.paymentId,
                    })
                  }
                  className="mt-3 inline-flex items-center gap-2 border border-[var(--border)] px-3 py-2 text-xs font-mono uppercase tracking-wider"
                >
                  {t('adminIssueCheckPayment')}
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            {detail.item.payment && adminIssuePrimaryDestination(detail.item) === 'payment' && (
              <div className="border-t border-[var(--border)] pt-4">
                <h4 className="text-xs font-mono uppercase tracking-wider">
                  {t('adminIssuePaymentSummary')}
                </h4>
                <p className="mt-2 text-xs text-[var(--ink-dim)]">
                  {detail.item.payment.paymentStatus} · {t('adminIssueOutstanding')}:{' '}
                  {formatMoney(detail.item.payment.outstandingAmount)}
                </p>
              </div>
            )}

            <div className="border-t border-[var(--border)] pt-4">
              <h4 className="text-xs font-mono uppercase tracking-wider">
                {t('adminIssueAttendanceEvidence')}
              </h4>
              {detail.item.attendance.length === 0 ? (
                <p className="mt-2 text-xs text-[var(--ink-dim)]">
                  {t('adminIssueNoAttendanceEvidence')}
                </p>
              ) : (
                <ul className="mt-2 space-y-1 text-xs text-[var(--ink-dim)]">
                  {detail.item.attendance.map((record) => (
                    <li key={record.attendanceId}>{record.attendanceStatus}</li>
                  ))}
                </ul>
              )}
            </div>

            <div className="border-t border-[var(--border)] pt-4">
              <h4 className="text-xs font-mono uppercase tracking-wider">
                {t('adminIssueAuthorizedActions')}
              </h4>
              <p className="mt-2 text-xs text-[var(--ink-dim)]">
                {t(
                  detail.item.actionRequirement === 'informational'
                    ? 'adminIssueNoCurrentAction'
                    : detail.item.authorizedActions.unavailableReason
                      ? 'adminIssueActionsMissingContext'
                      : 'adminIssueActionsDeferred'
                )}
              </p>
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}

export default AdminIssueCenter;
