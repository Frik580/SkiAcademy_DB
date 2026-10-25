// Read-only staging inventory. Never imports an Admin SDK or runs a mutation CLI.
/* global process, fetch, URLSearchParams, AbortSignal, URL, console */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';

const require = createRequire(import.meta.url);
const project = 'ski-school-staging';
const output = process.argv[2];
if (!output || process.argv.length !== 3)
  throw Error('Usage: node scripts/stagingAttendanceReadiness.mjs NEW_EVIDENCE_DIRECTORY');
fs.mkdirSync(output, { recursive: false }); // Refuse overwriting earlier evidence.
const write = (name, data) =>
  fs.writeFileSync(path.join(output, name + '.json'), JSON.stringify(data, null, 2));
const stable = (value) =>
  Array.isArray(value)
    ? value.map(stable)
    : value && typeof value === 'object'
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((key) => [key, stable(value[key])])
        )
      : value;
const hash = (value) =>
  createHash('sha256')
    .update(JSON.stringify(stable(value)))
    .digest('hex');
const result = {
  project,
  observedAt: new Date().toISOString(),
  requests: [],
  errors: [],
  manifests: {},
};
try {
  const auth = require('../node_modules/firebase-tools/lib/auth.js');
  const api = require('../node_modules/firebase-tools/lib/api.js');
  const account = auth.getGlobalDefaultAccount();
  if (!account?.tokens?.refresh_token) throw Error('Existing Firebase CLI account required');
  const refresh = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: account.tokens.refresh_token,
      client_id: api.clientId(),
      client_secret: api.clientSecret(),
    }),
    signal: AbortSignal.timeout(30000),
  });
  const token = await refresh.json();
  if (!refresh.ok || !token.access_token) throw Error('OAuth refresh failed');
  const base = `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents`;
  const permittedHosts = new Set([
    'firestore.googleapis.com',
    'cloudresourcemanager.googleapis.com',
    'cloudfunctions.googleapis.com',
    'cloudscheduler.googleapis.com',
    'eventarc.googleapis.com',
    'pubsub.googleapis.com',
    'run.googleapis.com',
    'firebaserules.googleapis.com',
    'iam.googleapis.com',
  ]);
  async function read(url, body) {
    const u = new URL(url);
    if (
      !permittedHosts.has(u.hostname) ||
      !new RegExp(`^/v[12]/projects/${project}(?:/|:|$)`).test(u.pathname) ||
      (body &&
        url !== base + ':runQuery' &&
        !/:(getIamPolicy|testIamPermissions)$/.test(u.pathname))
    )
      throw Error('Read-only staging URL guard');
    const response = await fetch(url, {
      method: body ? 'POST' : 'GET',
      headers: {
        Authorization: `Bearer ${token.access_token}`,
        'Content-Type': 'application/json',
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(45000),
    });
    const data = await response.json();
    result.requests.push({ url, http: response.status });
    if (!response.ok) throw Error(`${response.status} ${u.hostname}: ${data.error?.message}`);
    if (data.nextPageToken || data.unreachable?.length)
      throw Error('Incomplete inventory: ' + u.pathname);
    return data;
  }
  const identity = await read(`https://cloudresourcemanager.googleapis.com/v1/projects/${project}`);
  if (identity.projectId !== project || identity.projectNumber !== '1005648185457')
    throw Error('Project identity mismatch');
  write('project', identity);
  const docs = {};
  // One server readTime for every collection; raw REST Value types retained in hashes.
  for (const collection of [
    'bookings',
    'attendance',
    'booking_attendance_outcome_work',
    'payments',
    'monetary_events',
    'command_idempotency',
    'admin_issues',
    'system_migrations',
  ]) {
    const rows = await read(base + ':runQuery', {
      ...(result.readTime ? { readTime: result.readTime } : {}),
      structuredQuery: {
        from: [{ collectionId: collection }],
        orderBy: [{ field: { fieldPath: '__name__' }, direction: 'ASCENDING' }],
        limit: 501,
      },
    });
    if (!result.readTime) result.readTime = rows.at(-1)?.readTime;
    if (!result.readTime || rows.some((row) => row.error)) throw Error('Invalid snapshot response');
    docs[collection] = rows.filter((row) => row.document).map((row) => row.document);
    if (docs[collection].length >= 501) throw Error('501-row bound reached: ' + collection);
    result.manifests[collection] = {
      count: docs[collection].length,
      sha256: hash(docs[collection].map(({ name, fields }) => ({ name, fields }))),
      documents: docs[collection].map((doc) => ({
        id: doc.name.split('/').at(-1),
        updateTime: doc.updateTime,
        sha256: hash(doc.fields),
      })),
    };
  }
  write('snapshot', { project, observedAt: result.observedAt, readTime: result.readTime, docs });
  const decode = (value) => {
    if ('mapValue' in value)
      return Object.fromEntries(
        Object.entries(value.mapValue.fields || {}).map(([key, v]) => [key, decode(v)])
      );
    if ('arrayValue' in value) return (value.arrayValue.values || []).map(decode);
    if ('integerValue' in value) {
      const n = Number(value.integerValue);
      if (!Number.isSafeInteger(n)) throw Error('Unsafe integer');
      return n;
    }
    for (const key of ['stringValue', 'booleanValue', 'doubleValue', 'timestampValue'])
      if (key in value) return value[key];
    if ('nullValue' in value) return null;
    throw Error('Unsupported domain field type');
  };
  const payload = (doc) => decode({ mapValue: { fields: doc.fields || {} } });
  const shared = require('../functions/node_modules/@ski-academy/shared-domain');
  const { parseBooking } = require('../functions/lib/canonical/bookings/bookingStore.js');
  const { parseAttendance } = require('../functions/lib/canonical/bookings/attendanceStore.js');
  const {
    parseBookingAttendanceOutcomeWork: parseWork,
    bookingAttendanceOutcomeDueAt: dueAt,
  } = require('../functions/lib/canonical/bookings/bookingAttendanceOutcomeWork.js');
  const bookings = new Map(
    docs.bookings.map((doc) => [doc.name.split('/').at(-1), parseBooking(payload(doc))])
  );
  const facts = new Map(
    docs.attendance.map((doc) => [doc.name.split('/').at(-1), parseAttendance(payload(doc))])
  );
  for (const [id, booking] of bookings)
    if (!booking || booking.bookingId !== id) throw Error('Invalid Booking: ' + id);
  for (const [id, fact] of facts)
    if (!fact || fact.attendanceId !== id) throw Error('Invalid Attendance: ' + id);
  result.pending = [];
  result.stale = [];
  result.workStatuses = { complete: 0, pending: 0, blocked: 0 };
  for (const doc of docs.booking_attendance_outcome_work) {
    const id = doc.name.split('/').at(-1),
      work = parseWork(payload(doc)),
      booking = bookings.get(id);
    if (!work || !booking || work.bookingId !== id) throw Error('Invalid/orphan work: ' + id);
    const scope = shared.parsePersistedCanonicalScope(booking);
    shared.assertSameCanonicalScope(scope, work);
    if (
      work.occurrenceId !== booking.occurrence.occurrenceId ||
      work.sourceScheduleRevision !== booking.occurrence.scheduleRevision ||
      hash(work.sourceEndsAt) !== hash(booking.occurrence.interval.endsAt)
    )
      throw Error('Work occurrence mismatch: ' + id);
    result.workStatuses[work.status]++;
    if (
      work.sourceBookingRevision !== booking.revision ||
      work.sourceLifecycleStatus !== booking.lifecycle.status
    ) {
      if (
        work.status !== 'complete' ||
        work.completedReason !== 'lifecycle_ineligible' ||
        work.workRevision !== 1 ||
        booking.lifecycle.status !== 'cancelled' ||
        booking.revision !== 2 ||
        work.sourceBookingRevision !== 1 ||
        work.sourceLifecycleStatus !== 'pending'
      )
        throw Error('Unexpected stale work: ' + id);
      result.stale.push(id);
    }
    if (work.status === 'pending') {
      if (
        booking.lifecycle.status !== 'completed' ||
        booking.revision !== 2 ||
        work.workRevision !== 3 ||
        work.sourceBookingRevision !== 2 ||
        work.sourceLifecycleStatus !== 'completed' ||
        work.deadlineId !== 'instructor_window' ||
        work.attemptCount !== 0 ||
        hash(work.dueAt) !== hash(dueAt(booking, work.deadlineId))
      )
        throw Error('Pending baseline changed: ' + id);
      const participants = shared.frozenServiceParticipantIds(booking);
      if (!participants?.length) throw Error('Frozen participants missing: ' + id);
      for (const participantId of participants) {
        const factId = shared.attendanceIdFromBookingIdentity({
          strategyVersion: shared.ATTENDANCE_IDENTITY_STRATEGY_VERSION,
          subjectKind: 'booking',
          occurrenceId: booking.occurrence.occurrenceId,
          participantId,
        });
        const fact = facts.get(factId);
        if (
          !fact ||
          fact.subject.subjectKind !== 'booking' ||
          fact.subject.bookingId !== id ||
          fact.subject.occurrenceId !== booking.occurrence.occurrenceId ||
          fact.subject.participantId !== participantId
        )
          throw Error('Frozen Attendance missing/mismatched: ' + id);
        shared.assertSameCanonicalScope(scope, fact);
      }
      result.pending.push({
        id,
        frozenParticipants: participants.length,
        workRevision: work.workRevision,
      });
    }
  }
  result.marker =
    docs.system_migrations.find((doc) =>
      doc.name.endsWith('/booking_attendance_outcome_work_v1')
    ) ?? null;
  if (
    bookings.size !== docs.booking_attendance_outcome_work.length ||
    bookings.size !== 52 ||
    facts.size !== 85 ||
    result.pending.length !== 6 ||
    result.stale.length !== 10 ||
    result.workStatuses.complete !== 46 ||
    result.workStatuses.blocked !== 0 ||
    result.marker
  )
    throw Error('Expected migration baseline changed: STOP');
  const previous = JSON.parse(
    fs.readFileSync('.scratch/attendance-blockers/preflight.json', 'utf8')
  );
  result.previousComparison = Object.fromEntries(
    Object.entries(result.manifests).map(([key, manifest]) => [
      key,
      {
        previousObservedAt: previous.observedAt,
        identical: manifest.sha256 === previous.manifests[key]?.sha256,
      },
    ])
  );
  if (Object.values(result.previousComparison).some((row) => !row.identical))
    throw Error('Typed payload changed since prior evidence: STOP');
  const endpoints = {
    functions: `https://cloudfunctions.googleapis.com/v2/projects/${project}/locations/-/functions?pageSize=1000`,
    scheduler: `https://cloudscheduler.googleapis.com/v1/projects/${project}/locations/us-central1/jobs?pageSize=500`,
    triggers: `https://eventarc.googleapis.com/v1/projects/${project}/locations/-/triggers?pageSize=100`,
    subscriptions: `https://pubsub.googleapis.com/v1/projects/${project}/subscriptions?pageSize=1000`,
    iam: `https://cloudresourcemanager.googleapis.com/v1/projects/${project}:getIamPolicy`,
    accounts: `https://iam.googleapis.com/v1/projects/${project}/serviceAccounts?pageSize=100`,
    'rules-release': `https://firebaserules.googleapis.com/v1/projects/${project}/releases/cloud.firestore`,
  };
  for (const [key, url] of Object.entries(endpoints)) {
    try {
      // Eventarc uses v1 (unlike Functions/Run v2).
      const data = await read(
        url,
        key === 'iam' ? { options: { requestedPolicyVersion: 3 } } : undefined
      );
      write(key, data);
      if (key === 'rules-release')
        write('ruleset', await read('https://firebaserules.googleapis.com/v1/' + data.rulesetName));
      if (key === 'functions')
        for (const fn of data.functions || []) {
          const name = fn.name.split('/').at(-1);
          if (!/^(execute|scheduled|sync|resolve|deliver)/.test(name)) continue;
          const service = fn.serviceConfig?.service;
          if (!service) throw Error('Missing service: ' + name);
          write('service-' + name, await read('https://run.googleapis.com/v2/' + service));
          write(
            'policy-' + name,
            await read('https://run.googleapis.com/v2/' + service + ':getIamPolicy')
          );
        }
    } catch (error) {
      result.errors.push({ key, message: error.message });
    }
  }
  result.status = result.errors.length ? 'BLOCKED' : 'BASELINE_VERIFIED_FENCE_NOT_VERIFIED';
} catch (error) {
  result.errors.push({ message: error.message, cause: error.cause?.code });
  result.status = 'BLOCKED';
}
write('readiness', result);
console.log(
  JSON.stringify({
    status: result.status,
    readTime: result.readTime,
    counts: Object.fromEntries(Object.entries(result.manifests).map(([k, v]) => [k, v.count])),
    pending: result.pending,
    stale: result.stale,
    errors: result.errors,
  })
);
if (result.status === 'BLOCKED') process.exitCode = 1;
