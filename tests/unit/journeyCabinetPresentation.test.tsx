import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { YourJourneySection } from '../../src/features/journey';
import {
  DEFAULT_SKILL_CONFIG,
  calculateStudentLevel,
  getJourneyLevelXpThresholds,
} from '../../src/domain/achievements';
import { getJourneyPathProgress } from '../../src/features/journey/components/journeyUtils';
import type { UserProfile } from '../../src/types';

vi.mock('../../src/app/providers/LanguageContext', () => ({
  useLanguage: () => ({ language: 'en', t: (key: string) => key }),
}));
vi.mock('../../src/hooks/useTheme', () => ({ useTheme: () => ({ theme: 'light' }) }));

// Custom configuration deliberately differs from the Stitch demonstration and default data.
const config = {
  ...DEFAULT_SKILL_CONFIG,
  items: [1, 2, 3].map((stage) => ({
    ...DEFAULT_SKILL_CONFIG.items[0],
    id: `stage_${stage}`,
    levelTarget: stage as 1 | 2 | 3,
    maxPoints: 100,
  })),
};
const profile = (scores: Record<string, number>) =>
  ({
    uid: 'journey_account',
    displayName: 'Journey Student',
    skillScores: scores,
    level: calculateStudentLevel(scores, config.items, config.passPercentage),
  }) as UserProfile;

beforeEach(() => {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1440 });
  Object.defineProperty(SVGElement.prototype, 'getTotalLength', {
    configurable: true,
    // jsdom lacks SVG geometry; cabinet paths are straight horizontal segments.
    value: function (this: SVGElement) {
      const coordinates = this.getAttribute('d')!
        .match(/-?\d+(?:\.\d+)?/g)!
        .map(Number);
      return coordinates[coordinates.length - 2] - coordinates[0];
    },
  });
  Object.defineProperty(SVGElement.prototype, 'getPointAtLength', {
    configurable: true,
    value: function (this: SVGElement, length: number) {
      const startX = Number(this.getAttribute('d')!.match(/-?\d+(?:\.\d+)?/g)![0]);
      return { x: startX + length, y: 50 };
    },
  });
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    }
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function journey(
  userProfile: UserProfile,
  appearance: 'default' | 'cabinet' = 'cabinet',
  onOpenDevelopment = vi.fn()
) {
  return (
    <MemoryRouter>
      <YourJourneySection
        appearance={appearance}
        userProfile={userProfile}
        skillConfig={config}
        animateSequence={false}
        markerParticipant={{ displayName: 'Journey Student' }}
        onOpenDevelopment={onOpenDevelopment}
      />
    </MemoryRouter>
  );
}

describe('Cabinet Journey retains configured progress', () => {
  it.each([
    [{}, 0, 0, 1],
    [{ stage_1: 25 }, 25, 1 / 12, 1],
    [{ stage_1: 100, stage_2: 50 }, 150, 0.5, 2],
    [{ stage_1: 95, stage_2: 95, stage_3: 95 }, 285, 0.95, 4],
  ] as const)(
    'renders actual scores %j without replacing XP thresholds',
    (scores, xp, progress, level) => {
      const userProfile = profile(scores);
      const { container } = render(journey(userProfile));
      expect(getJourneyLevelXpThresholds(config.items)).toEqual([0, 100, 200, 300]);
      expect(getJourneyPathProgress(userProfile, config)).toBeCloseTo(progress);
      expect(calculateStudentLevel(scores, config.items, config.passPercentage)).toBe(level);
      const section = container.querySelector('#your-journey')!;
      expect(
        within(section.querySelector('header')!).getByText(`${xp} journeyXp`)
      ).toBeInTheDocument();
      const marker = screen.getByRole('img', { name: 'Journey Student' }).parentElement!;
      expect(parseFloat(marker.style.left)).toBeCloseTo((50 + 300 * progress) / 4);
      expect(marker.style.top).toBe('50%');
      expect(within(marker).getByText(String(xp))).toBeInTheDocument();
      expect(section.querySelector('[aria-current="step"]')).toHaveAttribute(
        'aria-label',
        [
          'journeyLevelBeginner',
          'journeyLevelCarve',
          'journeyLevelPerformance',
          'journeyLevelExpert',
        ][level - 1]
      );
      for (const threshold of [0, 100, 200, 300]) {
        expect(
          within(section.querySelector('.journey-stage-labels')!).getByText(
            `${threshold} journeyXp`
          )
        ).toBeInTheDocument();
      }
    }
  );

  it('keeps hidden tracking private and the shared Journey appearance opt-in', () => {
    const view = render(journey({ ...profile({ stage_1: 25 }), hideProgressTracking: true }));
    expect(screen.queryByRole('img', { name: 'Journey Student' })).toBeNull();
    expect(view.container.querySelector('.journey-summary')).toBeNull();
    expect(screen.getByText('journeyDesc1')).toBeInTheDocument();
    view.rerender(journey(profile({ stage_1: 25 }), 'default'));
    expect(view.container.querySelector('#your-journey')).not.toHaveClass('sc-journey');
  });

  it('retains stage keyboard selection and development navigation', async () => {
    const onOpenDevelopment = vi.fn();
    render(journey(profile({ stage_1: 100, stage_2: 50 }), 'cabinet', onOpenDevelopment));
    const node = screen.getByRole('button', { name: 'journeyLevelPerformance' });
    node.focus();
    await userEvent.keyboard('{Enter}');
    expect(node).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(screen.getAllByRole('button', { name: /scMoreDetails/ })[0]);
    expect(onOpenDevelopment).toHaveBeenCalledTimes(1);
  });
});
