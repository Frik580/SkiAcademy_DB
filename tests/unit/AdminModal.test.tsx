import React, { useState } from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AdminModal } from '../../src/features/admin/components/AdminModal';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function Example({ pending = false }: { pending?: boolean }) {
  const [open, setOpen] = useState(false);
  const [child, setChild] = useState(false);
  return (
    <div style={{ transform: 'translateY(200px)' }}>
      <button onClick={() => setOpen(true)}>Open</button>
      {open && (
        <AdminModal
          title="Parent"
          closeLabel="Close parent"
          closeDisabled={pending}
          onClose={() => setOpen(false)}
          footer={<button onClick={() => setChild(true)}>Open child</button>}
        >
          <input aria-label="Name" />
          {child && (
            <AdminModal title="Child" closeLabel="Close child" onClose={() => setChild(false)}>
              <button>Child action</button>
            </AdminModal>
          )}
        </AdminModal>
      )}
    </div>
  );
}

describe('AdminModal lifecycle', () => {
  it('portals a labelled dialog outside transformed containers and locks page scroll', async () => {
    const view = render(<Example />);
    await userEvent.click(screen.getByText('Open'));
    const dialog = screen.getByRole('dialog', { name: 'Parent' });
    expect(view.container).not.toContainElement(dialog);
    expect(dialog.closest('[data-admin-modal-root]')?.parentElement).toBe(document.body);
    expect(document.documentElement).toHaveClass('modal-scroll-lock');
    expect(screen.getByLabelText('Close parent')).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(document.documentElement).not.toHaveClass('modal-scroll-lock');
    expect(screen.getByText('Open')).toHaveFocus();
  });

  it('traps Tab, Shift+Tab and programmatic focus without resetting it on rerender', async () => {
    const view = render(<Example />);
    const user = userEvent.setup();
    await user.click(screen.getByText('Open'));
    await user.tab({ shift: true });
    expect(screen.getByText('Open child')).toHaveFocus();
    await user.tab();
    expect(screen.getByLabelText('Close parent')).toHaveFocus();
    await user.tab();
    expect(screen.getByLabelText('Name')).toHaveFocus();
    view.rerender(<Example />);
    expect(screen.getByLabelText('Name')).toHaveFocus();
    screen.getByText('Open').focus();
    expect(screen.getByLabelText('Close parent')).toHaveFocus();
  });

  it('Escape closes only the top dialog, restores parent focus, and retains the scroll lock', async () => {
    render(<Example />);
    const user = userEvent.setup();
    await user.click(screen.getByText('Open'));
    await user.click(screen.getByText('Open child'));
    expect(screen.getByLabelText('Close child')).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Child' })).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Parent' })).toBeInTheDocument();
    expect(screen.getByText('Open child')).toHaveFocus();
    expect(document.documentElement).toHaveClass('modal-scroll-lock');
    await user.keyboard('{Escape}');
    expect(screen.getByText('Open')).toHaveFocus();
  });

  it('does not dismiss a pending mutation with Escape or the close button', async () => {
    render(<Example pending />);
    await userEvent.click(screen.getByText('Open'));
    await userEvent.keyboard('{Escape}');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByLabelText('Close parent')).toBeDisabled();
  });

  it('keeps native form validation and submit handlers when used with a separate footer', async () => {
    const submit = vi.fn((event: React.FormEvent) => event.preventDefault());
    render(
      <AdminModal
        title="Form"
        closeLabel="Close"
        onClose={() => {}}
        footer={
          <button type="submit" form="test-form">
            Save
          </button>
        }
      >
        <form id="test-form" onSubmit={submit}>
          <input required aria-label="Required name" />
        </form>
      </AdminModal>
    );
    const user = userEvent.setup();
    await user.click(screen.getByText('Save'));
    expect(submit).not.toHaveBeenCalled();
    await user.type(screen.getByLabelText('Required name'), 'Anna');
    await user.click(screen.getByText('Save'));
    expect(submit).toHaveBeenCalledOnce();
  });

  it('tracks the visual viewport and cleans up keyboard/viewport listeners', () => {
    const viewport = new EventTarget() as EventTarget & {
      height: number;
      width: number;
      offsetTop: number;
      offsetLeft: number;
    };
    Object.assign(viewport, { height: 320, width: 390, offsetTop: 80, offsetLeft: 0 });
    vi.stubGlobal('visualViewport', viewport);
    const view = render(
      <AdminModal title="Keyboard" closeLabel="Close" onClose={() => {}}>
        <input />
      </AdminModal>
    );
    const root = screen.getByRole('dialog').closest('[data-admin-modal-root]');
    expect(root).toHaveStyle({ height: '320px', top: '80px', width: '390px' });
    viewport.height = 280;
    fireEvent(viewport, new Event('resize'));
    expect(root).toHaveStyle({ height: '280px' });
    expect(within(screen.getByRole('dialog')).getByLabelText('Close')).toHaveFocus();
    view.unmount();
    vi.unstubAllGlobals();
  });
});
