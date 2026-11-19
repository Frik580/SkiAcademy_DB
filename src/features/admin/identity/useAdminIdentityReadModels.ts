import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  AccountId,
  AdminAccountDetailReadModel,
  AdminAccountListItem,
  AdminEligibleParticipantItem,
  AdminInstructorDetailReadModel,
  AdminInstructorListItem,
  AdminParticipantDetailReadModel,
  AdminParticipantListItem,
  InstructorId,
  ParticipantId,
} from '@ski-academy/shared-domain';
import { queryAdminIdentityReadModels } from '../../../lib/canonical/canonicalReadModelClient';
import { toFunctionsClientError } from '../../../lib/functions/functionsClient';
import type { AdminIdentityDirectory } from './identityContracts';
import { useAdminPeopleRevisionRefresh } from './useAdminPeopleRevisionRefresh';

export type AdminIdentityReadError = 'permission-denied' | 'read-failed';

interface ListState<Item> {
  readonly filterKey?: string;
  readonly items: readonly Item[];
  readonly loading: boolean;
  readonly loadingMore: boolean;
  readonly hasMore: boolean;
  readonly cursor?: string;
  readonly error?: AdminIdentityReadError;
}

function classify(error: unknown): AdminIdentityReadError {
  return toFunctionsClientError(error).code === 'functions/permission-denied'
    ? 'permission-denied'
    : 'read-failed';
}

const EMPTY_LIST: ListState<never> = {
  items: [],
  loading: true,
  loadingMore: false,
  hasMore: false,
};

export function useAdminIdentityReadModels(input: {
  readonly enabled: boolean;
  readonly realtime?: boolean;
  readonly directory: AdminIdentityDirectory;
  readonly search: string;
  readonly pageSize?: number;
  readonly role?: 'admin' | 'user';
  readonly selectedAccountId?: AccountId;
  readonly selectedParticipantId?: ParticipantId;
  readonly selectedInstructorId?: InstructorId;
}) {
  const listGeneration = useRef(0);
  const detailGeneration = useRef(0);
  const [accounts, setAccounts] = useState<ListState<AdminAccountListItem>>(EMPTY_LIST);
  const [participants, setParticipants] = useState<ListState<AdminParticipantListItem>>(EMPTY_LIST);
  const [instructors, setInstructors] = useState<ListState<AdminInstructorListItem>>(EMPTY_LIST);
  const [accountDetail, setAccountDetail] = useState<AdminAccountDetailReadModel | undefined>();
  const [participantDetail, setParticipantDetail] = useState<
    AdminParticipantDetailReadModel | undefined
  >();
  const [instructorDetail, setInstructorDetail] = useState<
    AdminInstructorDetailReadModel | undefined
  >();
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<AdminIdentityReadError | undefined>();
  const [requestedDetailKey, setRequestedDetailKey] = useState<string>();
  const search = input.search.trim();
  const filterKey = JSON.stringify([search, input.pageSize, input.role]);
  const selectedId =
    input.directory === 'accounts'
      ? input.selectedAccountId
      : input.directory === 'participants'
        ? input.selectedParticipantId
        : input.selectedInstructorId;
  const detailKey = selectedId ? JSON.stringify([input.directory, selectedId]) : undefined;

  const loadList = useCallback(
    async (cursor?: string, append = false) => {
      if (!input.enabled) return;
      const generation = ++listGeneration.current;
      if (input.directory === 'accounts') {
        setAccounts((previous) => ({
          ...(previous.filterKey === filterKey ? previous : EMPTY_LIST),
          filterKey,
          loading: !append,
          loadingMore: append,
          error: undefined,
        }));
      } else if (input.directory === 'participants') {
        setParticipants((previous) => ({
          ...(previous.filterKey === filterKey ? previous : EMPTY_LIST),
          filterKey,
          loading: !append,
          loadingMore: append,
          error: undefined,
        }));
      } else {
        setInstructors((previous) => ({
          ...(previous.filterKey === filterKey ? previous : EMPTY_LIST),
          filterKey,
          loading: !append,
          loadingMore: append,
          error: undefined,
        }));
      }
      try {
        const scope =
          input.directory === 'accounts'
            ? 'admin_account_list'
            : input.directory === 'participants'
              ? 'admin_participant_list'
              : 'admin_instructor_list';
        const result = await queryAdminIdentityReadModels({
          scope,
          ...(search ? { search } : {}),
          ...(input.pageSize ? { pageSize: input.pageSize } : {}),
          ...(cursor ? { cursor } : {}),
          ...(scope === 'admin_account_list' && input.role ? { role: input.role } : {}),
        });
        if (generation !== listGeneration.current) return;
        if (result.scope !== scope) throw new Error('Unexpected identity directory response.');
        if (result.scope === 'admin_account_list') {
          setAccounts((previous) => ({
            filterKey,
            items: append ? [...previous.items, ...result.items] : result.items,
            loading: false,
            loadingMore: false,
            hasMore: result.hasMore,
            ...(result.nextCursor ? { cursor: result.nextCursor } : {}),
          }));
        } else if (result.scope === 'admin_participant_list') {
          setParticipants((previous) => ({
            filterKey,
            items: append ? [...previous.items, ...result.items] : result.items,
            loading: false,
            loadingMore: false,
            hasMore: result.hasMore,
            ...(result.nextCursor ? { cursor: result.nextCursor } : {}),
          }));
        } else if (result.scope === 'admin_instructor_list') {
          setInstructors((previous) => ({
            filterKey,
            items: append ? [...previous.items, ...result.items] : result.items,
            loading: false,
            loadingMore: false,
            hasMore: result.hasMore,
            ...(result.nextCursor ? { cursor: result.nextCursor } : {}),
          }));
        }
      } catch (error) {
        if (generation !== listGeneration.current) return;
        const errorCode = classify(error);
        const denied = errorCode === 'permission-denied';
        if (input.directory === 'accounts') {
          setAccounts((previous) => ({
            ...(denied ? EMPTY_LIST : previous),
            filterKey,
            loading: false,
            loadingMore: false,
            error: errorCode,
          }));
        } else if (input.directory === 'participants') {
          setParticipants((previous) => ({
            ...(denied ? EMPTY_LIST : previous),
            filterKey,
            loading: false,
            loadingMore: false,
            error: errorCode,
          }));
        } else {
          setInstructors((previous) => ({
            ...(denied ? EMPTY_LIST : previous),
            filterKey,
            loading: false,
            loadingMore: false,
            error: errorCode,
          }));
        }
      }
    },
    [filterKey, input.directory, input.enabled, input.pageSize, input.role, search]
  );

  const loadDetail = useCallback(async () => {
    if (!input.enabled) return;
    const generation = ++detailGeneration.current;
    setRequestedDetailKey(detailKey);
    setDetailLoading(true);
    setDetailError(undefined);
    try {
      if (input.directory === 'accounts' && input.selectedAccountId) {
        const result = await queryAdminIdentityReadModels({
          scope: 'admin_account_detail',
          accountId: input.selectedAccountId,
        });
        if (generation !== detailGeneration.current) return;
        setAccountDetail(result.scope === 'admin_account_detail' ? result.item : undefined);
      } else if (input.directory === 'participants' && input.selectedParticipantId) {
        const result = await queryAdminIdentityReadModels({
          scope: 'admin_participant_detail',
          participantId: input.selectedParticipantId,
        });
        if (generation !== detailGeneration.current) return;
        setParticipantDetail(result.scope === 'admin_participant_detail' ? result.item : undefined);
      } else if (input.directory === 'instructors' && input.selectedInstructorId) {
        const result = await queryAdminIdentityReadModels({
          scope: 'admin_instructor_detail',
          instructorId: input.selectedInstructorId,
        });
        if (generation !== detailGeneration.current) return;
        setInstructorDetail(result.scope === 'admin_instructor_detail' ? result.item : undefined);
      } else {
        setAccountDetail(undefined);
        setParticipantDetail(undefined);
        setInstructorDetail(undefined);
      }
    } catch (error) {
      if (generation !== detailGeneration.current) return;
      const errorCode = classify(error);
      setDetailError(errorCode);
      if (errorCode === 'permission-denied') {
        setAccountDetail(undefined);
        setParticipantDetail(undefined);
        setInstructorDetail(undefined);
      }
    } finally {
      if (generation === detailGeneration.current) setDetailLoading(false);
    }
  }, [
    detailKey,
    input.directory,
    input.enabled,
    input.selectedAccountId,
    input.selectedInstructorId,
    input.selectedParticipantId,
  ]);

  useEffect(() => {
    void loadList();
    return () => {
      listGeneration.current += 1;
    };
  }, [loadList]);

  useEffect(() => {
    void loadDetail();
    return () => {
      detailGeneration.current += 1;
    };
  }, [loadDetail]);

  useAdminPeopleRevisionRefresh(
    () => {
      void Promise.all([loadList(), loadDetail()]);
    },
    Boolean(input.enabled && input.realtime)
  );

  const loadMore = useCallback(() => {
    const current =
      input.directory === 'accounts'
        ? accounts
        : input.directory === 'participants'
          ? participants
          : instructors;
    if (
      current.filterKey === filterKey &&
      !current.loading &&
      !current.loadingMore &&
      current.hasMore &&
      current.cursor
    )
      void loadList(current.cursor, true);
  }, [accounts, filterKey, input.directory, instructors, loadList, participants]);

  return {
    accounts: input.enabled && accounts.filterKey === filterKey ? accounts : EMPTY_LIST,
    participants: input.enabled && participants.filterKey === filterKey ? participants : EMPTY_LIST,
    instructors: input.enabled && instructors.filterKey === filterKey ? instructors : EMPTY_LIST,
    accountDetail:
      input.enabled && input.selectedAccountId === accountDetail?.accountId
        ? accountDetail
        : undefined,
    participantDetail:
      input.enabled && input.selectedParticipantId === participantDetail?.participantId
        ? participantDetail
        : undefined,
    instructorDetail:
      input.enabled && input.selectedInstructorId === instructorDetail?.instructorId
        ? instructorDetail
        : undefined,
    detailLoading: Boolean(
      input.enabled && detailKey && (requestedDetailKey !== detailKey || detailLoading)
    ),
    detailError: requestedDetailKey === detailKey ? detailError : undefined,
    loadMore,
    refresh: async () => {
      await Promise.all([loadList(), loadDetail()]);
    },
  };
}

export function useAdminParticipantDetail(
  participantId: ParticipantId | undefined,
  options?: { readonly realtime?: boolean }
) {
  const generation = useRef(0);
  const [item, setItem] = useState<AdminParticipantDetailReadModel | undefined>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<AdminIdentityReadError | undefined>();
  const [requestedId, setRequestedId] = useState<ParticipantId>();

  const load = useCallback(async () => {
    if (!participantId) {
      setItem(undefined);
      setError(undefined);
      setLoading(false);
      return;
    }
    const current = ++generation.current;
    setRequestedId(participantId);
    setLoading(true);
    setError(undefined);
    try {
      const result = await queryAdminIdentityReadModels({
        scope: 'admin_participant_detail',
        participantId,
      });
      if (current !== generation.current) return;
      setItem(result.scope === 'admin_participant_detail' ? result.item : undefined);
    } catch (caught) {
      if (current !== generation.current) return;
      const error = classify(caught);
      setError(error);
      if (error === 'permission-denied') setItem(undefined);
    } finally {
      if (current === generation.current) setLoading(false);
    }
  }, [participantId]);

  useEffect(() => {
    void load();
    return () => {
      generation.current += 1;
    };
  }, [load]);

  useAdminPeopleRevisionRefresh(
    () => {
      void load();
    },
    Boolean(participantId) && options?.realtime === true
  );

  return {
    item: item?.participantId === participantId ? item : undefined,
    loading: Boolean(participantId && (participantId !== requestedId || loading)),
    error: participantId === requestedId ? error : undefined,
    refresh: load,
  };
}

export function useAdminEligibleParticipants(accountId: AccountId | undefined) {
  const generation = useRef(0);
  const [state, setState] = useState<{
    accountId?: AccountId;
    items: readonly AdminEligibleParticipantItem[];
    loading: boolean;
    error?: AdminIdentityReadError;
  }>({ items: [], loading: false });

  const load = useCallback(async () => {
    if (!accountId) return;
    const current = ++generation.current;
    setState((previous) => ({
      accountId,
      items: previous.accountId === accountId ? previous.items : [],
      loading: true,
    }));
    try {
      const result = await queryAdminIdentityReadModels({
        scope: 'admin_eligible_participants',
        accountId,
      });
      if (current !== generation.current) return;
      if (result.scope !== 'admin_eligible_participants') {
        throw new Error('Unexpected eligible participant response.');
      }
      setState({ accountId, items: result.items, loading: false });
    } catch (caught) {
      if (current !== generation.current) return;
      const error = classify(caught);
      setState((previous) => ({
        ...previous,
        items: error === 'permission-denied' ? [] : previous.items,
        error,
        loading: false,
      }));
    }
  }, [accountId]);

  useEffect(() => {
    void load();
    return () => {
      generation.current += 1;
    };
  }, [load]);

  const visible =
    accountId && state.accountId === accountId
      ? state
      : { items: [], loading: Boolean(accountId), error: undefined };
  return { ...visible, refresh: load };
}
