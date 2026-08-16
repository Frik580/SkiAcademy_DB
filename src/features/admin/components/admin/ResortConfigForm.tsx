import React from 'react';
import { ResortDataSection } from './resort_config/ResortDataSection';
import { ResortSliderSection } from './resort_config/ResortSliderSection';

export { ResortDataSection, ResortSliderSection };

export const ResortConfigForm: React.FC = () => {
  return (
    <div className="space-y-6">
      <ResortDataSection />
      <ResortSliderSection />
    </div>
  );
};
