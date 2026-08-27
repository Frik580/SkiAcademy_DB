import { useLanguage } from '../../app/providers/LanguageContext';

export function useBookingCollaborationTranslations() {
  const { t } = useLanguage();
  return {
    t,
    proposalInboxTitle: t('collabProposalInbox'),
    proposalOpenLabel: t('collabProposalOpen'),
    acceptProposal: t('collabAcceptProposal'),
    declineProposal: t('collabDeclineProposal'),
    withdrawProposal: t('collabWithdrawProposal'),
    withdrawCancellation: t('collabWithdrawCancellation'),
    rescheduleBooking: t('rescheduleBtn'),
    rescheduleTitle: t('collabRescheduleTitle'),
    rescheduleConfirm: t('collabRescheduleConfirm'),
    changeRequestOpen: t('collabChangeRequestOpen'),
    createChangeRequest: t('collabCreateChangeRequest'),
    withdrawChangeRequest: t('collabWithdrawChangeRequest'),
    createProposal: t('collabCreateProposal'),
    relationshipSection: t('collabRelationshipSection'),
    blockSection: t('collabBlockSection'),
    createRelationship: t('collabCreateRelationship'),
    revokeRelationship: t('collabRevokeRelationship'),
    blockInstructor: t('collabBlockInstructor'),
    unblockInstructor: t('collabUnblockInstructor'),
    blockReasonPlaceholder: t('collabBlockReasonPlaceholder'),
    changeRequestReasonPlaceholder: t('collabChangeRequestReasonPlaceholder'),
    insufficientFunds: t('insufficientFunds'),
    slotUnavailable: t('slotUnavailable'),
    refreshRequired: t('collabRefreshRequired'),
  };
}
