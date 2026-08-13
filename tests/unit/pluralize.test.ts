import { describe, expect, it } from 'vitest';
import { formatDurationLabel } from '../../src/lib/i18n/duration';
import { formatPointsCount, formatPointsGain, russianPlural } from '../../src/lib/i18n/pluralize';

describe('russianPlural', () => {
  it('picks one / few / many forms', () => {
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
  it('formats as XP in Russian', () => {
    expect(formatPointsCount(1, 'ru')).toBe('1 XP');
    expect(formatPointsCount(2, 'ru')).toBe('2 XP');
    expect(formatPointsCount(5, 'ru')).toBe('5 XP');
  });

  it('formats as XP in English', () => {
    expect(formatPointsCount(1, 'en')).toBe('1 XP');
    expect(formatPointsCount(2, 'en')).toBe('2 XP');
  });
});

describe('formatPointsGain', () => {
  it('formats signed XP for both languages', () => {
    expect(formatPointsGain(1, 'ru')).toBe('+1 XP');
    expect(formatPointsGain(2, 'ru')).toBe('+2 XP');
    expect(formatPointsGain(5, 'ru')).toBe('+5 XP');
    expect(formatPointsGain(1, 'en')).toBe('+1 XP');
    expect(formatPointsGain(2, 'en')).toBe('+2 XP');
  });
});

describe('formatDurationLabel', () => {
  it('pluralizes Russian lesson hours correctly', () => {
    expect(formatDurationLabel(1, 'ru')).toBe('1 час');
    expect(formatDurationLabel(2, 'ru')).toBe('2 часа');
    expect(formatDurationLabel(4, 'ru')).toBe('4 часа');
    expect(formatDurationLabel(5, 'ru')).toBe('5 часов');
    expect(formatDurationLabel(6, 'ru')).toBe('6 часов');
    expect(formatDurationLabel(11, 'ru')).toBe('11 часов');
    expect(formatDurationLabel(21, 'ru')).toBe('21 час');
  });

  it('formats English lesson hours', () => {
    expect(formatDurationLabel(1, 'en')).toBe('1 hour');
    expect(formatDurationLabel(6, 'en')).toBe('6 hours');
  });
});
