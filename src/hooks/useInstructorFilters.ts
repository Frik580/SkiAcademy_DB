import { useCallback, useMemo } from 'react';
import { Instructor } from '../types';
import { Language, translateInstructor } from '../lib/LanguageContext';
import { useBookingsStore } from '../features/bookings/bookingsStore';
import { useSettingsStore } from '../features/settings/settingsStore';
import { useUiStore } from '../features/ui/uiStore';

export type InstructorSortBy = 'rating' | 'priceAsc' | 'priceDesc' | 'experience';
export type InstructorSpecialty = 'all' | 'ski' | 'snowboard' | 'both';

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
        const matchLang = selectedLanguage === 'all' || ins.languages.includes(selectedLanguage);

        return matchSearch && matchSpec && matchLang;
      })
      .sort((a, b) => {
        if (sortBy === 'rating') return b.rating - a.rating;
        if (sortBy === 'experience') return b.experienceYears - a.experienceYears;
        if (sortBy === 'priceAsc') return a.pricePerHour - b.pricePerHour;
        if (sortBy === 'priceDesc') return b.pricePerHour - a.pricePerHour;
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
