import { describe, expect, it } from 'vitest';
import {
  AccountIdSchema,
  CorrelationIdSchema,
  IdempotencyKeySchema,
  InstructorIdSchema,
} from '@ski-academy/shared-domain';
import { buildCommandContextFromCallableAccount } from './callableTransportAdapter';
import {
  resolveCallableAccountContext,
  isAdministratorProfile,
} from './resolveCallableAccountContext';

describe('resolveCallableAccountContext', () => {
  const accountId = AccountIdSchema.parse('account_resolve_callable_01');

  it('propagates the server-side instructor profile identity into callable metadata', () => {
    const instructorId = InstructorIdSchema.parse('instructor_resolve_callable_01');
    const resolved = resolveCallableAccountContext(
      { role: 'user', instructorId, isInstructor: true },
      {
        authUid: accountId,
        commandKind: 'record_course_day_attendance',
        exercisedCapability: 'instructor',
      }
    );

    const context = buildCommandContextFromCallableAccount(resolved, {
      idempotencyKey: IdempotencyKeySchema.parse('idem-resolve-callable-instructor-01'),
      correlationId: CorrelationIdSchema.parse('correlation_resolve_callable_instructor_01'),
    });

    expect(resolved.instructorId).toBe(instructorId);
    expect(context.transportMetadata?.instructor_id).toBe(instructorId);
  });

  it('derives account identity from auth uid', () => {
    const resolved = resolveCallableAccountContext(
      { role: 'user' },
      {
        authUid: accountId,
        commandKind: 'complete_booking',
        exercisedCapability: 'account_owner',
      }
    );
    expect(resolved.accountId).toBe(accountId);
    expect(resolved.capability).toBe('account_owner');
    expect(resolved.source).toBe('client_callable');
  });

  it('rejects administrator capability spoofing from client transport', () => {
    expect(() =>
      resolveCallableAccountContext(
        { role: 'user' },
        {
          authUid: accountId,
          commandKind: 'complete_booking',
          exercisedCapability: 'administrator',
        }
      )
    ).toThrow('forbidden_capability');
  });

  it('upgrades administrator command kinds only for admin profiles', () => {
    const resolved = resolveCallableAccountContext(
      { role: 'admin' },
      {
        authUid: accountId,
        commandKind: 'confirm_guest_booking',
      }
    );
    expect(resolved.capability).toBe('administrator');
    expect(resolved.source).toBe('admin_callable');

    expect(() =>
      resolveCallableAccountContext(
        { role: 'user' },
        {
          authUid: accountId,
          commandKind: 'confirm_guest_booking',
        }
      )
    ).toThrow('forbidden');
  });

  it('routes external Payment recording only through trusted Admin authority', () => {
    expect(
      resolveCallableAccountContext(
        { role: 'admin' },
        { authUid: accountId, commandKind: 'record_provider_payment_event' }
      )
    ).toMatchObject({
      accountId,
      capability: 'administrator',
      source: 'admin_callable',
    });
    expect(() =>
      resolveCallableAccountContext(
        { role: 'user' },
        { authUid: accountId, commandKind: 'record_provider_payment_event' }
      )
    ).toThrow('forbidden');
  });

  it('routes admin wallet payment only through trusted Admin authority', () => {
    expect(
      resolveCallableAccountContext(
        { role: 'admin' },
        { authUid: accountId, commandKind: 'pay_service_from_wallet_as_administrator' }
      )
    ).toMatchObject({
      accountId,
      capability: 'administrator',
      source: 'admin_callable',
    });
    expect(() =>
      resolveCallableAccountContext(
        { role: 'user' },
        { authUid: accountId, commandKind: 'pay_service_from_wallet_as_administrator' }
      )
    ).toThrow('forbidden');
  });

  it('routes transfer_course_enrollment through trusted Admin authority', () => {
    expect(
      resolveCallableAccountContext(
        { role: 'admin' },
        { authUid: accountId, commandKind: 'transfer_course_enrollment' }
      )
    ).toMatchObject({
      accountId,
      capability: 'administrator',
      source: 'admin_callable',
    });
    expect(() =>
      resolveCallableAccountContext(
        { role: 'user' },
        { authUid: accountId, commandKind: 'transfer_course_enrollment' }
      )
    ).toThrow('forbidden');
  });

  it('detects administrator profile from trusted user document fields', () => {
    expect(isAdministratorProfile({ role: 'admin' })).toBe(true);
    expect(isAdministratorProfile({ role: 'user' })).toBe(false);
  });

  it.each([
    'create_confirmed_booking',
    'create_course_enrollments',
    'reschedule_booking',
    'change_booking_instructor',
    'change_booking_duration',
    'record_booking_attendance',
    'record_course_day_attendance',
    'resolve_attendance_outcome',
    'update_participant_profile',
    'revoke_participant_management',
  ] as const)('routes %s through explicit trusted administrator context', (commandKind) => {
    expect(
      resolveCallableAccountContext(
        { role: 'admin' },
        {
          authUid: accountId,
          commandKind,
          administratorContext: true,
        }
      )
    ).toMatchObject({
      accountId,
      capability: 'administrator',
      source: 'admin_callable',
    });
  });

  it('preserves client and instructor semantics for Admin accounts without Admin context', () => {
    expect(
      resolveCallableAccountContext(
        { role: 'admin' },
        {
          authUid: accountId,
          commandKind: 'reschedule_booking',
          exercisedCapability: 'account_owner',
        }
      )
    ).toMatchObject({ capability: 'account_owner', source: 'client_callable' });
    expect(
      resolveCallableAccountContext(
        { role: 'admin' },
        {
          authUid: accountId,
          commandKind: 'record_booking_attendance',
          exercisedCapability: 'instructor',
        }
      )
    ).toMatchObject({ capability: 'instructor', source: 'client_callable' });
    expect(
      resolveCallableAccountContext(
        { role: 'admin' },
        {
          authUid: accountId,
          commandKind: 'record_course_day_attendance',
          exercisedCapability: 'instructor',
        }
      )
    ).toMatchObject({ capability: 'instructor', source: 'client_callable' });
  });

  it('does not route complete_booking or guest linking through Admin authority', () => {
    expect(
      resolveCallableAccountContext(
        { role: 'admin' },
        {
          authUid: accountId,
          commandKind: 'complete_booking',
        }
      )
    ).toMatchObject({
      capability: 'account_owner',
      source: 'client_callable',
    });
    expect(
      resolveCallableAccountContext(
        { role: 'admin' },
        {
          authUid: accountId,
          commandKind: 'link_guest_booking_to_account',
        }
      )
    ).toMatchObject({
      capability: 'account_owner',
      source: 'client_callable',
    });
    expect(
      resolveCallableAccountContext(
        { role: 'admin' },
        {
          authUid: accountId,
          commandKind: 'link_guest_course_enrollment_to_account',
        }
      )
    ).toMatchObject({
      capability: 'account_owner',
      source: 'client_callable',
    });
  });

  it('routes Admin guest identity-link command kinds through trusted Admin authority', () => {
    expect(
      resolveCallableAccountContext(
        { role: 'admin' },
        {
          authUid: accountId,
          commandKind: 'link_guest_booking_to_account_as_administrator',
        }
      )
    ).toMatchObject({
      accountId,
      capability: 'administrator',
      source: 'admin_callable',
    });
    expect(
      resolveCallableAccountContext(
        { role: 'admin' },
        {
          authUid: accountId,
          commandKind: 'link_guest_course_enrollment_to_account_as_administrator',
        }
      )
    ).toMatchObject({
      accountId,
      capability: 'administrator',
      source: 'admin_callable',
    });
    expect(() =>
      resolveCallableAccountContext(
        { role: 'user' },
        {
          authUid: accountId,
          commandKind: 'link_guest_booking_to_account_as_administrator',
        }
      )
    ).toThrow('forbidden');
    expect(() =>
      resolveCallableAccountContext(
        { role: 'user' },
        {
          authUid: accountId,
          commandKind: 'link_guest_course_enrollment_to_account_as_administrator',
        }
      )
    ).toThrow('forbidden');
  });

  it('routes identity administration command kinds through trusted Admin authority', () => {
    expect(
      resolveCallableAccountContext(
        { role: 'admin' },
        { authUid: accountId, commandKind: 'disable_account' }
      )
    ).toMatchObject({
      accountId,
      capability: 'administrator',
      source: 'admin_callable',
    });
    expect(
      resolveCallableAccountContext(
        { role: 'admin' },
        { authUid: accountId, commandKind: 'delete_instructor_catalog_entry' }
      )
    ).toMatchObject({
      accountId,
      capability: 'administrator',
      source: 'admin_callable',
    });
    expect(() =>
      resolveCallableAccountContext(
        { role: 'user' },
        { authUid: accountId, commandKind: 'delete_instructor_catalog_entry' }
      )
    ).toThrow('forbidden');
  });

  it.each([
    'create_administrative_availability_block',
    'reschedule_administrative_availability_block',
    'release_administrative_availability_block',
  ] as const)(
    'routes Planner availability command %s through trusted Admin authority',
    (commandKind) => {
      expect(
        resolveCallableAccountContext(
          { role: 'admin' },
          { authUid: accountId, commandKind, administratorContext: true }
        )
      ).toMatchObject({
        accountId,
        capability: 'administrator',
        source: 'admin_callable',
      });
      expect(() =>
        resolveCallableAccountContext(
          { role: 'user' },
          { authUid: accountId, commandKind, administratorContext: true }
        )
      ).toThrow('forbidden');
    }
  );
});
