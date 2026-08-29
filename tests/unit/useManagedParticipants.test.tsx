import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  ensureCanonicalSelfParticipant: vi.fn(),
  queryManagedParticipantPickerReadModels: vi.fn(),
}));

vi.mock('../../src/lib/canonical/canonicalAccountProvisioningClient', () => ({
  ensureCanonicalSelfParticipant: mocks.ensureCanonicalSelfParticipant,
}));

vi.mock('../../src/lib/canonical/canonicalReadModelClient', () => ({
  queryManagedParticipantPickerReadModels: mocks.queryManagedParticipantPickerReadModels,
}));

import { useManagedParticipants } from '../../src/features/lesson-bookings/useManagedParticipants';

describe('useManagedParticipants', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.ensureCanonicalSelfParticipant.mockResolvedValue(undefined);
    mocks.queryManagedParticipantPickerReadModels.mockResolvedValue({
      items: [
        {
          participantId: 'participant_self',
          displayName: 'Self Client',
          discipline: 'ski',
          skillLevel: 'beginner',
          age: { kind: 'age_years', years: 18 },
          authority: 'self',
        },
      ],
    });
  });

  it('provisions through the canonical command before loading the picker', async () => {
    const { result } = renderHook(() => useManagedParticipants('account_self'));

    await waitFor(() => expect(result.current.participants).toHaveLength(1));
    expect(result.current.loading).toBe(false);
    expect(mocks.ensureCanonicalSelfParticipant).toHaveBeenCalledWith('account_self');
    expect(mocks.queryManagedParticipantPickerReadModels).toHaveBeenCalledWith({});
    expect(mocks.ensureCanonicalSelfParticipant.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.queryManagedParticipantPickerReadModels.mock.invocationCallOrder[0]!
    );
    expect(result.current.participants).toEqual([
      {
        participantId: 'participant_self',
        displayName: 'Self Client',
        discipline: 'ski',
        skillLevel: 'beginner',
        authority: 'self',
      },
    ]);
  });
});
