import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('admin cancel wiring', () => {
  it('keeps client request cancel and admin immediate cancel handlers separate', () => {
    const routesSource = readFileSync(join(process.cwd(), 'src/app/routes/AppRoutes.tsx'), 'utf8');
    const bookingActionsSource = readFileSync(
      join(process.cwd(), 'src/features/bookings/useBookingActions.ts'),
      'utf8'
    );

    expect(routesSource).toContain('onCancel={handleRequestCancel}');
    expect(routesSource).toContain('onCancelBooking={handleCancel}');
    expect(bookingActionsSource).toContain('handleRequestCancel');
    expect(bookingActionsSource).toContain('handleCancel');
    expect(routesSource).not.toContain('onCancelBooking={onCancel}');
  });
});
