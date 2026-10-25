import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { initializeWebAppCheck } from './webAppCheck';
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
import {
  assertFirebaseEnvironment,
  assertFirebaseTestEnvironment,
} from './firebaseEnvironmentGuard';

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

assertFirebaseTestEnvironment({
  mode: import.meta.env.MODE,
  projectId: firebaseConfig.projectId,
  useEmulators: import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true',
});

if (typeof window !== 'undefined' && import.meta.env.MODE !== 'test') {
  assertFirebaseEnvironment({
    hostname: window.location.hostname,
    projectId: firebaseConfig.projectId,
    useEmulators: import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true',
  });
}

export const app = initializeApp(firebaseConfig);
initializeWebAppCheck(app);

// Initialize with specific databaseId if required by config
export const db = getFirestore(app, import.meta.env.VITE_FIREBASE_DATABASE_ID || '(default)');
export const auth = getAuth(app);
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
  source: string;
  operation: string;
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
    else
      window.localStorage.setItem(
        ERROR_LOG_STORAGE_KEY,
        JSON.stringify(
          errorLogQueue.map(({ id, userId, timestamp, source, operation }) => ({
            id,
            userId,
            timestamp,
            source,
            operation,
            message: 'Buffered client error',
            stack: '',
          }))
        )
      );
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
    const entries = batchEntries.filter((entry) => entry.userId === auth.currentUser?.uid);
    if (entries.length) await httpsCallable(functions, 'reportClientErrors')({ entries });
  } catch (error) {
    // Drop terminal/rejected telemetry; never retry a rate-limit forever.
    errorLogQueue = errorLogQueue.slice(-ERROR_LOG_SESSION_LIMIT);
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
  _path?: string
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
    source,
    operation: operation || '',
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
  const user = auth.currentUser;
  if (
    !user ||
    user.uid !== newUid ||
    !user.emailVerified ||
    user.email?.trim().toLowerCase() !== email.trim().toLowerCase()
  )
    return null;
  await user.getIdToken(true);
  const result = await httpsCallable<{ displayName?: string }, { claimed: boolean }>(
    functions,
    'claimGuestProfile'
  )(customDisplayName ? { displayName: customDisplayName } : {});
  if (!result.data.claimed) return null;
  const profile = await getDoc(doc(db, 'users', newUid));
  return profile.exists() ? profile.data() : null;
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
