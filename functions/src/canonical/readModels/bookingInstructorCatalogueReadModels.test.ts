import { describe, expect, it } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import {
  LIVE_CANONICAL_READ_SCOPE,
  TestSessionIdSchema,
  testCanonicalReadScope,
} from '@ski-academy/shared-domain';
import { queryBookingInstructorCatalogueReadModels } from './bookingInstructorCatalogueReadModels';

const sessionA = TestSessionIdSchema.parse('test_catalogue_session_a01');
const sessionB = TestSessionIdSchema.parse('test_catalogue_session_b01');

function instructor(
  id: string,
  fields: Record<string, unknown>
): Record<string, unknown> {
  return {
    name: id,
    specialty: 'ski',
    languages: ['English'],
    experienceYears: 5,
    bio: '',
    avatarUrl: '',
    pricePerHourKZT: 30_000,
    isAvailable: true,
    ...fields,
  };
}

function firestore(seed: Record<string, Record<string, unknown>>): Firestore {
  return {
    collection: (name: string) => ({
      limit: () => ({
        get: async () => {
          const docs = Object.entries(seed)
            .filter(([path]) => path.startsWith(`${name}/`) && path.split('/').length === 2)
            .map(([path, data]) => ({
              id: path.split('/')[1]!,
              data: () => data,
            }));
          return { docs };
        },
      }),
    }),
  } as unknown as Firestore;
}

const catalogue = {
  [`instructors/instructor_catalogue_live`]: instructor('instructor_catalogue_live', {
    name: 'Arsenii',
    dataScope: 'live',
    email: 'contains-test@example.com',
    linkedAccountId: 'account_hidden',
  }),
  [`instructors/instructor_catalogue_legacy`]: instructor('instructor_catalogue_legacy', {
    name: 'Elena',
  }),
  [`instructors/instructor_catalogue_test_a`]: instructor('instructor_catalogue_test_a', {
    name: 'Test Coach',
    dataScope: 'test',
    testSessionId: sessionA,
    email: 'coach@example.com',
    linkedAccountId: 'account_test_instructor',
  }),
  [`instructors/instructor_catalogue_test_b`]: instructor('instructor_catalogue_test_b', {
    name: 'Other Session Coach',
    dataScope: 'test',
    testSessionId: sessionB,
  }),
  [`instructors/instructor_catalogue_unstamped_test`]: instructor(
    'instructor_catalogue_unstamped_test',
    {
      name: 'Unstamped Test Coach',
      dataScope: 'test',
    }
  ),
};

describe('booking instructor catalogue read model', () => {
  it('returns explicit and legacy LIVE instructors and hides TEST rows', async () => {
    const result = await queryBookingInstructorCatalogueReadModels(firestore(catalogue), {
      readScope: LIVE_CANONICAL_READ_SCOPE,
    });
    expect(result.items.map((item) => item.name)).toEqual(['Arsenii', 'Elena']);
    expect(result.items.every((item) => !('email' in item) && !('linkedAccountId' in item))).toBe(
      true
    );
    expect(result.items.find((item) => item.name === 'Arsenii')?.pricePerHourKZT).toBe(30_000);
  });

  it('returns only the resolved TestSession instructors', async () => {
    const result = await queryBookingInstructorCatalogueReadModels(firestore(catalogue), {
      readScope: testCanonicalReadScope(sessionA),
    });
    expect(result.items.map((item) => item.instructorId)).toEqual(['instructor_catalogue_test_a']);
    expect(result.items[0]).toMatchObject({
      name: 'Test Coach',
      isAvailable: true,
      pricePerHourKZT: 30_000,
      specialty: 'ski',
    });
  });

  it('normalizes legacy spoken languages and keeps localized bios', async () => {
    const result = await queryBookingInstructorCatalogueReadModels(
      firestore({
        'instructors/instructor_catalogue_localized': instructor(
          'instructor_catalogue_localized',
          {
            name: 'Arsenii',
            languages: ['русский', 'English'],
            bio: 'Профессиональный инструктор Школы.',
            bioRu: 'Профессиональный инструктор Школы.',
            bioEn: 'Professional school instructor.',
          }
        ),
      }),
      { readScope: LIVE_CANONICAL_READ_SCOPE }
    );
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      name: 'Arsenii',
      languages: ['ru', 'en'],
      bio: 'Профессиональный инструктор Школы.',
      bioRu: 'Профессиональный инструктор Школы.',
      bioEn: 'Professional school instructor.',
    });
  });

  it('keeps a legacy instructor that only has bio', async () => {
    const result = await queryBookingInstructorCatalogueReadModels(
      firestore({
        'instructors/instructor_catalogue_bio_only': instructor('instructor_catalogue_bio_only', {
          name: 'Legacy Coach',
          languages: ['Russian'],
          bio: 'Only legacy bio',
        }),
      }),
      { readScope: LIVE_CANONICAL_READ_SCOPE }
    );
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      name: 'Legacy Coach',
      languages: ['ru'],
      bio: 'Only legacy bio',
    });
    expect(result.items[0]).not.toHaveProperty('bioRu');
    expect(result.items[0]).not.toHaveProperty('bioEn');
  });

  it('hides another session and does not treat email text as scope', async () => {
    const result = await queryBookingInstructorCatalogueReadModels(firestore(catalogue), {
      readScope: testCanonicalReadScope(sessionB),
    });
    expect(result.items.map((item) => item.name)).toEqual(['Other Session Coach']);
  });
});
