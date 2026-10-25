import React, { createContext, useContext, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { BOOKING_MODAL_SHELL_CLASS } from '../../bookings/components/booking_modal/bookingModalLayout';
import { BodyScrollLock } from '../../../ui/BodyScrollLock';
import './adminModal.css';

const ModalDepth = createContext(0);
const widths = { sm: 384, md: 448, lg: 512, xl: 768 };

interface AdminModalProps {
  title: React.ReactNode;
  onClose: () => void;
  closeLabel: string;
  closeDisabled?: boolean;
  width?: keyof typeof widths;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** Chat owns its message scroller and composer inside the body. */
  bodyLayout?: 'scroll' | 'flex';
  'data-testid'?: string;
}

function isTopModal(root: HTMLElement) {
  const roots = Array.from(document.querySelectorAll<HTMLElement>('[data-admin-modal-root]'));
  roots.sort((a, b) => Number(a.style.zIndex) - Number(b.style.zIndex));
  return roots.at(-1) === root;
}

function focusableElements(dialog: HTMLElement) {
  return Array.from(
    dialog.querySelectorAll<HTMLElement>(
      'button:not(:disabled), input:not(:disabled):not([type="hidden"]), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])'
    )
  ).filter((element) => {
    for (
      let node: HTMLElement | null = element;
      node && node !== dialog;
      node = node.parentElement
    ) {
      if (
        node.hidden ||
        node.hasAttribute('inert') ||
        getComputedStyle(node).display === 'none' ||
        getComputedStyle(node).visibility === 'hidden'
      )
        return false;
    }
    return element.tabIndex >= 0;
  });
}

/** Booking chrome, with viewport positioning and lifecycle owned by one admin shell. */
export function AdminModal({
  title,
  onClose,
  closeLabel,
  closeDisabled = false,
  width = 'md',
  children,
  footer,
  bodyLayout = 'scroll',
  'data-testid': testId,
}: AdminModalProps) {
  const depth = useContext(ModalDepth);
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef({ onClose, closeDisabled });
  closeRef.current = { onClose, closeDisabled };
  const [viewport, setViewport] = useState<React.CSSProperties>();

  useEffect(() => {
    const visualViewport = window.visualViewport;
    if (!visualViewport) return;
    const update = () =>
      setViewport({
        top: visualViewport.offsetTop,
        left: visualViewport.offsetLeft,
        width: visualViewport.width,
        height: visualViewport.height,
      });
    update();
    visualViewport.addEventListener('resize', update);
    visualViewport.addEventListener('scroll', update);
    return () => {
      visualViewport.removeEventListener('resize', update);
      visualViewport.removeEventListener('scroll', update);
    };
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    const root = rootRef.current;
    if (!dialog || !root) return;
    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusFirst = () =>
      (focusableElements(dialog)[0] ?? dialog).focus({ preventScroll: true });
    if (isTopModal(root)) focusFirst();
    const handleKey = (event: KeyboardEvent) => {
      if (!isTopModal(root) || event.defaultPrevented) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        if (!closeRef.current.closeDisabled) closeRef.current.onClose();
      } else if (event.key === 'Tab') {
        const elements = focusableElements(dialog);
        const index = elements.indexOf(document.activeElement as HTMLElement);
        if (
          !elements.length ||
          index < 0 ||
          (event.shiftKey ? index === 0 : index === elements.length - 1)
        ) {
          event.preventDefault();
          (event.shiftKey ? (elements.at(-1) ?? dialog) : (elements[0] ?? dialog)).focus();
        }
      }
    };
    const handleFocus = (event: FocusEvent) => {
      if (isTopModal(root) && !dialog.contains(event.target as Node)) focusFirst();
    };
    document.addEventListener('keydown', handleKey);
    document.addEventListener('focusin', handleFocus);
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.removeEventListener('focusin', handleFocus);
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, []);

  if (typeof document === 'undefined') return null;
  return createPortal(
    <ModalDepth.Provider value={depth + 1}>
      <div
        ref={rootRef}
        data-admin-modal-root
        className="admin-modal-viewport"
        style={{ ...viewport, zIndex: 80 + depth }}
      >
        <BodyScrollLock />
        <div
          className="ui-modal-overlay absolute inset-0 !rounded-none border-0"
          aria-hidden="true"
        />
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          tabIndex={-1}
          data-testid={testId}
          className={`${BOOKING_MODAL_SHELL_CLASS} admin-modal`}
          style={{ maxWidth: widths[width] }}
        >
          <header className="flex shrink-0 items-center justify-between gap-2.5 border-b border-[var(--border)] bg-black/5 p-4 dark:bg-white/5">
            <h2 id={titleId} className="min-w-0 break-words type-card-title">
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              disabled={closeDisabled}
              aria-label={closeLabel}
              className="shrink-0 rounded-full p-2 text-[var(--ink-dim)] transition-colors hover:bg-[var(--profile-bg)] hover:text-[var(--ink)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </header>
          <div
            className={
              bodyLayout === 'flex'
                ? 'admin-modal-body admin-modal-body-flex'
                : 'admin-modal-body space-y-4'
            }
          >
            {children}
          </div>
          {footer && <footer className="admin-modal-footer">{footer}</footer>}
        </div>
      </div>
    </ModalDepth.Provider>,
    document.body
  );
}
