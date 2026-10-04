import { act, cleanup, render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Navbar } from '../../src/app/components/Navbar';

vi.mock('../../src/app/providers/LanguageContext', () => ({
  useLanguage: () => ({ language: 'en', t: (key: string) => key, setLanguage: vi.fn() }),
}));
vi.mock('../../src/features/wallet', () => ({ useEffectiveBalance: () => 0 }));
vi.mock('../../src/features/student-cabinet/useNavbarParticipantSwitcher', () => ({
  useNavbarParticipantSwitcher: () => ({ items: [] }),
}));
vi.mock('../../src/features/student-cabinet/components/CabinetParticipantAvatarSwitcher', () => ({
  CabinetParticipantAvatarSwitcher: () => null,
}));

let measuredHeight = 65.5;
let observerCallback: ResizeObserverCallback;
const disconnect = vi.fn();

beforeEach(() => {
  measuredHeight = 65.5;
  disconnect.mockClear();
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(66);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({
    top: 0,
    bottom: measuredHeight,
    height: measuredHeight,
    width: 1440,
    left: 0,
    right: 1440,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  }));
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: ResizeObserverCallback) {
        observerCallback = callback;
      }
      observe() {}
      disconnect = disconnect;
    }
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.documentElement.style.removeProperty('--app-navbar-height');
});

const mountNavbar = () =>
  render(
    <MemoryRouter>
      <Navbar
        userProfile={null}
        onOpenNotifications={vi.fn()}
        onSignOut={vi.fn()}
        theme="light"
        onToggleTheme={vi.fn()}
      />
    </MemoryRouter>
  );
const token = () => document.documentElement.style.getPropertyValue('--app-navbar-height');

describe('canonical navbar height', () => {
  it('preserves fractional border-box height rather than rounded offsetHeight', () => {
    const { container } = mountNavbar();
    expect(container.querySelector('header')?.offsetHeight).toBe(66);
    expect(token()).toBe('65.5px');
  });

  it('updates the precise height after window resize and ResizeObserver notifications', () => {
    mountNavbar();
    measuredHeight = 72.25;
    act(() => window.dispatchEvent(new Event('resize')));
    expect(token()).toBe('72.25px');
    measuredHeight = 64.8;
    act(() => observerCallback([], {} as ResizeObserver));
    expect(token()).toBe('64.8px');
  });

  it('disconnects and removes the resize listener on unmount', () => {
    const { unmount } = mountNavbar();
    unmount();
    expect(disconnect).toHaveBeenCalledTimes(1);
    measuredHeight = 70;
    window.dispatchEvent(new Event('resize'));
    expect(token()).toBe('65.5px');
  });
});
