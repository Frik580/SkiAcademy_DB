export type DashboardTileSize = 'small' | 'medium' | 'large' | 'full';

/** The only catalogue of home tiles; position is the pre-grid DOM order. */
export const STUDENT_DASHBOARD_TILES = {
  currentSessions: {
    key: 'currentSessions',
    label: { ru: 'Сейчас идут', en: 'Current sessions' },
    defaultSize: 'medium',
    defaultAllowAutoGrow: true,
    defaultOrder: 1,
  },
  countdown: {
    key: 'countdown',
    label: { ru: 'До начала', en: 'Session countdown' },
    defaultSize: 'small',
    defaultAllowAutoGrow: true,
    defaultOrder: 2,
  },
  todayTasks: {
    key: 'todayTasks',
    label: { ru: 'Задачи на сегодня', en: 'Today’s tasks' },
    defaultSize: 'medium',
    defaultAllowAutoGrow: true,
    defaultOrder: 3,
  },
  nextStep: {
    key: 'nextStep',
    label: { ru: 'Следующий шаг', en: 'Next step' },
    defaultSize: 'small',
    defaultAllowAutoGrow: true,
    defaultOrder: 4,
  },
  nextSession: {
    key: 'nextSession',
    label: { ru: 'Следующая тренировка / курс', en: 'Next session / course' },
    defaultSize: 'large',
    defaultAllowAutoGrow: true,
    defaultOrder: 5,
  },
  todayAchievements: {
    key: 'todayAchievements',
    label: { ru: 'Достижения за сегодня', en: 'Today’s progress' },
    defaultSize: 'medium',
    defaultAllowAutoGrow: false,
    defaultOrder: 6,
  },
  skillRadar: {
    key: 'skillRadar',
    label: { ru: 'Радар навыков', en: 'Skill radar' },
    defaultSize: 'medium',
    defaultAllowAutoGrow: true,
    defaultOrder: 7,
  },
  needsAttention: {
    key: 'needsAttention',
    label: { ru: 'Требует внимания', en: 'Needs attention' },
    defaultSize: 'medium',
    defaultAllowAutoGrow: true,
    defaultOrder: 8,
  },
  instructorRecommendations: {
    key: 'instructorRecommendations',
    label: { ru: 'Рекомендации тренера', en: 'Coach recommendations' },
    defaultSize: 'medium',
    defaultAllowAutoGrow: true,
    defaultOrder: 9,
  },
  weather: {
    key: 'weather',
    label: { ru: 'Погода', en: 'Weather' },
    defaultSize: 'small',
    defaultAllowAutoGrow: true,
    defaultOrder: 10,
  },
} as const satisfies Record<
  string,
  {
    key: string;
    label: { ru: string; en: string };
    defaultSize: DashboardTileSize;
    defaultOrder: number;
    defaultAllowAutoGrow: boolean;
  }
>;

export type StudentDashboardTileKey = keyof typeof STUDENT_DASHBOARD_TILES;
export const STUDENT_DASHBOARD_TILE_REGISTRY = Object.values(STUDENT_DASHBOARD_TILES).sort(
  (a, b) => a.defaultOrder - b.defaultOrder
);
export const STUDENT_DASHBOARD_LAYOUT_SETTING_ID = 'student_dashboard_layout';
export const DASHBOARD_TILE_SIZES: readonly DashboardTileSize[] = [
  'small',
  'medium',
  'large',
  'full',
];
export const DASHBOARD_TILE_COLUMNS: Record<DashboardTileSize, number> = {
  small: 4,
  medium: 6,
  large: 8,
  full: 12,
};
export const DESKTOP_TILE_CLASSES: Record<DashboardTileSize, string> = {
  small: 'xl:col-span-4',
  medium: 'xl:col-span-6',
  large: 'xl:col-span-8',
  full: 'xl:col-span-12',
};

export interface StudentDashboardTileLayout {
  desktopSize: DashboardTileSize;
  allowAutoGrow: boolean;
}

export interface StudentDashboardLayout {
  version: 1;
  order: StudentDashboardTileKey[];
  tiles: Record<StudentDashboardTileKey, StudentDashboardTileLayout>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isDashboardTileSize(value: unknown): value is DashboardTileSize {
  return DASHBOARD_TILE_SIZES.some((size) => size === value);
}

export function isStudentDashboardTileKey(value: unknown): value is StudentDashboardTileKey {
  return typeof value === 'string' && Object.hasOwn(STUDENT_DASHBOARD_TILES, value);
}

/** Tolerant reads: a missing/older/malformed document can never remove a tile. */
export function normalizeStudentDashboardLayout(remote?: unknown): StudentDashboardLayout {
  const data = isRecord(remote) && remote.version === 1 ? remote : {};
  const order: StudentDashboardTileKey[] = [];
  if (Array.isArray(data.order)) {
    for (const key of data.order) {
      if (isStudentDashboardTileKey(key) && !order.includes(key)) order.push(key);
    }
  }
  for (const tile of STUDENT_DASHBOARD_TILE_REGISTRY) {
    if (!order.includes(tile.key)) order.push(tile.key);
  }
  const remoteTiles = isRecord(data.tiles) ? data.tiles : {};
  const tiles = Object.fromEntries(
    STUDENT_DASHBOARD_TILE_REGISTRY.map((tile) => {
      const override = remoteTiles[tile.key];
      const size = isRecord(override) ? override.desktopSize : undefined;
      return [
        tile.key,
        {
          desktopSize: isDashboardTileSize(size) ? size : tile.defaultSize,
          allowAutoGrow:
            isRecord(override) && typeof override.allowAutoGrow === 'boolean'
              ? override.allowAutoGrow
              : tile.defaultAllowAutoGrow,
        },
      ];
    })
  ) as StudentDashboardLayout['tiles'];
  return { version: 1, order, tiles };
}

export const DEFAULT_STUDENT_DASHBOARD_LAYOUT = normalizeStudentDashboardLayout();

/** Strict writes: reject invalid drafts before making a Firestore request. */
export function validateStudentDashboardLayout(value: StudentDashboardLayout): void {
  if (
    value.version !== 1 ||
    !Array.isArray(value.order) ||
    value.order.length !== STUDENT_DASHBOARD_TILE_REGISTRY.length ||
    new Set(value.order).size !== value.order.length ||
    !value.order.every(isStudentDashboardTileKey) ||
    !isRecord(value.tiles) ||
    !STUDENT_DASHBOARD_TILE_REGISTRY.every(
      (tile) =>
        isDashboardTileSize(value.tiles[tile.key]?.desktopSize) &&
        typeof value.tiles[tile.key]?.allowAutoGrow === 'boolean'
    )
  ) {
    throw new Error('Invalid student dashboard layout');
  }
}

export function getOrderedDashboardTiles(layout: StudentDashboardLayout) {
  return layout.order.map((key) => STUDENT_DASHBOARD_TILES[key]);
}
