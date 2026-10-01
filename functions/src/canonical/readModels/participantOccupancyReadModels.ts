import type { Firestore } from 'firebase-admin/firestore';
import {
  ParticipantOccupancyReadModelSchema,
  QueryParticipantOccupancyReadModelsInput,
  QueryParticipantOccupancyReadModelsResultSchema,
  LIVE_CANONICAL_READ_SCOPE,
  type AccountId,
  type QueryParticipantOccupancyReadModelsResult,
  type CanonicalReadScope,
} from '@ski-academy/shared-domain';
import { loadLessonBookingReadAuthorizationContext } from './lessonBookingReadModels';
import {
  loadParticipantOccupancyItems,
  participantOccupancyWindow,
} from './participantOccupancyReadSupport';
import {
  createReadModelRequestContext,
  type ReadModelRequestContext,
} from './readModelRequestContext';

function assertAccountMayReadParticipantOccupancy(
  authContext: Awaited<ReturnType<typeof loadLessonBookingReadAuthorizationContext>>,
  accountId: AccountId,
  participantIds: readonly string[]
): void {
  for (const participantId of participantIds) {
    const management = authContext.participantManagement.find(
      (record) => record.participantId === participantId
    );
    const participant = authContext.participants.find(
      (record) => record.participantId === participantId
    );
    if (!management || !participant || management.accountId !== accountId) {
      throw Object.assign(new Error('This action is not permitted.'), { code: 'permission-denied' });
    }
    if (management.status !== 'active' || participant.management.kind !== 'managed') {
      throw Object.assign(new Error('This action is not permitted.'), { code: 'permission-denied' });
    }
  }
}

export async function queryParticipantOccupancyReadModels(
  firestore: Firestore,
  accountId: AccountId,
  input: QueryParticipantOccupancyReadModelsInput,
  options: {
    readonly readContext?: ReadModelRequestContext;
    readonly readScope?: CanonicalReadScope;
  } = {}
): Promise<QueryParticipantOccupancyReadModelsResult> {
  const readScope = options.readScope ?? options.readContext?.readScope ?? LIVE_CANONICAL_READ_SCOPE;
  const readContext =
    options.readContext ?? createReadModelRequestContext(firestore, { readScope });
  const authContext = await loadLessonBookingReadAuthorizationContext(
    firestore,
    accountId,
    readContext
  );
  assertAccountMayReadParticipantOccupancy(authContext, accountId, input.participantIds);

  const windowDays = input.windowDays ?? 1;
  const window = participantOccupancyWindow(input.localDate, input.timeZone, windowDays);

  const slices = await Promise.all(
    input.participantIds.map(async (participantId) => {
      const loaded = await loadParticipantOccupancyItems(firestore, {
        participantId,
        window,
        readScope,
      });
      return {
        participantId,
        occupancy: loaded.occupancy,
        truncated: loaded.truncated,
      };
    })
  );

  const item = ParticipantOccupancyReadModelSchema.parse({
    localDate: input.localDate,
    timeZone: input.timeZone,
    window,
    items: slices,
  });

  return QueryParticipantOccupancyReadModelsResultSchema.parse({
    scope: 'account_participant_day',
    item,
  });
}
