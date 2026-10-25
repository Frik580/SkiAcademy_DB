'use strict';

const { FieldValue } = require('firebase-admin/firestore');
const { hash, stable } = require('./inventory.cjs');
const { exactPath, category, assertTarget } = require('./policy.cjs');
const { assertMutation, beginMutation } = require('./authorization.cjs');
const {
  ADAPTERS,
  projectionActions,
  knownLegacyLedger,
  assertCourseWindows,
} = require('./adapters.cjs');
const { objectName, storagePlan, verifyObjects } = require('./storage.cjs');
const { CONTRACT, fixtureOwnership } = require('./stagingFixtures.cjs');
const MARKER = 'system_migrations/booking_attendance_outcome_work_v1';
const VERSION = 4;
const MONEY_FIELDS = ['balanceUSD', 'walletBalances', 'pendingWalletCredit', 'lastRefundBookingId'];
const PROGRESS_FIELDS = [
  'level',
  'levelState',
  'skillScores',
  'skillComments',
  'completedTodayTaskIds',
  'completedTodayDate',
];

function strings(value, label) {
  if (
    !Array.isArray(value) ||
    value.some((v) => typeof v !== 'string' || !/^[A-Za-z0-9_-]+$/.test(v)) ||
    new Set(value).size !== value.length
  ) {
    throw Error(`BLOCKED: invalid ${label}`);
  }
  return [...value].sort();
}
function normalizeSelection(input) {
  if (
    !input ||
    Object.keys(input).some(
      (k) =>
        ![
          'accountIds',
          'participantIds',
          'testSessionIds',
          'documents',
          'storageObjects',
          'contract',
        ].includes(k)
    )
  )
    throw Error('BLOCKED: invalid selection');
  const result = {
    ...(input.contract === undefined ? {} : { contract: input.contract }),
    accountIds: strings(input.accountIds, 'accountIds'),
    participantIds: strings(input.participantIds, 'participantIds'),
    testSessionIds: strings(input.testSessionIds, 'testSessionIds'),
    storageObjects: (input.storageObjects ?? [])
      .map((o) => {
        if (
          Object.keys(o).some((k) => !['name', 'generation', 'sha256'].includes(k)) ||
          !/^\d+$/.test(o.generation) ||
          !/^[a-f0-9]{64}$/.test(o.sha256)
        )
          throw Error('BLOCKED: exact Storage generation/hash required');
        return { name: objectName(o.name), generation: o.generation, sha256: o.sha256 };
      })
      .sort((a, b) => a.name.localeCompare(b.name)),
    documents: (input.documents ?? [])
      .map((d) => {
        if (
          Object.keys(d).some((k) => !['path', 'sha256'].includes(k)) ||
          !/^[a-f0-9]{64}$/.test(d.sha256)
        )
          throw Error('BLOCKED: document hash required');
        return { path: exactPath(d.path), sha256: d.sha256 };
      })
      .sort((a, b) => a.path.localeCompare(b.path)),
  };
  if (
    !result.accountIds.length ||
    (!result.testSessionIds.length && result.contract !== CONTRACT) ||
    (result.contract !== undefined && result.contract !== CONTRACT) ||
    (result.contract === CONTRACT && result.testSessionIds.length !== 0) ||
    new Set(result.documents.map((d) => d.path)).size !== result.documents.length
  )
    throw Error('BLOCKED: explicit accounts/sessions and unique paths required');
  return result;
}

// Inspect values AND map keys, including fully qualified Firestore references.
// Conservative collisions block the plan; this is not a fuzzy deletion matcher.
function references(value, output = new Set()) {
  if (typeof value === 'string') {
    output.add(value);
    output.add(
      (value.includes('/documents/') ? value.split('/documents/').at(-1) : value).replace(
        /^\/+/,
        ''
      )
    );
    output.add(value.split('/').at(-1));
  } else if (value?.constructor?.name === 'DocumentReference') {
    output.add(value.path);
    output.add(value.id);
  } else if (Array.isArray(value)) value.forEach((v) => references(v, output));
  else if (
    value &&
    typeof value === 'object' &&
    Object.getPrototypeOf(value) === Object.prototype
  ) {
    for (const [k, v] of Object.entries(value)) {
      output.add(k);
      references(v, output);
    }
  }
  return output;
}

function applyDelta(data, action) {
  const result = { ...data };
  for (const key of action.remove ?? []) delete result[key];
  Object.assign(result, action.set ?? {});
  return result;
}
// Canonical audit command IDs are historical attribution, not live document FKs.
// Keep their original values in retained identities/config; the recovery export
// retains the removed command history. Do not exempt actual subject/source IDs.
function runtimeReferences(value, output = new Set()) {
  if (Array.isArray(value)) value.forEach((v) => runtimeReferences(v, output));
  else if (
    value &&
    typeof value === 'object' &&
    Object.getPrototypeOf(value) === Object.prototype
  ) {
    for (const [key, data] of Object.entries(value))
      if (!['createdByCommandId', 'lastChangedByCommandId', 'correlationId'].includes(key)) {
        output.add(key);
        runtimeReferences(data, output);
      }
  } else references(value, output);
  return output;
}

function buildManifest(snapshot, input) {
  assertTarget(input.target.projectId, input.target.databaseId, input.target.entrypoint);
  if (!['activity-reset', 'full-test-reset'].includes(input.mode) || !snapshot.complete)
    throw Error('BLOCKED: invalid mode/incomplete inventory');
  const selection = normalizeSelection(input.selection);
  const fixture =
    selection.contract === CONTRACT
      ? fixtureOwnership(snapshot, selection, input.target, input.mode)
      : undefined;
  const createdAt = input.createdAt ?? new Date().toISOString();
  if (Number.isNaN(Date.parse(createdAt))) throw Error('BLOCKED: invalid manifest time');
  const byPath = new Map(snapshot.rows.map((r) => [r.path, r]));
  if (byPath.size !== snapshot.rows.length || snapshot.rows.some((r) => hash(r.data) !== r.hash))
    throw Error('BLOCKED: invalid inventory');
  const blockers = [...(fixture?.blockers ?? [])];
  const actions = [];
  const selected = new Map(selection.documents.map((d) => [d.path, d.sha256]));
  const hasSession = (data) =>
    fixture
      ? data.dataScope === 'live' && data.testSessionId === undefined
      : data.dataScope === 'test' && selection.testSessionIds.includes(data.testSessionId);
  const testAccount = (id) => {
    const data = byPath.get(`users/${id}`)?.data;
    if (fixture)
      return (
        selection.accountIds.includes(id) &&
        data?.dataScope === 'live' &&
        data.accountId === id &&
        data.testSessionId === undefined &&
        (data.uid === undefined || data.uid === id)
      );
    if (
      !data ||
      data.dataScope !== 'test' ||
      data.accountId !== id ||
      (data.uid !== undefined && data.uid !== id)
    )
      return false;
    if (data.testSessionId !== undefined)
      return selection.testSessionIds.includes(data.testSessionId);
    const actor = byPath.get(`test_actors/${id}`)?.data;
    const assignment = byPath.get(`test_actor_assignments/${id}`)?.data;
    return (
      actor?.dataScope === 'test' &&
      actor.allowed === true &&
      actor.accountId === id &&
      assignment?.accountId === id &&
      selection.testSessionIds.includes(assignment.activeTestSessionId)
    );
  };
  for (const id of selection.accountIds) {
    if (!byPath.has(`users/${id}`) || !snapshot.auth.some((u) => u.uid === id))
      blockers.push(`Missing Account/Auth: ${id}`);
    if (!testAccount(id)) blockers.push(`Unproven TEST Account ownership: users/${id}`);
  }
  for (const id of selection.testSessionIds)
    if (!byPath.has(`test_sessions/${id}`)) blockers.push(`Missing Test Session: ${id}`);
  for (const id of selection.participantIds) {
    const owners = snapshot.rows.filter(
      (r) =>
        r.path.startsWith('participant_management/') &&
        r.data.participantId === id &&
        r.data.role === 'owner' &&
        r.data.status === 'active'
    );
    if (
      !byPath.has(`participants/${id}`) ||
      (fixture
        ? !(
            owners.some((o) => selection.accountIds.includes(o.data.accountId)) ||
            fixture.roots.some((path) => references(byPath.get(path).data).has(id))
          )
        : owners.length !== 1 || !selection.accountIds.includes(owners[0]?.data.accountId))
    )
      blockers.push(`Unproven Participant owner: ${id}`);
  }
  // A session-wide reset cannot silently reset another account in the session.
  for (const row of snapshot.rows) {
    if (
      row.path.startsWith('test_actor_assignments/') &&
      selection.testSessionIds.includes(row.data.activeTestSessionId) &&
      !selection.accountIds.includes(row.data.accountId ?? row.path.split('/')[1])
    )
      blockers.push(`Foreign session member: ${row.path}`);
    if (
      row.path.startsWith('test_sessions/') &&
      row.path.split('/').length === 2 &&
      selection.testSessionIds.includes(row.path.split('/')[1]) &&
      !['closed', 'locked', 'failed'].includes(row.data.status)
    )
      blockers.push(`Session must be closed/locked: ${row.path}`);
  }
  function scoped(row) {
    if (fixture) return fixture.eligible.has(row.path);
    if (hasSession(row.data)) return true;
    // Only verified source-linked projections and a known child message may
    // inherit ownership. Never inherit a contradictory LIVE/foreign scope.
    if (row.data.dataScope !== undefined || row.data.testSessionId !== undefined) return false;
    const parts = row.path.split('/');
    let source;
    if (parts.length === 4 && parts[0] === 'bookings' && parts[2] === 'messages')
      source = parts.slice(0, 2).join('/');
    if (parts[0] === 'guest_confirmation_reconciliation_work') source = row.data.subjectPath;
    if (parts[0] === 'instructor_lesson_revenue_contributions') source = `bookings/${parts[1]}`;
    return (
      typeof source === 'string' &&
      selected.has(source) &&
      hasSession(byPath.get(source)?.data ?? {})
    );
  }
  for (const [path, sha256] of selected) {
    const row = byPath.get(path);
    if (!row || row.hash !== sha256) {
      blockers.push(`Missing/stale selected document: ${path}`);
      continue;
    }
    if (
      (category(path, input.mode) !== 'delete' &&
        !knownLegacyLedger(row, selection) &&
        !fixture?.eligible.has(path)) ||
      !scoped(row)
    ) {
      blockers.push(`Path/scope not authorized: ${path}`);
      continue;
    }
    // Ownership fields are not actor/audit fields; reject cross-account money,
    // party and Participant ownership even if a document claims TEST scope.
    const check = (value) => {
      if (!value || typeof value !== 'object') return;
      for (const [key, v] of Object.entries(value)) {
        if (
          [
            'accountId',
            'payerAccountId',
            'walletAccountId',
            'ownerAccountId',
            'recipientAccountId',
            'payerAccountIdAtEvent',
            'refundAccountIdAtEvent',
            'userId',
          ].includes(key) &&
          typeof v === 'string' &&
          !selection.accountIds.includes(v)
        )
          blockers.push(`Foreign ${key}: ${path}`);
        if (['participantId', 'participantIds', 'homeworkForParticipantIds'].includes(key)) {
          for (const p of Array.isArray(v) ? v : [v])
            if (typeof p === 'string' && !selection.participantIds.includes(p))
              blockers.push(`Foreign Participant: ${path}`);
        }
        if (v && typeof v === 'object' && !['audit', 'actor'].includes(key)) check(v);
      }
    };
    check(row.data);
    actions.push({
      path,
      kind: 'delete',
      ...(fixture && path.startsWith('instructor_lesson_revenue_contributions/')
        ? { phase: -1 }
        : {}),
      beforeHash: row.hash,
      afterHash: null,
      reason: 'explicit reviewed path + verified test ownership',
    });
  }
  for (const row of snapshot.rows) {
    const kind =
      fixture?.preserve.has(row.path) || fixture?.patches.some((p) => p.path === row.path)
        ? 'preserve'
        : fixture?.eligible.has(row.path)
          ? 'delete'
          : category(row.path, input.mode);
    if (kind === 'unknown' || (kind === 'review' && !knownLegacyLedger(row, selection)))
      blockers.push(`Unclassified dependency (adapter required): ${row.path}`);
    if (knownLegacyLedger(row, selection) && !selected.has(row.path))
      blockers.push(`Unselected legacy dependency: ${row.path}`);
    if (
      row.path.startsWith('system_data_resets/') &&
      (!/^[a-f0-9]{64}$/.test(row.path.split('/')[1]) ||
        row.data.manifestHash !== row.path.split('/')[1] ||
        !Number.isSafeInteger(row.data.appliedCount) ||
        row.data.appliedCount < 0 ||
        !['running', 'verified', 'bootstrapped'].includes(row.data.status))
    )
      blockers.push(`Invalid retained reset journal: ${row.path}`);
    if (row.path.startsWith('system_data_resets/') && row.data.status === 'running')
      blockers.push(`Resume unfinished reset first: ${row.path}`);
    if (
      (fixture ? fixture.eligible.has(row.path) : hasSession(row.data) && kind === 'delete') &&
      !selected.has(row.path)
    )
      blockers.push(`Unselected session dependency: ${row.path}`);
    if (kind === 'wallet' && selection.accountIds.includes(row.path.split('/')[1])) {
      const wallet = row.data;
      if (
        !testAccount(wallet.accountId) ||
        !hasSession(wallet) ||
        wallet.accountId !== row.path.split('/')[1] ||
        wallet.currency !== 'KZT' ||
        !Number.isSafeInteger(wallet.balance) ||
        wallet.balance < 0 ||
        !Number.isSafeInteger(wallet.revision) ||
        wallet.revision < 1 ||
        wallet.revision >= Number.MAX_SAFE_INTEGER ||
        !Number.isSafeInteger(wallet.eventRevision) ||
        wallet.eventRevision < 0
      ) {
        blockers.push(`Unproven canonical wallet: ${row.path}`);
        continue;
      }
      if (wallet.balance === 0 && wallet.eventRevision === 0) continue;
      const set = { balance: 0, eventRevision: 0, revision: wallet.revision + 1 };
      actions.push({
        path: row.path,
        kind: 'patch',
        set,
        remove: [],
        beforeHash: row.hash,
        afterHash: hash({ ...wallet, ...set }),
        reason: 'empty KZT wallet epoch; events removed under isolation',
      });
    }
    if (
      row.path.split('/').length === 2 &&
      row.path.startsWith('users/') &&
      selection.accountIds.includes(row.path.split('/')[1])
    ) {
      if (!testAccount(row.path.split('/')[1])) continue;
      const remove = [
        ...MONEY_FIELDS,
        'dismissedReviewIds',
        ...(input.mode === 'full-test-reset' ? PROGRESS_FIELDS : []),
      ].filter((k) => Object.hasOwn(row.data, k));
      const set = {};
      if (input.mode === 'full-test-reset' && row.data.participantTodayChecklists) {
        const entries = { ...row.data.participantTodayChecklists };
        for (const id of selection.participantIds)
          if (entries[id]) {
            entries[id] = { ...entries[id] };
            delete entries[id].completedTodayTaskIds;
            delete entries[id].completedTodayDate;
          }
        if (hash(entries) !== hash(row.data.participantTodayChecklists))
          set.participantTodayChecklists = entries;
      }
      if (remove.length || Object.keys(set).length) {
        const action = {
          path: row.path,
          kind: 'patch',
          remove,
          set,
          beforeHash: row.hash,
          reason: 'remove derived fields; preserve identity/roles/configuration',
        };
        actions.push({ ...action, afterHash: hash(applyDelta(row.data, action)) });
      }
    }
    if (
      input.mode === 'full-test-reset' &&
      row.path === MARKER &&
      !snapshot.rows.some(
        (r) =>
          [
            'bookings',
            'attendance',
            'booking_attendance_outcome_work',
            'course_enrollments',
            'course_enrollment_outcome_work',
            'payments',
            'domain_outbox',
            'guest_confirmation_reconciliation_work',
          ].includes(r.path.split('/')[0]) && !selected.has(r.path)
      )
    )
      actions.push({
        path: MARKER,
        kind: 'delete',
        beforeHash: row.hash,
        afterHash: null,
        reason:
          'invalidate old marker for empty database only; separate guarded bootstrap required',
      });
  }
  for (const patch of fixture?.patches ?? []) {
    const row = byPath.get(patch.path);
    const action = { ...patch, kind: 'patch', phase: 1, remove: [], beforeHash: row.hash };
    actions.push({ ...action, afterHash: hash(applyDelta(row.data, action)) });
  }
  // Fixed-identity projections reuse an Account/Participant/Instructor/Booking ID.
  // Removing a projection never removes that identity. Match full projection
  // paths, but do not mistake preserved participantId for a dangling progress ID.
  const reusedIdentity = new Set([
    'participant_progress',
    'participant_achievements',
    'instructor_rating_summaries',
    'booking_attendance_outcome_work',
    'course_enrollment_outcome_work',
    'instructor_lesson_revenue_contributions',
    'course_chat_access',
  ]);
  const deleted = new Set(
    actions
      .filter((a) => a.kind === 'delete')
      .flatMap((a) =>
        reusedIdentity.has(a.path.split('/')[0]) ? [a.path] : [a.path, a.path.split('/').at(-1)]
      )
  );
  for (const row of snapshot.rows) {
    const action = actions.find((a) => a.path === row.path);
    if (action?.kind === 'delete') continue;
    if (actions.some((a) => a.kind === 'delete' && row.path.startsWith(a.path + '/')))
      blockers.push(`Unselected descendant of deleted document: ${row.path}`);
    const refs = fixture
      ? runtimeReferences(action ? applyDelta(row.data, action) : row.data)
      : references(action ? applyDelta(row.data, action) : row.data);
    if ([...refs].some((ref) => deleted.has(ref)))
      blockers.push(`Retained orphan reference: ${row.path}`);
    // A wallet cannot be zeroed while keeping any monetary event for its owner.
    if (
      row.path.startsWith('monetary_events/') &&
      selection.accountIds.includes(row.data.walletAccountId)
    )
      blockers.push(`Retained wallet event: ${row.path}`);
  }
  const now = {
    seconds: Math.floor(Date.parse(createdAt) / 1000),
    nanoseconds: (Date.parse(createdAt) % 1000) * 1000000,
  };
  actions.push(...projectionActions(snapshot, actions, now, blockers));
  const storage = storagePlan(snapshot, selection, actions, input.target, blockers);
  const inventory = snapshot.rows.map((r) => ({
    path: r.path,
    sha256: r.hash,
    updateTime: r.updateTime,
    category: category(r.path, input.mode),
  }));
  const collections = {};
  for (const row of inventory)
    (collections[row.path.split('/').slice(0, -1).join('/')] ??= []).push({
      path: row.path,
      sha256: row.sha256,
    });
  actions.sort(
    (a, b) =>
      (a.phase ?? 0) - (b.phase ?? 0) ||
      b.path.split('/').length - a.path.split('/').length ||
      a.path.localeCompare(b.path)
  );
  const manifest = {
    version: VERSION,
    adapters: ADAPTERS,
    ...(fixture ? { fixtureClassification: fixture.audit } : {}),
    target: input.target,
    mode: input.mode,
    selection,
    createdAt,
    expiresAt: new Date(Date.parse(createdAt) + 60 * 60 * 1000).toISOString(),
    inventory,
    ghosts: snapshot.ghosts,
    auth: snapshot.auth,
    storage,
    collections: Object.fromEntries(
      Object.entries(collections).map(([k, rows]) => [
        k,
        { count: rows.length, sha256: hash(rows) },
      ])
    ),
    actions,
    counts: {
      scanned: inventory.length,
      delete: actions.filter((a) => a.kind === 'delete').length,
      patch: actions.filter((a) => a.kind === 'patch').length,
      auth: snapshot.auth.length,
    },
    blockers: [...new Set(blockers)].sort(),
    cloudApply:
      'STAGING ONLY: verified ADC + interactive owner approval + transactional lease required; external writers not excluded',
  };
  return { ...manifest, sha256: hash(manifest) };
}

function assertManifest(manifest, confirmation) {
  const { sha256, ...body } = manifest;
  if (
    manifest.version !== VERSION ||
    hash(manifest.adapters) !== hash(ADAPTERS) ||
    sha256 !== hash(body) ||
    confirmation !== sha256
  )
    throw Error('BLOCKED: exact reviewed manifest hash required');
  if (manifest.blockers.length) throw Error('BLOCKED: unresolved manifest dependencies');
  return `system_data_resets/${sha256}`;
}

// Document updateTime is the exact commit revision. ServerTimestamp transforms
// have different precision and must not be treated as that revision. The journal
// and targets commit together; until the next journal write its updateTime is
// therefore the durable revision of the latest batch's changed targets.
function checkpointRevisions(snapshot) {
  const job = snapshot.data();
  const revisions = { ...(job?.appliedRevisions ?? {}) };
  const pending = job?.pendingRevisionPaths ?? [];
  if (!Array.isArray(pending) || pending.some((path) => typeof path !== 'string'))
    throw Error('BLOCKED: invalid revision checkpoint');
  for (const path of pending) revisions[path] = snapshot.updateTime;
  return revisions;
}

function verifySnapshot(
  snapshot,
  manifest,
  appliedCount,
  jobPath,
  allowMarker = false,
  storageCount = 0,
  pendingStorage,
  appliedRevisions = {},
  requireRevisions = false
) {
  if (!snapshot.complete) throw Error('BLOCKED: incomplete verification inventory');
  verifyObjects(snapshot.storage, manifest.storage, storageCount, pendingStorage);
  const expected = new Map(manifest.inventory.map((r) => [r.path, r.sha256]));
  for (const action of manifest.actions.slice(0, appliedCount)) {
    if (action.afterHash === null) expected.delete(action.path);
    else expected.set(action.path, action.afterHash);
  }
  const actual = new Map(
    snapshot.rows
      .filter((r) => r.path !== jobPath && !(allowMarker && r.path === MARKER))
      .map((r) => [r.path, r.hash])
  );
  if (allowMarker) expected.delete(MARKER);
  if (
    hash([...expected].sort()) !== hash([...actual].sort()) ||
    hash(snapshot.auth) !== hash(manifest.auth)
  )
    throw Error('BLOCKED: inventory/Auth drift or orphan records; keep writers isolated');
  const touched = new Set(manifest.actions.slice(0, appliedCount).map((a) => a.path));
  const revisions = new Map(
    manifest.inventory
      .filter((row) => !touched.has(row.path))
      .map((row) => [row.path, row.updateTime])
  );
  for (const action of manifest.actions.slice(0, appliedCount)) {
    if (action.afterHash === null) continue;
    const time = appliedRevisions[action.path];
    if (requireRevisions && !time) throw Error('BLOCKED: missing checkpoint revision');
    if (time) revisions.set(action.path, `${time.seconds}:${time.nanoseconds}`);
  }
  if (allowMarker) revisions.delete(MARKER);
  for (const row of snapshot.rows) {
    if (revisions.has(row.path) && revisions.get(row.path) !== row.updateTime)
      throw Error(
        `BLOCKED: document revision drift ${hash(row.path)} expected=${revisions.get(row.path)} actual=${row.updateTime}`
      );
  }
  // Missing ancestors may disappear after their last child is deleted; emulator
  // metadata may also retain a deleted path. Neither is a new live dependency.
  // Every extant descendant is still checked in the exact document inventory.
  const allowedGhosts = new Set([
    ...manifest.ghosts,
    ...manifest.actions
      .slice(0, appliedCount)
      .filter((action) => action.kind === 'delete')
      .map((action) => action.path),
  ]);
  // A manifested nested create can introduce a missing parent (for example a
  // revenue scope parent). Only ancestors of exact expected documents qualify.
  if (
    snapshot.ghosts.some(
      (path) =>
        !allowedGhosts.has(path) && ![...expected.keys()].some((key) => key.startsWith(path + '/'))
    )
  )
    throw Error('BLOCKED: new or changed dependency ancestors');
}

async function executeReset(ports, manifest, confirmation, options = {}) {
  beginMutation(ports, manifest, 'reset');
  const jobPath = assertManifest(manifest, confirmation);
  await ports.assertIsolated();
  const jobRef = ports.db.doc(jobPath);
  let jobSnapshot = await jobRef.get();
  let job = jobSnapshot.data();
  if (!job) {
    assertCourseWindows(manifest);
    if (Date.now() > Date.parse(manifest.expiresAt))
      throw Error('BLOCKED: manifest expired; preview again');
    const fresh = await ports.scan();
    const rebuilt = buildManifest(fresh, manifest);
    if (rebuilt.sha256 !== manifest.sha256) throw Error('BLOCKED: stale manifest; preview again');
    await ports.db.runTransaction(async (tx) => {
      const existing = await tx.get(jobRef);
      if (existing.exists) throw Error('BLOCKED: reset already started; resume');
      assertCourseWindows(manifest, Math.max(Date.now(), existing.readTime.toMillis()));
      tx.create(jobRef, {
        manifestHash: manifest.sha256,
        appliedCount: 0,
        status: 'running',
        mode: manifest.mode,
        storageCount: 0,
        appliedRevisions: {},
        pendingRevisionPaths: [],
      });
    });
    jobSnapshot = await jobRef.get();
    job = jobSnapshot.data();
  }
  if (
    job.manifestHash !== manifest.sha256 ||
    !Number.isSafeInteger(job.appliedCount) ||
    job.appliedCount < 0 ||
    job.appliedCount > manifest.actions.length ||
    !['running', 'verified', 'bootstrapped'].includes(job.status)
  )
    throw Error('BLOCKED: invalid resume journal');
  if (
    !Number.isSafeInteger(job.storageCount) ||
    job.storageCount < 0 ||
    job.storageCount > manifest.storage.deletions.length ||
    (job.pendingStorage &&
      hash(job.pendingStorage) !== hash(manifest.storage.deletions[job.storageCount]))
  )
    throw Error('BLOCKED: invalid Storage checkpoint');
  verifySnapshot(
    await ports.scan(),
    manifest,
    job.appliedCount,
    jobPath,
    job.status === 'bootstrapped',
    job.storageCount,
    job.pendingStorage,
    checkpointRevisions(jobSnapshot),
    Boolean(ports.authorization)
  );
  if (job.status === 'bootstrapped') {
    const marker = await ports.db.doc(MARKER).get();
    if (
      marker.get('status') !== 'ready' ||
      marker.get('verifiedBookings') !== 0 ||
      marker.get('verifiedWorks') !== 0
    )
      throw Error('BLOCKED: bootstrap marker drift');
  }
  if (job.status !== 'running') return { status: job.status, applied: job.appliedCount };
  assertCourseWindows(manifest);
  const batchSize = ports.authorization ? 100 : 1;
  for (let index = job.appliedCount; index < manifest.actions.length; index += batchSize) {
    await ports.assertIsolated();
    const actions = manifest.actions.slice(index, index + batchSize);
    for (const action of actions) await options.beforeStep?.(action);
    if (ports.authorization) {
      const checkpoint = await jobRef.get();
      verifySnapshot(
        await ports.scan(),
        manifest,
        index,
        jobPath,
        false,
        0,
        undefined,
        checkpointRevisions(checkpoint),
        true
      );
      await ports.assertIsolated();
    }
    await ports.db.runTransaction(async (tx) => {
      assertMutation(ports, manifest, 'reset');
      const [currentJob, ...documents] = await tx.getAll(
        jobRef,
        ...actions.map((a) => ports.db.doc(a.path))
      );
      if (
        currentJob.get('manifestHash') !== manifest.sha256 ||
        currentJob.get('appliedCount') !== index ||
        currentJob.get('status') !== 'running'
      )
        throw Error('BLOCKED: concurrent writer/reset or stale checkpoint');
      assertCourseWindows(manifest, Math.max(Date.now(), currentJob.readTime.toMillis()));
      const appliedRevisions = checkpointRevisions(currentJob);
      const pendingRevisionPaths = [];
      for (let ordinal = 0; ordinal < actions.length; ordinal++) {
        const action = actions[ordinal],
          current = documents[ordinal];
        const original = manifest.inventory.find((row) => row.path === action.path);
        if (
          action.beforeHash === null
            ? current.exists
            : !current.exists ||
              hash(current.data()) !== action.beforeHash ||
              `${current.updateTime.seconds}:${current.updateTime.nanoseconds}` !==
                original?.updateTime
        )
          throw Error('BLOCKED: concurrent writer/reset or stale target');
        if (action.kind === 'delete') tx.delete(current.ref);
        else if (action.kind === 'create') tx.create(current.ref, action.set);
        else {
          const patch = { ...action.set };
          for (const key of action.remove) patch[key] = FieldValue.delete();
          tx.update(current.ref, patch);
        }
        if (action.kind !== 'delete') pendingRevisionPaths.push(action.path);
      }
      // Target mutation and checkpoint commit atomically; a lost response is
      // recovered from this journal, never inferred from an absent document.
      tx.update(jobRef, {
        appliedCount: index + actions.length,
        appliedRevisions,
        pendingRevisionPaths,
      });
    });
    await options.afterStep?.(index + actions.length); // Fault injection is only an in-process test seam.
  }
  for (let index = job.storageCount; index < manifest.storage.deletions.length; index++) {
    assertCourseWindows(manifest);
    await ports.assertIsolated();
    const object = manifest.storage.deletions[index];
    const currentSnapshot = await jobRef.get();
    const current = currentSnapshot.data();
    verifySnapshot(
      await ports.scan(),
      manifest,
      manifest.actions.length,
      jobPath,
      false,
      index,
      current.pendingStorage,
      checkpointRevisions(currentSnapshot)
    );
    await ports.db.runTransaction(async (tx) => {
      const state = await tx.get(jobRef);
      assertCourseWindows(manifest, Math.max(Date.now(), state.readTime.toMillis()));
      if (
        state.get('appliedCount') !== manifest.actions.length ||
        state.get('storageCount') !== index ||
        state.get('status') !== 'running'
      )
        throw Error('BLOCKED: concurrent Storage reset');
      tx.update(jobRef, {
        pendingStorage: object,
        appliedRevisions: checkpointRevisions(state),
        pendingRevisionPaths: [],
      });
    });
    await ports.storage.deleteExact(object); // generation precondition; never a prefix delete
    await options.afterStorageDelete?.(index + 1);
    await ports.db.runTransaction(async (tx) => {
      const state = await tx.get(jobRef);
      if (state.get('storageCount') !== index || hash(state.get('pendingStorage')) !== hash(object))
        throw Error('BLOCKED: Storage checkpoint changed');
      tx.update(jobRef, { storageCount: index + 1, pendingStorage: FieldValue.delete() });
    });
  }
  await ports.assertIsolated();
  assertCourseWindows(manifest);
  const finalJob = await jobRef.get();
  verifySnapshot(
    await ports.scan(),
    manifest,
    manifest.actions.length,
    jobPath,
    false,
    manifest.storage.deletions.length,
    undefined,
    checkpointRevisions(finalJob),
    Boolean(ports.authorization)
  );
  await ports.db.runTransaction(async (tx) => {
    const state = await tx.get(jobRef);
    assertCourseWindows(manifest, Math.max(Date.now(), state.readTime.toMillis()));
    if (
      state.get('appliedCount') !== manifest.actions.length ||
      state.get('storageCount') !== manifest.storage.deletions.length ||
      state.get('pendingStorage')
    )
      throw Error('BLOCKED: incomplete final checkpoint');
    tx.update(jobRef, {
      status: 'verified',
      appliedRevisions: checkpointRevisions(state),
      pendingRevisionPaths: [],
    });
  });
  return { status: 'verified', applied: manifest.actions.length };
}

async function bootstrapEmptyAttendance(ports, manifest, confirmation) {
  beginMutation(ports, manifest, 'bootstrap');
  const jobPath = assertManifest(manifest, confirmation);
  if (manifest.mode !== 'full-test-reset')
    throw Error('BLOCKED: empty bootstrap requires full-test-reset');
  await ports.assertIsolated();
  const jobSnapshot = await ports.db.doc(jobPath).get();
  const job = jobSnapshot.data();
  if (
    !job ||
    !['verified', 'bootstrapped'].includes(job.status) ||
    job.appliedCount !== manifest.actions.length
  )
    throw Error('BLOCKED: reset verifier not complete');
  const snapshot = await ports.scan();
  if (job.storageCount !== manifest.storage.deletions.length || job.pendingStorage)
    throw Error('BLOCKED: Storage cleanup not complete');
  verifySnapshot(
    snapshot,
    manifest,
    manifest.actions.length,
    jobPath,
    true,
    job.storageCount,
    undefined,
    checkpointRevisions(jobSnapshot),
    Boolean(ports.authorization)
  );
  const active = new Set([
    'bookings',
    'attendance',
    'booking_attendance_outcome_work',
    'course_enrollments',
    'course_enrollment_outcome_work',
    'payments',
    'domain_outbox',
    'guest_confirmation_reconciliation_work',
  ]);
  if (snapshot.rows.some((r) => active.has(r.path.split('/')[0])))
    throw Error('BLOCKED: database not empty of Booking/Attendance/work/operations');
  // Existing guard transactionally verifies 0 Booking AND 0 work and writes ready.
  const {
    markLessonBookingAttendanceOutcomeWorkMigrationReady,
  } = require('../../lib/canonical/bookings/bookingAttendanceOutcomeWorkSync.js');
  await markLessonBookingAttendanceOutcomeWorkMigrationReady(ports.db, new Date(), {
    scannedBookings: 0,
    truncated: false,
    outcomes: { created: 0, updated: 0, unchanged: 0, deleted: 0, blocked: 0 },
  });
  const {
    isLessonBookingAttendanceOutcomeWorkMigrationReady,
  } = require('../../lib/canonical/bookings/bookingAttendanceOutcomeWorkSync.js');
  // Verification must not execute the scheduler: a concurrent writer could
  // otherwise turn a bootstrap check into unapproved Attendance mutations.
  if (!(await isLessonBookingAttendanceOutcomeWorkMigrationReady(ports.db)))
    throw Error('BLOCKED: bootstrap verification failed; preserve fence');
  verifySnapshot(
    await ports.scan(),
    manifest,
    manifest.actions.length,
    jobPath,
    true,
    job.storageCount,
    undefined,
    checkpointRevisions(jobSnapshot),
    Boolean(ports.authorization)
  );
  await ports.assertIsolated();
  await ports.db.runTransaction(async (tx) => {
    const state = await tx.get(ports.db.doc(jobPath));
    if (
      state.get('manifestHash') !== manifest.sha256 ||
      !['verified', 'bootstrapped'].includes(state.get('status')) ||
      state.get('appliedCount') !== manifest.actions.length
    )
      throw Error('BLOCKED: bootstrap checkpoint changed');
    tx.update(state.ref, { status: 'bootstrapped' });
  });
  return { status: 'bootstrapped', candidateSource: 'projection' };
}

module.exports = {
  MARKER,
  VERSION,
  buildManifest,
  assertManifest,
  checkpointRevisions,
  executeReset,
  bootstrapEmptyAttendance,
  verifySnapshot,
  references,
  applyDelta,
  stable,
};
