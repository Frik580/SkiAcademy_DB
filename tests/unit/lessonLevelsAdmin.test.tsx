import type { ReactNode } from 'react';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_LESSON_LEVELS } from '@ski-academy/shared-domain';
import { AdminLessonLevelsSettings } from '../../src/features/admin/components/settings/AdminLessonLevelsSettings';
import { useLessonLevelsStore } from '../../src/features/settings/lessonLevelsStore';
import {
  newLessonLevelLogoPath,
  uploadLessonLevelLogo,
} from '../../src/features/settings/lessonLevelLogo';
import { saveLessonLevels } from '../../src/features/settings/lessonLevelsService';

vi.mock('../../src/features/settings/lessonLevelLogo', async (original) => ({
  ...(await original<typeof import('../../src/features/settings/lessonLevelLogo')>()),
  newLessonLevelLogoPath: vi.fn(
    () => 'lesson-levels/beginner/admin/12345678-1234-4123-8123-123456789abc'
  ),
  uploadLessonLevelLogo: vi.fn(async () => undefined),
  getLessonLevelLogoUrl: vi.fn(async () => 'https://example.invalid/logo.png'),
}));
vi.mock('../../src/features/settings/lessonLevelsService', () => ({ saveLessonLevels: vi.fn() }));
vi.mock('../../src/app/providers/LanguageContext', () => ({
  useLanguage: () => ({ language: 'ru' }),
}));
vi.mock('../../src/features/admin/components/settings/AdminCollapsibleSection', () => ({
  AdminCollapsibleSection: ({ children }: { children: ReactNode }) => <section>{children}</section>,
}));
beforeEach(() => {
  vi.mocked(newLessonLevelLogoPath).mockClear();
  vi.mocked(uploadLessonLevelLogo).mockClear();
  URL.createObjectURL = vi.fn(() => 'blob:preview');
  URL.revokeObjectURL = vi.fn();
  useLessonLevelsStore.setState({
    levels: DEFAULT_LESSON_LEVELS,
    revision: 0,
    loaded: true,
    error: false,
  });
  vi.mocked(saveLessonLevels)
    .mockReset()
    .mockImplementation(async (levels) => {
      useLessonLevelsStore.setState({
        levels: levels as typeof DEFAULT_LESSON_LEVELS,
        revision: useLessonLevelsStore.getState().revision + 1,
      });
    });
});
afterEach(cleanup);
describe('lesson levels admin', () => {
  it('adds a level with a generated immutable ID and edits names without changing ID', async () => {
    render(<AdminLessonLevelsSettings />);
    fireEvent.click(screen.getByRole('button', { name: '+ Добавить уровень' }));
    fireEvent.change(screen.getByLabelText('Название RU'), { target: { value: 'Гонки' } });
    fireEvent.change(screen.getByLabelText('Название EN'), { target: { value: 'Race' } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Сохранить' })));
    const added = useLessonLevelsStore.getState().levels.at(-1)!;
    expect(added.id).toMatch(/^level_[a-f0-9]{32}$/);
    const row = screen.getByText('Гонки / Race').closest('li')!;
    fireEvent.click(within(row).getByRole('button', { name: 'Редактировать' }));
    fireEvent.change(screen.getByLabelText('Название RU'), { target: { value: 'Скорость' } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Сохранить' })));
    expect(useLessonLevelsStore.getState().levels.at(-1)).toMatchObject({
      id: added.id,
      nameRu: 'Скорость',
    });
  });
  it('persists admin order and safely archives and restores', async () => {
    render(<AdminLessonLevelsSettings />);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Выше: Advanced' })));
    expect(useLessonLevelsStore.getState().levels[1].id).toBe('advanced');
    const row = screen.getByText('Продвинутый / Advanced').closest('li')!;
    await act(async () =>
      fireEvent.click(within(row).getByRole('button', { name: 'Архивировать' }))
    );
    expect(
      useLessonLevelsStore.getState().levels.find((level) => level.id === 'advanced')?.isActive
    ).toBe(false);
    await act(async () =>
      fireEvent.click(within(row).getByRole('button', { name: 'Восстановить' }))
    );
    expect(
      useLessonLevelsStore.getState().levels.find((level) => level.id === 'advanced')?.isActive
    ).toBe(true);
  });
  it('protects the last active level and rejects invalid names and marker', async () => {
    useLessonLevelsStore.setState({
      levels: DEFAULT_LESSON_LEVELS.map((level) => ({
        ...level,
        isActive: level.id === 'advanced',
      })),
    });
    render(<AdminLessonLevelsSettings />);
    const row = screen.getByText('Продвинутый / Advanced').closest('li')!;
    expect(within(row).getByRole('button', { name: 'Архивировать' })).toBeDisabled();
    fireEvent.click(within(row).getByRole('button', { name: 'Редактировать' }));
    fireEvent.change(screen.getByLabelText('Маркер / emoji'), { target: { value: 'bad' } });
    await act(async () =>
      fireEvent.submit(screen.getByRole('button', { name: 'Сохранить' }).closest('form')!)
    );
    expect(saveLessonLevels).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
  it('preserves the same idempotency key for a failed transport retry', async () => {
    vi.mocked(saveLessonLevels).mockRejectedValue(new Error('network'));
    render(<AdminLessonLevelsSettings />);
    const move = screen.getByRole('button', { name: 'Выше: Advanced' });
    await act(async () => fireEvent.click(move));
    await act(async () => fireEvent.click(move));
    expect(vi.mocked(saveLessonLevels).mock.calls[0][2]).toBe(
      vi.mocked(saveLessonLevels).mock.calls[1][2]
    );
  });
});

function editBeginner() {
  fireEvent.click(
    within(screen.getByText('Начинающий / Beginner').closest('li')!).getByRole('button', {
      name: 'Редактировать',
    })
  );
}
const saveDraft = () =>
  act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
  });
it('previews, uploads once across retries, replaces and removes a logo independently of color', async () => {
  render(<AdminLessonLevelsSettings />);
  editBeginner();
  fireEvent.change(screen.getByLabelText('Цвет маркера'), { target: { value: '#123abc' } });
  const file = new File(['image'], 'level.png', { type: 'image/png' });
  fireEvent.change(screen.getByLabelText('Логотип уровня'), { target: { files: [file] } });
  expect(document.querySelector('img[src="blob:preview"]')).toBeTruthy();
  expect(uploadLessonLevelLogo).not.toHaveBeenCalled();
  vi.mocked(saveLessonLevels).mockRejectedValueOnce(new Error('network'));
  await saveDraft();
  const key = vi.mocked(saveLessonLevels).mock.calls[0][2];
  await saveDraft();
  expect(uploadLessonLevelLogo).toHaveBeenCalledTimes(1);
  expect(vi.mocked(saveLessonLevels).mock.calls[1][2]).toBe(key);
  expect(useLessonLevelsStore.getState().levels[0]).toMatchObject({
    markerColor: '#123abc',
    logoStoragePath: expect.stringContaining('lesson-levels/beginner/'),
  });
  editBeginner();
  vi.mocked(newLessonLevelLogoPath).mockReturnValueOnce(
    'lesson-levels/beginner/admin/22345678-1234-4123-8123-123456789abc'
  );
  fireEvent.change(screen.getByLabelText('Логотип уровня'), {
    target: { files: [new File(['new'], 'new.webp', { type: 'image/webp' })] },
  });
  await saveDraft();
  expect(useLessonLevelsStore.getState().levels[0].logoStoragePath).toContain('/22345678-');
  editBeginner();
  fireEvent.click(screen.getByRole('button', { name: 'Удалить логотип' }));
  await saveDraft();
  expect(useLessonLevelsStore.getState().levels[0].logoStoragePath).toBeUndefined();
  expect(useLessonLevelsStore.getState().levels[0].markerColor).toBe('#123abc');
  expect(URL.revokeObjectURL).toHaveBeenCalled();
});
it('rejects invalid files and cancels a preview without uploading', async () => {
  render(<AdminLessonLevelsSettings />);
  editBeginner();
  for (const file of [
    new File(['svg'], 'bad.svg', { type: 'image/svg+xml' }),
    new File([new Uint8Array(2097153)], 'big.png', { type: 'image/png' }),
  ]) {
    fireEvent.change(screen.getByLabelText('Логотип уровня'), { target: { files: [file] } });
    expect(screen.getByRole('alert')).toHaveTextContent('до 2 МБ');
  }
  fireEvent.change(screen.getByLabelText('Логотип уровня'), {
    target: { files: [new File(['ok'], 'ok.png', { type: 'image/png' })] },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Отмена' }));
  expect(uploadLessonLevelLogo).not.toHaveBeenCalled();
});
it('retains a stale draft and explicitly retries against the refreshed catalog without losing other edits', async () => {
  render(<AdminLessonLevelsSettings />);
  editBeginner();
  fireEvent.change(screen.getByLabelText('Название RU'), { target: { value: 'Новичок' } });
  vi.mocked(saveLessonLevels).mockImplementationOnce(async () => {
    useLessonLevelsStore.setState({
      revision: 1,
      levels: DEFAULT_LESSON_LEVELS.map((level) =>
        level.id === 'beginner'
          ? { ...level, nameEn: 'New beginner', markerColor: '#abcdef' }
          : level
      ),
    });
    throw new Error('stale_version');
  });
  await saveDraft();
  expect(screen.getByLabelText('Название RU')).toHaveValue('Новичок');
  expect(screen.getByRole('alert')).toHaveTextContent('Каталог изменился');
  await saveDraft();
  expect(useLessonLevelsStore.getState().levels[0]).toMatchObject({
    nameRu: 'Новичок',
    nameEn: 'New beginner',
    markerColor: '#abcdef',
  });
  expect(vi.mocked(saveLessonLevels).mock.calls[1][1]).toBe(1);
  expect(vi.mocked(saveLessonLevels).mock.calls[0][2]).not.toBe(
    vi.mocked(saveLessonLevels).mock.calls[1][2]
  );
});

it('recalculates a new level order after a concurrent administrator addition', async () => {
  render(<AdminLessonLevelsSettings />);
  fireEvent.click(screen.getByRole('button', { name: '+ Добавить уровень' }));
  fireEvent.change(screen.getByLabelText('Название RU'), { target: { value: 'Гонки' } });
  fireEvent.change(screen.getByLabelText('Название EN'), { target: { value: 'Race' } });
  act(() =>
    useLessonLevelsStore.setState({
      revision: 1,
      levels: [
        ...DEFAULT_LESSON_LEVELS,
        { ...DEFAULT_LESSON_LEVELS[0], id: 'concurrent', order: 5 },
      ],
    })
  );
  vi.mocked(saveLessonLevels).mockRejectedValueOnce(new Error('stale_version'));
  await saveDraft();
  await saveDraft();
  expect(useLessonLevelsStore.getState().levels.at(-1)).toMatchObject({ nameEn: 'Race', order: 6 });
});
