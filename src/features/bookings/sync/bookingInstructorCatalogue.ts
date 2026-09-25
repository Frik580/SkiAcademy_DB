import {
  normalizeInstructorSpokenLanguages,
  type BookingInstructorCatalogueItem,
} from '@ski-academy/shared-domain';
import type { Instructor } from '../../../types';

export function toBookingCatalogueInstructor(item: BookingInstructorCatalogueItem): Instructor {
  return {
    id: item.instructorId,
    name: item.name,
    specialty: item.specialty ?? 'ski',
    rating: null,
    reviewsCount: 0,
    languages: normalizeInstructorSpokenLanguages(item.languages ?? []),
    experienceYears: item.experienceYears ?? 0,
    bio: item.bio ?? '',
    ...(item.bioRu ? { bioRu: item.bioRu } : {}),
    ...(item.bioEn ? { bioEn: item.bioEn } : {}),
    avatarUrl: item.avatarUrl ?? '',
    pricePerHour: item.pricePerHour ?? item.pricePerHourKZT ?? 0,
    ...(item.pricePerHourKZT !== undefined ? { pricePerHourKZT: item.pricePerHourKZT } : {}),
    isAvailable: item.isAvailable,
    ...(item.phoneNumber ? { phoneNumber: item.phoneNumber } : {}),
  };
}
