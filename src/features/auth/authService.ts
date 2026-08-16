import { signOut as fbSignOut } from 'firebase/auth';
import { auth } from '../../lib/firebase';

export async function signOutService(): Promise<void> {
  await fbSignOut(auth);
}
