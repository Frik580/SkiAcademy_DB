import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ResortDataSection } from '../../src/features/admin/components/resort/sections/ResortDataSection';

const { source } = vi.hoisted(() => ({
  source: { config: null as null | { nameEn?: string; nameRu?: string } },
}));
vi.mock('../../src/features/settings', () => ({
  subscribeResortConfig: (onConfig: (config: typeof source.config) => void) => {
    onConfig(source.config);
    return () => {};
  },
  saveResortConfig: vi.fn(),
}));
vi.mock('../../src/app/providers/LanguageContext', () => ({
  useLanguage: () => ({ language: 'en', t: (key: string) => key }),
}));
vi.mock('../../src/features/notifications', () => ({
  useNotifications: () => ({ addNotification: vi.fn() }),
}));
afterEach(cleanup);

describe('resort settings name source', () => {
  it.each([null, {}])('does not seed Chamonix when config names are missing: %s', (config) => {
    source.config = config;
    render(<ResortDataSection />);
    expect(screen.getByPlaceholderText('resortNameEnLabel')).toHaveValue('');
    expect(screen.getByPlaceholderText('resortNameRuLabel')).toHaveValue('');
    expect(screen.getByPlaceholderText('resortNameEnLabel')).toBeRequired();
    expect(screen.getByPlaceholderText('resortNameRuLabel')).toBeRequired();
  });
  it('retains the configured localized names', () => {
    source.config = { nameEn: 'Configured Resort', nameRu: 'Курорт из настройки' };
    render(<ResortDataSection />);
    expect(screen.getByPlaceholderText('resortNameEnLabel')).toHaveValue(source.config.nameEn);
    expect(screen.getByPlaceholderText('resortNameRuLabel')).toHaveValue(source.config.nameRu);
  });
});
