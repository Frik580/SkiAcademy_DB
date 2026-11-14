import { useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { BodyScrollLock } from './BodyScrollLock';
import { ModalParent, useModalAccessibility } from './useModalAccessibility';

/** Lifecycle only; each public modal keeps its existing chrome and animation. */
export function ModalLayer({
  children,
  onClose,
  closeDisabled = false,
}: {
  children: ReactNode;
  onClose: () => void;
  closeDisabled?: boolean;
}) {
  const root = useRef<HTMLDivElement>(null);
  useModalAccessibility(root, onClose, closeDisabled);
  return createPortal(
    <div ref={root} data-modal-layer className="fixed inset-0">
      <BodyScrollLock />
      <ModalParent.Provider value={root}>{children}</ModalParent.Provider>
    </div>,
    document.body
  );
}
