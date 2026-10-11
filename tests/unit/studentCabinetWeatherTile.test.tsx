import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../src/app/providers/LanguageContext';
import {
  buildResortConditionsPresentation,
  type ResortConditions,
  type ResortConditionsPresentation,
  type ResortConditionsState,
  type TemperatureUnit,
} from '../../src/features/resort-conditions';
import { StudentCabinetWeatherSection } from '../../src/features/student-cabinet/components/student/StudentHomeBottomSections';

vi.mock('../../src/ui/AnimatedNumber', () => ({
  AnimatedNumber: ({ value }: { value: number }) => <span>{value}</span>,
}));

const weather: ResortConditions = {
  temperatureC: -7,
  apparentTemperatureC: -11,
  weatherCode: 0,
  windKmh: 12,
  windGustKmh: null,
  visibilityM: 12000,
  snowDepthCm: 82,
  updatedAt: null,
  liftsOpen: null,
  liftsTotal: null,
  trailsOpen: null,
};

function presentation(
  state: ResortConditionsState = { status: 'ready', data: weather },
  unit: TemperatureUnit = 'celsius',
  nameEn = 'Configured Alpine Resort',
  nameRu = 'Настроенный горный курорт',
  liftsStatusEn = 'OPEN',
  liftsStatusRu = 'ОТКРЫТО'
): ResortConditionsPresentation {
  return buildResortConditionsPresentation(state, unit, {
    nameEn,
    nameRu,
    showLifts: true,
    liftsStatusEn,
    liftsStatusRu,
  });
}

function renderWeather(resort = presentation(), onToggleTemperatureUnit?: () => void) {
  return render(
    <LanguageProvider>
      <StudentCabinetWeatherSection
        resort={resort}
        onToggleTemperatureUnit={onToggleTemperatureUnit}
      />
    </LanguageProvider>
  );
}

function expectMetricText(container: HTMLElement, value: string) {
  const values = Array.from(container.querySelectorAll('.sc-weather-metric-value')).map((item) =>
    item.textContent?.replace(/\s+/g, ' ').trim()
  );
  expect(values).toContain(value);
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('alpine_glide_lang', 'en');
});
afterEach(cleanup);

describe('Student Cabinet weather tile', () => {
  it('shows configured resort conditions and only real available metrics', () => {
    const { container } = renderWeather();

    expect(screen.getByRole('heading', { name: 'Weather on the slope' })).toBeVisible();
    expect(screen.getByText('Configured Alpine Resort')).toBeVisible();
    expect(screen.getByText('Clear')).toBeVisible();
    expect(screen.getByTestId('weather-temperature')).toHaveTextContent('-7°C');
    expect(container.querySelector('.sc-weather-apparent')).toHaveTextContent('Feels like -11°C');
    expectMetricText(container, '82 cm');
    expectMetricText(container, '12 km/h');
    expect(screen.getByText('Excellent')).toBeVisible();
    expect(screen.getByText('Open today')).toBeVisible();
    expect(screen.queryByText(/lifts|trails|2260|direction/i)).not.toBeInTheDocument();
  });

  it('uses the configured Russian name and translations', () => {
    localStorage.setItem('alpine_glide_lang', 'ru');
    const { container } = renderWeather();

    expect(screen.getByText('Настроенный горный курорт')).toBeVisible();
    expect(screen.getByText('Ясно')).toBeVisible();
    expect(screen.getByText('Снег')).toBeVisible();
    expect(screen.getByText('Ветер')).toBeVisible();
    expect(screen.getByText('Видимость')).toBeVisible();
    expectMetricText(container, '82 см');
    expectMetricText(container, '12 км/ч');
  });

  it('accepts actual zero values and leaves missing fields empty', () => {
    const { container } = renderWeather(
      presentation(
        {
          status: 'ready',
          data: {
            ...weather,
            temperatureC: 0,
            apparentTemperatureC: null,
            weatherCode: 999,
            windKmh: 0,
            snowDepthCm: null,
            visibilityM: null,
            liftsOpen: 3,
            liftsTotal: 4,
            trailsOpen: 2,
          },
        },
        'celsius',
        '',
        '',
        '',
        ''
      )
    );

    expect(container.querySelector('[data-weather-resort-name]')).not.toBeInTheDocument();
    expect(screen.getByTestId('weather-temperature')).toHaveTextContent('0°C');
    expectMetricText(container, '0 km/h');
    expect(
      screen.queryByText(/Snow|cm|Visibility|Open today|3\/4|2 trails/i)
    ).not.toBeInTheDocument();
    expect(screen.getByText('Condition unknown')).toBeVisible();
    expect(container.querySelector('[data-weather-condition-icon="unknown"]')).toBeInTheDocument();
  });

  it.each([
    ['loading', 'Weather…'],
    ['error', 'Weather temporarily unavailable'],
  ] as const)('preserves the %s message without placeholder conditions', (status, message) => {
    renderWeather(presentation({ status, data: null }));

    expect(screen.getByText(message)).toBeVisible();
    expect(screen.queryByText(/°C|°F|km\/h|cm/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Switch temperature/ })).not.toBeInTheDocument();
  });

  it('shows configured closed status independently of unavailable weather', () => {
    renderWeather(
      presentation(
        { status: 'error', data: null },
        'celsius',
        undefined,
        undefined,
        'CLOSED',
        'ЗАКРЫТО'
      )
    );

    expect(screen.getByText('Closed today')).toBeVisible();
    expect(screen.queryByText(/open now|lifts running|trails open/i)).not.toBeInTheDocument();
  });

  it('exposes unit switching as an action only when its callback exists', async () => {
    const onToggle = vi.fn();
    const user = userEvent.setup();
    renderWeather(presentation(), onToggle);

    const switchButton = screen.getByRole('button', {
      name: '-7°C. Switch temperature to Fahrenheit',
    });
    await user.tab();
    expect(switchButton).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(onToggle).toHaveBeenCalledOnce();

    cleanup();
    renderWeather(presentation());
    expect(screen.queryByRole('button', { name: /Switch temperature/ })).not.toBeInTheDocument();
    expect(screen.getByTestId('weather-temperature')).toHaveTextContent('-7°C');
  });
});
