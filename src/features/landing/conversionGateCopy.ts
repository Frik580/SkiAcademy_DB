import type { Language } from '../../lib/i18n/translations';

/**
 * No public WhatsApp on the storefront for now.
 * Leave this null. Do not invent a wa.me link or a phone number.
 * Null or blank hides every WhatsApp control.
 */
export const WHATSAPP_URL: string | null = null;

/** Public storefront shows a rating block only when at least this many canonical reviews exist. */
export const PUBLIC_STOREFRONT_REVIEW_MIN = 1;

export interface ConversionGateStrings {
  heroHeadline: string;
  heroSubline: string;
  startingPrice: string;
  /** Exact optional chip. English was not supplied. */
  courseBadge: string | null;
  waLabel: string;
  /** Sticky prompt. English was not supplied. */
  waStickyPrompt: string | null;
  /** Caption beside Book Lesson when WhatsApp is the primary CTA. English was not supplied. */
  bookBesideWa: string | null;
  heroSecondary: string;
}

const COPY: Record<Language, ConversionGateStrings> = {
  ru: {
    heroHeadline: 'Индивидуальные уроки на Шымбулаке',
    heroSubline: 'Лыжи и сноуборд · техника, прогресс и видеоразбор · Алматы',
    startingPrice: 'от 25 000 ₸/час',
    courseBadge: 'Шымбулак · Алматы · уроки от 25 000 ₸/час · курсы от 250 000 ₸',
    waLabel: 'Написать в WhatsApp',
    waStickyPrompt: 'Есть вопросы? Напишите в WhatsApp',
    bookBesideWa: 'Или забронировать онлайн',
    heroSecondary: 'Выбрать урок',
  },
  en: {
    heroHeadline: 'Private ski & snowboard lessons at Shymbulak',
    heroSubline: 'Technique, progress tracking and video analysis · Almaty',
    startingPrice: 'from 25,000 ₸/hour',
    courseBadge: null,
    waLabel: 'Message on WhatsApp',
    waStickyPrompt: null,
    bookBesideWa: null,
    heroSecondary: 'Book Lesson',
  },
};

export function getConversionGateCopy(language: Language): ConversionGateStrings {
  return COPY[language];
}

const WHATSAPP_HOSTS = new Set(['wa.me', 'api.whatsapp.com', 'web.whatsapp.com']);

/** Hides the CTA when the URL is missing or not an https WhatsApp link. */
export function resolveWhatsAppHref(url: string | null | undefined): string | null {
  if (url == null) return null;
  const trimmed = url.trim();
  if (!trimmed || trimmed.includes('GROWTH_COPY')) return null;
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:') return null;
  if (!WHATSAPP_HOSTS.has(parsed.hostname)) return null;
  return parsed.toString();
}
