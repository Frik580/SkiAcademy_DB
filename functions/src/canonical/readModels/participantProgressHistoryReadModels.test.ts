import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import {
  InstructorIdSchema,
  ParticipantIdSchema,
  timestampFromDate,
  QueryParticipantProgressHistoryReadModelsInputSchema,
  QueryParticipantProgressHistoryReadModelsResultSchema,
} from '@ski-academy/shared-domain';
import {
  projectParticipantProgressHistoryEvent,
  queryParticipantProgressHistoryReadModels,
} from './participantProgressHistoryReadModels';
import { instructorHasProgressAccess } from './participantProgressReadModels';

vi.mock('./participantProgressReadModels', async (original) => ({
  ...(await original<typeof import('./participantProgressReadModels')>()),
  instructorHasProgressAccess: vi.fn(async () => true),
}));
const participantId = ParticipantIdSchema.parse('history_person');
const at = timestampFromDate(new Date('2026-11-06T10:00:00Z'));
const options = {
  instructorId: InstructorIdSchema.parse('history_coach'),
  readScope: { dataScope: 'live' as const, purpose: 'live_product' as const },
  cursorSecret: 'history-unit-test-secret',
};
const input = { scope: 'instructor' as const, participantId };
function event(revision = 1, patch: Record<string, unknown> = {}) {
  return {
    participantId,
    revision,
    at,
    kind: 'update_participant_progress',
    oldScores: {},
    newScores: { carving: revision % 100 },
    oldComments: {},
    newComments: {},
    ...patch,
  };
}
function fixture(events: Record<string, unknown>[]) {
  const docs = new Map(events.map((data, index) => [String(data.id ?? `history_${index}`), data]));
  const person = {
    participantId,
    displayName: 'Student',
    age: { kind: 'age_years', years: 10 },
    skillLevel: 'beginner',
    discipline: 'ski',
    management: { kind: 'unmanaged_guest' },
    lifecycle: { status: 'active' },
    revision: 1,
    createdAt: at,
    updatedAt: at,
    audit: { createdByCommandId: 'seed', lastChangedByCommandId: 'seed', correlationId: 'seed' },
  };
  const reads: number[] = [];
  const database = {
    collection(name: string) {
      const query = {
        where() {
          return query;
        },
        orderBy() {
          return query;
        },
        startAfter(revision: number, id: string) {
          return makeQuery(revision, id);
        },
        limit(limit: number) {
          return makeQuery(undefined, undefined, limit);
        },
        doc(id: string) {
          return {
            get: async () => ({ data: () => (name === 'participants' ? person : docs.get(id)) }),
          };
        },
      };
      function makeQuery(after?: number, afterId?: string, limit = 21) {
        return {
          limit: (n: number) => makeQuery(after, afterId, n),
          get: async () => {
            const selected = [...docs]
              .filter(
                ([id, row]) =>
                  row.participantId === participantId &&
                  typeof row.revision === 'number' &&
                  row.revision >= 0 &&
                  row.revision <= Number.MAX_SAFE_INTEGER &&
                  (after === undefined ||
                    row.revision < after ||
                    (row.revision === after && id < afterId!))
              )
              .sort(([a, x], [b, y]) => Number(y.revision) - Number(x.revision) || (a < b ? 1 : -1))
              .slice(0, limit);
            reads.push(selected.length);
            return {
              size: selected.length,
              docs: selected.map(([id, data]) => ({ id, data: () => data })),
            };
          },
        };
      }
      return query;
    },
  };
  return { db: database as unknown as Firestore, docs, reads };
}
beforeEach(() => vi.mocked(instructorHasProgressAccess).mockResolvedValue(true));

describe('historical observation projection', () => {
  it.each(['constructor', 'toString', 'valueOf'])(
    'preserves additions and deletions for prototype-named Skill ID %s',
    (skillId) => {
      const added = projectParticipantProgressHistoryEvent(
        'history_1',
        event(1, { newScores: { [skillId]: 0 }, newComments: { [skillId]: 'New' } })
      );
      expect(added?.skillChanges).toEqual([{ skillId, newScore: 0 }]);
      expect(added?.commentChanges).toEqual([{ skillId, newText: 'New' }]);
      const removed = projectParticipantProgressHistoryEvent(
        'history_2',
        event(2, {
          oldScores: { [skillId]: 0 },
          newScores: {},
          oldComments: { [skillId]: 'Before' },
        })
      );
      expect(removed?.skillChanges).toEqual([{ skillId, previousScore: 0 }]);
      expect(removed?.commentChanges).toEqual([{ skillId, previousText: 'Before' }]);
    }
  );
  it('preserves missing versus zero, increases, decreases and removals in one revision', () => {
    const item = projectParticipantProgressHistoryEvent(
      'history_1',
      event(1, {
        oldScores: { up: 10, down: 20, removed: 0, same: 5 },
        newScores: { up: 20, down: 10, zero: 0, same: 5 },
      })
    );
    expect(item?.skillChanges).toEqual([
      { skillId: 'down', previousScore: 20, newScore: 10 },
      { skillId: 'removed', previousScore: 0 },
      { skillId: 'up', previousScore: 10, newScore: 20 },
      { skillId: 'zero', newScore: 0 },
    ]);
  });
  it('projects comment addition, edit and deletion without unchanged comments', () => {
    const item = projectParticipantProgressHistoryEvent(
      'history_1',
      event(1, {
        oldComments: { changed: 'Before', removed: 'Remove', same: 'Same' },
        newComments: { changed: 'After', added: 'New', same: 'Same' },
      })
    );
    expect(item?.commentChanges).toEqual([
      { skillId: 'added', newText: 'New' },
      { skillId: 'changed', previousText: 'Before', newText: 'After' },
      { skillId: 'removed', previousText: 'Remove' },
    ]);
  });
  it.each(['coach_one', 'coach_two', undefined])(
    'uses only event authorship: %s',
    (instructorId) => {
      const item = projectParticipantProgressHistoryEvent(
        'history_1',
        event(1, {
          instructorId,
          updatedBy: { instructorId: 'wrong' },
          actor: { accountId: 'private' },
          email: 'secret',
          messages: ['secret'],
        })
      );
      expect(item?.instructorId).toBe(instructorId);
      expect(Object.keys(item!)).toEqual(
        expect.arrayContaining([
          'id',
          'participantId',
          'revision',
          'at',
          'kind',
          'skillChanges',
          'commentChanges',
        ])
      );
      expect(JSON.stringify(item)).not.toMatch(/wrong|private|secret|email|actor|messages/);
    }
  );
  it('retains reliable scores when comments were not recorded; does not invent additions from one snapshot', () => {
    expect(
      projectParticipantProgressHistoryEvent(
        'history_1',
        event(1, { oldComments: undefined, newComments: undefined })
      )?.skillChanges
    ).toHaveLength(1);
    expect(
      projectParticipantProgressHistoryEvent('history_1', event(1, { oldScores: undefined }))
    ).toBeUndefined();
  });
  it.each([
    { kind: 'manage_participant_level' },
    { newScores: {} },
    { at: 'invalid' },
    { newScores: { carving: 101 } },
    { revision: -1 },
  ])('safely skips empty/invalid rows %j', (patch) => {
    expect(projectParticipantProgressHistoryEvent('history_1', event(1, patch))).toBeUndefined();
  });
});

describe('bounded history pagination and access', () => {
  it.each([0, 1, 19, 20, 21, 45, 100])(
    'paginates %i numeric revisions without duplicates or gaps',
    async (count) => {
      const { db } = fixture(Array.from({ length: count }, (_, i) => event(i + 1)));
      const revisions: number[] = [];
      let cursor: string | undefined;
      do {
        const page = await queryParticipantProgressHistoryReadModels(
          db,
          { ...input, cursor },
          options
        );
        expect(page.items.length).toBeLessThanOrEqual(20);
        revisions.push(...page.items.map((item) => item.revision));
        cursor = page.nextCursor;
      } while (cursor);
      expect(revisions).toEqual(Array.from({ length: count }, (_, i) => count - i));
    }
  );
  it('handles repeated revision values and newly inserted head events', async () => {
    const { db, docs } = fixture(
      Array.from({ length: 42 }, (_, i) => event(Math.floor(i / 2) + 1))
    );
    const first = await queryParticipantProgressHistoryReadModels(db, input, options);
    docs.set('new_head', event(99));
    const second = await queryParticipantProgressHistoryReadModels(
      db,
      { ...input, cursor: first.nextCursor },
      options
    );
    const third = await queryParticipantProgressHistoryReadModels(
      db,
      { ...input, cursor: second.nextCursor },
      options
    );
    const ids = [...first.items, ...second.items, ...third.items].map((item) => item.id);
    expect(new Set(ids).size).toBe(42);
    expect(ids).not.toContain('new_head');
  });
  it('limits empty scans to 100 reads and keeps continuation to older observations', async () => {
    const { db, reads } = fixture([
      ...Array.from({ length: 130 }, (_, i) => event(i + 2, { kind: 'manage_participant_level' })),
      event(1),
    ]);
    const first = await queryParticipantProgressHistoryReadModels(db, input, options);
    expect(first.items).toEqual([]);
    expect(reads.reduce((a, b) => a + b, 0)).toBe(100);
    expect(first.nextCursor).toBeDefined();
    const second = await queryParticipantProgressHistoryReadModels(
      db,
      { ...input, cursor: first.nextCursor },
      options
    );
    expect(second.items.map((item) => item.revision)).toEqual([1]);
  });
  it('rechecks access before cursor or history reads on each page', async () => {
    const { db, reads } = fixture(Array.from({ length: 25 }, (_, i) => event(i + 1)));
    const first = await queryParticipantProgressHistoryReadModels(db, input, options);
    const before = reads.length;
    vi.mocked(instructorHasProgressAccess).mockResolvedValue(false);
    await expect(
      queryParticipantProgressHistoryReadModels(db, { ...input, cursor: first.nextCursor }, options)
    ).rejects.toThrow('not permitted');
    expect(reads.length).toBe(before);
  });
  it('skips corrupt rows and isolates participant and read scope including legacy LIVE', async () => {
    const { db } = fixture([
      event(5, { participantId: 'someone_else' }),
      event(4, { dataScope: 'test', testSessionId: 'test_other' }),
      event(3, { at: 'bad' }),
      event(2, { dataScope: 'live' }),
      event(1),
    ]);
    const page = await queryParticipantProgressHistoryReadModels(db, input, options);
    expect(page.items.map((item) => item.revision)).toEqual([2, 1]);
  });
  it.each(['garbage', '../events/private', Buffer.from('{}').toString('base64url')])(
    'rejects malformed cursor %s',
    async (cursor) => {
      await expect(
        queryParticipantProgressHistoryReadModels(fixture([]).db, { ...input, cursor }, options)
      ).rejects.toMatchObject({ code: 'invalid-argument' });
    }
  );
  it('binds authenticated cursor to Participant, scope and signing key and rejects tampering', async () => {
    const { db } = fixture(Array.from({ length: 25 }, (_, i) => event(i + 1)));
    const first = await queryParticipantProgressHistoryReadModels(db, input, options);
    const cursor = first.nextCursor!;
    await expect(
      queryParticipantProgressHistoryReadModels(
        db,
        { ...input, participantId: ParticipantIdSchema.parse('other_person'), cursor },
        options
      )
    ).rejects.toThrow('not permitted');
    await expect(
      queryParticipantProgressHistoryReadModels(
        db,
        { ...input, cursor },
        {
          ...options,
          readScope: {
            dataScope: 'test',
            testSessionId: 'test_other' as never,
            purpose: 'product_test',
          },
        }
      )
    ).rejects.toThrow('not permitted');
    await expect(
      queryParticipantProgressHistoryReadModels(
        db,
        { ...input, cursor },
        { ...options, cursorSecret: 'wrong_key' }
      )
    ).rejects.toMatchObject({ code: 'invalid-argument' });
    const bytes = Buffer.from(cursor, 'base64url');
    bytes[bytes.length - 1]! ^= 1;
    await expect(
      queryParticipantProgressHistoryReadModels(
        db,
        { ...input, cursor: bytes.toString('base64url') },
        options
      )
    ).rejects.toMatchObject({ code: 'invalid-argument' });
  });
  it('continues past noncanonical raw IDs and hides scanned TEST positions', async () => {
    const { db } = fixture([
      ...Array.from({ length: 100 }, (_, i) =>
        event(i + 2, { id: `test.private.${i}`, dataScope: 'test', testSessionId: 'test_hidden' })
      ),
      event(Infinity),
      event(1),
    ]);
    const first = await queryParticipantProgressHistoryReadModels(db, input, options);
    expect(first.items).toEqual([]);
    expect(Buffer.from(first.nextCursor!, 'base64url').toString('utf8')).not.toContain(
      'test.private'
    );
    const second = await queryParticipantProgressHistoryReadModels(
      db,
      { ...input, cursor: first.nextCursor },
      options
    );
    expect(second.items.map((row) => row.revision)).toEqual([1]);
  });
  it('continues past malformed observation IDs without breaking the page', async () => {
    const { db } = fixture([event(3, { id: 'old.event' }), event(Infinity), event(1)]);
    expect(
      (await queryParticipantProgressHistoryReadModels(db, input, options)).items.map(
        (row) => row.revision
      )
    ).toEqual([1]);
  });
  it('bounds response bytes without losing large observations', async () => {
    const oldComments = Object.fromEntries(
      Array.from({ length: 128 }, (_, i) => [`s${i}`, 'Я'.repeat(2000)])
    );
    const newComments = Object.fromEntries(
      Array.from({ length: 128 }, (_, i) => [`s${i}`, 'Ю'.repeat(2000)])
    );
    const { db } = fixture(
      Array.from({ length: 4 }, (_, i) => event(i + 1, { oldComments, newComments }))
    );
    const first = await queryParticipantProgressHistoryReadModels(db, input, options);
    expect(Buffer.byteLength(JSON.stringify(first))).toBeLessThanOrEqual(2 * 1024 * 1024);
    expect(first.nextCursor).toBeDefined();
    const all = [...first.items];
    let cursor = first.nextCursor;
    while (cursor) {
      const page = await queryParticipantProgressHistoryReadModels(
        db,
        { ...input, cursor },
        options
      );
      expect(Buffer.byteLength(JSON.stringify(page))).toBeLessThanOrEqual(2 * 1024 * 1024);
      all.push(...page.items);
      cursor = page.nextCursor;
    }
    expect(all).toHaveLength(4);
  });
});

describe('history transport contract', () => {
  it.each([
    { scope: 'admin' },
    { scope: 'managed' },
    { instructorId: 'spoofed' },
    { accountId: 'spoofed' },
    { pageSize: 1000 },
    { cursor: '' },
    { cursor: 'a'.repeat(16385) },
  ])('rejects excess or invalid request fields %j', (patch) => {
    expect(
      QueryParticipantProgressHistoryReadModelsInputSchema.safeParse({ ...input, ...patch }).success
    ).toBe(false);
  });
  it('rejects arbitrary output fields and oversized pages', () => {
    expect(
      QueryParticipantProgressHistoryReadModelsResultSchema.safeParse({
        ...input,
        items: [],
        email: 'private',
      }).success
    ).toBe(false);
    const item = projectParticipantProgressHistoryEvent('history_1', event())!;
    expect(
      QueryParticipantProgressHistoryReadModelsResultSchema.safeParse({
        ...input,
        items: Array(21).fill(item),
      }).success
    ).toBe(false);
  });
});
