import { CONVERSION_GATE_COPY } from './conversionGateCopy';

interface ConversionGateHeroCopyProps {
  priceLine: string;
}

/** Persistent above-the-fold location, product, and starting price. Not slide copy. */
export function ConversionGateHeroCopy({ priceLine }: ConversionGateHeroCopyProps) {
  return (
    <div className="conversion-gate" data-testid="conversion-gate">
      <p className="conversion-gate-location" data-testid="conversion-gate-location">
        {CONVERSION_GATE_COPY.heroLocation}
      </p>
      <p className="conversion-gate-product" data-testid="conversion-gate-product">
        {CONVERSION_GATE_COPY.heroProduct}
      </p>
      <p className="conversion-gate-price" data-testid="conversion-gate-price">
        {priceLine}
      </p>
    </div>
  );
}
