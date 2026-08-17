import { doc, getDoc, setDoc } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { migrateAvailabilitySlots } from '../../src/lib/availabilityMigration';
import {
  AVAILABILITY_MIGRATION_SETTING,
  AVAILABILITY_SLOTS_COLLECTION,
} from '../../src/lib/availabilitySlots';
import { AVAILABILITY_HOUR_LOCKS_COLLECTION, buildHourLockIds } from '../../src/domain/booking/slotOverlap';
import type { Booking } from '../../src/types';
import {
  INSTRUCTOR_ID,
  OWNER_ID,
  USER_ID,
  clearIntegrationFirestore,
  integrationTestEnv,
  seedData,
  seedOwnerAndMigrationFlag,
  setupIntegrationTestEnvironment,
  teardownIntegrationTestEnvironment,
} from './helpers';

const lessonBooking = (overrides: Partial<Booking> = {}): Booking => ({
  id: 'booking-active',
  userId: USER_ID,
  instructorId: INSTRUCTOR_ID,
  instructorName: 'Instructor',
  instructorAvatar: '',
  date: '2026-12-01',
  time: '09:00',
  durationHours: 2,
  totalPrice: 100,
  status: 'confirmed',
  difficulty: 'beginner',
  ...overrides,
});

async function seedBookings(bookings: Booking[]) {
  await seedData(async (context) => {
    const db = context.firestore();
    for (const booking of bookings) {
      await setDoc(doc(db, 'bookings', booking.id), {
        ...booking,
        totalPrice: booking.userId.startsWith('system_block_') ? 0 : booking.totalPrice,
      });
    }
  });
}

describe('availability slot migration', () => {
  beforeAll(async () => {
    await setupIntegrationTestEnvironment();
  });

  beforeEach(async () => {
    await clearIntegrationFirestore();
    await seedOwnerAndMigrationFlag(false);
  });

  afterAll(async () => {
    await teardownIntegrationTestEnvironment();
  });

  it('creates availability slots for active lesson bookings and marks migration complete', async () => {
    const adminDb = integrationTestEnv().authenticatedContext(OWNER_ID).firestore();
    const bookings = [
      lessonBooking({ id: 'booking-active' }),
      lessonBooking({ id: 'booking-cancelled', status: 'cancelled' }),
      lessonBooking({
        id: 'booking-course',
        instructorId: 'course_course-1',
        status: 'confirmed',
      }),
      lessonBooking({ id: 'booking-block', userId: 'system_block_maintenance', time: '14:00' }),
    ];

    await seedBookings(bookings);
    await migrateAvailabilitySlots(bookings, adminDb);

    const activeSlot = await getDoc(doc(adminDb, AVAILABILITY_SLOTS_COLLECTION, 'booking-active'));
    const cancelledSlot = await getDoc(
      doc(adminDb, AVAILABILITY_SLOTS_COLLECTION, 'booking-cancelled')
    );
    const courseSlot = await getDoc(doc(adminDb, AVAILABILITY_SLOTS_COLLECTION, 'booking-course'));
    const blockSlot = await getDoc(doc(adminDb, AVAILABILITY_SLOTS_COLLECTION, 'booking-block'));
    const migrationDoc = await getDoc(doc(adminDb, 'settings', AVAILABILITY_MIGRATION_SETTING));

    expect(activeSlot.exists()).toBe(true);
    expect(activeSlot.data()).toMatchObject({
      bookingId: 'booking-active',
      instructorId: INSTRUCTOR_ID,
      slotType: 'lesson',
    });
    const activeHourLock = await getDoc(
      doc(adminDb, AVAILABILITY_HOUR_LOCKS_COLLECTION, buildHourLockIds(bookings[0])[0])
    );
    expect(activeHourLock.exists()).toBe(true);
    expect(blockSlot.data()?.slotType).toBe('block');
    expect(cancelledSlot.exists()).toBe(false);
    expect(courseSlot.exists()).toBe(false);
    expect(migrationDoc.data()).toMatchObject({
      complete: true,
      migratedCount: 2,
    });
  });

  it('skips migration when the settings flag is already complete', async () => {
    const adminDb = integrationTestEnv().authenticatedContext(OWNER_ID).firestore();
    const firstBooking = lessonBooking({ id: 'booking-first' });

    await seedBookings([firstBooking]);
    await migrateAvailabilitySlots([firstBooking], adminDb);

    const firstMigration = await getDoc(doc(adminDb, 'settings', AVAILABILITY_MIGRATION_SETTING));
    expect(firstMigration.data()?.migratedCount).toBe(1);

    await migrateAvailabilitySlots([lessonBooking({ id: 'booking-second' })], adminDb);

    const secondSlot = await getDoc(doc(adminDb, AVAILABILITY_SLOTS_COLLECTION, 'booking-second'));
    const migrationDoc = await getDoc(doc(adminDb, 'settings', AVAILABILITY_MIGRATION_SETTING));

    expect(secondSlot.exists()).toBe(false);
    expect(migrationDoc.data()?.migratedCount).toBe(1);
  });
});
