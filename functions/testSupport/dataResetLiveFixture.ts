import {
  AccountSchema,
  ParticipantSchema,
  WalletSchema,
  timestampFromDate,
} from '@ski-academy/shared-domain';
import {
  revenueBooking,
  revenuePayment,
  revenueAudit,
} from '../../tests/helpers/instructorRevenueFixtures';

export const liveAccounts = ['live_owner', 'live_admin', 'live_coach', 'live_parent', 'live_other'];
export const livePerson = 'live_person';
export const liveCoach = 'live_instructor';
const at = timestampFromDate(new Date('2026-01-01T00:00:00Z'));
export function liveFixtureData(): Record<string, Record<string, unknown>> {
  const docs: Record<string, Record<string, unknown>> = {};
  for (const id of liveAccounts) {
    docs[`users/${id}`] = {
      ...AccountSchema.parse({
        accountId: id,
        dataScope: 'live',
        lifecycle: { status: 'active' },
        revision: 1,
        createdAt: at,
        updatedAt: at,
        audit: revenueAudit,
      }),
      uid: id,
      email: `${id}@example.test`,
      role: id === 'live_admin' ? 'admin' : 'user',
      displayName: id,
    };
    docs[`users/${id}/wallet/state`] = WalletSchema.parse({
      accountId: id,
      dataScope: 'live',
      currency: 'KZT',
      balance: 0,
      revision: 1,
      eventRevision: 0,
      createdAt: at,
      updatedAt: at,
    });
    docs[`users/${id}/wallet/starter_credit_grant`] = {
      granted: true,
      amountKzt: 250,
      grantedAt: at,
    };
  }
  docs[`participants/${livePerson}`] = ParticipantSchema.parse({
    participantId: livePerson,
    dataScope: 'live',
    displayName: 'Preserved person',
    age: { kind: 'age_years', years: 25 },
    skillLevel: 'intermediate',
    discipline: 'ski',
    management: { kind: 'managed', participantManagementId: 'live_management' },
    lifecycle: { status: 'active' },
    revision: 1,
    createdAt: at,
    updatedAt: at,
    audit: revenueAudit,
  });
  docs['participant_management/live_management'] = {
    participantManagementId: 'live_management',
    participantId: livePerson,
    accountId: liveAccounts[0],
    role: 'owner',
    authority: 'self',
    status: 'active',
    revision: 1,
    createdAt: at,
    updatedAt: at,
    audit: revenueAudit,
  };
  docs[`instructors/${liveCoach}`] = {
    id: liveCoach,
    dataScope: 'live',
    name: 'Preserved instructor',
    isAvailable: true,
    pricePerHourKZT: 12000,
  };
  const booking = revenueBooking('live_old');
  docs['bookings/live_old'] = {
    ...booking,
    dataScope: 'live',
    attribution: {
      bookingOrigin: 'admin',
      bookedBy: { kind: 'account', accountId: liveAccounts[1] },
    },
    party: { kind: 'individual', participantIds: [livePerson] },
    occurrence: {
      ...booking.occurrence,
      instructorId: liveCoach,
      serviceParty: { ...booking.occurrence.serviceParty!, participantIds: [livePerson] },
    },
  };
  docs['payments/payment_live_old'] = revenuePayment('live_old', {
    dataScope: 'live',
    payerAccountId: liveAccounts[0],
  });
  docs['settings/school'] = { currency: 'KZT', timezone: 'Asia/Almaty' };
  docs['settings/starter_credit'] = { amountKzt: 250 };
  for (const [id, path] of [
    ['err_linked', 'bookings/live_old'],
    ['err_unrelated', ''],
  ] as const)
    docs[`error_logs/${id}`] = {
      id,
      message: 'Fixture error',
      timestamp: '2026-01-01T00:00:00Z',
      userId: liveAccounts[0],
      url: 'http://localhost/',
      userAgent: 'test',
      source: 'firestore',
      operation: 'get',
      path,
    };
  return docs;
}
