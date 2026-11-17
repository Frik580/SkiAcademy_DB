import { useState } from 'react';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Navbar } from '../../src/app/components/Navbar';
import { LanguageProvider } from '../../src/app/providers/LanguageContext';
import { ModalLayer } from '../../src/ui/ModalLayer';
import type { UserProfile } from '../../src/types';

vi.mock('../../src/features/wallet', () => ({ useEffectiveBalance: () => 0 }));
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
  vi.unstubAllGlobals();
});

function Harness({ profile = null }: { profile?: UserProfile | null }) {
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
const mount = (profile?: UserProfile) =>
  render(
    <LanguageProvider>
      <MemoryRouter>
        <Harness profile={profile} />
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
