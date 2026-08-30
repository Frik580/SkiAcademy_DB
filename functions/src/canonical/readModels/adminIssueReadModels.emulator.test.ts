import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { deleteApp, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import {
  AccountIdSchema,
  AttendanceSchema,
  CourseEnrollmentSchema,
  ParticipantSchema,
  PaymentSchema,
  courseEnrollmentAttendancePaymentConflictIdentity,
  courseEnrollmentSeatOccurrenceId,
  createOpenAdminIssue,
  paymentIdFromCourseEnrollmentId,
  resolveAdminIssue,
  timestampFromDate,
} from '@ski-academy/shared-domain';
import {
  canonicalCourseDeliveryFixtures,
  canonicalPaymentWalletAuditFixtures,
} from '@ski-academy/shared-domain/testing';
import { queryAdminIssueReadModels } from './adminIssueReadModels';

const PROJECT_ID = 'ski-academy-admin-issue-read-model-test';
const runsOnFirestoreEmulator = Boolean(
  process.env.FIREBASE_EMULATOR_HUB ?? process.env.FIRESTORE_EMULATOR_HOST
);
const describeEmulator = runsOnFirestoreEmulator ? describe : describe.skip;
const adminAccountId = AccountIdSchema.parse('account_admin_issue_reader_01');
const actor = { kind: 'administrator' as const, accountId: adminAccountId };
const openedAt = timestampFromDate(new Date('2026-08-01T10:00:00.000Z'));

let app: App;
let firestore: Firestore;

function makeIssue(
  suffix: string,
  kind: 'missing_attendance' | 'payment_required_at_start' | 'attendance_payment_conflict',
  updatedAt = openedAt
) {
  const enrollment = canonicalCourseDeliveryFixtures.confirmedEnrollment;
  const identity =
    kind === 'attendance_payment_conflict'
      ? courseEnrollmentAttendancePaymentConflictIdentity({
          enrollmentId: enrollment.enrollmentId,
          occurrenceId: courseEnrollmentSeatOccurrenceId(enrollment.enrollmentId),
          participantId: enrollment.participantId,
        })
      : {
          strategyVersion: 'issue:v1' as const,
          kind,
          subjectKind: 'course_enrollment' as const,
          subjectId: enrollment.enrollmentId,
          participantId: enrollment.participantId,
          reconciliationScope: `fixture_${suffix}`,
        };
  return createOpenAdminIssue({
    identity,
    now: updatedAt,
    correlationId: `correlation_admin_issue_${suffix}`,
    commandId: `command_admin_issue_${suffix}`,
  });
}

async function seedIssue(issue: ReturnType<typeof makeIssue>) {
  await firestore.collection('admin_issues').doc(issue.issueId).set(issue);
}

describeEmulator('admin issue read models', () => {
  beforeAll(async () => {
    app =
      getApps().find((candidate) => candidate.name === PROJECT_ID) ??
      initializeApp({ projectId: PROJECT_ID }, PROJECT_ID);
    firestore = getFirestore(app);
  });

  beforeEach(async () => {
    const collections = [
      'admin_issues',
      'course_enrollments',
      'payments',
      'attendance',
      'participants',
    ];
    for (const collectionName of collections) {
      const snapshot = await firestore.collection(collectionName).get();
      await Promise.all(snapshot.docs.map((document) => document.ref.delete()));
    }
  });

  afterAll(async () => {
    if (app) await deleteApp(app);
  });

  it('returns open issues with stable cursor pagination and severity filtering', async () => {
    const first = makeIssue('open_first', 'missing_attendance');
    const second = makeIssue('open_second', 'payment_required_at_start');
    const third = makeIssue(
      'open_third',
      'attendance_payment_conflict',
      timestampFromDate(new Date('2026-08-02T10:00:00.000Z'))
    );
    await Promise.all([seedIssue(first), seedIssue(second), seedIssue(third)]);

    const pageOne = await queryAdminIssueReadModels(firestore, actor, {
      scope: 'admin_open',
      pageSize: 2,
    });
    expect(pageOne.scope).toBe('admin_open');
    if (pageOne.scope === 'admin_detail') throw new Error('unexpected detail');
    expect(pageOne.items).toHaveLength(2);
    expect(pageOne.items[0]?.issueId).toBe(third.issueId);
    expect(pageOne.hasMore).toBe(true);
    expect(pageOne.nextCursor).toBeDefined();

    const pageTwo = await queryAdminIssueReadModels(firestore, actor, {
      scope: 'admin_open',
      pageSize: 2,
      cursor: pageOne.nextCursor,
    });
    if (pageTwo.scope === 'admin_detail') throw new Error('unexpected detail');
    expect(pageTwo.items).toHaveLength(1);
    expect(new Set([...pageOne.items, ...pageTwo.items].map((item) => item.issueId)).size).toBe(3);

    const critical = await queryAdminIssueReadModels(firestore, actor, {
      scope: 'admin_open',
      severity: 'critical',
    });
    if (critical.scope === 'admin_detail') throw new Error('unexpected detail');
    expect(critical.items.map((item) => item.issueId)).toEqual([third.issueId]);

    await expect(
      queryAdminIssueReadModels(firestore, actor, {
        scope: 'admin_open',
        cursor: 'not-a-cursor',
      })
    ).rejects.toThrow('cursor is invalid');
    await expect(
      queryAdminIssueReadModels(firestore, actor, {
        scope: 'admin_open',
        severity: 'critical',
        cursor: pageOne.nextCursor,
      })
    ).rejects.toThrow('cursor is invalid');
  });

  it('keeps resolved issues in history and derives informational semantics', async () => {
    const open = makeIssue('history', 'missing_attendance');
    const resolved = resolveAdminIssue(open, {
      expectedRevision: open.revision,
      now: timestampFromDate(new Date('2026-08-03T10:00:00.000Z')),
      correlationId: 'correlation_admin_issue_history_resolve',
      commandId: 'command_admin_issue_history_resolve',
      reason: 'Attendance corrected',
      actor: {
        actor: { kind: 'account', accountId: adminAccountId },
        exercisedCapability: 'administrator',
      },
      coupledDomainCommand: true,
    });
    await seedIssue(resolved);

    const openResult = await queryAdminIssueReadModels(firestore, actor, {
      scope: 'admin_open',
    });
    const historyResult = await queryAdminIssueReadModels(firestore, actor, {
      scope: 'admin_history',
    });
    if (openResult.scope === 'admin_detail' || historyResult.scope === 'admin_detail') {
      throw new Error('unexpected detail');
    }
    expect(openResult.items).toEqual([]);
    expect(historyResult.items[0]).toMatchObject({
      issueId: resolved.issueId,
      actionRequirement: 'informational',
      lifecycle: { status: 'resolved' },
    });
  });

  it('projects attendance_payment_conflict detail with safe references and server actions', async () => {
    const enrollment = CourseEnrollmentSchema.parse({
      ...canonicalCourseDeliveryFixtures.confirmedEnrollment,
      paymentId: paymentIdFromCourseEnrollmentId(
        canonicalCourseDeliveryFixtures.confirmedEnrollment.enrollmentId
      ),
    });
    const attendance = canonicalCourseDeliveryFixtures.presentCourseDayAttendance;
    const payment = PaymentSchema.parse({
      ...canonicalPaymentWalletAuditFixtures.underpaidPayment,
      paymentId: enrollment.paymentId,
      subjectType: 'course_enrollment',
      subjectId: enrollment.enrollmentId,
    });
    const participant = ParticipantSchema.parse({
      participantId: enrollment.participantId,
      displayName: 'Canonical Participant',
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
    const issue = makeIssue('detail', 'attendance_payment_conflict');

    await Promise.all([
      seedIssue(issue),
      firestore.collection('course_enrollments').doc(enrollment.enrollmentId).set(enrollment),
      firestore.collection('payments').doc(payment.paymentId).set(payment),
      firestore.collection('attendance').doc(attendance.attendanceId).set(attendance),
      firestore.collection('participants').doc(participant.participantId).set(participant),
    ]);

    const result = await queryAdminIssueReadModels(firestore, actor, {
      scope: 'admin_detail',
      issueId: issue.issueId,
    });
    expect(result).toMatchObject({
      scope: 'admin_detail',
      item: {
        kind: 'attendance_payment_conflict',
        subjectRef: {
          subjectKind: 'course_enrollment',
          enrollmentId: enrollment.enrollmentId,
        },
        participant: { displayName: 'Canonical Participant' },
        payment: {
          paymentId: payment.paymentId,
          paymentStatus: 'partially_paid',
        },
        attendance: [
          {
            attendanceId: attendance.attendanceId,
            attendanceStatus: 'present',
          },
        ],
        resolutionGuidance: 'correct_finance',
        authorizedActions: {
          canResolveDirectly: false,
          actions: [
            { kind: 'correct_finance', availability: 'deferred' },
            { kind: 'correct_attendance_outcome', availability: 'deferred' },
            { kind: 'reconcile_subject', availability: 'deferred' },
          ],
        },
      },
    });
    expect(JSON.stringify(result)).not.toMatch(/dedupeKey|correlationId|causationId|audit/);

    const mismatchedPaymentIdentityEnrollment = CourseEnrollmentSchema.parse({
      ...enrollment,
      paymentId: 'payment_admin_issue_mismatch',
    });
    await firestore
      .collection('course_enrollments')
      .doc(enrollment.enrollmentId)
      .set(mismatchedPaymentIdentityEnrollment);
    await expect(
      queryAdminIssueReadModels(firestore, actor, {
        scope: 'admin_detail',
        issueId: issue.issueId,
      })
    ).rejects.toThrow('read integrity failure');
    await firestore.collection('course_enrollments').doc(enrollment.enrollmentId).set(enrollment);

    const mismatchedCourseAttendance = AttendanceSchema.parse({
      ...attendance,
      subject: {
        ...attendance.subject,
        courseId: 'course_admin_issue_mismatch',
      },
    });
    await firestore
      .collection('attendance')
      .doc(attendance.attendanceId)
      .set(mismatchedCourseAttendance);
    await expect(
      queryAdminIssueReadModels(firestore, actor, {
        scope: 'admin_detail',
        issueId: issue.issueId,
      })
    ).rejects.toThrow('read integrity failure');
    await firestore.collection('attendance').doc(attendance.attendanceId).set(attendance);

    const mismatchedParticipant = ParticipantSchema.parse({
      ...participant,
      participantId: 'participant_admin_issue_mismatch',
    });
    await firestore
      .collection('participants')
      .doc(participant.participantId)
      .set(mismatchedParticipant);
    await expect(
      queryAdminIssueReadModels(firestore, actor, {
        scope: 'admin_detail',
        issueId: issue.issueId,
      })
    ).rejects.toThrow('read integrity failure');
  });

  it('fails closed for malformed issues and missing action context', async () => {
    await firestore
      .collection('admin_issues')
      .doc('admin_issue_malformed_01')
      .set({
        issueId: 'admin_issue_malformed_01',
        lifecycle: { status: 'open' },
        updatedAt: { seconds: 9_999_999_999, nanoseconds: 0 },
      });
    await expect(
      queryAdminIssueReadModels(firestore, actor, { scope: 'admin_open' })
    ).rejects.toThrow('read integrity failure');

    await firestore.collection('admin_issues').doc('admin_issue_malformed_01').delete();
    const issue = makeIssue('missing_action_context', 'attendance_payment_conflict');
    await seedIssue(issue);
    const result = await queryAdminIssueReadModels(firestore, actor, {
      scope: 'admin_detail',
      issueId: issue.issueId,
    });
    expect(result).toMatchObject({
      scope: 'admin_detail',
      item: {
        authorizedActions: {
          canResolveDirectly: false,
          actions: [],
          unavailableReason: 'missing_required_context',
        },
      },
    });
  });
});
