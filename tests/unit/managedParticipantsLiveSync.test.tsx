import type { User } from 'firebase/auth';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { useEffect } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '../../src/features/auth/authStore';
import type { ManagedParticipantOption } from '../../src/features/lesson-bookings/lessonBookingContracts';
import { useManagedParticipants } from '../../src/features/lesson-bookings/useManagedParticipants';
import { useProfileStore } from '../../src/features/profile/profileStore';
import type { UpdateManagedParticipantProfileInput } from '../../src/features/participants/participantManagementContracts';
import { ParticipantManagementPanel } from '../../src/features/participants/components/ParticipantManagementPanel';
import { resetUserScopedStores } from '../../src/store/resetDataStores';
import {
  useNavbarParticipantSwitcher,
  CabinetParticipantAvatarSwitcher,
} from '../../src/features/student-cabinet/navbar';
import { useCabinetProgressParticipantSelectionStore } from '../../src/features/student-cabinet/cabinetProgressParticipantSelectionStore';
import type { UserProfile } from '../../src/types';

const TEST_DIRECTORY = dirname(fileURLToPath(import.meta.url));

const mocks = vi.hoisted(() => ({
  ensureCanonicalSelfParticipant: vi.fn(),
  queryManagedParticipantPickerReadModels: vi.fn(),
  createDependentParticipant: vi.fn(),
  updateManagedParticipantProfile: vi.fn(),
  uploadImage: vi.fn(),
}));

vi.mock('../../src/lib/canonical/canonicalAccountProvisioningClient', () => ({
  ensureCanonicalSelfParticipant: mocks.ensureCanonicalSelfParticipant,
}));

vi.mock('../../src/lib/canonical/canonicalReadModelClient', () => ({
  queryManagedParticipantPickerReadModels: mocks.queryManagedParticipantPickerReadModels,
}));

vi.mock('../../src/features/participants/useParticipantManagementCommands', () => ({
  useParticipantManagementCommands: () => ({
    createDependentParticipant: mocks.createDependentParticipant,
    updateManagedParticipantProfile: mocks.updateManagedParticipantProfile,
  }),
}));

vi.mock('../../src/infrastructure/firebase', () => ({ uploadImage: mocks.uploadImage }));

vi.mock('../../src/features/student-cabinet/components/profileImage', () => ({
  optimizeProfileImage: vi.fn(async (file: Blob) => file),
}));

vi.mock('../../src/app/providers/LanguageContext', () => ({
  useLanguage: () => ({ t: (key: string) => key, language: 'en' }),
}));

const accountId = 'account_student';
const avatarUrl = 'https://storage.example/participant-new.png';
let readModelItems: ManagedParticipantOption[];
let headerMountCount = 0;
let finishAvatarUpload: ((url: string) => void) | undefined;

const selfParticipant: ManagedParticipantOption = {
  participantId: 'participant_self',
  participantManagementId: 'management_self',
  displayName: 'Student Self',
  discipline: 'ski',
  skillLevel: 'beginner',
  age: { kind: 'age_years', years: 30 },
  authority: 'self',
  revision: 1,
};

function HeaderAndCabinet() {
  const switcher = useNavbarParticipantSwitcher({ accountId });
  const { participants } = useManagedParticipants(accountId);
  const selected = participants.find(
    (participant) => participant.participantId === switcher.selectedParticipantId
  );

  useEffect(() => {
    headerMountCount += 1;
  }, []);

  return (
    <header>
      <output data-testid="header-mount-count">{headerMountCount}</output>
      <output data-testid="selected-participant-id">{switcher.selectedParticipantId ?? ''}</output>
      <output data-testid="cabinet-selected-participant">{selected?.displayName ?? ''}</output>
      <CabinetParticipantAvatarSwitcher
        items={switcher.items}
        selectedParticipantId={switcher.selectedParticipantId}
        onSelect={switcher.selectParticipant}
        fallbackDisplayName="Student Self"
        groupLabel="Participants"
        switchToParticipantLabel="Switch to participant {name}"
      />
    </header>
  );
}

function seedAuthenticatedProfile() {
  useAuthStore.getState().setFirebaseUser({ uid: accountId } as User);
  useProfileStore.setState({
    userProfile: {
      uid: accountId,
      email: 'student@example.com',
      displayName: 'Student',
      role: 'user',
      avatarUrl: '',
    } as UserProfile,
    profileLoading: false,
  });
}

describe('managed participants live synchronization', () => {
  beforeEach(() => {
    resetUserScopedStores();
    useAuthStore.setState({ firebaseUser: null, authLoading: false, authGeneration: 0 });
    useCabinetProgressParticipantSelectionStore.getState().reset();
    vi.clearAllMocks();
    headerMountCount = 0;
    finishAvatarUpload = undefined;
    readModelItems = [selfParticipant];
    mocks.ensureCanonicalSelfParticipant.mockResolvedValue(undefined);
    mocks.queryManagedParticipantPickerReadModels.mockImplementation(async () => ({
      items: readModelItems,
    }));
    mocks.createDependentParticipant.mockImplementation(
      async ({ displayName, ageYears, skillLevel, discipline }) => {
        readModelItems = [
          ...readModelItems,
          {
            participantId: 'participant_new',
            participantManagementId: 'management_new',
            displayName,
            discipline,
            skillLevel,
            age: { kind: 'age_years', years: ageYears },
            authority: 'parent_guardian',
            revision: 1,
          },
        ];
        return { participantId: 'participant_new' };
      }
    );
    mocks.updateManagedParticipantProfile.mockImplementation(
      async (input: UpdateManagedParticipantProfileInput) => {
        readModelItems = readModelItems.map((participant) =>
          participant.participantId === input.participantId
            ? {
                ...participant,
                ...(input.avatarUrl ? { avatarUrl: input.avatarUrl } : {}),
                revision: participant.revision + 1,
              }
            : participant
        );
      }
    );
    mocks.uploadImage.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishAvatarUpload = resolve;
        })
    );
    seedAuthenticatedProfile();
  });

  it('shares create and avatar refetches with the mounted header and cabinet switcher', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <>
        <HeaderAndCabinet />
        <ParticipantManagementPanel accountId={accountId} />
      </>
    );

    await waitFor(() => {
      expect(screen.getByTestId('selected-participant-id')).toHaveTextContent('participant_self');
    });
    expect(mocks.queryManagedParticipantPickerReadModels).toHaveBeenCalledOnce();

    await user.click(screen.getAllByRole('button', { name: 'participantsCreateDependent' })[0]!);
    await user.type(screen.getByLabelText('participantsDisplayNameLabel'), 'New Dependent');
    await user.click(screen.getByRole('button', { name: 'saveChanges' }));

    const newParticipantButton = await screen.findByRole('button', {
      name: 'Switch to participant New Dependent',
    });
    expect(mocks.createDependentParticipant).toHaveBeenCalledOnce();
    expect(mocks.queryManagedParticipantPickerReadModels).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId('header-mount-count')).toHaveTextContent('1');
    expect(newParticipantButton.querySelector('[data-participant-avatar-face]')).toHaveTextContent(
      'N'
    );

    await user.click(newParticipantButton);
    expect(screen.getByTestId('selected-participant-id')).toHaveTextContent('participant_new');
    expect(screen.getByTestId('cabinet-selected-participant')).toHaveTextContent('New Dependent');

    const editButtons = screen.getAllByRole('button', { name: 'participantsEditProfile' });
    await user.click(editButtons[editButtons.length - 1]!);
    const avatarInput = container.querySelector('input[type="file"]');
    expect(avatarInput).not.toBeNull();
    fireEvent.change(avatarInput!, {
      target: { files: [new File(['avatar'], 'avatar.png', { type: 'image/png' })] },
    });

    await waitFor(() => expect(mocks.uploadImage).toHaveBeenCalledOnce());
    expect(
      screen
        .getByRole('button', { name: 'Switch to participant New Dependent' })
        .querySelector('[data-participant-avatar-face]')
    ).toHaveTextContent('N');

    await act(async () => {
      finishAvatarUpload?.(avatarUrl);
    });

    await waitFor(() => {
      const avatar = screen
        .getByRole('button', { name: 'Switch to participant New Dependent' })
        .querySelector('img');
      expect(avatar).toHaveAttribute('src', avatarUrl);
    });
    expect(mocks.updateManagedParticipantProfile).toHaveBeenCalledWith(
      expect.objectContaining({ participantId: 'participant_new', avatarUrl })
    );
    expect(mocks.queryManagedParticipantPickerReadModels).toHaveBeenCalledTimes(3);
    expect(screen.getByTestId('selected-participant-id')).toHaveTextContent('participant_new');
    expect(screen.getByTestId('cabinet-selected-participant')).toHaveTextContent('New Dependent');
    expect(screen.getByTestId('header-mount-count')).toHaveTextContent('1');

    const participantFlowSource = [
      readFileSync(
        join(
          TEST_DIRECTORY,
          '../../src/features/participants/components/ParticipantManagementPanel.tsx'
        ),
        'utf8'
      ),
      readFileSync(
        join(TEST_DIRECTORY, '../../src/features/lesson-bookings/useManagedParticipants.ts'),
        'utf8'
      ),
    ].join('\n');
    expect(participantFlowSource).not.toMatch(/window\.location\.reload\s*\(/);
  });
});
