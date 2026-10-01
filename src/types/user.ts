export interface CustomTodayTask {
  id: string;
  text: string;
}

/**
 * Training-plan checklist for one Participant.
 * Stored on the account user document, keyed by participantId.
 */
export interface ParticipantTodayChecklistState {
  todaySkillItemIds?: string[];
  customTodayTasks?: CustomTodayTask[];
  completedTodayTaskIds?: string[];
  /** YYYY-MM-DD — date when completedTodayTaskIds was last updated (daily reset) */
  completedTodayDate?: string;
  dismissedTodayTaskIds?: string[];
}

export type WalletCurrency = 'USD' | 'KZT';

export type WalletLedgerType =
  | 'top_up'
  | 'starter_credit'
  | 'lesson_payment'
  | 'course_payment'
  | 'refund'
  | 'admin_adjustment'
  | 'guest_payment';

export interface WalletLedgerEntry {
  id: string;
  userId: string;
  /** Positive for credits, negative for debits. */
  amount: number;
  balanceAfter: number;
  /** Currency of amount and balanceAfter. Missing currency is treated as KZT; older rows may be USD. */
  currency?: WalletCurrency;
  type: WalletLedgerType;
  subjectName?: string;
  bookingId?: string;
  courseId?: string;
  createdAt: string;
}

export interface UserProfile {
  uid: string;
  dataScope?: 'live' | 'test';
  email: string;
  displayName: string;
  phoneNumber?: string;
  role: 'user' | 'admin';
  systemRole?: 'owner';
  avatarUrl: string;
  /**
   * Leftover `/users` money fields. Not spendable authority.
   * Canonical balance is `/users/{accountId}/wallet/state`.
   */
  balanceUSD?: number;
  walletBalances?: Partial<Record<WalletCurrency, number>>;
  /** Staging field for secure wallet credits (top-ups / refunds) before apply. */
  pendingWalletCredit?: number;
  /** Set during booking-refund transactions; used by Firestore rules to authorize balance credits. */
  lastRefundBookingId?: string;
  instructorId?: string;
  isInstructor?: boolean;
  isClientActive?: boolean;
  level?: number;
  skillScores?: Record<string, number>;
  /** Instructor comments per skill exercise id */
  skillComments?: Record<string, string>;
  hideProgressTracking?: boolean;
  /**
   * Legacy account-level Today checklist.
   * Read only as a fallback for the self Participant until that participant
   * has an entry in participantTodayChecklists. Never a source for dependents.
   */
  todaySkillItemIds?: string[];
  /** Completed Today task ids (skill:*, custom:*) */
  completedTodayTaskIds?: string[];
  /** YYYY-MM-DD — date when completedTodayTaskIds was last updated (daily reset) */
  completedTodayDate?: string;
  /** User-created Today checklist items */
  customTodayTasks?: CustomTodayTask[];
  /** Today checklist items hidden by the user (recommendation task ids) */
  dismissedTodayTaskIds?: string[];
  /** Participant-scoped Today checklist. Key is participantId. */
  participantTodayChecklists?: Record<string, ParticipantTodayChecklistState>;
  /** Booking IDs for which review notifications have been dismissed */
  dismissedReviewIds?: string[];
}
