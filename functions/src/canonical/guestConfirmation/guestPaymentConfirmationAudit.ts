import {
  AUDIT_REASON_REGISTRY_VERSION,
  AggregateRevisionSchema,
  canonicalReference,
  type AuditOutboxStagingPlan,
  type CommandEnvelope,
} from '@ski-academy/shared-domain';
import type { PlannedGuestPaymentConfirmation } from './guestPaymentConfirmation';

function confirmationEffect(plan: PlannedGuestPaymentConfirmation) {
  if (plan.subjectKind === 'booking') {
    const subjectRef = canonicalReference('booking', plan.subjectId);
    return {
      subjectRef,
      lifecycleEffect: {
        kind: 'booking_lifecycle_changed' as const,
        subjectRef,
        summary: 'Guest booking confirmed after required Payment became fully funded',
      },
      outboxEffect: {
        kind: 'outbox_obligation_created' as const,
        subjectRef,
        summary: 'Guest booking confirmation notification queued',
      },
    };
  }
  const subjectRef = canonicalReference('course_enrollment', plan.subjectId);
  return {
    subjectRef,
    lifecycleEffect: {
      kind: 'course_enrollment_lifecycle_changed' as const,
      subjectRef,
      summary: 'Guest course enrollment confirmed after required Payment became fully funded',
    },
    outboxEffect: {
      kind: 'outbox_obligation_created' as const,
      subjectRef,
      summary: 'Guest course enrollment confirmation notification queued',
    },
  };
}

function confirmationOutboxDraft(
  plan: PlannedGuestPaymentConfirmation,
  deliveryEffectOrdinal: number
): AuditOutboxStagingPlan['outboxObligations'][number] {
  return {
    deliveryEffectOrdinal,
    recipient: { kind: 'guest', id: plan.subjectId },
    channel: 'email',
    templateId:
      plan.subjectKind === 'booking'
        ? 'guest_booking_confirmed'
        : 'guest_course_enrollment_confirmed',
    templateVersion: 'v1',
    renderInputs:
      plan.subjectKind === 'booking'
        ? { bookingId: plan.subjectId }
        : { courseEnrollmentId: plan.subjectId },
    deliverySemantics: 'transactional',
  };
}

export function buildStandaloneGuestPaymentConfirmationAuditPlan(input: {
  readonly envelope: CommandEnvelope<'confirm_guest_booking' | 'confirm_guest_course_enrollment'>;
  readonly plan: PlannedGuestPaymentConfirmation;
}): AuditOutboxStagingPlan {
  const effect = confirmationEffect(input.plan);
  const paymentRef = canonicalReference('payment', input.plan.paymentId);
  return {
    activityLog: {
      reason: {
        registryVersion: AUDIT_REASON_REGISTRY_VERSION,
        reasonCode: 'other',
        explanation: 'Required Payment fully satisfied; guest application confirmed',
      },
      primarySubject: {
        kind: input.plan.subjectKind,
        id: input.plan.subjectId,
        subjectKey: `${input.plan.subjectKind}:${input.plan.subjectId}`,
      },
      affectedSubjects: [effect.subjectRef, paymentRef],
      effects: [effect.lifecycleEffect, effect.outboxEffect],
      monetaryEventIds: [],
      adminIssueIds: [],
      resultingRevisions: [
        {
          subject: effect.subjectRef,
          revision: AggregateRevisionSchema.parse(input.plan.resultingRevision),
        },
      ],
    },
    outboxObligations: [confirmationOutboxDraft(input.plan, 0)],
  };
}

export function mergeGuestPaymentConfirmationAuditPlan(
  base: AuditOutboxStagingPlan,
  plan: PlannedGuestPaymentConfirmation | undefined
): AuditOutboxStagingPlan {
  if (!plan) return base;
  const effect = confirmationEffect(plan);
  const nextOrdinal =
    base.outboxObligations.reduce(
      (maximum, obligation) => Math.max(maximum, obligation.deliveryEffectOrdinal),
      -1
    ) + 1;
  return {
    activityLog: {
      ...base.activityLog,
      affectedSubjects: [...base.activityLog.affectedSubjects, effect.subjectRef],
      effects: [...base.activityLog.effects, effect.lifecycleEffect, effect.outboxEffect],
      resultingRevisions: [
        ...base.activityLog.resultingRevisions,
        {
          subject: effect.subjectRef,
          revision: AggregateRevisionSchema.parse(plan.resultingRevision),
        },
      ],
    },
    outboxObligations: [...base.outboxObligations, confirmationOutboxDraft(plan, nextOrdinal)],
  };
}
