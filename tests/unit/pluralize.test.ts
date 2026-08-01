import { describe, expect, it } from 'vitest';
import { formatPointsCount, formatPointsGain, russianPlural } from '../../src/lib/i18n/pluralize';

describe('russianPlural', () => {
  it('declines балл correctly', () => {
    expect(russianPlural(1, ['балл', 'балла', 'баллов'])).toBe('балл');
    expect(russianPlural(2, ['балл', 'балла', 'баллов'])).toBe('балла');
    expect(russianPlural(3, ['балл', 'балла', 'баллов'])).toBe('балла');
    expect(russianPlural(4, ['балл', 'балла', 'баллов'])).toBe('балла');
    expect(russianPlural(5, ['балл', 'балла', 'баллов'])).toBe('баллов');
    expect(russianPlural(11, ['балл', 'балла', 'баллов'])).toBe('баллов');
    expect(russianPlural(21, ['балл', 'балла', 'баллов'])).toBe('балл');
    expect(russianPlural(22, ['балл', 'балла', 'баллов'])).toBe('балла');
  });
});

describe('formatPointsCount', () => {
  it('formats Russian points with correct endings', () => {
    expect(formatPointsCount(1, 'ru')).toBe('1 балл');
    expect(formatPointsCount(2, 'ru')).toBe('2 балла');
    expect(formatPointsCount(5, 'ru')).toBe('5 баллов');
  });

  it('formats English points', () => {
    expect(formatPointsCount(1, 'en')).toBe('1 point');
    expect(formatPointsCount(2, 'en')).toBe('2 points');
  });
});

describe('formatPointsGain', () => {
  it('prefixes formatted count with plus', () => {
    expect(formatPointsGain(1, 'ru')).toBe('+1 балл');
    expect(formatPointsGain(2, 'ru')).toBe('+2 балла');
    expect(formatPointsGain(5, 'ru')).toBe('+5 баллов');
    expect(formatPointsGain(1, 'en')).toBe('+1 point');
    expect(formatPointsGain(2, 'en')).toBe('+2 points');
  });
});
