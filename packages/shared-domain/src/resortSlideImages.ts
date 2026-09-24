/** Built-in logical image identifiers supported by resort slides. */
export const RESORT_SLIDE_WALL_IMAGE_KEYS = [
  'wall',
  'wall2',
  'wall3',
  'wall4',
  'wall5',
  'wall6',
  'wall7',
] as const;

export const RESORT_SLIDE_ABOUT_IMAGE_KEY = 'about' as const;
export const RESORT_SLIDE_RANDOM_IMAGE_KEY = 'random' as const;

export const RESORT_SLIDE_LOGICAL_IMAGE_KEYS = [
  ...RESORT_SLIDE_WALL_IMAGE_KEYS,
  RESORT_SLIDE_ABOUT_IMAGE_KEY,
  RESORT_SLIDE_RANDOM_IMAGE_KEY,
] as const;

const RESORT_SLIDE_LOGICAL_IMAGE_KEY_SET: ReadonlySet<string> = new Set(
  RESORT_SLIDE_LOGICAL_IMAGE_KEYS
);

export function isSupportedResortSlideLogicalImageKey(
  value: unknown
): value is (typeof RESORT_SLIDE_LOGICAL_IMAGE_KEYS)[number] {
  return typeof value === 'string' && RESORT_SLIDE_LOGICAL_IMAGE_KEY_SET.has(value);
}
