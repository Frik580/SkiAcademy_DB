import { toBooking } from '../../infrastructure/firebase';
import { getScopedDocumentPage } from '../../lib/canonical/scopedClientDocuments';
import type { Booking } from '../../types';
import { QUERY_LIMITS } from '../../shared';

export type BookingHistoryScope =
  | { kind: 'admin' }
  | { kind: 'instructor'; instructorId: string }
  | { kind: 'student'; userId: string };

export interface BookingHistoryPage {
  bookings: Booking[];
  cursor: string | null;
  hasMore: boolean;
}

/** On-demand history. The opaque cursor belongs to the server-authorized scope. */
export async function getBookingHistoryPage(
  scope: BookingHistoryScope,
  cursor: string | null = null,
  readPage = getScopedDocumentPage
): Promise<BookingHistoryPage> {
  const where: Parameters<typeof getScopedDocumentPage>[0]['where'] = [
    { field: 'status', op: 'in', value: ['completed', 'cancelled', 'pending_cancellation'] },
  ];
  if (scope.kind === 'instructor')
    where.push({ field: 'instructorId', op: '==', value: scope.instructorId });
  if (scope.kind === 'student') where.push({ field: 'userId', op: '==', value: scope.userId });
  const page = await readPage(
    {
      collection: 'bookings',
      take: QUERY_LIMITS.bookingsHistory,
      where,
      order: [{ field: 'date', direction: 'desc' }],
    },
    cursor
  );
  return {
    bookings: page.docs.flatMap((item) => {
      const booking = toBooking(item.id, item.data);
      return booking ? [booking] : [];
    }),
    cursor: page.cursor,
    hasMore: !!page.cursor,
  };
}
