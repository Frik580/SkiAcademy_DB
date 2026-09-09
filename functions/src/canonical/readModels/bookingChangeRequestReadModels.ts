import {
  evaluateAdminBookingChangeRequestAuthorizedActions,
  evaluateBookingChangeRequestAuthorizedActions,
  type AccountId,
  type AdminBookingChangeRequestDetailReadModel,
  type AdminBookingChangeRequestInboxItem,
  type BookingChangeRequest,
  type BookingChangeRequestReadModel,
  type InstructorId,
  type QueryBookingChangeRequestReadModelsInput,
  type QueryBookingChangeRequestReadModelsResult,
  type ReadModelAdministratorActor,
  timestampFromDate,
} from '@ski-academy/shared-domain';
import type { Firestore } from 'firebase-admin/firestore';
import {
  isOpenBookingChangeRequest,
  loadOpenChangeRequestsForBooking,
  parseBookingChangeRequest,
} from '../bookings/bookingChangeRequestStore';
import { parseBooking, parseInstructorCatalog } from '../bookings/bookingStore';
import { parseParticipant } from '../participantAccess/participantAccessStore';
import {
  canAccountViewLessonBookingService,
  loadAuthorizedAccountBookings,
  loadInstructorHotBookings,
  loadLessonBookingReadAuthorizationContext,
} from './lessonBookingReadModels';
import {
  createReadModelRequestContext,
  type ReadModelRequestContext,
} from './readModelRequestContext';

const ADMIN_OPEN_CHANGE_REQUEST_LIMIT = 100;

export class BookingChangeRequestAdminReadForbiddenError extends Error {
  constructor() {
    super('Administrator actor is required.');
    this.name = 'BookingChangeRequestAdminReadForbiddenError';
  }
}

function isOpenChangeRequest(changeRequest: BookingChangeRequest): boolean {
  return isOpenBookingChangeRequest(changeRequest);
}

function collaborationItem(
  changeRequest: BookingChangeRequest,
  authorizedActions: BookingChangeRequestReadModel['authorizedActions']
): BookingChangeRequestReadModel {
  return {
    requestId: changeRequest.requestId,
    revision: changeRequest.revision,
    bookingId: changeRequest.bookingId,
    requestType: changeRequest.requestType,
    reason: changeRequest.reason,
    lifecycle: changeRequest.lifecycle,
    authorizedActions,
    updatedAt: changeRequest.updatedAt,
  };
}

async function buildAdminInboxItem(
  firestore: Firestore,
  actor: ReadModelAdministratorActor,
  changeRequest: BookingChangeRequest,
  readContext: ReadModelRequestContext
): Promise<AdminBookingChangeRequestInboxItem | undefined> {
  if (!isOpenChangeRequest(changeRequest)) {
    return undefined;
  }

  const bookingSnap = await readContext.booking(changeRequest.bookingId);
  const booking = parseBooking(bookingSnap.data() as Record<string, unknown> | undefined);
  if (!booking || booking.bookingId !== changeRequest.bookingId) {
    return undefined;
  }

  const instructorSnap = await readContext.instructor(booking.occurrence.instructorId);
  const instructorCatalog = parseInstructorCatalog(
    booking.occurrence.instructorId,
    instructorSnap.data() as Record<string, unknown> | undefined
  );
  const instructorDisplayName = instructorCatalog?.name ?? booking.occurrence.instructorId;

  const participantSnaps = await Promise.all(
    booking.party.participantIds.map((participantId) => readContext.participant(participantId))
  );
  const participants = booking.party.participantIds.map((participantId, index) => {
    const participant = parseParticipant(
      participantSnaps[index]?.data() as Record<string, unknown> | undefined
    );
    return {
      participantId,
      displayName:
        participant?.participantId === participantId
          ? participant.displayName
          : participantId,
    };
  });
  if (participants.length === 0) {
    return undefined;
  }

  return {
    sourceRef: {
      sourceKind: 'booking_change_request',
      bookingChangeRequestId: changeRequest.requestId,
    },
    requestId: changeRequest.requestId,
    revision: changeRequest.revision,
    bookingId: changeRequest.bookingId,
    bookingRevision: booking.revision,
    requestType: changeRequest.requestType,
    reason: changeRequest.reason,
    lifecycle: changeRequest.lifecycle,
    instructor: {
      instructorId: booking.occurrence.instructorId,
      displayName: instructorDisplayName,
    },
    participants,
    occurrence: {
      startsAt: booking.occurrence.interval.startsAt,
      endsAt: booking.occurrence.interval.endsAt,
      timeZone: booking.occurrence.timeZone,
    },
    authorizedActions: evaluateAdminBookingChangeRequestAuthorizedActions({
      actor,
      changeRequest,
    }),
    createdAt: changeRequest.createdAt,
    updatedAt: changeRequest.updatedAt,
  };
}

function requireAdministratorActor(
  actor: ReadModelAdministratorActor | undefined
): ReadModelAdministratorActor {
  if (!actor || actor.kind !== 'administrator') {
    throw new BookingChangeRequestAdminReadForbiddenError();
  }
  return actor;
}

type BookingChangeRequestReadQueryOptions = {
  readonly accountId: AccountId;
  readonly instructorId?: InstructorId;
  readonly administratorActor?: ReadModelAdministratorActor;
  readonly now?: Date;
  readonly readContext?: ReadModelRequestContext;
};

export async function queryBookingChangeRequestReadModels(
  firestore: Firestore,
  input: Extract<
    QueryBookingChangeRequestReadModelsInput,
    { scope: 'account_open' | 'instructor_open' }
  >,
  options: BookingChangeRequestReadQueryOptions
): Promise<
  Extract<QueryBookingChangeRequestReadModelsResult, { scope: 'account_open' | 'instructor_open' }>
>;
export async function queryBookingChangeRequestReadModels(
  firestore: Firestore,
  input: Extract<QueryBookingChangeRequestReadModelsInput, { scope: 'admin_open' }>,
  options: BookingChangeRequestReadQueryOptions
): Promise<Extract<QueryBookingChangeRequestReadModelsResult, { scope: 'admin_open' }>>;
export async function queryBookingChangeRequestReadModels(
  firestore: Firestore,
  input: Extract<QueryBookingChangeRequestReadModelsInput, { scope: 'admin_detail' }>,
  options: BookingChangeRequestReadQueryOptions
): Promise<Extract<QueryBookingChangeRequestReadModelsResult, { scope: 'admin_detail' }>>;
export async function queryBookingChangeRequestReadModels(
  firestore: Firestore,
  input: QueryBookingChangeRequestReadModelsInput,
  options: BookingChangeRequestReadQueryOptions
): Promise<QueryBookingChangeRequestReadModelsResult>;
export async function queryBookingChangeRequestReadModels(
  firestore: Firestore,
  input: QueryBookingChangeRequestReadModelsInput,
  options: BookingChangeRequestReadQueryOptions
): Promise<QueryBookingChangeRequestReadModelsResult> {
  const readContext = options.readContext ?? createReadModelRequestContext(firestore);
  const now = timestampFromDate(options.now ?? new Date());
  void now;

  if (input.scope === 'admin_open' || input.scope === 'admin_detail') {
    const actor = requireAdministratorActor(options.administratorActor);

    if (input.scope === 'admin_detail') {
      const requestId = input.requestId;
      if (!requestId) {
        return { scope: 'admin_detail' };
      }
      const snapshot = await firestore.collection('booking_change_requests').doc(requestId).get();
      const changeRequest = parseBookingChangeRequest(
        snapshot.data() as Record<string, unknown> | undefined
      );
      if (!changeRequest || changeRequest.requestId !== requestId) {
        return { scope: 'admin_detail' };
      }
      const inboxItem = await buildAdminInboxItem(firestore, actor, changeRequest, readContext);
      if (!inboxItem) {
        return { scope: 'admin_detail' };
      }
      const item: AdminBookingChangeRequestDetailReadModel = {
        ...inboxItem,
        actionRequirement: 'action_required',
      };
      return { scope: 'admin_detail', item };
    }

    const snapshot = await firestore
      .collection('booking_change_requests')
      .where('lifecycle.status', '==', 'open')
      .limit(ADMIN_OPEN_CHANGE_REQUEST_LIMIT)
      .get();

    const items: AdminBookingChangeRequestInboxItem[] = [];
    for (const doc of snapshot.docs) {
      const parsed = parseBookingChangeRequest(doc.data() as Record<string, unknown>);
      if (!parsed) continue;
      const item = await buildAdminInboxItem(firestore, actor, parsed, readContext);
      if (item) items.push(item);
    }
    items.sort((left, right) => {
      const created = right.createdAt.seconds - left.createdAt.seconds;
      return created !== 0 ? created : left.requestId.localeCompare(right.requestId);
    });
    return { scope: 'admin_open', items };
  }

  if (input.scope === 'account_open') {
    const authContext = await loadLessonBookingReadAuthorizationContext(
      firestore,
      options.accountId,
      readContext
    );
    const authorizedBookings = await loadAuthorizedAccountBookings(firestore, options.accountId, {
      authContext,
      readContext,
    });
    const items: BookingChangeRequestReadModel[] = [];

    for (const booking of authorizedBookings) {
      if (!canAccountViewLessonBookingService(authContext, options.accountId, booking)) {
        continue;
      }
      const changeRequests = await loadOpenChangeRequestsForBooking(firestore, booking.bookingId);
      for (const changeRequest of changeRequests) {
        items.push(collaborationItem(changeRequest, { canWithdraw: false }));
      }
    }

    items.sort((left, right) => right.updatedAt.seconds - left.updatedAt.seconds);
    return { scope: input.scope, items };
  }

  const instructorId = options.instructorId;
  if (!instructorId) {
    return { scope: 'instructor_open', items: [] };
  }

  const instructorBookings = await loadInstructorHotBookings(firestore, instructorId);
  const items: BookingChangeRequestReadModel[] = [];

  for (const booking of instructorBookings) {
    const changeRequests = await loadOpenChangeRequestsForBooking(firestore, booking.bookingId);
    for (const changeRequest of changeRequests) {
      const authorizedActions = evaluateBookingChangeRequestAuthorizedActions({
        actor: {
          kind: 'instructor',
          accountId: options.accountId,
          instructorId,
        },
        changeRequest,
        booking,
      });
      items.push(collaborationItem(changeRequest, authorizedActions));
    }
  }

  items.sort((left, right) => right.updatedAt.seconds - left.updatedAt.seconds);
  return { scope: 'instructor_open', items };
}
