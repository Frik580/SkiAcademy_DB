import { useUiStore } from '../src/features/shell/uiStore';

// Bundled only by the E2E build. Exercise the real warning UI without a second
// source-module graph or a production/debug API for arbitrary store mutations.
if (import.meta.env.MODE === 'e2e' && import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true') {
  window.addEventListener('e2e:show-db-status-warning', () => {
    useUiStore.getState().setDbStatusWarning(
      'Database sync restricted. Using active sandboxed state. (Operation: get, Path: bookings/booking_c5ed88af8ff44d6baa9e46c511d61844/messages)'
    );
  });
}
