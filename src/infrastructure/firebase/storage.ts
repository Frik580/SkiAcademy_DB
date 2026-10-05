import type { FirebaseStorage } from 'firebase/storage';
import { app } from './firebase';
import { firebaseEmulatorConfig } from './firebaseEmulatorConfig';
import { logger } from '../../shared';

type StorageSdk = typeof import('firebase/storage');
let storageRuntime: Promise<{ sdk: StorageSdk; storage: FirebaseStorage }> | undefined;

declare global {
  interface Window {
    __skiAcademyFirebaseStorageEmulatorConnected__?: boolean;
  }
}

function getStorageRuntime() {
  // Cache the in-flight initialization too: concurrent first uploads share it.
  storageRuntime ??= import('firebase/storage')
    .then((sdk) => {
      const storage = sdk.getStorage(app);
      if (
        firebaseEmulatorConfig.useEmulators &&
        typeof window !== 'undefined' &&
        !window.__skiAcademyFirebaseStorageEmulatorConnected__
      ) {
        sdk.connectStorageEmulator(
          storage,
          firebaseEmulatorConfig.host,
          firebaseEmulatorConfig.ports.storage
        );
        window.__skiAcademyFirebaseStorageEmulatorConnected__ = true;
      }
      return { sdk, storage };
    })
    .catch((error: unknown) => {
      storageRuntime = undefined;
      throw error;
    });
  return storageRuntime;
}

export async function uploadImage(blob: Blob, path: string): Promise<string> {
  const { sdk, storage } = await getStorageRuntime();
  const storageRef = sdk.ref(storage, path);
  await sdk.uploadBytes(storageRef, blob);
  return sdk.getDownloadURL(storageRef);
}

export async function deleteImage(path: string): Promise<void> {
  try {
    const { sdk, storage } = await getStorageRuntime();
    const storageRef = sdk.ref(storage, path);
    await sdk.deleteObject(storageRef);
  } catch (err) {
    logger.warn(`Failed to delete storage image at ${path}:`, err);
  }
}

export function blobFromDataUrl(dataUrl: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    fetch(dataUrl)
      .then((res) => res.blob())
      .then((blob) => resolve(blob))
      .catch(reject);
  });
}
