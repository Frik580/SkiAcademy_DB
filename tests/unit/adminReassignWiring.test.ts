import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('admin reassign instructor wiring', () => {
  it('wires handleReassignInstructor from bookings through admin schedule modal', () => {
    const bookingActionsSource = readFileSync(
      join(process.cwd(), 'src/features/bookings/useBookingActions.ts'),
      'utf8'
    );
    const bookingServiceSource = readFileSync(
      join(process.cwd(), 'src/features/bookings/bookingService.ts'),
      'utf8'
    );
    const routesSource = readFileSync(join(process.cwd(), 'src/app/routes/AppRoutes.tsx'), 'utf8');
    const modalSource = readFileSync(
      join(process.cwd(), 'src/components/admin/ScheduleSlotActionModal.tsx'),
      'utf8'
    );

    const moveFormSource = readFileSync(
      join(process.cwd(), 'src/components/admin/schedule_slot_modal/ActiveSlotMoveForm.tsx'),
      'utf8'
    );

    expect(bookingActionsSource).toContain('handleReassignInstructor');
    expect(bookingServiceSource + bookingActionsSource).toContain('instructorId: newInstructor.id');
    expect(routesSource).toContain('onReassignInstructor={handleReassignInstructor}');
    expect(modalSource).toContain('onReassignInstructor');
    expect(moveFormSource).toContain('reassignInstructor');
  });
});
