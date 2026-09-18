import { describe, expect, it } from 'vitest';
import {
  DEFAULT_STARTER_CREDIT_KZT,
  MAX_STARTER_CREDIT_KZT,
  MIN_STARTER_CREDIT_KZT,
  normalizeStarterCreditKzt,
  resolveStarterCreditAmountKzt,
} from '../../src/domain/wallet/starterCredit';

describe('starter credit helpers', () => {
  it('defaults to a 250 KZT registration gift', () => {
    expect(DEFAULT_STARTER_CREDIT_KZT).toBe(250);
    expect(MIN_STARTER_CREDIT_KZT).toBe(0);
    expect(MAX_STARTER_CREDIT_KZT).toBe(10_000);
  });

  it('normalizes configured KZT amounts', () => {
    expect(normalizeStarterCreditKzt(100)).toBe(100);
    expect(normalizeStarterCreditKzt(0)).toBe(0);
    expect(normalizeStarterCreditKzt(-5)).toBe(0);
    expect(normalizeStarterCreditKzt(50_000)).toBe(10_000);
    expect(normalizeStarterCreditKzt('175.4')).toBe(175);
    expect(normalizeStarterCreditKzt('nope')).toBe(250);
  });

  it('reads only amountKzt and ignores amountUsd', () => {
    expect(resolveStarterCreditAmountKzt({ amountKzt: 500 })).toBe(500);
    expect(resolveStarterCreditAmountKzt({ amountKzt: 0 })).toBe(0);
    expect(resolveStarterCreditAmountKzt({ amountUsd: 175 } as { amountKzt?: unknown })).toBe(250);
    expect(resolveStarterCreditAmountKzt({})).toBe(250);
    expect(resolveStarterCreditAmountKzt(null)).toBe(250);
  });
});
