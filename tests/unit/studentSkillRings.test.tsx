import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SkillRadarChart } from '../../src/features/student-cabinet/components/student/SkillRadarChart';
import {
  buildRadarDimensions,
  getChartDimensions,
} from '../../src/features/student-cabinet/components/student/studentSkillRadarData';
import { DEFAULT_SKILL_CONFIG, type RadarDimensionKey } from '../../src/domain/achievements';
import type { UserProfile } from '../../src/types';

vi.mock('../../src/app/providers/LanguageContext', () => ({
  useLanguage: () => ({ language: 'en', t: (key: string) => key }),
}));
const keys: RadarDimensionKey[] = [
  'technique',
  'control',
  'speed',
  'balance',
  'coordination',
  'terrain',
];
const colors = ['#FA114F', '#A8E10C', '#00D4FF', '#BF5AF2', '#5E5CE6', '#FF9F0A'];
const items = keys.map((key, index) => ({
  ...DEFAULT_SKILL_CONFIG.items[0],
  id: key,
  radarDimension: key,
  title: `Exercise ${key}`,
  titleEn: `Exercise ${key}`,
  maxPoints: 100,
  levelTarget: index === 5 ? 2 : 1,
}));
const config = { ...DEFAULT_SKILL_CONFIG, items };
const values = [0, 1, 50, 99, 100, 25];
const profile = {
  uid: 'participant-a',
  level: 2,
  skillScores: Object.fromEntries(keys.map((key, index) => [key, values[index]])),
  skillComments: { technique: 'Keep your shoulders quiet' },
  todaySkillItemIds: ['control'],
} as UserProfile;
beforeEach(() => vi.stubGlobal('matchMedia', () => ({ matches: true })));
afterEach(() => vi.unstubAllGlobals());

function renderCompact(p = profile, skillConfig = config) {
  return render(<SkillRadarChart userProfile={p} skillConfig={skillConfig} compact embed />);
}

describe('Dashboard skill rings integrity', () => {
  it('renders six real percentages, points, exact colors and proportional arcs, including zero', () => {
    const { container } = renderCompact();
    const dimensions = getChartDimensions(
      buildRadarDimensions({
        items,
        scores: profile.skillScores!,
        targetStage: 2,
        pinnedIds: new Set(),
      })
    );
    expect(dimensions.map((d) => [d.key, d.color, d.percent])).toEqual(
      keys.map((key, i) => [key, colors[i], values[i]])
    );
    keys.forEach((key, i) => {
      const ring = container.querySelector(`[data-radar-dimension="${key}"]`)!;
      const arc = ring.querySelectorAll('circle')[1];
      expect(arc).toHaveAttribute('stroke', colors[i]);
      const circumference = 2 * Math.PI * Number(arc.getAttribute('r'));
      expect(Number(arc.getAttribute('stroke-dasharray')!.split(' ')[0])).toBeCloseTo(
        (circumference * values[i]) / 100
      );
      expect(arc.getAttribute('visibility')).toBe(i === 0 ? 'hidden' : null);
      const legend = container.querySelectorAll('.student-radar-skill')[i];
      expect(legend).toHaveTextContent(`${values[i]}%`);
      expect(legend).toHaveTextContent(`${values[i]}/100`);
    });
  });

  it.each([1, 2, 3, 4, 5, 6])('fits %i available rings inside the unchanged viewBox', (count) => {
    const { container } = renderCompact(profile, { ...config, items: items.slice(0, count) });
    expect(container.querySelectorAll('[data-radar-dimension]')).toHaveLength(count);
    expect(container.querySelector('svg[role="img"]')).toHaveAttribute('viewBox', '0 0 230 230');
    for (const arc of container.querySelectorAll('[data-radar-dimension] circle:nth-child(2)')) {
      const r = Number(arc.getAttribute('r'));
      const halfStroke = Number(arc.getAttribute('stroke-width')) / 2;
      expect(r - halfStroke).toBeGreaterThan(0);
      expect(r + halfStroke).toBeLessThan(115);
    }
  });

  it('does not turn absent exercises or missing optional scores into populated categories', () => {
    const { container } = renderCompact(
      { ...profile, skillScores: undefined },
      { ...config, items: [] }
    );
    expect(container.querySelectorAll('[data-radar-dimension]')).toHaveLength(0);
    expect(screen.getByText('scRadarNoExercises')).toBeInTheDocument();
  });

  it('keeps ring, keyboard legend selection, dimming and background reset consistent without writes', async () => {
    const user = userEvent.setup();
    const { container } = renderCompact();
    const buttons = [...container.querySelectorAll('.student-radar-skill')] as HTMLButtonElement[];
    buttons[0].focus();
    await user.keyboard('{Enter}');
    expect(buttons[0]).toHaveAttribute('aria-pressed', 'true');
    expect(container.querySelector('[data-radar-dimension="control"]')).toHaveAttribute(
      'opacity',
      '0.28'
    );
    fireEvent.click(container.querySelector('[data-radar-dimension="balance"] circle')!);
    expect(buttons[3]).toHaveAttribute('aria-pressed', 'true');
    expect(buttons[0]).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(screen.getByRole('img'));
    expect(buttons.every((b) => b.getAttribute('aria-pressed') === 'false')).toBe(true);
    expect(profile.skillScores).toEqual(Object.fromEntries(keys.map((key, i) => [key, values[i]])));
  });

  it('restores A → B → A real scores and clears selection through the existing participant key', () => {
    const { container, rerender } = render(
      <SkillRadarChart key="a" userProfile={profile} skillConfig={config} compact embed />
    );
    fireEvent.click(container.querySelector('.student-radar-skill')!);
    const b = { ...profile, uid: 'participant-b', skillScores: { technique: 77 } };
    rerender(<SkillRadarChart key="b" userProfile={b} skillConfig={config} compact embed />);
    expect(container.querySelector('.student-radar-skill')).toHaveTextContent('77%');
    expect(container.querySelector('.student-radar-skill')).toHaveAttribute(
      'aria-pressed',
      'false'
    );
    rerender(<SkillRadarChart key="a" userProfile={profile} skillConfig={config} compact embed />);
    expect(container.querySelector('.student-radar-skill')).toHaveTextContent('0%');
  });
});

describe('shared full Development regression', () => {
  it('preserves comments, level collapse, pin/unpin, completed exercises and isolated simulation', async () => {
    const user = userEvent.setup();
    const toggle = vi.fn();
    const pin = vi.fn();
    const original = structuredClone(profile);
    const { container } = render(
      <SkillRadarChart
        userProfile={profile}
        skillConfig={config}
        onToggleSkillToday={toggle}
        onPinSkillsToday={pin}
      />
    );
    expect(container.querySelector('.student-skill-rings')).toBeNull();
    expect(screen.getByText(/Keep your shoulders quiet/)).toBeInTheDocument();
    await user.click(screen.getAllByTitle('scAddToToday')[0]);
    expect(toggle).toHaveBeenCalledWith('technique', true);
    await user.click(screen.getByTitle('scRemoveFromToday'));
    expect(toggle).toHaveBeenCalledWith('control', false);
    expect(screen.getAllByTitle('scAddToToday')).toHaveLength(4);
    const collapse = screen.getAllByRole('button', { expanded: true })[0];
    await user.click(collapse);
    expect(screen.queryByText(/Keep your shoulders quiet/)).toBeNull();
    await user.click(collapse);
    expect(screen.getByText(/Keep your shoulders quiet/)).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'scRadarViewSimulator' }));
    const sliders = screen.getAllByRole('slider');
    fireEvent.change(sliders[0], { target: { value: '80' } });
    expect(profile).toEqual(original);
    expect(pin).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'scRadarApplyGoalTasks' }));
    expect(pin).toHaveBeenCalledWith(['technique']);
    await user.click(screen.getByRole('button', { name: 'scRadarResetSimulation' }));
    expect(sliders[0]).toHaveValue('0');
    expect(profile).toEqual(original);
    await user.click(screen.getByRole('tab', { name: 'scRadarViewRadar' }));
    expect(screen.getByText(/Keep your shoulders quiet/)).toBeInTheDocument();
  });

  it('disables pin controls without callbacks', () => {
    render(<SkillRadarChart userProfile={profile} skillConfig={config} />);
    for (const button of screen.getAllByTitle('scAddToToday')) expect(button).toBeDisabled();
    expect(within(screen.getByRole('tablist')).getAllByRole('tab')).toHaveLength(2);
  });
});
