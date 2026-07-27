import React from 'react';
import { useLanguage } from '../../../lib/LanguageContext';
import { ClientSkillProgressView } from '../../ClientSkillProgressView';
import { StudentCabinetContext } from './StudentCabinetHome';
import { getLevelLabel } from './studentCabinetUtils';
import { ScDivider } from './StudentCabinetUI';

interface StudentDevelopmentPanelProps extends StudentCabinetContext {
  onToggleSkillToday?: (skillItemId: string, pinned: boolean) => void;
}

export const StudentDevelopmentPanel: React.FC<StudentDevelopmentPanelProps> = ({
  userProfile,
  skillConfig,
  onToggleSkillToday,
}) => {
  const { language, t } = useLanguage();
  const lang = language === 'ru' ? 'ru' : 'en';
  const level = userProfile.level || 1;

  return (
    <div className="space-y-0 pb-24 max-w-2xl mx-auto">
      <section className="py-6 space-y-1">
        <h1 className="text-2xl font-serif font-light text-[var(--ink)]">
          {t('scDevelopmentDetail')}
        </h1>
        <p className="text-xs tracking-widest text-[var(--ink-dim)] uppercase">
          LEVEL {level} · {getLevelLabel(level, lang)}
        </p>
      </section>

      <ScDivider />

      <section className="py-6">
        <ClientSkillProgressView
          userProfile={userProfile}
          skillConfig={skillConfig}
          onToggleSkillToday={onToggleSkillToday}
        />
      </section>
    </div>
  );
};
