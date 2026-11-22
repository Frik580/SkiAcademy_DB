import { app, auth } from './firebase';
import { firebaseEmulatorConfig } from './firebaseEmulatorConfig';

const marker = 'protected-image:';
export function protectedImageStoragePath(value: string): string | undefined {
  if (value.startsWith(marker)) return value.slice(marker.length).split('#')[0];
  let path = value;
  if (/^https?:/.test(value)) {
    try {
      const url = new URL(value);
      const match = /^\/v0\/b\/([^/]+)\/o\/(.+)$/.exec(url.pathname);
      if (
        url.hostname !== 'firebasestorage.googleapis.com' ||
        !match ||
        decodeURIComponent(match[1]) !== app.options.storageBucket
      )
        return;
      path = decodeURIComponent(match[2]);
    } catch {
      return undefined;
    }
  }
  return /^(test-actors\/|test-sessions\/[^/]+\/(misc|course-assets)\/)/.test(path)
    ? path
    : undefined;
}
export function serverImageUpload(path: string) {
  return (
    !!protectedImageStoragePath(path) || /^(participant-avatars|courses|instructors)\//.test(path)
  );
}
export function publicImageUrl(path: string): string {
  const origin = firebaseEmulatorConfig.useEmulators
    ? `http://${firebaseEmulatorConfig.host}:${firebaseEmulatorConfig.ports.storage}`
    : 'https://firebasestorage.googleapis.com';
  return `${origin}/v0/b/${encodeURIComponent(app.options.storageBucket ?? '')}/o/${encodeURIComponent(path)}?alt=media`;
}
async function request(path: string, body?: Blob, signal?: AbortSignal) {
  const user = auth.currentUser;
  if (!user) throw new Error('Authentication required.');
  const region = import.meta.env.VITE_FIREBASE_FUNCTIONS_REGION || 'us-central1';
  const base = firebaseEmulatorConfig.useEmulators
    ? `http://${firebaseEmulatorConfig.host}:${firebaseEmulatorConfig.ports.functions}/${app.options.projectId}/${region}/protectedImages`
    : `https://${region}-${app.options.projectId}.cloudfunctions.net/protectedImages`;
  const response = await fetch(`${base}?${new URLSearchParams({ path })}`, {
    method: body ? 'POST' : 'GET',
    body,
    signal,
    cache: 'no-store',
    headers: {
      Authorization: `Bearer ${await user.getIdToken()}`,
      ...(body ? { 'Content-Type': body.type } : {}),
    },
  });
  if (!response.ok) throw new Error(`Image access denied (${response.status}).`);
  return response;
}
export async function uploadServerImage(blob: Blob, path: string): Promise<string> {
  const response = await request(path, blob);
  const uploaded = (await response.json()) as { path: string };
  return protectedImageStoragePath(uploaded.path)
    ? marker + uploaded.path + '#v=' + Date.now()
    : publicImageUrl(uploaded.path) + `&v=${Date.now()}`;
}
export async function readProtectedImage(value: string, signal: AbortSignal): Promise<Blob> {
  const path = protectedImageStoragePath(value);
  if (!path) throw new Error('Invalid protected image.');
  return (await request(path, undefined, signal)).blob();
}
