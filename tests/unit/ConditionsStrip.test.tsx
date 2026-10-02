import { useState } from 'react';
import { readFileSync } from 'node:fs';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LanguageProvider } from '../../src/app/providers/LanguageContext';
import { ConditionsStrip } from '../../src/features/resort-conditions';
import type {
  ResortConditions,
  ResortConditionsState,
  TemperatureUnit,
} from '../../src/features/resort-conditions';

const weather: ResortConditions = {
  temperatureC: -7,
  apparentTemperatureC: -11,
  weatherCode: 0,
  windKmh: 9,
  windGustKmh: 18,
  visibilityM: 9840,
  snowDepthCm: 42,
  updatedAt: '2026-10-02T12:30:00Z',
  liftsOpen: null,
  liftsTotal: null,
  trailsOpen: null,
};

function Harness({
  state = { status: 'ready', data: weather },
}: {
  state?: ResortConditionsState;
}) {
  const [unit, setUnit] = useState<TemperatureUnit>('celsius');
  return (
    <LanguageProvider>
      <ConditionsStrip
        conditions={state}
        unit={unit}
        onToggleUnit={() => setUnit(unit === 'celsius' ? 'fahrenheit' : 'celsius')}
      />
    </LanguageProvider>
  );
}

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe('ConditionsStrip', () => {
  it('renders weather and English labels with resort-local updated time', () => {
    render(<Harness />);
    expect(screen.getByText('Shymbulak')).toBeVisible();
    expect(screen.getByText('-7°')).toBeVisible();
    expect(screen.getByText('Clear')).toBeVisible();
    expect(screen.getByText('Wind')).toBeVisible();
    expect(screen.getByText('9 km/h')).toBeVisible();
    expect(screen.getByText('42 cm')).toBeVisible();
    expect(screen.getByText('Good')).toBeVisible();
    expect(screen.getByText('17:30')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open-Meteo' })).toHaveAttribute(
      'href',
      'https://open-meteo.com/'
    );
  });

  it('uses Russian labels from the existing language provider', () => {
    localStorage.setItem('alpine_glide_lang', 'ru');
    render(<Harness />);
    for (const label of ['Ясно', 'Ветер', 'Снег', 'Видимость', 'Хорошая', '42 см', '9 км/ч'])
      expect(screen.getByText(label)).toBeVisible();
  });

  it('keeps updated time and the clickable source in a separate metadata group', () => {
    const { container } = render(<Harness />);
    const main = container.querySelector('.conditions-strip__main');
    const meta = container.querySelector('.conditions-strip__meta');
    const source = screen.getByRole('link', { name: 'Open-Meteo' });
    expect(main).toContainElement(screen.getByText('Wind'));
    expect(main).not.toContainElement(source);
    expect(meta).toContainElement(screen.getByText('17:30'));
    expect(meta).toContainElement(source);
    expect(meta?.previousElementSibling).toBe(main);
  });

  it('hides missing snow, lifts and trails instead of showing placeholders', () => {
    render(<Harness state={{ status: 'ready', data: { ...weather, snowDepthCm: null } }} />);
    expect(screen.queryByText('Snow')).not.toBeInTheDocument();
    expect(screen.queryByText('Operating Lifts')).not.toBeInTheDocument();
    expect(screen.queryByText('Trails')).not.toBeInTheDocument();
    expect(screen.queryByText('—')).not.toBeInTheDocument();
  });

  it('supports independent operations data when weather is unavailable', () => {
    render(
      <Harness
        state={{
          status: 'error',
          data: {
            ...weather,
            temperatureC: null,
            apparentTemperatureC: null,
            weatherCode: null,
            windKmh: null,
            visibilityM: null,
            snowDepthCm: null,
            updatedAt: null,
            liftsOpen: 0,
            liftsTotal: 10,
            trailsOpen: 0,
          },
        }}
      />
    );
    expect(screen.getByText('Weather temporarily unavailable')).toBeVisible();
    expect(screen.getByText('0/10')).toBeVisible();
    expect(screen.getByText('Trails')).toBeVisible();
    expect(screen.queryByText('-7°')).not.toBeInTheDocument();
  });

  it('shows a compact error and a loading state without fake weather', () => {
    const { rerender, container } = render(<Harness state={{ status: 'loading', data: null }} />);
    expect(screen.getByText('Weather…')).toBeVisible();
    const stripClass = container.querySelector('section')?.className;
    rerender(<Harness state={{ status: 'error', data: null }} />);
    expect(screen.getByText('Weather temporarily unavailable')).toBeVisible();
    expect(container.querySelector('section')?.className).toBe(stripClass);
    expect(screen.queryByText('-7°')).not.toBeInTheDocument();
    expect(screen.getByText('Shymbulak')).toBeVisible();
  });

  it('switches temperature and apparent temperature with the keyboard', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.tab(); // Focus the scroll region.
    await user.tab();
    const button = screen.getByRole('button', { name: 'Switch temperature to Fahrenheit' });
    expect(button).toHaveFocus();
    expect(screen.getByText('-7°').closest('li')).toHaveAttribute('title', 'Feels like -11°');
    await user.keyboard('{Enter}');
    expect(screen.getByText('19°')).toBeVisible();
    expect(screen.getByText('19°').closest('li')).toHaveAttribute('title', 'Feels like 12°');
    expect(screen.getByRole('button', { name: 'Switch temperature to Celsius' })).toHaveFocus();
  });

  it('uses a focusable horizontal scroll region and one fixed-height row', () => {
    render(<Harness />);
    const scrollRegion = screen.getByRole('region', { name: /scroll horizontally/ });
    expect(scrollRegion).toHaveAttribute('tabindex', '0');
    expect(scrollRegion).toHaveClass('conditions-strip-scroll');
    const css = readFileSync(
      'src/features/resort-conditions/components/conditionsStrip.css',
      'utf8'
    );
    expect(css).toContain('overflow-x: auto');
    expect(css).toContain('white-space: nowrap');
    expect(css).toContain('flex-wrap: nowrap');
    expect(css).toContain('height: 58px');
    expect(css).toContain('top: var(--app-navbar-height)');
  });

  it('places exactly one strip after Hero and before Journey, with no weather inside Hero', () => {
    const home = readFileSync('src/app/routes/HomeRouteContainer.tsx', 'utf8');
    const hero = readFileSync('src/app/components/HeroCarousel.tsx', 'utf8');
    const heroEnd = home.indexOf('/>', home.indexOf('<HeroCarousel'));
    const stripStart = home.indexOf('<ConditionsStrip');
    expect(stripStart).toBeGreaterThan(heroEnd);
    expect(stripStart).toBeLessThan(home.indexOf('<YourJourneySection'));
    expect(home.match(/<ConditionsStrip/g)).toHaveLength(1);
    expect(home).not.toContain('ResortConditionsSidebar');
    expect(hero).not.toMatch(
      /ConditionsStrip|weatherService|useResortConditions|resort-conditions/
    );
  });
});
