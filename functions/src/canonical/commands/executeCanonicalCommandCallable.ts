import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { error as logError } from 'firebase-functions/logger';
import type { Firestore } from 'firebase-admin/firestore';
import type {
  CanonicalExecutionScope,
  CommandKind,
  CommandResult,
} from '@ski-academy/shared-domain';
import {
  CanonicalCommandError,
  TestSessionPolicyError,
  identityDocumentMatchesReadScope,
} from '@ski-academy/shared-domain';
import { instructorCatalogPath } from '../bookings/bookingStore';
import { hasInstructorAccountLink } from '../participantAccess/instructorIdentity';
import {
  buildCommandEnvelopeFromCallable,
  type CallableCommandTransportInput,
} from './callableTransportAdapter';
import {
  createCanonicalCommandRuntime,
  readGuestActionTokenSecret,
} from './canonicalCommandRuntime';
import { getCommandPolicy } from './commandPolicies';
import {
  mapCommandErrorTransportToHttpsError,
  rethrowCanonicalCommandErrorAsHttps,
} from './mapCommandError';
import { parseAuthenticatedCallableCommandTransportInput } from './guestCallableTransportAdapter';
import {
  isAdministratorProfile,
  resolveCallableAccountContext,
  type CallableAccountProfile,
} from './resolveCallableAccountContext';
import { parseAccount } from '../participantAccess/participantAccessStore';
import { logSecurityCommandEvent, securityDenialCode } from './securityCommandLogging';
import {
  requireCurrentAdministratorSession,
  requireAdministratorAccountSessionPolicy,
  requireRecentAdministratorAuthentication,
} from '../../security/administratorSession';
import {
  CanonicalExecutionScopeError,
  createFirestoreCanonicalExecutionScopeStore,
  resolveCanonicalExecutionScope,
} from '../testSessions';

function readCallableAccountProfile(
  data: Record<string, unknown> | undefined
): CallableAccountProfile {
  if (!data) return {};
  return {
    ...(typeof data.role === 'string' ? { role: data.role } : {}),
    ...(typeof data.systemRole === 'string' ? { systemRole: data.systemRole } : {}),
    ...(typeof data.instructorId === 'string' ? { instructorId: data.instructorId } : {}),
    ...(typeof data.isInstructor === 'boolean' ? { isInstructor: data.isInstructor } : {}),
  };
}

function mapCallableContextError(error: unknown): never {
  if (error instanceof Error) {
    if (error.message === 'unauthenticated') {
      throw new HttpsError('unauthenticated', 'Authentication is required.');
    }
    if (error.message === 'forbidden' || error.message === 'forbidden_capability') {
      throw new HttpsError('permission-denied', 'This action is not permitted.');
    }
  }
  throw error;
}

function mapExecutionScopeError(error: unknown): never {
  if (error instanceof CanonicalExecutionScopeError) {
    const invalidArgument = error.code === 'TEST_SESSION_ID_INVALID';
    const permissionDenied =
      error.code === 'TEST_SESSION_FORBIDDEN' ||
      error.code === 'TEST_ACTOR_DISABLED' ||
      error.code === 'TEST_ACTOR_REQUEST_FORBIDDEN' ||
      error.code === 'TEST_ACTOR_ACCOUNT_INACTIVE';
    throw new HttpsError(
      invalidArgument
        ? 'invalid-argument'
        : permissionDenied
          ? 'permission-denied'
          : 'failed-precondition',
      invalidArgument
        ? 'The requested Test Session ID is invalid.'
        : permissionDenied
          ? 'This Test Session context is not permitted.'
          : 'The Test Session context is unavailable.',
      { code: error.code }
    );
  }
  if (error instanceof TestSessionPolicyError) {
    throw new HttpsError('failed-precondition', 'The Test Session is not active.', {
      code: error.code,
      ...(error.status === undefined ? {} : { status: error.status }),
    });
  }
  throw error;
}

type CanonicalCallableRequest = CallableRequest<
  CallableCommandTransportInput<CommandKind> & {
    readonly exercisedCapability?: unknown;
    readonly administratorContext?: unknown;
  }
>;

const ADMINISTRATOR_STEP_UP_COMMANDS = new Set<CommandKind>([
  'change_account_role',
  'disable_account',
  'record_manual_wallet_funding',
  'pay_service_from_wallet_as_administrator',
  'record_provider_payment_event',
  'record_financial_correction',
  'record_audit_correction',
  'review_kaspi_payment',
  'save_kaspi_configuration',
  'set_kaspi_payment_enabled',
]);

function needsAdministratorStepUp(input: CallableCommandTransportInput<CommandKind>): boolean {
  if (ADMINISTRATOR_STEP_UP_COMMANDS.has(input.kind)) return true;
  if (
    input.kind === 'resolve_booking_cancellation' ||
    input.kind === 'resolve_course_enrollment_cancellation' ||
    input.kind === 'resolve_booking_change_request'
  ) {
    const amount = (input.intent as { refundAmount?: unknown } | null)?.refundAmount;
    return typeof amount === 'number' && amount > 0;
  }
  return false;
}

export function createExecuteCanonicalCommandHandler(
  firestore: Firestore,
  checkAdministratorSession: typeof requireCurrentAdministratorSession =
    requireCurrentAdministratorSession
) {
  const runtime = createCanonicalCommandRuntime(firestore, {
    guestActionTokenSecret: readGuestActionTokenSecret(),
  });
  const executionScopeStore = createFirestoreCanonicalExecutionScopeStore(firestore);

  async function execute(
    auth: NonNullable<CanonicalCallableRequest['auth']>,
    transportInput: ReturnType<typeof parseAuthenticatedCallableCommandTransportInput>,
    audit: { scope: 'LIVE' | 'TEST' | 'unresolved' },
    isAdministratorReplay: boolean
  ): Promise<CommandResult<CommandKind>> {
    const authUid = auth.uid;
    const progressContract = getCommandPolicy(transportInput.kind)?.participantProgressContract;
    // Old tabs silently submitted level assignments through progress updates.
    // Reject before any domain transaction; refreshing loads the canonical UX.
    if (
      progressContract !== undefined &&
      transportInput.participantProgressContract !== progressContract
    ) {
      throw new HttpsError(
        'failed-precondition',
        'Обновите страницу перед изменением уровня или навыков. Refresh this page before changing levels or skills.',
        { code: 'unavailable', retryable: false, clientUpdateRequired: true }
      );
    }
    const userSnap = await firestore.collection('users').doc(authUid).get();
    const userData = userSnap.data() as Record<string, unknown> | undefined;
    const profile = readCallableAccountProfile(userData);
    const account = parseAccount(userData);

    let accountContext;
    try {
      accountContext = resolveCallableAccountContext(
        profile,
        {
          authUid,
          commandKind: transportInput.kind,
          exercisedCapability: transportInput.exercisedCapability,
          administratorContext: transportInput.administratorContext,
        },
        account
      );
    } catch (error) {
      mapCallableContextError(error);
    }

    const lifecycle = userData?.lifecycle;
    if (
      lifecycle &&
      typeof lifecycle === 'object' &&
      'status' in lifecycle &&
      lifecycle.status === 'disabled'
    ) {
      throw new HttpsError('permission-denied', 'This action is not permitted.');
    }
    if (
      accountContext.source === 'admin_callable' &&
      (account?.accountId !== accountContext.accountId || account.lifecycle.status !== 'active')
    ) {
      throw new HttpsError('permission-denied', 'This action is not permitted.');
    }

    let executionScope: CanonicalExecutionScope;
    try {
      executionScope = await resolveCanonicalExecutionScope(executionScopeStore, {
        accountId: accountContext.accountId,
        accountLifecycleStatus: account?.lifecycle.status,
        isAdministrator: isAdministratorProfile(profile),
        requestedTestSessionId: transportInput.requestedTestSessionId,
      });
    } catch (error) {
      mapExecutionScopeError(error);
    }
    audit.scope = executionScope.dataScope === 'test' ? 'TEST' : 'LIVE';

    if (isAdministratorReplay && (executionScope.dataScope !== 'live' || accountContext.source !== 'admin_callable')) {
      throw new HttpsError('permission-denied', 'The administrative authority has changed.');
    }
    if (executionScope.dataScope === 'live' && accountContext.source === 'admin_callable') {
      requireAdministratorAccountSessionPolicy(userData, auth.token);
      await checkAdministratorSession(auth.token);
      if (needsAdministratorStepUp(transportInput)) {
        requireRecentAdministratorAuthentication(auth.token);
      }
    }

    if (accountContext.instructorId) {
      const { accountId, instructorId } = accountContext;
      if (!identityDocumentMatchesReadScope(executionScope, userData)) {
        throw new HttpsError('permission-denied', 'This action is not permitted.');
      }
      const catalog = (await firestore.doc(instructorCatalogPath(instructorId)).get()).data();
      if (
        !hasInstructorAccountLink(catalog, instructorId, accountId) ||
        !identityDocumentMatchesReadScope(executionScope, catalog)
      ) {
        throw new HttpsError('permission-denied', 'This action is not permitted.');
      }
    }

    const envelope = buildCommandEnvelopeFromCallable(accountContext, transportInput);
    const requiresCurrentAdministrator =
      accountContext.source === 'admin_callable' ||
      transportInput.requestedTestSessionId !== undefined;
    const commands = runtime.createCommands(
      executionScope,
      requiresCurrentAdministrator ? accountContext.accountId : undefined,
      executionScope.dataScope === 'live' && accountContext.source === 'admin_callable'
        ? auth.token
        : undefined
    );

    try {
      const result = await commands.execute(envelope, 'authenticated_callable');
      if (result.status === 'error') {
        throw mapCommandErrorTransportToHttpsError(result.error);
      }
      return result;
    } catch (error) {
      if (!(error instanceof HttpsError) && !(error instanceof CanonicalCommandError)) {
        // Exception messages and arbitrary error metadata can contain document values.
        // Keep only known error types, gRPC codes, and source locations for diagnosis.
        const errorName = error instanceof Error ? error.name : undefined;
        const code = (error as { code?: unknown } | null)?.code;
        const sourceLocations =
          error instanceof Error
            ? (error.stack ?? '')
                .split('\n')
                .slice(1)
                .flatMap(
                  (line) =>
                    line
                      .replaceAll('\\', '/')
                      .match(/(?:lib|src)\/[A-Za-z0-9_./-]+\.(?:[cm]?js|ts):\d+:\d+/g) ?? []
                )
                .slice(0, 8)
            : [];
        logError('Unexpected canonical command exception', {
          correlationId: envelope.context.correlationId,
          commandKind: envelope.kind,
          errorType: ['Error', 'TypeError', 'RangeError', 'ZodError'].includes(errorName ?? '')
            ? errorName
            : 'UnknownError',
          ...(typeof code === 'number' && Number.isInteger(code) && code >= 0 && code <= 16
            ? { grpcCode: code }
            : {}),
          sourceLocations,
        });
      }
      rethrowCanonicalCommandErrorAsHttps(error, envelope.context.correlationId);
    }
  }

  return async (request: CanonicalCallableRequest): Promise<CommandResult<CommandKind>> => {
    const auth = request.auth;
    if (!auth?.uid) throw new HttpsError('unauthenticated', 'Authentication is required.');
    const expectedUid = (request.data as { expectedAdministratorUid?: unknown } | null)?.expectedAdministratorUid;
    if (expectedUid !== undefined && expectedUid !== auth.uid) {
      throw new HttpsError('permission-denied', 'The authenticated account has changed.');
    }

    const transportInput = parseAuthenticatedCallableCommandTransportInput(request);
    const audit: { scope: 'LIVE' | 'TEST' | 'unresolved' } = { scope: 'unresolved' };
    try {
      return await execute(auth, transportInput, audit, expectedUid !== undefined);
    } catch (error) {
      const resultCode = securityDenialCode(error);
      if (resultCode) {
        logSecurityCommandEvent({
          actor: { kind: 'account', id: auth.uid },
          commandKind: transportInput.kind,
          resultCode,
          scope: audit.scope,
          correlationId: transportInput.correlationId,
        });
      }
      throw error;
    }
  };
}
