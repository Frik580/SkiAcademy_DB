import { act, cleanup, render, renderHook, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../src/app/providers/LanguageContext';
import { StudentWalletHistoryList } from '../../src/features/student-cabinet/components/student/StudentWalletHistoryList';
import { useAccountWalletHistory } from '../../src/features/wallet/useAccountWalletHistory';
import type { StudentWalletHistoryInput } from '../../src/features/student-cabinet/components/student/studentWalletHistoryContracts';
import type { AccountWalletOperation } from '@ski-academy/shared-domain';
import { prepareAccountWalletHistory } from '../../src/domain/wallet';

const mocks = vi.hoisted(() => ({ query: vi.fn(), account: 'owner', revision: 1 }));
vi.mock('../../src/lib/canonical/canonicalReadModelClient', () => ({
  queryAccountWalletHistory: mocks.query,
}));
vi.mock('../../src/features/auth/authStore', () => ({
  useAuthStore: <T,>(selector: (state: { firebaseUser: { uid: string } }) => T) =>
    selector({ firebaseUser: { uid: mocks.account } }),
}));
vi.mock('../../src/features/wallet/walletStore', () => ({
  useWalletStore: <T,>(selector: (state: { canonicalWalletEventRevision: number }) => T) =>
    selector({ canonicalWalletEventRevision: mocks.revision }),
}));

const operations: AccountWalletOperation[] = [
  {
    id: 'credit',
    amount: 10000,
    currency: 'KZT',
    type: 'top_up',
    source: 'monetary_event',
    createdAt: '2026-08-02T10:00:00.000Z',
  },
  {
    id: 'debit',
    amount: -2500,
    currency: 'KZT',
    type: 'lesson_payment',
    source: 'monetary_event',
    createdAt: '2026-08-01T10:00:00.000Z',
  },
];
const input = (extra: Partial<StudentWalletHistoryInput> = {}): StudentWalletHistoryInput => ({
  operations: prepareAccountWalletHistory(operations, [], [], 'en'),
  loading: false,
  error: false,
  hasMore: false,
  loadMore: vi.fn(),
  retry: vi.fn(),
  ...extra,
});
beforeEach(() => {
  mocks.query.mockReset();
  mocks.account = 'owner';
  mocks.revision = 1;
  localStorage.setItem('alpine_glide_lang', 'en');
});
afterEach(cleanup);

describe('student wallet history', () => {
  it('shows credit/debit in KZT without rescaling the application money contract', () => {
    render(
      <LanguageProvider>
        <StudentWalletHistoryList {...input()} />
      </LanguageProvider>
    );
    expect(screen.getByText('+10,000 ₸')).toBeVisible();
    expect(screen.getByText('−2,500 ₸')).toBeVisible();
    expect(screen.queryByText(/Balance after/)).not.toBeInTheDocument();
  });
  it('separates loading, error and empty states in RU', () => {
    localStorage.setItem('alpine_glide_lang', 'ru');
    const view = render(
      <LanguageProvider>
        <StudentWalletHistoryList {...input({ operations: [], loading: true })} />
      </LanguageProvider>
    );
    expect(screen.getByRole('status')).toHaveTextContent('Загрузка');
    view.rerender(
      <LanguageProvider>
        <StudentWalletHistoryList {...input({ operations: [], error: true })} />
      </LanguageProvider>
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Не удалось загрузить');
    expect(screen.queryByText('Операций по кошельку пока нет.')).not.toBeInTheDocument();
    view.rerender(
      <LanguageProvider>
        <StudentWalletHistoryList {...input({ operations: [] })} />
      </LanguageProvider>
    );
    expect(screen.getByText('Операций по кошельку пока нет.')).toBeVisible();
  });
  it('reads on remount, ignores participant rerenders, and appends cursor pages once', async () => {
    mocks.query
      .mockResolvedValueOnce({ operations, nextCursor: 'next' })
      .mockResolvedValue({ operations: [operations[1]] });
    const hook = renderHook(() => useAccountWalletHistory(), {
      initialProps: { participant: 'self' },
    });
    await waitFor(() => expect(hook.result.current.operations).toHaveLength(2));
    hook.rerender({ participant: 'child' });
    expect(mocks.query).toHaveBeenCalledTimes(1);
    act(() => hook.result.current.loadMore());
    await waitFor(() => expect(hook.result.current.hasMore).toBe(false));
    expect(mocks.query).toHaveBeenLastCalledWith('next');
    expect(hook.result.current.operations).toHaveLength(2);
    hook.unmount();
    renderHook(() => useAccountWalletHistory());
    await waitFor(() => expect(mocks.query).toHaveBeenCalledTimes(3));
  });
  it('does not let a late response leak across accounts', async () => {
    let resolve!: (value: unknown) => void;
    mocks.query
      .mockReturnValueOnce(
        new Promise((r) => {
          resolve = r;
        })
      )
      .mockResolvedValue({ operations: [] });
    const hook = renderHook(() => useAccountWalletHistory());
    mocks.account = 'other';
    hook.rerender();
    await waitFor(() => expect(hook.result.current.loading).toBe(false));
    await act(async () => resolve({ operations }));
    expect(hook.result.current.operations).toEqual([]);
  });
  it('exposes read failures and can retry without calling them empty history', async () => {
    mocks.query.mockRejectedValueOnce(new Error('unavailable')).mockResolvedValue({ operations });
    const hook = renderHook(() => useAccountWalletHistory());
    await waitFor(() => expect(hook.result.current.error).toBe(true));
    act(() => hook.result.current.retry());
    await waitFor(() => expect(hook.result.current.operations).toHaveLength(2));
    expect(hook.result.current.error).toBe(false);
  });

  it('refreshes on committed wallet event revision even when the balance stays the same', async () => {
    mocks.query
      .mockResolvedValueOnce({ operations: [operations[0]] })
      .mockResolvedValue({ operations });
    const hook = renderHook(() => useAccountWalletHistory());
    await waitFor(() => expect(hook.result.current.operations).toHaveLength(1));
    mocks.revision += 2;
    hook.rerender();
    await waitFor(() => expect(hook.result.current.operations).toHaveLength(2));
    expect(mocks.query).toHaveBeenCalledTimes(2);
  });
});
