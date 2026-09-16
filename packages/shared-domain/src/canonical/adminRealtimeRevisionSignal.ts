export interface AdminRealtimeRevisionSignalState {
  readonly initialized: boolean;
  readonly lastRevision?: number;
}

export interface AdminRealtimeRevisionSignalReduction {
  readonly initialized: true;
  readonly lastRevision: number;
  readonly shouldRefresh: boolean;
}

/** Transport-only revision semantics shared by admin invalidation signals. */
export function reduceAdminRealtimeRevisionSignal(
  state: Readonly<AdminRealtimeRevisionSignalState>,
  nextRevision: number
): AdminRealtimeRevisionSignalReduction {
  if (!state.initialized) {
    if (state.lastRevision !== undefined && nextRevision > state.lastRevision) {
      return { initialized: true, lastRevision: nextRevision, shouldRefresh: true };
    }
    return {
      initialized: true,
      lastRevision: state.lastRevision ?? nextRevision,
      shouldRefresh: false,
    };
  }
  if (state.lastRevision === nextRevision) {
    return { initialized: true, lastRevision: nextRevision, shouldRefresh: false };
  }
  return { initialized: true, lastRevision: nextRevision, shouldRefresh: true };
}
