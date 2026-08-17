import React, { useState } from 'react';
import { Camera, Loader2 } from 'lucide-react';
import { useLanguage } from '../../../../app/providers/LanguageContext';
import { useNotifications } from '../../../../features/notifications';
import { optimizeCourseImage } from './courseImage';
import { uploadImage } from '../../../../infrastructure/firebase';
import { logger } from '../../../../shared';

interface CourseBackgroundImageFieldProps {
  value: string;
  onChange: (value: string) => void;
  courseId?: string;
}

export const CourseBackgroundImageField: React.FC<CourseBackgroundImageFieldProps> = ({
  value,
  onChange,
  courseId,
}) => {
  const { t } = useLanguage();
  const { addNotification } = useNotifications();
  const [isUploadingCourseImage, setIsUploadingCourseImage] = useState(false);
  const [isCourseDragOver, setIsCourseDragOver] = useState(false);

  const processAndOptimizeCourseImage = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      addNotification('error', t('invalidFile'), t('invalidFileDesc'));
      return;
    }

    setIsUploadingCourseImage(true);
    try {
      const optimizedBlob = await optimizeCourseImage(file);
      const targetCourseId = courseId || `course_${Date.now()}`;
      const imageUrl = await uploadImage(optimizedBlob, `courses/${targetCourseId}.jpg`);
      onChange(imageUrl);
      addNotification('success', t('courseBgAttached'), t('courseBgAttachedDesc'));
    } catch (err) {
      logger.error(err);
      addNotification('error', t('uploadFailed'), t('courseBgFailedDesc'));
    } finally {
      setIsUploadingCourseImage(false);
    }
  };

  return (
    <div className="space-y-1.5">
      <label className="text-[10px] text-[var(--ink-dim)] uppercase block">
        {t('backgroundImageUrl')}
      </label>
      <input
        type="url"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="https://images.unsplash.com/..."
        className="w-full px-3.5 py-2 border border-[var(--border)] bg-transparent text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] rounded-none mb-1"
      />

      {/* File Upload zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsCourseDragOver(true);
        }}
        onDragLeave={() => setIsCourseDragOver(false)}
        onDrop={async (e) => {
          e.preventDefault();
          setIsCourseDragOver(false);
          if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            await processAndOptimizeCourseImage(e.dataTransfer.files[0]);
          }
        }}
        className={`border border-dashed p-4 text-center cursor-pointer transition ${isCourseDragOver ? 'border-[var(--ink)] bg-black/10' : 'border-[var(--border)] hover:border-[var(--ink)]'}`}
        onClick={() => document.getElementById('course-image-input')?.click()}
      >
        <input
          id="course-image-input"
          type="file"
          accept="image/*"
          className="hidden"
          onChange={async (e) => {
            if (e.target.files && e.target.files.length > 0) {
              await processAndOptimizeCourseImage(e.target.files[0]);
            }
          }}
        />
        <div className="flex flex-col items-center gap-1">
          {isUploadingCourseImage ? (
            <Loader2 className="w-5 h-5 text-[var(--ink-dim)] animate-spin" />
          ) : (
            <Camera className="w-5 h-5 text-[var(--ink-dim)]" />
          )}
          <span className="text-[10px] text-[var(--ink-dim)]">{t('dragUploadBgPhoto')}</span>
        </div>
      </div>
    </div>
  );
};
