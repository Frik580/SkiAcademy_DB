import { type QueryDocumentSnapshot } from 'firebase/firestore';
import {
  collection,
  db,
  doc,
  documentId,
  getDocs,
  limit,
  orderBy,
  query,
  setDoc,
  startAfter,
  where,
  writeBatch,
} from '../../infrastructure/firebase';
import { AVAILABILITY_SLOTS_COLLECTION, isCourseBooking } from '../../domain/availability';
import { Booking, Course } from '../../types';

export type ClearStudentBookingsResult = {
  bookingsDeleted: number;
  messagesDeleted: number;
  slotsDeleted: number;
  coursesReset: number;
};

const PAGE_SIZE = 200;
const BATCH_LIMIT = 400;

export const isStudentBooking = (booking: Pick<Booking, 'userId'>): boolean =>
  !booking.userId.startsWith('system_block_');

const commitBatchDeletes = async (refs: ReturnType<typeof doc>[]) => {
  for (let i = 0; i < refs.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db);
    refs.slice(i, i + BATCH_LIMIT).forEach((ref) => batch.delete(ref));
    await batch.commit();
  }
};

const deleteBookingMessages = async (bookingId: string): Promise<number> => {
  const messagesSnap = await getDocs(collection(db, 'bookings', bookingId, 'messages'));
  if (messagesSnap.empty) return 0;

  await commitBatchDeletes(messagesSnap.docs.map((messageDoc) => messageDoc.ref));
  return messagesSnap.size;
};

const resetCourseSeats = async (): Promise<number> => {
  const coursesSnap = await getDocs(collection(db, 'courses'));
  if (coursesSnap.empty) return 0;

  let count = 0;
  let batch = writeBatch(db);
  let batchOps = 0;

  for (const courseDoc of coursesSnap.docs) {
    const course = courseDoc.data() as Course;
    batch.update(courseDoc.ref, { availableSeats: course.totalSeats });
    count += 1;
    batchOps += 1;

    if (batchOps >= BATCH_LIMIT) {
      await batch.commit();
      batch = writeBatch(db);
      batchOps = 0;
    }
  }

  if (batchOps > 0) {
    await batch.commit();
  }

  return count;
};

export async function clearStudentBookings(
  onProgress?: (deleted: number) => void
): Promise<ClearStudentBookingsResult> {
  let bookingsDeleted = 0;
  let messagesDeleted = 0;
  let slotsDeleted = 0;
  let lastDoc: QueryDocumentSnapshot | undefined;

  while (true) {
    const pageQuery = lastDoc
      ? query(
          collection(db, 'bookings'),
          orderBy(documentId()),
          startAfter(lastDoc),
          limit(PAGE_SIZE)
        )
      : query(collection(db, 'bookings'), orderBy(documentId()), limit(PAGE_SIZE));

    const snapshot = await getDocs(pageQuery);
    if (snapshot.empty) break;

    const studentBookings = snapshot.docs
      .map((bookingDoc) => ({ id: bookingDoc.id, ...bookingDoc.data() }) as Booking)
      .filter(isStudentBooking);

    for (const booking of studentBookings) {
      messagesDeleted += await deleteBookingMessages(booking.id);

      const batch = writeBatch(db);
      batch.delete(doc(db, 'bookings', booking.id));
      if (!isCourseBooking(booking)) {
        batch.delete(doc(db, AVAILABILITY_SLOTS_COLLECTION, booking.id));
        slotsDeleted += 1;
      }
      await batch.commit();

      bookingsDeleted += 1;
      onProgress?.(bookingsDeleted);
    }

    lastDoc = snapshot.docs[snapshot.docs.length - 1];
    if (snapshot.docs.length < PAGE_SIZE) break;
  }

  const coursesReset = await resetCourseSeats();

  await setDoc(
    doc(db, 'users', 'school_global_stats'),
    { deletedCompletedRevenue: 0, deletedCompletedCount: 0 },
    { merge: true }
  );

  return { bookingsDeleted, messagesDeleted, slotsDeleted, coursesReset };
}

export type ClearCancelledBookingsResult = {
  bookingsDeleted: number;
  messagesDeleted: number;
  slotsDeleted: number;
};

export async function clearCancelledBookings(
  onProgress?: (deleted: number) => void
): Promise<ClearCancelledBookingsResult> {
  let bookingsDeleted = 0;
  let messagesDeleted = 0;
  let slotsDeleted = 0;
  let lastDoc: QueryDocumentSnapshot | undefined;

  while (true) {
    const pageQuery = lastDoc
      ? query(
          collection(db, 'bookings'),
          where('status', '==', 'cancelled'),
          orderBy(documentId()),
          startAfter(lastDoc),
          limit(PAGE_SIZE)
        )
      : query(
          collection(db, 'bookings'),
          where('status', '==', 'cancelled'),
          orderBy(documentId()),
          limit(PAGE_SIZE)
        );

    const snapshot = await getDocs(pageQuery);
    if (snapshot.empty) break;

    const cancelledBookings = snapshot.docs.map(
      (bookingDoc) => ({ id: bookingDoc.id, ...bookingDoc.data() }) as Booking
    );

    for (const booking of cancelledBookings) {
      messagesDeleted += await deleteBookingMessages(booking.id);

      const batch = writeBatch(db);
      batch.delete(doc(db, 'bookings', booking.id));
      if (!isCourseBooking(booking)) {
        batch.delete(doc(db, AVAILABILITY_SLOTS_COLLECTION, booking.id));
        slotsDeleted += 1;
      }
      await batch.commit();

      bookingsDeleted += 1;
      onProgress?.(bookingsDeleted);
    }

    lastDoc = snapshot.docs[snapshot.docs.length - 1];
    if (snapshot.docs.length < PAGE_SIZE) break;
  }

  return { bookingsDeleted, messagesDeleted, slotsDeleted };
}
