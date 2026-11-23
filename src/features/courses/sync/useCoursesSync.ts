import { useEffect } from 'react';
import { subscribeScopedDocuments } from '../../../lib/canonical/scopedClientDocuments';
import { handleFirestoreError, OperationType } from '../../../infrastructure/firebase';
import { QUERY_LIMITS } from '../../../shared';
import { useCourseEnrollmentStore } from '../../course-enrollments/courseEnrollmentStore';
import { useCourseCatalogReadSync } from '../../course-enrollments/useCourseEnrollmentReadSync';
import { useAuthStore } from '../../auth/authStore';
import { useProfileStore } from '../../profile/profileStore';
import { useDataSyncScope } from '../../../store/useDataSyncScope';
import { courseFromProductCatalogItem } from '../courseCatalogProduct';
import { useCoursesStore } from '../coursesStore';
import { resolveCourseDocument } from '../courseDisplay';

export const useCoursesSync = (catalogReadAlreadyOwned = false) => {
  const { catalogueScope } = useDataSyncScope();
  const instructorId = useProfileStore((state) => state.userProfile?.instructorId);
  const firebaseUserId = useAuthStore((state) => state.firebaseUser?.uid);
  const authGeneration = useAuthStore((state) => state.authGeneration);
  const authLoading = useAuthStore((state) => state.authLoading);

  useCourseCatalogReadSync(!catalogReadAlreadyOwned && catalogueScope === 'full');

  useEffect(() => {
    if (authLoading) return;
    const isCurrent = () =>
      !useAuthStore.getState().authLoading &&
      useAuthStore.getState().authGeneration === authGeneration &&
      useAuthStore.getState().firebaseUser?.uid === firebaseUserId;
    if (useCoursesStore.getState().catalogueScope !== catalogueScope) {
      useCoursesStore.setState({ catalogueScope, courses: [], publicCoursesStatus: 'loading' });
    }

    if (catalogueScope === 'full') {
      const publish = (state: ReturnType<typeof useCourseEnrollmentStore.getState>) => {
        if (!isCurrent()) return;
        useCoursesStore.setState({
          courses: state.catalogRecords.flatMap((item) => {
            const course = courseFromProductCatalogItem(item);
            return course ? [course] : [];
          }),
          publicCoursesStatus: state.catalogStatus === 'idle' ? 'loading' : state.catalogStatus,
        });
      };
      const unsubscribe = useCourseEnrollmentStore.subscribe((state, previous) => {
        if (
          state.catalogRecords !== previous.catalogRecords ||
          state.catalogStatus !== previous.catalogStatus
        )
          publish(state);
      });
      publish(useCourseEnrollmentStore.getState());
      return unsubscribe;
    }

    if (!instructorId) {
      useCoursesStore.getState().setCourses([]);
      return;
    }

    let courseDocs: Array<{ id: string; data: Record<string, unknown> }> = [];
    let contentById = new Map<string, Record<string, unknown>>();
    const waitForContent = useCoursesStore.getState().courses.length > 0;
    let coursesReady = false;
    let contentReady = false;
    const publish = () => {
      if (!isCurrent() || !coursesReady || (waitForContent && !contentReady)) return;
      useCoursesStore.getState().setCourses(
        courseDocs.flatMap(({ id, data }) => {
          const roster = data.instructorRosterIds ?? data.instructorIds;
          if (!Array.isArray(roster) || !roster.includes(instructorId)) return [];
          const course = resolveCourseDocument(id, data, contentById.get(id));
          return course ? [course] : [];
        })
      );
    };
    const stopCourses = subscribeScopedDocuments(
      { collection: 'courses', take: QUERY_LIMITS.courses },
      (snapshot) => {
        if (snapshot.metadata.fromCache && snapshot.docs.length === 0) return;
        coursesReady = true;
        courseDocs = snapshot.docs.map((doc) => ({ id: doc.id, data: doc.data() }));
        publish();
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'courses')
    );
    const stopContent = subscribeScopedDocuments(
      { collection: 'course_catalog_content', take: QUERY_LIMITS.courses },
      (snapshot) => {
        if (snapshot.metadata.fromCache && snapshot.docs.length === 0) return;
        contentReady = true;
        contentById = new Map(snapshot.docs.map((doc) => [doc.id, doc.data()]));
        publish();
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'course_catalog_content')
    );
    return () => {
      stopCourses();
      stopContent();
    };
  }, [authGeneration, authLoading, catalogueScope, firebaseUserId, instructorId]);
};
