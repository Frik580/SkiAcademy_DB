import { useUiStore } from '../src/features/shell/uiStore';

export interface E2EAppProbe {
  refreshInstructorParticipantProgress(participantId: string): Promise<number | undefined>;
}

// Bundled only by the E2E build. Exercise the real warning UI without a second
// source-module graph or a production/debug API for arbitrary store mutations.
if (import.meta.env.MODE === 'e2e' && import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true') {
  // Literal imports join the app's bundle graph, sharing its authenticated
  // service and store instances. Never inject progress or bypass authorization.
  (window as Window & { __carveE2E?: E2EAppProbe }).__carveE2E = {
    async refreshInstructorParticipantProgress(participantId) {
      const service = await import('../src/features/participant-progress/participantProgressService');
      const store = await import('../src/features/participant-progress/participantProgressStore');
      await service.refreshInstructorParticipantProgress([participantId]);
      return store.useParticipantProgressStore.getState().byId[participantId]?.revision;
    },
  };

  window.addEventListener('e2e:show-db-status-warning', () => {
    useUiStore.getState().setDbStatusWarning(
      'Database sync restricted. Using active sandboxed state. (Operation: get, Path: bookings/booking_c5ed88af8ff44d6baa9e46c511d61844/messages)'
    );
  });
}
