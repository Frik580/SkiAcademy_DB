/* eslint-disable @typescript-eslint/no-explicit-any */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ManagedParticipantOption } from '../../src/features/lesson-bookings/lessonBookingContracts';
import { ParticipantManagementPanel } from '../../src/features/participants/components/ParticipantManagementPanel';

const mocks = vi.hoisted(() => ({
  participants: [] as ManagedParticipantOption[],
  loading: false,
  error: undefined as string | undefined,
  reload: vi.fn(),
  createDependentParticipant: vi.fn(),
  updateManagedParticipantProfile: vi.fn(),
}));

vi.mock('../../src/app/providers/LanguageContext', () => ({
  useLanguage: () => ({ t: (key: string) => key, language: 'en' }),
}));

vi.mock('../../src/features/lesson-bookings/useManagedParticipants', () => ({
  useManagedParticipants: () => ({
    participants: mocks.participants,
    loading: mocks.loading,
    error: mocks.error,
    reload: mocks.reload,
  }),
}));

vi.mock('../../src/features/participants/useParticipantManagementCommands', () => ({
  useParticipantManagementCommands: () => ({
    createDependentParticipant: mocks.createDependentParticipant,
    updateManagedParticipantProfile: mocks.updateManagedParticipantProfile,
  }),
}));

const selfParticipant: ManagedParticipantOption = {
  participantId: 'participant_self',
  participantManagementId: 'management_self',
  displayName: 'Self Client',
  discipline: 'ski',
  skillLevel: 'beginner',
  age: { kind: 'age_years', years: 30 },
  authority: 'self',
  revision: 1,
};

const dependentParticipant: ManagedParticipantOption = {
  participantId: 'participant_dependent',
  participantManagementId: 'management_dependent',
  displayName: 'Dependent Child',
  discipline: 'snowboard',
  skillLevel: 'intermediate',
  age: { kind: 'birth_date', birthDate: '2012-02-29' },
  authority: 'parent_guardian',
  revision: 2,
};

describe('ParticipantManagementPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.participants = [selfParticipant, dependentParticipant];
    mocks.loading = false;
    mocks.error = undefined;
    mocks.reload.mockResolvedValue(undefined);
    mocks.createDependentParticipant.mockResolvedValue({ participantId: 'participant_new' });
    mocks.updateManagedParticipantProfile.mockResolvedValue(undefined);
  });

  it('renders managed self and dependent participants', () => {
    render(<ParticipantManagementPanel accountId="account_self" />);

    expect(screen.getByText('Self Client')).toBeInTheDocument();
    expect(screen.getByText('Dependent Child')).toBeInTheDocument();
  });

  it('creates a dependent through the canonical command flow and reloads', async () => {
    render(<ParticipantManagementPanel accountId="account_self" />);

    await userEvent.click(screen.getAllByRole('button', { name: 'participantsCreateDependent' })[0]!);
    await userEvent.type(screen.getByLabelText('participantsDisplayNameLabel'), 'New Dependent');
    await userEvent.click(screen.getByRole('button', { name: 'saveChanges' }));

    await waitFor(() => {
      expect(mocks.createDependentParticipant).toHaveBeenCalledWith(
        expect.objectContaining({ displayName: 'New Dependent' })
      );
      expect(mocks.reload).toHaveBeenCalled();
    });
  });

  it('shows a newly created participant after reload updates the read model', async () => {
    const { rerender } = render(<ParticipantManagementPanel accountId="account_self" />);

    mocks.participants = [
      ...mocks.participants,
      {
        participantId: 'participant_new',
        participantManagementId: 'management_new',
        displayName: 'New Dependent',
        discipline: 'ski',
        skillLevel: 'beginner',
        age: { kind: 'age_years', years: 8 },
        authority: 'parent_guardian',
        revision: 1,
      },
    ];
    rerender(<ParticipantManagementPanel accountId="account_self" />);

    expect(screen.getByText('New Dependent')).toBeInTheDocument();
  });

  it('updates profile through the canonical update command', async () => {
    render(<ParticipantManagementPanel accountId="account_self" />);

    await userEvent.click(screen.getAllByRole('button', { name: 'participantsEditProfile' })[0]!);
    const nameInput = screen.getAllByDisplayValue('Self Client')[0]!;
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, 'Updated Self');
    await userEvent.click(screen.getByRole('button', { name: 'saveChanges' }));

    await waitFor(() => {
      expect(mocks.updateManagedParticipantProfile).toHaveBeenCalledWith(
        expect.objectContaining({
          participantId: 'participant_self',
          displayName: 'Updated Self',
        })
      );
      expect(mocks.reload).toHaveBeenCalled();
    });
  });

  it('does not corrupt birth_date participants when saving without age changes', async () => {
    render(<ParticipantManagementPanel accountId="account_self" />);

    const editButtons = screen.getAllByRole('button', { name: 'participantsEditProfile' });
    await userEvent.click(editButtons[1]!);
    expect(screen.getByDisplayValue('2012-02-29')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'saveChanges' }));

    await waitFor(() => {
      expect(mocks.updateManagedParticipantProfile).not.toHaveBeenCalled();
    });
  });

  it('shows command failures to the user', async () => {
    mocks.createDependentParticipant.mockRejectedValue(new Error('canonical command failed'));
    render(<ParticipantManagementPanel accountId="account_self" />);

    await userEvent.click(screen.getAllByRole('button', { name: 'participantsCreateDependent' })[0]!);
    await userEvent.type(screen.getByLabelText('participantsDisplayNameLabel'), 'Broken Dependent');
    await userEvent.click(screen.getByRole('button', { name: 'saveChanges' }));

    await waitFor(() => {
      expect(screen.getByText('The operation could not be completed.')).toBeInTheDocument();
    });
  });
});
