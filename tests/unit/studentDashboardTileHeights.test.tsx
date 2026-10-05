import { render, screen, act } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useStudentDashboardTileHeights } from '../../src/features/student-cabinet/components/student/useStudentDashboardTileHeights';
let callbacks: (() => void)[];
let observers: { observe: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> }[];
function Harness({ a = 100, b = 300, show = true, enabled = true }) {
  const ref = useRef<HTMLDivElement>(null);
  const heights = useStudentDashboardTileHeights(ref, enabled, show ? 'a,b' : 'b');
  return (
    <>
      <div ref={ref}>
        {show && (
          <div data-dashboard-tile="todayTasks" data-height={a}>
            <span>inner</span>
          </div>
        )}
        <div data-dashboard-tile="weather" data-height={b} />
      </div>
      <output data-testid="heights">{JSON.stringify(heights)}</output>
    </>
  );
}
beforeEach(() => {
  callbacks = [];
  observers = [];
  vi.useFakeTimers();
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
    return { height: Number(this.dataset.height ?? 0) } as DOMRect;
  });
  vi.stubGlobal('requestAnimationFrame', (callback: () => void) => setTimeout(callback, 16));
  vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id));
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe = vi.fn();
      disconnect = vi.fn();
      constructor(callback: () => void) {
        callbacks.push(callback);
        observers.push(this);
      }
    }
  );
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe('dashboard shell measurement ownership', () => {
  it('observes only outer shells with one observer, batches updates and ignores identical measurements', () => {
    const view = render(<Harness />);
    expect(observers).toHaveLength(1);
    expect(observers[0].observe).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId('heights')).toHaveTextContent('"todayTasks":100');
    view.rerender(<Harness a={180} />);
    act(() => {
      callbacks[0]();
      callbacks[0]();
      callbacks[0]();
      vi.advanceTimersByTime(16);
    });
    expect(screen.getByTestId('heights')).toHaveTextContent('"todayTasks":180');
    view.rerender(<Harness a={60} />);
    act(() => {
      callbacks[0]();
      vi.advanceTimersByTime(16);
    });
    expect(screen.getByTestId('heights')).toHaveTextContent('"todayTasks":60');
    act(() => {
      callbacks[0]();
      vi.advanceTimersByTime(16);
    });
    expect(observers).toHaveLength(1);
    view.unmount();
    expect(observers[0].disconnect).toHaveBeenCalledTimes(1);
  });
  it('purges hidden measurements and disconnects on tablet/mobile', () => {
    const view = render(<Harness />);
    view.rerender(<Harness show={false} />);
    expect(screen.getByTestId('heights')).not.toHaveTextContent('todayTasks');
    expect(observers[0].disconnect).toHaveBeenCalledTimes(1);
    view.rerender(<Harness enabled={false} />);
    expect(screen.getByTestId('heights')).toHaveTextContent('{}');
    expect(observers[1].disconnect).toHaveBeenCalledTimes(1);
  });
  it('does not measure or create an observer outside desktop', () => {
    render(<Harness enabled={false} />);
    expect(observers).toHaveLength(0);
    expect(HTMLElement.prototype.getBoundingClientRect).not.toHaveBeenCalled();
  });
});
