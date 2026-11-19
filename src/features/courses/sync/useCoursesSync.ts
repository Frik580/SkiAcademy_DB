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
import { useCourseEnrollmentStore } from '../../course-enrollments/courseEnrollmentStore';
import { reloadCourseCatalog } from '../../course-enrollments/useCourseEnrollmentReadSync';
import { useAuthStore } from '../../auth/authStore';
import { useProfileStore } from '../../profile/profileStore';
import { useDataSyncScope } from '../../../store/useDataSyncScope';
import { courseFromProductCatalogItem } from '../courseCatalogProduct';
import { useCoursesStore } from '../coursesStore';
import { resolveCourseDocument } from '../courseDisplay';
import { isLiveCompatibleResource } from '../../../lib/canonical/liveCompatibleClientRead';

export const useCoursesSync = (catalogReadAlreadyOwned = false) => {
  const { catalogueScope } = useDataSyncScope();
  const instructorId = useProfileStore((s) =>
    catalogueScope === 'instructor' ? s.userProfile?.instructorId : undefined
  );
  const firebaseUserId = useAuthStore((state) => state.firebaseUser?.uid);
  const authGeneration = useAuthStore((state) => state.authGeneration);
  const retryNonce = useCoursesStore((state) => state.publicCoursesRetryNonce);

  useEffect(() => {
    const isCurrentPrincipal = () =>
      useAuthStore.getState().authGeneration === authGeneration &&
      useAuthStore.getState().firebaseUser?.uid === firebaseUserId;
    if (useCoursesStore.getState().catalogueScope !== catalogueScope) {
      useCoursesStore.setState({ catalogueScope, courses: [], publicCoursesStatus: 'loading' });
    }
    if (catalogueScope === 'instructor' && !instructorId) {
      useCoursesStore.getState().setCourses([]);
      return;
    }

    if (catalogueScope !== 'instructor' && firebaseUserId) {
      // The canonical catalog owns both availability and product presentation.
      // Subscribe before loading so mount and manual retry publish the same response.
      const publishProductCourses = (
        state: ReturnType<typeof useCourseEnrollmentStore.getState>
      ) => {
        if (state.catalogStatus !== 'ready' || !isCurrentPrincipal()) return;
        useCoursesStore.getState().setCourses(
          state.catalogRecords.flatMap((item) => {
            const course = courseFromProductCatalogItem(item);
            return course ? [course] : [];
          })
        );
      };
      const unsubscribe = useCourseEnrollmentStore.subscribe((state, previous) => {
        if (
          state.catalogRecords !== previous.catalogRecords ||
          state.catalogStatus !== previous.catalogStatus
        ) {
          publishProductCourses(state);
        }
      });
      publishProductCourses(useCourseEnrollmentStore.getState());
      if (!catalogReadAlreadyOwned) void reloadCourseCatalog();
      return unsubscribe;
    }

    let courseDocs: Array<{ id: string; data: Record<string, unknown> }> = [];
    let catalogContentById = new Map<string, Record<string, unknown>>();
    let coursesReady = false;
    let contentReady = false;
    let coursesConfirmed = false;
    let contentConfirmed = false;
    let active = true;
    const hasExistingCourses = useCoursesStore.getState().courses.length > 0;
    const isCurrent = () => active && isCurrentPrincipal();
    const fail = (error: unknown, path: string) => {
      if (!isCurrent()) return;
      if (catalogueScope === 'full') useCoursesStore.setState({ publicCoursesStatus: 'error' });
      handleFirestoreError(error, OperationType.LIST, path);
    };

    const publishCourses = () => {
      if (!coursesReady || (hasExistingCourses && !contentReady)) return;
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
      if (
        catalogueScope === 'full' &&
        coursesConfirmed &&
        contentConfirmed &&
        useCoursesStore.getState().publicCoursesStatus !== 'error'
      ) {
        useCoursesStore.setState({ publicCoursesStatus: 'ready' });
      }
    };

    const coursesQuery = query(collection(db, 'courses'), limit(QUERY_LIMITS.courses));
    const contentQuery = query(
      collection(db, 'course_catalog_content'),
      limit(QUERY_LIMITS.courses)
    );

    const unsubscribeCourses = onSnapshot(
      coursesQuery,
      { includeMetadataChanges: true },
      (snapshot) => {
        if (!isCurrent()) return;
        if (snapshot.metadata.fromCache && snapshot.docs.length === 0) return;
        coursesReady = true;
        coursesConfirmed ||= !snapshot.metadata.fromCache;
        courseDocs = snapshot.docs.map((courseDoc) => ({
          id: courseDoc.id,
          data: courseDoc.data() as Record<string, unknown>,
        }));
        publishCourses();
      },
      (error) => fail(error, 'courses')
    );

    const unsubscribeContent = onSnapshot(
      contentQuery,
      { includeMetadataChanges: true },
      (snapshot) => {
        if (!isCurrent()) return;
        if (snapshot.metadata.fromCache && snapshot.docs.length === 0) return;
        contentReady = true;
        contentConfirmed ||= !snapshot.metadata.fromCache;
        catalogContentById = new Map(
          snapshot.docs.flatMap((contentDoc) => {
            const data = contentDoc.data() as Record<string, unknown>;
            return isLiveCompatibleResource(data) ? [[contentDoc.id, data] as const] : [];
          })
        );
        publishCourses();
      },
      (error) => fail(error, 'course_catalog_content')
    );

    return () => {
      active = false;
      unsubscribeCourses();
      unsubscribeContent();
    };
  }, [
    authGeneration,
    catalogReadAlreadyOwned,
    catalogueScope,
    firebaseUserId,
    instructorId,
    retryNonce,
  ]);
};
