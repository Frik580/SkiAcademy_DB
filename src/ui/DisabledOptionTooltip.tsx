import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/** Focusable wrapper: native disabled controls cannot receive keyboard focus. */
export function DisabledOptionTooltip({
  children,
  message,
  label,
}: {
  readonly children: ReactNode;
  readonly message: string;
  readonly label: string;
}) {
  const id = useId();
  const trigger = useRef<HTMLSpanElement>(null);
  const tooltip = useRef<HTMLSpanElement>(null);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [position, setPosition] = useState({ left: 8, top: 8 });
  const visible = (hovered || focused) && !dismissed;

  useEffect(() => {
    if (!visible) return;
    const update = () => {
      const anchor = trigger.current?.getBoundingClientRect();
      const tip = tooltip.current?.getBoundingClientRect();
      if (!anchor || !tip) return;
      setPosition({
        left: Math.max(8, Math.min(anchor.left, window.innerWidth - tip.width - 8)),
        top: Math.max(
          8,
          anchor.top >= tip.height + 16
            ? anchor.top - tip.height - 8
            : Math.min(anchor.bottom + 8, window.innerHeight - tip.height - 8)
        ),
      });
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [visible, message]);

  // A focusable group deliberately wraps a native disabled button so its explanation is reachable.
  /* eslint-disable jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex */
  return (
    <span
      ref={trigger}
      tabIndex={0}
      role="group"
      aria-label={label}
      aria-disabled="true"
      aria-describedby={visible ? id : undefined}
      className="inline-flex max-w-full cursor-not-allowed rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
      onMouseEnter={() => {
        setHovered(true);
        setDismissed(false);
      }}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => {
        setFocused(true);
        setDismissed(false);
      }}
      onBlur={() => setFocused(false)}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          setDismissed(true);
          event.stopPropagation();
        }
      }}
    >
      {children}
      {visible &&
        createPortal(
          <span
            ref={tooltip}
            id={id}
            role="tooltip"
            className="pointer-events-none fixed z-[100] max-w-[min(20rem,calc(100vw-1rem))] rounded-lg border border-[var(--border-subtle)] bg-[var(--card-bg)] px-3 py-2 type-caption text-[var(--ink)] shadow-lg"
            style={position}
          >
            {message}
          </span>,
          document.body
        )}
    </span>
  );
}
