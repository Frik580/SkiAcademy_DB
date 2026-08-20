import React from 'react';
import { Mountain, Sliders } from 'lucide-react';
import { useLanguage } from '../../../../app/providers/LanguageContext';
import { ResortDataSection, ResortSliderSection } from '../resort/ResortConfigForm';
import { AdminCollapsibleSection } from './AdminCollapsibleSection';

/** Resort content blocks for the Product admin tab. */
export const AdminProductSettings: React.FC = () => {
  const { t } = useLanguage();

  return (
    <div className="space-y-6 w-full min-w-0">
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
