import { AdminModal } from '../components/AdminModal';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Copy, ShieldAlert } from 'lucide-react';
import {
  TEST_SESSION_RESET_CONFIRMATION,
  type TestSessionLifecycleResult,
  type TestSessionListItem,
  type TestSessionInventoryReadModel,
} from '@ski-academy/shared-domain';
import {
  executeTestSessionLifecycle,
  lifecycleErrorCode,
} from '../../../lib/canonical/testSessionLifecycleClient';
import { ActionButton } from '../../../ui/ActionButton';
import { useAdminTestingTranslations } from './useAdminTestingTranslations';
import {
  canExecuteResetPreview,
  isManifestExpired,
  lifecycleErrorMessageKey,
  manifestDestructiveTotal,
  parseManifestSafetyMarkers,
  type TestSessionResetUiPhase,
} from './testSessionResetState';

export type TestSessionResetSectionProps = {
  readonly testSession: TestSessionListItem;
  readonly inventory?: TestSessionInventoryReadModel;
  readonly maintenanceLocked: boolean;
  readonly onAfterReset: () => Promise<void>;
  readonly onBusyChange?: (busy: boolean) => void;
};

function shortHash(hash: string): string {
  return hash.length <= 20 ? hash : `${hash.slice(0, 10)}…${hash.slice(-8)}`;
}

async function copyText(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
  }
}

export const TestSessionResetSection: React.FC<TestSessionResetSectionProps> = ({
  testSession,
  inventory,
  maintenanceLocked,
  onAfterReset,
  onBusyChange,
}) => {
  const { t, formatKzt } = useAdminTestingTranslations();
  const [phase, setPhase] = useState<TestSessionResetUiPhase>('idle');
  const [previewSessionId, setPreviewSessionId] = useState<string>();
  const [previewResult, setPreviewResult] = useState<TestSessionLifecycleResult>();
  const [executeResult, setExecuteResult] = useState<TestSessionLifecycleResult>();
  const [errorCode, setErrorCode] = useState<string>();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const manifest = previewResult?.manifest;
  const destructiveTotal = manifest ? manifestDestructiveTotal(manifest.counts) : 0;
  const safety = manifest ? parseManifestSafetyMarkers(manifest.warnings) : undefined;
  const manifestExpired = manifest ? isManifestExpired(manifest.expiresAt, nowMs) : false;

  const resetBlocked =
    maintenanceLocked ||
    testSession.status !== 'active' ||
    phase === 'preview_loading' ||
    phase === 'executing';

  useEffect(() => {
    onBusyChange?.(phase === 'preview_loading' || phase === 'executing');
  }, [onBusyChange, phase]);

  useEffect(() => {
    setPhase('idle');
    setPreviewSessionId(undefined);
    setPreviewResult(undefined);
    setExecuteResult(undefined);
    setErrorCode(undefined);
    setConfirmOpen(false);
  }, [testSession.testSessionId]);

  useEffect(() => {
    if (!manifest) return;
    const tick = () => setNowMs(Date.now());
    const interval = window.setInterval(tick, 30_000);
    return () => window.clearInterval(interval);
  }, [manifest]);

  useEffect(() => {
    if (!manifest || phase === 'executing' || phase === 'complete') return;
    if (manifestExpired) setPhase('preview_expired');
    else if (phase === 'idle' && previewResult?.outcome === 'preview') setPhase('preview_ready');
  }, [manifest, manifestExpired, phase, previewResult?.outcome]);

  const canExecute =
    manifest &&
    previewSessionId === testSession.testSessionId &&
    canExecuteResetPreview({
      manifest,
      boundTestSessionId: testSession.testSessionId,
      previewTestSessionId: previewSessionId ?? '',
      nowMs,
    });

  const runPreview = useCallback(async () => {
    setPhase('preview_loading');
    setErrorCode(undefined);
    setExecuteResult(undefined);
    setConfirmOpen(false);
    try {
      const result = await executeTestSessionLifecycle(
        {
          command: 'preview_test_session_reset',
          testSessionId: testSession.testSessionId,
        },
        `preview_reset_${crypto.randomUUID()}`
      );
      setPreviewResult(result);
      setPreviewSessionId(testSession.testSessionId);
      const expired = result.manifest && isManifestExpired(result.manifest.expiresAt, Date.now());
      setPhase(expired ? 'preview_expired' : 'preview_ready');
    } catch (error) {
      setErrorCode(lifecycleErrorCode(error));
      setPreviewResult(undefined);
      setPreviewSessionId(undefined);
      setPhase('failed');
    }
  }, [testSession.testSessionId]);

  const runExecute = useCallback(async () => {
    if (!manifest || !canExecute) return;
    setConfirmOpen(false);
    setPhase('executing');
    setErrorCode(undefined);
    try {
      const result = await executeTestSessionLifecycle(
        {
          command: 'execute_test_session_reset',
          testSessionId: testSession.testSessionId,
          manifestId: manifest.manifestId,
          confirmation: TEST_SESSION_RESET_CONFIRMATION,
        },
        `execute_reset_${manifest.manifestId}`
      );
      setExecuteResult(result);
      setPreviewResult(undefined);
      setPreviewSessionId(undefined);
      setPhase('complete');
      await onAfterReset();
    } catch (error) {
      setErrorCode(lifecycleErrorCode(error));
      setPhase('failed');
    }
  }, [canExecute, manifest, onAfterReset, testSession.testSessionId]);

  const inventoryRevision = inventory?.inventoryRevision ?? testSession.inventoryRevision;

  const reseedWallet = formatKzt(testSession.startingBalanceKzt);
  const clonedCourseCount = inventory?.clonedCourseIds.length ?? 0;
  const reseedCourses =
    clonedCourseCount > 0
      ? `${clonedCourseCount} TEST`
      : t('adminTestingResetReseedCoursesPending');

  const errorMessage = errorCode ? t(lifecycleErrorMessageKey(errorCode) as never) : undefined;

  const remainingValidity = useMemo(() => {
    if (!manifest || manifestExpired) return undefined;
    const ms = Date.parse(manifest.expiresAt) - nowMs;
    if (ms <= 0) return undefined;
    const minutes = Math.ceil(ms / 60_000);
    return t('adminTestingResetExpiresIn').replace('{minutes}', String(minutes));
  }, [manifest, manifestExpired, nowMs, t]);

  return (
    <div
      className="border border-rose-500/30 bg-rose-500/5 p-4"
      data-testid="test-session-reset-section"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="type-card-title uppercase text-rose-800">
            {t('adminTestingResetSectionTitle')}
          </h4>
          <p className="mt-1 max-w-2xl type-compact text-[var(--ink-dim)]">
            {t('adminTestingResetSectionDescription')}
          </p>
        </div>
        {phase === 'idle' || phase === 'failed' || phase === 'preview_expired' ? (
          <ActionButton
            variant="danger"
            size="sm"
            data-testid="reset-preview-button"
            disabled={resetBlocked}
            onClick={() => void runPreview()}
          >
            {phase === 'preview_expired'
              ? t('adminTestingResetNewPreview')
              : t('adminTestingResetPreview')}
          </ActionButton>
        ) : null}
      </div>

      <dl className="mt-4 grid gap-2 type-compact sm:grid-cols-3">
        <div>
          <dt className="text-[var(--ink-dim)]">{t('adminTestingStatus')}</dt>
          <dd className="mt-1 type-caption text-[var(--ink)]">{testSession.status}</dd>
        </div>
        <div>
          <dt className="text-[var(--ink-dim)]">{t('adminTestingResetInventoryRevision')}</dt>
          <dd className="mt-1 type-caption text-[var(--ink)]">{inventoryRevision}</dd>
        </div>
        <div>
          <dt className="text-[var(--ink-dim)]">{t('adminTestingSessionId')}</dt>
          <dd className="mt-1 type-caption text-[var(--ink)]">{testSession.testSessionId}</dd>
        </div>
      </dl>

      {phase === 'preview_loading' ? (
        <p className="mt-4 type-compact text-[var(--ink-dim)]" role="status">
          {t('adminTestingResetPreviewLoading')}
        </p>
      ) : null}

      {errorMessage ? (
        <div
          className="mt-4 flex gap-2 border border-rose-500/50 bg-rose-500/10 p-3 type-compact text-rose-800"
          role="alert"
        >
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span data-testid="reset-error">{errorMessage}</span>
        </div>
      ) : null}

      {manifest && (phase === 'preview_ready' || phase === 'preview_expired') ? (
        <div className="mt-4 space-y-4 border border-[var(--border)] bg-[var(--surface)] p-4">
          {manifestExpired ? (
            <p
              className="flex items-center gap-2 type-compact font-medium text-amber-800"
              role="status"
            >
              <ShieldAlert className="h-4 w-4" aria-hidden="true" />
              {t('adminTestingResetPreviewExpired')}
            </p>
          ) : remainingValidity ? (
            <p className="type-caption text-[var(--ink-dim)]">{remainingValidity}</p>
          ) : null}

          <div className="grid gap-3 type-compact sm:grid-cols-2">
            <div>
              <p className="text-[var(--ink-dim)]">{t('adminTestingResetManifestId')}</p>
              <div className="mt-1 flex items-center gap-2">
                <code className="type-caption text-[var(--ink)]">{manifest.manifestId}</code>
                <button
                  type="button"
                  className="text-[var(--ink-dim)] hover:text-[var(--ink)]"
                  aria-label={t('adminTestingResetCopy')}
                  onClick={() => void copyText(manifest.manifestId)}
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            <div>
              <p className="text-[var(--ink-dim)]">{t('adminTestingResetHash')}</p>
              <div className="mt-1 flex items-center gap-2">
                <code className="type-caption text-[var(--ink)]" title={manifest.manifestHash}>
                  {shortHash(manifest.manifestHash)}
                </code>
                <button
                  type="button"
                  className="text-[var(--ink-dim)] hover:text-[var(--ink)]"
                  aria-label={t('adminTestingResetCopy')}
                  onClick={() => void copyText(manifest.manifestHash)}
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            <div>
              <p className="text-[var(--ink-dim)]">{t('adminTestingCreatedAt')}</p>
              <p className="mt-1 type-caption text-[var(--ink)]">
                {new Date(manifest.createdAt).toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-[var(--ink-dim)]">{t('adminTestingResetExpiresAt')}</p>
              <p className="mt-1 type-caption text-[var(--ink)]">
                {new Date(manifest.expiresAt).toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-[var(--ink-dim)]">{t('adminTestingResetInventoryRevision')}</p>
              <p className="mt-1 type-caption">{manifest.inventoryRevision}</p>
            </div>
            <div>
              <p className="text-[var(--ink-dim)]">{t('adminTestingResetDestructiveTotal')}</p>
              <p className="mt-1 type-card-title text-[var(--ink)]">{destructiveTotal}</p>
            </div>
          </div>

          <div
            className="grid grid-cols-2 gap-2 sm:grid-cols-4"
            data-testid="reset-manifest-counts"
          >
            {Object.entries(manifest.counts).map(([key, count]) => (
              <div key={key} className="border border-[var(--border)] p-2">
                <p className="type-card-title text-[var(--ink)]">{count}</p>
                <p className="type-caption uppercase text-[var(--ink-dim)]">{key}</p>
              </div>
            ))}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div
              className={`border p-3 ${safety && safety.liveTargetCount === 0 ? 'border-emerald-500/40' : 'border-rose-500/50'}`}
              data-testid="reset-live-targets"
            >
              <p className="type-caption uppercase text-[var(--ink-dim)]">
                {t('adminTestingResetLiveTargets')}
              </p>
              <p className="mt-1 type-metric">{safety?.liveTargetCount ?? 0}</p>
            </div>
            <div
              className={`border p-3 ${safety && safety.foreignSessionTargetCount === 0 ? 'border-emerald-500/40' : 'border-rose-500/50'}`}
              data-testid="reset-foreign-targets"
            >
              <p className="type-caption uppercase text-[var(--ink-dim)]">
                {t('adminTestingResetForeignTargets')}
              </p>
              <p className="mt-1 type-metric">{safety?.foreignSessionTargetCount ?? 0}</p>
            </div>
          </div>

          {(safety?.liveTargetCount ?? 0) > 0 || (safety?.foreignSessionTargetCount ?? 0) > 0 ? (
            <p className="type-compact font-medium text-rose-800" role="alert">
              {t('adminTestingResetSafetyBlocked')}
            </p>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <p className="type-caption uppercase text-[var(--ink-dim)]">
                {t('adminTestingResetWillDelete')}
              </p>
              <p className="mt-1 type-compact text-[var(--ink)]">
                {t('adminTestingResetWillDeleteSummary').replace(
                  '{count}',
                  String(destructiveTotal)
                )}
              </p>
            </div>
            <div>
              <p className="type-caption uppercase text-[var(--ink-dim)]">
                {t('adminTestingResetWillPreserve')}
              </p>
              <ul className="mt-1 list-inside list-disc type-caption text-[var(--ink)]">
                {manifest.preserve.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
            <div>
              <p className="type-caption uppercase text-[var(--ink-dim)]">
                {t('adminTestingResetWillReseed')}
              </p>
              <ul className="mt-1 list-inside list-disc type-caption text-[var(--ink)]">
                <li>{t('adminTestingResetReseedWallet').replace('{amount}', reseedWallet)}</li>
                <li>{t('adminTestingResetReseedCourses').replace('{courses}', reseedCourses)}</li>
              </ul>
            </div>
          </div>

          {canExecute && phase === 'preview_ready' ? (
            <ActionButton
              variant="danger"
              data-testid="reset-open-confirm"
              onClick={() => setConfirmOpen(true)}
            >
              {t('adminTestingResetExecute')}
            </ActionButton>
          ) : null}
        </div>
      ) : null}

      {phase === 'executing' ? (
        <p className="mt-4 type-compact text-[var(--ink-dim)]" role="status">
          {t('adminTestingResetExecuting')}
        </p>
      ) : null}

      {phase === 'complete' && executeResult ? (
        <div
          className="mt-4 space-y-3 border border-emerald-500/40 bg-emerald-500/5 p-4"
          data-testid="reset-complete"
        >
          <p className="font-semibold text-emerald-900">{t('adminTestingResetComplete')}</p>
          <dl className="grid gap-2 type-compact sm:grid-cols-2">
            <div>
              <dt className="text-[var(--ink-dim)]">{t('adminTestingStatus')}</dt>
              <dd className="type-caption">{executeResult.status ?? testSession.status}</dd>
            </div>
            <div>
              <dt className="text-[var(--ink-dim)]">{t('adminTestingResetVerifier')}</dt>
              <dd className="type-caption">
                {executeResult.verifier?.ok
                  ? t('adminTestingResetVerifierOk')
                  : t('adminTestingResetVerifierFailed')}
              </dd>
            </div>
            {executeResult.verifier && !executeResult.verifier.ok ? (
              <div className="sm:col-span-2">
                <dt className="text-[var(--ink-dim)]">{t('adminTestingResetVerifierChecks')}</dt>
                <dd className="type-caption">{executeResult.verifier.failedChecks.join(', ')}</dd>
              </div>
            ) : null}
          </dl>
          <ActionButton variant="secondary" size="sm" onClick={() => setPhase('idle')}>
            {t('adminTestingResetDone')}
          </ActionButton>
        </div>
      ) : null}

      {confirmOpen && manifest && canExecute ? (
        <AdminModal
          title={t('adminTestingResetConfirmTitle')}
          closeLabel={t('adminTestingResetConfirmCancel')}
          onClose={() => setConfirmOpen(false)}
          closeDisabled={phase === 'executing'}
          width="lg"
          data-testid="reset-confirm-modal"
          footer={
            <>
              <ActionButton
                variant="secondary"
                unstyled
                className="btn-secondary flex-1 px-4 py-3"
                data-testid="reset-confirm-cancel"
                onClick={() => setConfirmOpen(false)}
              >
                {t('adminTestingResetConfirmCancel')}
              </ActionButton>
              <ActionButton
                variant="danger"
                className="flex-1 rounded-full px-4 py-3"
                data-testid="reset-confirm-execute"
                pending={phase === 'executing'}
                onClick={() => void runExecute()}
              >
                {t('adminTestingResetConfirmExecute')}
              </ActionButton>
            </>
          }
        >
          <p className="type-caption text-[var(--ink-dim)]">
            {t('adminTestingResetConfirmBody').replace('{count}', String(destructiveTotal))}
          </p>
          <dl className="space-y-2 type-caption">
            <div>
              <dt className="text-[var(--ink-dim)]">{t('adminTestingResetManifestId')}</dt>
              <dd className="font-mono">{manifest.manifestId}</dd>
            </div>
            <div>
              <dt className="text-[var(--ink-dim)]">{t('adminTestingResetHash')}</dt>
              <dd className="font-mono break-all">{manifest.manifestHash}</dd>
            </div>
            <div>
              <dt className="text-[var(--ink-dim)]">{t('adminTestingResetDestructiveTotal')}</dt>
              <dd>{destructiveTotal}</dd>
            </div>
            <div>
              <dt className="text-[var(--ink-dim)]">{t('adminTestingResetReseedWallet')}</dt>
              <dd>{reseedWallet}</dd>
            </div>
            <div>
              <dt className="text-[var(--ink-dim)]">{t('adminTestingResetReseedCourses')}</dt>
              <dd>{reseedCourses}</dd>
            </div>
          </dl>
        </AdminModal>
      ) : null}
    </div>
  );
};
