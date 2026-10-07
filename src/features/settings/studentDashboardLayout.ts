export type DashboardTileSize = 'small' | 'medium' | 'large' | 'full';

/** The only catalogue of home tiles; position is the pre-grid DOM order. */
export const STUDENT_DASHBOARD_TILES = {
  currentSessions: {
    key: 'currentSessions',
    desktopColumn: 'left',
    label: { ru: 'Сейчас идут', en: 'Current sessions' },
    defaultSize: 'medium',
    defaultOrder: 1,
  },
  countdown: {
    key: 'countdown',
    desktopColumn: 'left',
    label: { ru: 'До начала', en: 'Session countdown' },
    defaultSize: 'small',
    defaultOrder: 2,
  },
  todayTasks: {
    key: 'todayTasks',
    desktopColumn: 'right',
    label: { ru: 'Задачи на сегодня', en: 'Today’s tasks' },
    defaultSize: 'medium',
    defaultOrder: 3,
  },
  nextStep: {
    key: 'nextStep',
    desktopColumn: 'left',
    label: { ru: 'Следующий шаг', en: 'Next step' },
    defaultSize: 'small',
    defaultOrder: 4,
  },
  nextSession: {
    key: 'nextSession',
    desktopColumn: 'right',
    label: { ru: 'Следующая тренировка / курс', en: 'Next session / course' },
    defaultSize: 'large',
    defaultOrder: 5,
  },
  todayAchievements: {
    key: 'todayAchievements',
    desktopColumn: 'right',
    label: { ru: 'Достижения за сегодня', en: 'Today’s progress' },
    defaultSize: 'medium',
    defaultOrder: 6,
  },
  skillRadar: {
    key: 'skillRadar',
    desktopColumn: 'left',
    label: { ru: 'Радар навыков', en: 'Skill radar' },
    defaultSize: 'medium',
    defaultOrder: 7,
  },
  needsAttention: {
    key: 'needsAttention',
    desktopColumn: 'left',
    label: { ru: 'Требует внимания', en: 'Needs attention' },
    defaultSize: 'medium',
    defaultOrder: 8,
  },
  instructorRecommendations: {
    key: 'instructorRecommendations',
    desktopColumn: 'right',
    label: { ru: 'Последняя рекомендация тренера', en: 'Latest coach recommendation' },
    defaultSize: 'medium',
    defaultOrder: 9,
  },
  weather: {
    key: 'weather',
    desktopColumn: 'left',
    label: { ru: 'Погода', en: 'Weather' },
    defaultSize: 'small',
    defaultOrder: 10,
  },
} as const satisfies Record<
  string,
  {
    key: string;
    label: { ru: string; en: string };
    defaultSize: DashboardTileSize;
    defaultOrder: number;
    desktopColumn: 'left' | 'right';
  }
>;

export type StudentDashboardTileKey = keyof typeof STUDENT_DASHBOARD_TILES;
export const STUDENT_DASHBOARD_TILE_REGISTRY = Object.values(STUDENT_DASHBOARD_TILES).sort(
  (a, b) => a.defaultOrder - b.defaultOrder
);
export const STUDENT_DASHBOARD_LAYOUT_SETTING_ID = 'student_dashboard_layout';
export type StudentDashboardColumn = 'left' | 'right';
export interface StudentDashboardLayout {
  version: 1;
  order: StudentDashboardTileKey[];
}
export const STUDENT_DASHBOARD_COLUMNS = ['left', 'right'] as const;
export function getDashboardColumnKeys(column: StudentDashboardColumn) {
  return STUDENT_DASHBOARD_TILE_REGISTRY.filter((tile) => tile.desktopColumn === column).map(
    (tile) => tile.key
  );
}
/** Swap only this column's existing slots, preserving the interleaved mobile order. */
export function moveDashboardTile(
  layout: StudentDashboardLayout,
  key: StudentDashboardTileKey,
  target: StudentDashboardTileKey
): StudentDashboardLayout {
  const column = STUDENT_DASHBOARD_TILES[key].desktopColumn;
  if (STUDENT_DASHBOARD_TILES[target].desktopColumn !== column) return layout;
  const keys = layout.order.filter(
    (item) => STUDENT_DASHBOARD_TILES[item].desktopColumn === column
  );
  const index = keys.indexOf(target);
  if (index < 0 || !keys.includes(key)) return layout;
  keys.splice(keys.indexOf(key), 1);
  keys.splice(index, 0, key);
  let cursor = 0;
  return {
    version: 1,
    order: layout.order.map((item) =>
      STUDENT_DASHBOARD_TILES[item].desktopColumn === column ? keys[cursor++] : item
    ),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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
  return { version: 1, order };
}

export const DEFAULT_STUDENT_DASHBOARD_LAYOUT = normalizeStudentDashboardLayout();

/** Strict writes: reject invalid drafts before making a Firestore request. */
export function validateStudentDashboardLayout(value: StudentDashboardLayout): void {
  if (
    value.version !== 1 ||
    !Array.isArray(value.order) ||
    value.order.length !== STUDENT_DASHBOARD_TILE_REGISTRY.length ||
    new Set(value.order).size !== value.order.length ||
    !value.order.every(isStudentDashboardTileKey)
  ) {
    throw new Error('Invalid student dashboard layout');
  }
}

export function getOrderedDashboardTiles(layout: StudentDashboardLayout) {
  return layout.order.map((key) => STUDENT_DASHBOARD_TILES[key]);
}
