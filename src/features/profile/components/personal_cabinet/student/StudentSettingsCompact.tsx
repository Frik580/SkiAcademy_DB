import React from 'react';
import { UserProfile } from '../../../../../types';
import { StudentProfilePersonalSection } from './StudentProfilePersonalSection';
import { StudentProfilePreferencesSection } from './StudentProfilePreferencesSection';

export interface StudentSettingsCompactProps {
  userProfile: UserProfile;
  onSignOut: () => void;
  onUpdateProfile?: (updatedProfile: Partial<UserProfile>) => Promise<void>;
  onInvalidFile?: () => void;
  onUploadSuccess?: () => void;
  onUploadError?: () => void;
}

export const StudentSettingsCompact: React.FC<StudentSettingsCompactProps> = (props) => (
  <>
    <StudentProfilePersonalSection
      userProfile={props.userProfile}
      onUpdateProfile={props.onUpdateProfile}
      onInvalidFile={props.onInvalidFile}
      onUploadSuccess={props.onUploadSuccess}
      onUploadError={props.onUploadError}
    />
    <StudentProfilePreferencesSection
      userProfile={props.userProfile}
      onSignOut={props.onSignOut}
      onUpdateProfile={props.onUpdateProfile}
    />
  </>
);
