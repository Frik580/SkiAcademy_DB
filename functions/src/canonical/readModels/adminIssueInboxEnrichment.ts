import type { DocumentReference, DocumentSnapshot, Firestore } from 'firebase-admin/firestore';
import {
  ADMIN_ISSUE_INBOX_GETALL_CHUNK_SIZE,
  collectAdminIssueInboxFollowOnIds,
  collectAdminIssueInboxSubjectIds,
  projectAdminIssueInboxPresentation,
  type AdminIssue,
  type Booking,
  type Course,
  type CourseDay,
  type CourseEnrollment,
  type Participant,
} from '@ski-academy/shared-domain';
import { parseBooking } from '../bookings/bookingStore';
import { parseCourse, parseCourseDay } from '../courses/courseStore';
import { parseCourseEnrollment } from '../courses/courseEnrollmentStore';
import { parseParticipant } from '../participantAccess/participantAccessStore';

function uniqueRefs(refs: readonly DocumentReference[]): DocumentReference[] {
  const byPath = new Map<string, DocumentReference>();
  for (const ref of refs) {
    byPath.set(ref.path, ref);
  }
  return [...byPath.values()];
}

export async function getAllAdminIssueInboxDocs(
  firestore: Firestore,
  refs: readonly DocumentReference[]
): Promise<DocumentSnapshot[]> {
  const unique = uniqueRefs(refs);
  if (unique.length === 0) return [];
  const snapshots: DocumentSnapshot[] = [];
  for (let offset = 0; offset < unique.length; offset += ADMIN_ISSUE_INBOX_GETALL_CHUNK_SIZE) {
    const chunk = unique.slice(offset, offset + ADMIN_ISSUE_INBOX_GETALL_CHUNK_SIZE);
    snapshots.push(...(await firestore.getAll(...chunk)));
  }
  return snapshots;
}

function parsedById<T>(
  snapshots: readonly DocumentSnapshot[],
  parse: (data: Record<string, unknown> | undefined) => T | undefined,
  idOf: (value: T) => string
): Map<string, T> {
  const byId = new Map<string, T>();
  for (const snapshot of snapshots) {
    if (!snapshot.exists) continue;
    const parsed = parse(snapshot.data() as Record<string, unknown>);
    if (parsed) byId.set(idOf(parsed), parsed);
  }
  return byId;
}

export async function loadAdminIssueInboxPresentations(
  firestore: Firestore,
  issues: readonly AdminIssue[]
): Promise<Map<string, ReturnType<typeof projectAdminIssueInboxPresentation>>> {
  const presentations = new Map<string, ReturnType<typeof projectAdminIssueInboxPresentation>>();
  if (issues.length === 0) return presentations;

  const subjectIds = collectAdminIssueInboxSubjectIds(issues);
  const subjectSnapshots = await getAllAdminIssueInboxDocs(firestore, [
    ...subjectIds.bookingIds.map((bookingId) => firestore.collection('bookings').doc(bookingId)),
    ...subjectIds.enrollmentIds.map((enrollmentId) =>
      firestore.collection('course_enrollments').doc(enrollmentId)
    ),
  ]);
  const bookings = new Map<string, Booking>();
  const enrollments = new Map<string, CourseEnrollment>();
  for (const snapshot of subjectSnapshots) {
    if (!snapshot.exists) continue;
    const data = snapshot.data() as Record<string, unknown>;
    const booking = parseBooking(data);
    if (booking) {
      bookings.set(booking.bookingId, booking);
      continue;
    }
    const enrollment = parseCourseEnrollment(data);
    if (enrollment) enrollments.set(enrollment.enrollmentId, enrollment);
  }

  const followOn = collectAdminIssueInboxFollowOnIds({ issues, bookings, enrollments });
  const followOnSnapshots = await getAllAdminIssueInboxDocs(firestore, [
    ...followOn.participantIds.map((participantId) =>
      firestore.collection('participants').doc(participantId)
    ),
    ...followOn.courseIds.map((courseId) => firestore.collection('courses').doc(courseId)),
    ...followOn.courseDays.map((courseDay) =>
      firestore.doc(`courses/${courseDay.courseId}/days/${courseDay.courseDayId}`)
    ),
  ]);
  const participants = parsedById(followOnSnapshots, parseParticipant, (value: Participant) =>
    value.participantId
  );
  const courses = parsedById(followOnSnapshots, parseCourse, (value: Course) => value.courseId);
  const courseDays = parsedById(
    followOnSnapshots,
    parseCourseDay,
    (value: CourseDay) => `${value.courseId}/${value.courseDayId}`
  );

  for (const issue of issues) {
    const booking =
      issue.subjectRef.subjectKind === 'booking'
        ? bookings.get(issue.subjectRef.bookingId)
        : undefined;
    const enrollment =
      issue.subjectRef.subjectKind === 'course_enrollment'
        ? enrollments.get(issue.subjectRef.enrollmentId)
        : undefined;
    const course = enrollment ? courses.get(enrollment.courseId) : undefined;
    const courseDay =
      enrollment && issue.courseDayId
        ? courseDays.get(`${enrollment.courseId}/${issue.courseDayId}`)
        : undefined;
    presentations.set(
      issue.issueId,
      projectAdminIssueInboxPresentation({
        issue,
        ...(booking === undefined ? {} : { booking }),
        ...(enrollment === undefined ? {} : { enrollment }),
        ...(course === undefined ? {} : { course }),
        ...(courseDay === undefined ? {} : { courseDay }),
        participants,
      })
    );
  }
  return presentations;
}
