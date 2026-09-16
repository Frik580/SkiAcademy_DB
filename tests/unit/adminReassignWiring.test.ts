import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('admin reassign instructor wiring', () => {
  it('keeps leftover reassignment outside the active Admin route', () => {
    expect(existsSync(join(process.cwd(), 'src/features/bookings/useBookingActions.ts'))).toBe(
      false
    );
    expect(existsSync(join(process.cwd(), 'src/features/bookings/bookingService.ts'))).toBe(false);

    const adminRouteSource = readFileSync(
      join(process.cwd(), 'src/app/routes/AdminRouteContainer.tsx'),
      'utf8'
    );
    const modalSource = readFileSync(
      join(process.cwd(), 'src/features/admin/components/schedule/ScheduleSlotActionModal.tsx'),
      'utf8'
    );
    const moveFormSource = readFileSync(
      join(
        process.cwd(),
        'src/features/admin/components/schedule/slot-modal/ActiveSlotMoveForm.tsx'
      ),
      'utf8'
    );

    expect(adminRouteSource).not.toContain('onReassignInstructor');
    expect(adminRouteSource).not.toContain('handleReassignInstructor');
    expect(modalSource).toContain('onReassignInstructor');
    expect(moveFormSource).toContain('reassignInstructor');
  });
});
