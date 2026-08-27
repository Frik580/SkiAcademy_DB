import React from 'react';
import type { BookingProposalCabinetItem } from '../bookingCollaborationContracts';
import { useBookingCollaborationTranslations } from '../useBookingCollaborationTranslations';

export interface CustomerProposalInboxProps {
  readonly proposals: readonly BookingProposalCabinetItem[];
  readonly onAccept: (proposal: BookingProposalCabinetItem) => void | Promise<void>;
  readonly onDecline: (proposal: BookingProposalCabinetItem) => void | Promise<void>;
  readonly submittingProposalId?: string;
}

export const CustomerProposalInbox: React.FC<CustomerProposalInboxProps> = ({
  proposals,
  onAccept,
  onDecline,
  submittingProposalId,
}) => {
  const copy = useBookingCollaborationTranslations();
  const openProposals = proposals.filter((proposal) => proposal.lifecycleStatus === 'open');
  if (openProposals.length === 0) return null;

  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold text-[var(--ink)]">{copy.proposalInboxTitle}</h3>
      <div className="space-y-3">
        {openProposals.map((proposal) => (
          <article
            key={proposal.proposalId}
            className="rounded-xl border border-[var(--border-subtle)] bg-[var(--card-bg)] p-4 space-y-3"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-sm font-medium text-[var(--ink)]">
                  {proposal.instructorDisplayName}
                </p>
                <p className="text-xs text-[var(--ink-dim)]">
                  {proposal.participantDisplayName} · {proposal.date} {proposal.time} ·{' '}
                  {proposal.durationHours}h
                </p>
              </div>
              <span className="text-[10px] uppercase tracking-wide text-[var(--accent)]">
                {copy.proposalOpenLabel}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {proposal.authorizedActions.canAccept && (
                <button
                  type="button"
                  disabled={submittingProposalId === proposal.proposalId}
                  onClick={() => void onAccept(proposal)}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg bg-[var(--accent)] text-white"
                >
                  {copy.acceptProposal}
                </button>
              )}
              {proposal.authorizedActions.canDecline && (
                <button
                  type="button"
                  disabled={submittingProposalId === proposal.proposalId}
                  onClick={() => void onDecline(proposal)}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg border border-[var(--border-subtle)]"
                >
                  {copy.declineProposal}
                </button>
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
};
