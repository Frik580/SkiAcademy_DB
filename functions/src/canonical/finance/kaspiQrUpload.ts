import { getStorage } from 'firebase-admin/storage';
import sharp from 'sharp';
import { KASPI_QR_MAX_BYTES, KASPI_QR_MIME_TYPES } from '@ski-academy/shared-domain';
import { getOrInitApp } from '../../adminApp';

// Objects in this namespace are create-only under Storage Rules, including for admins.
export async function verifyKaspiQrUpload(path: string): Promise<string> {
  const bucket = getStorage(getOrInitApp()).bucket();
  const [metadata] = await bucket.file(path).getMetadata();
  if (
    !KASPI_QR_MIME_TYPES.includes(metadata.contentType as (typeof KASPI_QR_MIME_TYPES)[number]) ||
    Number(metadata.size) <= 0 ||
    Number(metadata.size) >= KASPI_QR_MAX_BYTES
  ) {
    throw new Error('Invalid QR upload');
  }
  const [bytes] = await bucket.file(path).download();
  const image = await sharp(bytes, { limitInputPixels: 25_000_000 }).metadata();
  if (!['png', 'jpeg', 'webp'].includes(image.format ?? '')) throw new Error('Invalid QR image');
  return `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(bucket.name)}/o/${encodeURIComponent(path)}?alt=media`;
}
