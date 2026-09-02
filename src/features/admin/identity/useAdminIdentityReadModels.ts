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

export type AdminIdentityReadError = 'permission-denied' | 'read-failed';

interface ListState<Item> {
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

const EMPTY_LIST = {
  items: [],
  loading: true,
  loadingMore: false,
  hasMore: false,
} as const;

export function useAdminIdentityReadModels(input: {
  readonly enabled: boolean;
  readonly directory: AdminIdentityDirectory;
  readonly search: string;
  readonly pageSize?: number;
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

  const loadList = useCallback(
    async (cursor?: string, append = false) => {
      if (!input.enabled) return;
      const generation = ++listGeneration.current;
      if (input.directory === 'accounts') {
        setAccounts((previous) => ({
          ...previous,
          loading: !append,
          loadingMore: append,
          error: undefined,
        }));
      } else if (input.directory === 'participants') {
        setParticipants((previous) => ({
          ...previous,
          loading: !append,
          loadingMore: append,
          error: undefined,
        }));
      } else {
        setInstructors((previous) => ({
          ...previous,
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
          ...(input.search.trim() ? { search: input.search.trim() } : {}),
          ...(input.pageSize ? { pageSize: input.pageSize } : {}),
          ...(cursor ? { cursor } : {}),
        });
        if (generation !== listGeneration.current) return;
        if (result.scope !== scope) return;
        if (result.scope === 'admin_account_list') {
          setAccounts((previous) => ({
            items: append ? [...previous.items, ...result.items] : result.items,
            loading: false,
            loadingMore: false,
            hasMore: result.hasMore,
            ...(result.nextCursor ? { cursor: result.nextCursor } : {}),
          }));
        } else if (result.scope === 'admin_participant_list') {
          setParticipants((previous) => ({
            items: append ? [...previous.items, ...result.items] : result.items,
            loading: false,
            loadingMore: false,
            hasMore: result.hasMore,
            ...(result.nextCursor ? { cursor: result.nextCursor } : {}),
          }));
        } else if (result.scope === 'admin_instructor_list') {
          setInstructors((previous) => ({
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
        if (input.directory === 'accounts') {
          setAccounts((previous) => ({
            ...previous,
            loading: false,
            loadingMore: false,
            error: errorCode,
          }));
        } else if (input.directory === 'participants') {
          setParticipants((previous) => ({
            ...previous,
            loading: false,
            loadingMore: false,
            error: errorCode,
          }));
        } else {
          setInstructors((previous) => ({
            ...previous,
            loading: false,
            loadingMore: false,
            error: errorCode,
          }));
        }
      }
    },
    [input.directory, input.enabled, input.pageSize, input.search]
  );

  const loadDetail = useCallback(async () => {
    if (!input.enabled) return;
    const generation = ++detailGeneration.current;
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
      setDetailError(classify(error));
    } finally {
      if (generation === detailGeneration.current) setDetailLoading(false);
    }
  }, [
    input.directory,
    input.enabled,
    input.selectedAccountId,
    input.selectedInstructorId,
    input.selectedParticipantId,
  ]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  const loadMore = useCallback(() => {
    const current =
      input.directory === 'accounts'
        ? accounts
        : input.directory === 'participants'
          ? participants
          : instructors;
    if (current.hasMore && current.cursor) void loadList(current.cursor, true);
  }, [accounts, input.directory, instructors, loadList, participants]);

  return {
    accounts,
    participants,
    instructors,
    accountDetail,
    participantDetail,
    instructorDetail,
    detailLoading,
    detailError,
    loadMore,
    refresh: async () => {
      await Promise.all([loadList(), loadDetail()]);
    },
  };
}

export function useAdminEligibleParticipants(accountId: AccountId | undefined) {
  const [items, setItems] = useState<readonly AdminEligibleParticipantItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<AdminIdentityReadError | undefined>();

  const load = useCallback(async () => {
    if (!accountId) {
      setItems([]);
      return;
    }
    setLoading(true);
    setError(undefined);
    try {
      const result = await queryAdminIdentityReadModels({
        scope: 'admin_eligible_participants',
        accountId,
      });
      setItems(result.scope === 'admin_eligible_participants' ? result.items : []);
    } catch (caught) {
      setError(classify(caught));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [accountId]);

  useEffect(() => {
    void load();
  }, [load]);

  return { items, loading, error, refresh: load };
}
