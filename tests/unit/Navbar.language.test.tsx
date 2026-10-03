import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Navbar } from '../../src/app/components/Navbar';
import { LanguageProvider, useLanguage } from '../../src/app/providers/LanguageContext';
import { ConditionsStrip } from '../../src/features/resort-conditions';
import { useResortConditions } from '../../src/features/resort-conditions/hooks/useResortConditions';
import { weatherService } from '../../src/features/resort-conditions/api/weatherService';

vi.mock('../../src/features/wallet', () => ({ useEffectiveBalance: () => 0 }));
vi.mock('../../src/features/student-cabinet', () => ({
  useNavbarParticipantSwitcher: () => ({ items: [] }),
  CabinetParticipantAvatarSwitcher: () => null,
}));

function WeatherSnapshot() {
  // The real weather owner also consumes LanguageContext: exercise this rerender.
  const { language } = useLanguage();
  const { conditions } = useResortConditions({ latitude: 43.1281, longitude: 77.0808 }, true);
  return (
    <div lang={language}>
      <ConditionsStrip conditions={conditions} unit="celsius" onToggleUnit={vi.fn()} />
    </div>
  );
}

function mount() {
  return render(
    <LanguageProvider>
      <MemoryRouter initialEntries={['/?keep=route']}>
        <Navbar
          userProfile={null}
          onOpenNotifications={vi.fn()}
          onSignOut={vi.fn()}
          theme="light"
          onToggleTheme={vi.fn()}
        />
        <WeatherSnapshot />
      </MemoryRouter>
    </LanguageProvider>
  );
}

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(weatherService, 'get').mockResolvedValue({
    temperatureC: 15,
    apparentTemperatureC: 15,
    weatherCode: 3,
    windKmh: 4,
    windGustKmh: null,
    snowDepthCm: 0,
    visibilityM: 25000,
    updatedAt: '2026-10-02T12:30:00Z',
    liftsOpen: null,
    liftsTotal: null,
    trailsOpen: null,
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('navbar language slider', () => {
  it('uses the canonical setter in both directions, persists, and relabels the same weather snapshot', async () => {
    localStorage.setItem('alpine_glide_lang', 'ru');
    const user = userEvent.setup();
    const { unmount, container } = mount();
    await screen.findByText('Облачно');
    const group = screen.getByRole('group');
    const ru = within(group).getByRole('button', { name: 'RU' });
    const en = within(group).getByRole('button', { name: 'EN' });
    const strip = container.querySelector('.conditions-strip');
    const thumb = group.querySelector('[aria-hidden="true"]');
    expect(ru).toHaveAttribute('aria-pressed', 'true');
    expect(en).toHaveAttribute('aria-pressed', 'false');
    expect(thumb).toHaveClass('translate-x-0');
    expect(group).toHaveClass('bg-[var(--border-subtle)]/70', 'rounded-full');
    expect(thumb).toHaveClass('bg-[var(--card-bg)]', 'duration-200', 'ease-in-out');

    await user.click(en);
    expect(en).toHaveAttribute('aria-pressed', 'true');
    expect(ru).toHaveAttribute('aria-pressed', 'false');
    expect(thumb).toHaveClass('translate-x-full');
    expect(screen.getByText('Cloudy')).toBeVisible();
    expect(screen.getByText('4 km/h')).toBeVisible();
    expect(localStorage.getItem('alpine_glide_lang')).toBe('en');
    expect(container.querySelector('.conditions-strip')).toBe(strip);

    await user.tab({ shift: true });
    expect(ru).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(screen.getByText('Облачно')).toBeVisible();
    expect(screen.getByText('4 км/ч')).toBeVisible();
    expect(localStorage.getItem('alpine_glide_lang')).toBe('ru');
    await user.tab();
    expect(en).toHaveFocus();
    await user.keyboard(' ');
    expect(en).toHaveAttribute('aria-pressed', 'true');
    expect(weatherService.get).toHaveBeenCalledTimes(1);

    unmount();
    mount();
    await screen.findByText('Cloudy');
    expect(screen.getByRole('button', { name: 'EN' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('keeps the existing mobile menu and uses the same slider there', async () => {
    const user = userEvent.setup();
    const { container } = mount();
    await screen.findByText('Cloudy');
    const menuButton = container.querySelector('.lg\\:hidden button');
    expect(menuButton).not.toBeNull();
    await user.click(menuButton!);
    const groups = screen.getAllByRole('group');
    expect(groups).toHaveLength(2);
    await user.click(within(groups[1]).getByRole('button', { name: 'RU' }));
    for (const group of groups) {
      expect(within(group).getByRole('button', { name: 'RU' })).toHaveAttribute(
        'aria-pressed',
        'true'
      );
    }
    expect(localStorage.getItem('alpine_glide_lang')).toBe('ru');
  });
});
