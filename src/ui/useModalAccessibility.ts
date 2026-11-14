import { createContext, useContext, useLayoutEffect, useRef, type RefObject } from 'react';

// Shared with AdminModal: one owner for keyboard handling and background isolation.
export const ModalParent = createContext<RefObject<HTMLElement> | null>(null);
const layers: HTMLElement[] = [];
const focusOrigins = new WeakMap<HTMLElement, HTMLElement | null>();
const parents = new WeakMap<HTMLElement, RefObject<HTMLElement> | null>();
let cancelPendingFocusRestore: (() => void) | undefined;
function updateLayerOrder() {
  layers.forEach((layer, index) => {
    layer.style.zIndex = String(81 + index);
  });
}
function descendsFrom(layer: HTMLElement, ancestor: HTMLElement): boolean {
  const parent = parents.get(layer)?.current;
  return !!parent && (parent === ancestor || descendsFrom(parent, ancestor));
}
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
  // Isolate siblings along the whole ancestor path, including inline mobile overlays.
  for (let branch: HTMLElement = top; branch.parentElement; branch = branch.parentElement) {
    for (const node of Array.from(branch.parentElement.children)) {
      if (!(node instanceof HTMLElement) || node === branch) continue;
      background.set(node, {
        inert: node.hasAttribute('inert'),
        hidden: node.getAttribute('aria-hidden'),
      });
      node.setAttribute('inert', '');
      node.setAttribute('aria-hidden', 'true');
    }
    if (branch.parentElement === document.body) break;
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

function canRestoreFocus(node: HTMLElement | null, allowDisabled = false): node is HTMLElement {
  if (!node?.isConnected || (!allowDisabled && node.matches(':disabled'))) return false;
  for (let ancestor: HTMLElement | null = node; ancestor; ancestor = ancestor.parentElement) {
    if (
      ancestor.hidden ||
      ancestor.hasAttribute('inert') ||
      ancestor.getAttribute('aria-hidden') === 'true' ||
      getComputedStyle(ancestor).display === 'none' ||
      ['hidden', 'collapse'].includes(getComputedStyle(ancestor).visibility)
    )
      return false;
  }
  return true;
}

function layerDialog(layer: HTMLElement) {
  return layer.matches('[role="dialog"]')
    ? layer
    : layer.querySelector<HTMLElement>('[role="dialog"]');
}

function inRestoreScope(origin: HTMLElement, closedRoot: HTMLElement) {
  if (closedRoot.contains(origin)) return false;
  const top = layers.at(-1);
  return top
    ? top.contains(origin) && origin.closest('[role="dialog"]') === layerDialog(top)
    : !origin.closest('[role="dialog"], [data-modal-layer]');
}

function restoreWhenEnabled(origin: HTMLElement, closedRoot: HTMLElement, fallback: HTMLElement) {
  const top = layers.at(-1);
  let cancelled = false;
  const cancel = () => {
    cancelled = true;
    observer.disconnect();
    document.removeEventListener('focusin', cancel);
    document.removeEventListener('pointerdown', cancel, true);
    document.removeEventListener('keydown', cancel, true);
    if (cancelPendingFocusRestore === cancel) cancelPendingFocusRestore = undefined;
  };
  const restore = () => {
    if (cancelled) return;
    if (
      layers.at(-1) !== top ||
      !inRestoreScope(origin, closedRoot) ||
      !canRestoreFocus(origin, true) ||
      (document.activeElement !== fallback && document.activeElement !== document.body)
    ) {
      cancel();
      return;
    }
    if (origin.matches(':disabled')) return;
    cancel();
    origin.focus({ preventScroll: true });
  };
  const observer = new MutationObserver(restore);
  observer.observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['disabled', 'hidden', 'inert', 'aria-hidden', 'class', 'style'],
  });
  cancelPendingFocusRestore = cancel;
  document.addEventListener('focusin', cancel);
  document.addEventListener('pointerdown', cancel, true);
  document.addEventListener('keydown', cancel, true);
  // Deletion layout cleanup runs before surviving host nodes receive new props.
  // Retry after the commit, then observe a genuinely later disabled -> enabled update.
  queueMicrotask(restore);
}

export function useModalAccessibility(
  rootRef: RefObject<HTMLElement>,
  onClose: () => void,
  closeDisabled = false,
  active = true
) {
  const parent = useContext(ModalParent);
  const closeRef = useRef({ onClose, closeDisabled });
  closeRef.current = { onClose, closeDisabled };

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root || !active) return;
    cancelPendingFocusRestore?.();
    let previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const originalZIndex = root.style.zIndex;
    const dialog = () =>
      root.matches('[role="dialog"]') ? root : root.querySelector<HTMLElement>('[role="dialog"]');
    const focusFirst = () => {
      const target = dialog();
      if (!target) return;
      target.tabIndex = -1;
      (focusableElements(target)[0] ?? target).focus({ preventScroll: true });
    };
    parents.set(root, parent);
    const descendant = layers.findIndex((layer) => descendsFrom(layer, root));
    if (descendant < 0) layers.push(root);
    else {
      // A child layout effect may already have moved focus in this same commit.
      previousFocus = focusOrigins.get(layers[descendant]) ?? previousFocus;
      layers.splice(descendant, 0, root);
    }
    focusOrigins.set(root, previousFocus);
    updateLayerOrder();
    // Restore the lower layer before focusing a newly opened portal.
    restoreBackground();
    if (layers.at(-1) === root) focusFirst();
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
      cancelPendingFocusRestore?.();
      const wasTop = isTop();
      observer.disconnect();
      document.removeEventListener('keydown', handleKey);
      document.removeEventListener('focusin', handleFocus);
      layers.splice(layers.indexOf(root), 1);
      parents.delete(root);
      focusOrigins.delete(root);
      updateLayerOrder();
      root.style.zIndex = originalZIndex;
      isolateBackground();
      if (!wasTop) return;
      const top = layers.at(-1);
      const originInScope = previousFocus && inRestoreScope(previousFocus, root);
      if (originInScope && canRestoreFocus(previousFocus))
        previousFocus.focus({ preventScroll: true });
      if (
        !originInScope ||
        !canRestoreFocus(previousFocus) ||
        document.activeElement !== previousFocus
      ) {
        const main = document.querySelector<HTMLElement>('main');
        const fallback =
          (top ? layerDialog(top) : main && inRestoreScope(main, root) ? main : null) ??
          document.body;
        const tabIndex = fallback.getAttribute('tabindex');
        fallback.tabIndex = -1;
        if (canRestoreFocus(fallback)) fallback.focus({ preventScroll: true });
        if (tabIndex === null) fallback.removeAttribute('tabindex');
        else fallback.setAttribute('tabindex', tabIndex);
        if (
          originInScope &&
          canRestoreFocus(previousFocus, true) &&
          previousFocus.matches(':disabled')
        )
          restoreWhenEnabled(previousFocus, root, fallback);
      }
    };
  }, [rootRef, active, parent]);
}
