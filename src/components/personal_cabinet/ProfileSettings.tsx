import React, { useRef, useState } from 'react';
import { Camera, Loader2, Wallet } from 'lucide-react';
import { UserProfile } from '../../types';
import { useLanguage } from '../../lib/LanguageContext';
import { useTheme } from '../useTheme';
import { optimizeProfileImage } from './profileImage';

interface SkillProgressSummary {
  control: { percentage: number };
  speed: { percentage: number };
  technique: { percentage: number };
}

interface ProfileSettingsProps {
  userProfile: UserProfile;
  skillProgress: SkillProgressSummary;
  onSignOut: () => void;
  onUpdateProfile?: (updatedProfile: Partial<UserProfile>) => Promise<void>;
  onLevelBadgeClick: () => void;
  onUploadSuccess?: () => void;
  onUploadError?: () => void;
  onInvalidFile?: () => void;
}

export const ProfileSettings: React.FC<ProfileSettingsProps> = ({
  userProfile,
  skillProgress,
  onSignOut,
  onUpdateProfile,
  onLevelBadgeClick,
  onUploadSuccess,
  onUploadError,
  onInvalidFile,
}) => {
  const { t } = useLanguage();
  const { theme } = useTheme();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [isDraggingAvatar, setIsDraggingAvatar] = useState(false);

  const processAndUploadFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      onInvalidFile?.();
      return;
    }

    setIsUploadingAvatar(true);
    try {
      const optimizedBase64 = await optimizeProfileImage(file);
      if (onUpdateProfile) {
        await onUpdateProfile({ avatarUrl: optimizedBase64 });
        onUploadSuccess?.();
      }
    } catch (err) {
      console.error(err);
      onUploadError?.();
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingAvatar(true);
  };

  const handleDragLeave = () => setIsDraggingAvatar(false);

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingAvatar(false);
    if (e.dataTransfer.files?.length) {
      await processAndUploadFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) {
      await processAndUploadFile(e.target.files[0]);
    }
  };

  return (
    <div className="lg:col-span-4 border border-slate-200/70 dark:border-slate-800/70 p-5 flex flex-col justify-between space-y-6 self-start bg-[var(--card-bg)] rounded-xs shadow-xs overflow-hidden w-full min-w-0 max-w-full">
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`relative w-16 h-16 rounded-full overflow-hidden shrink-0 group cursor-pointer transition-all duration-300 ${
              isDraggingAvatar
                ? 'ring-2 ring-accent scale-105'
                : 'ring-1 ring-slate-200 dark:ring-slate-800 hover:ring-accent'
            }`}
            title={t('changeProfilePhoto')}
          >
            {isUploadingAvatar ? (
              <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px] flex items-center justify-center z-10">
                <Loader2 className="w-5 h-5 text-white animate-spin" />
              </div>
            ) : (
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center z-10">
                <Camera className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            )}
            <img src={userProfile.avatarUrl} alt={userProfile.displayName} className="w-full h-full object-cover" />
            <div className="absolute bottom-0 right-0 bg-[var(--ink)] p-1 rounded-full text-[var(--bg)] shadow-md group-hover:scale-110 transition-transform z-20">
              <Camera className="w-2.5 h-2.5" />
            </div>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileChange}
          />

          <div className="flex flex-col w-full min-w-0">
            <h3 className="font-serif text-lg font-light tracking-tight text-[var(--ink)] leading-tight truncate">
              {userProfile.displayName}
            </h3>
            <p className="text-[10px] font-mono text-[var(--ink-dim)] tracking-wider mt-1 truncate">{userProfile.email}</p>
            <span className="inline-block mt-2 text-[8px] font-mono uppercase tracking-widest text-[var(--ink)] bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-xs w-fit">
              {userProfile.role === 'admin'
                ? `🛡️ ${t('adminRole')}`
                : `👤 ${t('skiMember')}`}
            </span>
          </div>
        </div>

        <div className="flex flex-col items-center justify-between gap-4 py-[10px] w-full">
          <div className="flex flex-col items-center gap-3 w-full">
            <div
              onClick={onLevelBadgeClick}
              className={`${(userProfile.level || 1) === 4 ? 'w-52 h-52' : 'w-40 h-40'} flex items-center justify-center shrink-0 relative transition-all duration-300 cursor-pointer group`}
              title={t('levelPreviewTitle')}
            >
              <img
                key={`${theme}-${userProfile.level || 1}`}
                src={`https://storage.yandexcloud.net/carve/level/${theme === 'light' ? 'b' : 'w'}/${userProfile.level || 1}.png`}
                alt={`Level ${userProfile.level || 1}`}
                className={`${(userProfile.level || 1) === 4 ? 'w-52 h-52' : 'w-40 h-40'} object-contain transition-all duration-300 group-hover:scale-105`}
                referrerPolicy="no-referrer"
                onLoad={(e) => { e.currentTarget.style.display = 'block'; }}
                onError={(e) => { e.currentTarget.style.display = 'none'; }}
              />
            </div>

            {!userProfile.hideProgressTracking && (
              <div className="w-full space-y-1 mt-1">
                <div className="grid grid-cols-3 gap-1.5 text-center">
                  <div className="p-2 flex flex-col items-center justify-center bg-cyan-500/10 dark:bg-cyan-950/20 rounded-xs">
                    <span className="text-[9px] font-mono uppercase tracking-wider text-cyan-800 dark:text-cyan-300 font-bold block truncate w-full">
                      {t('control')}
                    </span>
                    <span className="text-xl font-serif font-bold text-cyan-700 dark:text-cyan-300 mt-0.5 block">
                      {skillProgress.control.percentage}%
                    </span>
                  </div>
                  <div className="p-2 flex flex-col items-center justify-center bg-amber-500/10 dark:bg-amber-950/20 rounded-xs">
                    <span className="text-[9px] font-mono uppercase tracking-wider text-amber-800 dark:text-amber-300 font-bold block truncate w-full">
                      {t('speed')}
                    </span>
                    <span className="text-xl font-serif font-bold text-amber-700 dark:text-amber-300 mt-0.5 block">
                      {skillProgress.speed.percentage}%
                    </span>
                  </div>
                  <div className="p-2 flex flex-col items-center justify-center bg-purple-500/10 dark:bg-purple-950/20 rounded-xs">
                    <span className="text-[9px] font-mono uppercase tracking-wider text-purple-800 dark:text-purple-300 font-bold block truncate w-full">
                      {t('technique')}
                    </span>
                    <span className="text-xl font-serif font-bold text-purple-700 dark:text-purple-300 mt-0.5 block">
                      {skillProgress.technique.percentage}%
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="border border-slate-200/60 dark:border-slate-800/60 p-3.5 flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/30 rounded-xs">
          <div className="flex items-center gap-2">
            <Wallet className="w-4 h-4 text-[var(--ink)]" />
            <div>
              <span className="text-[9px] font-mono text-[var(--ink-dim)] uppercase tracking-widest block">{t('walletBalance')}</span>
              <span className="text-xl font-serif font-light text-[var(--ink)]">${userProfile.balanceUSD}</span>
            </div>
          </div>
          <div className="text-[9px] font-mono text-[var(--ink-dim)] uppercase tracking-wider">Mock USD</div>
        </div>

        {userProfile.phoneNumber && (
          <div className="text-[10px] font-mono text-[var(--ink)] border border-slate-200/60 dark:border-slate-800/60 p-3 flex justify-between uppercase tracking-wider bg-slate-50/50 dark:bg-slate-900/30 rounded-xs">
            <span className="text-[var(--ink-dim)]">{t('phone')}:</span>
            <span className="font-bold">{userProfile.phoneNumber}</span>
          </div>
        )}
      </div>

      <button
        onClick={onSignOut}
        className="w-full py-2 border border-slate-200 dark:border-slate-800 hover:border-[var(--ink)] hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xs text-[10px] font-mono uppercase tracking-widest text-[var(--ink)] transition mt-4 cursor-pointer bg-transparent"
      >
        {t('signOutAccount')}
      </button>
    </div>
  );
};
