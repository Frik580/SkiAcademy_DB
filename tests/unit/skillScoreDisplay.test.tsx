import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SKILL_CONFIG } from '../../src/domain/achievements';
import { formatSkillScore } from '../../src/lib/i18n/skillScore';
import type { Language } from '../../src/lib/i18n/translations';
import { translations } from '../../src/lib/i18n/translations';
import type { ActivityLog, Booking, Instructor, UserProfile } from '../../src/types';
import { ClientSkillProgressView } from '../../src/features/profile/components/ClientSkillProgressView';
import { StudentSkillEvaluationModal } from '../../src/features/profile/components/StudentSkillEvaluationModal';
import { StudentDevelopmentPanel } from '../../src/features/student-cabinet/components/student/StudentDevelopmentPanel';
import { SkillRadarChart } from '../../src/features/student-cabinet/components/student/SkillRadarChart';
import { StudentCoachPanel } from '../../src/features/student-cabinet/components/student/StudentCoachPanel';

const locale = vi.hoisted(() => ({ language: 'en' as Language }));
vi.mock('../../src/app/providers/LanguageContext', () => ({
  useLanguage: () => ({
    language: locale.language,
    t: (key: string) =>
      key === 'scCoachCurrentSkillComments'
        ? translations[locale.language][key as keyof typeof translations.en]
        : key,
  }),
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
  { score: 3, maxPoints: 5, rated: '3 / 5 · 60%' },
  { score: 5, maxPoints: 5, rated: '5 / 5 · 100%' },
  { score: 5, maxPoints: 10, rated: '5 / 10 · 50%' },
];
const surfaces = ['list', 'radar', 'priority', 'assessment', 'comments'] as const;

it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY, undefined])(
  'keeps the skill comment unfilled with an unusable maximum (%s)',
  (maxPoints) => {
    render(
      <StudentCoachPanel
        navigation={{ view: 'comments', selectedInstructorId: 'coach' }}
        bookings={[
          {
            id: 'lesson',
            userId: 'student',
            instructorId: 'coach',
            status: 'completed',
          } as Booking,
        ]}
        courses={[]}
        instructors={[{ id: 'coach', name: 'Coach' } as Instructor]}
        userProfile={
          {
            uid: 'student',
            skillScores: { skill: 5 },
            skillComments: { skill: 'Saved note' },
          } as UserProfile
        }
        skillConfig={{
          items: maxPoints === undefined ? [] : [{ id: 'skill', title: 'Skill', maxPoints }],
        }}
        onGoToTab={vi.fn()}
        onChat={vi.fn()}
        onOpenLesson={vi.fn()}
        onBookInstructor={vi.fn()}
      />
    );
    expect(screen.getByTestId('skill-comment-fill')).toHaveStyle({ width: '0%' });
    expect(screen.getByText('“Saved note”')).toBeInTheDocument();
  }
);

it('renders loading and read errors with retry, then only the selected participant comments', () => {
  const retry = vi.fn();
  const props = {
    bookings: [
      { id: 'lesson', userId: 'student', instructorId: 'coach', status: 'completed' } as Booking,
    ],
    courses: [],
    instructors: [{ id: 'coach', name: 'Coach' } as Instructor],
    userProfile: {
      uid: 'student',
      skillComments: { retired: 'Participant A text' },
    } as UserProfile,
    selectedParticipantId: 'a',
    onGoToTab: vi.fn(),
    onChat: vi.fn(),
    onOpenLesson: vi.fn(),
    onBookInstructor: vi.fn(),
    onRetryProgress: retry,
  };
  const { rerender } = render(<StudentCoachPanel {...props} progressLoadState="loading" />);
  fireEvent.click(screen.getByRole('button', { name: /scCoachComments/ }));
  expect(screen.getByRole('status')).toHaveTextContent('loading');
  expect(screen.queryByText('“Participant A text”')).toBeNull();
  expect(screen.queryByText('scCoachNoComments')).toBeNull();
  rerender(<StudentCoachPanel {...props} progressLoadState="error" />);
  expect(screen.getByRole('alert')).toHaveTextContent('requestFailed');
  fireEvent.click(screen.getByRole('button', { name: 'retry' }));
  expect(retry).toHaveBeenCalledTimes(1);
  for (const [id, text] of [
    ['a', 'Participant A text'],
    ['b', 'Participant B text'],
    ['a', 'Participant A text'],
  ]) {
    rerender(
      <StudentCoachPanel
        {...props}
        progressLoadState="loaded"
        selectedParticipantId={id}
        userProfile={{ ...props.userProfile, skillComments: { retired: text } }}
      />
    );
    expect(screen.getByText(`“${text}”`)).toBeInTheDocument();
    expect(screen.getByText('retired')).toBeInTheDocument();
    expect(screen.getByTestId('skill-comment-fill')).toHaveStyle({ width: '0%' });
    expect(
      screen.queryByText(`“${id === 'a' ? 'Participant B text' : 'Participant A text'}”`)
    ).toBeNull();
  }
  rerender(
    <StudentCoachPanel
      {...props}
      progressLoadState="loaded"
      userProfile={{ ...props.userProfile, skillScores: { skill: 1 }, skillComments: {} }}
    />
  );
  expect(screen.getByText('scCoachNoComments')).toBeInTheDocument();
});

it.each(['comments', 'videos', 'homework', 'recommendations'] as const)(
  'hides an unavailable instructor in %s without losing the section',
  (view) => {
    const props = {
      bookings: [],
      courses: [],
      instructors: [{ id: 'coach', name: 'Coach' } as Instructor],
      userProfile: {
        uid: 'student',
        skillComments: { skill: 'Must not be displayed' },
      } as UserProfile,
      selectedParticipantId: 'b',
      navigation: { view, selectedInstructorId: 'coach' },
      onGoToTab: vi.fn(),
      onChat: vi.fn(),
      onOpenLesson: vi.fn(),
      onBookInstructor: vi.fn(),
    };
    render(<StudentCoachPanel {...props} />);
    expect(screen.getByRole('status')).toHaveTextContent('scCoachNoLessons');
    expect(screen.queryByText('“Must not be displayed”')).toBeNull();
  }
);

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
          expect(screen.getByTestId('skill-comment-fill')).toHaveStyle({
            width: `${score === undefined ? 0 : (score / maxPoints) * 100}%`,
          });
          expect(screen.getByTestId('skill-comment-fill')).toHaveAttribute('aria-hidden', 'true');
          expect(screen.getByText('“Coach comment without a required score”')).toBeInTheDocument();
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

describe.each<Language>(['ru', 'en'])(
  'skill comment attribution in the coach panel (%s)',
  (language) => {
    it('labels current text as unknown when switching instructors and Participants, including missing history', () => {
      locale.language = language;
      const copy = translations[language];
      const profile = {
        uid: 'student',
        level: 1,
        skillScores: { skill: 2 },
        skillComments: { skill: 'Instructor B current text' },
      } as UserProfile;
      const instructors = ['coach-a', 'coach-b'].map((id) => ({
        id,
        name: id,
        isAvailable: true,
      })) as Instructor[];
      const logs = instructors.map(({ id }, index) => ({
        id: `log-${index}`,
        userId: 'student',
        actorId: id,
        type: 'skill_scores_updated',
        timestamp: `2026-10-0${index + 1}T10:00:00.000Z`,
        metadata: { instructorId: id, commentedSkillIds: ['skill'] },
      })) as ActivityLog[];
      const props = {
        bookings: instructors.map(({ id }) => ({
          id: `lesson-${id}`,
          userId: 'student',
          instructorId: id,
          date: '2026-10-01',
          status: 'completed',
        })) as Booking[],
        courses: [],
        instructors,
        userProfile: profile,
        selectedParticipantId: 'participant-self',
        skillConfig: {
          items: [{ id: 'skill', titleEn: 'Carving', title: 'Карвинг', maxPoints: 3 }],
        },
        activityLogs: logs,
        onGoToTab: vi.fn(),
        onChat: vi.fn(),
        onOpenLesson: vi.fn(),
        onBookInstructor: vi.fn(),
      };
      const { rerender } = render(<StudentCoachPanel {...props} />);
      fireEvent.click(screen.getAllByRole('button', { name: /scCoachComments/ })[0]);
      const expectUnknown = (text: string) => {
        expect(
          screen.queryByText(
            /confirmed authorship|подтверждённым авторством|scCoachNoAttributedComments/
          )
        ).toBeNull();
        expect(screen.getByText(copy.scCoachCurrentSkillComments)).toBeInTheDocument();
        expect(
          screen.queryByText(/Author unknown|Автор неизвестен|scCoachCommentAuthorUnknown/)
        ).toBeNull();
        expect(screen.getAllByText(`“${text}”`)).toHaveLength(1);
      };
      expectUnknown('Instructor B current text');
      expect(screen.queryByText('Instructor A historical text')).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: 'coach-a' }));
      fireEvent.click(screen.getAllByRole('button', { name: /scCoachComments/ })[1]);
      expectUnknown('Instructor B current text');

      rerender(
        <StudentCoachPanel
          {...props}
          selectedParticipantId="participant-dependent"
          userProfile={{
            ...profile,
            skillScores: { skill: 3 },
            skillComments: { skill: 'Dependent current text' },
          }}
          activityLogs={[]}
        />
      );
      expectUnknown('Dependent current text');
      expect(screen.getByTestId('skill-comment-fill')).toHaveStyle({ width: '100%' });
      expect(screen.queryByText('“Instructor B current text”')).toBeNull();

      rerender(
        <StudentCoachPanel
          {...props}
          selectedParticipantId="participant-other"
          userProfile={{ ...profile, uid: 'another-student', skillComments: {} }}
        />
      );
      expect(screen.queryByText('“Dependent current text”')).toBeNull();
      expect(screen.queryByText('“Instructor B current text”')).toBeNull();
      expect(screen.getByText('scCoachNoLessons')).toBeInTheDocument();
    });
  }
);
