import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readRepoFile } from '../helpers/readRepoFile';

describe('T32.9B compatibility source cleanup', () => {
  it('deletes leftover client course/booking mutation sources', () => {
    expect(existsSync(join(process.cwd(), 'src/features/courses/courseTransactions.ts'))).toBe(
      false
    );
    expect(
      existsSync(join(process.cwd(), 'src/features/admin/components/users/CoachesManager.tsx'))
    ).toBe(false);

    const bookingTransactions = readRepoFile('src/features/bookings/bookingTransactions.ts');
    expect(bookingTransactions).toContain('export class InsufficientFundsError');
    expect(bookingTransactions).not.toContain('export async function createBookingWithPayment');
    expect(bookingTransactions).not.toContain('export async function addBookingWithPayment');
    expect(bookingTransactions).not.toContain('export async function createGuestBooking');
    expect(bookingTransactions).not.toContain('export async function rescheduleBooking');
    expect(bookingTransactions).not.toContain('export async function cancelBookingWithRefund');
    expect(bookingTransactions).not.toContain('balanceUSD');
  });

  it('does not keep unused admin wallet-ledger subscription or instructor leftover mount', () => {
    const adminService = readRepoFile('src/features/admin/adminService.ts');
    const adminBarrel = readRepoFile('src/features/admin/index.ts');
    const usersBarrel = readRepoFile('src/features/admin/components/users/index.ts');
    const people = readRepoFile('src/features/admin/people/AdminPeopleSection.tsx');
    const directory = readRepoFile('src/features/admin/people/AdminInstructorDirectory.tsx');

    expect(adminService).not.toContain('subscribeWalletLedger');
    expect(adminBarrel).not.toContain('CoachesManager');
    expect(usersBarrel).not.toContain('CoachesManager');
    expect(people).toContain('AdminInstructorDirectory');
    expect(people).not.toContain('CoachesManager');
    expect(directory).toContain('create_instructor_catalog_entry');
    expect(directory).toContain('uploadImage');
  });

  it('does not keep unused refund Rules helpers or leftover i18n keys', () => {
    const rules = readRepoFile('firestore.rules');
    const translations = readRepoFile('src/lib/i18n/translations.ts');
    const overview = readRepoFile(
      'src/features/student-cabinet/components/student/studentBookingOverview.ts'
    );
    const recommendations = readRepoFile(
      'src/features/student-cabinet/components/student/studentRecommendations.ts'
    );

    expect(rules).not.toContain('function validRefundBalanceCreditApply');
    expect(rules).not.toContain('function validRefundLedgerCreate');
    expect(rules).toContain('function validBalanceDecreaseOnly');
    expect(rules).toContain('function validPaymentLedgerCreate');

    expect(translations).not.toContain('resetSchoolFinancesTitle');
    expect(translations).not.toContain('guestWalletPanelTitle');
    expect(translations).toContain('destructiveAdminToolsDisabled');
    expect(translations).toContain('cashFlowGuestWallet');

    expect(overview).not.toContain('export const getEnrolledCourses');
    expect(overview).not.toContain('export const getAvailableCourses');
    expect(recommendations).not.toContain('export const getRecommendedCourses');
    expect(recommendations).not.toContain('export const resolveNextLessonBookingTarget');
    expect(recommendations).toContain('export const getRecommendedInstructors');
  });
});
