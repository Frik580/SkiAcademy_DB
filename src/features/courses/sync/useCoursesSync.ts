import { subscribeScopedDocuments } from '../../../lib/canonical/scopedClientDocuments';
import { useEffect } from 'react';
import { handleFirestoreError, OperationType } from '../../../infrastructure/firebase';
import { QUERY_LIMITS } from '../../../shared';
import { useCourseEnrollmentStore } from '../../course-enrollments/courseEnrollmentStore';
import { reloadCourseCatalog } from '../../course-enrollments/useCourseEnrollmentReadSync';
import { useAuthStore } from '../../auth/authStore';
import { useProfileStore } from '../../profile/profileStore';
import { useDataSyncScope } from '../../../store/useDataSyncScope';
import { courseFromProductCatalogItem } from '../courseCatalogProduct';
import { useCoursesStore } from '../coursesStore';
import { resolveCourseDocument } from '../courseDisplay';

export const useCoursesSync = (catalogReadAlreadyOwned = false) => {
  const { catalogueScope } = useDataSyncScope();
  const instructorId = useProfileStore((s) =>
    catalogueScope === 'instructor' ? s.userProfile?.instructorId : undefined
  );
  const firebaseUserId = useAuthStore((state) => state.firebaseUser?.uid);
  const authGeneration = useAuthStore((state) => state.authGeneration);
  const authLoading = useAuthStore((state) => state.authLoading);
  const retryNonce = useCoursesStore((state) => state.publicCoursesRetryNonce);

  useEffect(() => {
    if (authLoading) return;
    const isCurrentPrincipal = () =>
      !useAuthStore.getState().authLoading &&
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
    let confirmedIds = new Set<string>();
    let coursesReady = false;
    let contentReady = false;
    let coursesFailed = false;
    let contentFailed = false;
    let active = true;
    const isGuestCatalogue = catalogueScope === 'full';
    const shouldWaitForContent = isGuestCatalogue || useCoursesStore.getState().courses.length > 0;
    const isCurrent = () => active && isCurrentPrincipal();
    const fail = (error: unknown, path: string) => {
      if (!isCurrent()) return;
      if (isGuestCatalogue) useCoursesStore.setState({ publicCoursesStatus: 'error' });
      handleFirestoreError(error, OperationType.LIST, path);
    };
    const clearGuestCourses = () => {
      confirmedIds.clear();
      if (isCurrent()) useCoursesStore.setState({ courses: [], publicCoursesStatus: 'loading' });
    };

    const publishCourses = () => {
      if (!coursesReady || (shouldWaitForContent && !contentReady)) return;
      const refreshFailed = coursesFailed || contentFailed;
      const courses = courseDocs.flatMap((courseDoc) => {
        const data = courseDoc.data;
        if (catalogueScope === 'instructor') {
          const roster = (data.instructorRosterIds ?? data.instructorIds) as unknown;
          if (!Array.isArray(roster) || !roster.includes(instructorId)) {
            return [];
          }
        }
        // The two streams have independent revisions. Confirm presentation per course.
        const needsConfirmation = isGuestCatalogue && !confirmedIds.has(courseDoc.id);
        if (needsConfirmation && refreshFailed) return [];
        const course = resolveCourseDocument(
          courseDoc.id,
          data,
          catalogContentById.get(courseDoc.id),
          needsConfirmation
        );
        return course ? [course] : [];
      });
      if (isGuestCatalogue) {
        confirmedIds = new Set(courses.map(({ id }) => id));
        useCoursesStore.setState({
          courses,
          publicCoursesStatus: refreshFailed ? 'error' : 'ready',
        });
      } else useCoursesStore.getState().setCourses(courses);
    };

    const coursesQuery = { collection: 'courses' as const, take: QUERY_LIMITS.courses };
    const contentQuery = {
      collection: 'course_catalog_content' as const,
      take: QUERY_LIMITS.courses,
    };

    const unsubscribeCourses = subscribeScopedDocuments(
      coursesQuery,
      (snapshot) => {
        if (!isCurrent()) return;
        if (snapshot.metadata.fromCache && (isGuestCatalogue || snapshot.docs.length === 0)) return;
        coursesReady = true;
        coursesFailed = false;
        courseDocs = snapshot.docs.map((courseDoc) => ({
          id: courseDoc.id,
          data: courseDoc.data() as Record<string, unknown>,
        }));
        publishCourses();
      },
      (error) => {
        coursesFailed = true;
        fail(error, 'courses');
      },
      isGuestCatalogue
        ? () => {
            coursesReady = false;
            courseDocs = [];
            clearGuestCourses();
          }
        : undefined
    );

    const unsubscribeContent = subscribeScopedDocuments(
      contentQuery,
      (snapshot) => {
        if (!isCurrent()) return;
        if (snapshot.metadata.fromCache && (isGuestCatalogue || snapshot.docs.length === 0)) return;
        contentReady = true;
        contentFailed = false;
        catalogContentById = new Map(
          snapshot.docs.flatMap((contentDoc) => {
            const data = contentDoc.data() as Record<string, unknown>;
            return [[contentDoc.id, data] as const];
          })
        );
        publishCourses();
      },
      (error) => {
        contentFailed = true;
        fail(error, 'course_catalog_content');
      },
      isGuestCatalogue
        ? () => {
            contentReady = false;
            catalogContentById.clear();
            clearGuestCourses();
          }
        : undefined
    );

    return () => {
      active = false;
      unsubscribeCourses();
      unsubscribeContent();
    };
  }, [
    authGeneration,
    authLoading,
    catalogReadAlreadyOwned,
    catalogueScope,
    firebaseUserId,
    instructorId,
    retryNonce,
  ]);
};
