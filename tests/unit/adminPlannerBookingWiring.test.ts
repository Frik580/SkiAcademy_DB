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

  it('keeps planner create actions behind the admin route and addBooking handler', () => {
    expect(adminRouteSource).toContain('onAddBooking={handleAddBooking}');
    expect(adminActionsSource).toContain('addBookingDirect');
    expect(adminActionsSource).toContain('handleAddBooking');
  });

  it('builds break, day off, and client lesson payloads for onAddBooking', () => {
    expect(modalSource).toContain("userId: 'system_block_break'");
    expect(modalSource).toContain("userId: 'system_block_day_off'");
    expect(modalSource).toContain("time: '08:00'");
    expect(modalSource).toContain('durationHours: 11');
    expect(modalSource).toContain('userId: selectedClientUid');
    expect(modalSource).toContain('await onAddBooking(newBlock)');
    expect(modalSource).toContain('await onAddBooking(newBooking)');
  });
});
