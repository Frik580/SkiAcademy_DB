import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ActionButton } from '../../src/ui/ActionButton';

function querySpinner(button: HTMLElement): SVGElement | null {
  return button.querySelector('svg[aria-hidden="true"]');
}

describe('ActionButton', () => {
  it('renders enabled children without aria-busy in the idle state', () => {
    render(<ActionButton>Записаться</ActionButton>);

    const button = screen.getByRole('button', { name: 'Записаться' });
    expect(button).toBeEnabled();
    expect(button).not.toHaveAttribute('aria-busy');
    expect(button).toHaveTextContent('Записаться');
    expect(querySpinner(button)).toBeNull();
  });

  it('disables the button, sets aria-busy, and replaces children with pendingLabel', () => {
    render(
      <ActionButton pending pendingLabel="Отправка...">
        Записаться
      </ActionButton>
    );

    const button = screen.getByRole('button', { name: 'Отправка...' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button).toHaveTextContent('Отправка...');
    expect(screen.queryByText('Записаться')).not.toBeInTheDocument();
    const spinner = querySpinner(button);
    expect(spinner).not.toBeNull();
    expect(spinner).toHaveClass('animate-spin');
  });

  it('keeps a caller-disabled button disabled when pending is false', () => {
    render(<ActionButton disabled>Записаться</ActionButton>);

    const button = screen.getByRole('button', { name: 'Записаться' });
    expect(button).toBeDisabled();
    expect(button).not.toHaveAttribute('aria-busy');
    expect(querySpinner(button)).toBeNull();
  });

  it('stays disabled when both pending and disabled are set', () => {
    render(
      <ActionButton pending disabled pendingLabel="Отправка...">
        Записаться
      </ActionButton>
    );

    const button = screen.getByRole('button', { name: 'Отправка...' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
  });

  it('keeps children next to the spinner when pendingLabel is omitted', () => {
    render(<ActionButton pending>Записаться</ActionButton>);

    const button = screen.getByRole('button', { name: 'Записаться' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button).toHaveTextContent('Записаться');
    expect(querySpinner(button)).not.toBeNull();
  });
});
