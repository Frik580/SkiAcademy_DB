import type { Language } from '../../lib/i18n/translations';

/**
 * No public Instagram contact link on the storefront until the exact URL is provided.
 * Leave this null. Do not invent a handle, instagram.com path, or ig.me link.
 * Null or blank hides every Instagram control.
 */
export const INSTAGRAM_URL: string | null = null;

/** Public storefront shows a rating block only when at least this many canonical reviews exist. */
export const PUBLIC_STOREFRONT_REVIEW_MIN = 1;

export interface ConversionGateStrings {
  heroHeadline: string;
  heroSubline: string;
  startingPrice: string;
  /** Exact optional chip. English was not supplied. */
  courseBadge: string | null;
  contactLabel: string;
  /** Sticky prompt. English was not supplied. */
  stickyPrompt: string | null;
  /** Caption beside the on-site book action when Instagram is the primary CTA. English was not supplied. */
  bookBeside: string | null;
  /** Hero secondary: on-site path to the instructor list. */
  heroSecondary: string;
  /** Instructor-card booking action. */
  bookAction: string;
}

const COPY: Record<Language, ConversionGateStrings> = {
  ru: {
    heroHeadline: 'Индивидуальные уроки на Шымбулаке',
    heroSubline: 'Лыжи и сноуборд · техника, прогресс и видеоразбор · Алматы',
    startingPrice: 'от 25 000 ₸/час',
    courseBadge: 'Шымбулак · Алматы · уроки от 25 000 ₸/час · курсы от 250 000 ₸',
    contactLabel: 'Написать в Instagram',
    stickyPrompt: 'Есть вопросы? Напишите в Instagram',
    bookBeside: 'Или забронировать онлайн',
    heroSecondary: 'Выбрать инструктора',
    bookAction: 'Забронировать',
  },
  en: {
    heroHeadline: 'Private ski & snowboard lessons at Shymbulak',
    heroSubline: 'Technique, progress tracking and video analysis · Almaty',
    startingPrice: 'from 25,000 ₸/hour',
    courseBadge: null,
    contactLabel: 'Message on Instagram',
    stickyPrompt: null,
    bookBeside: null,
    heroSecondary: 'Choose instructor',
    bookAction: 'Book a lesson',
  },
};

export function getConversionGateCopy(language: Language): ConversionGateStrings {
  return COPY[language];
}

function isInstagramHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return (
    host === 'instagram.com' ||
    host.endsWith('.instagram.com') ||
    host === 'ig.me' ||
    host.endsWith('.ig.me')
  );
}

/** Hides the CTA when the URL is missing or not an https Instagram link. */
export function resolveInstagramHref(url: string | null | undefined): string | null {
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
  if (!isInstagramHost(parsed.hostname)) return null;
  return parsed.toString();
}
