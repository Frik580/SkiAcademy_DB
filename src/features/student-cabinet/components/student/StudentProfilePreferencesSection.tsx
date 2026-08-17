import React, { useEffect, useState } from 'react';
import { LogOut } from 'lucide-react';
import { UserProfile } from '../../../../types';
import { useLanguage } from '../../../../app/providers/LanguageContext';
import { logger } from '../../../../lib/logger';
import { ToggleSwitch } from '../../../../ui/ToggleSwitch';

interface StudentProfilePreferencesSectionProps {
  userProfile: UserProfile;
  onSignOut: () => void;
  onUpdateProfile?: (updatedProfile: Partial<UserProfile>) => Promise<void>;
}

export const StudentProfilePreferencesSection: React.FC<StudentProfilePreferencesSectionProps> = ({
  userProfile,
  onSignOut,
  onUpdateProfile,
}) => {
  const { t } = useLanguage();
  const [hideProgress, setHideProgress] = useState(Boolean(userProfile.hideProgressTracking));

  useEffect(() => {
    setHideProgress(Boolean(userProfile.hideProgressTracking));
  }, [userProfile.hideProgressTracking]);

  const handleHideProgressChange = async (checked: boolean) => {
    if (!onUpdateProfile) return;
    setHideProgress(checked);
    try {
      await onUpdateProfile({ hideProgressTracking: checked });
    } catch (err) {
      logger.error(err);
      setHideProgress(!checked);
    }
  };

  return (
    <div className="space-y-8">
      <ToggleSwitch
        checked={hideProgress}
        onChange={(checked) => void handleHideProgressChange(checked)}
        label={t('scHideProgressTracking')}
        description={t('scHideProgressTrackingSub')}
        disabled={!onUpdateProfile}
      />

      <button
        type="button"
        onClick={onSignOut}
        className="inline-flex items-center gap-2 text-sm text-rose-500 hover:text-rose-600 transition"
      >
        <LogOut className="w-4 h-4" />
        {t('signOutAccount')}
      </button>
    </div>
  );
};
