import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ResortSeasonSection } from '../../src/features/admin/components/resort/sections/ResortSeasonSection';
import { getResortSeasonValidationError } from '../../src/features/settings/resortSeason';
import type { ResortSeasonSettings } from '../../src/types';

const { snapshot, save, notify } = vi.hoisted(() => ({
  snapshot: {
    config: null as null | { season?: ResortSeasonSettings },
    next: null as null | ((config: { season?: ResortSeasonSettings } | null) => void),
    reject: null as null | ((error: Error) => void),
  },
  save: vi.fn(),
  notify: vi.fn(),
}));

vi.mock('../../src/features/settings', () => ({
  subscribeResortConfig: (
    next: (config: typeof snapshot.config) => void,
    reject: (error: Error) => void
  ) => {
    snapshot.next = next;
    snapshot.reject = reject;
    next(snapshot.config);
    return () => {
      snapshot.next = null;
      snapshot.reject = null;
    };
  },
  saveResortSeason: save,
}));
vi.mock('../../src/app/providers/LanguageContext', () => ({
  useLanguage: () => ({ language: 'en', t: (key: string) => key }),
}));
vi.mock('../../src/features/notifications', () => ({
  useNotifications: () => ({ addNotification: notify }),
}));

const dates = {
  startDate: '2026-12-01',
  endDate: '2027-04-15',
};

describe('resort season calendar-day validation', () => {
  it('supports cross-year seasons and inclusive high-season boundaries', () => {
    expect(getResortSeasonValidationError({ ...dates, highSeason: { ...dates } })).toBeNull();
    expect(getResortSeasonValidationError({ ...dates, highSeason: null })).toBeNull();
    expect(
      getResortSeasonValidationError({ startDate: '2028-02-29', endDate: '2028-03-01' })
    ).toBeNull();
  });

  it.each([
    [{ startDate: '', endDate: '2027-04-15' }, 'seasonDatesRequired'],
    [{ startDate: '2026-02-29', endDate: '2026-04-15' }, 'seasonDatesInvalid'],
    [{ startDate: '2027-04-16', endDate: '2027-04-15' }, 'seasonDatesOrderError'],
    [
      { ...dates, highSeason: { startDate: '2026-12-28', endDate: '' } },
      'highSeasonDatesPairError',
    ],
    [
      { ...dates, highSeason: { startDate: '2027-01-10', endDate: '2027-01-09' } },
      'highSeasonDatesOrderError',
    ],
    [
      { ...dates, highSeason: { startDate: '2026-11-30', endDate: '2027-01-09' } },
      'highSeasonOutsideSeasonError',
    ],
    [
      { ...dates, highSeason: { startDate: '2027-04-15', endDate: '2027-04-16' } },
      'highSeasonOutsideSeasonError',
    ],
  ] as const)('rejects invalid periods with %s', (season, message) => {
    expect(getResortSeasonValidationError(season)).toBe(message);
  });
});

beforeEach(() => {
  snapshot.config = null;
  snapshot.next = null;
  snapshot.reject = null;
  save.mockReset();
  notify.mockReset();
  save.mockResolvedValue(undefined);
});
afterEach(cleanup);

function changeDate(id: string, value: string) {
  fireEvent.change(document.getElementById(id)!, { target: { value } });
}
function submit() {
  fireEvent.click(screen.getByRole('button', { name: 'saveSeasonSettings' }));
}

describe('admin resort season form', () => {
  it('loads configured dates and saves a high-season period within a cross-year season', async () => {
    snapshot.config = {
      season: { ...dates, highSeason: { startDate: '2026-12-20', endDate: '2027-02-10' } },
    };
    render(<ResortSeasonSection />);
    expect(document.getElementById('resort-season-start')).toHaveValue(dates.startDate);
    expect(document.getElementById('resort-high-season-start')).toHaveValue('2026-12-20');

    changeDate('resort-high-season-end', '2027-02-15');
    submit();
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    expect(save).toHaveBeenCalledWith({
      ...dates,
      highSeason: { startDate: '2026-12-20', endDate: '2027-02-15' },
    });
    expect(notify).toHaveBeenCalledWith('success', 'configUpdated', 'seasonSettingsSaved');
  });

  it('does not submit invalid high-season dates or overwrite a dirty draft on a resort snapshot', () => {
    snapshot.config = { season: { ...dates } };
    render(<ResortSeasonSection />);
    changeDate('resort-high-season-start', '2026-11-30');
    changeDate('resort-high-season-end', '2027-02-10');
    snapshot.next?.({ season: { startDate: '2027-12-01', endDate: '2028-04-15' } });
    expect(document.getElementById('resort-season-start')).toHaveValue('2026-12-01');
    submit();
    expect(screen.getByRole('alert')).toHaveTextContent('highSeasonOutsideSeasonError');
    expect(save).not.toHaveBeenCalled();
  });

  it('allows clearing high-season dates, keeping the main season unchanged', async () => {
    snapshot.config = {
      season: { ...dates, highSeason: { startDate: '2026-12-20', endDate: '2027-02-10' } },
    };
    render(<ResortSeasonSection />);
    changeDate('resort-high-season-start', '');
    changeDate('resort-high-season-end', '');
    submit();
    await waitFor(() => expect(save).toHaveBeenCalledWith({ ...dates, highSeason: null }));
  });

  it('blocks saving when the resort configuration subscription fails', () => {
    snapshot.config = { season: { ...dates } };
    render(<ResortSeasonSection />);
    act(() => snapshot.reject?.(new Error('permission denied')));
    expect(screen.getByRole('alert')).toHaveTextContent('seasonSettingsReadError');
    expect(screen.getByRole('button', { name: 'saveSeasonSettings' })).toBeDisabled();
    submit();
    expect(save).not.toHaveBeenCalled();
  });

  it('keeps edited dates and shows an error if persistence fails', async () => {
    snapshot.config = { season: { ...dates } };
    save.mockRejectedValueOnce(new Error('permission denied'));
    render(<ResortSeasonSection />);
    changeDate('resort-season-end', '2027-04-20');
    submit();
    await waitFor(() =>
      expect(notify).toHaveBeenCalledWith('error', 'configSaveError', 'configSaveErrorDesc')
    );
    expect(document.getElementById('resort-season-end')).toHaveValue('2027-04-20');
  });
});
