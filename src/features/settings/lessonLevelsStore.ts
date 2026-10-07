import { create } from 'zustand';
import {
  DEFAULT_LESSON_LEVELS,
  LessonLevelsCatalogSchema,
  type LessonLevelDefinition,
} from '@ski-academy/shared-domain';
import { logger } from '../../shared/logger';

export const useLessonLevelsStore = create<{
  levels: readonly LessonLevelDefinition[];
  revision: number;
  loaded: boolean;
  error: boolean;
  receive: (value: unknown) => void;
  fail: () => void;
}>((set) => ({
  levels: DEFAULT_LESSON_LEVELS,
  revision: 0,
  loaded: false,
  error: false,
  receive: (value) => {
    if (value === undefined) {
      set({ levels: DEFAULT_LESSON_LEVELS, revision: 0, loaded: true, error: false });
      return;
    }
    const parsed = LessonLevelsCatalogSchema.safeParse(value);
    if (!parsed.success) {
      logger.error('Invalid lesson level catalog', parsed.error);
      set({ error: true });
      return;
    }
    set({ levels: parsed.data.levels, revision: parsed.data.revision, loaded: true, error: false });
  },
  fail: () => set({ error: true }),
}));
