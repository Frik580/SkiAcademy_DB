import { useLayoutEffect, useRef, type RefObject } from 'react';

// Shared with AdminModal: one owner for keyboard handling and background isolation.
const layers: HTMLElement[] = [];
const background = new Map<HTMLElement, { inert: boolean; hidden: string | null }>();

function restoreBackground() {
  for (const [node, state] of background) {
    node.toggleAttribute('inert', state.inert);
    if (state.hidden === null) node.removeAttribute('aria-hidden');
    else node.setAttribute('aria-hidden', state.hidden);
  }
  background.clear();
}

function isolateBackground() {
  restoreBackground();
  const top = layers.at(-1);
  if (!top) return;
  for (const node of Array.from(document.body.children)) {
    if (!(node instanceof HTMLElement) || node === top || node.contains(top)) continue;
    background.set(node, {
      inert: node.hasAttribute('inert'),
      hidden: node.getAttribute('aria-hidden'),
    });
    node.setAttribute('inert', '');
    node.setAttribute('aria-hidden', 'true');
  }
}

// Existing AdminModal traversal, including hidden controls and disabled fieldsets.
function focusableElements(dialog: HTMLElement) {
  return Array.from(
    dialog.querySelectorAll<HTMLElement>(
      'button, input:not([type="hidden"]), select, textarea, a[href], [tabindex], [contenteditable="true"]'
    )
  ).filter((element) => {
    if (element.matches(':disabled') || element.tabIndex < 0) return false;
    for (let node: HTMLElement | null = element; node; node = node.parentElement) {
      if (
        node.hidden ||
        node.hasAttribute('inert') ||
        getComputedStyle(node).display === 'none' ||
        getComputedStyle(node).visibility === 'hidden'
      )
        return false;
      if (node === dialog) break;
    }
    return true;
  });
}

function canRestoreFocus(node: HTMLElement | null): node is HTMLElement {
  if (!node?.isConnected || node.matches(':disabled')) return false;
  for (let ancestor: HTMLElement | null = node; ancestor; ancestor = ancestor.parentElement) {
    if (
      ancestor.hidden ||
      ancestor.hasAttribute('inert') ||
      getComputedStyle(ancestor).display === 'none' ||
      getComputedStyle(ancestor).visibility === 'hidden'
    )
      return false;
  }
  return true;
}

export function useModalAccessibility(
  rootRef: RefObject<HTMLElement>,
  onClose: () => void,
  closeDisabled = false
) {
  const closeRef = useRef({ onClose, closeDisabled });
  closeRef.current = { onClose, closeDisabled };

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const originalZIndex = root.style.zIndex;
    const dialog = () => root.querySelector<HTMLElement>('[role="dialog"]');
    const focusFirst = () => {
      const target = dialog();
      if (!target) return;
      target.tabIndex = -1;
      (focusableElements(target)[0] ?? target).focus({ preventScroll: true });
    };
    layers.push(root);
    root.style.zIndex = String(80 + layers.length);
    // Restore the lower layer before focusing a newly opened portal.
    restoreBackground();
    focusFirst();
    isolateBackground();
    const isTop = () => layers.at(-1) === root;
    const handleKey = (event: KeyboardEvent) => {
      if (!isTop() || event.defaultPrevented) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (!closeRef.current.closeDisabled) closeRef.current.onClose();
      } else if (event.key === 'Tab') {
        const target = dialog();
        if (!target) return;
        const elements = focusableElements(target);
        const index = elements.indexOf(document.activeElement as HTMLElement);
        if (
          !elements.length ||
          index < 0 ||
          (event.shiftKey ? index === 0 : index === elements.length - 1)
        ) {
          event.preventDefault();
          (event.shiftKey ? (elements.at(-1) ?? target) : (elements[0] ?? target)).focus({
            preventScroll: true,
          });
        }
      }
    };
    const handleFocus = (event: FocusEvent) => {
      if (isTop() && !dialog()?.contains(event.target as Node)) focusFirst();
    };
    const observer = new MutationObserver(() => {
      if (isTop() && !dialog()?.contains(document.activeElement)) focusFirst();
    });
    observer.observe(root, { childList: true, subtree: true });
    document.addEventListener('keydown', handleKey);
    document.addEventListener('focusin', handleFocus);
    return () => {
      const wasTop = isTop();
      observer.disconnect();
      document.removeEventListener('keydown', handleKey);
      document.removeEventListener('focusin', handleFocus);
      layers.splice(layers.indexOf(root), 1);
      root.style.zIndex = originalZIndex;
      isolateBackground();
      if (!wasTop) return;
      if (canRestoreFocus(previousFocus)) previousFocus.focus({ preventScroll: true });
      if (!canRestoreFocus(previousFocus) || document.activeElement !== previousFocus) {
        const fallback =
          layers.at(-1)?.querySelector<HTMLElement>('[role="dialog"]') ??
          document.querySelector<HTMLElement>('main') ??
          document.body;
        const tabIndex = fallback.getAttribute('tabindex');
        fallback.tabIndex = -1;
        fallback.focus({ preventScroll: true });
        if (tabIndex === null) fallback.removeAttribute('tabindex');
        else fallback.setAttribute('tabindex', tabIndex);
      }
    };
  }, [rootRef]);
}
