import type { Booking, UserProfile } from '../../../../types';

export type CashFlowClient = Pick<
  UserProfile,
  'uid' | 'displayName' | 'email' | 'balanceUSD' | 'walletBalances'
>;

export type CashFlowBooking = Pick<
  Booking,
  | 'id'
  | 'userId'
  | 'isGuest'
  | 'isDeleted'
  | 'status'
  | 'totalPrice'
  | 'createdAt'
  | 'guestName'
  | 'instructorName'
>;
