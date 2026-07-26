import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('admin cancel wiring', () => {
  it('keeps client request cancel and admin immediate cancel handlers separate', () => {
    const appSource = readFileSync(join(process.cwd(), 'src/App.tsx'), 'utf8');
    const routesSource = readFileSync(join(process.cwd(), 'src/components/AppRoutes.tsx'), 'utf8');

    expect(appSource).toContain('onCancel={handleRequestCancel}');
    expect(appSource).toContain('onCancelBooking={handleCancel}');
    expect(routesSource).toContain('onCancelBooking: (id: string) => Promise<void>');
    expect(routesSource).toContain('onCancelBooking={onCancelBooking}');
    expect(routesSource).not.toContain('onCancelBooking={onCancel}');
  });
});
