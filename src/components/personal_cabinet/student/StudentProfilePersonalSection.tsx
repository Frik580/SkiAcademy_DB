import React, { useEffect, useRef, useState } from 'react';
import { Camera, Loader2, Wallet } from 'lucide-react';
import { UserProfile } from '../../../types';
import { useLanguage } from '../../../lib/LanguageContext';
import { optimizeProfileImage } from '../profileImage';
import { uploadImage } from '../../../lib/storage';
import { logger } from '../../../lib/logger';
import { ScSectionTitle } from './StudentCabinetUI';

interface StudentProfilePersonalSectionProps {
  userProfile: UserProfile;
  onUpdateProfile?: (updatedProfile: Partial<UserProfile>) => Promise<void>;
  onInvalidFile?: () => void;
  onUploadSuccess?: () => void;
  onUploadError?: () => void;
}

export const StudentProfilePersonalSection: React.FC<StudentProfilePersonalSectionProps> = ({
  userProfile,
  onUpdateProfile,
  onInvalidFile,
  onUploadSuccess,
  onUploadError,
}) => {
  const { t } = useLanguage();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [displayName, setDisplayName] = useState(userProfile.displayName);
  const [phoneNumber, setPhoneNumber] = useState(userProfile.phoneNumber ?? '');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setDisplayName(userProfile.displayName);
    setPhoneNumber(userProfile.phoneNumber ?? '');
  }, [userProfile.displayName, userProfile.phoneNumber]);

  const upload = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      onInvalidFile?.();
      return;
    }
    setIsUploading(true);
    try {
      const blob = await optimizeProfileImage(file);
      const avatarUrl = await uploadImage(blob, `avatars/${userProfile.uid}.jpg`);
      await onUpdateProfile?.({ avatarUrl });
      onUploadSuccess?.();
    } catch (err) {
      logger.error(err);
      onUploadError?.();
    } finally {
      setIsUploading(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!onUpdateProfile) return;
    const trimmedName = displayName.trim();
    if (!trimmedName) return;

    setIsSaving(true);
    try {
      await onUpdateProfile({
        displayName: trimmedName,
        phoneNumber: phoneNumber.trim() || undefined,
      });
    } finally {
      setIsSaving(false);
    }
  };

  const profileDirty =
    displayName.trim() !== userProfile.displayName ||
    (phoneNumber.trim() || '') !== (userProfile.phoneNumber ?? '');

  const inputClassName =
    'w-full min-h-[2.75rem] rounded-lg border border-[var(--border-subtle)] bg-[var(--profile-bg)] px-3 py-2.5 text-sm text-[var(--ink)] placeholder:text-[var(--ink-dim)] focus:outline-none focus:border-[var(--accent)] transition box-border';

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="relative w-16 h-16 rounded-full overflow-hidden shrink-0 group"
          title={t('changeProfilePhoto')}
        >
          {isUploading && (
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center z-10">
              <Loader2 className="w-5 h-5 text-white animate-spin" />
            </div>
          )}
          <img
            src={userProfile.avatarUrl}
            alt={userProfile.displayName}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/25 transition flex items-center justify-center">
            <Camera className="w-4 h-4 text-white opacity-0 group-hover:opacity-100" />
          </div>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && void upload(e.target.files[0])}
        />
        <div className="min-w-0 flex-1">
          <p className="text-lg font-medium text-[var(--ink)] break-words">
            {userProfile.displayName}
          </p>
          <p className="text-sm text-[var(--ink-dim)] break-all">{userProfile.email}</p>
        </div>
      </div>

      <section className="space-y-4">
        <ScSectionTitle>{t('editProfile')}</ScSectionTitle>
        <div className="grid grid-cols-2 gap-3 items-end">
          <label className="block space-y-1.5">
            <span className="text-xs text-[var(--ink-dim)]">{t('scDisplayNameLabel')}</span>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className={inputClassName}
              disabled={!onUpdateProfile}
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs text-[var(--ink-dim)]">{t('phone')}</span>
            <input
              type="tel"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              placeholder={t('phoneOptional')}
              className={inputClassName}
              disabled={!onUpdateProfile}
            />
          </label>
          {onUpdateProfile && (
            <button
              type="button"
              onClick={() => void handleSaveProfile()}
              disabled={!profileDirty || isSaving || !displayName.trim()}
              className="text-sm font-medium text-[var(--accent)] hover:underline disabled:opacity-50 disabled:no-underline"
            >
              {isSaving ? '…' : t('saveChanges')}
            </button>
          )}
        </div>
      </section>

      <div className="flex items-center gap-3 py-2">
        <Wallet className="w-5 h-5 text-[var(--ink-dim)]" />
        <div>
          <p className="text-xs text-[var(--ink-dim)]">{t('walletBalance')}</p>
          <p className="text-xl font-serif text-[var(--ink)]">
            ${userProfile.balanceUSD.toFixed(2)}
          </p>
        </div>
      </div>
    </div>
  );
};
