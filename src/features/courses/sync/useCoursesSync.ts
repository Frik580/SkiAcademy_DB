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
import { toCourse } from '../../../infrastructure/firebase';
import { QUERY_LIMITS } from '../../../shared';
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
          .setCourses(snapshot.docs.map((courseDoc) => toCourse(courseDoc.id, courseDoc.data())));
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'courses')
    );
  }, []);
};
