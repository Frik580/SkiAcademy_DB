import { cleanup, render, screen, act } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useBreakpoint } from '../../src/features/journey/components/useBreakpoint';

const initialWidth = window.innerWidth;
afterEach(() => {
  cleanup();
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: initialWidth });
  vi.restoreAllMocks();
});
describe('Journey original viewport responsiveness', () => {
  it('uses viewport breakpoints independently of the width of its containing block', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280 });
    const removeListener = vi.spyOn(window, 'removeEventListener');
    function Harness() {
      const breakpoint = useBreakpoint();
      return (
        <div style={{ width: 320 }} data-testid="breakpoint">
          {breakpoint}
        </div>
      );
    }
    const view = render(<Harness />);
    expect(screen.getByTestId('breakpoint')).toHaveTextContent('desktop');
    for (const [width, expected] of [
      [639, 'mobile'],
      [640, 'tablet'],
      [1023, 'tablet'],
      [1024, 'desktop'],
    ] as const) {
      act(() => {
        Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
        window.dispatchEvent(new Event('resize'));
      });
      expect(screen.getByTestId('breakpoint')).toHaveTextContent(expected);
    }
    view.unmount();
    expect(removeListener).toHaveBeenCalledWith('resize', expect.any(Function));
  });
});
