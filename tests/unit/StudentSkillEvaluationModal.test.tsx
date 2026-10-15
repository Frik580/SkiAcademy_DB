import { useState } from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StudentSkillEvaluationModal } from '../../src/features/profile/components/StudentSkillEvaluationModal';
import { DEFAULT_SKILL_CONFIG } from '../../src/domain/achievements';

vi.mock('../../src/app/providers/LanguageContext', () => ({
  useLanguage: () => ({ language: 'en', t: (key: string) => key }),
}));

afterEach(cleanup);
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
    await user.click(screen.getByRole('button', { name: 'saveRatings' }));
    expect(save).toHaveBeenCalledWith('participant_modal_01', scores, 1, comments, undefined);
    expect(screen.getByLabelText('cancel')).toBeDisabled();
    await user.keyboard('{Escape}');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    finish();
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
