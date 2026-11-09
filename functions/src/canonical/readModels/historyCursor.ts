import { HttpsError } from 'firebase-functions/v2/https';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import type { z } from 'zod';

const invalidCursor = () => new HttpsError('invalid-argument', 'The history cursor is invalid.');
const cursorKey = (namespace: string, secret: string) =>
  createHash('sha256').update(`${namespace}\0${secret}`).digest();
export function encodeHistoryCursor(namespace: string, cursor: unknown, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', cursorKey(namespace, secret), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(cursor), 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64url');
}

export function decodeHistoryCursor<T>(
  namespace: string,
  value: string,
  secret: string,
  schema: z.ZodType<T>
): T {
  try {
    if (!/^[A-Za-z0-9_-]+$/.test(value)) throw invalidCursor();
    const bytes = Buffer.from(value, 'base64url');
    if (bytes.toString('base64url') !== value || bytes.length < 29) throw invalidCursor();
    const decipher = createDecipheriv(
      'aes-256-gcm',
      cursorKey(namespace, secret),
      bytes.subarray(0, 12)
    );
    decipher.setAuthTag(bytes.subarray(12, 28));
    const plaintext = Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]);
    return schema.parse(JSON.parse(plaintext.toString('utf8')));
  } catch {
    throw invalidCursor();
  }
}
