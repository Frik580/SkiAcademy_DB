import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider, useLanguage } from '../../src/app/providers/LanguageContext';
import { useResortStats } from '../../src/hooks/useResortStats';
import { ConditionsStrip, type ResortConditions } from '../../src/features/resort-conditions';
import { weatherService } from '../../src/features/resort-conditions/api/weatherService';
import { StudentCabinetWeatherSection } from '../../src/features/student-cabinet/components/student/StudentHomeBottomSections';

const { config } = vi.hoisted(() => ({
  config: {
    nameRu: 'Shymbulak',
    nameEn: 'Shymbulak',
    latitude: 43.1281,
    longitude: 77.0808,
    showLifts: true,
    liftsStatusEn: 'OPEN',
    liftsStatusRu: 'ОТКРЫТО',
  },
}));
vi.mock('../../src/features/settings', () => ({
  readCachedResortConfig: () => config,
  writeCachedResortConfig: vi.fn(),
  subscribeResortConfig: () => () => {},
}));
// Test the target of the existing number animation, without waiting for viewport animation frames.
vi.mock('../../src/ui/AnimatedNumber', () => ({
  AnimatedNumber: ({ value }: { value: number }) => <span>{value}</span>,
}));

const weather: ResortConditions = {
  temperatureC: -7,
  apparentTemperatureC: null,
  weatherCode: 0,
  windKmh: 18,
  windGustKmh: null,
  snowDepthCm: 42,
  visibilityM: null,
  updatedAt: null,
  liftsOpen: null,
  liftsTotal: null,
  trailsOpen: null,
};
function LanguageControls() {
  const { setLanguage } = useLanguage();
  return (
    <>
      <button onClick={() => setLanguage('ru')}>RU</button>
      <button onClick={() => setLanguage('en')}>EN</button>
    </>
  );
}
function Harness() {
  const { presentation, setIsFahrenheit } = useResortStats();
  const toggle = () => setIsFahrenheit(presentation.unit !== 'fahrenheit');
  return (
    <LanguageProvider>
      <LanguageControls />
      <div data-testid="home">
        <ConditionsStrip presentation={presentation} onToggleUnit={toggle} />
      </div>
      <div data-testid="cabinet">
        <StudentCabinetWeatherSection resort={presentation} onToggleTemperatureUnit={toggle} />
      </div>
    </LanguageProvider>
  );
}
function surfaces() {
  return ['home', 'cabinet'].map((id) => within(screen.getByTestId(id)));
}
function expectTemperature(value: number) {
  const [home, cabinet] = surfaces();
  expect(home.getByText(`${value}°`)).toBeVisible();
  expect(cabinet.getByRole('button').textContent).toBe(`${value}°`);
}
beforeEach(() => {
  localStorage.clear();
  config.nameEn = 'Shymbulak';
  config.nameRu = 'Shymbulak';
  config.showLifts = true;
  config.liftsStatusEn = 'OPEN';
  config.liftsStatusRu = 'ОТКРЫТО';
  vi.spyOn(weatherService, 'get').mockResolvedValue(weather);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('shared resort presentation across home and student cabinet', () => {
  it.each([
    ['Shymbulak', 'Shymbulak'],
    ['Configured Resort', 'Курорт из настройки'],
    ['', ''],
  ])('shares configured names %s / %s while switching languages', async (nameEn, nameRu) => {
    config.nameEn = nameEn;
    config.nameRu = nameRu;
    localStorage.setItem('alpine_glide_lang', 'en');
    render(<Harness />);
    await waitFor(() => expectTemperature(-7));
    const expectNames = (expected: string) => {
      const home = screen.getByTestId('home').querySelector('.conditions-strip__main > li');
      const cabinet = screen.getByTestId('cabinet').querySelector('p.font-medium');
      expect(home?.textContent).toBe(expected);
      expect(cabinet?.textContent).toBe(expected);
      for (const surface of surfaces())
        expect(surface.queryByText(/Chamonix|Шамони/)).not.toBeInTheDocument();
    };
    expectNames(nameEn);
    fireEvent.click(screen.getByRole('button', { name: 'RU', exact: true }));
    expectNames(nameRu);
    fireEvent.click(screen.getByRole('button', { name: 'EN', exact: true }));
    expectNames(nameEn);
    expect(weatherService.get).toHaveBeenCalledTimes(1);
  });
  it.each(['en', 'ru'])(
    'shares weather and switches units in both directions in %s',
    async (language) => {
      localStorage.setItem('alpine_glide_lang', language);
      render(<Harness />);
      await waitFor(() => expectTemperature(-7));
      const [home, cabinet] = surfaces();
      for (const surface of [home, cabinet]) {
        expect(surface.getByText(language === 'ru' ? 'Ясно' : 'Clear')).toBeVisible();
        expect(surface.getByText(/42/).textContent).toContain('42');
        expect(surface.getByText(/18/).textContent).toContain('18');
      }
      fireEvent.click(cabinet.getByRole('button'));
      expectTemperature(19);
      expect(localStorage.getItem('carve_temperature_unit')).toBe('fahrenheit');
      fireEvent.click(home.getByRole('button'));
      expectTemperature(-7);
      expect(weatherService.get).toHaveBeenCalledTimes(1);
      expect(weatherService.get).toHaveBeenCalledWith(
        { latitude: config.latitude, longitude: config.longitude },
        false
      );
    }
  );
  it('restores one persisted Fahrenheit preference for both consumers', async () => {
    localStorage.setItem('carve_temperature_unit', 'fahrenheit');
    render(<Harness />);
    await waitFor(() => expectTemperature(19));
  });
  it('rounds fractional measurements once for both consumers', async () => {
    vi.mocked(weatherService.get).mockResolvedValue({
      ...weather,
      temperatureC: -7.4,
      windKmh: 18.6,
      snowDepthCm: 42.6,
    });
    render(<Harness />);
    await waitFor(() => expectTemperature(-7));
    for (const surface of surfaces()) {
      expect(surface.getByText(/19/).textContent).toContain('19');
      expect(surface.getByText(/43/).textContent).toContain('43');
    }
  });
  it.each([null, 999])(
    'does not invent missing measurements or condition for code %s',
    async (weatherCode) => {
      vi.mocked(weatherService.get).mockResolvedValue({
        ...weather,
        snowDepthCm: null,
        windKmh: null,
        weatherCode,
      });
      render(<Harness />);
      await waitFor(() => expectTemperature(-7));
      for (const surface of surfaces()) {
        expect(surface.queryByText(/42|18|Cloudy|Clear/)).not.toBeInTheDocument();
      }
      expect(surfaces()[1].getByText('Weather temporarily unavailable')).toBeVisible();
    }
  );
  it('shares loading and failed-response semantics without fake weather', async () => {
    vi.mocked(weatherService.get).mockRejectedValue(new Error('offline'));
    render(<Harness />);
    for (const surface of surfaces()) expect(surface.getByText('Weather…')).toBeVisible();
    await waitFor(() => {
      for (const surface of surfaces()) {
        expect(surface.getByText('Weather temporarily unavailable')).toBeVisible();
        expect(surface.queryByText(/42|18|Clear|-7/)).not.toBeInTheDocument();
      }
    });
  });
  it.each(['OPEN', 'CLOSED'])('shares the configured %s resort status', async (status) => {
    config.liftsStatusEn = status;
    config.liftsStatusRu = status === 'CLOSED' ? 'ЗАКРЫТО' : 'ОТКРЫТО';
    render(<Harness />);
    await waitFor(() => expectTemperature(-7));
    for (const surface of surfaces())
      expect(surface.getByText(status === 'CLOSED' ? 'Closed today' : 'Open today')).toBeVisible();
  });
  it('does not default missing resort status to OPEN', async () => {
    config.liftsStatusEn = '';
    config.liftsStatusRu = '';
    render(<Harness />);
    await waitFor(() => expectTemperature(-7));
    for (const surface of surfaces())
      expect(surface.queryByText(/Open today|Closed today/)).not.toBeInTheDocument();
  });
  it('hides operations on both surfaces when showLifts is false', async () => {
    config.showLifts = false;
    vi.mocked(weatherService.get).mockResolvedValue({ ...weather, liftsOpen: 3, liftsTotal: 4 });
    render(<Harness />);
    await waitFor(() => expectTemperature(-7));
    for (const surface of surfaces())
      expect(surface.queryByText(/Open today|Closed today|3\/4/)).not.toBeInTheDocument();
  });
});
