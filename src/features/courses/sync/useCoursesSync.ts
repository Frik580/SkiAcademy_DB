import { useEffect } from 'react';
import {
  collection,
  db,
  handleFirestoreError,
  limit,
  onSnapshot,
  OperationType,
  query,
} from '../../../lib/firebase';
import { toCourse } from '../../../lib/firestoreMappers';
import { QUERY_LIMITS } from '../../../lib/queryLimits';
import { useCoursesStore } from '../coursesStore';

export const useCoursesSync = () => {
  // Courses listener
  useEffect(() => {
    const coursesQuery = query(collection(db, 'courses'), limit(QUERY_LIMITS.courses));
    return onSnapshot(
      coursesQuery,
      (snapshot) => {
        useCoursesStore
          .getState()
          .setCourses(
            snapshot.docs.map((courseDoc) => toCourse(courseDoc.id, courseDoc.data()))
          );
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'courses')
    );
  }, []);
};
