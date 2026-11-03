import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { translations, type TranslationKey } from '../../src/lib/i18n/translations';
import { InstructorBlockAction } from '../../src/features/booking-collaboration/components/InstructorBlockAction';
import { InstructorCard } from '../../src/features/profile/components/InstructorCard';
import type { ParticipantAccessCabinetItem } from '../../src/features/booking-collaboration/bookingCollaborationContracts';
import type { Instructor } from '../../src/types';

const locale = vi.hoisted(() => ({ language: 'en' as 'en' | 'ru' }));
vi.mock('../../src/app/providers/LanguageContext', () => ({
  useLanguage: () => ({
    language: locale.language,
    t: (key: TranslationKey) => translations[locale.language][key],
  }),
}));
vi.mock('framer-motion', () => ({
  useReducedMotion: () => true,
  m: {
    div: ({
      children,
      initial: _initial,
      whileInView: _view,
      viewport: _viewport,
      exit: _exit,
      transition: _transition,
      ...props
    }: React.PropsWithChildren<Record<string, unknown>>) => <div {...props}>{children}</div>,
  },
}));

const instructor: Instructor = {
  id: 'instructor_elena',
  name: 'Elena',
  specialty: 'ski',
  rating: 5,
  reviewsCount: 2,
  languages: ['en'],
  experienceYears: 5,
  bio: 'Instructor',
  avatarUrl: '/elena.jpg',
  pricePerHour: 10000,
  pricePerHourKZT: 10000,
  isAvailable: true,
};
function access(blocked = false): ParticipantAccessCabinetItem {
  return {
    participantId: 'dependent',
    instructorId: instructor.id,
    participantDisplayName: 'Student',
    instructorDisplayName: instructor.name,
    managerBlockStatus: blocked ? 'active' : undefined,
    authorizedActions: {
      canCreateRelationship: false,
      canRevokeRelationship: false,
      canBlock: !blocked,
      canUnblock: blocked,
    },
  };
}

describe('instructor card block action', () => {
  beforeEach(() => {
    locale.language = 'en';
  });
  it.each([false, true])(
    'renders the direct action and grayscale only when blocked=%s',
    (blocked) => {
      const onBook = vi.fn();
      render(
        <InstructorCard
          instructor={instructor}
          onBook={onBook}
          blocked={blocked}
          actions={
            <InstructorBlockAction access={access(blocked)} onBlock={vi.fn()} onUnblock={vi.fn()} />
          }
        />
      );
      const button = screen.getByRole('button', {
        name: blocked ? 'Unblock instructor' : 'Block instructor',
      });
      expect(button).toHaveAttribute('title', blocked ? 'Unblock instructor' : 'Block instructor');
      expect(button).toHaveClass(blocked ? 'text-green-700' : 'text-red-600');
      expect(button.querySelector(blocked ? '.lucide-check' : '.lucide-x')).toBeInTheDocument();
      expect(button).toHaveClass('focus-visible:outline-2', 'h-11', 'w-11');
      expect(button.parentElement).toHaveClass('absolute', 'right-0', 'top-0');
      expect(screen.getByRole('img', { name: 'Elena' }).classList.contains('grayscale')).toBe(
        blocked
      );
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
      expect(onBook).not.toHaveBeenCalled();
    }
  );

  it.each([
    [
      'en',
      'Block instructor',
      'Block instructor?',
      'Reason for blocking',
      'Cancel',
      'Block',
      'New interactions with this instructor will be restricted for the selected student. Existing confirmed bookings will remain active.',
    ],
    [
      'ru',
      'Заблокировать инструктора',
      'Заблокировать инструктора?',
      'Причина блокировки',
      'Отмена',
      'Заблокировать',
      'Новые взаимодействия с этим инструктором будут ограничены для выбранного ученика. Уже подтверждённые занятия сохранятся.',
    ],
  ] as const)(
    'requires a reason and confirms the exact %s block copy',
    async (language, label, title, reasonLabel, cancel, confirm, body) => {
      locale.language = language;
      const user = userEvent.setup();
      const onBlock = vi.fn().mockResolvedValue(undefined);
      render(<InstructorBlockAction access={access()} onBlock={onBlock} />);
      await user.click(screen.getByRole('button', { name: label }));
      const dialog = screen.getByRole('dialog', { name: title });
      expect(dialog).toHaveAccessibleDescription(body);
      const input = within(dialog).getByRole('textbox', { name: reasonLabel });
      expect(input).toBeRequired();
      expect(input).toHaveFocus();
      const submit = within(dialog).getByRole('button', { name: confirm, exact: true });
      expect(submit).toBeDisabled();
      await user.type(input, '   ');
      expect(submit).toBeDisabled();
      await user.clear(input);
      await user.type(input, ' Safety concern ');
      await user.tab();
      expect(screen.getByRole('button', { name: cancel })).toHaveFocus();
      await user.tab();
      expect(submit).toHaveFocus();
      await user.tab();
      expect(input).toHaveFocus();
      await user.tab({ shift: true });
      expect(submit).toHaveFocus();
      await user.keyboard('{Enter}');
      expect(onBlock).toHaveBeenCalledExactlyOnceWith('Safety concern');
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: label })).toHaveFocus();
    }
  );

  it.each([
    [
      'en',
      'Unblock instructor',
      'Unblock instructor?',
      'Cancel',
      'Unblock',
      'The instructor will be able to interact with the selected student again according to system rules.',
    ],
    [
      'ru',
      'Разблокировать инструктора',
      'Разблокировать инструктора?',
      'Отмена',
      'Разблокировать',
      'Инструктор снова сможет взаимодействовать с выбранным учеником в рамках правил системы.',
    ],
  ] as const)(
    'confirms unblocking with keyboard and %s copy',
    async (language, label, title, cancel, confirm, body) => {
      locale.language = language;
      const user = userEvent.setup();
      const onUnblock = vi.fn().mockResolvedValue(undefined);
      render(<InstructorBlockAction access={access(true)} onUnblock={onUnblock} />);
      await user.tab();
      const trigger = screen.getByRole('button', { name: label });
      expect(trigger).toHaveFocus();
      await user.keyboard(' ');
      expect(screen.getByRole('dialog', { name: title })).toHaveAccessibleDescription(body);
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: cancel })).toHaveFocus();
      await user.keyboard('{Escape}');
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(trigger).toHaveFocus();
      await user.keyboard('{Enter}');
      expect(onUnblock).not.toHaveBeenCalled();
      await user.click(screen.getByRole('button', { name: confirm, exact: true }));
      expect(onUnblock).toHaveBeenCalledExactlyOnceWith();
      expect(trigger).toHaveFocus();
    }
  );

  it('keeps the dialog and reason after a server error and allows cancellation', async () => {
    const user = userEvent.setup();
    const onBlock = vi.fn().mockRejectedValue(new Error('Permission denied'));
    render(<InstructorBlockAction access={access()} onBlock={onBlock} />);
    await user.click(screen.getByRole('button', { name: 'Block instructor' }));
    await user.type(screen.getByRole('textbox'), 'Reason');
    await user.click(screen.getByRole('button', { name: 'Block', exact: true }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Permission denied');
    expect(screen.getByRole('textbox')).toHaveValue('Reason');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('retains keyboard focus while pending and after a failed command', async () => {
    const user = userEvent.setup();
    let rejectCommand!: (error: Error) => void;
    const command = new Promise<void>((_resolve, reject) => {
      rejectCommand = reject;
    });
    function PendingAction() {
      const [loading, setLoading] = React.useState(false);
      return (
        <InstructorBlockAction
          access={access()}
          loading={loading}
          onBlock={async () => {
            setLoading(true);
            try {
              await command;
            } finally {
              setLoading(false);
            }
          }}
        />
      );
    }
    render(<PendingAction />);
    await user.click(screen.getByRole('button', { name: 'Block instructor' }));
    await user.type(screen.getByRole('textbox'), 'Reason');
    await user.click(screen.getByRole('button', { name: 'Block', exact: true }));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveFocus();
    await user.tab({ shift: true });
    expect(dialog).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(dialog).toBeInTheDocument();
    await act(async () => {
      rejectCommand(new Error('Command failed'));
    });
    expect(screen.getByRole('alert')).toHaveTextContent('Command failed');
    await user.tab({ shift: true });
    expect(screen.getByRole('button', { name: 'Block', exact: true })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('textbox')).toHaveFocus();
  });

  it('does not offer an unauthorized action', () => {
    render(<InstructorBlockAction access={access()} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
