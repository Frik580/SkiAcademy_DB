import React from 'react';
import { Send } from 'lucide-react';
import { ActionButton } from '../../../../ui/ActionButton';
import { useLanguage } from '../../../../app/providers/LanguageContext';
import { ADMIN_MODAL_FIELD_CLASS } from '../../../admin/components/adminModalStyles';

interface ChatInputProps {
  inputText: string;
  onInputChange: (value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  isSending: boolean;
  isCompressing: boolean;
  hasAttachment: boolean;
  fromAdminPanel?: boolean;
}

export const ChatInput: React.FC<ChatInputProps> = ({
  inputText,
  onInputChange,
  onSubmit,
  isSending,
  isCompressing,
  hasAttachment,
  fromAdminPanel,
}) => {
  const { t } = useLanguage();

  return (
    <form
      onSubmit={onSubmit}
      className={`${fromAdminPanel ? 'p-4 bg-[var(--card-bg)]' : 'p-3 bg-[var(--bg)]'} border-t border-[var(--border)] flex items-center gap-2 shrink-0`}
    >
      <input
        type="text"
        value={inputText}
        onChange={(e) => onInputChange(e.target.value)}
        placeholder={t('chatMessagePlaceholder')}
        className={
          fromAdminPanel
            ? `${ADMIN_MODAL_FIELD_CLASS} flex-1`
            : 'flex-1 px-3.5 py-2.5 bg-black/10 dark:bg-white/5 border border-[var(--border)] type-body text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] transition rounded-none'
        }
        maxLength={1000}
        disabled={isSending || isCompressing}
      />
      <ActionButton
        type="submit"
        unstyled
        pending={isSending}
        pendingLabel=""
        disabled={(!inputText.trim() && !hasAttachment) || isCompressing}
        className={
          fromAdminPanel
            ? 'btn-primary shrink-0 p-3'
            : 'p-2.5 border border-[var(--border)] bg-transparent hover:border-[var(--ink)] hover:bg-black/5 disabled:opacity-50 disabled:cursor-not-allowed text-[var(--ink)] transition rounded-none cursor-pointer'
        }
        title={t('chatSend')}
      >
        <Send className="w-4.5 h-4.5" />
      </ActionButton>
    </form>
  );
};
