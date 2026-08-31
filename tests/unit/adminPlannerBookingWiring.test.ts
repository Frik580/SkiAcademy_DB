import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('admin interactive planner wiring', () => {
  const modalSource = readFileSync(
    join(process.cwd(), 'src/features/admin/components/schedule/ScheduleSlotActionModal.tsx'),
    'utf8'
  );
  const adminRouteSource = readFileSync(
    join(process.cwd(), 'src/app/routes/AdminRouteContainer.tsx'),
    'utf8'
  );
  const adminActionsSource = readFileSync(
    join(process.cwd(), 'src/features/admin/useAdminActions.ts'),
    'utf8'
  );

  it('removes legacy planner creation from the active admin route', () => {
    expect(adminRouteSource).not.toContain('onAddBooking');
    expect(adminActionsSource).not.toContain('addBookingDirect');
    expect(adminActionsSource).not.toContain('handleAddBooking');
  });

  it('leaves the inactive legacy modal implementation isolated', () => {
    expect(modalSource).toContain("userId: 'system_block_break'");
    expect(modalSource).toContain("userId: 'system_block_day_off'");
    expect(modalSource).toContain("time: '08:00'");
    expect(modalSource).toContain('durationHours: 11');
    expect(modalSource).toContain('userId: selectedClientUid');
    expect(modalSource).toContain('await onAddBooking(newBlock)');
    expect(modalSource).toContain('await onAddBooking(newBooking)');
  });
});
