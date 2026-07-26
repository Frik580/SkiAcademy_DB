export type DesignTheme = 'classic' | 'lodge' | 'air';

export const DESIGN_THEMES: DesignTheme[] = ['classic', 'lodge', 'air'];

export const parseDesignTheme = (value: unknown): DesignTheme => {
  if (value === 'lodge') return 'lodge';
  if (value === 'air') return 'air';
  return 'classic';
};

export const applyDesignThemeToDOM = (theme: DesignTheme) => {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.classList.remove('theme-lodge', 'theme-air');
  if (theme === 'lodge') root.classList.add('theme-lodge');
  if (theme === 'air') root.classList.add('theme-air');
};
