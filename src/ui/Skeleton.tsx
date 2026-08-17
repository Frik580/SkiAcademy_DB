import React from 'react';

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  className?: string;
  variant?: 'text' | 'circular' | 'rectangular' | 'rounded';
  width?: string | number;
  height?: string | number;
}

export const Skeleton: React.FC<SkeletonProps> = ({
  className = '',
  variant = 'rounded',
  width,
  height,
  style,
  ...props
}) => {
  const variantClasses = {
    text: 'rounded-xs h-4 w-full',
    circular: 'rounded-full',
    rectangular: 'rounded-none',
    rounded: 'rounded-md',
  }[variant];

  return (
    <div
      className={`animate-pulse bg-slate-200/80 dark:bg-slate-800/60 border border-slate-300/30 dark:border-slate-700/30 ${variantClasses} ${className}`}
      style={{
        width: typeof width === 'number' ? `${width}px` : width,
        height: typeof height === 'number' ? `${height}px` : height,
        ...style,
      }}
      {...props}
    />
  );
};

export const CardSkeleton: React.FC<{ count?: number; className?: string }> = ({
  count = 1,
  className = '',
}) => {
  return (
    <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 ${className}`}>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="p-5 border border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-900/40 rounded-xl space-y-4 animate-pulse"
        >
          <div className="flex items-center gap-4">
            <Skeleton variant="circular" className="w-14 h-14 shrink-0" />
            <div className="space-y-2 flex-1">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
          <div className="space-y-2 pt-2">
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-5/6" />
          </div>
          <div className="flex justify-between items-center pt-3 border-t border-slate-100 dark:border-slate-800/80">
            <Skeleton className="h-6 w-20" />
            <Skeleton className="h-8 w-28 rounded-lg" />
          </div>
        </div>
      ))}
    </div>
  );
};

export const ListSkeleton: React.FC<{ rows?: number; className?: string }> = ({
  rows = 4,
  className = '',
}) => {
  return (
    <div className={`space-y-3 ${className}`}>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="p-4 border border-slate-200/60 dark:border-slate-800/60 bg-white/40 dark:bg-slate-900/30 rounded-lg flex items-center justify-between gap-4 animate-pulse"
        >
          <div className="flex items-center gap-3 flex-1">
            <Skeleton variant="circular" className="w-10 h-10 shrink-0" />
            <div className="space-y-1.5 flex-1">
              <Skeleton className="h-3.5 w-1/3" />
              <Skeleton className="h-3 w-1/4" />
            </div>
          </div>
          <Skeleton className="h-8 w-24 rounded-md shrink-0" />
        </div>
      ))}
    </div>
  );
};

export const TableSkeleton: React.FC<{ rows?: number; cols?: number; className?: string }> = ({
  rows = 5,
  cols = 5,
  className = '',
}) => {
  return (
    <div
      className={`w-full overflow-hidden border border-slate-200 dark:border-slate-800 rounded-lg ${className}`}
    >
      <div className="bg-slate-100/70 dark:bg-slate-900/80 p-3 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center gap-4">
        {Array.from({ length: cols }).map((_, c) => (
          <Skeleton key={c} className="h-4 flex-1" />
        ))}
      </div>
      <div className="divide-y divide-slate-100 dark:divide-slate-800/60">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="p-3.5 flex justify-between items-center gap-4 animate-pulse">
            {Array.from({ length: cols }).map((_, c) => (
              <Skeleton key={c} className={`h-3.5 ${c === 0 ? 'w-1/3' : 'flex-1'}`} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};

export const FormSkeleton: React.FC<{ fields?: number; className?: string }> = ({
  fields = 4,
  className = '',
}) => {
  return (
    <div
      className={`space-y-5 p-6 border border-slate-200 dark:border-slate-800 rounded-xl bg-white/30 dark:bg-slate-900/20 ${className}`}
    >
      <Skeleton className="h-6 w-48 mb-4" />
      {Array.from({ length: fields }).map((_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="h-3.5 w-28" />
          <Skeleton className="h-10 w-full rounded-md" />
        </div>
      ))}
      <div className="pt-3 flex justify-end gap-3">
        <Skeleton className="h-9 w-24 rounded-md" />
        <Skeleton className="h-9 w-32 rounded-md" />
      </div>
    </div>
  );
};

export const ModalSkeleton: React.FC<{ title?: string; className?: string }> = ({
  title,
  className = '',
}) => {
  return (
    <div
      className={`p-6 space-y-5 bg-white dark:bg-slate-900 rounded-2xl shadow-xl max-w-md w-full border border-slate-200 dark:border-slate-800 ${className}`}
    >
      <div className="flex justify-between items-center pb-3 border-b border-slate-100 dark:border-slate-800">
        {title ? (
          <span className="font-semibold text-sm text-slate-500 dark:text-slate-400">{title}</span>
        ) : (
          <Skeleton className="h-5 w-40" />
        )}
        <Skeleton variant="circular" className="w-6 h-6" />
      </div>
      <div className="space-y-3 py-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-20 w-full rounded-lg" />
      </div>
      <div className="flex justify-end gap-3 pt-2">
        <Skeleton className="h-9 w-20 rounded-md" />
        <Skeleton className="h-9 w-28 rounded-md" />
      </div>
    </div>
  );
};

export const AppInitSkeleton: React.FC<{ label?: string }> = ({ label }) => {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col">
      {/* Navbar Skeleton */}
      <div className="h-16 border-b border-slate-200 dark:border-slate-800/80 px-6 flex items-center justify-between bg-white/50 dark:bg-slate-900/50 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <Skeleton variant="circular" className="w-8 h-8" />
          <Skeleton className="h-5 w-32" />
        </div>
        <div className="flex items-center gap-4">
          <Skeleton className="h-4 w-20 hidden md:block" />
          <Skeleton className="h-4 w-20 hidden md:block" />
          <Skeleton variant="circular" className="w-8 h-8" />
        </div>
      </div>

      {/* Main Content Shell Skeleton */}
      <div className="flex-1 max-w-7xl w-full mx-auto p-6 space-y-8 animate-pulse">
        {/* Banner/Hero Skeleton */}
        <div className="h-48 md:h-64 rounded-2xl bg-gradient-to-r from-slate-200 via-slate-100 to-slate-200 dark:from-slate-800 dark:via-slate-850 dark:to-slate-800 border border-slate-200 dark:border-slate-800 p-8 flex flex-col justify-end space-y-3">
          <Skeleton className="h-8 w-2/5" />
          <Skeleton className="h-4 w-1/3" />
        </div>

        {/* Content Section Skeleton */}
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-24" />
          </div>
          <CardSkeleton count={3} />
        </div>
      </div>

      {label && (
        <div className="py-3 text-center text-xs font-mono text-slate-400 dark:text-slate-500 uppercase tracking-widest">
          {label}
        </div>
      )}
    </div>
  );
};
