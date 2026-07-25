export type DesignTheme = 'classic' | 'lodge';

export const DESIGN_THEMES: DesignTheme[] = ['classic', 'lodge'];

export const parseDesignTheme = (value: unknown): DesignTheme =>
  value === 'lodge' ? 'lodge' : 'classic';

export const applyDesignThemeToDOM = (theme: DesignTheme) => {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (theme === 'lodge') {
    root.classList.add('theme-lodge');
  } else {
    root.classList.remove('theme-lodge');
  }
};
