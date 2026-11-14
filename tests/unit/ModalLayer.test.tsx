import { StrictMode, useState } from 'react';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ModalLayer } from '../../src/ui/ModalLayer';
import { BookingAppleSelect } from '../../src/features/bookings/components/booking_modal/BookingAppleSelect';
import { BookingAppleDatePicker } from '../../src/features/bookings/components/booking_modal/BookingAppleDatePicker';
import { BookingAppleWheelPicker } from '../../src/features/bookings/components/booking_modal/BookingAppleWheelPicker';

afterEach(cleanup);
const scrollToDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollTo');
beforeAll(() =>
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: () => {} })
);
afterAll(() => {
  if (scrollToDescriptor)
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', scrollToDescriptor);
  else Reflect.deleteProperty(HTMLElement.prototype, 'scrollTo');
});

function Example({ pending = false }: { pending?: boolean }) {
  const [open, setOpen] = useState(false);
  const [child, setChild] = useState(false);
  const [trigger, setTrigger] = useState(true);
  return (
    <main tabIndex={-1}>
      {trigger && <button onClick={() => setOpen(true)}>Open</button>}
      <button>Background</button>
      {open && (
        <ModalLayer onClose={() => setOpen(false)} closeDisabled={pending}>
          <div role="dialog" aria-modal="true" aria-label="Parent">
            <button onClick={() => setOpen(false)}>Close</button>
            <input aria-label="Name" />
            <button onClick={() => setTrigger(false)}>Remove trigger</button>
            <button onClick={() => setOpen(false)}>Remove parent</button>
            <button onClick={() => setChild(true)}>Child</button>
          </div>
        </ModalLayer>
      )}
      {child && (
        <ModalLayer onClose={() => setChild(false)}>
          <div role="dialog" aria-modal="true" aria-label="Child">
            <button onClick={() => setChild(false)}>Close child</button>
            <button onClick={() => setOpen(false)}>Remove lower layer</button>
          </div>
        </ModalLayer>
      )}
    </main>
  );
}

describe('shared modal accessibility', () => {
  it('keeps the child on top when both portal layers mount in one commit', async () => {
    const parentClose = vi.fn();
    const childClose = vi.fn();
    render(
      <ModalLayer onClose={parentClose}>
        <div role="dialog" aria-label="Simultaneous parent">
          <button>Parent action</button>
          <ModalLayer onClose={childClose}>
            <div role="dialog" aria-label="Simultaneous child">
              <button>Child action</button>
            </div>
          </ModalLayer>
        </div>
      </ModalLayer>
    );
    expect(screen.getByRole('dialog', { name: 'Simultaneous child' })).toBeInTheDocument();
    expect(screen.getByText('Child action')).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    expect(childClose).toHaveBeenCalledOnce();
    expect(parentClose).not.toHaveBeenCalled();
  });

  it('restores the original opener after dismissing a simultaneously mounted nested pair', async () => {
    function Simultaneous() {
      const [open, setOpen] = useState(false);
      const [child, setChild] = useState(true);
      return (
        <main>
          <button onClick={() => setOpen(true)}>Open pair</button>
          {open && (
            <ModalLayer onClose={() => setOpen(false)}>
              <div role="dialog" aria-label="Pair parent">
                <button>Parent action</button>
                {child && (
                  <ModalLayer onClose={() => setChild(false)}>
                    <div role="dialog" aria-label="Pair child">
                      <button>Child action</button>
                    </div>
                  </ModalLayer>
                )}
              </div>
            </ModalLayer>
          )}
        </main>
      );
    }
    render(<Simultaneous />);
    await userEvent.click(screen.getByText('Open pair'));
    await userEvent.keyboard('{Escape}');
    expect(screen.getByRole('dialog', { name: 'Pair parent' })).toContainElement(
      document.activeElement as HTMLElement
    );
    await userEvent.keyboard('{Escape}');
    expect(screen.getByText('Open pair')).toHaveFocus();
  });

  it('uses a safe fallback when a responsive wrapper hides the opener', async () => {
    const view = render(<Example />);
    await userEvent.click(screen.getByText('Open'));
    const main = view.container.querySelector('main')!;
    const opener = screen.getByText('Open');
    const wrapper = document.createElement('div');
    opener.replaceWith(wrapper);
    wrapper.append(opener);
    wrapper.style.display = 'none';
    await userEvent.keyboard('{Escape}');
    expect(main).toHaveFocus();
  });

  it('Escape collapses a booking picker before dismissing the form', async () => {
    let closed = false;
    render(
      <ModalLayer
        onClose={() => {
          closed = true;
        }}
      >
        <div role="dialog" aria-label="Booking">
          <BookingAppleWheelPicker
            value="1"
            onChange={() => {}}
            aria-label="Duration"
            options={[
              { value: '1', label: 'One hour' },
              { value: '2', label: 'Two hours' },
            ]}
          />
        </div>
      </ModalLayer>
    );
    const picker = screen.getByRole('button', { name: 'Duration' });
    await userEvent.click(picker);
    expect(picker).toHaveAttribute('aria-expanded', 'true');
    await userEvent.keyboard('{Escape}');
    expect(closed).toBe(false);
    expect(picker).toHaveAttribute('aria-expanded', 'false');
    await userEvent.keyboard('{Escape}');
    expect(closed).toBe(true);
  });
  it.each(['select', 'date'])(
    'Escape closes the nested %s first and restores its trigger',
    async (kind) => {
      let closed = false;
      render(
        <ModalLayer
          onClose={() => {
            closed = true;
          }}
        >
          <div role="dialog">
            {kind === 'select' ? (
              <BookingAppleSelect
                aria-label="Picker"
                value="1"
                onChange={() => {}}
                options={[{ value: '1', label: 'One' }]}
              />
            ) : (
              <BookingAppleDatePicker
                aria-label="Picker"
                value="2099-12-15"
                onChange={() => {}}
                locale="en-US"
              />
            )}
          </div>
        </ModalLayer>
      );
      const trigger = screen.getByRole('button', { name: 'Picker' });
      await userEvent.click(trigger);
      await userEvent.tab();
      await userEvent.keyboard('{Escape}');
      expect(closed).toBe(false);
      expect(trigger).toHaveAttribute('aria-expanded', 'false');
      expect(trigger).toHaveFocus();
      await userEvent.keyboard('{Escape}');
      expect(closed).toBe(true);
    }
  );

  it('focuses inside, traps both Tab directions and restores the opener and scrolling', async () => {
    render(<Example />);
    const user = userEvent.setup();
    await user.click(screen.getByText('Open'));
    expect(screen.getByText('Close')).toHaveFocus();
    expect(screen.getByText('Background').closest('main')?.parentElement).toHaveAttribute('inert');
    await user.tab({ shift: true });
    expect(screen.getByText('Child')).toHaveFocus();
    await user.tab();
    expect(screen.getByText('Close')).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.getByText('Open')).toHaveFocus();
    expect(document.documentElement).not.toHaveClass('modal-scroll-lock');
    expect(screen.getByText('Background').closest('[inert]')).toBeNull();
  });

  it('Escape affects only the top sibling portal and restores the parent action', async () => {
    render(<Example />);
    const user = userEvent.setup();
    await user.click(screen.getByText('Open'));
    await user.click(screen.getByText('Child'));
    expect(screen.getByText('Close child')).toHaveFocus();
    expect(screen.getByRole('dialog', { name: 'Child' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Parent' })).toBeNull();
    await user.keyboard('{Escape}');
    expect(screen.getByText('Child')).toHaveFocus();
    expect(document.documentElement).toHaveClass('modal-scroll-lock');
    await user.keyboard('{Escape}');
    expect(screen.getByText('Open')).toHaveFocus();
  });

  it('falls back to main if the opener was removed', async () => {
    render(<Example />);
    const user = userEvent.setup();
    await user.click(screen.getByText('Open'));
    await user.click(screen.getByText('Remove trigger'));
    await user.keyboard('{Escape}');
    expect(screen.getByRole('main')).toHaveFocus();
  });

  it('keeps the active modal isolated when a lower layer unmounts first', async () => {
    render(<Example />);
    const user = userEvent.setup();
    await user.click(screen.getByText('Open'));
    await user.click(screen.getByText('Child'));
    await user.click(screen.getByText('Remove lower layer'));
    expect(screen.getByRole('dialog', { name: 'Child' })).toContainElement(
      document.activeElement as HTMLElement
    );
    expect(document.documentElement).toHaveClass('modal-scroll-lock');
    await user.keyboard('{Escape}');
    expect(screen.getByRole('main')).toHaveFocus();
    expect(screen.getByRole('main').closest('[inert]')).toBeNull();
    expect(document.documentElement).not.toHaveClass('modal-scroll-lock');
  });

  it('does not close a pending operation on Escape', async () => {
    render(<Example pending />);
    await userEvent.click(screen.getByText('Open'));
    await userEvent.keyboard('{Escape}');
    expect(screen.getByRole('dialog', { name: 'Parent' })).toBeInTheDocument();
  });

  it('preserves existing background attributes through StrictMode setup and cleanup', async () => {
    const external = document.createElement('aside');
    external.setAttribute('inert', '');
    external.setAttribute('aria-hidden', 'false');
    document.body.append(external);
    const view = render(
      <StrictMode>
        <Example />
      </StrictMode>
    );
    await userEvent.click(screen.getByText('Open'));
    view.unmount();
    expect(external).toHaveAttribute('inert');
    expect(external).toHaveAttribute('aria-hidden', 'false');
    expect(document.documentElement).not.toHaveClass('modal-scroll-lock');
    external.remove();
  });

  it('handles a dialog without focusable children', async () => {
    render(
      <ModalLayer onClose={() => {}}>
        <div role="dialog" aria-label="Empty" />
      </ModalLayer>
    );
    const dialog = screen.getByRole('dialog', { name: 'Empty' });
    expect(dialog).toHaveFocus();
    await userEvent.tab();
    expect(dialog).toHaveFocus();
    expect(within(dialog).queryByRole('button')).toBeNull();
  });
});
