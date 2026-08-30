import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Course } from '../../src/types';

const { mockDeleteDoc, mockGetDoc, mockSetDoc, mockUpdateDoc } = vi.hoisted(() => ({
  mockDeleteDoc: vi.fn(),
  mockGetDoc: vi.fn(),
  mockSetDoc: vi.fn(),
  mockUpdateDoc: vi.fn(),
}));

vi.mock('../../src/infrastructure/firebase', () => ({
  db: {},
  doc: (_db: unknown, collection: string, id: string) => ({ path: `${collection}/${id}` }),
  getDoc: mockGetDoc,
  setDoc: mockSetDoc,
  updateDoc: mockUpdateDoc,
  deleteDoc: mockDeleteDoc,
}));

vi.mock('../../src/features/courses/enrollInCourseCallable', () => ({
  enrollInCourseViaCallable: vi.fn(),
}));

vi.mock('../../src/domain/notifications', () => ({
  createNotificationForUser: vi.fn(),
  buildNotification: vi.fn(),
  translateKey: vi.fn(),
}));

import {
  addCourseService,
  CanonicalCourseAdminWriteBlockedError,
  deleteCourseService,
  updateCourseService,
} from '../../src/features/courses/courseService';

const legacyCourse: Course = {
  id: 'course-legacy',
  title: 'Legacy course',
  duration: '5 days',
  description: 'Legacy',
  dates: 'December',
  totalSeats: 8,
  availableSeats: 8,
  price: 100,
  bgImageUrl: '',
};

describe('legacy Admin Course write containment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    ['create', () => addCourseService(legacyCourse)],
    ['update', () => updateCourseService(legacyCourse)],
    ['delete', () => deleteCourseService(legacyCourse.id)],
  ] as const)('blocks %s when the existing identity is canonical', async (operation, run) => {
    mockGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({ ...legacyCourse, provisioningManifestFingerprint: 'canonical-fingerprint' }),
    });

    await expect(run()).rejects.toMatchObject<Partial<CanonicalCourseAdminWriteBlockedError>>({
      name: 'CanonicalCourseAdminWriteBlockedError',
      courseId: legacyCourse.id,
      operation,
    });
    expect(mockSetDoc).not.toHaveBeenCalled();
    expect(mockUpdateDoc).not.toHaveBeenCalled();
    expect(mockDeleteDoc).not.toHaveBeenCalled();
  });

  it('preserves create, update, and delete for legacy Course identities', async () => {
    mockGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => legacyCourse,
    });

    await addCourseService(legacyCourse);
    await updateCourseService(legacyCourse);
    await deleteCourseService(legacyCourse.id);

    expect(mockSetDoc).toHaveBeenCalledOnce();
    expect(mockUpdateDoc).toHaveBeenCalledOnce();
    expect(mockDeleteDoc).toHaveBeenCalledOnce();
  });
});
