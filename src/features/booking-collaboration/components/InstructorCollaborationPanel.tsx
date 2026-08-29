import React, { useMemo, useState } from 'react';
import type {
  BookingChangeRequestCabinetItem,
  BookingProposalCabinetItem,
} from '../bookingCollaborationContracts';
import { selectOpenChangeRequestForBooking } from '../changeRequestViewModel';
import { useBookingCollaborationTranslations } from '../useBookingCollaborationTranslations';

export interface InstructorCollaborationPanelProps {
  readonly proposals: readonly BookingProposalCabinetItem[];
  readonly changeRequests: readonly BookingChangeRequestCabinetItem[];
  readonly bookingId?: string;
  readonly participantId?: string;
  readonly onCreateProposal?: () => void;
  readonly onWithdrawProposal: (proposal: BookingProposalCabinetItem) => void | Promise<void>;
  readonly onCreateChangeRequest?: (reason: string) => void | Promise<void>;
  readonly onWithdrawChangeRequest: (
    request: BookingChangeRequestCabinetItem
  ) => void | Promise<void>;
  readonly submittingId?: string;
}

export const InstructorCollaborationPanel: React.FC<InstructorCollaborationPanelProps> = ({
  proposals,
  changeRequests,
  bookingId,
  participantId,
  onCreateProposal,
  onWithdrawProposal,
  onCreateChangeRequest,
  onWithdrawChangeRequest,
  submittingId,
}) => {
  const copy = useBookingCollaborationTranslations();
  const [changeReason, setChangeReason] = useState('');

  const scopedProposals = useMemo(() => {
    if (!participantId) return proposals.filter((proposal) => proposal.lifecycleStatus === 'open');
    return proposals.filter(
      (proposal) => proposal.lifecycleStatus === 'open' && proposal.participantId === participantId
    );
  }, [participantId, proposals]);

  const openChangeRequest = useMemo(
    () => (bookingId ? selectOpenChangeRequestForBooking(changeRequests, bookingId) : undefined),
    [bookingId, changeRequests]
  );

  return (
    <div className="space-y-4 border-t border-slate-200/60 dark:border-slate-800/60 pt-4">
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h5 className="text-[10px] font-mono uppercase tracking-widest text-[var(--ink-dim)]">
            {copy.proposalInboxTitle}
          </h5>
          {onCreateProposal && participantId && (
            <button
              type="button"
              onClick={onCreateProposal}
              className="text-[10px] font-mono uppercase tracking-widest text-[var(--accent)]"
            >
              {copy.createProposal}
            </button>
          )}
        </div>
        {scopedProposals.length === 0 ? (
          <p className="text-xs text-[var(--ink-dim)]">{copy.t('collabNoOpenProposals')}</p>
        ) : (
          scopedProposals.map((proposal) => (
            <div
              key={proposal.proposalId}
              className="rounded-xs border border-slate-200/70 dark:border-slate-800/70 p-3 text-xs space-y-2"
            >
              <p className="font-medium text-[var(--ink)]">
                {proposal.participantDisplayName} · {proposal.date} {proposal.time}
              </p>
              {proposal.authorizedActions.canWithdraw && (
                <button
                  type="button"
                  disabled={submittingId === proposal.proposalId}
                  onClick={() => void onWithdrawProposal(proposal)}
                  className="px-2 py-1 rounded-xs border border-[var(--border-subtle)]"
                >
                  {copy.withdrawProposal}
                </button>
              )}
            </div>
          ))
        )}
      </div>

      {bookingId && (
        <div className="space-y-2">
          <h5 className="text-[10px] font-mono uppercase tracking-widest text-[var(--ink-dim)]">
            {copy.changeRequestOpen}
          </h5>
          {openChangeRequest ? (
            <div className="rounded-xs border border-slate-200/70 dark:border-slate-800/70 p-3 text-xs space-y-2">
              <p className="text-[var(--ink)]">{openChangeRequest.reason}</p>
              {openChangeRequest.authorizedActions.canWithdraw && (
                <button
                  type="button"
                  disabled={submittingId === openChangeRequest.requestId}
                  onClick={() => void onWithdrawChangeRequest(openChangeRequest)}
                  className="px-2 py-1 rounded-xs border border-[var(--border-subtle)]"
                >
                  {copy.withdrawChangeRequest}
                </button>
              )}
            </div>
          ) : onCreateChangeRequest ? (
            <div className="space-y-2">
              <textarea
                value={changeReason}
                onChange={(event) => setChangeReason(event.target.value)}
                placeholder={copy.changeRequestReasonPlaceholder}
                className="w-full rounded-xs border border-slate-200/70 dark:border-slate-800/70 px-3 py-2 text-xs min-h-[72px]"
              />
              <button
                type="button"
                disabled={changeReason.trim().length === 0}
                onClick={() => void onCreateChangeRequest(changeReason.trim())}
                className="px-2 py-1 rounded-xs bg-slate-800 text-white text-[10px] font-mono uppercase"
              >
                {copy.createChangeRequest}
              </button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
};
