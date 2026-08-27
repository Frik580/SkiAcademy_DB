import { connectAuthEmulator } from 'firebase/auth';
import { connectFirestoreEmulator } from 'firebase/firestore';
import { connectFunctionsEmulator } from 'firebase/functions';
import { connectStorageEmulator } from 'firebase/storage';
import { auth, db, functions, storage } from './firebase';

const useEmulators = import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true';
const emulatorHost = import.meta.env.VITE_FIREBASE_EMULATOR_HOST?.trim() || '127.0.0.1';

function getEmulatorPort(value: string | undefined, fallback: number, name: string): number {
  if (!value) return fallback;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid ${name}: expected an integer between 1 and 65535.`);
  }
  return port;
}

const emulatorPorts = {
  auth: getEmulatorPort(
    import.meta.env.VITE_FIREBASE_AUTH_EMULATOR_PORT,
    9299,
    'auth emulator port'
  ),
  firestore: getEmulatorPort(
    import.meta.env.VITE_FIREBASE_FIRESTORE_EMULATOR_PORT,
    8080,
    'Firestore emulator port'
  ),
  functions: getEmulatorPort(
    import.meta.env.VITE_FIREBASE_FUNCTIONS_EMULATOR_PORT,
    5001,
    'Functions emulator port'
  ),
  storage: getEmulatorPort(
    import.meta.env.VITE_FIREBASE_STORAGE_EMULATOR_PORT,
    9199,
    'Storage emulator port'
  ),
};

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
  connectStorageEmulator(storage, emulatorHost, emulatorPorts.storage);
  window.__skiAcademyFirebaseEmulatorsConnected__ = true;
}
