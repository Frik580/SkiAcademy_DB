import { connectAuthEmulator } from 'firebase/auth';
import { connectFirestoreEmulator } from 'firebase/firestore';
import { connectFunctionsEmulator } from 'firebase/functions';
import { auth, db, functions } from './firebase';
import { firebaseEmulatorConfig } from './firebaseEmulatorConfig';

const { useEmulators, host: emulatorHost, ports: emulatorPorts } = firebaseEmulatorConfig;

declare global {
  interface Window {
    __skiAcademyFirebaseEmulatorsConnected__?: boolean;
  }
}

if (
  useEmulators &&
  typeof window !== 'undefined' &&
  !window.__skiAcademyFirebaseEmulatorsConnected__
) {
  connectAuthEmulator(auth, `http://${emulatorHost}:${emulatorPorts.auth}`, {
    disableWarnings: true,
  });
  connectFirestoreEmulator(db, emulatorHost, emulatorPorts.firestore);
  connectFunctionsEmulator(functions, emulatorHost, emulatorPorts.functions);
  window.__skiAcademyFirebaseEmulatorsConnected__ = true;
}
