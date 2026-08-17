import '@testing-library/jest-dom/vitest';
import type { ReactNode } from 'react';
import { vi } from 'vitest';

vi.mock('../src/app/providers/CurrencyContext', () => ({
  useCurrency: () => ({
    currency: 'USD' as const,
    setCurrency: vi.fn(),
    usdToKztRate: 500,
    setUsdToKztRate: vi.fn(),
    formatPrice: (usdAmount: number) => `$${usdAmount.toLocaleString('en-US')}`,
    formatPriceRaw: (usdAmount: number) => ({
      amount: usdAmount,
      symbol: '$',
      code: 'USD',
      formatted: `$${usdAmount.toLocaleString('en-US')}`,
    }),
    convertPrice: (usdAmount: number) => usdAmount,
  }),
  CurrencyProvider: ({ children }: { children: ReactNode }) => children,
}));

if (typeof window !== 'undefined') {
  window.scrollTo = () => {};
}
