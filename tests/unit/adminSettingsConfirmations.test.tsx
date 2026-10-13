import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AchievementsManager } from '../../src/features/admin/components/settings/AchievementsManager';
import { SkillConfigManager } from '../../src/features/admin/components/settings/SkillConfigManager';
import { DEFAULT_SKILL_CONFIG } from '../../src/domain/achievements';

vi.mock('../../src/app/providers/LanguageContext', () => ({
  useLanguage: () => ({ language: 'en', t: (key: string) => key }),
}));

async function accept() {
  await act(async () =>
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Confirm', exact: true })
    )
  );
}

describe('settings native confirmation replacements', () => {
  it('keeps achievement deletion local and applies it only after acceptance', async () => {
    const save = vi.fn();
    render(
      <AchievementsManager
        onSaveConfig={save}
        config={{
          items: [
            {
              id: 'fixture',
              labelEn: 'Local achievement',
              labelRu: 'Достижение',
              icon: '🏆',
              order: 1,
              rule: { type: 'lessons_completed', count: 1 },
            },
          ],
        }}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'deleteSlide' }));
    await act(async () => fireEvent.keyDown(document, { key: 'Escape' }));
    expect(screen.getByText('Local achievement')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'deleteSlide' }));
    await accept();
    expect(screen.queryByText('Local achievement')).not.toBeInTheDocument();
    expect(save).not.toHaveBeenCalled();
  });

  it('keeps the skill configuration until acceptance and leaves persistence to Save', async () => {
    const save = vi.fn();
    render(
      <SkillConfigManager
        onSaveConfig={save}
        config={{
          passPercentage: 87,
          items: [
            { ...DEFAULT_SKILL_CONFIG.items[0], title: 'Local skill', titleEn: 'Local skill' },
          ],
        }}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'reset', exact: true }));
    await act(async () => fireEvent.keyDown(document, { key: 'Escape' }));
    expect(screen.getByText('Local skill')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'reset', exact: true }));
    await accept();
    expect(screen.queryByText('Local skill')).not.toBeInTheDocument();
    expect(save).not.toHaveBeenCalled();
  });
});
