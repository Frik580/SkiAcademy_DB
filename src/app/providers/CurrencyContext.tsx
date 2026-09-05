import React, { createContext, useContext } from 'react';

export type Currency = 'KZT';

interface CurrencyContextType {
  /** Always KZT — retained for call-site compatibility. */
  currency: Currency;
  formatPrice: (amountKzt: number, preferredKzt?: number) => string;
  formatPriceRaw: (
    amountKzt: number,
    preferredKzt?: number
  ) => {
    amount: number;
    symbol: string;
    code: 'KZT';
    formatted: string;
  };
  /** Resolves the KZT amount to display (prefers explicit KZT when provided). */
  convertPrice: (amountKzt: number, preferredKzt?: number) => number;
}

function resolveAmountKzt(amountKzt: number, preferredKzt?: number): number {
  if (preferredKzt !== undefined && preferredKzt !== null && Number.isFinite(preferredKzt)) {
    return preferredKzt;
  }
  return Number.isFinite(amountKzt) ? amountKzt : 0;
}

function formatKzt(amount: number): string {
  return `${amount.toLocaleString('ru-RU')} ₸`;
}

const CurrencyContext = createContext<CurrencyContextType | undefined>(undefined);

export const CurrencyProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const convertPrice = (amountKzt: number, preferredKzt?: number): number =>
    resolveAmountKzt(amountKzt, preferredKzt);

  const formatPrice = (amountKzt: number, preferredKzt?: number): string =>
    formatKzt(convertPrice(amountKzt, preferredKzt));

  const formatPriceRaw = (amountKzt: number, preferredKzt?: number) => {
    const amount = convertPrice(amountKzt, preferredKzt);
    return {
      amount,
      symbol: '₸',
      code: 'KZT' as const,
      formatted: formatKzt(amount),
    };
  };

  return (
    <CurrencyContext.Provider
      value={{
        currency: 'KZT',
        formatPrice,
        formatPriceRaw,
        convertPrice,
      }}
    >
      {children}
    </CurrencyContext.Provider>
  );
};

export const useCurrency = () => {
  const context = useContext(CurrencyContext);
  if (!context) {
    throw new Error('useCurrency must be used within a CurrencyProvider');
  }
  return context;
};
