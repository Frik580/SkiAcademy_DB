import { create } from 'zustand';
import type {
  BookingChangeRequestCabinetItem,
  BookingProposalCabinetItem,
  InstructorLessonBookingItem,
  ParticipantAccessCabinetItem,
} from './bookingCollaborationContracts';
import { buildInstructorLessonBookingsList } from './instructorLessonBookingViewModel';

interface BookingCollaborationStoreState {
  readonly proposals: ReadonlyMap<string, BookingProposalCabinetItem>;
  readonly proposalsList: readonly BookingProposalCabinetItem[];
  readonly changeRequests: ReadonlyMap<string, BookingChangeRequestCabinetItem>;
  readonly changeRequestsList: readonly BookingChangeRequestCabinetItem[];
  readonly instructorLessonBookings: ReadonlyMap<string, InstructorLessonBookingItem>;
  readonly instructorLessonBookingsList: readonly InstructorLessonBookingItem[];
  readonly participantAccess: ReadonlyMap<string, ParticipantAccessCabinetItem>;
  readonly loading: boolean;
  readonly loaded: boolean;
  readonly error?: string;
  setProposals: (items: ReadonlyMap<string, BookingProposalCabinetItem>) => void;
  mergeProposals: (items: ReadonlyMap<string, BookingProposalCabinetItem>) => void;
  setChangeRequests: (items: ReadonlyMap<string, BookingChangeRequestCabinetItem>) => void;
  mergeChangeRequests: (items: ReadonlyMap<string, BookingChangeRequestCabinetItem>) => void;
  mergeInstructorLessonBookings: (items: ReadonlyMap<string, InstructorLessonBookingItem>) => void;
  setParticipantAccess: (items: ReadonlyMap<string, ParticipantAccessCabinetItem>) => void;
  mergeParticipantAccess: (items: ReadonlyMap<string, ParticipantAccessCabinetItem>) => void;
  setLoading: (loading: boolean) => void;
  setLoaded: (loaded: boolean) => void;
  setError: (error?: string) => void;
  reset: () => void;
}

const EMPTY_PROPOSALS: readonly BookingProposalCabinetItem[] = [];
const EMPTY_CHANGE_REQUESTS: readonly BookingChangeRequestCabinetItem[] = [];
const EMPTY_INSTRUCTOR_LESSONS: readonly InstructorLessonBookingItem[] = [];

function buildProposalsList(items: ReadonlyMap<string, BookingProposalCabinetItem>) {
  return [...items.values()].sort((left, right) => right.date.localeCompare(left.date));
}

function buildChangeRequestsList(items: ReadonlyMap<string, BookingChangeRequestCabinetItem>) {
  return [...items.values()].sort((left, right) => left.requestId.localeCompare(right.requestId));
}

function revisionAwareMerge<T extends { readonly revision: number }>(
  existing: ReadonlyMap<string, T>,
  incoming: ReadonlyMap<string, T>
): { merged: Map<string, T>; changed: boolean } {
  const merged = new Map(existing);
  let changed = false;
  for (const [key, value] of incoming) {
    const cached = merged.get(key);
    if (!cached || value.revision >= cached.revision) {
      if (!cached || cached.revision !== value.revision) {
        merged.set(key, value);
        changed = true;
      }
    }
  }
  return { merged, changed };
}

const initialState = {
  proposals: new Map<string, BookingProposalCabinetItem>(),
  proposalsList: EMPTY_PROPOSALS,
  changeRequests: new Map<string, BookingChangeRequestCabinetItem>(),
  changeRequestsList: EMPTY_CHANGE_REQUESTS,
  instructorLessonBookings: new Map<string, InstructorLessonBookingItem>(),
  instructorLessonBookingsList: EMPTY_INSTRUCTOR_LESSONS,
  participantAccess: new Map<string, ParticipantAccessCabinetItem>(),
  loading: false,
  loaded: false,
  error: undefined,
};

export const useBookingCollaborationStore = create<BookingCollaborationStoreState>((set) => ({
  ...initialState,
  setProposals: (items) =>
    set({
      proposals: items,
      proposalsList: buildProposalsList(items),
    }),
  mergeProposals: (items) =>
    set((state) => {
      const { merged, changed } = revisionAwareMerge(state.proposals, items);
      if (!changed) return state;
      return {
        proposals: merged,
        proposalsList: buildProposalsList(merged),
      };
    }),
  setChangeRequests: (items) =>
    set({
      changeRequests: items,
      changeRequestsList: buildChangeRequestsList(items),
    }),
  mergeChangeRequests: (items) =>
    set((state) => {
      const { merged, changed } = revisionAwareMerge(state.changeRequests, items);
      if (!changed) return state;
      return {
        changeRequests: merged,
        changeRequestsList: buildChangeRequestsList(merged),
      };
    }),
  mergeInstructorLessonBookings: (items) =>
    set((state) => {
      const { merged, changed } = revisionAwareMerge(state.instructorLessonBookings, items);
      if (!changed) return state;
      return {
        instructorLessonBookings: merged,
        instructorLessonBookingsList: buildInstructorLessonBookingsList(merged),
      };
    }),
  setParticipantAccess: (items) => set({ participantAccess: items }),
  mergeParticipantAccess: (items) =>
    set((state) => {
      const merged = new Map(state.participantAccess);
      let changed = false;
      for (const [key, value] of items) {
        const cached = merged.get(key);
        if (!cached || JSON.stringify(cached) !== JSON.stringify(value)) {
          merged.set(key, value);
          changed = true;
        }
      }
      if (!changed) return state;
      return { participantAccess: merged };
    }),
  setLoading: (loading) => set({ loading }),
  setLoaded: (loaded) => set({ loaded }),
  setError: (error) => set({ error }),
  reset: () =>
    set({
      ...initialState,
      proposals: new Map(),
      proposalsList: EMPTY_PROPOSALS,
      changeRequests: new Map(),
      changeRequestsList: EMPTY_CHANGE_REQUESTS,
      instructorLessonBookings: new Map(),
      instructorLessonBookingsList: EMPTY_INSTRUCTOR_LESSONS,
      participantAccess: new Map(),
    }),
}));

export function selectCollaborationProposals(
  state: BookingCollaborationStoreState
): readonly BookingProposalCabinetItem[] {
  return state.proposalsList;
}

export function selectCollaborationChangeRequests(
  state: BookingCollaborationStoreState
): readonly BookingChangeRequestCabinetItem[] {
  return state.changeRequestsList;
}

export function selectInstructorLessonBookings(
  state: BookingCollaborationStoreState
): readonly InstructorLessonBookingItem[] {
  return state.instructorLessonBookingsList;
}

export function selectParticipantAccessByPair(
  state: BookingCollaborationStoreState,
  key: string
): ParticipantAccessCabinetItem | undefined {
  return state.participantAccess.get(key);
}
