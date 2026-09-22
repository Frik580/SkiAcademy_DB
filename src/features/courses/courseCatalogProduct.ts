import type { CourseCatalogReadModel } from '@ski-academy/shared-domain';
import type { Course } from '../../types';
import { buildCourseFromCanonicalAggregateAndContent } from './courseDisplay';

export function courseFromProductCatalogItem(item: CourseCatalogReadModel): Course | null {
  return buildCourseFromCanonicalAggregateAndContent(
    item.courseId,
    {
      title: item.title,
      price: item.price,
      lifecycle: 'active',
      capacity: {
        totalSeats: item.capacity.totalSeats,
        availableSeats: item.capacity.availableSeats,
      },
    },
    item.presentation
      ? {
          courseId: item.courseId,
          revision: item.revision,
          ...item.presentation,
        }
      : null
  );
}
