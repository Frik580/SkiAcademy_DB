import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_STUDENT_DASHBOARD_LAYOUT as defaults,
  getDashboardColumnKeys,
  moveDashboardTile,
  normalizeStudentDashboardLayout,
  validateStudentDashboardLayout,
} from '../../src/features/settings/studentDashboardLayout';
import { StudentDashboardColumns } from '../../src/features/student-cabinet/components/student/StudentDashboardColumns';
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
describe('fixed dashboard order', () => {
  it('uses canonical default membership and order', () => {
    expect(getDashboardColumnKeys('left')).toEqual([
      'currentSessions',
      'countdown',
      'nextStep',
      'skillRadar',
      'needsAttention',
      'instructorRecommendations',
      'weather',
    ]);
    expect(getDashboardColumnKeys('right')).toEqual([
      'todayTasks',
      'nextSession',
      'todayAchievements',
    ]);
    expect(() => validateStudentDashboardLayout(defaults)).not.toThrow();
  });
  it.each([undefined, null, [], 'bad', { version: 9 }, { version: 1, order: 4 }])(
    'defaults malformed documents %j',
    (value) => {
      expect(normalizeStudentDashboardLayout(value)).toEqual(defaults);
    }
  );
  it('preserves legacy order, removes invalid and duplicate IDs, appends missing tiles and ignores geometry', () => {
    const layout = normalizeStudentDashboardLayout({
      version: 1,
      order: ['weather', 'UNKNOWN', 'weather', '__proto__', 'countdown'],
      tiles: { weather: { desktopSize: 'full', allowAutoGrow: true, column: 'right' } },
      placement: {},
      masonry: true,
    });
    expect(layout).toEqual({
      version: 1,
      order: [
        'weather',
        'countdown',
        ...defaults.order.filter((key) => key !== 'weather' && key !== 'countdown'),
      ],
    });
  });
  it('rejects incomplete and duplicate writes', () => {
    expect(() => validateStudentDashboardLayout({ ...defaults, order: ['weather'] })).toThrow();
    expect(() =>
      validateStudentDashboardLayout({ ...defaults, order: defaults.order.map(() => 'weather') })
    ).toThrow();
  });
  it('reorders each column while preserving other column slots and refusing cross-column moves', () => {
    for (const [key, target] of [
      ['weather', 'currentSessions'],
      ['todayAchievements', 'todayTasks'],
    ] as const) {
      const moved = moveDashboardTile(defaults, key, target);
      expect(moved.order.indexOf(key)).toBe(defaults.order.indexOf(target));
    }
    expect(moveDashboardTile(defaults, 'todayTasks', 'weather')).toBe(defaults);
  });
  it('renders saved column order and restores conditional cards without empty hosts', () => {
    vi.stubGlobal('matchMedia', () => ({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    const layout = normalizeStudentDashboardLayout({
      version: 1,
      order: ['weather', 'countdown', 'todayAchievements', 'todayTasks'],
    });
    const tiles = Object.fromEntries(
      defaults.order.map((key) => [key, <span key={key}>{key}</span>])
    ) as Parameters<typeof StudentDashboardColumns>[0]['tiles'];
    const { container, rerender } = render(
      <StudentDashboardColumns tiles={{ ...tiles, countdown: null }} order={layout.order} />
    );
    const keys = (column: string) =>
      [
        ...container.querySelectorAll(
          `[data-dashboard-column="${column}"] > [data-dashboard-item]`
        ),
      ].map((el) => el.getAttribute('data-dashboard-item'));
    expect(keys('left').slice(0, 2)).toEqual(['weather', 'currentSessions']);
    expect(keys('right').slice(0, 2)).toEqual(['todayAchievements', 'todayTasks']);
    rerender(<StudentDashboardColumns tiles={tiles} order={layout.order} />);
    expect(keys('left').slice(0, 3)).toEqual(['weather', 'countdown', 'currentSessions']);
  });
});
