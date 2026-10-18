import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import { ParticipantProgressReadModelSchema, timestampFromDate } from '@ski-academy/shared-domain';

const mocks = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('./participantProgressReadModels', async (original) => ({
  ...(await original<typeof import('./participantProgressReadModels')>()),
  queryParticipantProgressReadModels: mocks.query,
}));
vi.mock('../testSessions/canonicalReadScopeResolver', async (original) => ({
  ...(await original<typeof import('../testSessions/canonicalReadScopeResolver')>()),
  resolveCanonicalReadScope: async () => ({ dataScope: 'live' }),
}));
import { createQueryParticipantProgressReadModelsHandler } from './queryParticipantProgressReadModelsCallable';

const at = timestampFromDate(new Date('2026-10-01T00:00:00Z'));
const account = {
  accountId: 'account_wire_01',
  lifecycle: { status: 'active' },
  revision: 1,
  createdAt: at,
  updatedAt: at,
  audit: {
    createdByCommandId: 'command_wire_seed',
    lastChangedByCommandId: 'command_wire_seed',
    correlationId: 'correlation_wire_seed',
  },
};
beforeEach(() => mocks.query.mockReset());
describe('progress wire compatibility without historical rewrites', () => {
  it('omits new optional state for old strict readers and retains it for current readers', async () => {
    const item = {
      participantId: 'participant_wire_01',
      level: 1,
      skillScores: {},
      skillComments: {},
      revision: 1,
      levelState: { marker: 'new-state' },
    };
    const result = { scope: 'managed', items: [item] };
    mocks.query.mockResolvedValue(result);
    const firestore = {
      collection: () => ({ doc: () => ({ get: async () => ({ data: () => account }) }) }),
    } as unknown as Firestore;
    const handler = createQueryParticipantProgressReadModelsHandler(firestore);
    const request = (data: Record<string, unknown>) =>
      ({ auth: { uid: account.accountId }, data }) as unknown as Parameters<typeof handler>[0];
    const legacy = await handler(request({ scope: 'managed' }));
    expect(legacy.items[0]).not.toHaveProperty('levelState');
    expect(
      ParticipantProgressReadModelSchema.omit({ levelState: true }).safeParse(legacy.items[0])
        .success
    ).toBe(true);
    expect(
      (await handler(request({ scope: 'managed', participantProgressContract: 2 }))).items[0]
    ).toHaveProperty('levelState');
    expect(item.levelState).toEqual({ marker: 'new-state' });
  });
  it('does not accept unknown query fields as a compatibility fallback', async () => {
    const handler = createQueryParticipantProgressReadModelsHandler({} as Firestore);
    await expect(
      handler({
        auth: { uid: account.accountId },
        data: { scope: 'managed', unknownAuthority: true },
      } as unknown as Parameters<typeof handler>[0])
    ).rejects.toThrow();
    expect(mocks.query).not.toHaveBeenCalled();
  });
});
