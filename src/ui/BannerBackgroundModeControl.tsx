import React from 'react';
import { useLanguage } from '../app/providers/LanguageContext';
import { normalizeBannerMediaMode, type BannerMediaMode } from '../lib/bannerMedia';

interface BannerBackgroundModeControlProps {
  value?: BannerMediaMode | unknown;
  onChange: (mode: BannerMediaMode) => void;
  disabled?: boolean;
}

export const BannerBackgroundModeControl: React.FC<BannerBackgroundModeControlProps> = ({
  value,
  onChange,
  disabled = false,
}) => {
  const { t } = useLanguage();
  const mode = normalizeBannerMediaMode(value);

  return (
    <div className="space-y-1.5">
      <span className="block text-[9px] font-mono uppercase tracking-wider text-[var(--ink-dim)]">
        {t('bannerBackgroundMode')}
      </span>
      <div className="inline-flex border border-[var(--border)] rounded-none overflow-hidden">
        {(['image', 'video'] as const).map((option) => (
          <button
            key={option}
            type="button"
            disabled={disabled}
            onClick={() => onChange(option)}
            className={`px-3 py-1 text-[10px] font-mono uppercase tracking-wider transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
              mode === option
                ? 'bg-[var(--ink)] text-[var(--bg)]'
                : 'bg-transparent text-[var(--ink-dim)] hover:text-[var(--ink)]'
            }`}
          >
            {option === 'image' ? t('bannerBackgroundImage') : t('bannerBackgroundVideo')}
          </button>
        ))}
      </div>
      {mode === 'video' ? (
        <p className="text-[9px] font-mono text-[var(--ink-dim)] leading-relaxed">
          {t('bannerVideoFileHint')}
        </p>
      ) : null}
    </div>
  );
};
