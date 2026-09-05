import { describe, expect, it } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import {
  AccountIdSchema,
  AccountSchema,
  CorrelationIdSchema,
  InstructorIdSchema,
  timestampFromDate,
} from '@ski-academy/shared-domain';
import { createQueryAdminIdentityReadModelsHandler } from './queryAdminIdentityReadModelsCallable';
import { INSTRUCTOR_PRESENTATION_AVATAR_URL_MAX } from './instructorPresentationAvatar';

const adminId = AccountIdSchema.parse('account_admin_identity_avatar_01');
const userId = AccountIdSchema.parse('account_user_identity_avatar_01');
const instructorId = InstructorIdSchema.parse('instructor_identity_avatar_ok_01');
const badAvatarInstructorId = InstructorIdSchema.parse('instructor_identity_avatar_bad_01');
const dataUrlInstructorId = InstructorIdSchema.parse('instructor_identity_avatar_data_01');
const correlationId = CorrelationIdSchema.parse('correlation_admin_identity_avatar_01');
const createdAt = timestampFromDate(new Date('2026-01-01T00:00:00.000Z'));

const VALID_STORAGE_URL =
  'https://firebasestorage.googleapis.com/v0/b/ski-school-8f3ca.appspot.com/o/instructors%2Fok.jpg?alt=media&token=abc123';

function nestedValue(data: Record<string, unknown>, field: string): unknown {
  return field
    .split('.')
    .reduce<unknown>(
      (current, key) =>
        current && typeof current === 'object'
          ? (current as Record<string, unknown>)[key]
          : undefined,
      data
    );
}

function snapshot(entries: Array<[string, Record<string, unknown>]>) {
  return {
    empty: entries.length === 0,
    size: entries.length,
    docs: entries.map(([path, data]) => ({
      id: path.split('/').at(-1)!,
      exists: true,
      data: () => data,
    })),
  };
}

function fakeFirestore(
  seed: Record<string, Record<string, unknown>>,
  reads?: Map<string, number>,
  queryReads?: Map<string, number>
): Firestore {
  const collectionEntries = (path: string) =>
    Object.entries(seed).filter(([key]) => {
      if (!key.startsWith(`${path}/`)) return false;
      return key.slice(path.length + 1).split('/').length === 1;
    });

  const buildQuery = (
    entries: () => Array<[string, Record<string, unknown>]>,
    queryKey: string
  ) => {
    const recordQuery = () => queryReads?.set(queryKey, (queryReads.get(queryKey) ?? 0) + 1);
    const chain: {
      where: (field: string, _op: string, value: unknown) => typeof chain;
      orderBy: (..._args: unknown[]) => typeof chain;
      startAfter: (..._args: unknown[]) => typeof chain;
      limit: (count: number) => { get: () => Promise<ReturnType<typeof snapshot>> };
      get: () => Promise<ReturnType<typeof snapshot>>;
    } = {
      where: (field: string, _op: string, value: unknown) => {
        const filtered = () =>
          entries().filter(([, data]) => {
            const actual = nestedValue(data, field);
            if (Array.isArray(actual) && _op === 'array-contains') {
              return actual.includes(value);
            }
            return Object.is(actual, value);
          });
        return buildQuery(filtered, queryKey);
      },
      orderBy: () => chain,
      startAfter: () => chain,
      limit: (count: number) => ({
        get: async () => {
          recordQuery();
          return snapshot(entries().slice(0, count));
        },
      }),
      get: async () => {
        recordQuery();
        return snapshot(entries());
      },
    };
    return chain;
  };

  const collection = (path: string) => {
    const entries = () => collectionEntries(path);
    return {
      ...buildQuery(entries, path),
      doc: (id: string) => ({
        get: async () => {
          const key = `${path}/${id}`;
          reads?.set(key, (reads.get(key) ?? 0) + 1);
          const data = seed[`${path}/${id}`];
          return {
            id,
            exists: data !== undefined,
            data: () => data,
          };
        },
      }),
    };
  };

  return {
    collection,
    collectionGroup: (name: string) =>
      buildQuery(
        () =>
          Object.entries(seed).filter(([key]) => {
            const suffix = `/${name}/`;
            return (
              key.includes(suffix) &&
              key.slice(key.indexOf(suffix) + suffix.length).split('/').length === 1
            );
          }),
        `collectionGroup:${name}`
      ),
  } as unknown as Firestore;
}

function seedAccount(accountId: typeof adminId | typeof userId, role: 'admin' | 'user') {
  return {
    ...AccountSchema.parse({
      accountId,
      lifecycle: { status: 'active' },
      revision: 1,
      createdAt,
      updatedAt: createdAt,
      audit: {
        createdByCommandId: 'command_seed',
        lastChangedByCommandId: 'command_seed',
        correlationId,
      },
    }),
    displayName: role === 'admin' ? 'Admin' : 'User',
    role,
  };
}

function catalogBase(id: string, name: string, avatarUrl?: string) {
  return {
    id,
    instructorId: id,
    name,
    specialty: 'ski' as const,
    pricePerHourKZT: 15_000,
    isAvailable: true,
    revision: 1,
    ...(avatarUrl !== undefined ? { avatarUrl } : {}),
  };
}

function seed() {
  return {
    [`users/${adminId}`]: seedAccount(adminId, 'admin'),
    [`users/${userId}`]: seedAccount(userId, 'user'),
    [`instructors/${instructorId}`]: catalogBase(instructorId, 'Safe Coach', VALID_STORAGE_URL),
    [`instructors/${badAvatarInstructorId}`]: catalogBase(
      badAvatarInstructorId,
      'Legacy Oversized Avatar Coach',
      `https://example.com/${'x'.repeat(INSTRUCTOR_PRESENTATION_AVATAR_URL_MAX + 1)}`
    ),
    [`instructors/${dataUrlInstructorId}`]: catalogBase(
      dataUrlInstructorId,
      'Legacy Data Url Coach',
      `data:image/png;base64,${'A'.repeat(120)}`
    ),
  };
}

describe('Admin Identity instructor avatar presentation', () => {
  it('reuses the callable-validated administrator Account in the read model', async () => {
    const reads = new Map<string, number>();
    const handler = createQueryAdminIdentityReadModelsHandler(fakeFirestore(seed(), reads));

    await handler({
      auth: { uid: adminId },
      data: { scope: 'admin_instructor_detail', instructorId },
    } as never);

    expect(reads.get(`users/${adminId}`)).toBe(1);
  });

  it('returns admin_instructor_detail without avatarUrl when historical avatarUrl exceeds bound', async () => {
    const handler = createQueryAdminIdentityReadModelsHandler(fakeFirestore(seed()));
    const result = await handler({
      auth: { uid: adminId },
      data: {
        scope: 'admin_instructor_detail',
        instructorId: badAvatarInstructorId,
      },
    } as never);

    expect(result.scope).toBe('admin_instructor_detail');
    if (result.scope !== 'admin_instructor_detail') return;
    expect(result.item).toMatchObject({
      instructorId: badAvatarInstructorId,
      name: 'Legacy Oversized Avatar Coach',
      specialty: 'ski',
      isAvailable: true,
      pricePerHourKZT: 15_000,
    });
    expect(result.item).not.toHaveProperty('avatarUrl');
    expect(result.item?.authorizedActions?.length).toBeGreaterThan(0);
  });

  it('keeps admin_instructor_list readable when a row has oversized historical avatarUrl', async () => {
    const handler = createQueryAdminIdentityReadModelsHandler(fakeFirestore(seed()));
    const result = await handler({
      auth: { uid: adminId },
      data: {
        scope: 'admin_instructor_list',
        pageSize: 50,
      },
    } as never);

    expect(result.scope).toBe('admin_instructor_list');
    if (result.scope !== 'admin_instructor_list') return;
    const row = result.items.find((item) => item.instructorId === badAvatarInstructorId);
    expect(row).toMatchObject({
      instructorId: badAvatarInstructorId,
      name: 'Legacy Oversized Avatar Coach',
      isAvailable: true,
    });
    expect(row).not.toHaveProperty('avatarUrl');
  });

  it('does not run roster or CourseDay count scans for instructor list rows', async () => {
    const queryReads = new Map<string, number>();
    const handler = createQueryAdminIdentityReadModelsHandler(
      fakeFirestore(seed(), undefined, queryReads)
    );
    const result = await handler({
      auth: { uid: adminId },
      data: { scope: 'admin_instructor_list', pageSize: 20 },
    } as never);

    expect(result.scope).toBe('admin_instructor_list');
    expect(queryReads.get('courses')).toBeUndefined();
    expect(queryReads.get('collectionGroup:days')).toBeUndefined();
    if (result.scope === 'admin_instructor_list') {
      expect(result.items[0]).not.toHaveProperty('courseRosterCount');
      expect(result.items[0]).not.toHaveProperty('courseDayAssignmentCount');
    }
  });

  it('omits data-URL avatarUrl from admin_instructor_detail', async () => {
    const handler = createQueryAdminIdentityReadModelsHandler(fakeFirestore(seed()));
    const result = await handler({
      auth: { uid: adminId },
      data: {
        scope: 'admin_instructor_detail',
        instructorId: dataUrlInstructorId,
      },
    } as never);

    expect(result.scope).toBe('admin_instructor_detail');
    if (result.scope !== 'admin_instructor_detail') return;
    expect(result.item).toMatchObject({
      instructorId: dataUrlInstructorId,
      name: 'Legacy Data Url Coach',
    });
    expect(result.item).not.toHaveProperty('avatarUrl');
  });

  it('preserves a valid Firebase Storage avatarUrl on admin_instructor_detail', async () => {
    const handler = createQueryAdminIdentityReadModelsHandler(fakeFirestore(seed()));
    const result = await handler({
      auth: { uid: adminId },
      data: {
        scope: 'admin_instructor_detail',
        instructorId,
      },
    } as never);

    expect(result.scope).toBe('admin_instructor_detail');
    if (result.scope !== 'admin_instructor_detail') return;
    expect(result.item).toMatchObject({
      instructorId,
      name: 'Safe Coach',
      avatarUrl: VALID_STORAGE_URL,
    });
  });
});

describe('Admin Identity instructor revision 0 preservation', () => {
  it('exposes revision 0 and matching expectedRevision on admin_instructor_detail', async () => {
    const revisionZeroId = InstructorIdSchema.parse('instructor_identity_revision_zero_01');
    const handler = createQueryAdminIdentityReadModelsHandler(
      fakeFirestore({
        ...seed(),
        [`instructors/${revisionZeroId}`]: {
          ...catalogBase(revisionZeroId, 'Zero Revision Coach', VALID_STORAGE_URL),
          revision: 0,
        },
      })
    );
    const result = await handler({
      auth: { uid: adminId },
      data: {
        scope: 'admin_instructor_detail',
        instructorId: revisionZeroId,
      },
    } as never);

    expect(result.scope).toBe('admin_instructor_detail');
    if (result.scope !== 'admin_instructor_detail') return;
    expect(result.item?.revision).toBe(0);
    expect(result.item?.authorizedActions).toEqual(
      expect.arrayContaining([
        { kind: 'update_instructor_catalog_profile', expectedRevision: 0 },
        { kind: 'deactivate_instructor_catalog', expectedRevision: 0 },
      ])
    );
  });

  it('exposes revision 0 for legacy instructor documents without revision field', async () => {
    const missingRevisionId = InstructorIdSchema.parse('instructor_identity_revision_missing_01');
    const withoutRevision = { ...catalogBase(missingRevisionId, 'Missing Revision Coach', VALID_STORAGE_URL) };
    delete (withoutRevision as { revision?: number }).revision;
    const handler = createQueryAdminIdentityReadModelsHandler(
      fakeFirestore({
        ...seed(),
        [`instructors/${missingRevisionId}`]: withoutRevision,
      })
    );

    const detail = await handler({
      auth: { uid: adminId },
      data: {
        scope: 'admin_instructor_detail',
        instructorId: missingRevisionId,
      },
    } as never);
    expect(detail.scope).toBe('admin_instructor_detail');
    if (detail.scope !== 'admin_instructor_detail') return;
    expect(detail.item?.revision).toBe(0);
    expect(detail.item?.authorizedActions).toEqual(
      expect.arrayContaining([
        { kind: 'update_instructor_catalog_profile', expectedRevision: 0 },
        { kind: 'deactivate_instructor_catalog', expectedRevision: 0 },
      ])
    );

    const list = await handler({
      auth: { uid: adminId },
      data: { scope: 'admin_instructor_list' },
    } as never);
    expect(list.scope).toBe('admin_instructor_list');
    if (list.scope !== 'admin_instructor_list') return;
    const row = list.items.find((item) => item.instructorId === missingRevisionId);
    expect(row?.revision).toBe(0);
    expect(row?.authorizedActions).toEqual(
      expect.arrayContaining([
        { kind: 'update_instructor_catalog_profile', expectedRevision: 0 },
        { kind: 'deactivate_instructor_catalog', expectedRevision: 0 },
      ])
    );
  });
});

describe('Admin Identity account role authorization and filters', () => {
  const ownerId = AccountIdSchema.parse('account_admin_identity_owner_role_01');
  const ordinaryAdminId = AccountIdSchema.parse('account_admin_identity_ordinary_role_01');
  const userTargetId = AccountIdSchema.parse('account_admin_identity_user_role_01');
  const schoolGlobalStatsId = AccountIdSchema.parse('school_global_stats');
  const uninitializedId = AccountIdSchema.parse('account_admin_identity_uninit_role_01');

  function ownerSeedAccount(accountId: typeof ownerId, role: 'admin' | 'user', systemRole?: 'owner') {
    return {
      ...seedAccount(accountId, role),
      ...(systemRole ? { systemRole } : {}),
      displayName: accountId,
    };
  }

  function roleDirectorySeed() {
    return {
      [`users/${ownerId}`]: ownerSeedAccount(ownerId, 'admin', 'owner'),
      [`users/${ordinaryAdminId}`]: ownerSeedAccount(ordinaryAdminId, 'admin'),
      [`users/${userTargetId}`]: ownerSeedAccount(userTargetId, 'user'),
      [`users/${schoolGlobalStatsId}`]: {
        displayName: 'School Global Stats',
        // Non-canonical legacy aggregate — no Account lifecycle/revision.
      },
      [`users/${uninitializedId}`]: {
        displayName: 'Uninitialized Pseudo',
        email: 'pseudo@example.com',
        role: 'user',
      },
    };
  }

  it('does not advertise change_account_role for uninitialized or school_global_stats docs', async () => {
    const handler = createQueryAdminIdentityReadModelsHandler(fakeFirestore(roleDirectorySeed()));
    const result = await handler({
      auth: { uid: ownerId },
      data: { scope: 'admin_account_list', pageSize: 50 },
    } as never);
    expect(result.scope).toBe('admin_account_list');
    if (result.scope !== 'admin_account_list') return;

    const stats = result.items.find((item) => item.accountId === schoolGlobalStatsId);
    expect(stats?.lifecycle).toBe('uninitialized');
    expect(stats?.revision).toBeUndefined();
    expect(stats?.authorizedActions.some((action) => action.kind === 'change_account_role')).toBe(
      false
    );

    const uninit = result.items.find((item) => item.accountId === uninitializedId);
    expect(uninit?.lifecycle).toBe('uninitialized');
    expect(uninit?.revision).toBeUndefined();
    expect(uninit?.authorizedActions.some((action) => action.kind === 'change_account_role')).toBe(
      false
    );
  });

  it('filters admin_account_list by role=admin and includes owner', async () => {
    const handler = createQueryAdminIdentityReadModelsHandler(fakeFirestore(roleDirectorySeed()));
    const result = await handler({
      auth: { uid: ownerId },
      data: { scope: 'admin_account_list', role: 'admin', pageSize: 50 },
    } as never);
    expect(result.scope).toBe('admin_account_list');
    if (result.scope !== 'admin_account_list') return;
    const ids = result.items.map((item) => item.accountId);
    expect(ids).toContain(ownerId);
    expect(ids).toContain(ordinaryAdminId);
    expect(ids).not.toContain(userTargetId);
    expect(ids).not.toContain(schoolGlobalStatsId);
    const ownerRow = result.items.find((item) => item.accountId === ownerId);
    expect(ownerRow?.role.systemRole).toBe('owner');
    expect(ownerRow?.authorizedActions.some((action) => action.kind === 'change_account_role')).toBe(
      false
    );
    const ordinary = result.items.find((item) => item.accountId === ordinaryAdminId);
    expect(ordinary?.authorizedActions.some((action) => action.kind === 'change_account_role')).toBe(
      true
    );
  });

  it('does not advertise change_account_role when actor is ordinary admin', async () => {
    const handler = createQueryAdminIdentityReadModelsHandler(fakeFirestore(roleDirectorySeed()));
    const result = await handler({
      auth: { uid: ordinaryAdminId },
      data: { scope: 'admin_account_list', role: 'admin', pageSize: 50 },
    } as never);
    expect(result.scope).toBe('admin_account_list');
    if (result.scope !== 'admin_account_list') return;
    for (const item of result.items) {
      expect(item.authorizedActions.some((action) => action.kind === 'change_account_role')).toBe(
        false
      );
    }
  });
});
