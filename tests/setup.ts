import '@testing-library/jest-dom/vitest';
import type { ReactNode } from 'react';
import { vi } from 'vitest';

vi.mock('../src/app/providers/CurrencyContext', () => ({
  useCurrency: () => ({
    currency: 'KZT' as const,
    formatPrice: (amountKzt: number) => `${amountKzt.toLocaleString('ru-RU')} ₸`,
    formatPriceRaw: (amountKzt: number) => ({
      amount: amountKzt,
      symbol: '₸',
      code: 'KZT' as const,
      formatted: `${amountKzt.toLocaleString('ru-RU')} ₸`,
    }),
    convertPrice: (amountKzt: number) => amountKzt,
  }),
  CurrencyProvider: ({ children }: { children: ReactNode }) => children,
}));

if (typeof window !== 'undefined') {
  window.scrollTo = () => {};
}
