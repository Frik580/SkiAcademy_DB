import { useCallback, useMemo } from 'react';
import { Instructor } from '../types';
import { normalizeInstructorSpokenLanguage } from '@ski-academy/shared-domain/canonical/instructorSpokenLanguage';
import { Language, translateInstructor } from '../app/providers/LanguageContext';
import { useBookingsStore } from '../features/bookings/bookingsStore';
import { useSettingsStore } from '../features/settings/settingsStore';
import { useUiStore } from '../features/shell';
import { resolveInstructorHourlyRateKztForDisplay } from '../domain/pricing';

export type InstructorSortBy = 'rating' | 'priceAsc' | 'priceDesc' | 'experience';
export type InstructorSpecialty = 'all' | 'ski' | 'snowboard' | 'both';

export function compareInstructorPriceKzt(
  a: Pick<Instructor, 'pricePerHourKZT'>,
  b: Pick<Instructor, 'pricePerHourKZT'>,
  sortBy: 'priceAsc' | 'priceDesc'
): number {
  const aRate = resolveInstructorHourlyRateKztForDisplay(a);
  const bRate = resolveInstructorHourlyRateKztForDisplay(b);
  if (aRate === undefined) return bRate === undefined ? 0 : 1;
  if (bRate === undefined) return -1;
  return sortBy === 'priceAsc' ? aRate - bRate : bRate - aRate;
}

export const useInstructorFilters = (language: Language) => {
  const instructors = useBookingsStore((s) => s.instructors);
  const filtersEnabled = useSettingsStore((s) => s.filtersEnabled);
  const searchQuery = useUiStore((s) => s.searchQuery);
  const selectedSpecialty = useUiStore((s) => s.selectedSpecialty);
  const selectedLanguage = useUiStore((s) => s.selectedLanguage);
  const sortBy = useUiStore((s) => s.sortBy);
  const setSearchQuery = useUiStore((s) => s.setSearchQuery);
  const setSelectedSpecialty = useUiStore((s) => s.setSelectedSpecialty);
  const setSelectedLanguage = useUiStore((s) => s.setSelectedLanguage);
  const setSortBy = useUiStore((s) => s.setSortBy);
  const resetFilters = useUiStore((s) => s.resetFilters);

  const translatedInstructors = useMemo<Instructor[]>(
    () => instructors.map((ins) => translateInstructor(ins, language)),
    [instructors, language]
  );

  const filteredInstructors = useMemo<Instructor[]>(() => {
    return translatedInstructors
      .filter((ins) => {
        if (!ins.isAvailable) return false;
        if (!filtersEnabled) return true;

        const matchSearch =
          ins.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          ins.bio.toLowerCase().includes(searchQuery.toLowerCase());
        const matchSpec = selectedSpecialty === 'all' || ins.specialty === selectedSpecialty;
        const selectedLanguageCode =
          selectedLanguage === 'all'
            ? 'all'
            : (normalizeInstructorSpokenLanguage(selectedLanguage) ?? selectedLanguage);
        const matchLang =
          selectedLanguageCode === 'all' ||
          ins.languages.some(
            (spoken) =>
              (normalizeInstructorSpokenLanguage(spoken) ?? spoken) === selectedLanguageCode
          );

        return matchSearch && matchSpec && matchLang;
      })
      .sort((a, b) => {
        if (sortBy === 'rating') return (b.rating ?? -1) - (a.rating ?? -1);
        if (sortBy === 'experience') return b.experienceYears - a.experienceYears;
        if (sortBy === 'priceAsc' || sortBy === 'priceDesc') {
          return compareInstructorPriceKzt(a, b, sortBy);
        }
        return 0;
      });
  }, [
    translatedInstructors,
    filtersEnabled,
    searchQuery,
    selectedSpecialty,
    selectedLanguage,
    sortBy,
  ]);

  const stableResetFilters = useCallback(() => resetFilters(), [resetFilters]);

  return {
    searchQuery,
    setSearchQuery,
    selectedSpecialty,
    setSelectedSpecialty,
    selectedLanguage,
    setSelectedLanguage,
    sortBy,
    setSortBy,
    translatedInstructors,
    filteredInstructors,
    resetFilters: stableResetFilters,
  };
};
