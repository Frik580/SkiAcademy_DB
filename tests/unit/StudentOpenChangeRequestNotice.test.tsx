import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/features/booking-collaboration/useBookingCollaborationTranslations', () => ({
  useBookingCollaborationTranslations: () => ({
    instructorRequestedScheduleChange: 'The instructor requested a schedule change',
    waitingAdminDecision: 'Waiting for an administrator decision',
  }),
}));

import { StudentOpenChangeRequestNotice } from '../../src/features/booking-collaboration/components/StudentOpenChangeRequestNotice';

describe('StudentOpenChangeRequestNotice', () => {
  it('shows an informational pending-admin status without an approval action', () => {
    render(<StudentOpenChangeRequestNotice />);
    expect(screen.getByText('The instructor requested a schedule change')).toBeInTheDocument();
    expect(screen.getByText('Waiting for an administrator decision')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
