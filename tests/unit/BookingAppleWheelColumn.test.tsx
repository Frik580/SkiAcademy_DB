/**
 * Tests that BookingAppleWheelColumn correctly updates rendered items when
 * the options prop changes (async occupancy load scenario).
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { BookingAppleWheelColumn } from '../../src/features/bookings/components/booking_modal/BookingAppleWheelColumn';
import type { BookingAppleWheelOption } from '../../src/features/bookings/components/booking_modal/BookingAppleWheelPicker';

function makeOptions(times: string[]): BookingAppleWheelOption[] {
  return times.map((t) => ({ value: t, label: t }));
}

describe('BookingAppleWheelColumn', () => {
  it('keeps an explicit selection when scrollend arrives before smooth scrolling finishes', () => {
    const options = makeOptions(['Beginner', 'Intermediate', 'Advanced']);
    const onChange = vi.fn();
    function ControlledWheel() {
      const [value, setValue] = React.useState('Advanced');
      return (
        <BookingAppleWheelColumn
          value={value}
          options={options}
          onChange={(next) => {
            onChange(next);
            setValue(next);
          }}
          isOpen
        />
      );
    }
    const { container } = render(<ControlledWheel />);
    const wheel = container.firstElementChild as HTMLDivElement;
    wheel.scrollTop = 80;
    // A smooth scroll does not synchronously move away from the previous position.
    wheel.scrollTo = vi.fn((settings?: ScrollToOptions | number) => {
      if (typeof settings === 'object' && settings.behavior !== 'smooth') {
        wheel.scrollTop = settings.top ?? 0;
      }
    });

    fireEvent.click(screen.getByRole('button', { name: 'Intermediate', exact: true }));
    fireEvent(wheel, new Event('scrollend'));

    expect(onChange).toHaveBeenCalled();
    expect(onChange.mock.calls.every(([value]) => value === 'Intermediate')).toBe(true);
  });

  it('renders only enabled options', () => {
    const options: BookingAppleWheelOption[] = [
      { value: '08:00', label: '08:00' },
      { value: '09:00', label: '09:00' },
      { value: '', label: 'Loading...', disabled: true },
    ];
    render(
      <BookingAppleWheelColumn value="08:00" options={options} onChange={vi.fn()} isOpen={true} />
    );
    expect(screen.getByText('08:00')).toBeInTheDocument();
    expect(screen.getByText('09:00')).toBeInTheDocument();
    expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
  });

  it('removes 10:00 from rendered items when options update (async occupancy)', () => {
    const fullOptions = makeOptions(['08:00', '09:00', '10:00', '11:00']);
    const onChange = vi.fn();

    const { rerender } = render(
      <BookingAppleWheelColumn
        value="08:00"
        options={fullOptions}
        onChange={onChange}
        isOpen={true}
      />
    );

    expect(screen.getByText('10:00')).toBeInTheDocument();

    const filteredOptions = makeOptions(['08:00', '09:00', '11:00']);
    rerender(
      <BookingAppleWheelColumn
        value="08:00"
        options={filteredOptions}
        onChange={onChange}
        isOpen={true}
      />
    );

    expect(screen.queryByText('10:00')).not.toBeInTheDocument();
    expect(screen.getByText('08:00')).toBeInTheDocument();
    expect(screen.getByText('09:00')).toBeInTheDocument();
    expect(screen.getByText('11:00')).toBeInTheDocument();
  });

  it('renders nothing when all options are disabled', () => {
    const options: BookingAppleWheelOption[] = [{ value: '', label: 'Loading...', disabled: true }];
    const { container } = render(
      <BookingAppleWheelColumn value="" options={options} onChange={vi.fn()} isOpen={true} />
    );
    expect(container.querySelectorAll('button')).toHaveLength(0);
  });

  it('busy slot does not appear as disabled in DOM — it is completely absent', () => {
    const options = makeOptions(['08:00', '09:00', '11:00']);
    const { container } = render(
      <BookingAppleWheelColumn value="08:00" options={options} onChange={vi.fn()} isOpen={true} />
    );

    const buttons = Array.from(container.querySelectorAll('button'));
    const labels = buttons.map((b) => b.textContent);
    expect(labels).not.toContain('10:00');
    expect(labels).toContain('08:00');
    expect(labels).toContain('09:00');
    expect(labels).toContain('11:00');
  });
});
