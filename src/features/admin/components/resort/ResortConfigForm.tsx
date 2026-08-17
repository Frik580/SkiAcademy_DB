import React from 'react';
import { ResortDataSection } from './sections/ResortDataSection';
import { ResortSliderSection } from './sections/ResortSliderSection';

export { ResortDataSection, ResortSliderSection };

export const ResortConfigForm: React.FC = () => {
  return (
    <div className="space-y-6">
      <ResortDataSection />
      <ResortSliderSection />
    </div>
  );
};
