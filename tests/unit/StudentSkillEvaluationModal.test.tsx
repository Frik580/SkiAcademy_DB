import { useState } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { CanonicalCommandClientError } from '../../src/lib/canonical/mapCanonicalCommandError';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StudentSkillEvaluationModal } from '../../src/features/profile/components/StudentSkillEvaluationModal';
import { DEFAULT_SKILL_CONFIG } from '../../src/domain/achievements';

const testLocale = vi.hoisted(() => ({ language: 'en' }));
vi.mock('../../src/app/providers/LanguageContext', () => ({
  useLanguage: () => ({ language: testLocale.language, t: (key: string) => key }),
}));

beforeEach(() => {
  testLocale.language = 'en';
  vi.stubGlobal('matchMedia', () => ({ matches: true }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const scores = { skill: 1 };
const comments = { skill: 'Existing comment' };
const config = {
  ...DEFAULT_SKILL_CONFIG,
  items: [{ ...DEFAULT_SKILL_CONFIG.items[0], id: 'skill', maxPoints: 3, levelTarget: 1 }],
};

function Example({ save }: { save: (...args: unknown[]) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ transform: 'translateY(200px)' }}>
      <button onClick={() => setOpen(true)}>Assess</button>
      <StudentSkillEvaluationModal
        isOpen={open}
        onClose={() => setOpen(false)}
        participantId="participant_modal_01"
        studentName="Student"
        studentLevel={1}
        existingScores={scores}
        existingComments={comments}
        skillConfig={config}
        onSaveScores={save}
      />
    </div>
  );
}

describe('skill evaluation modal', () => {
  it.each(['en', 'ru'])(
    'preserves the draft on conflict and explicitly reloads (%s)',
    async (language) => {
      testLocale.language = language;
      const save = vi
        .fn()
        .mockRejectedValueOnce(
          new CanonicalCommandClientError('stale_version', {
            correlationId: 'conflict_test',
            currentRevision: 2,
          })
        )
        .mockResolvedValue(undefined);
      const close = vi.fn();
      const reload = vi
        .fn()
        .mockRejectedValueOnce(new Error('Read unavailable'))
        .mockResolvedValue(undefined);
      function ConflictForm() {
        const [snapshot, setSnapshot] = useState({ scores, comments });
        return (
          <StudentSkillEvaluationModal
            isOpen
            onClose={close}
            participantId="participant_modal_01"
            studentName="Student"
            studentLevel={1}
            existingScores={snapshot.scores}
            existingComments={snapshot.comments}
            skillConfig={config}
            onSaveScores={save}
            onReload={async () => {
              await reload();
              setSnapshot({ scores: { skill: 2 }, comments: { skill: 'Latest comment' } });
            }}
          />
        );
      }
      render(<ConflictForm />);
      const user = userEvent.setup();
      const input = screen.getByPlaceholderText('instructorExerciseCommentPlaceholder');
      await user.clear(input);
      await user.type(input, 'My unsaved draft');
      await user.click(screen.getByRole('button', { name: 'saveRatings' }));
      expect(await screen.findByRole('alert')).toHaveTextContent(
        language === 'ru'
          ? 'Оценки или комментарии этого участника были изменены другим инструктором'
          : "This participant's scores or comments were changed by another instructor"
      );
      expect(input).toHaveValue('My unsaved draft');
      expect(screen.getByRole('button', { name: 'saveRatings' })).toBeDisabled();
      fireEvent.click(screen.getByRole('button', { name: 'saveRatings' }));
      expect(save).toHaveBeenCalledTimes(1);
      expect(reload).not.toHaveBeenCalled();
      const refreshLabel = language === 'ru' ? 'Загрузить актуальные данные' : 'Load current data';
      await user.click(screen.getByRole('button', { name: refreshLabel }));
      expect(await screen.findByRole('alert')).toHaveTextContent('Read unavailable');
      expect(input).toHaveValue('My unsaved draft');
      expect(save).toHaveBeenCalledTimes(1);
      await user.click(screen.getByRole('button', { name: refreshLabel }));
      await waitFor(() => expect(input).toHaveValue('Latest comment'));
      expect(screen.queryByRole('alert')).toBeNull();
      await user.clear(input);
      await user.type(input, 'Reviewed new edit');
      await user.click(screen.getByRole('button', { name: 'saveRatings' }));
      expect(save).toHaveBeenLastCalledWith(
        'participant_modal_01',
        { skill: 2 },
        1,
        { skill: 'Reviewed new edit' },
        undefined
      );
      expect(close).toHaveBeenCalledTimes(1);
    }
  );
  it('allows closing a conflicting form without resubmitting the draft', async () => {
    const save = vi
      .fn()
      .mockRejectedValue(
        new CanonicalCommandClientError('stale_version', { correlationId: 'close_conflict' })
      );
    render(<Example save={save} />);
    const user = userEvent.setup();
    await user.click(screen.getByText('Assess'));
    await user.click(screen.getByRole('button', { name: 'saveRatings' }));
    await screen.findByRole('alert');
    await user.click(screen.getByLabelText('cancel'));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(save).toHaveBeenCalledTimes(1);
  });
  it('preserves comment text when an explicitly selected score becomes zero', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    render(<Example save={save} />);
    const user = userEvent.setup();
    await user.click(screen.getByText('Assess'));
    await user.click(screen.getByRole('button', { name: /: 0 \/ 3$/ }));
    expect(screen.getByPlaceholderText('instructorExerciseCommentPlaceholder')).toHaveValue(
      'Existing comment'
    );
    await user.type(
      screen.getByRole('textbox', { name: 'Reason for correcting scores' }),
      'Correction'
    );
    await user.click(screen.getByRole('button', { name: 'saveRatings' }));
    expect(save).toHaveBeenCalledWith(
      'participant_modal_01',
      { skill: 0 },
      1,
      comments,
      'Correction'
    );
  });
  it('portals, traps focus, closes with Escape, and resets unsaved edits on repeated opening', async () => {
    const save = vi.fn();
    const view = render(<Example save={save} />);
    const user = userEvent.setup();
    for (let i = 0; i < 3; i++) {
      await user.click(screen.getByText('Assess'));
      const dialog = screen.getByRole('dialog', { name: /studentSkillEvaluation: Student/ });
      expect(view.container).not.toContainElement(dialog);
      expect(dialog.closest('[data-admin-modal-root]')?.parentElement).toBe(document.body);
      expect(screen.getByLabelText('cancel')).toHaveFocus();
      expect(screen.getByPlaceholderText('instructorExerciseCommentPlaceholder')).toHaveValue(
        'Existing comment'
      );
      await user.clear(screen.getByPlaceholderText('instructorExerciseCommentPlaceholder'));
      await user.type(
        screen.getByPlaceholderText('instructorExerciseCommentPlaceholder'),
        'Unsaved'
      );
      await user.click(screen.getByLabelText('cancel'));
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(screen.getByText('Assess')).toHaveFocus();
      expect(document.documentElement).not.toHaveClass('modal-scroll-lock');
    }
    await user.click(screen.getByText('Assess'));
    await user.tab({ shift: true });
    expect(screen.getByRole('button', { name: 'saveRatings' })).toHaveFocus();
    await user.tab();
    expect(screen.getByLabelText('cancel')).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(save).not.toHaveBeenCalled();
  });

  it('preserves participant-scoped score arguments, pending lock, and successful close', async () => {
    let finish: () => void = () => {};
    const save = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        })
    );
    render(<Example save={save} />);
    const user = userEvent.setup();
    await user.click(screen.getByText('Assess'));
    const pendingSave = screen.getByRole('button', { name: 'saveRatings' });
    await user.click(screen.getByRole('button', { name: 'saveRatings' }));
    expect(save).toHaveBeenCalledWith('participant_modal_01', scores, 1, comments, undefined);
    fireEvent.click(pendingSave);
    expect(save).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('cancel')).toBeDisabled();
    await user.keyboard('{Escape}');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await act(async () => finish());
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByText('Assess')).toHaveFocus();
  });

  it('keeps a rejected save visible and permits retry without losing edits', async () => {
    const save = vi
      .fn()
      .mockRejectedValueOnce(new Error('Save failed'))
      .mockResolvedValueOnce(undefined);
    render(<Example save={save} />);
    const user = userEvent.setup();
    await user.click(screen.getByText('Assess'));
    await user.click(screen.getByRole('button', { name: 'saveRatings' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Save failed');
    expect(screen.getByLabelText('cancel')).toBeEnabled();
    expect(screen.getByPlaceholderText('instructorExerciseCommentPlaceholder')).toHaveValue(
      'Existing comment'
    );
    await user.click(screen.getByRole('button', { name: 'saveRatings' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(save).toHaveBeenCalledTimes(2);
  });
});
