import React from 'react';

export interface ActionButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md';
}

export const ActionButton: React.FC<ActionButtonProps> = ({
  variant = 'secondary',
  size = 'md',
  className = '',
  type = 'button',
  ...props
}) => {
  const variants = {
    primary: 'border-[var(--ink)] bg-[var(--ink)] text-[var(--bg)] hover:opacity-85',
    secondary: 'border-[var(--border)] text-[var(--ink)] hover:border-[var(--ink)]',
    danger: 'border-rose-500/50 text-rose-600 hover:border-rose-500 hover:bg-rose-500/10',
    ghost: 'border-transparent text-[var(--ink-dim)] hover:text-[var(--ink)] hover:bg-black/5',
  }[variant];
  const sizes = size === 'sm' ? 'px-3 py-1.5 text-xs' : 'px-4 py-2 text-sm';

  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center gap-2 border font-mono font-bold uppercase tracking-wider transition disabled:cursor-not-allowed disabled:opacity-50 ${variants} ${sizes} ${className}`}
      {...props}
    />
  );
};
