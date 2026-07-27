import React, { useRef, useState } from 'react';
import { Camera, Loader2, LogOut, Wallet } from 'lucide-react';
import { UserProfile } from '../../../types';
import { useLanguage } from '../../../lib/LanguageContext';
import { optimizeProfileImage } from '../profileImage';
import { uploadImage } from '../../../lib/storage';
import { logger } from '../../../lib/logger';

interface StudentSettingsCompactProps {
  userProfile: UserProfile;
  onSignOut: () => void;
  onUpdateProfile?: (updatedProfile: Partial<UserProfile>) => Promise<void>;
  onInvalidFile?: () => void;
  onUploadSuccess?: () => void;
  onUploadError?: () => void;
}

export const StudentSettingsCompact: React.FC<StudentSettingsCompactProps> = ({
  userProfile,
  onSignOut,
  onUpdateProfile,
  onInvalidFile,
  onUploadSuccess,
  onUploadError,
}) => {
  const { t } = useLanguage();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);

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

      <div className="flex items-center gap-3 py-2">
        <Wallet className="w-5 h-5 text-[var(--ink-dim)]" />
        <div>
          <p className="text-xs text-[var(--ink-dim)]">{t('walletBalance')}</p>
          <p className="text-xl font-serif text-[var(--ink)]">
            ${userProfile.balanceUSD.toFixed(2)}
          </p>
        </div>
      </div>

      {userProfile.phoneNumber && (
        <p className="text-sm text-[var(--ink-dim)]">
          {t('phone')}: <span className="text-[var(--ink)]">{userProfile.phoneNumber}</span>
        </p>
      )}

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
