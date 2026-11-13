import {
  LESSON_LEVEL_LOGO_MAX_BYTES,
  LESSON_LEVEL_LOGO_MIME_TYPES,
  LessonLevelLogoPathSchema,
} from '@ski-academy/shared-domain';
import { auth, getImageUrl, uploadImage } from '../../infrastructure/firebase';

export function validateLessonLevelLogo(file: Blob): void {
  if (
    !LESSON_LEVEL_LOGO_MIME_TYPES.some((type) => type === file.type) ||
    file.size === 0 ||
    file.size > LESSON_LEVEL_LOGO_MAX_BYTES
  )
    throw new Error('invalid_logo');
}

export function newLessonLevelLogoPath(levelId: string): string {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Authentication required');
  return LessonLevelLogoPathSchema.parse(`lesson-levels/${levelId}/${uid}/${crypto.randomUUID()}`);
}

// Keep a successful upload across command failures. Never delete on an ambiguous
// response: the command may already reference it. No background listing/polling.
const urls = new Map<string, Promise<string>>();
export async function uploadLessonLevelLogo(file: File, path: string): Promise<void> {
  validateLessonLevelLogo(file);
  LessonLevelLogoPathSchema.parse(path);
  // An interrupted acknowledgement may leave the immutable object uploaded.
  const existing = await getImageUrl(path).catch(() => undefined);
  const url = existing ?? (await uploadImage(file, path));
  urls.set(path, Promise.resolve(url));
}

export function getLessonLevelLogoUrl(path: string): Promise<string> {
  let result = urls.get(path);
  if (!result) {
    result = getImageUrl(LessonLevelLogoPathSchema.parse(path)).catch((error: unknown) => {
      urls.delete(path);
      throw error;
    });
    urls.set(path, result);
  }
  return result;
}
