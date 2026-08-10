type NotificationFn = (
  type: 'error' | 'success' | 'info' | 'warning' | string,
  title: string,
  message: string
) => void;
type TranslateFn = (key: string) => string;
type LanguageFn = () => 'en' | 'ru';

let notificationFn: NotificationFn | null = null;
let translateFn: TranslateFn | null = null;
let languageFn: LanguageFn | null = null;

export const setStoreContext = (ctx: {
  notify: NotificationFn;
  t: TranslateFn;
  language: LanguageFn;
}) => {
  notificationFn = ctx.notify;
  translateFn = ctx.t;
  languageFn = ctx.language;
};

export const notify = (type: string, title: string, message: string) => {
  notificationFn?.(type, title, message);
};

export const t = (key: string) => translateFn?.(key) ?? key;

export const getLanguage = () => languageFn?.() ?? 'en';
