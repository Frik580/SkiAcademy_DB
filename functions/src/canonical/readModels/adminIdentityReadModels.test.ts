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

function fakeFirestore(seed: Record<string, Record<string, unknown>>): Firestore {
  const collectionEntries = (path: string) =>
    Object.entries(seed).filter(([key]) => {
      if (!key.startsWith(`${path}/`)) return false;
      return key.slice(path.length + 1).split('/').length === 1;
    });

  const buildQuery = (entries: () => Array<[string, Record<string, unknown>]>) => {
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
        return buildQuery(filtered);
      },
      orderBy: () => chain,
      startAfter: () => chain,
      limit: (count: number) => ({
        get: async () => snapshot(entries().slice(0, count)),
      }),
      get: async () => snapshot(entries()),
    };
    return chain;
  };

  const collection = (path: string) => {
    const entries = () => collectionEntries(path);
    return {
      ...buildQuery(entries),
      doc: (id: string) => ({
        get: async () => {
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
      buildQuery(() =>
        Object.entries(seed).filter(([key]) => {
          const suffix = `/${name}/`;
          return (
            key.includes(suffix) &&
            key.slice(key.indexOf(suffix) + suffix.length).split('/').length === 1
          );
        })
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
