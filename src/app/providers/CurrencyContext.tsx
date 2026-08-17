import React, { createContext, useContext, useState, useEffect } from 'react';
import { db, doc, onSnapshot, setDoc } from '../../infrastructure/firebase/firebase';
import { logger } from '../../lib/logger';

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

const DEFAULT_CURRENCY: Currency = 'USD';
const DEFAULT_USD_TO_KZT_RATE = 500;
const CURRENCY_STORAGE_KEY = 'alpine_glide_currency';
const RATE_STORAGE_KEY = 'alpine_glide_usd_kzt_rate';

const isCurrency = (value: unknown): value is Currency => value === 'USD' || value === 'KZT';

const CurrencyContext = createContext<CurrencyContextType | undefined>(undefined);

export const CurrencyProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currency, setCurrencyState] = useState<Currency>(DEFAULT_CURRENCY);

  const [usdToKztRate, setUsdToKztRateState] = useState<number>(DEFAULT_USD_TO_KZT_RATE);

  useEffect(() => {
    try {
      const configRef = doc(db, 'resort_data', 'config');
      const unsub = onSnapshot(configRef, (snap) => {
        if (!snap.exists()) {
          setCurrencyState(DEFAULT_CURRENCY);
          localStorage.setItem(CURRENCY_STORAGE_KEY, DEFAULT_CURRENCY);
          return;
        }

        const data = snap.data();

        const serverCurrency = isCurrency(data?.currency) ? data.currency : DEFAULT_CURRENCY;
        setCurrencyState(serverCurrency);
        localStorage.setItem(CURRENCY_STORAGE_KEY, serverCurrency);

        if (typeof data?.usdToKztRate === 'number' && data.usdToKztRate > 0) {
          setUsdToKztRateState(data.usdToKztRate);
          localStorage.setItem(RATE_STORAGE_KEY, String(data.usdToKztRate));
        }
      });
      return () => unsub();
    } catch {
      // Fallback
    }
  }, []);

  const setCurrency = (curr: Currency) => {
    setCurrencyState(curr);
    setDoc(doc(db, 'resort_data', 'config'), { currency: curr }, { merge: true }).catch((err) => {
      logger.error('Failed to update currency in Firestore:', err);
    });
  };

  const setUsdToKztRate = (rate: number) => {
    if (rate > 0) {
      setUsdToKztRateState(rate);
      localStorage.setItem(RATE_STORAGE_KEY, String(rate));
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
