import { useState } from 'react';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Navbar } from '../../src/app/components/Navbar';
import { LanguageProvider } from '../../src/app/providers/LanguageContext';
import { useWalletStore } from '../../src/features/wallet';
import { ModalLayer } from '../../src/ui/ModalLayer';
import type { UserProfile } from '../../src/types';

vi.mock('../../src/features/wallet', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/features/wallet')>()),
  useEffectiveBalance: () => 0,
}));
vi.mock('../../src/features/student-cabinet/useNavbarParticipantSwitcher', () => ({
  useNavbarParticipantSwitcher: () => ({ items: [] }),
}));
vi.mock('../../src/features/student-cabinet/components/CabinetParticipantAvatarSwitcher', () => ({
  CabinetParticipantAvatarSwitcher: () => null,
}));

let desktop = false;
const breakpointListeners = new Set<(event: { matches: boolean }) => void>();
function resizeDesktop(matches: boolean) {
  desktop = matches;
  act(() => {
    breakpointListeners.forEach((listener) => listener({ matches }));
    window.dispatchEvent(new Event('resize'));
  });
}
beforeEach(() => {
  localStorage.setItem('alpine_glide_lang', 'en');
  desktop = false;
  breakpointListeners.clear();
  vi.stubGlobal('matchMedia', () => ({
    get matches() {
      return desktop;
    },
    addEventListener: (_: string, listener: (event: { matches: boolean }) => void) =>
      breakpointListeners.add(listener),
    removeEventListener: (_: string, listener: (event: { matches: boolean }) => void) =>
      breakpointListeners.delete(listener),
  }));
});
afterEach(() => {
  cleanup();
  useWalletStore.setState(useWalletStore.getInitialState());
  vi.unstubAllGlobals();
});

function Harness({
  profile = null,
  unreadNotificationCount = 0,
}: {
  profile?: UserProfile | null;
  unreadNotificationCount?: number;
}) {
  const navigate = useNavigate();
  const [modal, setModal] = useState('');
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  return (
    <>
      <Navbar
        userProfile={profile}
        onOpenNotifications={() => setModal('Notifications')}
        onSignOut={() => navigate('/')}
        theme={theme}
        onToggleTheme={() => setTheme(theme === 'light' ? 'dark' : 'light')}
        onSignInClick={() => setModal('Auth')}
        unreadNotificationCount={unreadNotificationCount}
      />
      <main>
        <button onClick={() => navigate('/?next=1#section')}>Navigate</button>
        <button onClick={() => setModal('Course')}>Course</button>
      </main>
      {modal && (
        <ModalLayer onClose={() => setModal('')}>
          <div role="dialog" aria-modal="true" aria-label={modal}>
            <button onClick={() => setModal('')}>Close</button>
          </div>
        </ModalLayer>
      )}
    </>
  );
}
const mount = (profile?: UserProfile, unreadNotificationCount?: number) =>
  render(
    <LanguageProvider>
      <MemoryRouter>
        <Harness profile={profile} unreadNotificationCount={unreadNotificationCount} />
      </MemoryRouter>
    </LanguageProvider>
  );
const trigger = () => screen.getByRole('button', { name: 'Navigation menu' });
const panel = () => screen.getByRole('region', { name: 'Navigation menu' });

it('exposes disclosure state, keeps focus on the opener and toggles with Enter/Space', async () => {
  mount();
  const user = userEvent.setup();
  expect(trigger()).toHaveAttribute('aria-expanded', 'false');
  expect(screen.queryByRole('region')).toBeNull();
  trigger().focus();
  await user.keyboard('{Enter}');
  expect(trigger()).toHaveFocus();
  expect(trigger()).toHaveAttribute('aria-controls', panel().id);
  expect(trigger()).toHaveAttribute('aria-expanded', 'true');
  await user.keyboard(' ');
  expect(trigger()).toHaveAttribute('aria-expanded', 'false');
});

it('Escape restores focus and immediately isolates exiting controls', async () => {
  mount();
  const user = userEvent.setup();
  await user.click(trigger());
  const exiting = panel();
  await user.click(within(exiting).getByRole('button', { name: 'RU' }));
  await user.keyboard('{Escape}');
  expect(screen.getByRole('button', { name: 'Меню навигации' })).toHaveFocus();
  expect(screen.queryByRole('region')).toBeNull();
  if (exiting.isConnected) expect(exiting).toHaveAttribute('inert');
  expect(document.body).not.toHaveAttribute('inert');
});

it('closes on route changes including search/hash without locking page scroll', async () => {
  mount();
  const user = userEvent.setup();
  await user.click(trigger());
  await user.click(screen.getByRole('button', { name: 'Navigate' }));
  expect(trigger()).toHaveAttribute('aria-expanded', 'false');
  expect(document.documentElement).not.toHaveClass('modal-scroll-lock');
});

it('closes on desktop resize, uses the visible logo for focus and stays closed on mobile', async () => {
  mount();
  const user = userEvent.setup();
  await user.click(trigger());
  resizeDesktop(true);
  expect(screen.getByRole('link')).toHaveFocus();
  resizeDesktop(false);
  await user.click(trigger());
  within(panel()).getByRole('button', { name: 'RU' }).focus();
  desktop = true;
  // Browsers may blur a CSS-hidden control before dispatching resize.
  await act(async () => {
    (document.activeElement as HTMLElement).blur();
  });
  expect(screen.getByRole('link')).toHaveFocus();
  resizeDesktop(true);
  expect(trigger()).toHaveAttribute('aria-expanded', 'false');
  expect(screen.getByRole('link')).toHaveFocus();
  resizeDesktop(false);
  expect(trigger()).toHaveAttribute('aria-expanded', 'false');
});

it('hands focus to the modal and returns it to the surviving menu trigger', async () => {
  mount();
  const user = userEvent.setup();
  await user.click(trigger());
  await user.click(within(panel()).getByRole('button', { name: 'Sign In' }));
  expect(screen.getByRole('dialog', { name: 'Auth' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus();
  await user.keyboard('{Escape}');
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(trigger()).toHaveFocus();
  expect(trigger()).toHaveAttribute('aria-expanded', 'false');
});

it('Escape in an independent modal leaves the nonmodal menu open', async () => {
  mount();
  const user = userEvent.setup();
  await user.click(trigger());
  await user.click(screen.getByRole('button', { name: 'Course', exact: true }));
  await user.keyboard('{Escape}');
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(trigger()).toHaveAttribute('aria-expanded', 'true');
  expect(screen.getByRole('button', { name: 'Course', exact: true })).toHaveFocus();
});

it('preserves the open panel and focused language/theme controls across updates', async () => {
  mount();
  const user = userEvent.setup();
  await user.click(trigger());
  const region = panel();
  await user.click(within(region).getByRole('button', { name: 'RU' }));
  expect(within(region).getByRole('button', { name: 'RU' })).toHaveFocus();
  expect(screen.getByRole('region', { name: 'Меню навигации' })).toBe(region);
  await user.click(within(region).getByRole('button', { name: 'EN' }));
  await user.click(within(region).getByRole('button', { name: 'Switch to Dark' }));
  expect(within(region).getByRole('button', { name: 'Switch to Light' })).toHaveFocus();
  expect(trigger()).toHaveAttribute('aria-expanded', 'true');
});

it('keeps the opener centered and shares header theme and language controls with the mobile menu', async () => {
  const { container } = mount();
  const user = userEvent.setup();
  const opener = trigger();
  expect(opener).toHaveClass('items-center', 'justify-center', 'h-11', 'w-11');
  expect(opener.querySelector('span')).toHaveClass(
    'h-8',
    'w-8',
    'group-hover:bg-[var(--accent-muted)]'
  );

  await user.click(opener);
  const region = panel();
  const theme = within(region).getByRole('button', { name: 'Switch to Dark' });
  expect(theme).toHaveClass(
    'ui-icon-btn',
    'items-center',
    'justify-center',
    'min-h-11',
    'min-w-11'
  );
  expect(theme.className).toBe(
    container.querySelector('header button[title="Switch to Dark"]')?.className
  );
  expect(within(region).queryByText('Light Theme')).toBeNull();
  expect(region).not.toHaveClass('[&_button]:min-h-11', '[&_button]:min-w-11');
  expect(region).toHaveClass('gap-2', 'p-3', 'rounded-2xl');

  const groups = container.querySelectorAll('[role="group"][aria-label="Switch language"]');
  expect(groups).toHaveLength(2);
  expect(groups[0].className).toBe(groups[1].className);
  expect(within(region).queryByText('Language')).toBeNull();
  const headerButtons = groups[0].querySelectorAll('button');
  const mobileButtons = groups[1].querySelectorAll('button');
  expect(Array.from(mobileButtons, (button) => button.className)).toEqual(
    Array.from(headerButtons, (button) => button.className)
  );
});

it('centers wallet, notifications and theme icons and reveals the balance on demand', async () => {
  useWalletStore.setState({ canonicalWalletAccountId: 'fixture', canonicalWalletLoaded: true });
  const { container } = mount(
    { uid: 'fixture', role: 'admin', displayName: 'Admin' } as UserProfile,
    12
  );
  const user = userEvent.setup();
  await user.click(trigger());
  const region = within(panel());
  const wallet = region.getByRole('button', { name: 'Balance' });
  const notifications = region.getByRole('button', { name: 'New Notifications (12)' });
  const theme = region.getByRole('button', { name: 'Switch to Dark' });

  expect(wallet.parentElement).toHaveClass('flex', 'items-center', 'justify-center');
  expect(Array.from(wallet.parentElement!.children)).toEqual([wallet, notifications, theme]);
  expect(wallet.textContent).toBe('');
  expect(theme.textContent).toBe('');
  expect(notifications.textContent).toBe('9+');
  expect(notifications.className).toBe(
    container.querySelector('header button[aria-label="New Notifications (12)"]')?.className
  );

  const amount = region.getByTestId('navbar-balance-mobile');
  expect(amount).toHaveAttribute('hidden');
  await user.click(wallet);
  expect(wallet).toHaveAttribute('aria-expanded', 'true');
  expect(amount).not.toHaveAttribute('hidden');
  expect(amount).toHaveTextContent('0 ₸');
  await user.click(trigger());
  await user.click(trigger());
  expect(within(panel()).getByRole('button', { name: 'Balance' })).toHaveAttribute(
    'aria-expanded',
    'false'
  );
  expect(within(panel()).getByTestId('navbar-balance-mobile')).toHaveAttribute('hidden');
});

it('retains authorized workspace links and closes on selection', async () => {
  mount({ uid: 'fixture', role: 'admin', displayName: 'Admin' } as UserProfile);
  const user = userEvent.setup();
  await user.click(trigger());
  expect(within(panel()).queryByText('Sign In')).toBeNull();
  const link = within(panel()).getByRole('link', { name: /cabinet/i });
  expect(link).toHaveAttribute('href', '/cabinet');
  await user.click(link);
  expect(trigger()).toHaveAttribute('aria-expanded', 'false');
  expect(trigger()).toHaveFocus();
});

it('closes profile actions before notifications/sign-out and restores notification focus', async () => {
  mount({ uid: 'fixture', role: 'admin', displayName: 'Admin' } as UserProfile);
  const user = userEvent.setup();
  await user.click(trigger());
  await user.click(within(panel()).getByRole('button', { name: 'Notifications' }));
  expect(screen.getByRole('dialog', { name: 'Notifications' })).toBeVisible();
  await user.keyboard('{Escape}');
  expect(trigger()).toHaveFocus();
  expect(trigger()).toHaveAttribute('aria-expanded', 'false');
  await user.click(trigger());
  await user.click(within(panel()).getByRole('button', { name: 'Sign Out' }));
  expect(trigger()).toHaveFocus();
  expect(trigger()).toHaveAttribute('aria-expanded', 'false');
});
