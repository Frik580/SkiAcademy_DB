interface GuestReservationLimitAlertProps {
  title: string;
  description: string;
}

export function GuestReservationLimitAlert({
  title,
  description,
}: GuestReservationLimitAlertProps) {
  return (
    <div
      role="alert"
      className="rounded-[var(--radius-md)] border border-rose-500/40 bg-rose-500/10 px-3 py-2.5 text-sm text-[var(--ink)]"
    >
      <p className="font-semibold">{title}</p>
      <p className="mt-1 text-xs leading-relaxed">{description}</p>
    </div>
  );
}
