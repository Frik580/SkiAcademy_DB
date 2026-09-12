/** Formats canonical KZT minor/whole units for Admin finance display. */
export function formatCanonicalKztForDisplay(amountKzt: number): string {
  return `${amountKzt.toLocaleString('ru-RU')} ₸`;
}
