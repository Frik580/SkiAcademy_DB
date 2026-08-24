import { describe, expect, it } from 'vitest';
import {
  TRANSACTION_PLANNING_FIXTURES,
  TRANSACTION_SAFETY_BUDGET,
  evaluateTransactionPreflight,
  estimateTransactionPlan,
  syntheticBudgetBoundaryPlan,
  transactionPreflightDiagnostics,
  TransactionPlanBuilder,
} from '@ski-academy/shared-domain';

describe('transaction safety budget', () => {
  it('documents application safety budgets distinct from Firestore platform limits', () => {
    expect(TRANSACTION_SAFETY_BUDGET.maxReads).toBe(400);
    expect(TRANSACTION_SAFETY_BUDGET.maxMutations).toBe(400);
    expect(TRANSACTION_SAFETY_BUDGET.maxEstimatedRequestBytes).toBe(6 * 1024 * 1024);
    expect(TRANSACTION_SAFETY_BUDGET.version).toBe('transaction-safety:v1');
  });
});

describe('transaction preflight boundaries', () => {
  it('accepts exactly-at-read-budget plans', () => {
    const plan = syntheticBudgetBoundaryPlan('reads', TRANSACTION_SAFETY_BUDGET.maxReads);
    const result = evaluateTransactionPreflight(plan);
    expect(result.accepted).toBe(true);
    if (result.accepted) {
      expect(result.estimate.readCount).toBe(400);
    }
  });

  it('rejects read-budget + 1 with operation_too_large diagnostics', () => {
    const plan = syntheticBudgetBoundaryPlan('reads', TRANSACTION_SAFETY_BUDGET.maxReads + 1);
    const result = evaluateTransactionPreflight(plan);
    expect(result.accepted).toBe(false);
    if (!result.accepted) {
      expect(result.violations).toContain('reads_exceeded');
      const diagnostics = transactionPreflightDiagnostics(result);
      expect(diagnostics.estimate.readCount).toBe(401);
      expect(diagnostics.limits.maxReads).toBe(400);
    }
  });

  it('accepts exactly-at-mutation-budget plans', () => {
    const plan = syntheticBudgetBoundaryPlan('mutations', TRANSACTION_SAFETY_BUDGET.maxMutations);
    const result = evaluateTransactionPreflight(plan);
    expect(result.accepted).toBe(true);
    if (result.accepted) {
      expect(result.estimate.mutationCount).toBe(400);
    }
  });

  it('rejects mutation-budget + 1', () => {
    const plan = syntheticBudgetBoundaryPlan(
      'mutations',
      TRANSACTION_SAFETY_BUDGET.maxMutations + 1
    );
    const result = evaluateTransactionPreflight(plan);
    expect(result.accepted).toBe(false);
    if (!result.accepted) {
      expect(result.violations).toContain('mutations_exceeded');
    }
  });

  it('accepts payload estimates just within the application byte budget', () => {
    const plan = syntheticBudgetBoundaryPlan(
      'bytes',
      TRANSACTION_SAFETY_BUDGET.maxEstimatedRequestBytes
    );
    const result = evaluateTransactionPreflight(plan);
    expect(result.accepted).toBe(true);
  });

  it('rejects payload estimates above the application byte budget', () => {
    const plan = syntheticBudgetBoundaryPlan(
      'bytes',
      TRANSACTION_SAFETY_BUDGET.maxEstimatedRequestBytes + 1
    );
    const result = evaluateTransactionPreflight(plan);
    expect(result.accepted).toBe(false);
    if (!result.accepted) {
      expect(result.violations).toContain('estimated_bytes_exceeded');
    }
  });
});

describe('transaction planning fixtures', () => {
  const fixtures = [
    ['individual booking', TRANSACTION_PLANNING_FIXTURES.individualBooking],
    ['eight-participant booking', TRANSACTION_PLANNING_FIXTURES.eightParticipantBooking],
    [
      'eight participants by ten course days enrollment',
      TRANSACTION_PLANNING_FIXTURES.eightParticipantsTenCourseDaysEnrollment,
    ],
    ['course transfer', TRANSACTION_PLANNING_FIXTURES.courseTransfer],
    [
      'maximum outbox obligation boundary',
      TRANSACTION_PLANNING_FIXTURES.maximumOutboxObligationBoundary,
    ],
  ] as const;

  it.each(fixtures)(
    'accepts the %s planning fixture within application budgets',
    (_label, buildPlan) => {
      const plan = buildPlan();
      const result = evaluateTransactionPreflight(plan);
      expect(result.accepted).toBe(true);
    }
  );

  it('exposes deterministic category breakdowns for diagnosis', () => {
    const estimate = estimateTransactionPlan(TRANSACTION_PLANNING_FIXTURES.individualBooking());
    expect(estimate.readCount).toBeGreaterThan(0);
    expect(estimate.mutationCount).toBeGreaterThan(0);
    expect(estimate.byCategory.activity_log.mutations).toBe(1);
    expect(estimate.byCategory.outbox_obligation.mutations).toBeGreaterThan(0);
  });

  it('tracks audit/outbox fan-out separately from domain mutations', () => {
    const builder = new TransactionPlanBuilder();
    builder.planMutation({
      path: 'bookings/example',
      kind: 'create',
      category: 'aggregate',
      estimatedPayloadBytes: 1024,
    });
    const withoutOutbox = evaluateTransactionPreflight(builder.build());
    expect(withoutOutbox.accepted).toBe(true);

    const withOutbox = evaluateTransactionPreflight(
      TRANSACTION_PLANNING_FIXTURES.maximumOutboxObligationBoundary()
    );
    expect(withOutbox.accepted).toBe(true);
    if (withOutbox.accepted) {
      expect(withOutbox.estimate.byCategory.outbox_obligation.mutations).toBe(32);
    }
  });
});
