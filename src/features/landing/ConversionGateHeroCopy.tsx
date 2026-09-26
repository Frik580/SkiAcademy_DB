import type { Language } from '../../lib/i18n/translations';
import { getConversionGateCopy } from './conversionGateCopy';

interface ConversionGateHeroCopyProps {
  language: Language;
}

/** Above-the-fold headline, subline, hourly price, and optional course chip. */
export function ConversionGateHeroCopy({ language }: ConversionGateHeroCopyProps) {
  const copy = getConversionGateCopy(language);
  return (
    <div className="conversion-gate" data-testid="conversion-gate">
      <h1 className="conversion-gate-headline" data-testid="conversion-gate-headline">
        {copy.heroHeadline}
      </h1>
      <p className="conversion-gate-subline" data-testid="conversion-gate-subline">
        {copy.heroSubline}
      </p>
      <p className="conversion-gate-price" data-testid="conversion-gate-price">
        {copy.startingPrice}
      </p>
      {copy.courseBadge ? (
        <p className="conversion-gate-course" data-testid="conversion-gate-course">
          {copy.courseBadge}
        </p>
      ) : null}
    </div>
  );
}
