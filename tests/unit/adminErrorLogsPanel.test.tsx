import { act, fireEvent, render, screen, waitFor, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  subscribe: vi.fn(),
  remove: vi.fn(),
  clear: vi.fn(),
  notify: vi.fn(),
  t: (key: string) => key,
}));
vi.mock('../../src/app/providers/LanguageContext', () => ({ useLanguage: () => ({ t: mocks.t }) }));
vi.mock('../../src/features/notifications', () => ({
  useNotifications: () => ({ addNotification: mocks.notify }),
}));
vi.mock('../../src/features/admin/adminService', () => ({
  subscribeErrorLogs: mocks.subscribe,
  deleteErrorLog: mocks.remove,
  clearErrorLogs: mocks.clear,
}));
import { ErrorLogsPanel } from '../../src/features/admin/components/settings/ErrorLogsPanel';

describe('error log panel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.subscribe.mockImplementation((onLogs) => {
      onLogs(
        [
          { id: 'hashed', message: 'First error', timestamp: '2026-01-01', source: 'custom' },
          { id: 'second', message: 'Second error', timestamp: '2026-01-01', source: 'firestore' },
        ],
        true
      );
      return vi.fn();
    });
  });
  afterEach(cleanup);
  it('keeps confirmation, resumes partial cleanup, and only announces success on completion', async () => {
    let confirm: () => Promise<void> = async () => {};
    const requestConfirm = vi.fn((_message, callback) => {
      confirm = callback;
    });
    mocks.clear
      .mockResolvedValueOnce({ deleted: 0, done: false, cursor: 'start' })
      .mockResolvedValueOnce({ deleted: 200, done: false, cursor: 'resume' })
      .mockRejectedValueOnce(new Error('failed batch'));
    render(<ErrorLogsPanel onRequestConfirm={requestConfirm} />);
    fireEvent.click(screen.getByRole('button', { name: 'clearAllLogs' }));
    expect(requestConfirm).toHaveBeenCalledWith('clearLogsConfirm', expect.any(Function));
    expect(mocks.clear).not.toHaveBeenCalled();
    await act(() => confirm());
    expect(screen.getByRole('alert')).toHaveTextContent('errorLogsClearFailed');
    expect(screen.getByRole('status')).toHaveTextContent('200');
    expect(mocks.notify).not.toHaveBeenCalled();
    mocks.clear.mockResolvedValueOnce({ deleted: 25, done: true, cursor: null });
    fireEvent.click(screen.getByRole('button', { name: 'errorLogsResumeCleanup' }));
    await act(() => confirm());
    expect(mocks.clear).toHaveBeenLastCalledWith('resume');
    expect(mocks.notify).toHaveBeenCalledExactlyOnceWith(
      'success',
      'logsCleared',
      'logsClearedDesc'
    );
  });
  it('shows deletion failure, updates a confirmed deletion, and keeps search and pagination', async () => {
    mocks.remove.mockRejectedValueOnce(new Error('not found'));
    render(<ErrorLogsPanel onRequestConfirm={vi.fn()} />);
    fireEvent.click(screen.getAllByTitle('deleteLog')[0]);
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('errorLogDeleteFailed')
    );
    expect(mocks.notify).not.toHaveBeenCalled();
    mocks.remove.mockResolvedValueOnce(undefined);
    fireEvent.click(screen.getAllByTitle('deleteLog')[0]);
    await waitFor(() => expect(screen.queryByText('First error')).not.toBeInTheDocument());
    fireEvent.change(screen.getByPlaceholderText('searchLogsPlaceholder'), {
      target: { value: 'absent' },
    });
    expect(screen.getByText('noErrorLogsMatch')).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText('searchLogsPlaceholder'), {
      target: { value: '' },
    });
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'custom' } });
    expect(screen.getByText('noErrorLogsMatch')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'errorLogsLoadMore' }));
    expect(mocks.subscribe).toHaveBeenLastCalledWith(
      expect.any(Function),
      expect.any(Function),
      200
    );
  });
});
