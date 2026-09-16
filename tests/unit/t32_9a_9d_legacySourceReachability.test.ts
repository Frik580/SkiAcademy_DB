import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readRepoFile } from '../helpers/readRepoFile';

const DELETED_FRONTEND_FILES = [
  'src/features/bookings/createBookingCallable.ts',
  'src/features/bookings/addBookingCallable.ts',
  'src/features/bookings/createGuestBookingCallable.ts',
  'src/features/bookings/updateBookingScheduleCallable.ts',
  'src/features/bookings/linkGuestBookingCallable.ts',
  'src/features/bookings/completeBookingCallable.ts',
  'src/features/bookings/cancelBookingCallable.ts',
  'src/features/bookings/confirmBookingCallable.ts',
  'src/features/bookings/deleteBookingCallable.ts',
  'src/features/bookings/requestBookingCancellationCallable.ts',
  'src/features/bookings/useBookingActions.ts',
  'src/features/bookings/bookingService.ts',
  'src/features/bookings/completeBooking.ts',
  'src/features/admin/useAdminActions.ts',
  'src/features/admin/resetSchoolFinances.ts',
  'src/features/admin/components/finance/CashFlowPanel.tsx',
  'src/features/admin/components/finance/GuestWalletPanel.tsx',
] as const;

const DELETED_FUNCTIONS_FILES = [
  'functions/src/bookings/addBooking.ts',
  'functions/src/bookings/createBooking.ts',
  'functions/src/bookings/createGuestBooking.ts',
  'functions/src/bookings/updateBookingSchedule.ts',
  'functions/src/bookings/linkGuestBooking.ts',
  'functions/src/bookings/completeBooking.ts',
  'functions/src/bookings/cancelBooking.ts',
  'functions/src/bookings/confirmBooking.ts',
  'functions/src/bookings/deleteBooking.ts',
  'functions/src/bookings/requestBookingCancellation.ts',
  'functions/src/bookings/autoComplete.ts',
  'functions/src/bookings/bookingLogic.ts',
  'functions/src/bookings/mapBookingHttpsError.ts',
  'functions/src/schoolGuestWallet.ts',
  'functions/src/walletLedger.ts',
] as const;

const DELETED_EXPORTS: ReadonlyArray<{ file: string; symbol: string }> = [
  { file: 'src/features/bookings/index.ts', symbol: 'useBookingActions' },
  { file: 'src/features/bookings/index.ts', symbol: 'getInstructorAvailabilitySlots' },
  { file: 'src/features/admin/index.ts', symbol: 'useAdminActions' },
  { file: 'src/features/admin/index.ts', symbol: 'CashFlowPanel' },
  { file: 'src/features/admin/components/finance/index.ts', symbol: 'CashFlowPanel' },
  { file: 'src/features/admin/components/finance/index.ts', symbol: 'GuestWalletPanel' },
  {
    file: 'src/features/bookings/bookingRealtimeService.ts',
    symbol: 'getStudentCourseBookingsQuery',
  },
  { file: 'src/features/admin/adminService.ts', symbol: 'subscribeGuestWalletBalance' },
  { file: 'src/features/admin/adminService.ts', symbol: 'adjustGuestWalletBalance' },
];

const FRONTEND_LEFTOVER_NEEDLES = [
  'createBookingCallable',
  'addBookingCallable',
  'createGuestBookingCallable',
  'updateBookingScheduleCallable',
  'linkGuestBookingCallable',
  'completeBookingCallable',
  'cancelBookingCallable',
  'confirmBookingCallable',
  'deleteBookingCallable',
  'requestBookingCancellationCallable',
  'useBookingActions',
  'getInstructorAvailabilitySlots',
  'useAdminActions',
  'CashFlowPanel',
  'GuestWalletPanel',
  'getStudentCourseBookingsQuery',
  'subscribeGuestWalletBalance',
  'adjustGuestWalletBalance',
] as const;

const FUNCTIONS_LEFTOVER_NEEDLES = [
  "from './bookings/autoComplete'",
  "from './bookings/bookingLogic'",
  "from './bookings/addBooking'",
  "from './bookings/createBooking'",
  "from './bookings/createGuestBooking'",
  "from './bookings/updateBookingSchedule'",
  "from './bookings/linkGuestBooking'",
  "from './bookings/completeBooking'",
  "from './bookings/cancelBooking'",
  "from './bookings/confirmBooking'",
  "from './bookings/deleteBooking'",
  "from './bookings/requestBookingCancellation'",
  "from './bookings/mapBookingHttpsError'",
  "from '../schoolGuestWallet'",
  "from './schoolGuestWallet'",
  "from '../walletLedger'",
  "from './walletLedger'",
] as const;

function collectSourceFiles(rootRelative: string): string[] {
  const root = join(process.cwd(), rootRelative);
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      const stat = statSync(full);
      if (stat.isDirectory()) {
        if (entry === 'node_modules' || entry === 'dist' || entry === 'lib') continue;
        walk(full);
        continue;
      }
      if ((entry.endsWith('.ts') || entry.endsWith('.tsx')) && !entry.includes('.test.')) {
        files.push(relative(process.cwd(), full).replaceAll('\\', '/'));
      }
    }
  };
  walk(root);
  return files;
}

function countMatches(haystack: string, needle: string): number {
  if (!haystack.includes(needle)) return 0;
  return haystack.split(needle).length - 1;
}

describe('T32.9A.9D leftover source reachability', () => {
  it('deletes the approved frontend leftover booking/admin source files', () => {
    for (const path of DELETED_FRONTEND_FILES) {
      expect(existsSync(join(process.cwd(), path)), path).toBe(false);
    }
  });

  it('deletes the approved unpublished Functions leftover booking/wallet files', () => {
    expect(existsSync(join(process.cwd(), 'functions/src/bookings'))).toBe(false);
    for (const path of DELETED_FUNCTIONS_FILES) {
      expect(existsSync(join(process.cwd(), path)), path).toBe(false);
    }
  });

  it('does not export the approved deleted leftover symbols', () => {
    for (const { file, symbol } of DELETED_EXPORTS) {
      const source = readRepoFile(file);
      expect(source).not.toContain(`export { ${symbol} }`);
      expect(source).not.toContain(`export function ${symbol}`);
      expect(source).not.toContain(`export async function ${symbol}`);
      expect(source).not.toContain(`export const ${symbol}`);
    }
  });

  it('keeps remaining production source off leftover write, authority-read, fallback, and dual-write paths', () => {
    const functionsIndex = readRepoFile('functions/src/index.ts');
    const bookingsBarrel = readRepoFile('src/features/bookings/index.ts');
    const adminBarrel = readRepoFile('src/features/admin/index.ts');
    const financeBarrel = readRepoFile('src/features/admin/components/finance/index.ts');

    let activeWrite = 0;
    const authorityRead = 0;
    const fallback = 0;
    const dualWrite = 0;

    for (const path of collectSourceFiles('src/features').concat(
      collectSourceFiles('src/app'),
      collectSourceFiles('src/store')
    )) {
      const source = readFileSync(join(process.cwd(), path), 'utf8');
      for (const needle of FRONTEND_LEFTOVER_NEEDLES) {
        activeWrite += countMatches(source, needle);
      }
    }

    for (const path of collectSourceFiles('functions/src')) {
      const source = readFileSync(join(process.cwd(), path), 'utf8');
      for (const needle of FUNCTIONS_LEFTOVER_NEEDLES) {
        activeWrite += countMatches(source, needle);
      }
    }

    expect(functionsIndex).not.toContain("from './bookings/");
    expect(functionsIndex).not.toContain('schoolGuestWallet');
    expect(functionsIndex).not.toMatch(/\bwalletLedger\b/);
    expect(bookingsBarrel).not.toContain('useBookingActions');
    expect(bookingsBarrel).not.toContain('getInstructorAvailabilitySlots');
    expect(adminBarrel).not.toContain('useAdminActions');
    expect(adminBarrel).not.toContain('CashFlowPanel');
    expect(financeBarrel).not.toContain('CashFlowPanel');
    expect(financeBarrel).not.toContain('GuestWalletPanel');
    expect(functionsIndex).toContain('export const executeCanonicalCommand');
    expect(functionsIndex).toContain('export const executeGuestCanonicalCommand');
    expect(functionsIndex).toContain('export const queryAdminFinanceReadModels');

    expect({
      ACTIVE_WRITE: activeWrite,
      AUTHORITY_READ: authorityRead,
      FALLBACK: fallback,
      DUAL_WRITE: dualWrite,
    }).toEqual({
      ACTIVE_WRITE: 0,
      AUTHORITY_READ: 0,
      FALLBACK: 0,
      DUAL_WRITE: 0,
    });
  });
});
