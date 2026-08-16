import React from 'react';

export interface StateCardProps {
  title: string;
  description?: string;
  className?: string;
  children?: React.ReactNode;
}

export const StateCard: React.FC<StateCardProps> = ({
  title,
  description,
  className = '',
  children,
}) => (
  <div className={`border border-dashed border-[var(--border)] p-10 text-center ${className}`}>
    <p className="font-mono text-xs font-bold uppercase tracking-wider text-[var(--ink)]">
      {title}
    </p>
    {description && <p className="mt-2 text-sm text-[var(--ink-dim)]">{description}</p>}
    {children && <div className="mt-3">{children}</div>}
  </div>
);
