import { describe, expect, it } from 'vitest';
import {
  LIVE_CANONICAL_READ_SCOPE,
  documentMatchesReadScope,
  identityDocumentMatchesReadScope,
  TestSessionIdSchema,
} from '@ski-academy/shared-domain';
import {
  isLiveCompatibleIdentity,
  isLiveCompatibleResource,
} from '../../src/lib/canonical/liveCompatibleClientRead';

const sessionA = TestSessionIdSchema.parse('test_client_filter_a01');

describe('liveCompatibleClientRead', () => {
  it('keeps legacy and explicit LIVE documents on mixed collection listeners', () => {
    expect(isLiveCompatibleResource({})).toBe(true);
    expect(isLiveCompatibleResource({ dataScope: 'live' })).toBe(true);
    expect(
      isLiveCompatibleResource({ dataScope: 'test', testSessionId: sessionA })
    ).toBe(false);
    expect(documentMatchesReadScope(LIVE_CANONICAL_READ_SCOPE, { dataScope: 'live' })).toBe(
      isLiveCompatibleResource({ dataScope: 'live' })
    );
  });

  it('hides TEST identities from LIVE directories without using email', () => {
    expect(isLiveCompatibleIdentity({ email: 'ksusha@test.ru' })).toBe(true);
    expect(
      identityDocumentMatchesReadScope(LIVE_CANONICAL_READ_SCOPE, {
        dataScope: 'test',
        email: 'customer@example.com',
      })
    ).toBe(false);
    expect(
      isLiveCompatibleIdentity({ dataScope: 'test', email: 'customer@example.com' })
    ).toBe(false);
  });
});
