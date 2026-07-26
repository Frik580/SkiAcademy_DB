import { useState } from 'react';
import { Course } from '../../../types';
import { useLanguage } from '../../../lib/LanguageContext';
import { useNotifications } from '../../PushNotificationHub';
import { useCourseDateRange } from '../useCourseDateRange';

export interface UseCourseFormInput {
  courses: Course[];
  onAddCourse?: (course: Course) => Promise<void>;
  onUpdateCourse?: (course: Course) => Promise<void>;
}

export interface ProgramDay {
  titleEn: string;
  descEn: string;
  titleRu: string;
  descRu: string;
}

export interface FaqFields {
  qEn: string;
  aEn: string;
  qRu: string;
  aRu: string;
}

export const useCourseForm = ({ courses, onAddCourse, onUpdateCourse }: UseCourseFormInput) => {
  const { t, language } = useLanguage();
  const { addNotification } = useNotifications();
  const courseDateRange = useCourseDateRange();
  const {
    courseDuration,
    setCourseDuration,
    courseDates,
    loadCourseDateRange,
    resetCourseDateRange,
  } = courseDateRange;

  const [showCourseForm, setShowCourseForm] = useState(false);
  const [editingCourse, setEditingCourse] = useState<Course | null>(null);
  const [isSubmittingCourse, setIsSubmittingCourse] = useState(false);

  const [courseTitle, setCourseTitle] = useState('');
  const [courseTitleRu, setCourseTitleRu] = useState('');
  const [courseShortDescription, setCourseShortDescription] = useState('');
  const [courseShortDescriptionRu, setCourseShortDescriptionRu] = useState('');
  const [courseDetailedDescription, setCourseDetailedDescription] = useState('');
  const [courseDetailedDescriptionRu, setCourseDetailedDescriptionRu] = useState('');
  const [courseBadge, setCourseBadge] = useState('');
  const [courseBadgeRu, setCourseBadgeRu] = useState('');
  const [courseLevel, setCourseLevel] = useState<
    'beginner' | 'intermediate' | 'advanced' | 'expert' | ''
  >('');
  const [courseTotalSeats, setCourseTotalSeats] = useState(10);
  const [coursePrice, setCoursePrice] = useState(199);
  const [courseBgImageUrl, setCourseBgImageUrl] = useState('');
  const [courseIsHidden, setCourseIsHidden] = useState(false);
  const [selectedCourseInstructors, setSelectedCourseInstructors] = useState<string[]>([]);

  const [showRichCourseDetails, setShowRichCourseDetails] = useState(false);
  const [courseVideoUrl, setCourseVideoUrl] = useState('');
  const [courseBenefitsEn, setCourseBenefitsEn] = useState('');
  const [courseBenefitsRu, setCourseBenefitsRu] = useState('');

  const [courseProgramDays, setCourseProgramDays] = useState<ProgramDay[]>([
    { titleEn: '', descEn: '', titleRu: '', descRu: '' },
  ]);

  const [courseFaq1, setCourseFaq1] = useState<FaqFields>({ qEn: '', aEn: '', qRu: '', aRu: '' });
  const [courseFaq2, setCourseFaq2] = useState<FaqFields>({ qEn: '', aEn: '', qRu: '', aRu: '' });
  const [courseFaq3, setCourseFaq3] = useState<FaqFields>({ qEn: '', aEn: '', qRu: '', aRu: '' });

  const [courseGalleryPhotos, setCourseGalleryPhotos] = useState('');

  const buildCourseData = (): Course => {
    const benefitsArr = courseBenefitsEn
      .split('\n')
      .map((b) => b.trim())
      .filter(Boolean);
    const benefitsRuArr = courseBenefitsRu
      .split('\n')
      .map((b) => b.trim())
      .filter(Boolean);

    const programArr = courseProgramDays
      .map((day, idx) => ({
        day: `Day ${idx + 1}`,
        title: day.titleEn.trim(),
        desc: day.descEn.trim(),
      }))
      .filter((p) => p.title);

    const programRuArr = courseProgramDays
      .map((day, idx) => ({
        day: `День ${idx + 1}`,
        title: day.titleRu.trim(),
        desc: day.descRu.trim(),
      }))
      .filter((p) => p.title);

    const faqArr = [
      { q: courseFaq1.qEn.trim(), a: courseFaq1.aEn.trim() },
      { q: courseFaq2.qEn.trim(), a: courseFaq2.aEn.trim() },
      { q: courseFaq3.qEn.trim(), a: courseFaq3.aEn.trim() },
    ].filter((f) => f.q && f.a);

    const faqRuArr = [
      { q: courseFaq1.qRu.trim(), a: courseFaq1.aRu.trim() },
      { q: courseFaq2.qRu.trim(), a: courseFaq2.aRu.trim() },
      { q: courseFaq3.qRu.trim(), a: courseFaq3.aRu.trim() },
    ].filter((f) => f.q && f.a);

    const galleryArr = courseGalleryPhotos
      .split('\n')
      .map((p) => p.trim())
      .filter(Boolean);

    const courseId = editingCourse ? editingCourse.id : `course_${Date.now()}`;
    const courseData: any = {
      id: courseId,
    };

    if (editingCourse) {
      if (courseTitle.trim()) courseData.title = courseTitle.trim();
      if (courseTitleRu.trim()) courseData.titleRu = courseTitleRu.trim();
      if (courseDuration.trim()) courseData.duration = courseDuration.trim();
      courseData.description = courseShortDescription.trim() || editingCourse.description || '';
      if (courseDates.trim()) courseData.dates = courseDates.trim();
      if (courseTotalSeats) {
        courseData.totalSeats = Number(courseTotalSeats);
        courseData.availableSeats = Math.min(
          Number(courseTotalSeats),
          Number(courseTotalSeats) - (editingCourse.totalSeats - editingCourse.availableSeats)
        );
      }
      if (coursePrice) courseData.price = Number(coursePrice);
      if (courseBgImageUrl.trim()) courseData.bgImageUrl = courseBgImageUrl.trim();
      courseData.isHidden = courseIsHidden;
      if (selectedCourseInstructors.length > 0)
        courseData.instructorIds = selectedCourseInstructors;
      if (courseShortDescription.trim())
        courseData.shortDescription = courseShortDescription.trim();
      if (courseShortDescriptionRu.trim())
        courseData.shortDescriptionRu = courseShortDescriptionRu.trim();
      if (courseDetailedDescription.trim())
        courseData.detailedDescription = courseDetailedDescription.trim();
      if (courseDetailedDescriptionRu.trim())
        courseData.detailedDescriptionRu = courseDetailedDescriptionRu.trim();
      if (courseBadge.trim()) courseData.badge = courseBadge.trim();
      if (courseBadgeRu.trim()) courseData.badgeRu = courseBadgeRu.trim();
      if (courseLevel) courseData.level = courseLevel;
      courseData.videoUrl = courseVideoUrl.trim();
      if (benefitsArr.length > 0) courseData.benefits = benefitsArr;
      if (benefitsRuArr.length > 0) courseData.benefitsRu = benefitsRuArr;
      if (programArr.length > 0) courseData.program = programArr;
      if (programRuArr.length > 0) courseData.programRu = programRuArr;
      if (faqArr.length > 0) courseData.faq = faqArr;
      if (faqRuArr.length > 0) courseData.faqRu = faqRuArr;
      if (galleryArr.length > 0) courseData.galleryPhotos = galleryArr;
    } else {
      courseData.title = courseTitle.trim();
      if (courseTitleRu.trim()) courseData.titleRu = courseTitleRu.trim();
      courseData.duration = courseDuration.trim();
      courseData.description = courseShortDescription.trim() || '';
      courseData.dates = courseDates.trim();
      courseData.totalSeats = Number(courseTotalSeats) || 5;
      courseData.availableSeats = Number(courseTotalSeats) || 5;
      courseData.price = Number(coursePrice) || 150;
      courseData.bgImageUrl =
        courseBgImageUrl.trim() ||
        'https://images.unsplash.com/photo-1551698618-1ffdfe1d9772?auto=format&fit=crop&q=80&w=800';
      courseData.isHidden = courseIsHidden;
      courseData.instructorIds = selectedCourseInstructors;
      courseData.order = courses.length;
      if (courseShortDescription.trim())
        courseData.shortDescription = courseShortDescription.trim();
      if (courseShortDescriptionRu.trim())
        courseData.shortDescriptionRu = courseShortDescriptionRu.trim();
      if (courseDetailedDescription.trim())
        courseData.detailedDescription = courseDetailedDescription.trim();
      if (courseDetailedDescriptionRu.trim())
        courseData.detailedDescriptionRu = courseDetailedDescriptionRu.trim();
      if (courseBadge.trim()) courseData.badge = courseBadge.trim();
      if (courseBadgeRu.trim()) courseData.badgeRu = courseBadgeRu.trim();
      if (courseLevel) courseData.level = courseLevel;
      if (courseVideoUrl.trim()) courseData.videoUrl = courseVideoUrl.trim();
      if (benefitsArr.length > 0) courseData.benefits = benefitsArr;
      if (benefitsRuArr.length > 0) courseData.benefitsRu = benefitsRuArr;
      if (programArr.length > 0) courseData.program = programArr;
      if (programRuArr.length > 0) courseData.programRu = programRuArr;
      if (faqArr.length > 0) courseData.faq = faqArr;
      if (faqRuArr.length > 0) courseData.faqRu = faqRuArr;
      if (galleryArr.length > 0) courseData.galleryPhotos = galleryArr;
    }

    Object.keys(courseData).forEach((key) => {
      if ((courseData as any)[key] === undefined) {
        delete (courseData as any)[key];
      }
    });

    return courseData as Course;
  };

  const handleCourseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!courseTitle.trim() || !courseTitleRu.trim() || !courseDuration.trim() || !courseDates.trim()) {
      addNotification('warning', t('missingDetails'), t('fillCourseDetails'));
      return;
    }

    if (selectedCourseInstructors.length < 1 || selectedCourseInstructors.length > 2) {
      addNotification('warning', t('instructorsRequired'), t('selectOneTwoInstructors'));
      return;
    }

    setIsSubmittingCourse(true);
    const courseData = buildCourseData();

    try {
      if (editingCourse) {
        if (onUpdateCourse) {
          await onUpdateCourse(courseData);
        }
        setEditingCourse(null);
        addNotification('success', t('successTitle'), t('courseUpdated'));
      } else {
        if (onAddCourse) {
          await onAddCourse(courseData);
        }
        addNotification('success', t('successTitle'), t('courseAdded'));
      }
      resetCourseForm();
    } catch (err) {
      addNotification('error', t('errorTitle'), t('saveCourseFailed'));
    } finally {
      setIsSubmittingCourse(false);
    }
  };

  const startEditCourse = (course: Course) => {
    setEditingCourse(course);
    setCourseTitle(course.title);
    setCourseTitleRu(course.titleRu || '');
    setCourseShortDescription(course.shortDescription || '');
    setCourseShortDescriptionRu(course.shortDescriptionRu || '');
    setCourseDetailedDescription(course.detailedDescription || '');
    setCourseDetailedDescriptionRu(course.detailedDescriptionRu || '');
    setCourseBadge(course.badge || '');
    setCourseBadgeRu(course.badgeRu || '');
    setCourseLevel(course.level || '');
    setCourseTotalSeats(course.totalSeats);
    setCoursePrice(course.price);
    setCourseBgImageUrl(course.bgImageUrl);
    setCourseIsHidden(!!course.isHidden);
    setSelectedCourseInstructors(course.instructorIds || []);

    setCourseVideoUrl(course.videoUrl || '');
    setCourseBenefitsEn((course.benefits || []).join('\n'));
    setCourseBenefitsRu((course.benefitsRu || []).join('\n'));

    const loadedProgramDays: ProgramDay[] = [];
    const maxDays = Math.max(course.program?.length || 0, course.programRu?.length || 0);
    for (let i = 0; i < maxDays; i++) {
      loadedProgramDays.push({
        titleEn: course.program?.[i]?.title || '',
        descEn: course.program?.[i]?.desc || '',
        titleRu: course.programRu?.[i]?.title || '',
        descRu: course.programRu?.[i]?.desc || '',
      });
    }
    if (loadedProgramDays.length === 0) {
      loadedProgramDays.push({ titleEn: '', descEn: '', titleRu: '', descRu: '' });
    }
    setCourseProgramDays(loadedProgramDays);

    setCourseFaq1({
      qEn: course.faq?.[0]?.q || '',
      aEn: course.faq?.[0]?.a || '',
      qRu: course.faqRu?.[0]?.q || '',
      aRu: course.faqRu?.[0]?.a || '',
    });
    setCourseFaq2({
      qEn: course.faq?.[1]?.q || '',
      aEn: course.faq?.[1]?.a || '',
      qRu: course.faqRu?.[1]?.q || '',
      aRu: course.faqRu?.[1]?.a || '',
    });
    setCourseFaq3({
      qEn: course.faq?.[2]?.q || '',
      aEn: course.faq?.[2]?.a || '',
      qRu: course.faqRu?.[2]?.q || '',
      aRu: course.faqRu?.[2]?.a || '',
    });

    setCourseGalleryPhotos((course.galleryPhotos || []).join('\n'));
    setShowRichCourseDetails(false);
    setShowCourseForm(true);

    loadCourseDateRange(course.dates, course.duration);
  };

  const resetCourseForm = () => {
    setCourseTitle('');
    setCourseTitleRu('');
    setCourseShortDescription('');
    setCourseShortDescriptionRu('');
    setCourseDetailedDescription('');
    setCourseDetailedDescriptionRu('');
    setCourseBadge('');
    setCourseBadgeRu('');
    setCourseLevel('');
    setCourseTotalSeats(10);
    setCoursePrice(199);
    setCourseBgImageUrl('');
    setCourseIsHidden(false);
    setSelectedCourseInstructors([]);

    setCourseVideoUrl('');
    setCourseBenefitsEn('');
    setCourseBenefitsRu('');
    setCourseProgramDays([{ titleEn: '', descEn: '', titleRu: '', descRu: '' }]);
    setCourseFaq1({ qEn: '', aEn: '', qRu: '', aRu: '' });
    setCourseFaq2({ qEn: '', aEn: '', qRu: '', aRu: '' });
    setCourseFaq3({ qEn: '', aEn: '', qRu: '', aRu: '' });
    setCourseGalleryPhotos('');
    setShowRichCourseDetails(false);

    setEditingCourse(null);
    setShowCourseForm(false);
    resetCourseDateRange();
  };

  const toggleCourseForm = () => {
    if (showCourseForm) {
      resetCourseForm();
    } else {
      setShowCourseForm(true);
    }
  };

  return {
    t,
    language,

    // Visibility
    showCourseForm,
    editingCourse,
    toggleCourseForm,
    startEditCourse,
    resetCourseForm,

    // Submit
    handleCourseSubmit,
    isSubmittingCourse,

    // Date range
    courseDateRange,
    courseDuration,
    setCourseDuration,
    courseDates,

    // Basic info
    courseTitle,
    setCourseTitle,
    courseTitleRu,
    setCourseTitleRu,
    courseShortDescription,
    setCourseShortDescription,
    courseShortDescriptionRu,
    setCourseShortDescriptionRu,
    courseDetailedDescription,
    setCourseDetailedDescription,
    courseDetailedDescriptionRu,
    setCourseDetailedDescriptionRu,
    courseBadge,
    setCourseBadge,
    courseBadgeRu,
    setCourseBadgeRu,
    courseLevel,
    setCourseLevel,
    courseTotalSeats,
    setCourseTotalSeats,
    coursePrice,
    setCoursePrice,
    courseBgImageUrl,
    setCourseBgImageUrl,
    courseIsHidden,
    setCourseIsHidden,
    selectedCourseInstructors,
    setSelectedCourseInstructors,

    // Rich details
    showRichCourseDetails,
    setShowRichCourseDetails,
    courseVideoUrl,
    setCourseVideoUrl,
    courseBenefitsEn,
    setCourseBenefitsEn,
    courseBenefitsRu,
    setCourseBenefitsRu,
    courseProgramDays,
    setCourseProgramDays,
    courseFaq1,
    setCourseFaq1,
    courseFaq2,
    setCourseFaq2,
    courseFaq3,
    setCourseFaq3,
    courseGalleryPhotos,
    setCourseGalleryPhotos,
  };
};
