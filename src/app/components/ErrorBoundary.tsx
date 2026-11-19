import React, { Component, ReactNode } from 'react';
import PropTypes from 'prop-types';
import { isChunkLoadError, reloadForStaleChunk } from '../../lib/chunkLoadRecovery';
import { logErrorBoundaryFailure } from '../../features/errors';
import { useLanguage } from '../providers/LanguageContext';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

function SectionLoadFailure({ onRetry }: { onRetry: () => void }) {
  const { t } = useLanguage();
  return (
    <div
      role="alert"
      className="flex min-h-[12rem] flex-col items-center justify-center gap-3 border border-red-900/40 bg-red-950/20 p-6 text-red-200"
    >
      <p className="max-w-md text-center type-caption text-red-300/80">{t('sectionLoadError')}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-2 border border-red-700/50 px-3 py-1.5 type-button uppercase text-red-200 transition hover:bg-red-900/30"
      >
        {t('retry')}
      </button>
    </div>
  );
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  static propTypes = {
    children: PropTypes.node.isRequired,
    fallback: PropTypes.node,
    onError: PropTypes.func,
  };

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    if (isChunkLoadError(error)) {
      reloadForStaleChunk();
      return;
    }

    logErrorBoundaryFailure(error);
    this.props.onError?.(error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <SectionLoadFailure
          onRetry={() => {
            if (this.state.error && isChunkLoadError(this.state.error)) window.location.reload();
            else this.setState({ hasError: false, error: null });
          }}
        />
      );
    }

    return this.props.children;
  }
}
