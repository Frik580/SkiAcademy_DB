import { useLanguage } from '../../../../app/providers/LanguageContext';
import {
  DASHBOARD_TILE_COLUMNS,
  type DashboardTileSize,
} from '../../../settings/studentDashboardLayout';

export function useStudentDashboardSettingsTranslations() {
  const { language } = useLanguage();
  const lang: 'ru' | 'en' = language === 'ru' ? 'ru' : 'en';
  const ru = lang === 'ru';
  return {
    lang,
    title: ru ? 'Кабинет ученика → Главная' : 'Student cabinet → Home',
    description: ru
      ? 'Порядок карточек на всех экранах и размеры на desktop.'
      : 'Card order on every screen and desktop sizes.',
    size: ru ? 'Базовый размер' : 'Base size',
    autoGrow: ru ? 'Авторасширение' : 'Auto-grow',
    autoGrowDescription: ru
      ? 'Разрешить плитке увеличиваться на один размер, если это помогает заполнить строку.'
      : 'Allow the tile to grow by one size when it helps fill the row.',
    autoGrowLimit: (size: DashboardTileSize) =>
      ru
        ? `Разрешить увеличение до ${size} · ${DASHBOARD_TILE_COLUMNS[size]}/12`
        : `Allow growth up to ${size} · ${DASHBOARD_TILE_COLUMNS[size]}/12`,
    fullWidth: ru
      ? 'Плитка уже занимает максимальную ширину'
      : 'The tile already occupies the maximum width',
    sizeLabel: (size: DashboardTileSize) =>
      `${size[0].toUpperCase()}${size.slice(1)} · ${DASHBOARD_TILE_COLUMNS[size]}/12`,
    preview: ru ? 'Предпросмотр desktop' : 'Desktop preview',
    save: ru ? 'Сохранить' : 'Save',
    saving: ru ? 'Сохранение…' : 'Saving…',
    cancel: ru ? 'Отменить изменения' : 'Cancel changes',
    reset: ru ? 'Восстановить стандартную раскладку' : 'Restore default layout',
    saved: ru ? 'Раскладка сохранена.' : 'Layout saved.',
    error: ru
      ? 'Не удалось сохранить раскладку. Изменения остались в черновике. Повторите сохранение.'
      : 'Could not save the layout. Your draft is preserved. Try saving again.',
    moveUp: (label: string) => (ru ? `Переместить «${label}» выше` : `Move “${label}” up`),
    moveDown: (label: string) => (ru ? `Переместить «${label}» ниже` : `Move “${label}” down`),
    drag: (label: string) => (ru ? `Перетащить «${label}»` : `Drag “${label}”`),
  };
}
