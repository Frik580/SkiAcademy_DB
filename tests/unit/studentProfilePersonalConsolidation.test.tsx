import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  StudentProfileHubPanel,
  StudentProfilePersonalPanel,
} from '../../src/features/student-cabinet/components/student/StudentProfilePanels';

vi.mock('../../src/features/student-cabinet/components/student/useStudentCabinetTranslations', () => ({
  useStudentCabinetTranslations: () => ({
    t: (key: string) => key,
    language: 'en',
  }),
}));

vi.mock('../../src/app/providers/LanguageContext', () => ({
  useLanguage: () => ({ t: (key: string) => key, language: 'en' }),
}));

vi.mock('../../src/features/participants/components/ParticipantManagementPanel', () => ({
  ParticipantManagementPanel: ({ accountId }: { accountId: string }) => (
    <div data-testid="participants-panel">participants:{accountId}</div>
  ),
}));

const basePanelProps = {
  onGoToTab: vi.fn(),
  userProfile: {
    uid: 'account_deep_link',
    email: 'a@example.com',
    displayName: 'Client',
    role: 'user' as const,
    avatarUrl: '',
    balanceUSD: 0,
  },
  bookings: [],
  courses: [],
  reviews: [],
  onOpenLesson: vi.fn(),
  onWriteReview: vi.fn(),
  onContinueDevelopment: vi.fn(),
  onToggleRecommendation: vi.fn(),
  onSignOut: vi.fn(),
  onInvalidFile: vi.fn(),
  onUploadSuccess: vi.fn(),
  onUploadError: vi.fn(),
  skillProgress: {
    control: { percentage: 0 },
    speed: { percentage: 0 },
    technique: { percentage: 0 },
  },
} as const;

describe('student profile personal consolidation', () => {
  it('omits writable Personal information from the profile hub', () => {
    render(<StudentProfileHubPanel onGoToTab={vi.fn()} />);

    expect(screen.queryByText('scProfilePersonal')).not.toBeInTheDocument();
    expect(screen.getByText('scProfileParticipants')).toBeInTheDocument();
  });

  it('renders Participants panel for legacy profile_personal deep links', () => {
    render(<StudentProfilePersonalPanel {...(basePanelProps as never)} />);

    expect(screen.getByTestId('participants-panel')).toHaveTextContent(
      'participants:account_deep_link'
    );
    expect(screen.queryByText('scDisplayNameLabel')).not.toBeInTheDocument();
  });
});
