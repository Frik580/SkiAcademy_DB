/**
 * Future email / SMS / push / webhook workers MUST import this guard and call
 * `assertOutboxDeliveryMayProceed` before any external send. Absence of a
 * worker today is not a safety control.
 */
export {
  assertOutboxDeliveryMayProceed,
  OutboxDeliveryPolicyError,
  TEST_EXTERNAL_CHANNEL_SUPPRESSION_REASON,
} from '@ski-academy/shared-domain';
