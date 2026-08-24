import { AUDIT_CARDINALITY_LIMITS } from '../auditOutbox';
import type { TransactionPlanCategory } from './planCategories';
import {
  planAuditOutboxContributions,
  TransactionPlanBuilder,
  type TransactionPlan,
} from './transactionPlan';

const DEFAULT_DOCUMENT_BYTES = 2048;
const DEFAULT_GUARD_MUTATION_BYTES = 1024;

function planRepeatedReads(
  builder: TransactionPlanBuilder,
  count: number,
  pathPrefix: string,
  category: TransactionPlanCategory
): void {
  for (let index = 0; index < count; index += 1) {
    builder.planRead({
      path: `${pathPrefix}/read_${index}`,
      category,
    });
  }
}

function planRepeatedMutations(
  builder: TransactionPlanBuilder,
  count: number,
  pathPrefix: string,
  category: TransactionPlanCategory,
  estimatedPayloadBytes = DEFAULT_DOCUMENT_BYTES
): void {
  for (let index = 0; index < count; index += 1) {
    builder.planMutation({
      path: `${pathPrefix}/mutation_${index}`,
      kind: 'create',
      category,
      estimatedPayloadBytes,
    });
  }
}

/**
 * Representative ADR-0002 / ADR-0005 planning fixtures.
 * These model transaction growth shapes only — not business workflows.
 */
export const TRANSACTION_PLANNING_FIXTURES = {
  individualBooking(): TransactionPlan {
    const builder = new TransactionPlanBuilder();
    planRepeatedReads(builder, 28, 'bookings/individual', 'aggregate');
    planRepeatedReads(builder, 4, 'authorization', 'authorization_check');
    planRepeatedMutations(builder, 1, 'bookings/individual', 'aggregate');
    planRepeatedMutations(builder, 1, 'resource_claims/instructor', 'resource_claim');
    planRepeatedMutations(builder, 1, 'resource_claims/participant', 'resource_claim');
    planRepeatedMutations(
      builder,
      2,
      'resource_claim_guards',
      'resource_guard',
      DEFAULT_GUARD_MUTATION_BYTES
    );
    planRepeatedMutations(builder, 2, 'payment_wallet', 'payment_wallet');
    planRepeatedMutations(builder, 1, 'command_idempotency', 'idempotency');
    planAuditOutboxContributions(builder, {
      activityLogPath: 'activity_logs/individual_booking',
      outboxObligationCount: 2,
    });
    return builder.build();
  },

  eightParticipantBooking(): TransactionPlan {
    const builder = new TransactionPlanBuilder();
    planRepeatedReads(builder, 45, 'bookings/eight_participant', 'aggregate');
    planRepeatedReads(builder, 40, 'authorization/participants', 'authorization_check');
    planRepeatedReads(builder, 10, 'resource_claim_guards', 'resource_guard');
    planRepeatedMutations(builder, 1, 'bookings/eight_participant', 'aggregate');
    planRepeatedMutations(builder, 1, 'resource_claims/instructor', 'resource_claim');
    planRepeatedMutations(builder, 8, 'resource_claims/participants', 'resource_claim');
    planRepeatedMutations(
      builder,
      24,
      'resource_claim_guards',
      'resource_guard',
      DEFAULT_GUARD_MUTATION_BYTES
    );
    planRepeatedMutations(builder, 3, 'payment_wallet', 'payment_wallet');
    planRepeatedMutations(builder, 1, 'command_idempotency', 'idempotency');
    planAuditOutboxContributions(builder, {
      activityLogPath: 'activity_logs/eight_participant_booking',
      outboxObligationCount: 4,
    });
    return builder.build();
  },

  eightParticipantsTenCourseDaysEnrollment(): TransactionPlan {
    const builder = new TransactionPlanBuilder();
    planRepeatedReads(builder, 120, 'courses/enrollment', 'aggregate');
    planRepeatedReads(builder, 80, 'authorization/participants', 'authorization_check');
    planRepeatedReads(builder, 90, 'resource_claim_guards', 'resource_guard');
    planRepeatedMutations(builder, 8, 'course_enrollments', 'aggregate');
    planRepeatedMutations(builder, 8, 'enrollment_guards', 'enrollment_guard');
    planRepeatedMutations(builder, 8, 'seat_claims', 'capacity_projection');
    planRepeatedMutations(builder, 1, 'courses/capacity', 'capacity_projection');
    planRepeatedMutations(builder, 80, 'participant_course_day_claims', 'resource_claim');
    planRepeatedMutations(
      builder,
      160,
      'resource_claim_guards',
      'resource_guard',
      DEFAULT_GUARD_MUTATION_BYTES
    );
    planRepeatedMutations(builder, 8, 'payment_wallet', 'payment_wallet');
    planRepeatedMutations(builder, 1, 'command_idempotency', 'idempotency');
    planAuditOutboxContributions(builder, {
      activityLogPath: 'activity_logs/course_enrollment',
      outboxObligationCount: 8,
    });
    return builder.build();
  },

  courseTransfer(): TransactionPlan {
    const builder = new TransactionPlanBuilder();
    planRepeatedReads(builder, 90, 'courses/transfer', 'aggregate');
    planRepeatedReads(builder, 70, 'resource_claim_guards', 'resource_guard');
    planRepeatedReads(builder, 30, 'authorization', 'authorization_check');
    planRepeatedMutations(builder, 1, 'course_enrollments/transfer', 'aggregate');
    planRepeatedMutations(builder, 2, 'enrollment_guards', 'enrollment_guard');
    planRepeatedMutations(builder, 2, 'courses/capacity', 'capacity_projection');
    planRepeatedMutations(builder, 40, 'participant_course_day_claims', 'resource_claim');
    planRepeatedMutations(
      builder,
      80,
      'resource_claim_guards',
      'resource_guard',
      DEFAULT_GUARD_MUTATION_BYTES
    );
    planRepeatedMutations(builder, 3, 'payment_wallet', 'payment_wallet');
    planRepeatedMutations(builder, 1, 'command_idempotency', 'idempotency');
    planAuditOutboxContributions(builder, {
      activityLogPath: 'activity_logs/course_transfer',
      outboxObligationCount: 6,
    });
    return builder.build();
  },

  maximumOutboxObligationBoundary(): TransactionPlan {
    const builder = new TransactionPlanBuilder();
    planRepeatedReads(builder, 12, 'bookings/outbox_boundary', 'aggregate');
    planRepeatedMutations(builder, 1, 'bookings/outbox_boundary', 'aggregate');
    planRepeatedMutations(builder, 1, 'command_idempotency', 'idempotency');
    planAuditOutboxContributions(builder, {
      activityLogPath: 'activity_logs/outbox_boundary',
      outboxObligationCount: AUDIT_CARDINALITY_LIMITS.outboxObligationsPerCommand,
    });
    return builder.build();
  },
} as const;

export function syntheticBudgetBoundaryPlan(
  shape: 'reads' | 'mutations' | 'bytes',
  value: number
): TransactionPlan {
  const builder = new TransactionPlanBuilder();

  if (shape === 'reads') {
    planRepeatedReads(builder, value, 'synthetic/reads', 'other');
    return builder.build();
  }

  if (shape === 'mutations') {
    planRepeatedMutations(builder, value, 'synthetic/mutations', 'other', DEFAULT_DOCUMENT_BYTES);
    return builder.build();
  }

  const bytesPerMutation = Math.max(1, Math.ceil(value / 2));
  planRepeatedMutations(builder, 2, 'synthetic/bytes', 'other', bytesPerMutation);
  return builder.build();
}
