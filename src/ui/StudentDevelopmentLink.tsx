import type { MouseEvent } from 'react';
import { ArrowRight } from 'lucide-react';
import { cabinetPathForTab } from '../lib/workspaceRoutes';
import './studentDevelopmentLink.css';

export interface StudentDevelopmentLinkProps {
  label: string;
  onNavigate?: () => void;
  stopPropagation?: boolean;
  className?: string;
}

export const StudentDevelopmentLink = ({
  label,
  onNavigate,
  stopPropagation = false,
  className = '',
}: StudentDevelopmentLinkProps) => {
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (stopPropagation) event.stopPropagation();

    if (
      onNavigate &&
      event.button === 0 &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.shiftKey &&
      !event.altKey
    ) {
      event.preventDefault();
      onNavigate();
    }
  };

  return (
    <a
      href={cabinetPathForTab('development')}
      onClick={handleClick}
      className={`student-development-link ${className}`.trim()}
      aria-label={label}
    >
      <span className="student-development-link__label">{label}</span>
      <ArrowRight size={16} strokeWidth={2} aria-hidden="true" />
    </a>
  );
};
