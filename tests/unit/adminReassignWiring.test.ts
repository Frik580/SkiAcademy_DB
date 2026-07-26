import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('admin reassign instructor wiring', () => {
  it('wires handleReassignInstructor from bookings through admin schedule modal', () => {
    const bookingsSource = readFileSync(
      join(process.cwd(), 'src/components/useBookings.ts'),
      'utf8'
    );
    const appSource = readFileSync(join(process.cwd(), 'src/App.tsx'), 'utf8');
    const routesSource = readFileSync(join(process.cwd(), 'src/components/AppRoutes.tsx'), 'utf8');
    const modalSource = readFileSync(
      join(process.cwd(), 'src/components/admin/ScheduleSlotActionModal.tsx'),
      'utf8'
    );

    expect(bookingsSource).toContain('handleReassignInstructor');
    expect(bookingsSource).toContain('instructorId: updatedBooking.instructorId');
    expect(appSource).toContain('onReassignInstructor={handleReassignInstructor}');
    expect(routesSource).toContain('onReassignInstructor={onReassignInstructor}');
    expect(modalSource).toContain('onReassignInstructor');
    expect(modalSource).toContain('reassignInstructor');
  });
});
