import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { YourJourneySection } from '../../src/features/journey';
import { DEFAULT_SKILL_CONFIG, getJourneyLevelXpThresholds } from '../../src/domain/achievements';
import { getJourneyPathProgress } from '../../src/features/journey/components/journeyUtils';
import type { UserProfile } from '../../src/types';
import { getCourseLevelCardBadgeClass, userLevelToCourseLevel } from '../../src/domain/course';
import { translations, type TranslationKey } from '../../src/lib/i18n/translations';

const themeState = vi.hoisted(() => ({ theme: 'light' }));
const languageState = vi.hoisted(() => ({ language: 'en' as 'en' | 'ru', localized: false }));

vi.mock('../../src/app/providers/LanguageContext', () => ({
  useLanguage: () => ({
    language: languageState.language,
    t: (key: TranslationKey) =>
      languageState.localized ? translations[languageState.language][key] : key,
  }),
}));
vi.mock('../../src/hooks/useTheme', () => ({ useTheme: () => themeState }));

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
const profile = (scores: Record<string, number>, level = 1) =>
  ({
    uid: 'journey_account',
    displayName: 'Journey Student',
    skillScores: scores,
    level,
  }) as UserProfile;

beforeEach(() => {
  themeState.theme = 'light';
  languageState.language = 'en';
  languageState.localized = false;
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
  userProfile: UserProfile | null,
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
  it.each([320, 390, 768, 1440])(
    'shows an assigned Performance stage at zero XP at %ipx',
    (width) => {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
      const userProfile = {
        ...profile({}, 3),
        levelState: {
          levelRevision: 1 as never,
          method: 'admin_assignment' as const,
          assignedThroughLevel: 2,
          qualifications: [],
        },
      };
      const { container } = render(journey(userProfile));
      expect(container.querySelector('[aria-current="step"]')).toHaveAttribute(
        'aria-label',
        'journeyLevelPerformance'
      );
      expect(container.querySelector('[aria-current="step"]')).not.toHaveAttribute(
        'aria-disabled',
        'true'
      );
      expect(screen.getAllByText('Passed by qualification')).toHaveLength(2);
      expect(container.querySelector('.journey-summary-xp')).toHaveTextContent('0 journeyXp');
      expect(screen.queryByText(/Official mastery level|Current stage XP/)).toBeNull();
      expect(screen.queryByRole('progressbar')).toBeNull();
    }
  );
  it.each([
    [{}, 0, 0, 1],
    [{ stage_1: 25 }, 25, 1 / 12, 1],
    [{ stage_1: 79 }, 79, 79 / 300, 1],
    [{ stage_1: 80 }, 80, 80 / 300, 1],
    [{ stage_1: 100 }, 100, 0.99 / 3, 1],
    [{ stage_1: 100 }, 0, 1 / 3, 2],
    [{ stage_1: 100, stage_2: 1 }, 1, 101 / 300, 2],
    [{ stage_1: 100, stage_2: 50 }, 50, 0.5, 2],
    [{ stage_1: 100, stage_2: 99 }, 0, 2 / 3, 3],
    [{ stage_1: 100, stage_2: 100, stage_3: 1 }, 1, 201 / 300, 3],
    [{ stage_1: 95, stage_2: 95, stage_3: 95 }, 0, 1, 4],
    [{}, 0, 2 / 3, 3],
  ] as const)(
    'renders actual scores %j without replacing XP thresholds',
    (scores, xp, progress, level) => {
      const userProfile = profile(scores, level);
      const { container } = render(journey(userProfile));
      expect(getJourneyLevelXpThresholds(config.items)).toEqual([0, 100, 200, 300]);
      expect(getJourneyPathProgress(userProfile, config)).toBeCloseTo(progress);
      expect(userProfile.level).toBe(level);
      const section = container.querySelector('#your-journey')!;
      expect(
        within(section.querySelector('header')!).getByText(`${xp} journeyXp`)
      ).toBeInTheDocument();
      const marker = screen.getByRole('img', { name: 'Journey Student' }).parentElement!;
      expect(parseFloat(marker.style.left)).toBeCloseTo((50 + 300 * progress) / 4);
      expect(marker.style.top).toBe('50%');
      expect(marker.querySelector('.journey-marker-caption')).toBeNull();
      expect(screen.queryByText('journeyYouAreHere')).toBeNull();
      const badge = section.querySelector('.journey-level-badge')!;
      expect(badge).toHaveTextContent(
        [
          'journeyLevelBeginner',
          'journeyLevelCarve',
          'journeyLevelPerformance',
          'journeyLevelExpert',
        ][level - 1]
      );
      expect(badge.className).toContain(
        getCourseLevelCardBadgeClass(userLevelToCourseLevel(level))
      );
      expect(badge.closest('button, a, [role="button"]')).toBeNull();
      expect(badge).not.toHaveAttribute('tabindex');
      const completed = section.querySelector('.journey-traveled')!;
      expect(Number(completed.getAttribute('stroke-dasharray')!.split(' ')[0])).toBeCloseTo(
        300 * progress
      );
      const gradientId = completed.getAttribute('stroke')!.slice(5, -1);
      const gradient = document.getElementById(gradientId)!;
      expect(gradient).toHaveAttribute('gradientUnits', 'userSpaceOnUse');
      expect(Number(gradient.getAttribute('x2'))).toBeCloseTo(50 + 300 * progress);
      expect(gradient.querySelectorAll('stop')).toHaveLength(3);
      expect(section.querySelector('.journey-criteria h3')).toBeNull();
      expect(section.querySelector('progress')).toBeNull();
      expect(section.querySelectorAll('.journey-stage-lock')).toHaveLength(4 - level);
      expect(section.querySelector('[aria-current="step"] .journey-stage-lock')).toBeNull();
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

  for (const width of [320, 390, 1440]) {
    for (const language of ['ru', 'en'] as const) {
      it.each(['light', 'dark'])(
        `keeps one XP visualization and promotion status at ${width}px in ${language}/%s`,
        (theme) => {
          languageState.language = language;
          languageState.localized = true;
          themeState.theme = theme;
          Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
          const view = render(journey(profile({ stage_1: 27 })));
          const t = translations[language];
          const criteria = () => view.container.querySelector('.journey-criteria')!;
          expect(criteria()).toHaveTextContent(
            language === 'ru' ? 'До следующего уровня осталось 53 XP' : '53 XP to the next level'
          );
          expect(screen.queryByRole('progressbar')).toBeNull();
          expect(
            screen.queryByText(/Официальный уровень мастерства|Official mastery level/)
          ).toBeNull();
          expect(screen.queryByRole('status')).toBeNull();
          expect(
            screen.getAllByRole('link', { name: t.studentDevelopmentLink }).length
          ).toBeGreaterThan(0);

          // Crossing the threshold keeps the official stage until instructor confirmation.
          view.rerender(journey(profile({ stage_1: 80 })));
          expect(within(criteria()).getByRole('status')).toHaveTextContent(
            t.journeyReadyForPromotion
          );
          expect(view.container.querySelector('[aria-current="step"]')).toHaveAttribute(
            'aria-label',
            t.journeyLevelBeginner
          );
          view.rerender(journey(profile({ stage_1: 100 })));
          expect(within(criteria()).getByRole('status')).toHaveTextContent(
            t.journeyReadyForPromotion
          );

          // Switching to another participant must clear the first participant's readiness.
          view.rerender(journey(profile({}, 3)));
          expect(screen.queryByRole('status')).toBeNull();
          expect(view.container.querySelector('.journey-summary-xp')).toHaveTextContent('0 XP');
          expect(view.container.querySelector('[aria-current="step"]')).toHaveAttribute(
            'aria-label',
            t.journeyLevelPerformance
          );
          view.rerender(journey(profile({}, 4)));
          expect(criteria()).toHaveTextContent(t.journeyMaxLevelReached);
          expect(screen.queryByRole('status')).toBeNull();
          expect(screen.queryByRole('progressbar')).toBeNull();
        }
      );
    }
  }

  it('does not report readiness without evaluated exercises or a configured stage', () => {
    render(
      <MemoryRouter>
        <YourJourneySection
          appearance="cabinet"
          userProfile={profile({})}
          skillConfig={{ ...config, items: [] }}
          animateSequence={false}
        />
      </MemoryRouter>
    );
    expect(screen.queryByRole('status')).toBeNull();
  });

  it.each(['light', 'dark'])(
    'retains minimum progress and avatar fallback on mobile in %s',
    (theme) => {
      themeState.theme = theme;
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: 360 });
      const { container } = render(journey(profile({})));
      const avatar = screen.getByRole('img', { name: 'Journey Student' });
      expect(avatar.querySelector('img')).toBeNull();
      expect(avatar).toHaveTextContent('J');
      expect(container.querySelector('.journey-level-badge')).toHaveTextContent(
        'journeyLevelBeginner'
      );
      expect(avatar.parentElement!.style.left).toBe('12.5%');
      expect(avatar.parentElement!.style.top).toBe('50%');
    }
  );

  it('preserves missing-profile information without personal progress', () => {
    const { container } = render(journey(null));
    expect(container.querySelector('.journey-level-badge')).toBeNull();
    expect(container.querySelector('.journey-criteria')).toBeNull();
    expect(container.querySelector('.journey-user-marker')).toBeNull();
    expect(container.querySelector('.journey-stage-lock')).toBeNull();
    expect(screen.getByText('journeyDesc1')).toBeInTheDocument();
  });

  it.each([768, 1440])('does not reserve empty skill-card space at %ipx', (width) => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
    const view = render(journey(profile({})));
    expect(view.container.querySelector('.journey-criteria')).toBeInTheDocument();
    expect(view.container.querySelector('.journey-level-badge')).toBeInTheDocument();
    expect(view.container.querySelector('.journey-skill-card')).toBeNull();
    view.rerender(journey(profile({ stage_1: 25 })));
    expect(view.container.querySelector('.journey-skill-card')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /studentDevelopmentLink/ }).length).toBeGreaterThan(
      0
    );
    view.rerender(journey(profile({})));
    expect(view.container.querySelector('.journey-skill-card')).toBeNull();
  });

  it('updates the level badge and completed gradient when participant progress changes', () => {
    const view = render(journey(profile({ stage_1: 25 })));
    expect(view.container.querySelector('.journey-level-badge')).toHaveTextContent(
      'journeyLevelBeginner'
    );
    view.rerender(journey(profile({ stage_1: 100, stage_2: 100, stage_3: 100 }, 4)));
    expect(view.container.querySelector('.journey-level-badge')).toHaveTextContent(
      'journeyLevelExpert'
    );
    expect(view.container.querySelector('.journey-traveled')).toHaveAttribute(
      'stroke-dasharray',
      '300 0'
    );
    view.rerender(journey(profile({ stage_1: 25 })));
    expect(view.container.querySelector('.journey-level-badge')).toHaveTextContent(
      'journeyLevelBeginner'
    );
    expect(view.container.querySelector('.journey-traveled')).toHaveAttribute(
      'stroke-dasharray',
      '25 275'
    );
  });

  it('keeps hidden tracking private and the shared Journey appearance opt-in', () => {
    const view = render(journey({ ...profile({ stage_1: 25 }), hideProgressTracking: true }));
    expect(screen.queryByRole('img', { name: 'Journey Student' })).toBeNull();
    expect(view.container.querySelector('.journey-summary')).toBeNull();
    expect(view.container.querySelector('.journey-stage-lock')).toBeNull();
    expect(screen.getByText('journeyDesc1')).toBeInTheDocument();
    expect(view.container.querySelector('.journey-skill-card')).toBeInTheDocument();
    view.rerender(journey(profile({ stage_1: 25 }), 'default'));
    expect(view.container.querySelector('#your-journey')).not.toHaveClass('sc-journey');
    expect(view.container.querySelector('.journey-stage-lock')).toBeNull();
    expect(screen.getByText('journeyYouAreHere')).toBeInTheDocument();
    expect(view.container.querySelector('.journey-skill-card')).toBeInTheDocument();
  });

  it('retains stage keyboard selection and development navigation', async () => {
    const onOpenDevelopment = vi.fn();
    render(journey(profile({ stage_1: 100, stage_2: 50 }), 'cabinet', onOpenDevelopment));
    const node = screen.getByRole('button', { name: 'journeyLevelPerformance' });
    node.focus();
    await userEvent.keyboard('{Enter}');
    expect(node).toHaveAttribute('aria-pressed', 'true');
    const developmentLink = screen.getAllByRole('link', { name: /studentDevelopmentLink/ })[0];
    expect(developmentLink).toHaveAttribute('href', '/cabinet/development');
    developmentLink.focus();
    await userEvent.keyboard('{Enter}');
    expect(onOpenDevelopment).toHaveBeenCalledTimes(1);
    expect(node).toHaveAttribute('aria-pressed', 'true');
  });
});
