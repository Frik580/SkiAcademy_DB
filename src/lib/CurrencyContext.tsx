import React, { createContext, useContext, useState, useEffect } from 'react';
import { db, doc, onSnapshot } from './firebase';

export type Currency = 'USD' | 'KZT';

interface CurrencyContextType {
  currency: Currency;
  setCurrency: (curr: Currency) => void;
  usdToKztRate: number;
  setUsdToKztRate: (rate: number) => void;
  formatPrice: (usdAmount: number, kztAmount?: number) => string;
  formatPriceRaw: (
    usdAmount: number,
    kztAmount?: number
  ) => { amount: number; symbol: string; code: string; formatted: string };
  convertPrice: (usdAmount: number, kztAmount?: number) => number;
}

const DEFAULT_USD_TO_KZT_RATE = 500;

const CurrencyContext = createContext<CurrencyContextType | undefined>(undefined);

export const CurrencyProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currency, setCurrencyState] = useState<Currency>(() => {
    const saved = localStorage.getItem('alpine_glide_currency');
    return saved === 'KZT' || saved === 'USD' ? saved : 'USD';
  });

  const [usdToKztRate, setUsdToKztRateState] = useState<number>(() => {
    const savedRate = localStorage.getItem('alpine_glide_usd_kzt_rate');
    const parsed = savedRate ? parseFloat(savedRate) : NaN;
    return !isNaN(parsed) && parsed > 0 ? parsed : DEFAULT_USD_TO_KZT_RATE;
  });

  useEffect(() => {
    try {
      const configRef = doc(db, 'resort_data', 'config');
      const unsub = onSnapshot(configRef, (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          if (data && typeof data.usdToKztRate === 'number' && data.usdToKztRate > 0) {
            setUsdToKztRateState(data.usdToKztRate);
            localStorage.setItem('alpine_glide_usd_kzt_rate', String(data.usdToKztRate));
          }
        }
      });
      return () => unsub();
    } catch {
      // Fallback
    }
  }, []);

  const setCurrency = (curr: Currency) => {
    setCurrencyState(curr);
    localStorage.setItem('alpine_glide_currency', curr);
  };

  const setUsdToKztRate = (rate: number) => {
    if (rate > 0) {
      setUsdToKztRateState(rate);
      localStorage.setItem('alpine_glide_usd_kzt_rate', String(rate));
    }
  };

  const convertPrice = (usdAmount: number, kztAmount?: number): number => {
    if (currency === 'USD') {
      return usdAmount;
    }
    if (kztAmount !== undefined && kztAmount !== null && kztAmount > 0) {
      return kztAmount;
    }
    return Math.round(usdAmount * usdToKztRate);
  };

  const formatPrice = (usdAmount: number, kztAmount?: number): string => {
    if (currency === 'USD') {
      return `$${usdAmount.toLocaleString('en-US')}`;
    } else {
      const kzt = convertPrice(usdAmount, kztAmount);
      return `${kzt.toLocaleString('ru-RU')} ₸`;
    }
  };

  const formatPriceRaw = (usdAmount: number, kztAmount?: number) => {
    if (currency === 'USD') {
      return {
        amount: usdAmount,
        symbol: '$',
        code: 'USD',
        formatted: `$${usdAmount.toLocaleString('en-US')}`,
      };
    } else {
      const amount = convertPrice(usdAmount, kztAmount);
      return {
        amount,
        symbol: '₸',
        code: 'KZT',
        formatted: `${amount.toLocaleString('ru-RU')} ₸`,
      };
    }
  };

  return (
    <CurrencyContext.Provider
      value={{
        currency,
        setCurrency,
        usdToKztRate,
        setUsdToKztRate,
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
