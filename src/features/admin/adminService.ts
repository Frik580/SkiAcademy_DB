import {
  db,
  deleteDoc,
  doc,
  getDoc,
  OperationType,
  setDoc,
  updateDoc,
  handleFirestoreError,
} from '../../lib/firebase';
import { UserProfile } from '../../types';
import { updateUserWithAdminBalanceLedger } from '../../lib/walletCredit';
import {
  clearStudentBookings,
  clearCancelledBookings,
  ClearStudentBookingsResult,
  ClearCancelledBookingsResult,
} from '../../lib/clearStudentBookings';
import {
  confirmBookingService,
  completeBookingService,
  linkGuestBookingService,
  deleteBookingService,
  addBookingDirect,
  reassignInstructorService,
  rescheduleBookingService,
  cancelBookingService,
  addInstructorService,
  updateInstructorService,
  deleteInstructorService,
  BookingSlotOverlapError,
  InsufficientFundsError,
} from '../bookings/bookingService';
import {
  addCourseService,
  updateCourseService,
  deleteCourseService,
  notifyCourseModifiedService,
} from '../courses/courseService';

export {
  BookingSlotOverlapError,
  InsufficientFundsError,
  confirmBookingService,
  completeBookingService,
  linkGuestBookingService,
  deleteBookingService,
  addBookingDirect,
  reassignInstructorService,
  rescheduleBookingService,
  cancelBookingService,
  addInstructorService,
  updateInstructorService,
  deleteInstructorService,
  addCourseService,
  updateCourseService,
  deleteCourseService,
  notifyCourseModifiedService,
  clearStudentBookings,
  clearCancelledBookings,
};

export type { ClearStudentBookingsResult, ClearCancelledBookingsResult };

export async function updateUserRoleService(
  targetUid: string,
  newRole: 'admin' | 'user'
): Promise<void> {
  await updateDoc(doc(db, 'users', targetUid), { role: newRole });
}

export async function addUserService(newUser: UserProfile): Promise<void> {
  await setDoc(doc(db, 'users', newUser.uid), newUser);
}

export async function updateUserDataWithLedgerService(updatedUser: UserProfile): Promise<void> {
  await updateUserWithAdminBalanceLedger(db, updatedUser);
}

export async function deleteUserService(targetUid: string): Promise<void> {
  await deleteDoc(doc(db, 'users', targetUid));
}

export async function fetchDeletedCompletedStatsService(): Promise<{
  revenue: number;
  count: number;
}> {
  try {
    const statsDoc = await getDoc(doc(db, 'users', 'school_global_stats'));
    if (statsDoc.exists()) {
      const data = statsDoc.data();
      return {
        revenue: data.deletedCompletedRevenue || 0,
        count: data.deletedCompletedCount || 0,
      };
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, 'users/school_global_stats');
  }
  return { revenue: 0, count: 0 };
}
