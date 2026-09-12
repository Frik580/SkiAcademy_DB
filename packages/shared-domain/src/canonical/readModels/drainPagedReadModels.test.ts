import { describe, expect, it, vi } from 'vitest';
import {
  drainPagedReadModelItems,
  PagedReadModelDrainCursorError,
} from './drainPagedReadModels';

describe('drainPagedReadModelItems', () => {
  it('follows the cursor chain and concatenates every page', async () => {
    const fetchPage = vi.fn(async (cursor: string | undefined) => {
      if (!cursor) {
        return { items: ['a', 'b'], hasMore: true, nextCursor: 'c1' };
      }
      if (cursor === 'c1') {
        return { items: ['c'], hasMore: true, nextCursor: 'c2' };
      }
      return { items: ['d'], hasMore: false };
    });
    await expect(drainPagedReadModelItems({ fetchPage })).resolves.toEqual(['a', 'b', 'c', 'd']);
    expect(fetchPage.mock.calls.map((call) => call[0])).toEqual([undefined, 'c1', 'c2']);
  });

  it('fails visibly on a repeating cursor', async () => {
    await expect(
      drainPagedReadModelItems({
        fetchPage: async () => ({ items: [1], hasMore: true, nextCursor: 'loop' }),
      })
    ).rejects.toBeInstanceOf(PagedReadModelDrainCursorError);
  });

  it('fails visibly when hasMore is true without nextCursor', async () => {
    await expect(
      drainPagedReadModelItems({
        fetchPage: async () => ({ items: [1], hasMore: true }),
      })
    ).rejects.toBeInstanceOf(PagedReadModelDrainCursorError);
  });
});
