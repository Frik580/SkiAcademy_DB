import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../src/app/providers/LanguageContext';
import { TodayTasksBlock } from '../../src/features/student-cabinet/components/student/StudentTodayTasksBlock';
import { useParticipantLessonFeedbackStore } from '../../src/features/participant-lesson-feedback/participantLessonFeedbackStore';
import type { TodayTask } from '../../src/features/student-cabinet/components/student/studentCabinetUtils';
import type { Booking } from '../../src/types';

const task: TodayTask = {
  id: 'custom:a',
  label: 'Check bindings',
  kind: 'custom',
  customTaskId: 'a',
  done: false,
};
const props = () => ({
  scopeParticipant: { participantId: 'a', displayName: 'Alice', avatarUrl: '/alice.png' },
  todayTasks: [task],
  bookings: [] as Booking[],
  onToggleTodayTaskComplete: vi.fn(),
  onAddCustomTodayTask: vi.fn(),
  onRemoveTodayTask: vi.fn(),
  onToggleRecommendation: vi.fn(),
  onOpenLesson: vi.fn(),
  onContinueDevelopment: vi.fn(),
});
beforeEach(() => {
  localStorage.setItem('alpine_glide_lang', 'en');
  useParticipantLessonFeedbackStore.getState().clear();
});
afterEach(cleanup);

it('keeps native keyboard check/uncheck, add validation, remove and development callbacks', async () => {
  const p = props();
  const user = userEvent.setup();
  const view = render(
    <LanguageProvider>
      <TodayTasksBlock {...p} />
    </LanguageProvider>
  );
  expect(
    view.container.querySelector('.sc-today-tasks-actions [data-participant-scope="a"]')
  ).toHaveTextContent('Alice');
  expect(view.container.querySelectorAll('[data-participant-scope]')).toHaveLength(1);
  expect(view.container.querySelector('.sc-today-tasks-actions img')).toHaveAttribute(
    'src',
    '/alice.png'
  );
  expect(screen.queryByText(/of 1 completed/)).not.toBeInTheDocument();
  const checkbox = screen.getByRole('checkbox', { name: task.label });
  checkbox.focus();
  await user.keyboard(' ');
  expect(p.onToggleTodayTaskComplete).toHaveBeenLastCalledWith(task.id, true);
  view.rerender(
    <LanguageProvider>
      <TodayTasksBlock {...p} todayTasks={[{ ...task, done: true }]} />
    </LanguageProvider>
  );
  expect(checkbox).toBeChecked();
  await user.click(checkbox);
  expect(p.onToggleTodayTaskComplete).toHaveBeenLastCalledWith(task.id, false);
  await user.click(screen.getByRole('button', { name: 'New reminder' }));
  const input = screen.getByRole('textbox', { name: 'New reminder' });
  expect(input).toHaveFocus();
  await user.type(input, '   ');
  expect(screen.getByRole('button', { name: 'Add to Today' })).toBeDisabled();
  await user.type(input, ' Bring gloves ');
  await user.keyboard('{Enter}');
  expect(p.onAddCustomTodayTask).toHaveBeenCalledWith('Bring gloves');
  expect(input).toHaveValue('');
  await user.click(screen.getByRole('button', { name: 'Remove task' }));
  expect(p.onRemoveTodayTask).toHaveBeenCalledWith({
    id: task.id,
    kind: 'custom',
    customTaskId: 'a',
    skillItemId: undefined,
  });
  await user.click(screen.getByRole('button', { name: /Development/ }));
  expect(p.onContinueDevelopment).toHaveBeenCalledTimes(1);
  expect(view.container).not.toHaveTextContent('XP');
});

it('keeps recommendation grouping, lesson details and pending completion disabled', () => {
  const p = props();
  const recommendation: TodayTask = {
    id: 'rec:1',
    label: 'Coach advice',
    kind: 'recommendation',
    recommendationId: 'r1',
    done: false,
    bookingContext: {
      bookingId: 'b1',
      title: 'Morning lesson',
      dateLabel: '10 October',
      isCourse: false,
    },
  };
  const booking = { id: 'b1' } as Booking;
  useParticipantLessonFeedbackStore.getState().setPresentationParticipantId('a');
  const view = render(
    <LanguageProvider>
      <TodayTasksBlock {...p} bookings={[booking]} todayTasks={[recommendation]} />
    </LanguageProvider>
  );
  fireEvent.click(screen.getByRole('checkbox', { name: 'Coach advice' }));
  expect(p.onToggleRecommendation).toHaveBeenCalledWith('b1', 'r1', true);
  fireEvent.click(screen.getByRole('button', { name: 'Lesson details' }));
  expect(p.onOpenLesson).toHaveBeenCalledWith(booking);
  act(() => useParticipantLessonFeedbackStore.getState().setPending('a:b1:r1', true));
  expect(screen.getByRole('checkbox')).toBeDisabled();
  expect(view.container.querySelector('[data-task-row]')).toHaveAttribute('aria-busy', 'true');
});

it('resets the draft for A → B → A and renders scoped loading/error/empty states', async () => {
  const p = props();
  const user = userEvent.setup();
  const view = render(
    <LanguageProvider>
      <TodayTasksBlock key="a" {...p} />
    </LanguageProvider>
  );
  await user.type(screen.getByRole('textbox'), 'Alice draft');
  const generation = useParticipantLessonFeedbackStore.getState().beginLoad('b');
  view.rerender(
    <LanguageProvider>
      <TodayTasksBlock
        key="b"
        {...p}
        scopeParticipant={{ participantId: 'b', displayName: 'Bob' }}
        todayTasks={[]}
      />
    </LanguageProvider>
  );
  expect(screen.getByRole('textbox')).toHaveValue('');
  expect(screen.getByRole('status')).toHaveTextContent('Loading');
  expect(screen.queryByText(task.label)).not.toBeInTheDocument();
  act(() =>
    useParticipantLessonFeedbackStore.getState().applyLoadError('b', generation, 'Offline')
  );
  expect(screen.getByRole('alert')).toHaveTextContent('Request Failed');
  act(() => useParticipantLessonFeedbackStore.getState().replaceParticipantItems('b', []));
  expect(screen.getByText('No tasks for today yet.')).toBeInTheDocument();
  view.rerender(
    <LanguageProvider>
      <TodayTasksBlock key="a" {...p} />
    </LanguageProvider>
  );
  expect(screen.getByRole('textbox')).toHaveValue('');
  expect(screen.getByRole('checkbox', { name: task.label })).not.toBeChecked();
});
