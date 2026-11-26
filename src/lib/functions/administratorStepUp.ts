import type { User } from 'firebase/auth';
import { auth } from '../../infrastructure/firebase';

type ConfirmIdentity = (user: User) => Promise<boolean>;
let confirmIdentity: ConfirmIdentity | undefined;

export function registerAdministratorStepUp(confirm: ConfirmIdentity): () => void {
  confirmIdentity = confirm;
  return () => {
    if (confirmIdentity === confirm) confirmIdentity = undefined;
  };
}

export async function withAdministratorStepUp<T>(
  invoke: (expectedAdministratorUid?: string) => Promise<T>
): Promise<T> {
  const confirm = confirmIdentity;
  if (!confirm) return invoke();
  const user = auth.currentUser;
  try {
    return await invoke();
  } catch (error) {
    const wrapped = error as { cause?: unknown } | null;
    const failure = (wrapped?.cause ?? error) as {
      code?: string;
      details?: { code?: string };
    } | null;
    if (
      failure?.code !== 'functions/failed-precondition' ||
      failure.details?.code !== 'ADMIN_RECENT_AUTH_REQUIRED' ||
      !user ||
      auth.currentUser !== user ||
      confirmIdentity !== confirm ||
      !(await confirm(user)) ||
      auth.currentUser !== user ||
      confirmIdentity !== confirm
    ) {
      throw error;
    }
    // Replay only the server's pre-execution denial, once. Bind the authenticated
    // UID again on the server because Firebase resolves the token asynchronously.
    return invoke(user.uid);
  }
}
