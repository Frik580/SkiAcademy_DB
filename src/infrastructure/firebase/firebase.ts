import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { getFunctions } from 'firebase/functions';
import { getStorage } from 'firebase/storage';
import {
  arrayUnion,
  arrayRemove,
  getFirestore,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  getDocs,
  where,
  addDoc,
  onSnapshot,
  limit,
  orderBy,
  runTransaction,
  writeBatch,
  startAfter,
  documentId,
  deleteField,
} from 'firebase/firestore';
import { OperationType } from '../../types';
import { logger } from '../../shared';

const requiredEnvVars = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_APP_ID',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
];

const missingEnvVars = requiredEnvVars.filter((key) => !import.meta.env[key]);

if (missingEnvVars.length > 0) {
  logger.warn(
    `Missing required Firebase environment variables: ${missingEnvVars.join(', ')}. ` +
      `Using fallback configuration for preview.`
  );
}

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'demo-api-key',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || 'demo-app-id',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'demo.firebaseapp.com',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '123456789',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'demo-project',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'demo-project.appspot.com',
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

const app = initializeApp(firebaseConfig);

// Initialize with specific databaseId if required by config
export const db = getFirestore(app, import.meta.env.VITE_FIREBASE_DATABASE_ID || '(default)');
export const auth = getAuth(app);
export const storage = getStorage(app);
export const functions = getFunctions(
  app,
  import.meta.env.VITE_FIREBASE_FUNCTIONS_REGION || 'us-central1'
);
export const googleProvider = new GoogleAuthProvider();

// Allow registering a global callback for database errors (e.g. to show custom error banners in UI)
type ErrorListener = (error: any, operation: OperationType, path: string) => void;
let errorListener: ErrorListener | null = null;

type ErrorLogPayload = {
  id: string;
  message: string;
  stack: string;
  timestamp: string;
  userId: string;
  userEmail: string;
  url: string;
  userAgent: string;
  source: string;
  operation: string;
  path: string;
};

const ERROR_LOG_THROTTLE_MS = 5_000;
const ERROR_LOG_SESSION_LIMIT = 50;
const ERROR_LOG_BATCH_SIZE = 10;
const ERROR_LOG_STORAGE_KEY = 'ski-academy:error-log-buffer:v1';
let errorLogQueue: ErrorLogPayload[] = loadBufferedErrorLogs();
let errorLogsQueuedThisSession = 0;
let errorLogFlushTimer: ReturnType<typeof setTimeout> | undefined;
let errorLogFlushInFlight = false;
let lastErrorLogFlushAt = 0;

function loadBufferedErrorLogs(): ErrorLogPayload[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(ERROR_LOG_STORAGE_KEY) ?? '[]');
    return Array.isArray(parsed)
      ? (parsed.slice(-ERROR_LOG_SESSION_LIMIT) as ErrorLogPayload[])
      : [];
  } catch {
    return [];
  }
}

function persistBufferedErrorLogs(): void {
  if (typeof window === 'undefined') return;
  try {
    if (errorLogQueue.length === 0) window.localStorage.removeItem(ERROR_LOG_STORAGE_KEY);
    else window.localStorage.setItem(ERROR_LOG_STORAGE_KEY, JSON.stringify(errorLogQueue));
  } catch {
    // Logging must never make the application fail when browser storage is unavailable.
  }
}

function scheduleErrorLogFlush(): void {
  if (errorLogFlushTimer || errorLogQueue.length === 0) return;
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    persistBufferedErrorLogs();
    return;
  }
  const delay = Math.max(0, lastErrorLogFlushAt + ERROR_LOG_THROTTLE_MS - Date.now());
  errorLogFlushTimer = setTimeout(() => {
    errorLogFlushTimer = undefined;
    void flushErrorLogs();
  }, delay);
}

async function flushErrorLogs(): Promise<void> {
  if (errorLogFlushInFlight || errorLogQueue.length === 0) return;
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    persistBufferedErrorLogs();
    return;
  }

  errorLogFlushInFlight = true;
  lastErrorLogFlushAt = Date.now();
  const batchEntries = errorLogQueue.splice(0, ERROR_LOG_BATCH_SIZE);
  persistBufferedErrorLogs();

  try {
    const batch = writeBatch(db);
    for (const entry of batchEntries) {
      batch.set(doc(db, 'error_logs', entry.id), entry);
    }
    await batch.commit();
  } catch (error) {
    errorLogQueue = [...batchEntries, ...errorLogQueue].slice(-ERROR_LOG_SESSION_LIMIT);
    persistBufferedErrorLogs();
    logger.warn('Failed to flush buffered Firestore error logs:', error);
  } finally {
    errorLogFlushInFlight = false;
    scheduleErrorLogFlush();
  }
}

export function registerFirestoreErrorListener(listener: ErrorListener) {
  errorListener = listener;
}

export function logErrorToFirestore(
  message: string,
  stack?: string,
  source: string = 'custom',
  operation?: string,
  path?: string
) {
  const user = auth.currentUser;
  // Firestore rules intentionally reject anonymous error logs, so do not retain them forever.
  if (!user) return;
  if (errorLogsQueuedThisSession >= ERROR_LOG_SESSION_LIMIT) return;

  errorLogsQueuedThisSession += 1;
  errorLogQueue.push({
    id: `err_${crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)}_${Date.now()}`,
    message: (message || 'Unknown error').slice(0, 5_000),
    stack: (stack || '').slice(0, 20_000),
    timestamp: new Date().toISOString(),
    userId: user.uid,
    userEmail: user.email || '',
    url: typeof window !== 'undefined' ? window.location.href : '',
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
    source,
    operation: operation || '',
    path: path || '',
  });
  errorLogQueue = errorLogQueue.slice(-ERROR_LOG_SESSION_LIMIT);
  persistBufferedErrorLogs();
  scheduleErrorLogFlush();
}

// Auto-register global window error listeners
if (typeof window !== 'undefined') {
  window.addEventListener('online', scheduleErrorLogFlush);
  window.addEventListener('error', (event) => {
    // Filter out benign ResizeObserver/HMR/websocket warnings
    const msg = event.message || (event.error && event.error.message) || '';
    if (
      msg.includes('ResizeObserver') ||
      msg.includes('websocket') ||
      msg.includes('HMR') ||
      msg.includes('failed to connect to websocket')
    ) {
      return;
    }
    const stack = event.error && event.error.stack;
    logErrorToFirestore(msg || 'Window error event', stack, 'global_error');
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    const msg = reason instanceof Error ? reason.message : String(reason);
    if (
      msg.includes('ResizeObserver') ||
      msg.includes('websocket') ||
      msg.includes('HMR') ||
      msg.includes('failed to connect to websocket')
    ) {
      return;
    }
    const stack = reason instanceof Error ? reason.stack : '';
    logErrorToFirestore(msg || 'Unhandled promise rejection', stack, 'unhandled_rejection');
  });
}

export function handleFirestoreError(err: any, operation: OperationType, path: string) {
  logger.error(`[Firestore Error] Operation: ${operation}, Path: ${path}`, err);

  // Log to database (skip if it is about writing to error_logs itself to avoid infinite loop)
  if (!path.includes('error_logs')) {
    const msg = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : '';
    logErrorToFirestore(msg, stack, 'firestore', operation, path);
  }

  if (errorListener) {
    errorListener(err, operation, path);
  } else {
    // Fallback alert/toast warning
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn(
      `Database permission or structure issue while doing '${operation}' on '${path}': ${msg}`
    );
  }
}

export async function migratePreExistingProfile(
  newUid: string,
  email: string,
  customDisplayName?: string
): Promise<any | null> {
  if (!email) return null;
  const normalizedEmail = email.toLowerCase().trim();
  logger.debug(`Starting migration for email: ${normalizedEmail} to newUid: ${newUid}`);

  try {
    let usnap;
    try {
      const uq = query(collection(db, 'users'), where('email', '==', normalizedEmail));
      usnap = await getDocs(uq);
      logger.debug(`Successfully fetched users count: ${usnap.size}`);
    } catch (err: any) {
      logger.error('Migration error at step 1: Query users by email failed', err);
      throw new Error(`Query users failed: ${err.message}`);
    }

    let oldProfile: any = null;
    let oldUid = '';

    usnap.forEach((doc) => {
      if (doc.id !== newUid) {
        oldProfile = doc.data();
        oldUid = doc.id;
      }
    });

    if (!oldProfile || !oldUid) {
      logger.debug('No pre-existing profile to migrate.');
      return null;
    }

    logger.debug(
      `Found pre-existing user: oldUid=${oldUid}, startsWith('client_')=${oldUid.startsWith('client_')}`
    );

    // Only migrate if the pre-existing profile was created by an admin
    if (!oldUid.startsWith('client_')) {
      logger.debug(
        `Found pre-existing user with uid ${oldUid}, but it is not an admin-created client profile.`
      );
      return null;
    }

    const migratedProfile = {
      ...oldProfile,
      uid: newUid,
      ...(customDisplayName ? { displayName: customDisplayName } : {}),
    };

    try {
      logger.debug(`Writing migrated profile to users/${newUid}...`);
      await setDoc(doc(db, 'users', newUid), migratedProfile);
      logger.debug(`Successfully wrote migrated profile to users/${newUid}`);
    } catch (err: any) {
      logger.error(`Migration error at step 2: setDoc to users/${newUid} failed`, err);
      throw new Error(`Write user profile failed: ${err.message}`);
    }

    try {
      logger.debug(`Checking bookings for oldUid: ${oldUid}...`);
      const bQuery = query(collection(db, 'bookings'), where('userId', '==', oldUid));
      const bSnap = await getDocs(bQuery);
      logger.debug(`Found ${bSnap.size} bookings to update.`);
      for (const bDoc of bSnap.docs) {
        logger.debug(`Updating booking ${bDoc.id}...`);
        await updateDoc(doc(db, 'bookings', bDoc.id), { userId: newUid });
      }
      logger.debug('Bookings update complete.');
    } catch (err: any) {
      logger.error('Migration error at step 3: Update bookings failed', err);
      throw new Error(`Update bookings failed: ${err.message}`);
    }

    try {
      logger.debug(`Checking reviews for oldUid: ${oldUid}...`);
      const rQuery = query(collection(db, 'reviews'), where('userId', '==', oldUid));
      const rSnap = await getDocs(rQuery);
      logger.debug(`Found ${rSnap.size} reviews to update.`);
      for (const rDoc of rSnap.docs) {
        logger.debug(`Updating review ${rDoc.id}...`);
        await updateDoc(doc(db, 'reviews', rDoc.id), { userId: newUid });
      }
      logger.debug('Reviews update complete.');
    } catch (err: any) {
      logger.error('Migration error at step 4: Update reviews failed', err);
      throw new Error(`Update reviews failed: ${err.message}`);
    }

    try {
      logger.debug(`Deleting old user profile users/${oldUid}...`);
      await deleteDoc(doc(db, 'users', oldUid));
      logger.debug(`Successfully deleted old user profile users/${oldUid}`);
    } catch (err: any) {
      logger.error(`Migration error at step 5: Deleting users/${oldUid} failed`, err);
      throw new Error(`Delete old profile failed: ${err.message}`);
    }

    logger.debug(`Successfully migrated profile and data from ${oldUid} to ${newUid}`);
    return migratedProfile;
  } catch (err: any) {
    logger.error('Error migrating pre-existing profile:', err);
    throw err;
  }
}

export {
  arrayUnion,
  arrayRemove,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  getDocs,
  where,
  addDoc,
  onSnapshot,
  limit,
  orderBy,
  runTransaction,
  writeBatch,
  startAfter,
  documentId,
  deleteField,
  GoogleAuthProvider,
  signInWithPopup,
  OperationType,
};
