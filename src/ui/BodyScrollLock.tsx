import React from 'react';
import { useBodyScrollLock } from '../lib/useBodyScrollLock';

/** Mount inside a modal while it is visible to prevent background page scroll. */
export const BodyScrollLock: React.FC = () => {
  useBodyScrollLock(true);
  return null;
};
