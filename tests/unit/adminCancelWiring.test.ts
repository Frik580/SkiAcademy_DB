import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('admin cancel wiring', () => {
  it('keeps canonical client cancellation and removes leftover Admin cancellation', () => {
    const cabinetRouteSource = readFileSync(
      join(process.cwd(), 'src/app/routes/CabinetRouteContainer.tsx'),
      'utf8'
    );
    const adminRouteSource = readFileSync(
      join(process.cwd(), 'src/app/routes/AdminRouteContainer.tsx'),
      'utf8'
    );

    expect(existsSync(join(process.cwd(), 'src/features/bookings/useBookingActions.ts'))).toBe(
      false
    );
    expect(cabinetRouteSource).toContain('onCancel={handleCanonicalCancel}');
    expect(cabinetRouteSource).toContain('useLessonBookingCommands');
    expect(cabinetRouteSource).toContain('requestCancellation');
    expect(cabinetRouteSource).not.toContain('handleRequestCancel');
    expect(adminRouteSource).not.toContain('onCancelBooking');
    expect(adminRouteSource).not.toContain('handleCancelBooking');
    expect(adminRouteSource).not.toContain('onCancelBooking={onCancel}');
  });
});
