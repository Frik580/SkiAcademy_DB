import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('admin cancel wiring', () => {
  it('keeps client request cancel and admin immediate cancel handlers separate', () => {
    const cabinetRouteSource = readFileSync(
      join(process.cwd(), 'src/app/routes/CabinetRouteContainer.tsx'),
      'utf8'
    );
    const adminRouteSource = readFileSync(
      join(process.cwd(), 'src/app/routes/AdminRouteContainer.tsx'),
      'utf8'
    );
    const bookingActionsSource = readFileSync(
      join(process.cwd(), 'src/features/bookings/useBookingActions.ts'),
      'utf8'
    );

    expect(cabinetRouteSource).toContain('onCancel={handleRequestCancel}');
    expect(adminRouteSource).toContain('onCancelBooking={handleCancelBooking}');
    expect(bookingActionsSource).toContain('handleRequestCancel');
    expect(bookingActionsSource).toContain('handleCancel');
    expect(adminRouteSource).not.toContain('onCancelBooking={onCancel}');
  });
});
