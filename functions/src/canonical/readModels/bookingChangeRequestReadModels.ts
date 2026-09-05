import {
  evaluateBookingChangeRequestAuthorizedActions,
  type AccountId,
  type Booking,
  type BookingChangeRequest,
  type BookingChangeRequestReadModel,
  type InstructorId,
  type QueryBookingChangeRequestReadModelsInput,
  type QueryBookingChangeRequestReadModelsResult,
  timestampFromDate,
} from '@ski-academy/shared-domain';
import type { Firestore } from 'firebase-admin/firestore';
import { parseBookingChangeRequest } from '../bookings/bookingChangeRequestStore';
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

function isOpenChangeRequest(changeRequest: BookingChangeRequest): boolean {
  return changeRequest.lifecycle.status === 'open';
}

async function loadOpenChangeRequestsForBooking(
  firestore: Firestore,
  bookingId: Booking['bookingId']
): Promise<BookingChangeRequest[]> {
  const snapshot = await firestore
    .collection('booking_change_requests')
    .where('bookingId', '==', bookingId)
    .limit(10)
    .get();

  const requests: BookingChangeRequest[] = [];
  for (const doc of snapshot.docs) {
    const parsed = parseBookingChangeRequest(doc.data() as Record<string, unknown>);
    if (parsed && isOpenChangeRequest(parsed)) {
      requests.push(parsed);
    }
  }
  return requests;
}

export async function queryBookingChangeRequestReadModels(
  firestore: Firestore,
  input: QueryBookingChangeRequestReadModelsInput,
  options: {
    readonly accountId: AccountId;
    readonly instructorId?: InstructorId;
    readonly now?: Date;
    readonly readContext?: ReadModelRequestContext;
  }
): Promise<QueryBookingChangeRequestReadModelsResult> {
  const readContext = options.readContext ?? createReadModelRequestContext(firestore);
  const now = timestampFromDate(options.now ?? new Date());
  void now;

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
        items.push({
          requestId: changeRequest.requestId,
          revision: changeRequest.revision,
          bookingId: changeRequest.bookingId,
          requestType: changeRequest.requestType,
          reason: changeRequest.reason,
          lifecycle: changeRequest.lifecycle,
          authorizedActions: { canWithdraw: false },
          updatedAt: changeRequest.updatedAt,
        });
      }
    }

    items.sort((left, right) => right.updatedAt.seconds - left.updatedAt.seconds);
    return { scope: input.scope, items };
  }

  const instructorId = options.instructorId;
  if (!instructorId) {
    return { scope: input.scope, items: [] };
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
      items.push({
        requestId: changeRequest.requestId,
        revision: changeRequest.revision,
        bookingId: changeRequest.bookingId,
        requestType: changeRequest.requestType,
        reason: changeRequest.reason,
        lifecycle: changeRequest.lifecycle,
        authorizedActions,
        updatedAt: changeRequest.updatedAt,
      });
    }
  }

  items.sort((left, right) => right.updatedAt.seconds - left.updatedAt.seconds);
  return { scope: input.scope, items };
}
