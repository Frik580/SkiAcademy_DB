import { resolveLessonLevel } from '@ski-academy/shared-domain';
import { useLessonLevelsStore } from './lessonLevelsStore';
import { LessonLevelMarker } from './LessonLevelMarker';

export function LessonLevelLabel({
  levelId,
  language,
  fallback,
}: {
  levelId?: string;
  language: 'ru' | 'en';
  fallback: string;
}) {
  const levels = useLessonLevelsStore((state) => state.levels);
  const level = levelId ? resolveLessonLevel(levelId, levels) : undefined;
  if (!level || (!level.logoStoragePath && !level.markerColor)) return <>{fallback}</>;
  return (
    <>
      <LessonLevelMarker
        marker={level.marker}
        markerColor={level.markerColor}
        logoStoragePath={level.logoStoragePath}
      />{' '}
      {language === 'ru' ? level.nameRu : level.nameEn}
    </>
  );
}
