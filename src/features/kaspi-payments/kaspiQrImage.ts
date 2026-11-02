import { firebaseEmulatorConfig } from '../../infrastructure/firebase';

// Persist HTTPS URLs in every environment; local emulator rendering stays local.
export function kaspiQrImageSource(url: string) {
  let image: URL;
  try {
    image = new URL(url);
  } catch {
    return undefined;
  }
  if (image.protocol !== 'https:') return undefined;
  if (firebaseEmulatorConfig.useEmulators && image.hostname === 'firebasestorage.googleapis.com') {
    image.protocol = 'http:';
    image.host = `${firebaseEmulatorConfig.host}:${firebaseEmulatorConfig.ports.storage}`;
  }
  return image.toString();
}
