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
    <p className="type-card-title text-[var(--ink)]">{title}</p>
    {description && <p className="mt-2 type-compact text-[var(--ink-dim)]">{description}</p>}
    {children && <div className="mt-3">{children}</div>}
  </div>
);
