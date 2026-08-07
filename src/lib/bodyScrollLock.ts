let lockCount = 0;
let savedScrollY = 0;

export const BODY_SCROLL_LOCK_CLASS = 'modal-scroll-lock';

function applyBodyScrollLock() {
  if (typeof document === 'undefined') return;

  savedScrollY = window.scrollY;
  document.documentElement.classList.add(BODY_SCROLL_LOCK_CLASS);
  document.body.classList.add(BODY_SCROLL_LOCK_CLASS);
  document.body.style.position = 'fixed';
  document.body.style.top = `-${savedScrollY}px`;
  document.body.style.left = '0';
  document.body.style.right = '0';
  document.body.style.width = '100%';
}

function releaseBodyScrollLock() {
  if (typeof document === 'undefined') return;

  document.documentElement.classList.remove(BODY_SCROLL_LOCK_CLASS);
  document.body.classList.remove(BODY_SCROLL_LOCK_CLASS);
  document.body.style.position = '';
  document.body.style.top = '';
  document.body.style.left = '';
  document.body.style.right = '';
  document.body.style.width = '';
  try {
    window.scrollTo(0, savedScrollY);
  } catch {
    // jsdom and other minimal environments may not implement scroll restoration.
  }
}

/** Locks page scroll; call the returned function to release. Supports nested modals. */
export function lockBodyScroll(): () => void {
  if (typeof document === 'undefined') return () => {};

  if (lockCount === 0) applyBodyScrollLock();
  lockCount += 1;

  let released = false;
  return () => {
    if (released) return;
    released = true;
    lockCount = Math.max(0, lockCount - 1);
    if (lockCount === 0) releaseBodyScrollLock();
  };
}
