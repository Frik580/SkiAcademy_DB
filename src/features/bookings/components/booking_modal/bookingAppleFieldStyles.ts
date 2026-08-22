export const BOOKING_APPLE_TRIGGER_CLASS =
  'flex h-10 w-full items-center justify-between gap-2 rounded-[10px] border-0 bg-[rgba(120,120,128,0.12)] px-3 text-left text-sm text-[var(--ink)] transition-[background-color,box-shadow] duration-200 hover:bg-[rgba(120,120,128,0.16)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/30 disabled:cursor-not-allowed disabled:opacity-45 dark:bg-[rgba(120,120,128,0.24)] dark:hover:bg-[rgba(120,120,128,0.3)]';

export const BOOKING_APPLE_POPOVER_CLASS =
  'absolute z-20 mt-1.5 rounded-xl border border-[var(--border)] bg-[var(--card-bg)]/95 shadow-[0_12px_40px_rgba(0,0,0,0.12)] backdrop-blur-xl dark:shadow-[0_12px_40px_rgba(0,0,0,0.45)]';

/** Two visible lines; vertical scroll appears from the third line onward. */
export const BOOKING_NOTES_FIELD_CLASS =
  'ui-field-plain h-[calc(0.625rem*2+1.25rem*2+2px)] w-full resize-none overflow-y-auto text-xs leading-5 focus:border-[var(--accent)] focus:outline-none';
