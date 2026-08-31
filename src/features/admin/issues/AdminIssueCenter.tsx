import {
  AdminIssueIdSchema,
  ADMIN_ISSUE_SEVERITIES,
  type AdminIssueInboxItem,
} from '@ski-academy/shared-domain';
import { ChevronRight, Info, Loader2, RefreshCw, ShieldAlert, X } from 'lucide-react';
import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  ADMIN_ISSUE_QUERY_KEY,
  ADMIN_ISSUE_SEVERITY_QUERY_KEY,
  ADMIN_ISSUE_VIEW_QUERY_KEY,
  ADMIN_FINANCE_PAYMENT_QUERY_KEY,
  ADMIN_LESSON_BOOKING_QUERY_KEY,
  ADMIN_COURSE_ENROLLMENT_QUERY_KEY,
  ADMIN_TAB_QUERY_KEY,
  parseAdminIssueSeverity,
  parseAdminIssueView,
} from '../adminNavigation';
import {
  ADMIN_ISSUE_BLOCKING_KEYS,
  ADMIN_ISSUE_GUIDANCE_KEYS,
  ADMIN_ISSUE_KIND_LABEL_KEYS,
} from './adminIssuePresentation';
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

export function AdminIssueCenter() {
  const { t, language } = useAdminIssueTranslations();
  const [searchParams, setSearchParams] = useSearchParams();
  const view = parseAdminIssueView(searchParams.get(ADMIN_ISSUE_VIEW_QUERY_KEY));
  const severity = parseAdminIssueSeverity(searchParams.get(ADMIN_ISSUE_SEVERITY_QUERY_KEY));
  const selectedIssueParam = searchParams.get(ADMIN_ISSUE_QUERY_KEY);
  const selectedIssueResult = AdminIssueIdSchema.safeParse(selectedIssueParam);
  const selectedIssueId = selectedIssueResult.success ? selectedIssueResult.data : undefined;

  const { list, detail, retryList, retryDetail, loadMore } = useAdminIssueReadModels({
    enabled: true,
    scope: view === 'history' ? 'admin_history' : 'admin_open',
    ...(severity === undefined ? {} : { severity }),
    ...(selectedIssueId === undefined ? {} : { selectedIssueId }),
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
  const formatMoney = (canonicalKzt: number) =>
    new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: 'KZT',
      maximumFractionDigits: 0,
    }).format(canonicalKzt);
  const detailBookingId =
    detail.item?.subjectRef.subjectKind === 'booking'
      ? detail.item.subjectRef.bookingId
      : undefined;
  const detailEnrollmentId =
    detail.item?.subjectRef.subjectKind === 'course_enrollment'
      ? detail.item.subjectRef.enrollmentId
      : undefined;

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
                })
              }
              className={`px-3 py-2 text-xs font-mono uppercase tracking-wider ${
                view === 'open' ? 'bg-[var(--ink)] text-[var(--bg)]' : 'text-[var(--ink-dim)]'
              }`}
            >
              {t('adminIssueOpen')}
            </button>
            <button
              type="button"
              aria-pressed={view === 'history'}
              onClick={() =>
                updateQuery({
                  [ADMIN_ISSUE_VIEW_QUERY_KEY]: 'history',
                  [ADMIN_ISSUE_QUERY_KEY]: undefined,
                })
              }
              className={`px-3 py-2 text-xs font-mono uppercase tracking-wider ${
                view === 'history' ? 'bg-[var(--ink)] text-[var(--bg)]' : 'text-[var(--ink-dim)]'
              }`}
            >
              {t('adminIssueHistory')}
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
        </div>

        {list.loading ? (
          <div
            role="status"
            className="flex min-h-36 items-center justify-center gap-2 text-sm text-[var(--ink-dim)]"
          >
            <Loader2 className="h-4 w-4 animate-spin" />
            {t('adminIssueLoading')}
          </div>
        ) : list.error ? (
          <div role="alert" className="border border-red-500/30 bg-red-500/5 p-4 text-sm">
            <p className="text-red-700 dark:text-red-300">
              {t(
                list.error === 'permission-denied'
                  ? 'adminIssuePermissionDenied'
                  : 'adminIssueReadFailed'
              )}
            </p>
            <button
              type="button"
              onClick={() => void retryList()}
              className="mt-3 inline-flex items-center gap-2 border border-[var(--border)] px-3 py-2 text-xs font-mono uppercase tracking-wider"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              {t('retry')}
            </button>
          </div>
        ) : list.items.length === 0 ? (
          <div className="border border-dashed border-[var(--border)] p-8 text-center">
            <Info className="mx-auto mb-3 h-5 w-5 text-[var(--ink-dim)]" />
            <p className="text-sm text-[var(--ink-dim)]">
              {t(view === 'open' ? 'adminIssueEmptyOpen' : 'adminIssueEmptyHistory')}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {list.items.map((item) => (
              <button
                type="button"
                key={item.issueId}
                onClick={() => updateQuery({ [ADMIN_ISSUE_QUERY_KEY]: item.issueId })}
                className={`w-full border p-4 text-left transition hover:border-[var(--ink-dim)] ${
                  selectedIssueId === item.issueId
                    ? 'border-[var(--ink)] bg-black/5'
                    : 'border-[var(--border)]'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`border px-2 py-1 text-[10px] font-mono uppercase tracking-wider ${severityClasses(
                          item.severity
                        )}`}
                      >
                        {t(
                          item.severity === 'critical'
                            ? 'adminIssueSeverityCritical'
                            : item.severity === 'urgent'
                              ? 'adminIssueSeverityUrgent'
                              : 'adminIssueSeverityNormal'
                        )}
                      </span>
                      <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-dim)]">
                        {item.lifecycle.status}
                      </span>
                      <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-dim)]">
                        {item.actionRequirement === 'action_required'
                          ? t('adminIssueActionRequired')
                          : t('adminIssueInformational')}
                      </span>
                    </div>
                    <h4 className="text-sm text-[var(--ink)]">
                      {t(ADMIN_ISSUE_KIND_LABEL_KEYS[item.kind])}
                    </h4>
                    <p className="truncate text-xs text-[var(--ink-dim)]">
                      {item.subjectRef.subjectKind} ·{' '}
                      {item.subjectRef.subjectKind === 'booking'
                        ? item.subjectRef.bookingId
                        : item.subjectRef.enrollmentId}
                    </p>
                    <p className="text-[11px] text-[var(--ink-dim)]">
                      {formatDate(item.updatedAt)}
                    </p>
                  </div>
                  <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-[var(--ink-dim)]" />
                </div>
              </button>
            ))}
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
        className="min-h-56 border border-[var(--border)] p-4"
      >
        {!selectedIssueParam ? (
          <div className="flex min-h-48 items-center justify-center text-center text-sm text-[var(--ink-dim)]">
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
                <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-dim)]">
                  {detail.item.issueId}
                </p>
                <h3 className="mt-2 text-base text-[var(--ink)]">
                  {t(ADMIN_ISSUE_KIND_LABEL_KEYS[detail.item.kind])}
                </h3>
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
              <dt className="text-[var(--ink-dim)]">{t('adminIssueStatus')}</dt>
              <dd>{detail.item.lifecycle.status}</dd>
              <dt className="text-[var(--ink-dim)]">{t('adminIssueSeverity')}</dt>
              <dd>{detail.item.severity}</dd>
              <dt className="text-[var(--ink-dim)]">{t('adminIssueBlocking')}</dt>
              <dd>{t(ADMIN_ISSUE_BLOCKING_KEYS[detail.item.blockingCondition])}</dd>
              <dt className="text-[var(--ink-dim)]">{t('adminIssueSubject')}</dt>
              <dd className="break-all">
                {detail.item.subjectRef.subjectKind} ·{' '}
                {detail.item.subjectRef.subjectKind === 'booking'
                  ? detail.item.subjectRef.bookingId
                  : detail.item.subjectRef.enrollmentId}
              </dd>
              <dt className="text-[var(--ink-dim)]">{t('adminIssueRevision')}</dt>
              <dd>{detail.item.revision}</dd>
              {detail.item.participant && (
                <>
                  <dt className="text-[var(--ink-dim)]">{t('adminIssueParticipant')}</dt>
                  <dd>{detail.item.participant.displayName}</dd>
                </>
              )}
            </dl>

            {detailBookingId && (
              <button
                type="button"
                onClick={() =>
                  updateQuery({
                    [ADMIN_TAB_QUERY_KEY]: 'operations',
                    [ADMIN_LESSON_BOOKING_QUERY_KEY]: detailBookingId,
                  })
                }
                className="inline-flex items-center gap-2 border border-[var(--border)] px-3 py-2 text-xs font-mono uppercase tracking-wider"
              >
                Open canonical booking
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            )}

            {detailEnrollmentId && (
              <button
                type="button"
                onClick={() =>
                  updateQuery({
                    [ADMIN_TAB_QUERY_KEY]: 'operations',
                    [ADMIN_COURSE_ENROLLMENT_QUERY_KEY]: detailEnrollmentId,
                  })
                }
                className="inline-flex items-center gap-2 border border-[var(--border)] px-3 py-2 text-xs font-mono uppercase tracking-wider"
              >
                Open canonical course enrollment
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            )}

            {detail.item.payment && (
              <div className="border-t border-[var(--border)] pt-4">
                <h4 className="text-xs font-mono uppercase tracking-wider">
                  {t('adminIssuePaymentSummary')}
                </h4>
                <p className="mt-2 text-xs text-[var(--ink-dim)]">
                  {detail.item.payment.paymentStatus} · {t('adminIssueOutstanding')}:{' '}
                  {formatMoney(detail.item.payment.outstandingAmount)} · rev{' '}
                  {detail.item.payment.revision}
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
                  {t('adminIssueOpenPayment')}
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
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
                    <li key={record.attendanceId}>
                      {record.attendanceStatus} · {record.attendanceId} · rev {record.revision}
                    </li>
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
              <ul className="mt-2 space-y-1 text-xs">
                {detail.item.authorizedActions.actions.map((action) => (
                  <li key={action.kind}>
                    {t(ADMIN_ISSUE_GUIDANCE_KEYS[action.kind])} · {action.availability}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}

export default AdminIssueCenter;
