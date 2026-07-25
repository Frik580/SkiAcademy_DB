import { doc, getDoc } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { migrateAvailabilitySlots } from '../../src/lib/availabilityMigration';
import {
  AVAILABILITY_MIGRATION_SETTING,
  AVAILABILITY_SLOTS_COLLECTION,
} from '../../src/lib/availabilitySlots';
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
      lessonBooking({ id: 'booking-block', userId: 'system_block_maintenance' }),
    ];

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

    await migrateAvailabilitySlots([lessonBooking({ id: 'booking-first' })], adminDb);

    const firstMigration = await getDoc(doc(adminDb, 'settings', AVAILABILITY_MIGRATION_SETTING));
    expect(firstMigration.data()?.migratedCount).toBe(1);

    await migrateAvailabilitySlots([lessonBooking({ id: 'booking-second' })], adminDb);

    const secondSlot = await getDoc(doc(adminDb, AVAILABILITY_SLOTS_COLLECTION, 'booking-second'));
    const migrationDoc = await getDoc(doc(adminDb, 'settings', AVAILABILITY_MIGRATION_SETTING));

    expect(secondSlot.exists()).toBe(false);
    expect(migrationDoc.data()?.migratedCount).toBe(1);
  });
});
