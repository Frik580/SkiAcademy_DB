const LEVEL_NAMES_EN: Record<number, string> = { 1: 'BEGINNER', 2: 'CARVE', 3: 'PERFORMANCE', 4: 'EXPERT' };
const LEVEL_NAMES_RU: Record<number, string> = { 1: 'НАЧИНАЮЩИЙ', 2: 'CARVE', 3: 'PERFORMANCE', 4: 'ЭКСПЕРТ' };
const LEVEL_LABEL_EN: Record<number, string> = { 1: 'Beginner', 2: 'Carve', 3: 'Performance', 4: 'Expert' };
const LEVEL_LABEL_RU: Record<number, string> = { 1: 'Начинающий', 2: 'Carve', 3: 'Performance', 4: 'Эксперт' };

export const getLevelName = (level: number, language: 'en' | 'ru') =>
  (language === 'ru' ? LEVEL_NAMES_RU : LEVEL_NAMES_EN)[level] || LEVEL_NAMES_EN[1];

export const getLevelLabel = (level: number, language: 'en' | 'ru') =>
  (language === 'ru' ? LEVEL_LABEL_RU : LEVEL_LABEL_EN)[level] || LEVEL_LABEL_EN[1];

export const getGreeting = (language: 'en' | 'ru', firstName: string) => {
  const hour = new Date().getHours();
  const prefix = hour < 12 ? (language === 'ru' ? 'Доброе утро' : 'Good morning') : hour < 18 ? (language === 'ru' ? 'Добрый день' : 'Good afternoon') : language === 'ru' ? 'Добрый вечер' : 'Good evening';
  return `${prefix}, ${firstName} 👋`;
};

export const getFirstName = (displayName: string) => displayName.split(' ')[0] || displayName;
export const toYMD = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
export const parseActivityTimestamp = (timestamp: string) => new Date(timestamp.includes('T') ? timestamp : `${timestamp}T12:00:00`);
export const isTimestampOnLocalDate = (timestamp: string, date: Date = new Date()) => toYMD(parseActivityTimestamp(timestamp)) === toYMD(date);
