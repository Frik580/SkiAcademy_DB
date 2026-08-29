import React, { useState } from 'react';
import type { ParticipantAccessCabinetItem } from '../bookingCollaborationContracts';
import { useBookingCollaborationTranslations } from '../useBookingCollaborationTranslations';

export interface ParticipantAccessControlsProps {
  readonly access?: ParticipantAccessCabinetItem;
  readonly scope: 'account_manager' | 'instructor';
  readonly loading?: boolean;
  readonly onCreateRelationship?: () => void | Promise<void>;
  readonly onRevokeRelationship?: () => void | Promise<void>;
  readonly onBlock?: (reason: string) => void | Promise<void>;
  readonly onUnblock?: () => void | Promise<void>;
}

export const ParticipantAccessControls: React.FC<ParticipantAccessControlsProps> = ({
  access,
  scope,
  loading = false,
  onCreateRelationship,
  onRevokeRelationship,
  onBlock,
  onUnblock,
}) => {
  const copy = useBookingCollaborationTranslations();
  const [blockReason, setBlockReason] = useState('');
  const actions = access?.authorizedActions;

  if (!access || !actions) {
    return loading ? <p className="text-xs text-[var(--ink-dim)]">{copy.t('loading')}</p> : null;
  }

  const managerBlockActive = scope === 'account_manager' && access.managerBlockStatus === 'active';
  const instructorBlockActive = scope === 'instructor' && access.instructorBlockStatus === 'active';

  return (
    <div className="space-y-4 rounded-xl border border-[var(--border-subtle)] p-4">
      <div className="space-y-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--ink-dim)]">
          {copy.relationshipSection}
        </h4>
        <div className="flex flex-wrap gap-2">
          {actions.canCreateRelationship && onCreateRelationship && (
            <button
              type="button"
              disabled={loading}
              onClick={() => void onCreateRelationship()}
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-[var(--accent)] text-white"
            >
              {copy.createRelationship}
            </button>
          )}
          {actions.canRevokeRelationship && onRevokeRelationship && (
            <button
              type="button"
              disabled={loading}
              onClick={() => void onRevokeRelationship()}
              className="px-3 py-1.5 text-xs font-medium rounded-lg border border-[var(--border-subtle)]"
            >
              {copy.revokeRelationship}
            </button>
          )}
          {access.relationshipStatus === 'active' && !actions.canRevokeRelationship && (
            <span className="text-xs text-[var(--ink-dim)]">
              {copy.t('collabRelationshipActive')}
            </span>
          )}
        </div>
      </div>

      <div className="space-y-2 border-t border-[var(--border-subtle)] pt-4">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--ink-dim)]">
          {copy.blockSection}
        </h4>
        {(managerBlockActive || instructorBlockActive) && (
          <p className="text-xs text-rose-600 dark:text-rose-400">{copy.t('collabBlockedState')}</p>
        )}
        {actions.canBlock && onBlock && (
          <div className="space-y-2">
            <input
              type="text"
              value={blockReason}
              onChange={(event) => setBlockReason(event.target.value)}
              placeholder={copy.blockReasonPlaceholder}
              className="w-full rounded-lg border border-[var(--border-subtle)] px-3 py-2 text-sm"
            />
            <button
              type="button"
              disabled={loading || blockReason.trim().length === 0}
              onClick={() => void onBlock(blockReason.trim())}
              className="px-3 py-1.5 text-xs font-medium rounded-lg border border-rose-200 text-rose-600"
            >
              {copy.blockInstructor}
            </button>
          </div>
        )}
        {actions.canUnblock && onUnblock && (
          <button
            type="button"
            disabled={loading}
            onClick={() => void onUnblock()}
            className="px-3 py-1.5 text-xs font-medium rounded-lg border border-[var(--border-subtle)]"
          >
            {copy.unblockInstructor}
          </button>
        )}
      </div>
    </div>
  );
};
