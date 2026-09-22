import { useEffect } from 'react';
import {
  collection,
  db,
  handleFirestoreError,
  limit,
  onSnapshot,
  OperationType,
  query,
} from '../../../infrastructure/firebase';
import { QUERY_LIMITS, logger } from '../../../shared';
import { queryCourseCatalogReadModels } from '../../../lib/canonical/canonicalReadModelClient';
import { useAuthStore } from '../../auth/authStore';
import { useProfileStore } from '../../profile/profileStore';
import { useDataSyncScope } from '../../../store/useDataSyncScope';
import { courseFromProductCatalogItem } from '../courseCatalogProduct';
import { useCoursesStore } from '../coursesStore';
import { resolveCourseDocument } from '../courseDisplay';
import { isLiveCompatibleResource } from '../../../lib/canonical/liveCompatibleClientRead';

export const useCoursesSync = () => {
  const { catalogueScope } = useDataSyncScope();
  const instructorId = useProfileStore((s) => s.userProfile?.instructorId);
  const firebaseUserId = useAuthStore((state) => state.firebaseUser?.uid);
  const authGeneration = useAuthStore((state) => state.authGeneration);

  useEffect(() => {
    if (catalogueScope === 'instructor' && !instructorId) {
      useCoursesStore.getState().setCourses([]);
      return;
    }

    if (catalogueScope !== 'instructor' && firebaseUserId) {
      let cancelled = false;
      useCoursesStore.getState().setCourses([]);
      void queryCourseCatalogReadModels({ scope: 'product' })
        .then((result) => {
          if (cancelled || useAuthStore.getState().firebaseUser?.uid !== firebaseUserId) return;
          useCoursesStore.getState().setCourses(
            result.items.flatMap((item) => {
              const course = courseFromProductCatalogItem(item);
              return course ? [course] : [];
            })
          );
        })
        .catch((error) => {
          logger.error('Product course catalogue read failed', error);
          if (!cancelled && useAuthStore.getState().firebaseUser?.uid === firebaseUserId) {
            useCoursesStore.getState().setCourses([]);
          }
        });
      return () => {
        cancelled = true;
      };
    }

    let courseDocs: Array<{ id: string; data: Record<string, unknown> }> = [];
    let catalogContentById = new Map<string, Record<string, unknown>>();

    const publishCourses = () => {
      useCoursesStore.getState().setCourses(
        courseDocs.flatMap((courseDoc) => {
          const data = courseDoc.data;
          if (!isLiveCompatibleResource(data)) {
            return [];
          }
          if (catalogueScope === 'instructor') {
            const roster = (data.instructorRosterIds ?? data.instructorIds) as unknown;
            if (!Array.isArray(roster) || !roster.includes(instructorId)) {
              return [];
            }
          }
          const course = resolveCourseDocument(
            courseDoc.id,
            data,
            catalogContentById.get(courseDoc.id)
          );
          return course ? [course] : [];
        })
      );
    };

    const coursesQuery = query(collection(db, 'courses'), limit(QUERY_LIMITS.courses));
    const contentQuery = query(
      collection(db, 'course_catalog_content'),
      limit(QUERY_LIMITS.courses)
    );

    const unsubscribeCourses = onSnapshot(
      coursesQuery,
      (snapshot) => {
        if (useAuthStore.getState().firebaseUser?.uid && catalogueScope !== 'instructor') return;
        courseDocs = snapshot.docs.map((courseDoc) => ({
          id: courseDoc.id,
          data: courseDoc.data() as Record<string, unknown>,
        }));
        publishCourses();
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'courses')
    );

    const unsubscribeContent = onSnapshot(
      contentQuery,
      (snapshot) => {
        catalogContentById = new Map(
          snapshot.docs.flatMap((contentDoc) => {
            const data = contentDoc.data() as Record<string, unknown>;
            return isLiveCompatibleResource(data) ? [[contentDoc.id, data] as const] : [];
          })
        );
        publishCourses();
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'course_catalog_content')
    );

    return () => {
      unsubscribeCourses();
      unsubscribeContent();
    };
  }, [authGeneration, catalogueScope, firebaseUserId, instructorId]);
};
