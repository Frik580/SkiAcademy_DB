import { useEffect } from 'react';
import {
  collection,
  db,
  handleFirestoreError,
  limit,
  onSnapshot,
  OperationType,
  query,
  where,
} from '../../../infrastructure/firebase';
import { toCourse } from '../../../infrastructure/firebase';
import { QUERY_LIMITS } from '../../../shared';
import { useProfileStore } from '../../profile/profileStore';
import { useDataSyncScope } from '../../../store/useDataSyncScope';
import { useCoursesStore } from '../coursesStore';

export const useCoursesSync = () => {
  const { catalogueScope } = useDataSyncScope();
  const instructorId = useProfileStore((s) => s.userProfile?.instructorId);

  // The public, cabinet and admin screens need the catalogue. An instructor only needs courses
  // to which they are assigned, so avoid subscribing to the complete collection in that workspace.
  useEffect(() => {
    if (catalogueScope === 'instructor' && !instructorId) {
      useCoursesStore.getState().setCourses([]);
      return;
    }

    const coursesQuery =
      catalogueScope === 'instructor'
        ? query(
            collection(db, 'courses'),
            where('instructorIds', 'array-contains', instructorId),
            limit(QUERY_LIMITS.courses)
          )
        : query(collection(db, 'courses'), limit(QUERY_LIMITS.courses));

    return onSnapshot(
      coursesQuery,
      (snapshot) => {
        useCoursesStore.getState().setCourses(
          snapshot.docs.flatMap((courseDoc) => {
            const course = toCourse(courseDoc.id, courseDoc.data());
            return course ? [course] : [];
          })
        );
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'courses')
    );
  }, [catalogueScope, instructorId]);
};
