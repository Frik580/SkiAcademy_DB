import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/features/landing/conversionGateCopy', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../src/features/landing/conversionGateCopy')>();
  return {
    ...actual,
    INSTAGRAM_URL: null,
  };
});

import { ConversionGateInstagramCta } from '../../src/features/landing/ConversionGateInstagramCta';

describe('Instagram CTA when the URL is null', () => {
  it('renders no contact link', () => {
    render(<ConversionGateInstagramCta language="ru" placement="header" />);

    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.queryByTestId('conversion-gate-instagram-header')).toBeNull();
    expect(screen.queryByText('Написать в Instagram')).toBeNull();
  });
});
