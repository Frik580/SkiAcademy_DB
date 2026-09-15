import { describe, expect, it, vi } from 'vitest';
import type { DocumentReference, Firestore } from 'firebase-admin/firestore';
import {
  ParticipantSchema,
  timestampFromDate,
  type AdminIssue,
} from '@ski-academy/shared-domain';
import {
  canonicalBookingCollaborationFixtures,
  canonicalCourseDeliveryFixtures,
} from '@ski-academy/shared-domain/testing';
import { loadAdminIssueInboxPresentations } from './adminIssueInboxEnrichment';

const openedAt = timestampFromDate(new Date('2026-08-01T10:00:00.000Z'));
const participant = ParticipantSchema.parse({
  participantId: canonicalCourseDeliveryFixtures.confirmedEnrollment.participantId,
  displayName: 'Maya Snow',
  age: { kind: 'age_years', years: 14 },
  skillLevel: 'intermediate',
  discipline: 'ski',
  management: { kind: 'unmanaged_guest' },
  lifecycle: { status: 'active' },
  revision: 1,
  createdAt: openedAt,
  updatedAt: openedAt,
  audit: {
    createdByCommandId: 'command_admin_issue_participant',
    lastChangedByCommandId: 'command_admin_issue_participant',
    correlationId: 'correlation_admin_issue_participant',
  },
});

function createFakeFirestore(docs: ReadonlyMap<string, unknown>) {
  const getAll = vi.fn(async (...refs: DocumentReference[]) =>
    refs.map((ref) => ({
      id: ref.id,
      ref,
      exists: docs.has(ref.path),
      data: () => docs.get(ref.path),
    }))
  );
  const firestore = {
    collection: (name: string) => ({
      doc: (id: string) => ({ id, path: `${name}/${id}` }),
    }),
    doc: (path: string) => ({
      id: path.split('/').pop() ?? path,
      path,
    }),
    getAll,
  };
  return { firestore: firestore as unknown as Firestore, getAll };
}

describe('admin issue inbox enrichment', () => {
  it('enriches a page with two getAll waves and no per-issue client query', async () => {
    const issue = canonicalCourseDeliveryFixtures.openAdminIssue;
    const enrollment = canonicalCourseDeliveryFixtures.confirmedEnrollment;
    const course = canonicalCourseDeliveryFixtures.course;
    const courseDay = canonicalCourseDeliveryFixtures.courseDays[1]!;
    const docs = new Map<string, unknown>([
      [`course_enrollments/${enrollment.enrollmentId}`, enrollment],
      [`participants/${participant.participantId}`, participant],
      [`courses/${course.courseId}`, course],
      [`courses/${course.courseId}/days/${courseDay.courseDayId}`, courseDay],
    ]);
    const { firestore, getAll } = createFakeFirestore(docs);

    const presentations = await loadAdminIssueInboxPresentations(firestore, [issue, issue]);
    expect(getAll).toHaveBeenCalledTimes(2);
    expect(presentations.get(issue.issueId)).toMatchObject({
      subjectDisplayName: 'Maya Snow',
      courseTitle: course.title,
      lessonStartsAt: courseDay.interval.startsAt,
      lessonEndsAt: courseDay.interval.endsAt,
    });
  });

  it('omits presentation fields when related documents are missing', async () => {
    const { firestore, getAll } = createFakeFirestore(new Map());
    const presentations = await loadAdminIssueInboxPresentations(firestore, [
      canonicalCourseDeliveryFixtures.openAdminIssue,
    ]);
    expect(getAll).toHaveBeenCalledTimes(2);
    expect(presentations.get(canonicalCourseDeliveryFixtures.openAdminIssue.issueId)).toEqual({});
  });

  it('projects guest origin from existing booking origin without a new kind', async () => {
    const booking = canonicalBookingCollaborationFixtures.guestPendingBooking;
    const issue = {
      ...canonicalCourseDeliveryFixtures.openAdminIssue,
      participantId: booking.party.participantIds[0],
      courseDayId: undefined,
      subjectRef: { subjectKind: 'booking' as const, bookingId: booking.bookingId },
    } as AdminIssue;
    const docs = new Map<string, unknown>([[`bookings/${booking.bookingId}`, booking]]);
    const { firestore } = createFakeFirestore(docs);
    const presentations = await loadAdminIssueInboxPresentations(firestore, [issue]);
    expect(presentations.get(issue.issueId)).toMatchObject({
      presentationOrigin: 'guest',
      lessonStartsAt: booking.occurrence.interval.startsAt,
    });
    expect(presentations.get(issue.issueId)).not.toHaveProperty('kind');
  });
});
