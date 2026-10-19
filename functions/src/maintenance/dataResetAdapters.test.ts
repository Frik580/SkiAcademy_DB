import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { canonicalCourseDeliveryFixtures as fixture } from '@ski-academy/shared-domain/testing';
import { timestampFromDate } from '@ski-academy/shared-domain';
import { revenueBooking, revenuePayment } from '../../../tests/helpers/instructorRevenueFixtures';

const require = createRequire(import.meta.url);
const { projectionActions, assertCourseWindows } = require('../../scripts/data-reset/adapters.cjs');
const {
  storagePlan,
  verifyObjects,
  storageReferences,
} = require('../../scripts/data-reset/storage.cjs');
const { hash } = require('../../scripts/data-reset/inventory.cjs');
const row = (path: string, data: object) => ({ path, data, hash: hash(data) });
const now = timestampFromDate(new Date('2026-01-01T00:00:00Z'));

describe('reset derived-state adapters', () => {
  it('counts remaining canonical seats and preserves Course configuration', () => {
    const rows = [
      row(`courses/${fixture.course.courseId}`, fixture.course),
      row('course_enrollments/remove', { ...fixture.confirmedEnrollment, enrollmentId: 'remove' }),
      row('course_enrollments/keep', {
        ...fixture.confirmedEnrollment,
        enrollmentId: 'keep',
      }),
    ];
    const blockers: string[] = [];
    const actions = projectionActions(
      { rows },
      [{ path: 'course_enrollments/remove', kind: 'delete' }],
      now,
      blockers
    );
    expect(blockers).toEqual([]);
    const patch = actions.find((a: { phase: number }) => a.phase === 2);
    expect(patch.set.capacity).toEqual({ totalSeats: 8, availableSeats: 7 });
    expect(patch.set.title).toBeUndefined();
    expect(patch.set.price).toBeUndefined();
    expect(() => assertCourseWindows({ actions }, fixture.course.startAt.seconds * 1000)).toThrow(
      'frozen'
    );
    expect(() =>
      assertCourseWindows({ actions }, fixture.course.startAt.seconds * 1000 - 1)
    ).not.toThrow();
  });
  it('blocks oversubscription, malformed enrollment and unknown runtime schemas', () => {
    const rows = [
      row(`courses/${fixture.course.courseId}`, fixture.course),
      ...Array.from({ length: 10 }, (_, i) =>
        row(`course_enrollments/${i}`, {
          ...fixture.confirmedEnrollment,
          enrollmentId: `${i}`,
          participantId: `participant_${i}`,
        })
      ),
    ];
    const blockers: string[] = [];
    projectionActions({ rows }, [{ path: 'course_enrollments/0', kind: 'delete' }], now, blockers);
    expect(blockers.join()).toContain('exceeds totalSeats');
    const malformed: string[] = [];
    projectionActions(
      {
        rows: [
          rows[0],
          row('course_enrollments/0', { courseId: fixture.course.courseId }),
          row('admin_runtime/admin_finance', { revision: 1, unknown: true }),
        ],
      },
      [{ path: 'course_enrollments/0', kind: 'delete' }],
      now,
      malformed
    );
    expect(malformed.join()).toContain('Course capacity rebuild blocked');
    expect(malformed.join()).toContain('Unknown admin runtime shape');
  });
  it('rebuilds shared revenue from retained canonical sources and fails on unknown sources', () => {
    const path = 'instructor_lesson_revenue/live/instructors/revenue_instructor';
    const rows = [
      row('bookings/keep', revenueBooking('keep')),
      row('payments/payment_keep', revenuePayment('keep')),
      row(path, { retainedAmount: 99999, unavailableCount: 0, revision: 2 }),
    ];
    const blockers: string[] = [];
    const actions = projectionActions(
      { rows },
      [{ path: 'bookings/remove', kind: 'delete' }],
      now,
      blockers
    );
    expect(blockers).toEqual([]);
    expect(actions.find((a: { path: string }) => a.path === path).set.retainedAmount).toBe(10000);
    const bad: string[] = [];
    projectionActions({ rows: [rows[0]] }, [{ path: 'bookings/remove', kind: 'delete' }], now, bad);
    expect(bad.join()).toContain('Revenue rebuild blocked');
  });
  it('requires durable intent for a missing object and rejects persistent/shared objects', () => {
    const object = {
      name: 'test-sessions/session/booking-chat/booking/file.jpg',
      generation: '7',
      sha256: 'a'.repeat(64),
    };
    const inventory = {
      complete: true,
      bucket: 'demo-reset.firebasestorage.app',
      objects: [object],
      deletions: [object],
    };
    expect(() => verifyObjects({ ...inventory, objects: [] }, inventory, 0)).toThrow('drift');
    expect(() => verifyObjects({ ...inventory, objects: [] }, inventory, 0, object)).not.toThrow();
    const blockers: string[] = [];
    storagePlan(
      {
        storage: inventory,
        rows: [
          row('bookings/booking', { dataScope: 'test', testSessionId: 'session' }),
          row('settings/ref', { url: `gs://${inventory.bucket}/${object.name}` }),
        ],
      },
      { testSessionIds: ['session'], storageObjects: [object] },
      [{ kind: 'delete', path: 'bookings/booking' }],
      { projectId: 'demo-reset' },
      blockers
    );
    expect(blockers.join()).toContain('Retained Storage reference');
    expect(
      storageReferences(
        `https://${inventory.bucket}.storage.googleapis.com/${object.name}`,
        inventory.bucket
      ).has(object.name)
    ).toBe(true);
    const orphan: string[] = [];
    storagePlan(
      { storage: inventory, rows: [] },
      { testSessionIds: ['session'], storageObjects: [] },
      [],
      { projectId: 'demo-reset' },
      orphan
    );
    expect(orphan.join()).toContain('Orphan/foreign selected-session Storage media');
    expect(() =>
      storagePlan({ storage: undefined }, {}, [], { projectId: 'demo-reset' }, [])
    ).toThrow('complete Storage');
  });
});
