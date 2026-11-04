import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SKILL_CONFIG } from '../../src/domain/achievements';
import { formatSkillScore } from '../../src/lib/i18n/skillScore';
import type { Language } from '../../src/lib/i18n/translations';
import type { ActivityLog, Booking, Instructor, UserProfile } from '../../src/types';
import { ClientSkillProgressView } from '../../src/features/profile/components/ClientSkillProgressView';
import { StudentSkillEvaluationModal } from '../../src/features/profile/components/StudentSkillEvaluationModal';
import { StudentDevelopmentPanel } from '../../src/features/student-cabinet/components/student/StudentDevelopmentPanel';
import { SkillRadarChart } from '../../src/features/student-cabinet/components/student/SkillRadarChart';
import { StudentCoachPanel } from '../../src/features/student-cabinet/components/student/StudentCoachPanel';

const locale = vi.hoisted(() => ({ language: 'en' as Language }));
vi.mock('../../src/app/providers/LanguageContext', () => ({
  useLanguage: () => ({ language: locale.language, t: (key: string) => key }),
  translateInstructor: (instructor: Instructor) => instructor,
}));
vi.mock('../../src/features/student-cabinet/components/student/LazySkillRadarChart', () => ({
  LazySkillRadarChart: () => null,
}));
vi.mock('../../src/features/student-cabinet/useSelectedParticipantLessonStats', () => ({
  useSelectedParticipantLessonStats: () => ({ evidence: [] }),
  instructorLessonCountFromEvidence: () => 0,
  latestAttendedLessonForInstructor: () => null,
}));
vi.mock('../../src/features/student-cabinet/usePresentedParticipantLessonFeedback', () => ({
  usePresentedParticipantLessonFeedback: () => ({ instructorFeedback: () => [] }),
}));
vi.mock(
  '../../src/features/student-cabinet/components/student/useInstructorBookingMessages',
  () => ({
    useInstructorBookingMessages: () => ({ messages: [], loading: false }),
  })
);
vi.mock('../../src/features/profile', () => ({ InstructorCard: () => null }));
vi.mock('../../src/features/booking-collaboration', () => ({
  CoachParticipantAccessPanel: () => null,
}));

beforeEach(() => vi.stubGlobal('matchMedia', () => ({ matches: true })));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const cases = [
  { score: undefined, maxPoints: 3, rated: '' },
  { score: 0, maxPoints: 3, rated: '0 / 3 · 0%' },
  { score: 1, maxPoints: 3, rated: '1 / 3 · 33%' },
  { score: 2, maxPoints: 3, rated: '2 / 3 · 67%' },
  { score: 3, maxPoints: 3, rated: '3 / 3 · 100%' },
  { score: undefined, maxPoints: 6, rated: '' },
  { score: 2, maxPoints: 6, rated: '2 / 6 · 33%' },
];
const surfaces = ['list', 'radar', 'priority', 'assessment', 'comments'] as const;

describe.each<Language>(['ru', 'en'])('individual skill display (%s)', (language) => {
  it.each(cases)('formats $score / $maxPoints', ({ score, maxPoints, rated }) => {
    const expected =
      score === undefined
        ? `${language === 'ru' ? 'Нет оценки' : 'Not evaluated'} / ${maxPoints}`
        : rated;
    expect(
      formatSkillScore({ hasScore: score !== undefined, earned: score ?? 0, maxPoints }, language)
    ).toBe(expected);
  });

  describe.each(surfaces)('%s', (surface) => {
    it.each(cases.filter(({ score, maxPoints }) => surface !== 'priority' || score !== maxPoints))(
      'renders $score / $maxPoints without inventing an assessment',
      ({ score, maxPoints, rated }) => {
        // Completed skills are intentionally excluded from priority recommendations.
        locale.language = language;
        const config = {
          ...DEFAULT_SKILL_CONFIG,
          items: [
            {
              ...DEFAULT_SKILL_CONFIG.items[0],
              id: 'skill',
              title: 'Exercise',
              maxPoints,
              levelTarget: 1,
            },
          ],
        };
        const profile = {
          uid: 'student',
          level: 1,
          skillScores: score === undefined ? {} : { skill: score },
          skillComments: { skill: 'Coach comment without a required score' },
        } as UserProfile;
        const original = structuredClone(profile);
        const expected =
          score === undefined
            ? `${language === 'ru' ? 'Нет оценки' : 'Not evaluated'} / ${maxPoints}`
            : rated;
        if (surface === 'list')
          render(<ClientSkillProgressView userProfile={profile} skillConfig={config} />);
        if (surface === 'radar')
          render(<SkillRadarChart userProfile={profile} skillConfig={config} />);
        if (surface === 'priority')
          render(
            <StudentDevelopmentPanel
              userProfile={profile}
              skillConfig={config}
              onGoToTab={vi.fn()}
            />
          );
        if (surface === 'assessment')
          render(
            <StudentSkillEvaluationModal
              isOpen
              onClose={vi.fn()}
              participantId="participant"
              studentName="Student"
              studentLevel={1}
              existingScores={profile.skillScores}
              existingComments={profile.skillComments}
              skillConfig={config}
              onSaveScores={vi.fn()}
            />
          );
        if (surface === 'comments') {
          render(
            <StudentCoachPanel
              bookings={[
                {
                  id: 'lesson',
                  userId: 'student',
                  instructorId: 'coach',
                  date: '2026-10-01',
                  status: 'completed',
                } as Booking,
              ]}
              courses={[]}
              instructors={[{ id: 'coach', name: 'Coach', isAvailable: true } as Instructor]}
              userProfile={profile}
              skillConfig={config}
              activityLogs={[
                {
                  id: 'log',
                  type: 'skill_scores_updated',
                  metadata: { instructorId: 'coach', commentedSkillIds: ['skill'] },
                } as ActivityLog,
              ]}
              onGoToTab={vi.fn()}
              onChat={vi.fn()}
              onOpenLesson={vi.fn()}
              onBookInstructor={vi.fn()}
            />
          );
          fireEvent.click(screen.getByRole('button', { name: /scCoachComments/ }));
        }
        expect(screen.getAllByText(expected).length).toBeGreaterThan(0);
        if (score === undefined) {
          expect(screen.queryByText(`0 / ${maxPoints} · 0%`)).toBeNull();
          if (surface === 'assessment') {
            expect(screen.queryAllByRole('button', { pressed: true })).toHaveLength(0);
          }
        }
        expect(profile).toEqual(original);
      }
    );
  });
});

it('saves an explicitly chosen zero while leaving other missing skills absent', async () => {
  locale.language = 'en';
  const save = vi.fn().mockResolvedValue(undefined);
  const emptyScores = {};
  const emptyComments = {};
  const config = {
    ...DEFAULT_SKILL_CONFIG,
    items: ['skill', 'unrated'].map((id) => ({
      ...DEFAULT_SKILL_CONFIG.items[0],
      id,
      title: id,
      titleEn: id,
      maxPoints: 3,
      levelTarget: 1,
    })),
  };
  render(
    <StudentSkillEvaluationModal
      isOpen
      onClose={vi.fn()}
      participantId="participant"
      studentName="Student"
      studentLevel={1}
      existingScores={emptyScores}
      existingComments={emptyComments}
      skillConfig={config}
      onSaveScores={save}
    />
  );
  fireEvent.click(screen.getByRole('button', { name: 'skill: 0 / 3' }));
  expect(screen.getByRole('button', { name: 'skill: 0 / 3' })).toHaveAttribute(
    'aria-pressed',
    'true'
  );
  expect(screen.getAllByText('Not evaluated / 3').length).toBeGreaterThan(0);
  fireEvent.click(screen.getByRole('button', { name: 'saveRatings' }));
  await waitFor(() =>
    expect(save).toHaveBeenCalledWith('participant', { skill: 0 }, 1, {}, undefined)
  );
});
