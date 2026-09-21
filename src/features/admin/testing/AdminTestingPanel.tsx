import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FlaskConical, RefreshCw, ShieldAlert, Users } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import type {
  TestSessionId,
  TestSessionStatus,
  TestActorDirectoryItem,
  TestSessionInventoryReadModel,
  TestSessionListItem,
  LiveCourseTemplateItem,
} from '@ski-academy/shared-domain';
import {
  queryAdminIssueReadModels,
  queryTestSessionReadModels,
} from '../../../lib/canonical/canonicalReadModelClient';
import { ActionButton } from '../../../ui/ActionButton';
import { useAdminTestingTranslations } from './useAdminTestingTranslations';

export const ADMIN_TEST_SESSION_QUERY_KEY = 'testSession';

const statusTranslationKey: Record<
  TestSessionStatus,
  Parameters<ReturnType<typeof useAdminTestingTranslations>['t']>[0]
> = {
  provisioning: 'adminTestingStatusProvisioning',
  active: 'adminTestingStatusActive',
  locked: 'adminTestingStatusLocked',
  resetting: 'adminTestingStatusResetting',
  deleting: 'adminTestingStatusDeleting',
  closed: 'adminTestingStatusClosed',
  failed: 'adminTestingStatusFailed',
};

function shortId(id: string): string {
  return id.length <= 16 ? id : `${id.slice(0, 8)}…${id.slice(-6)}`;
}

function statusClass(status: TestSessionStatus): string {
  if (status === 'active') return 'border-emerald-500/50 text-emerald-700 bg-emerald-500/10';
  if (status === 'failed') return 'border-rose-500/50 text-rose-700 bg-rose-500/10';
  return 'border-[var(--border)] text-[var(--ink-dim)] bg-black/5';
}

function StatusBadge({ status }: { readonly status: TestSessionStatus }) {
  const { t } = useAdminTestingTranslations();
  return (
    <span
      className={`inline-flex border px-2 py-1 text-[10px] font-mono uppercase tracking-wider ${statusClass(status)}`}
    >
      {t(statusTranslationKey[status])}
    </span>
  );
}

type TestingReadState = {
  readonly sessions: readonly TestSessionListItem[];
  readonly actors: readonly TestActorDirectoryItem[];
  readonly templates: readonly LiveCourseTemplateItem[];
};

const EMPTY_STATE: TestingReadState = { sessions: [], actors: [], templates: [] };

/**
 * Deliberately owns only Testing read models. It never mounts normal LIVE
 * subscriptions and keeps test selection in the URL, not account/global state.
 */
export const AdminTestingPanel: React.FC = () => {
  const { t, formatDate, formatKzt } = useAdminTestingTranslations();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedSessionId = searchParams.get(ADMIN_TEST_SESSION_QUERY_KEY);
  const [state, setState] = useState<TestingReadState>(EMPTY_STATE);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(requestedSessionId);
  const [inventory, setInventory] = useState<TestSessionInventoryReadModel>();
  const [loading, setLoading] = useState(true);
  const [loadingInventory, setLoadingInventory] = useState(false);
  const [error, setError] = useState(false);
  const [testIssueCount, setTestIssueCount] = useState<number>();
  const [createLabel, setCreateLabel] = useState('');
  const [createBalance, setCreateBalance] = useState('1000000');
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<readonly string[]>([]);
  const [selectedActorIds, setSelectedActorIds] = useState<readonly string[]>([]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const [sessions, actors, templates] = await Promise.all([
        queryTestSessionReadModels({ scope: 'test_session_list' }),
        queryTestSessionReadModels({ scope: 'test_actor_directory' }),
        queryTestSessionReadModels({ scope: 'live_course_templates' }),
      ]);
      if (
        sessions.scope !== 'test_session_list' ||
        actors.scope !== 'test_actor_directory' ||
        templates.scope !== 'live_course_templates'
      ) {
        throw new Error('Unexpected Testing read-model response');
      }
      setState({ sessions: sessions.items, actors: actors.items, templates: templates.items });
      setSelectedSessionId((current) => current ?? sessions.items[0]?.testSessionId ?? null);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!requestedSessionId || loading) return;
    const requested = state.sessions.find(
      (session) => session.testSessionId === requestedSessionId
    );
    if (requested?.status === 'active') {
      setSelectedSessionId(requested.testSessionId);
      return;
    }
    // Invalid, deleted, or non-active sessions cannot survive as URL Test context.
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous);
      next.delete(ADMIN_TEST_SESSION_QUERY_KEY);
      return next;
    });
    setSelectedSessionId(state.sessions[0]?.testSessionId ?? null);
  }, [loading, requestedSessionId, setSearchParams, state.sessions]);

  useEffect(() => {
    if (!selectedSessionId) {
      setInventory(undefined);
      return;
    }
    let cancelled = false;
    setLoadingInventory(true);
    void queryTestSessionReadModels({
      scope: 'test_session_inventory',
      testSessionId: selectedSessionId as TestSessionId,
    })
      .then((result) => {
        if (!cancelled && result.scope === 'test_session_inventory') setInventory(result.item);
      })
      .catch(() => {
        if (!cancelled) setInventory(undefined);
      })
      .finally(() => {
        if (!cancelled) setLoadingInventory(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedSessionId]);

  const selectedSession = useMemo(
    () => state.sessions.find((session) => session.testSessionId === selectedSessionId),
    [selectedSessionId, state.sessions]
  );
  const isTestContext =
    requestedSessionId !== null &&
    selectedSession?.testSessionId === requestedSessionId &&
    selectedSession.status === 'active';
  useEffect(() => {
    if (!isTestContext || !selectedSession) {
      setTestIssueCount(undefined);
      return;
    }
    let cancelled = false;
    void queryAdminIssueReadModels({
      scope: 'admin_open',
      pageSize: 20,
      requestedTestSessionId: selectedSession.testSessionId,
    })
      .then((result) => {
        if (!cancelled && result.scope === 'admin_open') setTestIssueCount(result.items.length);
      })
      .catch(() => {
        if (!cancelled) setTestIssueCount(undefined);
      });
    return () => {
      cancelled = true;
    };
  }, [isTestContext, selectedSession]);
  const selectableActors = state.actors.filter((actor) => actor.allowed);
  const creationInputValid =
    createLabel.trim().length > 0 &&
    Number.isFinite(Number(createBalance)) &&
    Number.isInteger(Number(createBalance)) &&
    Number(createBalance) >= 0 &&
    selectedTemplateIds.length > 0 &&
    selectedActorIds.length > 0;

  const openTestContext = () => {
    if (!selectedSession || selectedSession.status !== 'active') return;
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous);
      next.set(ADMIN_TEST_SESSION_QUERY_KEY, selectedSession.testSessionId);
      return next;
    });
  };
  const returnToLive = () => {
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous);
      next.delete(ADMIN_TEST_SESSION_QUERY_KEY);
      return next;
    });
  };
  const selectSession = (sessionId: string) => {
    setSelectedSessionId(sessionId);
    if (requestedSessionId) returnToLive();
  };
  const toggleSelection = (current: readonly string[], value: string) =>
    current.includes(value) ? current.filter((item) => item !== value) : [...current, value];

  return (
    <section aria-labelledby="admin-testing-title" className="space-y-5">
      {isTestContext && selectedSession && (
        <div className="border-2 border-amber-500 bg-amber-500/10 p-4" role="status">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-mono text-xs font-bold uppercase tracking-[0.2em] text-amber-800">
                {t('adminTestingBanner')}
              </p>
              <p className="mt-1 text-sm font-semibold text-[var(--ink)]">
                {selectedSession.label} · {shortId(selectedSession.testSessionId)}
              </p>
              <p className="mt-1 text-xs text-[var(--ink-dim)]">
                {t('adminTestingBannerDescription')}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <StatusBadge status={selectedSession.status} />
              <ActionButton variant="secondary" size="sm" onClick={returnToLive}>
                {t('adminTestingReturnLive')}
              </ActionButton>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3
            id="admin-testing-title"
            className="flex items-center gap-2 font-serif text-xl text-[var(--ink)]"
          >
            <FlaskConical className="h-5 w-5" aria-hidden="true" />
            {t('adminTestingTitle')}
          </h3>
          <p className="mt-1 max-w-3xl text-sm text-[var(--ink-dim)]">
            {t('adminTestingSubtitle')}
          </p>
        </div>
        <ActionButton
          variant="secondary"
          size="sm"
          onClick={() => void refresh()}
          pending={loading}
          pendingLabel={t('adminTestingLoading')}
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
          {t('adminTestingRetry')}
        </ActionButton>
      </div>

      {error ? (
        <div
          className="border border-rose-500/50 bg-rose-500/5 p-4 text-sm text-rose-700"
          role="alert"
        >
          {t('adminTestingLoadError')}
        </div>
      ) : loading ? (
        <div className="border border-[var(--border)] p-5 text-sm text-[var(--ink-dim)]">
          {t('adminTestingLoading')}
        </div>
      ) : state.sessions.length === 0 ? (
        <div className="border border-dashed border-[var(--border)] p-6">
          <h4 className="font-serif text-lg text-[var(--ink)]">{t('adminTestingEmptyTitle')}</h4>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--ink-dim)]">
            {t('adminTestingEmptyDescription')}
          </p>
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[minmax(16rem,0.75fr)_minmax(0,1.5fr)]">
          <div className="border border-[var(--border)] p-3">
            <h4 className="mb-3 font-mono text-xs uppercase tracking-wider text-[var(--ink-dim)]">
              {t('adminTestingSessionList')}
            </h4>
            <div className="space-y-2">
              {state.sessions.map((session) => (
                <button
                  key={session.testSessionId}
                  type="button"
                  onClick={() => selectSession(session.testSessionId)}
                  className={`w-full border p-3 text-left transition ${
                    selectedSessionId === session.testSessionId
                      ? 'border-[var(--ink)] bg-black/5'
                      : 'border-[var(--border)] hover:border-[var(--ink)]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-semibold text-[var(--ink)]">{session.label}</span>
                    <StatusBadge status={session.status} />
                  </div>
                  <p className="mt-2 font-mono text-[10px] text-[var(--ink-dim)]">
                    {shortId(session.testSessionId)}
                  </p>
                  <p className="mt-1 text-xs text-[var(--ink-dim)]">
                    {formatDate(session.createdAt)}
                  </p>
                  <p className="mt-1 text-xs text-[var(--ink-dim)]">
                    {session.createdByAccountId} · {formatKzt(session.startingBalanceKzt)} ·{' '}
                    {
                      state.actors.filter(
                        (actor) => actor.activeTestSessionId === session.testSessionId
                      ).length
                    }{' '}
                    {t('adminTestingActors')}
                  </p>
                </button>
              ))}
            </div>
          </div>

          {selectedSession && (
            <div className="space-y-5">
              <div className="border border-[var(--border)] p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-mono text-xs uppercase tracking-wider text-[var(--ink-dim)]">
                      {t('adminTestingSelected')}
                    </p>
                    <h4 className="mt-1 font-serif text-xl text-[var(--ink)]">
                      {selectedSession.label}
                    </h4>
                  </div>
                  <StatusBadge status={selectedSession.status} />
                </div>
                <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-[var(--ink-dim)]">{t('adminTestingSessionId')}</dt>
                    <dd className="mt-1 font-mono text-xs text-[var(--ink)]">
                      {selectedSession.testSessionId}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[var(--ink-dim)]">{t('adminTestingCreatedBy')}</dt>
                    <dd className="mt-1 text-[var(--ink)]">{selectedSession.createdByAccountId}</dd>
                  </div>
                  <div>
                    <dt className="text-[var(--ink-dim)]">{t('adminTestingCreatedAt')}</dt>
                    <dd className="mt-1 text-[var(--ink)]">
                      {formatDate(selectedSession.createdAt)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[var(--ink-dim)]">{t('adminTestingStartingBalance')}</dt>
                    <dd className="mt-1 text-lg text-[var(--ink)]">
                      {formatKzt(selectedSession.startingBalanceKzt)}
                    </dd>
                  </div>
                </dl>
                <p className="mt-3 text-xs text-[var(--ink-dim)]">
                  {t('adminTestingStartingBalanceHint')}
                </p>
                {selectedSession.status === 'active' ? (
                  <ActionButton className="mt-4" variant="primary" onClick={openTestContext}>
                    {t('adminTestingOpen')}
                  </ActionButton>
                ) : (
                  <p className="mt-4 flex items-center gap-2 text-sm text-amber-700">
                    <ShieldAlert className="h-4 w-4" aria-hidden="true" />
                    {t('adminTestingUnavailable')}
                  </p>
                )}
              </div>

              <div className="border border-[var(--border)] p-4">
                <h4 className="font-mono text-xs uppercase tracking-wider text-[var(--ink-dim)]">
                  {t('adminTestingInventory')}
                </h4>
                {loadingInventory ? (
                  <p className="mt-3 text-sm text-[var(--ink-dim)]">{t('adminTestingLoading')}</p>
                ) : inventory ? (
                  <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {Object.entries(inventory.counts).map(([key, count]) => (
                      <div key={key} className="border border-[var(--border)] p-2">
                        <p className="text-lg text-[var(--ink)]">{count}</p>
                        <p className="font-mono text-[10px] uppercase text-[var(--ink-dim)]">
                          {key}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-[var(--ink-dim)]">
                    {t('adminTestingNoSessions')}
                  </p>
                )}
              </div>

              {isTestContext && (
                <div className="border border-amber-500/40 bg-amber-500/5 p-4">
                  <p className="font-mono text-xs uppercase tracking-wider text-amber-800">
                    {t('adminTestingBanner')}
                  </p>
                  <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <div className="border border-amber-500/30 p-2">
                      <p className="text-lg text-[var(--ink)]">{inventory?.counts.bookings ?? 0}</p>
                      <p className="font-mono text-[10px] uppercase text-[var(--ink-dim)]">
                        Lessons
                      </p>
                    </div>
                    <div className="border border-amber-500/30 p-2">
                      <p className="text-lg text-[var(--ink)]">
                        {inventory?.counts.courseClones ?? 0}
                      </p>
                      <p className="font-mono text-[10px] uppercase text-[var(--ink-dim)]">
                        {t('adminTestingTestCopy')}
                      </p>
                    </div>
                    <div className="border border-amber-500/30 p-2">
                      <p className="text-lg text-[var(--ink)]">{inventory?.counts.payments ?? 0}</p>
                      <p className="font-mono text-[10px] uppercase text-[var(--ink-dim)]">
                        {t('adminTestingTestFunds')}
                      </p>
                    </div>
                    <div className="border border-amber-500/30 p-2">
                      <p className="text-lg text-[var(--ink)]">
                        {testIssueCount ?? inventory?.counts.issues ?? 0}
                      </p>
                      <p className="font-mono text-[10px] uppercase text-[var(--ink-dim)]">
                        Issues
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="border border-[var(--border)] p-4">
          <h4 className="flex items-center gap-2 font-serif text-lg text-[var(--ink)]">
            <Users className="h-4 w-4" aria-hidden="true" />
            {t('adminTestingActors')}
          </h4>
          <div className="mt-3 space-y-2">
            {state.actors.length === 0 ? (
              <p className="text-sm text-[var(--ink-dim)]">{t('adminTestingNoActors')}</p>
            ) : (
              state.actors.map((actor) => (
                <div key={actor.accountId} className="border border-[var(--border)] p-3 text-sm">
                  <div className="flex justify-between gap-2">
                    <span className="font-semibold text-[var(--ink)]">{actor.displayName}</span>
                    <span className="font-mono text-[10px] uppercase text-[var(--ink-dim)]">
                      {actor.kind}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-[var(--ink-dim)]">
                    {t('adminTestingParticipants')}: {actor.participantIds.length} ·{' '}
                    {actor.instructorId
                      ? t('adminTestingInstructor')
                      : actor.allowed
                        ? t('adminTestingAllowed')
                        : t('adminTestingNotAllowed')}
                  </p>
                  <p className="mt-1 text-xs text-[var(--ink-dim)]">
                    {actor.activeTestSessionId === selectedSessionId
                      ? t('adminTestingAssigned')
                      : t('adminTestingNotAssigned')}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
        <div className="border border-[var(--border)] p-4">
          <h4 className="font-serif text-lg text-[var(--ink)]">
            {t('adminTestingCourseTemplates')}
          </h4>
          <p className="mt-1 text-xs text-[var(--ink-dim)]">
            {t('adminTestingCourseTemplatesHint')}
          </p>
          <div className="mt-3 space-y-2">
            {state.templates.length === 0 ? (
              <p className="text-sm text-[var(--ink-dim)]">{t('adminTestingNoTemplates')}</p>
            ) : (
              state.templates.map((course) => (
                <div key={course.courseId} className="border border-[var(--border)] p-3 text-sm">
                  <span className="font-semibold text-[var(--ink)]">{course.title}</span>
                  <span className="ml-2 font-mono text-[10px] text-[var(--ink-dim)]">
                    LIVE template
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <details className="border border-[var(--border)] p-4">
        <summary className="cursor-pointer font-serif text-lg text-[var(--ink)]">
          {t('adminTestingCreate')}
        </summary>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-sm text-[var(--ink-dim)]">
            {t('adminTestingTitle')}
            <input
              value={createLabel}
              onChange={(event) => setCreateLabel(event.target.value)}
              className="mt-1 block w-full border border-[var(--border)] bg-transparent p-2 text-[var(--ink)]"
            />
          </label>
          <label className="text-sm text-[var(--ink-dim)]">
            {t('adminTestingStartingBalance')}
            <input
              type="number"
              min="0"
              step="1"
              value={createBalance}
              onChange={(event) => setCreateBalance(event.target.value)}
              className="mt-1 block w-full border border-[var(--border)] bg-transparent p-2 text-[var(--ink)]"
            />
          </label>
          <fieldset>
            <legend className="text-sm text-[var(--ink-dim)]">
              {t('adminTestingCourseTemplates')}
            </legend>
            {state.templates.map((course) => (
              <label key={course.courseId} className="mt-1 flex gap-2 text-xs text-[var(--ink)]">
                <input
                  type="checkbox"
                  checked={selectedTemplateIds.includes(course.courseId)}
                  onChange={() =>
                    setSelectedTemplateIds((current) => toggleSelection(current, course.courseId))
                  }
                />
                {course.title}
              </label>
            ))}
          </fieldset>
          <fieldset>
            <legend className="text-sm text-[var(--ink-dim)]">{t('adminTestingActors')}</legend>
            {selectableActors.map((actor) => (
              <label key={actor.accountId} className="mt-1 flex gap-2 text-xs text-[var(--ink)]">
                <input
                  type="checkbox"
                  checked={selectedActorIds.includes(actor.accountId)}
                  onChange={() =>
                    setSelectedActorIds((current) => toggleSelection(current, actor.accountId))
                  }
                />
                {actor.displayName}
              </label>
            ))}
          </fieldset>
        </div>
        <p className="mt-3 text-xs text-[var(--ink-dim)]">
          {creationInputValid
            ? t('adminTestingCreateDeferred')
            : t('adminTestingLifecycleDeferred')}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <ActionButton disabled title={t('adminTestingCreateDeferred')}>
            {t('adminTestingCreate')}
          </ActionButton>
          <ActionButton disabled variant="secondary" title={t('adminTestingLifecycleDeferred')}>
            {t('adminTestingClose')}
          </ActionButton>
          <ActionButton disabled variant="danger" title={t('adminTestingLifecycleDeferred')}>
            {t('adminTestingReset')}
          </ActionButton>
          <ActionButton disabled variant="danger" title={t('adminTestingLifecycleDeferred')}>
            {t('adminTestingDelete')}
          </ActionButton>
        </div>
      </details>
    </section>
  );
};
