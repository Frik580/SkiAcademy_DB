import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const next = vi.hoisted(() => vi.fn());
vi.mock('../../src/features/chat/homeworkHistory', () => ({
  createHomeworkHistory: () => ({ next }),
}));
import { useInstructorHomeworkHistory } from '../../src/features/student-cabinet/components/student/useInstructorHomeworkHistory';

describe('homework history lifecycle', () => {
  beforeEach(() => {
    next.mockReset();
  });
  it('is lazy outside homework and ignores repeated clicks while pending', async () => {
    let finish!: (page: unknown) => void;
    next.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    const { result, rerender } = renderHook(
      ({ enabled }) => useInstructorHomeworkHistory(['thread'], 'account/child/coach', enabled),
      { initialProps: { enabled: false } }
    );
    expect(next).not.toHaveBeenCalled();
    rerender({ enabled: true });
    act(() => {
      result.current.loadMore();
      result.current.loadMore();
    });
    expect(next).toHaveBeenCalledTimes(1);
    await act(async () => finish({ messages: [], hasMore: false }));
    expect(result.current.loading).toBe(false);
    expect(result.current.hasMore).toBe(false);
  });

  it.each(['account/child-b/coach-a', 'account/child-a/coach-b'])(
    'discards stale results on scope switch to %s',
    async (newScope) => {
      let finish!: (page: unknown) => void;
      next
        .mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              finish = resolve;
            })
        )
        .mockResolvedValue({ messages: [{ id: 'new', threadId: 'new' }], hasMore: false });
      const { result, rerender } = renderHook(
        ({ scope }) => useInstructorHomeworkHistory(['thread'], scope, true),
        { initialProps: { scope: 'account/child-a/coach-a' } }
      );
      rerender({ scope: newScope });
      await waitFor(() => expect(result.current.messages[0]?.id).toBe('new'));
      await act(async () => finish({ messages: [{ id: 'old', threadId: 'old' }], hasMore: true }));
      expect(result.current.messages.map((m) => m.id)).toEqual(['new']);
    }
  );

  it('retains loaded results on error and supports retry without duplicates', async () => {
    const item = { id: 'one', threadId: 'thread' };
    next
      .mockResolvedValueOnce({ messages: [item], hasMore: true })
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({
        messages: [item, { id: 'two', threadId: 'thread' }],
        hasMore: false,
      });
    const { result } = renderHook(() => useInstructorHomeworkHistory(['thread'], 'scope', true));
    await waitFor(() => expect(result.current.messages).toHaveLength(1));
    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.error).toBe(true));
    expect(result.current.messages).toHaveLength(1);
    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.messages).toHaveLength(2));
    expect(result.current.error).toBe(false);
  });

  it('discards requests after closing and refetches safely on reopen', async () => {
    let finish!: (page: unknown) => void;
    next
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          })
      )
      .mockResolvedValue({ messages: [], hasMore: false });
    const { result, rerender, unmount } = renderHook(
      ({ enabled }) => useInstructorHomeworkHistory(['thread'], 'scope', enabled),
      { initialProps: { enabled: true } }
    );
    rerender({ enabled: false });
    await act(async () =>
      finish({ messages: [{ id: 'stale', threadId: 'thread' }], hasMore: true })
    );
    expect(result.current.messages).toEqual([]);
    rerender({ enabled: true });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(next).toHaveBeenCalledTimes(2);
    unmount();
  });
});
