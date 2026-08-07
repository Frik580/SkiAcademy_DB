export type DesignTheme = 'air' | 'classic' | 'lodge';

export const DESIGN_THEMES: DesignTheme[] = ['air'];

export const parseDesignTheme = (_value?: unknown): DesignTheme => {
  return 'air';
};

export const applyDesignThemeToDOM = (_theme?: DesignTheme) => {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.classList.remove('theme-lodge');
  root.classList.add('theme-air');
};
