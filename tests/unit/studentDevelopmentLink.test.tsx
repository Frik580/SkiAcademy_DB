import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { StudentDevelopmentLink } from '../../src/ui/StudentDevelopmentLink';
import { translations } from '../../src/lib/i18n/translations';

afterEach(cleanup);

it.each([
  ['en', 'Go to Development'],
  ['ru', 'Перейти к развитию'],
] as const)('renders the shared %s label and Development destination', (language, label) => {
  expect(translations[language].studentDevelopmentLink).toBe(label);
  render(<StudentDevelopmentLink label={translations[language].studentDevelopmentLink} />);

  const link = screen.getByRole('link', { name: label });
  expect(link).toHaveAttribute('href', '/cabinet/development');
  expect(link).toHaveClass('student-development-link');
  expect(link.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
});

it('uses SPA navigation for ordinary clicks and leaves modified clicks to the browser', async () => {
  const onNavigate = vi.fn();
  const defaultPreventedStates: boolean[] = [];
  const user = userEvent.setup();
  render(
    <div
      onClick={(event) => {
        defaultPreventedStates.push(event.defaultPrevented);
        if ((event.nativeEvent as MouseEvent).ctrlKey) event.preventDefault();
      }}
    >
      <StudentDevelopmentLink label="Go to Development" onNavigate={onNavigate} />
    </div>
  );

  const link = screen.getByRole('link', { name: 'Go to Development' });
  await user.click(link);
  expect(onNavigate).toHaveBeenCalledOnce();

  fireEvent.click(link, { button: 0, ctrlKey: true });
  expect(onNavigate).toHaveBeenCalledOnce();
  expect(defaultPreventedStates).toEqual([true, false]);
});

it('is reachable with Tab, activates with Enter, and can stop Journey card click propagation', async () => {
  const onNavigate = vi.fn();
  const onParentClick = vi.fn();
  const user = userEvent.setup();
  render(
    <div onClick={onParentClick}>
      <StudentDevelopmentLink label="Go to Development" onNavigate={onNavigate} stopPropagation />
    </div>
  );

  const link = screen.getByRole('link', { name: 'Go to Development' });
  await user.tab();
  expect(link).toHaveFocus();
  await user.keyboard('{Enter}');

  expect(onNavigate).toHaveBeenCalledOnce();
  expect(onParentClick).not.toHaveBeenCalled();
});
