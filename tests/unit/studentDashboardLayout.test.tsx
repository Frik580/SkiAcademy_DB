import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  DASHBOARD_TILE_SIZES,
  DEFAULT_STUDENT_DASHBOARD_LAYOUT,
  DESKTOP_TILE_CLASSES,
  getOrderedDashboardTiles,
  normalizeStudentDashboardLayout,
  STUDENT_DASHBOARD_TILE_REGISTRY,
  STUDENT_DASHBOARD_TILES,
  validateStudentDashboardLayout,
} from '../../src/features/settings/studentDashboardLayout';
import {
  StudentDashboardTile,
  STUDENT_DASHBOARD_GRID_CLASSES,
} from '../../src/features/student-cabinet/components/student/StudentDashboardTile';

afterEach(cleanup);
describe('student dashboard layout', () => {
  it('registers only the ten configurable tiles, excluding Journey from defaults', () => {
    expect(STUDENT_DASHBOARD_TILE_REGISTRY).toHaveLength(10);
    expect(STUDENT_DASHBOARD_TILES).not.toHaveProperty('masteryPath');
    expect(DEFAULT_STUDENT_DASHBOARD_LAYOUT.order).not.toContain('masteryPath');
    expect(DEFAULT_STUDENT_DASHBOARD_LAYOUT.tiles).not.toHaveProperty('masteryPath');
    expect(DEFAULT_STUDENT_DASHBOARD_LAYOUT.order[0]).toBe('currentSessions');
  });
  it('ignores obsolete Journey order and size while preserving other remote preferences', () => {
    const layout = normalizeStudentDashboardLayout({
      version: 1,
      order: ['masteryPath', 'weather', 'countdown', 'masteryPath'],
      tiles: { masteryPath: { desktopSize: 'small' }, weather: { desktopSize: 'full' } },
    });
    expect(layout.order).toEqual([
      'weather',
      'countdown',
      ...DEFAULT_STUDENT_DASHBOARD_LAYOUT.order.filter(
        (key) => key !== 'weather' && key !== 'countdown'
      ),
    ]);
    expect(layout.tiles).not.toHaveProperty('masteryPath');
    expect(layout.tiles.weather.desktopSize).toBe('full');
    expect(() => validateStudentDashboardLayout(layout)).not.toThrow();
  });
  it.each([undefined, null, [], 'bad', { version: 9 }, { version: 1, order: 4, tiles: null }])(
    'falls back safely without a usable document: %j',
    (remote) => {
      expect(normalizeStudentDashboardLayout(remote)).toEqual(DEFAULT_STUDENT_DASHBOARD_LAYOUT);
    }
  );
  it('default order matches the registry and writes valid semantic sizes', () => {
    expect(DEFAULT_STUDENT_DASHBOARD_LAYOUT.order).toEqual(
      STUDENT_DASHBOARD_TILE_REGISTRY.map((tile) => tile.key)
    );
    expect(() => validateStudentDashboardLayout(DEFAULT_STUDENT_DASHBOARD_LAYOUT)).not.toThrow();
  });
  it.each(DASHBOARD_TILE_SIZES)(
    'accepts remote %s and keeps mobile single column',
    (desktopSize) => {
      const layout = normalizeStudentDashboardLayout({
        version: 1,
        tiles: { weather: { desktopSize } },
      });
      const { container } = render(
        <StudentDashboardTile tileKey="weather" size={layout.tiles.weather.desktopSize}>
          Weather
        </StudentDashboardTile>
      );
      expect(container.firstChild).toHaveClass(
        'col-span-1',
        'md:col-span-1',
        DESKTOP_TILE_CLASSES[desktopSize]
      );
      expect(STUDENT_DASHBOARD_GRID_CLASSES).toContain('grid-cols-1');
      expect(STUDENT_DASHBOARD_GRID_CLASSES).not.toContain('dense');
      expect(STUDENT_DASHBOARD_GRID_CLASSES).toContain('md:grid-cols-2');
      expect(STUDENT_DASHBOARD_GRID_CLASSES).toContain('xl:grid-cols-12');
    }
  );
  it.each(['gigantic', 7, null, undefined, {}, ['small']])(
    'falls back per tile for malformed size %j',
    (desktopSize) => {
      const layout = normalizeStudentDashboardLayout({
        version: 1,
        tiles: { weather: { desktopSize }, nextSession: { desktopSize: 'full' } },
      });
      expect(layout.tiles.weather).toEqual(DEFAULT_STUDENT_DASHBOARD_LAYOUT.tiles.weather);
      expect(layout.tiles.nextSession.desktopSize).toBe('full');
    }
  );
  it('keeps remote order, removes duplicates/unknown/invalid keys, appends missing and new tiles deterministically', () => {
    const layout = normalizeStudentDashboardLayout({
      version: 1,
      order: ['countdown', 'weather', 'UNKNOWN', 'countdown', null, 3, '__proto__'],
    });
    expect(layout.order).toEqual([
      'countdown',
      'weather',
      ...DEFAULT_STUDENT_DASHBOARD_LAYOUT.order.filter(
        (key) => key !== 'countdown' && key !== 'weather'
      ),
    ]);
    expect(getOrderedDashboardTiles(layout).map((tile) => tile.key)).toEqual(layout.order);
  });
  it('rejects incomplete, duplicate and malformed drafts before writing', () => {
    expect(() =>
      validateStudentDashboardLayout({ ...DEFAULT_STUDENT_DASHBOARD_LAYOUT, order: ['weather'] })
    ).toThrow();
    const bad = normalizeStudentDashboardLayout();
    bad.order[0] = bad.order[1];
    expect(() => validateStudentDashboardLayout(bad)).toThrow();
    const invalid = normalizeStudentDashboardLayout();
    Object.assign(invalid.tiles.weather, { desktopSize: 'gigantic' });
    expect(() => validateStudentDashboardLayout(invalid)).toThrow();
  });
});

describe('dashboard auto-grow configuration', () => {
  it('uses registry boolean defaults for old configs without a migration', () => {
    for (const tile of STUDENT_DASHBOARD_TILE_REGISTRY) {
      const config = normalizeStudentDashboardLayout({
        version: 1,
        tiles: { [tile.key]: { desktopSize: 'full' } },
      });
      expect(config.tiles[tile.key].allowAutoGrow).toBe(tile.defaultAllowAutoGrow);
      expect(config.tiles[tile.key].desktopSize).toBe('full');
    }
  });
  it.each([true, false])('reads explicit boolean %s', (allowAutoGrow) => {
    expect(
      normalizeStudentDashboardLayout({ version: 1, tiles: { weather: { allowAutoGrow } } }).tiles
        .weather.allowAutoGrow
    ).toBe(allowAutoGrow);
  });
  it.each(['yes', 1, null, undefined, {}, []])(
    'falls back on malformed auto-grow %j',
    (allowAutoGrow) => {
      const config = normalizeStudentDashboardLayout({
        version: 1,
        tiles: { weather: { allowAutoGrow }, todayAchievements: { allowAutoGrow } },
      });
      expect(config.tiles.weather.allowAutoGrow).toBe(true);
      expect(config.tiles.todayAchievements.allowAutoGrow).toBe(false);
    }
  );
  it('rejects a non-boolean draft before persistence', () => {
    const config = normalizeStudentDashboardLayout();
    Object.assign(config.tiles.weather, { allowAutoGrow: 'yes' });
    expect(() => validateStudentDashboardLayout(config)).toThrow();
  });
});
