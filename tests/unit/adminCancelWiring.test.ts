import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('admin cancel wiring', () => {
  it('keeps client request cancel and admin immediate cancel handlers separate', () => {
    const routesSource = readFileSync(join(process.cwd(), 'src/components/AppRoutes.tsx'), 'utf8');
    const bookingStoreSource = readFileSync(join(process.cwd(), 'src/store/bookingStore.ts'), 'utf8');

    expect(routesSource).toContain('onCancel={handleRequestCancel}');
    expect(routesSource).toContain('onCancelBooking={handleCancel}');
    expect(bookingStoreSource).toContain('handleRequestCancel');
    expect(bookingStoreSource).toContain('handleCancel');
    expect(routesSource).not.toContain('onCancelBooking={onCancel}');
  });
});
