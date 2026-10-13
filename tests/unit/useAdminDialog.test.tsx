import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useAdminDialog } from '../../src/features/admin/components/useAdminDialog';

vi.mock('../../src/app/providers/LanguageContext', () => ({
  useLanguage: () => ({ language: 'en' }),
}));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function Example({
  completed,
  kind = 'confirm',
}: {
  completed: (value: unknown) => void;
  kind?: 'confirm' | 'alert' | 'queue';
}) {
  const { confirm, alert, dialog } = useAdminDialog();
  return (
    <>
      <button
        onClick={async () => {
          if (kind === 'queue') {
            completed(await Promise.all([confirm('First'), confirm('Second')]));
          } else if (kind === 'alert') {
            await alert('Processing failed');
            completed('acknowledged');
          } else completed(await confirm('Remove this item?'));
        }}
      >
        Open native replacement
      </button>
      {dialog}
    </>
  );
}

describe('admin native dialog adapter', () => {
  it('returns false on Escape and true only on explicit confirmation, without native dialogs', async () => {
    const native = vi.spyOn(window, 'confirm').mockImplementation(() => {
      throw new Error('Native confirm used');
    });
    const completed = vi.fn();
    render(<Example completed={completed} />);
    const user = userEvent.setup();
    await user.click(screen.getByText('Open native replacement'));
    expect(completed).not.toHaveBeenCalled();
    await user.keyboard('{Escape}');
    expect(completed).toHaveBeenLastCalledWith(false);
    await user.click(screen.getByText('Open native replacement'));
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Confirm', exact: true })
    );
    expect(completed).toHaveBeenLastCalledWith(true);
    expect(native).not.toHaveBeenCalled();
    expect(screen.getByText('Open native replacement')).toHaveFocus();
  });

  it('cancels a pending confirmation when its owning surface unmounts', async () => {
    const completed = vi.fn();
    const view = render(<Example completed={completed} />);
    await userEvent.click(screen.getByText('Open native replacement'));
    await act(async () => view.unmount());
    expect(completed).toHaveBeenCalledWith(false);
    expect(document.documentElement).not.toHaveClass('modal-scroll-lock');
  });

  it('serializes concurrent requests without losing either result or the focus/scroll lock', async () => {
    const completed = vi.fn();
    render(<Example kind="queue" completed={completed} />);
    const user = userEvent.setup();
    await user.click(screen.getByText('Open native replacement'));
    expect(screen.getByText('First')).toBeInTheDocument();
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Confirm', exact: true })
    );
    expect(screen.getByText('Second')).toBeInTheDocument();
    expect(document.documentElement).toHaveClass('modal-scroll-lock');
    await user.keyboard('{Escape}');
    expect(completed).toHaveBeenCalledWith([true, false]);
    expect(screen.getByText('Open native replacement')).toHaveFocus();
  });

  it('keeps alert acknowledgement pending until OK, then restores focus', async () => {
    const native = vi.spyOn(window, 'alert').mockImplementation(() => {
      throw new Error('Native alert used');
    });
    const completed = vi.fn();
    render(<Example kind="alert" completed={completed} />);
    const user = userEvent.setup();
    await user.click(screen.getByText('Open native replacement'));
    expect(completed).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'OK', exact: true }));
    expect(completed).toHaveBeenCalledWith('acknowledged');
    expect(native).not.toHaveBeenCalled();
    expect(screen.getByText('Open native replacement')).toHaveFocus();
  });
});
