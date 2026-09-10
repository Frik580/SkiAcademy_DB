import React from 'react';
import { Loader2 } from 'lucide-react';

export interface ActionButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md';
  /**
   * Feature-owned in-flight flag for a server command. The button does not
   * execute promises; the caller remains the source of truth.
   */
  pending?: boolean;
  /** Replaces children while pending. If omitted, children stay next to the spinner. */
  pendingLabel?: React.ReactNode;
  /**
   * Skip built-in variant/size chrome so `className` owns the look
   * (custom CTAs, attendance toggles, collaboration chips).
   * `btn-primary` / `btn-primary-hero` also skip chrome automatically.
   */
  unstyled?: boolean;
}

function callerOwnsChrome(className: string, unstyled?: boolean): boolean {
  if (unstyled) return true;
  return /(?:^|\s)btn-primary(?:-hero)?(?:\s|$)/.test(className);
}

export const ActionButton: React.FC<ActionButtonProps> = ({
  variant = 'secondary',
  size = 'md',
  className = '',
  type = 'button',
  pending = false,
  pendingLabel,
  unstyled = false,
  disabled,
  children,
  ...props
}) => {
  const isPending = Boolean(pending);
  const isDisabled = Boolean(disabled) || isPending;
  const ownsChrome = callerOwnsChrome(className, unstyled);
  const variants = {
    primary: 'border-[var(--ink)] bg-[var(--ink)] text-[var(--bg)] hover:opacity-85',
    secondary: 'border-[var(--border)] text-[var(--ink)] hover:border-[var(--ink)]',
    danger: 'border-rose-500/50 text-rose-600 hover:border-rose-500 hover:bg-rose-500/10',
    ghost: 'border-transparent text-[var(--ink-dim)] hover:text-[var(--ink)] hover:bg-black/5',
  }[variant];
  const sizes = size === 'sm' ? 'px-3 py-1.5 text-xs' : 'px-4 py-2 text-sm';
  const chrome = ownsChrome
    ? 'inline-flex items-center justify-center gap-2 transition disabled:cursor-not-allowed'
    : `inline-flex items-center justify-center gap-2 border font-mono font-bold uppercase tracking-wider transition disabled:cursor-not-allowed disabled:opacity-50 ${variants} ${sizes}`;
  const pendingContent = pendingLabel !== undefined ? pendingLabel : children;

  return (
    <button
      type={type}
      className={`${chrome} ${className}`}
      {...props}
      disabled={isDisabled}
      aria-busy={isPending || undefined}
    >
      {isPending ? (
        <>
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden="true" />
          {pendingContent}
        </>
      ) : (
        children
      )}
    </button>
  );
};
