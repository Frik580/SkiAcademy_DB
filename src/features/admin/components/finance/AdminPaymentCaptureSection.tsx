export type AdminPayableSubject =
  | {
      readonly kind: 'lesson_booking';
      readonly subjectId: string;
    }
  | {
      readonly kind: 'course_enrollment';
      readonly subjectId: string;
    };

export function AdminPaymentCaptureSection({
  canRecordPayment,
  amount,
  outstanding,
  onAmountChange,
  onRecord,
  amountLabel,
  recordLabel,
  inputId,
}: {
  readonly canRecordPayment: boolean;
  readonly amount: string;
  readonly outstanding: number;
  readonly onAmountChange: (value: string) => void;
  readonly onRecord: () => void;
  readonly amountLabel: string;
  readonly recordLabel: string;
  readonly inputId: string;
}) {
  if (!canRecordPayment) return null;
  const parsed = Number(amount);
  const valid = Number.isInteger(parsed) && parsed >= 1 && parsed <= outstanding;
  return (
    <div className="space-y-2 border-t border-[var(--border)] pt-3">
      <label htmlFor={inputId} className="block text-xs">
        {amountLabel}
        <input
          id={inputId}
          aria-label={amountLabel}
          type="number"
          inputMode="numeric"
          min="1"
          max={outstanding}
          step="1"
          value={amount}
          onChange={(event) => onAmountChange(event.target.value)}
          className="mt-1 w-full border border-[var(--border)] bg-transparent p-2 tabular-nums"
        />
      </label>
      <button
        type="button"
        disabled={!valid}
        onClick={onRecord}
        className="w-full border border-[var(--ink)] bg-[var(--ink)] px-3 py-2 text-xs text-[var(--bg)] disabled:opacity-50"
      >
        {recordLabel}
      </button>
    </div>
  );
}
