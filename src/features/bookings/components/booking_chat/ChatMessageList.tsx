import React from 'react';
import { Clock, User, MessageSquare, ExternalLink } from 'lucide-react';
import { Booking, ChatMessage, Course, Instructor, UserProfile } from '../../../../types';
import { Skeleton } from '../../../../ui/Skeleton';
import { useLanguage } from '../../../../app/providers/LanguageContext';
import { resolveChatSenderRole } from '../../../../domain/chat/chatSenderRole';

export type ChatMessageRow = ChatMessage & { threadId?: string };

interface ChatMessageListProps {
  messages: ChatMessageRow[];
  isLoading: boolean;
  booking: Booking;
  currentUserProfile: UserProfile;
  usersList: UserProfile[];
  instructors: Instructor[];
  courses: Course[];
  fromInstructorPanel: boolean;
  homeworkTogglingId: string | null;
  onToggleHomework: (msg: ChatMessageRow, checked: boolean) => void;
  messagesEndRef: React.RefObject<HTMLDivElement>;
}

export const ChatMessageList: React.FC<ChatMessageListProps> = ({
  messages,
  isLoading,
  booking,
  currentUserProfile,
  usersList,
  instructors,
  courses,
  fromInstructorPanel,
  homeworkTogglingId,
  onToggleHomework,
  messagesEndRef,
}) => {
  const { language, t } = useLanguage();

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-black/5 flex flex-col min-w-0">
      {isLoading ? (
        <div className="space-y-3 p-2">
          <div className="flex items-start gap-2 max-w-[80%]">
            <Skeleton variant="circular" className="w-7 h-7 shrink-0" />
            <Skeleton className="h-12 flex-1 rounded-lg" />
          </div>
          <div className="flex items-start gap-2 max-w-[80%] ml-auto flex-row-reverse">
            <Skeleton variant="circular" className="w-7 h-7 shrink-0" />
            <Skeleton className="h-10 flex-1 rounded-lg" />
          </div>
          <div className="flex items-start gap-2 max-w-[70%]">
            <Skeleton variant="circular" className="w-7 h-7 shrink-0" />
            <Skeleton className="h-14 flex-1 rounded-lg" />
          </div>
        </div>
      ) : messages.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center text-[var(--ink-dim)] p-8">
          <MessageSquare className="w-8 h-8 opacity-20 mb-2" />
          <p className="text-xs font-mono uppercase tracking-wider max-w-xs">
            {t('chatNoMessages')}
          </p>
        </div>
      ) : (
        messages.map((msg) => {
          const isMe = msg.senderId === currentUserProfile.uid;
          const senderRole = resolveChatSenderRole(
            msg,
            booking,
            usersList,
            instructors,
            courses,
            language
          );
          const isSenderAdmin = senderRole === 'admin';
          const isSenderInstructor = senderRole === 'instructor';
          const isSenderClient = senderRole === 'client';
          const roleBadge = isMe
            ? t('youBadge')
            : isSenderAdmin
              ? t('administratorLabel')
              : isSenderInstructor
                ? t('chatTrainerBadge')
                : t('clientFallback');

          const dateObj = new Date(msg.timestamp);
          const formattedTime = dateObj.toLocaleTimeString(language === 'ru' ? 'ru-RU' : 'en-US', {
            hour: '2-digit',
            minute: '2-digit',
          });

          return (
            <div
              key={msg.id}
              className={`flex items-start gap-2.5 max-w-[85%] ${isMe ? 'self-end flex-row-reverse' : 'self-start'}`}
            >
              <div className="w-8 h-8 rounded-none border border-[var(--border)] bg-black/10 shrink-0 overflow-hidden flex items-center justify-center">
                {msg.senderAvatar ? (
                  <img
                    src={msg.senderAvatar}
                    alt={msg.senderName}
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <User className="w-4 h-4 text-[var(--ink-dim)]" />
                )}
              </div>

              <div className="space-y-1">
                <div
                  className={`flex items-center gap-1.5 text-[9px] font-mono text-[var(--ink-dim)] uppercase tracking-wider ${isMe ? 'justify-end' : 'justify-start'}`}
                >
                  <span className="font-bold text-[var(--ink)] truncate max-w-[120px]">
                    {msg.senderName}
                  </span>
                  <span
                    className={`px-1 py-0.5 text-[7px] border rounded-none font-bold ${
                      isMe || isSenderClient
                        ? 'border-accent text-accent bg-accent-muted'
                        : isSenderAdmin
                          ? 'border-amber-500/20 text-amber-400 bg-amber-950/20'
                          : 'border-emerald-500/20 text-emerald-400 bg-emerald-950/20'
                    }`}
                  >
                    {roleBadge}
                  </span>
                  {msg.isHomework && (
                    <span className="px-1 py-0.5 text-[7px] border rounded-none font-bold border-emerald-500/30 text-emerald-500 bg-emerald-500/10">
                      {t('chatHomeworkBadge')}
                    </span>
                  )}
                </div>

                <div
                  className={`p-3 text-xs leading-relaxed border transition-all duration-300 ${
                    isMe
                      ? 'bg-[var(--ink)] text-[var(--bg)] border-transparent'
                      : 'bg-[var(--bg)] text-[var(--ink)] border-[var(--border)]'
                  }`}
                >
                  {msg.text && <p className="whitespace-pre-wrap break-words">{msg.text}</p>}

                  {msg.attachmentType === 'image' && msg.attachmentUrl && (
                    <div
                      className={`overflow-hidden border border-black/10 bg-black/5 max-w-full ${msg.text ? 'mt-2.5' : ''}`}
                    >
                      <img
                        src={msg.attachmentUrl}
                        alt={msg.attachmentName || t('chatAttachedPhotoAlt')}
                        className="max-h-[220px] w-auto max-w-full object-contain mx-auto hover:scale-[1.02] transition-transform duration-300"
                        referrerPolicy="no-referrer"
                      />
                      <div className="p-1 px-2 text-[8px] font-mono text-[var(--ink-dim)] bg-black/15 flex items-center justify-between gap-2 border-t border-black/10">
                        <span className="truncate max-w-[150px]">{msg.attachmentName}</span>
                        {msg.attachmentSize && (
                          <span>{(msg.attachmentSize / 1024).toFixed(1)} KB</span>
                        )}
                      </div>
                    </div>
                  )}

                  {msg.attachmentType === 'video' && msg.attachmentUrl && (
                    <div
                      className={`overflow-hidden border border-black/10 bg-black/5 max-w-full ${msg.text ? 'mt-2.5' : ''}`}
                    >
                      <video
                        src={msg.attachmentUrl}
                        controls
                        playsInline
                        className="max-h-[220px] w-auto max-w-full object-contain mx-auto"
                      />
                      <div className="p-1 px-2 text-[8px] font-mono text-[var(--ink-dim)] bg-black/15 flex items-center justify-between gap-2 border-t border-black/10">
                        <span className="truncate max-w-[150px]">{msg.attachmentName}</span>
                        {msg.attachmentSize && (
                          <span>{(msg.attachmentSize / 1024).toFixed(1)} KB</span>
                        )}
                      </div>
                    </div>
                  )}

                  {msg.attachmentType === 'link' && msg.attachmentUrl && (
                    <div className={msg.text ? 'mt-2.5' : ''}>
                      <a
                        href={msg.attachmentUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`flex items-center gap-2 p-2 border text-[10px] font-mono uppercase tracking-widest transition-all duration-300 ${
                          isMe
                            ? 'border-white/20 text-white bg-white/10 hover:bg-white/20'
                            : 'border-[var(--border)] text-accent hover:border-accent bg-black/5'
                        }`}
                      >
                        <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate max-w-[180px]">
                          {msg.attachmentName || msg.attachmentUrl}
                        </span>
                      </a>
                    </div>
                  )}
                </div>

                <div
                  className={`flex items-center gap-1 text-[8px] font-mono text-[var(--ink-dim)] ${isMe ? 'justify-end' : 'justify-start'}`}
                >
                  <Clock className="w-2.5 h-2.5" />
                  <span>{formattedTime}</span>
                </div>
                {fromInstructorPanel && isMe && (
                  <label
                    className={`flex items-center gap-1.5 text-[8px] font-mono uppercase tracking-wider text-[var(--ink-dim)] mt-0.5 cursor-pointer ${isMe ? 'justify-end' : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={msg.isHomework ?? false}
                      disabled={homeworkTogglingId === msg.id}
                      onChange={(e) => onToggleHomework(msg, e.target.checked)}
                      className="accent-[var(--accent)]"
                    />
                    <span>{t('chatMarkHomework')}</span>
                  </label>
                )}
              </div>
            </div>
          );
        })
      )}
      <div ref={messagesEndRef} />
    </div>
  );
};
