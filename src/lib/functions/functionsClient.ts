import { FirebaseError } from 'firebase/app';
import { httpsCallable } from 'firebase/functions';
import { logCallableFailure } from '../../features/errors/errorLogService';
import { functions } from '../../infrastructure/firebase';

export type FunctionsErrorCode = `functions/${string}` | 'unknown';

export class FunctionsClientError extends Error {
  constructor(
    message: string,
    public readonly code: FunctionsErrorCode,
    public readonly cause: unknown
  ) {
    super(message);
    this.name = 'FunctionsClientError';
  }
}

export function toFunctionsClientError(error: unknown): FunctionsClientError {
  if (error instanceof FunctionsClientError) return error;

  if (
    (error instanceof FirebaseError && error.code.startsWith('functions/')) ||
    (typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      typeof error.code === 'string' &&
      error.code.startsWith('functions/'))
  ) {
    const callableError = error as { code: string; message?: string };
    return new FunctionsClientError(
      callableError.message || 'Cloud Function request failed.',
      callableError.code as FunctionsErrorCode,
      error
    );
  }

  return new FunctionsClientError(
    error instanceof Error ? error.message : 'Cloud Function request failed.',
    'unknown',
    error
  );
}

export function isRetryableFunctionsError(error: unknown): boolean {
  const { code } = toFunctionsClientError(error);
  return [
    'functions/unavailable',
    'functions/deadline-exceeded',
    'functions/internal',
    'functions/unknown',
    'unknown',
  ].includes(code);
}

type CallableInvoker = <Input, Output>(name: string, input: Input) => Promise<Output>;

export interface FunctionsCallOptions {
  /** Retrying is allowed only for a server-side idempotent request. */
  idempotencyKey: string;
  maxAttempts?: number;
}

export interface FunctionsClientDependencies {
  invoke: CallableInvoker;
  wait?: (milliseconds: number) => Promise<void>;
  logFailure?: (functionName: string, error: FunctionsClientError) => void;
}

const defaultWait = (milliseconds: number) =>
  new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));

const shouldLogFailure = (error: FunctionsClientError) =>
  ![
    'functions/aborted',
    'functions/already-exists',
    'functions/failed-precondition',
    'functions/invalid-argument',
    'functions/not-found',
    'functions/permission-denied',
    'functions/unauthenticated',
  ].includes(error.code);

export function createFunctionsClient({
  invoke,
  wait = defaultWait,
  logFailure = (functionName, error) => logCallableFailure(functionName, error),
}: FunctionsClientDependencies) {
  return async function callFunction<Input, Output>(
    functionName: string,
    input: Input,
    { idempotencyKey, maxAttempts = 2 }: FunctionsCallOptions
  ): Promise<Output> {
    if (!idempotencyKey) {
      throw new Error(`An idempotency key is required to call ${functionName}.`);
    }

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        return await invoke<Input, Output>(functionName, {
          ...input,
          idempotencyKey,
        } as Input);
      } catch (error) {
        const normalizedError = toFunctionsClientError(error);
        const canRetry = attempt < maxAttempts && isRetryableFunctionsError(normalizedError);
        if (canRetry) {
          await wait(250 * attempt);
          continue;
        }

        if (shouldLogFailure(normalizedError)) {
          logFailure(functionName, normalizedError);
        }
        throw normalizedError;
      }
    }

    throw new Error(`Function call loop exited unexpectedly for ${functionName}.`);
  };
}

const invokeFirebaseCallable: CallableInvoker = async <Input, Output>(
  functionName: string,
  input: Input
) => {
  const callable = httpsCallable<Input, Output>(functions, functionName);
  const { data } = await callable(input);
  return data;
};

export const callFunction = createFunctionsClient({ invoke: invokeFirebaseCallable });
