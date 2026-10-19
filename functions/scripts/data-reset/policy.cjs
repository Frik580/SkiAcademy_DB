'use strict';

// This is a path-shape allowlist, NOT a deletion list. Every actual target also
// needs an exact path/hash in the reviewed selection and ownership evidence.
const ACTIVITY = new Set([
  'bookings',
  'attendance',
  'course_enrollments',
  'booking_proposals',
  'booking_change_requests',
  'guest_contacts',
  'payments',
  'monetary_events',
  'provider_event_receipts',
  'resource_claims',
  'resource_claim_guards',
  'active_course_enrollment_guards',
  'booking_attendance_outcome_work',
  'course_enrollment_outcome_work',
  'guest_confirmation_reconciliation_work',
  'command_idempotency',
  'domain_outbox',
  'notifications',
  'admin_issues',
  'activity_logs',
  'participant_progress_events',
  'participant_lesson_feedback',
  'instructor_reviews',
  'instructor_lesson_revenue_contributions',
]);
const FULL = new Set([
  'participant_progress',
  'participant_achievements',
  'instructor_rating_summaries',
]);
const PRESERVE = new Set([
  'users',
  'participants',
  'instructors',
  'participant_management',
  'participant_management_active_owner',
  'participant_blocks',
  'instructor_relationships',
  'settings',
  'lesson_pricing_settings',
  'email_delivery_settings',
  'resort_data',
  'courses',
  'course_catalog_content',
  'administrative_availability_blocks',
  'test_actors',
  'test_actor_assignments',
  'test_sessions',
  'system_migrations',
  'system_data_resets',
  'admin_maintenance_events',
  'migration_control',
  'test_session_deletions',
]);
const REVIEW = new Set([
  'wallet_ledger',
  'reviews',
  'availability_slots',
  'availability_hour_locks',
  'function_idempotency',
  'guest_reservation_admission',
  'admin_runtime',
  'instructor_lesson_revenue',
  'course_chat_access',
  'homework',
  'error_logs',
  'staging_fixtures',
  'staging_fixture_manifests',
  'test_session_active_slots',
  'guest_confirmation_reconciliation_quarantine',
]);

function exactPath(path) {
  if (
    typeof path !== 'string' ||
    !/^[A-Za-z0-9_.:@()-]+(?:\/[A-Za-z0-9_.:@()-]+)+$/.test(path) ||
    path.split('/').length % 2 !== 0 ||
    path.split('/').some((s) => s === '.' || s === '..')
  ) {
    throw Error('BLOCKED: invalid/wildcard document path');
  }
  return path;
}

function category(path, mode) {
  exactPath(path);
  const parts = path.split('/');
  if (
    /^admin_runtime\/(admin_people|admin_courses|admin_finance|admin_planner|admin_lesson_bookings|admin_issue_inbox|admin_booking_change_requests)$/.test(
      path
    )
  )
    return 'projection';
  if (
    /^instructor_lesson_revenue\/(live|test_[A-Za-z0-9_-]+)(\/instructors\/[A-Za-z0-9_-]+)?$/.test(
      path
    ) ||
    path === 'instructor_lesson_revenue/state'
  )
    return 'projection';
  if (parts.length === 2) {
    if (ACTIVITY.has(parts[0])) return 'delete';
    if (FULL.has(parts[0])) return mode === 'full-test-reset' ? 'delete' : 'preserve-progress';
    if (PRESERVE.has(parts[0])) return 'preserve';
    if (REVIEW.has(parts[0])) return 'review';
  }
  if (parts.length === 4) {
    if (parts[0] === 'users' && parts[2] === 'wallet' && parts[3] === 'state') return 'wallet';
    if (parts[0] === 'bookings' && parts[2] === 'messages') return 'delete';
    if (parts[0] === 'courses' && parts[2] === 'days') return 'preserve';
    if (parts[0] === 'test_sessions' && ['membership', 'maintenance_manifests'].includes(parts[2]))
      return 'preserve';
    if (parts[0] === 'course_chat_access' && parts[2] === 'courses') return 'delete';
  }
  return 'unknown';
}

function assertTarget(projectId, databaseId, entrypoint) {
  if (!projectId || !databaseId || !/^[A-Za-z0-9_-]+$|^\(default\)$/.test(databaseId)) {
    throw Error('BLOCKED: explicit project ID and database ID required');
  }
  if (
    !['staging', 'production'].includes(entrypoint) ||
    (entrypoint === 'staging' &&
      projectId !== 'ski-school-staging' &&
      !/^demo-[a-z0-9-]+$/.test(projectId)) ||
    (entrypoint === 'production' && projectId !== 'ski-school-8f3ca')
  ) {
    throw Error('BLOCKED: project does not match entrypoint');
  }
}

function assertLocalMutation(target, db, env = process.env) {
  assertTarget(target.projectId, target.databaseId, target.entrypoint);
  // Deliberately no --force/--writers-isolated/production acknowledgement escape.
  // This guard is intentionally emulator-only (including local recovery).
  // The separate staging authorization adapter does not certify writer isolation.
  // Evidence files alone never authorize cloud writes through this local guard.
  if (target.entrypoint === 'production' || !target.projectId.startsWith('demo-')) {
    throw Error(
      'BLOCKED: cloud mutations disabled; writer isolation is unproven (production also requires backup/recovery and two approvals)'
    );
  }
  const host = env.FIRESTORE_EMULATOR_HOST;
  if (
    !/^127\.0\.0\.1:\d+$/.test(host ?? '') ||
    !/^127\.0\.0\.1:\d+$/.test(env.FIREBASE_AUTH_EMULATOR_HOST ?? '') ||
    !/^127\.0\.0\.1:\d+$/.test(env.FIREBASE_STORAGE_EMULATOR_HOST ?? '') ||
    (env.STORAGE_EMULATOR_HOST &&
      env.STORAGE_EMULATOR_HOST !== `http://${env.FIREBASE_STORAGE_EMULATOR_HOST}`) ||
    db.storageEndpoint !== `http://${env.FIREBASE_STORAGE_EMULATOR_HOST}` ||
    db.projectId !== target.projectId ||
    db.databaseId !== target.databaseId ||
    db.settingsHost !== host
  ) {
    throw Error('BLOCKED: verified loopback Firestore AND Auth emulator required');
  }
}

module.exports = {
  ACTIVITY,
  FULL,
  PRESERVE,
  REVIEW,
  exactPath,
  category,
  assertTarget,
  assertLocalMutation,
};
