import { useCallback, useMemo, useState } from 'react';
import { Instructor } from '../types';
import { Language, translateInstructor } from '../lib/LanguageContext';

export type InstructorSortBy = 'rating' | 'priceAsc' | 'priceDesc' | 'experience';
export type InstructorSpecialty = 'all' | 'ski' | 'snowboard' | 'both';

export const useInstructorFilters = (
  instructors: Instructor[],
  language: Language,
  filtersEnabled: boolean
) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSpecialty, setSelectedSpecialty] = useState<InstructorSpecialty>('all');
  const [selectedLanguage, setSelectedLanguage] = useState<string>('all');
  const [sortBy, setSortBy] = useState<InstructorSortBy>('rating');

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

  const resetFilters = useCallback(() => {
    setSearchQuery('');
    setSelectedSpecialty('all');
    setSelectedLanguage('all');
  }, []);

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
    resetFilters,
  };
};
