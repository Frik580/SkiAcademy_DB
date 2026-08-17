import React, { Suspense } from 'react';
import { ErrorBoundary } from '../app/components/ErrorBoundary';

interface LazyLoadProps {
  children: React.ReactNode;
  fallback: React.ReactNode;
}

export const LazyLoad: React.FC<LazyLoadProps> = ({ children, fallback }) => (
  <ErrorBoundary>
    <Suspense fallback={fallback}>{children}</Suspense>
  </ErrorBoundary>
);
