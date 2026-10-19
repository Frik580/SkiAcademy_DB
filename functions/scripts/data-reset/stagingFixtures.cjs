'use strict';

const domain = require('@ski-academy/shared-domain');
const { hash } = require('./inventory.cjs');
const { category, exactPath } = require('./policy.cjs');
const CONTRACT = 'staging-live-fixtures-v1';
function containsEntityToken(text, id) {
  let from = 0,
    at;
  while ((at = text.indexOf(id, from)) !== -1) {
    const left = text[at - 1],
      right = text[at + id.length];
    if (
      (at === 0 || !/[A-Za-z0-9_.@()-]/.test(left)) &&
      (right === undefined || !/[A-Za-z0-9_.:@()-]/.test(right))
    )
      return true;
    from = at + id.length;
  }
  return false;
}
function validExactPath(path) {
  try {
    exactPath(path);
    return true;
  } catch {
    return false;
  }
}
const LOG_FIELDS = [
  'id',
  'message',
  'stack',
  'timestamp',
  'userId',
  'userEmail',
  'url',
  'userAgent',
  'source',
  'operation',
  'path',
];
const SCHEMAS = {
  bookings: 'BookingSchema',
  attendance: 'AttendanceSchema',
  course_enrollments: 'CourseEnrollmentSchema',
  booking_proposals: 'BookingProposalSchema',
  booking_change_requests: 'BookingChangeRequestSchema',
  guest_contacts: 'GuestContactSchema',
  payments: 'PaymentSchema',
  monetary_events: 'MonetaryEventSchema',
  provider_event_receipts: 'ProviderEventReceiptSchema',
  resource_claims: 'ResourceClaimSchema',
  resource_claim_guards: 'ResourceClaimGuardSchema',
  active_course_enrollment_guards: 'ActiveCourseEnrollmentGuardSchema',
  command_idempotency: 'CommandIdempotencyRecordSchema',
  activity_logs: 'ActivityLogSchema',
  domain_outbox: 'DomainOutboxObligationSchema',
  admin_issues: 'AdminIssueSchema',
  participant_progress: 'ParticipantProgressSchema',
  participant_achievements: 'ParticipantAchievementsSchema',
  participant_lesson_feedback: 'ParticipantLessonFeedbackSchema',
  instructor_reviews: 'InstructorReviewSchema',
  instructor_rating_summaries: 'InstructorRatingSummarySchema',
};
function knownActivity(row, byPath) {
  const collection = row.path.split('/')[0],
    data = domain.normalizeFirestoreDocument(row.data);
  if (/^bookings\/[^/]+\/messages\/[^/]+$/.test(row.path)) {
    const p = row.path.split('/');
    return (
      Object.keys(data).every((k) =>
        [
          'id',
          'bookingId',
          'senderId',
          'senderName',
          'senderAvatar',
          'senderRole',
          'senderInstructorId',
          'text',
          'timestamp',
          'attachmentType',
          'attachmentUrl',
          'attachmentName',
          'attachmentSize',
          'isHomework',
          'homeworkForParticipantIds',
          'dataScope',
        ].includes(k)
      ) &&
      data.id === p[3] &&
      data.bookingId === p[1] &&
      byPath.has(`users/${data.senderId}`) &&
      ['senderName', 'senderAvatar', 'text', 'timestamp'].every(
        (k) => typeof data[k] === 'string'
      ) &&
      !Number.isNaN(Date.parse(data.timestamp)) &&
      (!data.senderRole || ['client', 'instructor', 'admin'].includes(data.senderRole))
    );
  }
  if (collection === 'participant_lesson_feedback') {
    const { lessonDate, lessonStartsAt, ...aggregate } = data;
    return (
      domain.ParticipantLessonFeedbackSchema.safeParse(aggregate).success &&
      (lessonDate === undefined || /^\d{4}-\d{2}-\d{2}$/.test(lessonDate)) &&
      (lessonStartsAt === undefined ||
        domain.CanonicalTimestampSchema.safeParse(lessonStartsAt).success)
    );
  }
  if (SCHEMAS[collection]) return domain[SCHEMAS[collection]].safeParse(data).success;
  if (collection === 'booking_attendance_outcome_work')
    return require('../../lib/canonical/bookings/bookingAttendanceOutcomeWork.js').BookingAttendanceOutcomeWorkSchema.safeParse(
      data
    ).success;
  if (collection === 'course_enrollment_outcome_work')
    return !!require('../../lib/canonical/courses/courseEnrollmentOutcomeWork.js').parseCourseEnrollmentOutcomeWork(
      data
    );
  if (collection === 'instructor_lesson_revenue_contributions') {
    const booking = byPath.get(`bookings/${row.path.split('/')[1]}`)?.data;
    return (
      Object.keys(data).every((k) =>
        [
          'summaryPath',
          'retainedAmount',
          'unavailableCount',
          'bookingRevision',
          'paymentRevision',
        ].includes(k)
      ) &&
      booking &&
      data.summaryPath ===
        `instructor_lesson_revenue/live/instructors/${booking.occurrence?.instructorId}` &&
      ['retainedAmount', 'unavailableCount', 'bookingRevision', 'paymentRevision'].every(
        (k) => Number.isSafeInteger(data[k]) && data[k] >= 0
      )
    );
  }
  if (collection === 'participant_progress_events')
    return (
      Object.keys(data).every((k) =>
        [
          'dataScope',
          'participantId',
          'commandId',
          'actor',
          'at',
          'revision',
          'kind',
          'oldLevel',
          'newLevel',
          'oldScores',
          'newScores',
          'oldComments',
          'newComments',
          'thresholdReached',
          'stage',
          'config',
          'previousLevelState',
          'levelState',
          'reason',
        ].includes(k)
      ) &&
      domain.ParticipantIdSchema.safeParse(data.participantId).success &&
      Number.isSafeInteger(data.revision) &&
      data.revision > 0 &&
      row.path.split('/')[1] === `${data.participantId}_${data.revision}` &&
      domain.CanonicalTimestampSchema.safeParse(data.at).success &&
      ['manage_participant_level', 'update_participant_progress'].includes(data.kind) &&
      domain.ParticipantProgressLevelSchema.safeParse(data.oldLevel).success &&
      domain.ParticipantProgressLevelSchema.safeParse(data.newLevel).success
    );
  if (collection === 'course_chat_access')
    return (
      Object.keys(data).every((k) =>
        ['accountId', 'courseId', 'activeCount', 'dataScope'].includes(k)
      ) &&
      row.path === `course_chat_access/${data.accountId}/courses/${data.courseId}` &&
      Number.isSafeInteger(data.activeCount) &&
      data.activeCount > 0
    );
  return false;
}
function knownProgressActivity(row, accounts) {
  const d = row.data,
    m = d.metadata;
  return (
    /^activity_logs\/act_(level|progress)_/.test(row.path) &&
    Object.keys(d).every((k) =>
      ['actorId', 'dataScope', 'metadata', 'timestamp', 'type', 'userId'].includes(k)
    ) &&
    d.dataScope === 'live' &&
    accounts.has(d.userId) &&
    accounts.has(d.actorId) &&
    ['level_up', 'level_changed', 'skill_scores_updated'].includes(d.type) &&
    typeof d.timestamp === 'string' &&
    !Number.isNaN(Date.parse(d.timestamp)) &&
    m &&
    Object.keys(m).every((k) =>
      [
        'commentedSkillIds',
        'instructorId',
        'newLevel',
        'oldLevel',
        'pointsDelta',
        'skillDeltas',
      ].includes(k)
    ) &&
    domain.ParticipantProgressLevelSchema.safeParse(m.newLevel).success &&
    domain.ParticipantProgressLevelSchema.safeParse(m.oldLevel).success &&
    Number.isFinite(m.pointsDelta) &&
    Array.isArray(m.skillDeltas) &&
    m.skillDeltas.every(
      (s) =>
        Object.keys(s).every((k) => ['delta', 'itemId', 'newScore', 'oldScore'].includes(k)) &&
        typeof s.itemId === 'string' &&
        ['delta', 'newScore', 'oldScore'].every((k) => Number.isFinite(s[k]))
    ) &&
    Array.isArray(m.commentedSkillIds) &&
    m.commentedSkillIds.every((s) => typeof s === 'string')
  );
}
function values(data, output = new Set()) {
  if (typeof data === 'string') {
    output.add(data);
    output.add(data.split('/').at(-1));
    if (/^(booking|course_enrollment|payment):/.test(data))
      output.add(data.slice(data.indexOf(':') + 1));
  } else if (Array.isArray(data)) data.forEach((v) => values(v, output));
  else if (data && typeof data === 'object' && Object.getPrototypeOf(data) === Object.prototype)
    Object.values(data).forEach((v) => values(v, output));
  return output;
}
function assertFixtureTarget(target) {
  if (
    target.entrypoint !== 'staging' ||
    (target.projectId !== 'ski-school-staging' && !/^demo-[a-z0-9-]+$/.test(target.projectId))
  )
    throw Error('BLOCKED: LIVE fixture contract is staging-only; production forbidden');
}
function fixtureOwnership(snapshot, selection, target, mode = 'full-test-reset') {
  assertFixtureTarget(target);
  const byPath = new Map(snapshot.rows.map((r) => [r.path, r]));
  const selected = new Map(selection.documents.map((r) => [r.path, r.sha256]));
  const roots = snapshot.rows.filter(
    (r) => /^(bookings|course_enrollments)\/[^/]+$/.test(r.path) && selected.get(r.path) === r.hash
  );
  const blockers = [];
  const eligible = new Set();
  const preserve = new Set();
  const patches = [];
  const audit = [];
  const ids = new Set();
  const accounts = new Set(selection.accountIds);
  const participants = new Set(selection.participantIds);
  const rootOwners = new Set(
    roots.map(
      (r) =>
        `${r.path.startsWith('bookings/') ? 'booking' : 'course_enrollment'}:${r.path.split('/')[1]}`
    )
  );
  if (!roots.length) blockers.push('LIVE fixtures require exact reviewed Booking/Enrollment roots');
  if (
    snapshot.rows.some(
      (r) =>
        /^(bookings|course_enrollments)\/[^/]+$/.test(r.path) &&
        !roots.some((root) => root.path === r.path)
    )
  )
    blockers.push('LIVE fixture reset requires every exact old Booking/Enrollment root');
  if (
    hash([...accounts].sort()) !== hash(snapshot.auth.map((a) => a.uid).sort()) ||
    snapshot.rows
      .filter((r) => /^users\/[^/]+$/.test(r.path))
      .some((r) => !accounts.has(r.path.split('/')[1]))
  )
    blockers.push('LIVE fixture reset must preserve every Account/Auth identity');
  for (const id of accounts) {
    const row = byPath.get(`users/${id}`);
    if (
      !row ||
      !domain.parseAccountDocument(row.data) ||
      row.data.accountId !== id ||
      row.data.dataScope !== 'live' ||
      row.data.testSessionId !== undefined
    )
      blockers.push(`Invalid LIVE Account: ${id}`);
  }
  for (const root of roots) {
    const schema = root.path.startsWith('bookings/')
      ? domain.BookingSchema
      : domain.CourseEnrollmentSchema;
    const parsed = schema.safeParse(domain.normalizeFirestoreDocument(root.data));
    if (
      !parsed.success ||
      root.data.dataScope !== 'live' ||
      root.data.testSessionId !== undefined ||
      (root.data.bookingId ?? root.data.enrollmentId) !== root.path.split('/')[1]
    ) {
      blockers.push(`Invalid LIVE fixture root: ${root.path}`);
      continue;
    }
    eligible.add(root.path);
    ids.add(root.path.split('/')[1]);
    if (typeof root.data.paymentId === 'string') ids.add(root.data.paymentId);
    for (const key of ['createdByCommandId', 'lastChangedByCommandId'])
      if (root.data.audit?.[key]) ids.add(root.data.audit[key]);
  }
  for (const row of snapshot.rows) {
    if (
      row.path.startsWith('monetary_events/') &&
      accounts.has(row.data.walletAccountId) &&
      row.data.dataScope === 'live'
    ) {
      eligible.add(row.path);
      ids.add(row.path.split('/')[1]);
      if (row.data.commandId) ids.add(row.data.commandId);
    }
    if (
      /^course_chat_access\/[^/]+\/courses\/[^/]+$/.test(row.path) &&
      accounts.has(row.data.accountId) &&
      roots.some(
        (r) => r.path.startsWith('course_enrollments/') && r.data.courseId === row.data.courseId
      )
    )
      eligible.add(row.path);
    if (mode === 'full-test-reset' && knownProgressActivity(row, accounts)) eligible.add(row.path);
  }
  // Closure is through operation IDs, never through shared Course/Account identity.
  let changed = true;
  while (changed) {
    changed = false;
    for (const row of snapshot.rows) {
      const kind = category(row.path, mode);
      if (
        kind !== 'delete' ||
        eligible.has(row.path) ||
        row.path.startsWith('resource_claim_guards/')
      )
        continue;
      if (
        row.path.startsWith('resource_claims/') &&
        !rootOwners.has(`${row.data.ownerKind}:${row.data.ownerId}`)
      )
        continue;
      if (row.data.dataScope !== undefined && row.data.dataScope !== 'live') continue;
      const refs = values(row.data);
      const id = row.path.split('/').at(-1);
      const ownedProjection =
        /^(participant_progress|participant_achievements|participant_progress_events|participant_lesson_feedback)\//.test(
          row.path
        ) &&
        (participants.has(id) || participants.has(row.data.participantId));
      const linked = ids.has(id) || [...refs].some((v) => ids.has(v));
      if (linked || ownedProjection) {
        eligible.add(row.path);
        if (
          !/^(participant_progress|participant_achievements|instructor_rating_summaries|participant_lesson_feedback)\//.test(
            row.path
          )
        )
          ids.add(id);
        if (row.path.startsWith('activity_logs/') && row.data.command?.commandId)
          ids.add(row.data.command.commandId);
        changed = true;
      }
    }
  }
  for (const row of snapshot.rows) {
    const kind = category(row.path, mode);
    if (row.path.startsWith('resource_claim_guards/')) {
      const data = row.data;
      if (
        !domain.ResourceClaimGuardSchema.safeParse(domain.normalizeFirestoreDocument(data))
          .success ||
        data.dataScope !== 'live'
      ) {
        blockers.push(`Invalid fixture guard: ${row.path}`);
        continue;
      }
      const kept = data.entries.filter((e) => {
        const claim = byPath.get(`resource_claims/${e.claimId}`)?.data;
        return (
          !rootOwners.has(`${e.ownerKind}:${e.ownerId}`) &&
          !(
            eligible.has(`resource_claims/${e.claimId}`) &&
            claim?.ownerKind === e.ownerKind &&
            claim?.ownerId === e.ownerId
          )
        );
      });
      if (kept.length !== data.entries.length) {
        if (!kept.length) eligible.add(row.path);
        else
          patches.push({
            path: row.path,
            set: { entries: kept, revision: data.revision + 1 },
            reason: 'remove only selected fixture claims from shared guard',
          });
      } else preserve.add(row.path);
    } else if (row.path.startsWith('error_logs/')) {
      const data = row.data;
      const valid =
        Object.keys(data).every((k) => LOG_FIELDS.includes(k)) &&
        Object.values(data).every((v) => typeof v === 'string') &&
        data.id === row.path.split('/')[1] &&
        LOG_FIELDS.filter(
          (k) => !['stack', 'userId', 'userEmail', 'operation', 'path'].includes(k)
        ).every((k) => typeof data[k] === 'string') &&
        !Number.isNaN(Date.parse(data.timestamp)) &&
        (!data.userId || accounts.has(data.userId));
      if (!valid) {
        blockers.push(`Unknown/foreign error log: ${row.path}`);
        continue;
      }
      const serialized = JSON.stringify(data);
      const linked = [...ids].some((id) => containsEntityToken(serialized, id));
      if (linked) eligible.add(row.path);
      else preserve.add(row.path);
      audit.push({
        path: row.path,
        sha256: row.hash,
        type: 'client_error_log',
        owner: data.userId || 'anonymous',
        decision: linked ? 'delete' : 'preserve',
        operationReferences: [...values(data)].filter((v) => ids.has(v)),
        entityReferences: snapshot.rows
          .filter(
            (r) =>
              /^(bookings|course_enrollments|courses)\/[^/]+$/.test(r.path) &&
              containsEntityToken(serialized, r.path.split('/')[1])
          )
          .map((r) => r.path),
      });
    } else if (/^users\/[^/]+\/wallet\/starter_credit_grant$/.test(row.path)) {
      const id = row.path.split('/')[1],
        data = row.data,
        wallet = byPath.get(`users/${id}/wallet/state`);
      const valid =
        accounts.has(id) &&
        Object.keys(data).every((k) => ['granted', 'amountKzt', 'grantedAt'].includes(k)) &&
        data.granted === true &&
        Number.isSafeInteger(data.amountKzt) &&
        data.amountKzt >= 0 &&
        domain.CanonicalTimestampSchema.safeParse(domain.normalizeFirestoreDocument(data.grantedAt))
          .success &&
        wallet?.data.accountId === id;
      if (!valid) blockers.push(`Unknown starter grant: ${row.path}`);
      else preserve.add(row.path);
      audit.push({
        path: row.path,
        sha256: row.hash,
        type: 'one_time_starter_credit_tombstone',
        owner: id,
        decision: 'preserve',
        walletPath: wallet?.path ?? null,
        eventPaths: snapshot.rows
          .filter(
            (r) =>
              r.path.startsWith('monetary_events/') &&
              r.data.walletAccountId === id &&
              r.data.eventKind === 'wallet_credit' &&
              r.data.sourceKind === 'system' &&
              r.data.walletBalanceDelta === data.amountKzt
          )
          .map((r) => r.path),
      });
    } else if (row.path.startsWith('staging_fixture_manifests/')) {
      const d = row.data;
      const fields = [
        'fixtureId',
        'version',
        'projectId',
        'scheduleAnchorDate',
        'ownedFirestorePaths',
        'resourceClaimOwnership',
        'authUids',
        'storagePrefixes',
        'status',
        'createdAt',
        'updatedAt',
      ];
      const valid =
        Object.keys(d).every((k) => fields.includes(k)) &&
        d.projectId === 'ski-school-staging' &&
        [
          ['carve_academy_staging_v1', 1],
          ['carve_academy_staging_v2', 2],
        ].some(([id, v]) => d.fixtureId === id && d.version === v) &&
        row.path === `staging_fixture_manifests/${d.fixtureId}` &&
        d.status === 'active' &&
        Array.isArray(d.ownedFirestorePaths) &&
        d.ownedFirestorePaths.every(validExactPath) &&
        Array.isArray(d.resourceClaimOwnership) &&
        d.resourceClaimOwnership.every(
          (e) =>
            e &&
            Object.keys(e).every((k) => ['claimPath', 'guardPaths'].includes(k)) &&
            validExactPath(e.claimPath) &&
            Array.isArray(e.guardPaths) &&
            e.guardPaths.every(validExactPath)
        ) &&
        Array.isArray(d.authUids) &&
        d.authUids.every((id) => accounts.has(id)) &&
        Array.isArray(d.storagePrefixes) &&
        typeof d.createdAt === 'string' &&
        typeof d.updatedAt === 'string';
      if (!valid) {
        blockers.push(`Unknown fixture provenance: ${row.path}`);
        continue;
      }
      preserve.add(row.path);
      const ownedFirestorePaths = d.ownedFirestorePaths.filter((p) => !eligible.has(p));
      const resourceClaimOwnership = d.resourceClaimOwnership
        .filter((e) => !eligible.has(e.claimPath))
        .map((e) => ({ ...e, guardPaths: e.guardPaths.filter((p) => !eligible.has(p)) }));
      if (
        hash(ownedFirestorePaths) !== hash(d.ownedFirestorePaths) ||
        hash(resourceClaimOwnership) !== hash(d.resourceClaimOwnership)
      )
        patches.push({
          path: row.path,
          set: { ownedFirestorePaths, resourceClaimOwnership },
          reason: 'retain fixture identity/config ownership; remove reset operation ownership',
        });
      audit.push({
        path: row.path,
        sha256: row.hash,
        type: 'staging_seed_provenance',
        owner: d.authUids,
        decision: patches.some((p) => p.path === row.path) ? 'patch' : 'preserve',
      });
    } else if (kind === 'preserve-progress') {
      if (!knownActivity(row, byPath)) blockers.push(`Unknown retained progress: ${row.path}`);
      preserve.add(row.path);
    } else if (kind === 'delete' && !eligible.has(row.path)) {
      if (!knownActivity(row, byPath) && !knownProgressActivity(row, accounts))
        blockers.push(`Unclassified retained LIVE activity: ${row.path}`);
      else if (
        !['activity_logs', 'command_idempotency', 'resource_claims'].includes(
          row.path.split('/')[0]
        )
      )
        blockers.push(`Unowned retained LIVE operation: ${row.path}`);
      preserve.add(row.path);
    }
  }
  for (const path of eligible) {
    const row = byPath.get(path);
    if (
      row &&
      !path.startsWith('error_logs/') &&
      !knownActivity(row, byPath) &&
      !knownProgressActivity(row, accounts)
    )
      blockers.push(`Missing/unknown LIVE activity adapter: ${path}`);
  }
  return { eligible, preserve, patches, audit, blockers, roots: roots.map((r) => r.path) };
}
module.exports = { CONTRACT, assertFixtureTarget, fixtureOwnership, values };
