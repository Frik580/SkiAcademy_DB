import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AccountIdSchema,
  ParticipantIdSchema,
  type CommandResult,
} from '@ski-academy/shared-domain';

const queryMock = vi.fn();
const registerListenerMock = vi.fn();
const unregisterMock = vi.fn();
const registerFromCommandMock = vi.fn();

vi.mock('../../src/lib/canonical/canonicalReadModelClient', () => ({
  queryAdminIdentityReadModels: (...args: unknown[]) => queryMock(...args),
}));

vi.mock('../../src/features/admin/identity/subscribeAdminPeopleRevision', () => ({
  subscribeAdminPeopleRevision: vi.fn(),
}));

vi.mock('../../src/features/admin/identity/adminPeopleRevisionCoordinator', () => ({
  registerAdminPeopleRevisionListener: (...args: unknown[]) => registerListenerMock(...args),
  registerAdminPeopleRevisionFromCommand: (...args: unknown[]) => registerFromCommandMock(...args),
  resetAdminPeopleRevisionCoordinatorForTests: vi.fn(),
}));

import { applyAdminPeopleCommandResult } from '../../src/features/admin/identity/adminPeopleLocalSync';
import {
  useAdminIdentityReadModels,
  useAdminParticipantDetail,
} from '../../src/features/admin/identity/useAdminIdentityReadModels';

const accountId = AccountIdSchema.parse('account_admin_people_realtime_01');
const participantId = ParticipantIdSchema.parse('participant_admin_people_realtime_01');

function mockIdentityQueries(): void {
  queryMock.mockImplementation(async (input: { readonly scope: string }) => {
    if (input.scope === 'admin_account_list') {
      return { scope: 'admin_account_list', items: [{ accountId }], hasMore: false };
    }
    if (input.scope === 'admin_account_detail') {
      return { scope: 'admin_account_detail', item: { accountId, displayName: 'Ivan' } };
    }
    if (input.scope === 'admin_instructor_list') {
      return { scope: 'admin_instructor_list', items: [], hasMore: false };
    }
    if (input.scope === 'admin_participant_detail') {
      return {
        scope: 'admin_participant_detail',
        item: { participantId, displayName: 'Ivan' },
      };
    }
    return { scope: input.scope, items: [], hasMore: false };
  });
}

describe('useAdminIdentityReadModels realtime invalidation', () => {
  beforeEach(() => {
    queryMock.mockReset();
    registerListenerMock.mockReset();
    unregisterMock.mockReset();
    registerFromCommandMock.mockReset();
    registerListenerMock.mockImplementation(() => unregisterMock);
    mockIdentityQueries();
  });

  it('does not subscribe until a People consumer is mounted with realtime', async () => {
    renderHook(() =>
      useAdminIdentityReadModels({
        enabled: true,
        directory: 'accounts',
        search: '',
      })
    );
    await waitFor(() => expect(queryMock).toHaveBeenCalledTimes(1));
    expect(registerListenerMock).not.toHaveBeenCalled();

    renderHook(() =>
      useAdminIdentityReadModels({
        enabled: false,
        realtime: true,
        directory: 'accounts',
        search: '',
      })
    );
    expect(registerListenerMock).not.toHaveBeenCalled();
  });

  it('does not refresh on the initial revision snapshot, then refreshes the mounted list once', async () => {
    let emitInvalidation: (() => void) | undefined;
    registerListenerMock.mockImplementation((listener: () => void) => {
      emitInvalidation = listener;
      return unregisterMock;
    });

    renderHook(() =>
      useAdminIdentityReadModels({
        enabled: true,
        realtime: true,
        directory: 'accounts',
        search: '',
      })
    );
    await waitFor(() => expect(queryMock).toHaveBeenCalledTimes(1));
    expect(queryMock.mock.calls[0]?.[0]).toMatchObject({
      scope: 'admin_account_list',
    });

    act(() => {
      emitInvalidation?.();
    });
    await waitFor(() => expect(queryMock).toHaveBeenCalledTimes(2));
    expect(queryMock.mock.calls[1]?.[0]).toMatchObject({
      scope: 'admin_account_list',
    });
  });

  it('refreshes mounted account list and detail scopes once each', async () => {
    let emitInvalidation: (() => void) | undefined;
    registerListenerMock.mockImplementation((listener: () => void) => {
      emitInvalidation = listener;
      return unregisterMock;
    });

    renderHook(() =>
      useAdminIdentityReadModels({
        enabled: true,
        realtime: true,
        directory: 'accounts',
        search: '',
        selectedAccountId: accountId,
      })
    );
    await waitFor(() => expect(queryMock).toHaveBeenCalledTimes(2));
    expect(queryMock.mock.calls.map((call) => call[0]?.scope).sort()).toEqual([
      'admin_account_detail',
      'admin_account_list',
    ]);

    act(() => {
      emitInvalidation?.();
    });
    await waitFor(() => expect(queryMock).toHaveBeenCalledTimes(4));
    expect(queryMock.mock.calls.slice(2).map((call) => call[0]?.scope).sort()).toEqual([
      'admin_account_detail',
      'admin_account_list',
    ]);
  });

  it('refreshes a distinct mounted participant detail once without repeating the same scope', async () => {
    let emitList: (() => void) | undefined;
    let emitDetail: (() => void) | undefined;
    registerListenerMock.mockImplementation((listener: () => void) => {
      if (!emitList) emitList = listener;
      else emitDetail = listener;
      return unregisterMock;
    });

    renderHook(() =>
      useAdminIdentityReadModels({
        enabled: true,
        realtime: true,
        directory: 'accounts',
        search: '',
      })
    );
    renderHook(() => useAdminParticipantDetail(participantId, { realtime: true }));
    await waitFor(() => expect(queryMock).toHaveBeenCalledTimes(2));
    expect(registerListenerMock).toHaveBeenCalledTimes(2);

    act(() => {
      emitList?.();
      emitDetail?.();
    });
    await waitFor(() => expect(queryMock).toHaveBeenCalledTimes(4));
    expect(
      queryMock.mock.calls.filter((call) => call[0]?.scope === 'admin_account_list')
    ).toHaveLength(2);
    expect(
      queryMock.mock.calls.filter((call) => call[0]?.scope === 'admin_participant_detail')
    ).toHaveLength(2);
  });

  it('unsubscribes People consumers on unmount', async () => {
    const list = renderHook(() =>
      useAdminIdentityReadModels({
        enabled: true,
        realtime: true,
        directory: 'instructors',
        search: '',
      })
    );
    const detail = renderHook(() => useAdminParticipantDetail(participantId, { realtime: true }));
    await waitFor(() => expect(registerListenerMock).toHaveBeenCalledTimes(2));
    list.unmount();
    detail.unmount();
    expect(unregisterMock).toHaveBeenCalledTimes(2);
  });

  it('registers revision from command result for same-client suppression', () => {
    applyAdminPeopleCommandResult({
      status: 'success',
      kind: 'update_participant_profile',
      correlationId: 'correlation_admin_people_local_01',
      payload: { adminPeopleRevision: 31 },
    } as CommandResult);
    expect(registerFromCommandMock).toHaveBeenCalledWith(31);
  });

  it('does not register a revision when the command fails', () => {
    applyAdminPeopleCommandResult({
      status: 'error',
      kind: 'update_participant_profile',
      correlationId: 'correlation_admin_people_local_fail_01',
      error: {
        code: 'validation',
        message: 'The request is invalid.',
        retryable: false,
        correlationId: 'correlation_admin_people_local_fail_01',
      },
    });
    expect(registerFromCommandMock).not.toHaveBeenCalled();
  });
});
