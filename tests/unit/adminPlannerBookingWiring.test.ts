import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('admin interactive planner wiring', () => {
  const boardSource = readFileSync(
    join(process.cwd(), 'src/features/admin/operations/AdminPlannerBoard.tsx'),
    'utf8'
  );
  const commandsSource = readFileSync(
    join(process.cwd(), 'src/features/admin/operations/adminPlannerCommands.ts'),
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
  const adminPanelSource = readFileSync(
    join(process.cwd(), 'src/features/admin/components/AdminPanel.tsx'),
    'utf8'
  );

  it('removes legacy planner creation from the active admin route', () => {
    expect(adminRouteSource).not.toContain('onAddBooking');
    expect(adminActionsSource).not.toContain('addBookingDirect');
    expect(adminActionsSource).not.toContain('handleAddBooking');
  });

  it('remounts the planner and routes slot actions to canonical commands', () => {
    expect(adminPanelSource).toContain('AdminPlannerBoard');
    expect(boardSource).toContain('createPlannerOccupancyFromLegacyBookingShape');
    expect(commandsSource).toContain("kind: 'create_administrative_availability_block'");
    expect(commandsSource).toContain("kind: 'create_confirmed_booking'");
    expect(commandsSource).not.toContain('addBookingDirect');
  });
});
