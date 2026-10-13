// Native equivalent of the collapsed BookingAppleWheelPicker/BookingAppleDatePicker:
// their card-coloured center band fills the 40px frame, with a compact centered label.
// Keep the admin form's native select/date semantics and validation unchanged.
export const ADMIN_MODAL_CHOICE_CLASS =
  'h-10 w-full rounded-[10px] border border-[var(--border)] bg-[var(--card-bg)] px-3 text-center type-compact font-medium text-[var(--ink)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/30 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-45';
export const ADMIN_MODAL_FIELD_CLASS =
  'ui-field-plain focus:border-[var(--accent)] focus:outline-none';
export const ADMIN_MODAL_PRIMARY_CLASS = 'btn-primary min-w-0 flex-1 px-4 py-3';
export const ADMIN_MODAL_SECONDARY_CLASS = 'btn-secondary min-w-0 flex-1 px-4 py-3 type-button';
