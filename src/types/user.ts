export interface CustomTodayTask {
  id: string;
  text: string;
}

export type WalletCurrency = 'USD' | 'KZT';

export type WalletLedgerType =
  'top_up' | 'starter_credit' | 'lesson_payment' | 'course_payment' | 'refund' | 'admin_adjustment';

export interface WalletLedgerEntry {
  id: string;
  userId: string;
  /** Positive for credits, negative for debits. */
  amount: number;
  balanceAfter: number;
  /** Currency of amount and balanceAfter. Legacy entries are USD. */
  currency?: WalletCurrency;
  type: WalletLedgerType;
  subjectName?: string;
  bookingId?: string;
  courseId?: string;
  createdAt: string;
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  phoneNumber?: string;
  role: 'user' | 'admin';
  systemRole?: 'owner';
  avatarUrl: string;
  balanceUSD: number;
  /** Separate wallet balances. balanceUSD is retained for backwards compatibility and USD bookings. */
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
  hasCompletedOnboarding?: boolean;
  /** Skill exercise ids pinned to the Today checklist */
  todaySkillItemIds?: string[];
  /** Completed Today task ids (skill:*, custom:*) */
  completedTodayTaskIds?: string[];
  /** YYYY-MM-DD — date when completedTodayTaskIds was last updated (daily reset) */
  completedTodayDate?: string;
  /** User-created Today checklist items */
  customTodayTasks?: CustomTodayTask[];
  /** Today checklist items hidden by the user (recommendation task ids) */
  dismissedTodayTaskIds?: string[];
  /** Booking IDs for which review notifications have been dismissed */
  dismissedReviewIds?: string[];
}
