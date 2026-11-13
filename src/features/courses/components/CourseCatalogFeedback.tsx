import { LoaderCircle } from 'lucide-react';

export function CourseCatalogFeedback({
  loading,
  error,
  loadingLabel,
  errorLabel,
  retryLabel,
  onRetry,
}: {
  loading: boolean;
  error: boolean;
  loadingLabel: string;
  errorLabel: string;
  retryLabel: string;
  onRetry?: () => void;
}) {
  if (loading)
    return (
      <span role="status" className="inline-flex items-center justify-center gap-2">
        <LoaderCircle
          aria-hidden
          className="h-4 w-4 animate-spin motion-reduce:animate-none shrink-0"
        />
        {loadingLabel}
      </span>
    );
  if (!error) return null;
  return (
    <div role="alert" className="space-y-2 type-caption text-[var(--ink-dim)]">
      <p>{errorLabel}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="btn-secondary px-3 py-2">
          {retryLabel}
        </button>
      )}
    </div>
  );
}
