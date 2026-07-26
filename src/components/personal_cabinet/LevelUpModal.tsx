import React from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useLanguage } from '../../lib/LanguageContext';

interface LevelUpModalProps {
  level: number;
  theme: string;
  onClose: () => void;
}

export const LevelUpModal: React.FC<LevelUpModalProps> = ({ level, theme, onClose }) => {
  const { t } = useLanguage();

  return createPortal(
    <div
      className="ui-modal-overlay fixed inset-0 z-[99999] flex items-center justify-center animate-fade-in p-4 cursor-pointer"
      onClick={onClose}
    >
      <style>{`
        @keyframes popBadgeAnimation {
          0% { transform: scale(0.2); opacity: 0; }
          50% { transform: scale(1.08); opacity: 1; }
          75% { transform: scale(0.97); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes floatPulse {
          0%, 100% { transform: scale(0.9); opacity: 0.3; }
          50% { transform: scale(1.15); opacity: 0.7; }
        }
      `}</style>

      <div
        className="ui-modal relative p-8 flex flex-col items-center text-center shadow-2xl max-w-sm w-full overflow-hidden cursor-default theme-air:bg-[var(--card-bg)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="absolute w-72 h-72 bg-amber-500/20 rounded-full blur-3xl pointer-events-none"
          style={{ animation: 'floatPulse 3s ease-in-out infinite' }}
        />

        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-[var(--ink-dim)] hover:text-[var(--ink)] p-1.5 transition-colors z-10 cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        <span className="text-xs font-mono font-bold tracking-widest text-amber-400 uppercase mb-2 animate-bounce relative z-10">
          ✨ {t('newLevelUnlocked')} ✨
        </span>

        <div className="relative my-2 flex items-center justify-center relative z-10">
          <img
            key={`modal-${theme}-${level}`}
            src={`https://storage.yandexcloud.net/carve/level/${theme === 'light' ? 'b' : 'w'}/${level}.png`}
            alt={`Level ${level}`}
            className={`${level === 4 ? 'w-48 h-48' : 'w-40 h-40'} object-contain drop-shadow-[0_0_30px_rgba(251,191,36,0.45)]`}
            style={{
              animation: 'popBadgeAnimation 1.0s cubic-bezier(0.34, 1.56, 0.64, 1) forwards',
            }}
            referrerPolicy="no-referrer"
          />
        </div>

        <p className="text-xs font-sans text-[var(--ink-dim)] mt-4 mb-0 max-w-xs relative z-10">
          {t('levelUpCongrats')}
        </p>
      </div>
    </div>,
    document.body
  );
};
