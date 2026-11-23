import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { Timestamp } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';

export function scopedReadCursor(secret: string, binding: string) {
  const key = createHash('sha256').update(secret).digest();
  return {
    encode(values: unknown[]) {
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', key, iv);
      cipher.setAAD(Buffer.from(binding));
      const data = Buffer.concat([
        cipher.update(JSON.stringify({ values, expires: Date.now() + 3600000 })),
        cipher.final(),
      ]);
      return Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64url');
    },
    decode(token: string): unknown[] {
      try {
        const bytes = Buffer.from(token, 'base64url');
        const decipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12));
        decipher.setAAD(Buffer.from(binding));
        decipher.setAuthTag(bytes.subarray(12, 28));
        const value = JSON.parse(
          Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString()
        );
        if (!Array.isArray(value.values) || value.expires < Date.now()) throw new Error('cursor');
        return value.values.map((entry: unknown) =>
          entry && typeof entry === 'object' && 'timestamp' in entry
            ? new Timestamp(
                (entry as { timestamp: number[] }).timestamp[0],
                (entry as { timestamp: number[] }).timestamp[1]
              )
            : entry
        );
      } catch {
        throw new HttpsError('invalid-argument', 'Invalid cursor.');
      }
    },
  };
}
