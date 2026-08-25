import 'react';

// React 18 passes lowercase fetchpriority to the DOM; @types/react lists fetchPriority (React 19).
declare module 'react' {
  interface ImgHTMLAttributes<T> {
    fetchpriority?: 'high' | 'low' | 'auto';
  }
}
