export class PagedReadModelDrainCursorError extends Error {
  readonly code = 'paged_read_model_drain_cursor' as const;

  constructor(message = 'Invalid paged read-model drain cursor.') {
    super(message);
    this.name = 'PagedReadModelDrainCursorError';
  }
}

export interface PagedReadModelPage<T> {
  readonly items: readonly T[];
  readonly hasMore: boolean;
  readonly nextCursor?: string;
}

/**
 * Unbounded cursor drain for canonical list read models.
 * Detects missing/repeating cursors; does not silently truncate.
 */
export async function drainPagedReadModelItems<T>(input: {
  readonly fetchPage: (cursor: string | undefined) => Promise<PagedReadModelPage<T>>;
}): Promise<readonly T[]> {
  const items: T[] = [];
  const seenCursors = new Set<string>();
  let cursor: string | undefined;

  while (true) {
    const page = await input.fetchPage(cursor);
    items.push(...page.items);
    if (!page.hasMore) {
      return items;
    }
    if (!page.nextCursor || seenCursors.has(page.nextCursor)) {
      throw new PagedReadModelDrainCursorError(
        page.nextCursor
          ? 'Paged read-model drain repeated a pagination cursor.'
          : 'Paged read-model drain reported hasMore without nextCursor.'
      );
    }
    seenCursors.add(page.nextCursor);
    cursor = page.nextCursor;
  }
}
