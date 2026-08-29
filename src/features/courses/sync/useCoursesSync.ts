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
import { QUERY_LIMITS } from '../../../shared';
import { useProfileStore } from '../../profile/profileStore';
import { useDataSyncScope } from '../../../store/useDataSyncScope';
import { useCoursesStore } from '../coursesStore';
import { resolveCourseDocument } from '../courseDisplay';

export const useCoursesSync = () => {
  const { catalogueScope } = useDataSyncScope();
  const instructorId = useProfileStore((s) => s.userProfile?.instructorId);

  useEffect(() => {
    if (catalogueScope === 'instructor' && !instructorId) {
      useCoursesStore.getState().setCourses([]);
      return;
    }

    let courseDocs: Array<{ id: string; data: Record<string, unknown> }> = [];
    let catalogContentById = new Map<string, Record<string, unknown>>();

    const publishCourses = () => {
      useCoursesStore.getState().setCourses(
        courseDocs.flatMap((courseDoc) => {
          const data = courseDoc.data;
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
          snapshot.docs.map((contentDoc) => [
            contentDoc.id,
            contentDoc.data() as Record<string, unknown>,
          ])
        );
        publishCourses();
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'course_catalog_content')
    );

    return () => {
      unsubscribeCourses();
      unsubscribeContent();
    };
  }, [catalogueScope, instructorId]);
};
