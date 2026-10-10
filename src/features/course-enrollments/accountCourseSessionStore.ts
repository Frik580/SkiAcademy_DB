import { create } from 'zustand';
import type { CourseEnrollmentCabinetItem } from './courseEnrollmentContracts';

interface AccountCourseSessionState {
  readonly accountId?: string;
  readonly generation: number;
  readonly items: readonly CourseEnrollmentCabinetItem[];
  readonly error?: string;
  reset: (accountId?: string) => void;
}

/** Account session projection only; participant enrollment/progress ownership stays separate. */
export const useAccountCourseSessionStore = create<AccountCourseSessionState>((set) => ({
  generation: 0,
  items: [],
  reset: (accountId) =>
    set((state) => ({ accountId, generation: state.generation + 1, items: [], error: undefined })),
}));
