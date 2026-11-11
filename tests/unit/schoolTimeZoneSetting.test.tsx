import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SchoolTimeZoneSetting } from '../../src/features/admin/components/resort/sections/SchoolTimeZoneSetting';
import { translations } from '../../src/lib/i18n/translations';

const mocks = vi.hoisted(() => ({
  state: { timeZone: 'Asia/Almaty', ready: true, error: undefined as Error | undefined },
  save: vi.fn(),
  notify: vi.fn(),
  language: 'en' as 'en' | 'ru',
}));
vi.mock('../../src/features/settings/schoolTimeZone', () => ({
  useSchoolTimeZone: () => mocks.state,
  saveSchoolTimeZone: (...args: unknown[]) => mocks.save(...args),
}));
vi.mock('../../src/features/settings/useSchoolTimeZoneTranslations', () => ({
  useSchoolTimeZoneTranslations: () => ({
    language: mocks.language,
    t: (key: keyof typeof translations.en) => translations[mocks.language][key],
  }),
}));
vi.mock('../../src/features/notifications', () => ({
  useNotifications: () => ({ addNotification: mocks.notify }),
}));
describe('school timezone admin setting', () => {
  beforeEach(() => {
    mocks.state = { timeZone: 'Asia/Almaty', ready: true, error: undefined };
    mocks.language = 'en';
    mocks.save.mockReset();
    mocks.notify.mockReset();
  });
  it('saves the selected zone once and synchronizes external changes', async () => {
    let finish!: () => void;
    mocks.save.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        })
    );
    const view = render(<SchoolTimeZoneSetting />);
    fireEvent.change(screen.getByLabelText('School time zone'), {
      target: { value: 'Europe/Paris' },
    });
    const button = screen.getByRole('button');
    fireEvent.click(button);
    fireEvent.click(button);
    expect(mocks.save).toHaveBeenCalledExactlyOnceWith('Europe/Paris', 'Asia/Almaty');
    await act(async () => finish());
    expect(mocks.notify).toHaveBeenCalledWith('success', expect.any(String), expect.any(String));
    mocks.state = { timeZone: 'UTC', ready: true, error: undefined };
    view.rerender(<SchoolTimeZoneSetting />);
    expect((screen.getByLabelText('School time zone') as HTMLSelectElement).value).toBe('UTC');
  });
  it('disables unconfirmed settings and diagnoses load failures', () => {
    mocks.language = 'ru';
    mocks.state.ready = false;
    mocks.state.error = new Error('permission-denied');
    render(<SchoolTimeZoneSetting />);
    expect((screen.getByLabelText('Часовой пояс школы') as HTMLSelectElement).disabled).toBe(true);
    expect(screen.getByRole('status').textContent).toContain('permission-denied');
  });
  it('accepts other IANA identifiers, rejects invalid input, and reports save failures', async () => {
    mocks.save.mockRejectedValue(new Error('offline'));
    render(<SchoolTimeZoneSetting />);
    const custom = screen.getByLabelText('Other IANA time zone');
    fireEvent.change(custom, { target: { value: 'bad/zone' } });
    expect((screen.getByRole('button') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(custom, { target: { value: 'Pacific/Auckland' } });
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() =>
      expect(mocks.notify).toHaveBeenCalledWith('error', expect.any(String), expect.any(String))
    );
  });
});
