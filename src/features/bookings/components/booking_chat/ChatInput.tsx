import React from 'react';
import { Send, Loader2 } from 'lucide-react';
import { useLanguage } from '../../../../app/providers/LanguageContext';

interface ChatInputProps {
  inputText: string;
  onInputChange: (value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  isSending: boolean;
  isCompressing: boolean;
  hasAttachment: boolean;
}

export const ChatInput: React.FC<ChatInputProps> = ({
  inputText,
  onInputChange,
  onSubmit,
  isSending,
  isCompressing,
  hasAttachment,
}) => {
  const { t } = useLanguage();

  return (
    <form
      onSubmit={onSubmit}
      className="p-3 border-t border-[var(--border)] bg-[var(--bg)] flex items-center gap-2 shrink-0"
    >
      <input
        type="text"
        value={inputText}
        onChange={(e) => onInputChange(e.target.value)}
        placeholder={t('chatMessagePlaceholder')}
        className="flex-1 px-3.5 py-2.5 bg-black/10 dark:bg-white/5 border border-[var(--border)] text-xs text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] transition rounded-none"
        maxLength={1000}
        disabled={isSending || isCompressing}
      />
      <button
        type="submit"
        disabled={(!inputText.trim() && !hasAttachment) || isSending || isCompressing}
        className="p-2.5 border border-[var(--border)] bg-transparent hover:border-[var(--ink)] hover:bg-black/5 disabled:opacity-50 disabled:cursor-not-allowed text-[var(--ink)] transition rounded-none cursor-pointer flex items-center justify-center"
        title={t('chatSend')}
      >
        {isSending ? (
          <Loader2 className="w-4.5 h-4.5 animate-spin" />
        ) : (
          <Send className="w-4.5 h-4.5" />
        )}
      </button>
    </form>
  );
};
