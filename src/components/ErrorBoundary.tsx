import React, { Component, ReactNode } from 'react';
import PropTypes from 'prop-types';
import { isChunkLoadError, reloadForStaleChunk } from '../lib/chunkLoadRecovery';
import { logErrorBoundaryFailure } from '../features/errors/errorLogService';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
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
        <div className="flex min-h-[12rem] flex-col items-center justify-center gap-3 border border-red-900/40 bg-red-950/20 p-6 text-red-200">
          <h3 className="font-mono text-xs uppercase tracking-wider">Something went wrong</h3>
          <p className="max-w-md text-center text-xs text-red-300/80">
            {this.state.error?.message ||
              'An unexpected error occurred while loading this section.'}
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="mt-2 border border-red-700/50 px-3 py-1.5 text-xs font-medium uppercase tracking-wider text-red-200 transition hover:bg-red-900/30"
          >
            Try again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
