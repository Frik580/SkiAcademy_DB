import React from 'react';
import { Mountain, Sliders, Users } from 'lucide-react';
import { ResortDataSection, ResortSliderSection } from '../resort/ResortConfigForm';
import { AdminCollapsibleSection } from './AdminCollapsibleSection';
import { CanonicalLessonPricingSettings } from './CanonicalLessonPricingSettings';
import { useAdminProductSettingsTranslations } from './useAdminProductSettingsTranslations';

/** Resort content blocks for the Product admin tab. */
export const AdminProductSettings: React.FC = () => {
  const { t, text } = useAdminProductSettingsTranslations();

  return (
    <div className="space-y-6 w-full min-w-0">
      <AdminCollapsibleSection
        id="lesson_pricing"
        title={text.lessonPricingTitle}
        subtitle={text.lessonPricingSubtitle}
        icon={Users}
        defaultOpen
      >
        <CanonicalLessonPricingSettings />
      </AdminCollapsibleSection>

      <AdminCollapsibleSection
        id="resort_data"
        title={t('resortDetailsTitle') || 'Данные курорта и геолокация погоды'}
        subtitle={t('resortDetailsSub') || 'Название курорта, GPS координаты и статус подъемников'}
        icon={Mountain}
        defaultOpen={false}
      >
        <ResortDataSection />
      </AdminCollapsibleSection>

      <AdminCollapsibleSection
        id="resort_slider"
        title={t('heroSliderTitle') || 'Настройка рекламного баннера (Слайдер)'}
        subtitle={
          t('heroSliderDesc') || 'Интервал смены и конфигурация промо-слайдов на главной странице'
        }
        icon={Sliders}
        defaultOpen={false}
      >
        <ResortSliderSection />
      </AdminCollapsibleSection>
    </div>
  );
};
