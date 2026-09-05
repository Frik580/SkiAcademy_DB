import type {
  DocumentSnapshot,
  Firestore,
  QuerySnapshot,
} from 'firebase-admin/firestore';
import type {
  AccountId,
  AttendanceId,
  BookingId,
  CourseEnrollmentId,
  CourseId,
  InstructorId,
  Participant,
  ParticipantBlock,
  PaymentId,
} from '@ski-academy/shared-domain';
import { courseDaysCollectionPath } from '../courses/courseStore';
import { participantBlockPath } from '../participantAccess/participantAccessStore';

/** Firestore `in` operator maximum; enforced here so callers cannot exceed it. */
const ATTENDANCES_FOR_ENROLLMENTS_MAX_IDS = 30;

const ATTENDANCES_FOR_ENROLLMENTS_CONTRACT_VIOLATION =
  'ReadModelRequestContext.attendancesForEnrollments internal contract violation: enrollmentIds must be non-empty and at most 30';

function attendancesForEnrollmentsMemoKey(
  enrollmentIds: readonly CourseEnrollmentId[]
): string {
  return [...enrollmentIds].sort().join('\u001f');
}

/**
 * Promise memoization owned by one callable/read-model invocation.
 *
 * The context deliberately exposes semantic loaders instead of a generic query
 * cache. A rejected Promise remains memoized so concurrent consumers observe
 * the same Firestore/error semantics. The whole context is discarded when the
 * invocation completes.
 */
export class ReadModelRequestContext {
  private readonly accountById = new Map<string, Promise<DocumentSnapshot>>();
  private readonly participantById = new Map<string, Promise<DocumentSnapshot>>();
  private readonly instructorById = new Map<string, Promise<DocumentSnapshot>>();
  private readonly courseById = new Map<string, Promise<DocumentSnapshot>>();
  private readonly paymentById = new Map<string, Promise<DocumentSnapshot>>();
  private readonly bookingById = new Map<string, Promise<DocumentSnapshot>>();
  private readonly enrollmentById = new Map<string, Promise<DocumentSnapshot>>();
  private readonly attendanceById = new Map<string, Promise<DocumentSnapshot>>();
  private readonly participantBlockById = new Map<string, Promise<DocumentSnapshot>>();
  private readonly courseDaysByCourseId = new Map<string, Promise<QuerySnapshot>>();
  private readonly courseAttendancesByCourseId = new Map<string, Promise<QuerySnapshot>>();
  private readonly attendancesByEnrollmentIds = new Map<string, Promise<QuerySnapshot>>();
  private readonly enrollmentAttendancesByEnrollmentId = new Map<
    string,
    Promise<QuerySnapshot>
  >();
  private readonly lessonManagementByAccountId = new Map<string, Promise<QuerySnapshot>>();
  private readonly activeManagementByAccountId = new Map<string, Promise<QuerySnapshot>>();
  private readonly activeManagementByParticipantId = new Map<string, Promise<QuerySnapshot>>();
  private readonly linkedAccountByInstructorId = new Map<string, Promise<QuerySnapshot>>();

  constructor(private readonly firestore: Firestore) {}

  private memoize<T>(
    memo: Map<string, Promise<T>>,
    key: string,
    load: () => Promise<T>
  ): Promise<T> {
    const existing = memo.get(key);
    if (existing) return existing;
    const pending = load();
    memo.set(key, pending);
    return pending;
  }

  account(accountId: AccountId): Promise<DocumentSnapshot> {
    return this.memoize(this.accountById, accountId, () =>
      this.firestore.collection('users').doc(accountId).get()
    );
  }

  participant(participantId: Participant['participantId']): Promise<DocumentSnapshot> {
    return this.memoize(this.participantById, participantId, () =>
      this.firestore.collection('participants').doc(participantId).get()
    );
  }

  instructor(instructorId: InstructorId): Promise<DocumentSnapshot> {
    return this.memoize(this.instructorById, instructorId, () =>
      this.firestore.collection('instructors').doc(instructorId).get()
    );
  }

  course(courseId: CourseId): Promise<DocumentSnapshot> {
    return this.memoize(this.courseById, courseId, () =>
      this.firestore.collection('courses').doc(courseId).get()
    );
  }

  payment(paymentId: PaymentId): Promise<DocumentSnapshot> {
    return this.memoize(this.paymentById, paymentId, () =>
      this.firestore.collection('payments').doc(paymentId).get()
    );
  }

  booking(bookingId: BookingId): Promise<DocumentSnapshot> {
    return this.memoize(this.bookingById, bookingId, () =>
      this.firestore.collection('bookings').doc(bookingId).get()
    );
  }

  enrollment(enrollmentId: CourseEnrollmentId): Promise<DocumentSnapshot> {
    return this.memoize(this.enrollmentById, enrollmentId, () =>
      this.firestore.collection('course_enrollments').doc(enrollmentId).get()
    );
  }

  attendance(attendanceId: AttendanceId): Promise<DocumentSnapshot> {
    return this.memoize(this.attendanceById, attendanceId, () =>
      this.firestore.collection('attendance').doc(attendanceId).get()
    );
  }

  participantBlock(
    participantBlockId: ParticipantBlock['participantBlockId']
  ): Promise<DocumentSnapshot> {
    return this.memoize(this.participantBlockById, participantBlockId, () =>
      this.firestore.doc(participantBlockPath(participantBlockId)).get()
    );
  }

  courseDays(courseId: CourseId): Promise<QuerySnapshot> {
    return this.memoize(this.courseDaysByCourseId, courseId, () =>
      this.firestore.collection(courseDaysCollectionPath(courseId)).get()
    );
  }

  courseAttendances(courseId: CourseId): Promise<QuerySnapshot> {
    return this.memoize(this.courseAttendancesByCourseId, courseId, () =>
      this.firestore.collection('attendance').where('subject.courseId', '==', courseId).get()
    );
  }

  attendancesForEnrollments(
    enrollmentIds: readonly CourseEnrollmentId[]
  ): Promise<QuerySnapshot> {
    if (
      enrollmentIds.length === 0 ||
      enrollmentIds.length > ATTENDANCES_FOR_ENROLLMENTS_MAX_IDS
    ) {
      throw new Error(ATTENDANCES_FOR_ENROLLMENTS_CONTRACT_VIOLATION);
    }
    const key = attendancesForEnrollmentsMemoKey(enrollmentIds);
    return this.memoize(this.attendancesByEnrollmentIds, key, () =>
      this.firestore
        .collection('attendance')
        .where('subject.enrollmentId', 'in', [...enrollmentIds])
        .get()
    );
  }

  enrollmentAttendances(enrollmentId: CourseEnrollmentId): Promise<QuerySnapshot> {
    return this.memoize(this.enrollmentAttendancesByEnrollmentId, enrollmentId, () =>
      this.firestore
        .collection('attendance')
        .where('subject.enrollmentId', '==', enrollmentId)
        .get()
    );
  }

  lessonManagementForAccount(accountId: AccountId): Promise<QuerySnapshot> {
    return this.memoize(this.lessonManagementByAccountId, accountId, () =>
      this.firestore
        .collection('participant_management')
        .where('accountId', '==', accountId)
        .limit(50)
        .get()
    );
  }

  activeManagementForAccount(accountId: AccountId): Promise<QuerySnapshot> {
    return this.memoize(this.activeManagementByAccountId, accountId, () =>
      this.firestore
        .collection('participant_management')
        .where('accountId', '==', accountId)
        .where('status', '==', 'active')
        .get()
    );
  }

  activeManagementForParticipant(
    participantId: Participant['participantId']
  ): Promise<QuerySnapshot> {
    return this.memoize(this.activeManagementByParticipantId, participantId, () =>
      this.firestore
        .collection('participant_management')
        .where('participantId', '==', participantId)
        .where('status', '==', 'active')
        .get()
    );
  }

  linkedAccountForInstructor(instructorId: InstructorId): Promise<QuerySnapshot> {
    return this.memoize(this.linkedAccountByInstructorId, instructorId, () =>
      this.firestore.collection('users').where('instructorId', '==', instructorId).limit(2).get()
    );
  }
}

export function createReadModelRequestContext(firestore: Firestore): ReadModelRequestContext {
  return new ReadModelRequestContext(firestore);
}
