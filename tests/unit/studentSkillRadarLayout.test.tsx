import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SkillRadarChart } from '../../src/features/student-cabinet/components/student/SkillRadarChart';
import { DEFAULT_SKILL_CONFIG } from '../../src/domain/achievements';
import type { UserProfile } from '../../src/types';

vi.mock('../../src/app/providers/LanguageContext', () => ({
  useLanguage: () => ({ language: 'en', t: (key: string) => key }),
}));

const profile = { uid: 'radar_participant', level: 1, skillScores: {} } as UserProfile;

beforeEach(() => {
  vi.stubGlobal('matchMedia', () => ({ matches: true }));
});
afterEach(() => vi.unstubAllGlobals());

describe('embedded radar companion data', () => {
  it('keeps one DOM list in dimension order with percentages and earned/max values', () => {
    const { container } = render(
      <SkillRadarChart userProfile={profile} skillConfig={DEFAULT_SKILL_CONFIG} compact embed />
    );
    const list = container.querySelector('.student-radar-legend')!;
    const labels = [...list.querySelectorAll('li button p:first-child')].map(
      (label) => label.textContent
    );
    expect(labels).toEqual([
      'scRadarAxisTechnique',
      'scRadarAxisControl',
      'scRadarAxisSpeed',
      'scRadarAxisBalance',
      'scRadarAxisCoordination',
    ]);
    expect(container.querySelectorAll('.student-radar-legend')).toHaveLength(1);
    for (const button of within(list as HTMLElement).getAllByRole('button')) {
      expect(button).toHaveTextContent('0%');
      expect(button.textContent).toMatch(/0\/\d+/);
    }
  });

  it('groups percentages and earned/max points into a single non-wrapping value line', () => {
    const { container } = render(
      <SkillRadarChart userProfile={profile} skillConfig={DEFAULT_SKILL_CONFIG} compact embed />
    );
    for (const value of container.querySelectorAll('.student-radar-values')) {
      expect(value).toHaveTextContent(/0%.*· 0\/\d+/);
      expect(value.querySelector('span')).not.toHaveClass('block');
    }
    expect(container.querySelectorAll('.student-radar-values')).toHaveLength(5);
  });
  it('preserves dimension selection and resetting from the chart', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <SkillRadarChart userProfile={profile} skillConfig={DEFAULT_SKILL_CONFIG} compact embed />
    );
    const list = container.querySelector('.student-radar-legend') as HTMLElement;
    const buttons = within(list).getAllByRole('button');
    await user.click(buttons[1]);
    expect(buttons[0]).toHaveClass('opacity-45');
    expect(buttons[1]).toHaveClass('opacity-100');
    await user.click(screen.getByRole('img', { name: 'scRadarTitle' }));
    expect(buttons[0]).toHaveClass('opacity-100');
    expect(buttons[1]).toHaveClass('opacity-100');
  });

  it('limits the container-based layout to the embedded radar', () => {
    const { container } = render(
      <SkillRadarChart userProfile={profile} skillConfig={DEFAULT_SKILL_CONFIG} compact />
    );
    expect(container.querySelector('.student-radar-data')).toBeNull();
    expect(container.querySelector('.student-radar-legend')).toBeNull();
    expect(screen.getByRole('img', { name: 'scRadarTitle' })).toBeInTheDocument();
  });
});
