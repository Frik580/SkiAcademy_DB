import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ResortSliderSection } from '../../src/features/admin/components/resort/sections/ResortSliderSection';

const saveResortConfig = vi.fn();
const subscribeResortConfig = vi.fn();

vi.mock('../../src/app/providers/LanguageContext', () => ({
  useLanguage: () => ({ t: (key: string) => key, language: 'en' as const }),
}));

vi.mock('../../src/features/notifications', () => ({
  useNotifications: () => ({ addNotification: vi.fn() }),
}));

vi.mock('../../src/features/settings', () => ({
  saveResortConfig: (...args: unknown[]) => saveResortConfig(...args),
  subscribeResortConfig: (...args: unknown[]) => subscribeResortConfig(...args),
}));

vi.mock('../../src/shared', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

const baseSlide = {
  id: 'slide-1',
  line1En: 'A',
  line1Ru: 'А',
  line2En: 'B',
  line2Ru: 'Б',
  line3En: 'C',
  line3Ru: 'С',
  backgroundImage: 'wall',
};

describe('ResortSliderSection banner background mode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    saveResortConfig.mockResolvedValue(undefined);
    subscribeResortConfig.mockImplementation((onConfig: (data: unknown) => void) => {
      onConfig({
        slides: [baseSlide],
        slideIntervalSeconds: 6,
        slidesRandomOrder: false,
      });
      return () => {};
    });
  });

  it('persists backgroundMediaMode when switching Image → Video → Image', async () => {
    render(<ResortSliderSection />);
    await screen.findByText('bannerBackgroundMode');

    fireEvent.click(screen.getByRole('button', { name: 'bannerBackgroundVideo' }));
    fireEvent.click(screen.getByRole('button', { name: 'saveResortSettings' }));

    await waitFor(() => expect(saveResortConfig).toHaveBeenCalledTimes(1));
    expect(saveResortConfig.mock.calls[0][0].slides[0].backgroundMediaMode).toBe('video');

    fireEvent.click(screen.getByRole('button', { name: 'bannerBackgroundImage' }));
    fireEvent.click(screen.getByRole('button', { name: 'saveResortSettings' }));

    await waitFor(() => expect(saveResortConfig).toHaveBeenCalledTimes(2));
    expect(saveResortConfig.mock.calls[1][0].slides[0].backgroundMediaMode).toBe('image');
  });

  it('loads historical slides without backgroundMediaMode', async () => {
    render(<ResortSliderSection />);
    await screen.findByText('bannerBackgroundMode');
    expect(screen.getByRole('button', { name: 'bannerBackgroundImage' })).toHaveClass(
      'bg-[var(--ink)]'
    );
  });
});
