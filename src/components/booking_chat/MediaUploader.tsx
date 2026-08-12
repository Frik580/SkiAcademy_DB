import React from 'react';
import { Image, Video, Link as LinkIcon, Loader2, Trash2 } from 'lucide-react';
import { useLanguage } from '../../lib/LanguageContext';
import type { PendingAttachment } from './chatCompression';

interface MediaUploaderProps {
  isSending: boolean;
  isCompressing: boolean;
  compressionProgress: string;
  linkInputVisible: boolean;
  linkInputVal: string;
  attachment: PendingAttachment | null;
  fileInputRef: React.RefObject<HTMLInputElement>;
  videoInputRef: React.RefObject<HTMLInputElement>;
  onImageSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onVideoSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onToggleLinkInput: () => void;
  onLinkInputChange: (value: string) => void;
  onLinkAttach: () => void;
  onClearAttachment: () => void;
}

export const MediaUploader: React.FC<MediaUploaderProps> = ({
  isSending,
  isCompressing,
  compressionProgress,
  linkInputVisible,
  linkInputVal,
  attachment,
  fileInputRef,
  videoInputRef,
  onImageSelect,
  onVideoSelect,
  onToggleLinkInput,
  onLinkInputChange,
  onLinkAttach,
  onClearAttachment,
}) => {
  const { t } = useLanguage();

  return (
    <>
      <div className="px-4 py-1.5 border-t border-[var(--border)] bg-black/10 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <input
            type="file"
            ref={fileInputRef}
            onChange={onImageSelect}
            accept="image/*"
            className="hidden"
          />
          <input
            type="file"
            ref={videoInputRef}
            onChange={onVideoSelect}
            accept="video/*"
            className="hidden"
          />

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isSending || isCompressing}
            className="py-1 text-[var(--ink-dim)] hover:text-[var(--ink)] bg-transparent transition rounded-none cursor-pointer flex items-center gap-1 text-[9px] font-mono uppercase tracking-widest"
            title={t('chatAttachPhoto')}
          >
            <Image className="w-3.5 h-3.5" />
            <span>{t('chatPhoto')}</span>
          </button>

          <button
            type="button"
            onClick={() => videoInputRef.current?.click()}
            disabled={isSending || isCompressing}
            className="py-1 text-[var(--ink-dim)] hover:text-[var(--ink)] bg-transparent transition rounded-none cursor-pointer flex items-center gap-1 text-[9px] font-mono uppercase tracking-widest"
            title={t('chatAttachVideo')}
          >
            <Video className="w-3.5 h-3.5" />
            <span>{t('chatVideo')}</span>
          </button>

          <button
            type="button"
            onClick={onToggleLinkInput}
            disabled={isSending || isCompressing}
            className={`py-1 text-[var(--ink-dim)] hover:text-[var(--ink)] transition rounded-none cursor-pointer flex items-center gap-1 text-[9px] font-mono uppercase tracking-widest ${
              linkInputVisible ? 'text-[var(--ink)] font-bold' : ''
            }`}
            title={t('chatAttachLink')}
          >
            <LinkIcon className="w-3.5 h-3.5" />
            <span>{t('chatLink')}</span>
          </button>
        </div>

        {isCompressing && (
          <div className="flex items-center gap-1.5 text-[9px] font-mono text-accent uppercase tracking-widest animate-pulse font-bold">
            <Loader2 className="w-3 h-3 animate-spin" />
            <span>{compressionProgress}</span>
          </div>
        )}
      </div>

      {linkInputVisible && (
        <div className="p-3 border-t border-[var(--border)] bg-black/15 flex items-center gap-2 shrink-0 animate-fade-in">
          <input
            type="text"
            value={linkInputVal}
            onChange={(e) => onLinkInputChange(e.target.value)}
            placeholder={t('chatLinkPlaceholder')}
            className="flex-1 px-3 py-1.5 bg-[var(--bg)] border border-[var(--border)] text-xs text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] transition rounded-none font-mono"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                onLinkAttach();
              }
            }}
          />
          <button
            type="button"
            onClick={onLinkAttach}
            className="px-3 py-1.5 border border-[var(--ink)] bg-[var(--ink)] text-[var(--bg)] hover:bg-transparent hover:text-[var(--ink)] transition text-[10px] font-mono uppercase tracking-wider rounded-none cursor-pointer"
          >
            {t('chatAdd')}
          </button>
        </div>
      )}

      {attachment && (
        <div className="p-3 border-t border-[var(--border)] bg-black/15 flex items-center justify-between gap-3 shrink-0 animate-fade-in">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-12 h-12 border border-[var(--border)] bg-black/20 overflow-hidden flex items-center justify-center shrink-0">
              {attachment.type === 'image' ? (
                <img
                  src={attachment.url}
                  alt={t('chatPreviewAlt')}
                  className="w-full h-full object-cover"
                />
              ) : attachment.type === 'video' ? (
                <div className="relative w-full h-full flex items-center justify-center bg-black">
                  <Video className="w-5 h-5 text-accent" />
                  <span className="absolute bottom-0 right-0 text-[6px] font-mono bg-black/75 px-0.5 text-accent">
                    VM
                  </span>
                </div>
              ) : (
                <LinkIcon className="w-5 h-5 text-accent" />
              )}
            </div>
            <div className="min-w-0">
              <span className="text-[8px] font-mono uppercase tracking-wider text-accent font-bold block">
                {attachment.type === 'image'
                  ? t('chatImageReady')
                  : attachment.type === 'video'
                    ? t('chatOptimizedVideo')
                    : t('chatLinkAttachment')}
              </span>
              <span className="text-[10px] font-mono text-[var(--ink)] truncate block">
                {attachment.name || t('chatAttachment')}
              </span>
              {attachment.size && (
                <span className="text-[8px] font-mono text-[var(--ink-dim)] block">
                  {t('chatSize')}: {(attachment.size / 1024).toFixed(1)} KB
                </span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClearAttachment}
            className="p-1 border border-rose-500/30 text-rose-400 hover:text-rose-300 bg-rose-950/10 hover:border-rose-500 transition rounded-none cursor-pointer"
            title={t('chatRemoveAttachment')}
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      )}
    </>
  );
};
