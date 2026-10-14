import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ParticipantLevelPanel } from '../../src/features/participant-progress/ParticipantLevelPanel';
import { DEFAULT_SKILL_CONFIG } from '../../src/domain/achievements';
import {
  getJourneyPathProgress,
  resolveCompactJourneyActiveLevel,
} from '../../src/features/journey/components/journeyUtils';
import type { UserProfile } from '../../src/types';

const state = vi.hoisted(() => ({ language: 'en' }));
vi.mock('../../src/app/providers/LanguageContext', () => ({
  useLanguage: () => ({ language: state.language }),
}));
afterEach(cleanup);
const config = {
  ...DEFAULT_SKILL_CONFIG,
  items: [1, 2, 3].map((stage) => ({
    ...DEFAULT_SKILL_CONFIG.items[0],
    id: `s${stage}`,
    levelTarget: stage,
    maxPoints: 100,
  })),
};
describe('mastery level panel and map', () => {
  it('shows official Performance at zero stage XP and a qualification explanation', () => {
    render(
      <ParticipantLevelPanel
        progress={{
          level: 3,
          skillScores: {},
          levelState: { levelRevision: 1 as never, method: 'admin_assignment', qualifications: [] },
        }}
        config={config}
      />
    );
    expect(screen.getByRole('heading').textContent).toContain('Performance');
    expect(screen.getByText(/Current stage XP: 0 \/ 100/)).toBeTruthy();
    expect(screen.getByText(/Earlier stages passed/).textContent).toContain('Beginner, Carve');
    expect(
      getJourneyPathProgress({ level: 3, skillScores: {} } as UserProfile, config)
    ).toBeCloseTo(2 / 3);
    expect(resolveCompactJourneyActiveLevel(null, null, 3, {})).toBe(3);
  });
  it('waits for confirmation at threshold and displays current rather than total XP', async () => {
    const onOperation = vi.fn();
    render(
      <ParticipantLevelPanel
        progress={{ level: 2, skillScores: { s1: 100, s2: 80 } }}
        config={config}
        role="instructor"
        onOperation={onOperation}
      />
    );
    expect(screen.getByText(/Current stage XP: 80 \/ 100/)).toBeTruthy();
    expect(screen.getByRole('heading').textContent).toContain('Carve');
    await userEvent.click(screen.getByRole('button', { name: 'Confirm promotion' }));
    expect(onOperation).toHaveBeenCalledWith({ action: 'confirm' });
  });
  it('requires a reason for manual assignment and preserves scores in operation payload', async () => {
    const onOperation = vi.fn();
    render(
      <ParticipantLevelPanel
        progress={{ level: 1, skillScores: { s1: 20 } }}
        config={config}
        role="admin"
        onOperation={onOperation}
      />
    );
    const button = screen.getByRole('button', { name: 'Assign level' });
    expect(button).toBeDisabled();
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Required reason' }),
      'Qualification observed'
    );
    await userEvent.click(button);
    expect(onOperation).toHaveBeenCalledWith({
      action: 'assign',
      level: 2,
      reason: { category: 'expert_assessment', text: 'Qualification observed' },
    });
  });
  it('renders max level without promotion controls and localizes Russian text', () => {
    state.language = 'ru';
    render(
      <ParticipantLevelPanel
        progress={{ level: 4, skillScores: {} }}
        config={config}
        role="instructor"
        onOperation={vi.fn()}
      />
    );
    expect(screen.getByText('Достигнут максимальный уровень')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Подтвердить повышение' })).toBeNull();
    state.language = 'en';
  });
});
