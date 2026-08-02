import React from 'react';
import { createPortal } from 'react-dom';
import { Shield } from 'lucide-react';
import { useLanguage } from '../../lib/LanguageContext';

interface ConfirmActionModalProps {
  message: string;
  showReasonInput?: boolean;
  reason: string;
  setReason: (value: string) => void;
  onCancel: () => void;
  onConfirm: (reason?: string) => void;
}

export const ConfirmActionModal: React.FC<ConfirmActionModalProps> = ({
  message,
  showReasonInput,
  reason,
  setReason,
  onCancel,
  onConfirm,
}) => {
  const { t } = useLanguage();

  return createPortal(
    <div className="ui-modal-overlay fixed inset-0 flex items-center justify-center z-55 p-4 bg-black/60 backdrop-blur-xs">
      <div className="ui-modal w-full max-w-sm p-6 shadow-2xl relative space-y-4 rounded-2xl bg-[var(--card-bg)] text-[var(--ink)] border border-[var(--border)]">
        <h4 className="font-serif text-sm font-light text-[var(--ink)] flex items-center gap-2">
          <Shield className="w-4.5 h-4.5 text-[var(--ink-dim)] animate-pulse" />
          {t('confirmAction')}
        </h4>
        <p className="text-xs text-[var(--ink-dim)] leading-relaxed">{message}</p>
        {showReasonInput && (
          <div className="space-y-1.5 text-left">
            <label className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-dim)]">
              {t('cancelReasonRequired')}
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t('cancelReasonPlaceholder')}
              rows={3}
              className="w-full px-3 py-2 text-xs border border-[var(--border)] bg-transparent text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] transition rounded-none resize-none font-mono"
              required
            />
          </div>
        )}
        <div className="flex gap-2.5 pt-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 py-2 px-4 border border-[var(--border)] bg-black/5 hover:border-[var(--ink)] hover:bg-black/10 text-[var(--ink-dim)] hover:text-[var(--ink)] rounded-none text-xs font-mono uppercase tracking-widest transition cursor-pointer text-center"
          >
            {t('cancel')}
          </button>
          <button
            type="button"
            disabled={showReasonInput ? !reason.trim() : false}
            onClick={() => onConfirm(showReasonInput ? reason : undefined)}
            className="flex-1 py-2 px-4 border border-[var(--border)] bg-[var(--ink)] hover:bg-transparent text-[var(--bg)] hover:text-[var(--ink)] disabled:bg-black/5 disabled:text-[var(--ink-dim)] disabled:border-[var(--border)] disabled:cursor-not-allowed rounded-none text-xs font-mono uppercase tracking-widest transition cursor-pointer text-center"
          >
            {t('confirm')}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
