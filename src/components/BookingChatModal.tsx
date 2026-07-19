import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { 
  Send, 
  X, 
  MessageSquare, 
  Clock, 
  User, 
  Loader2 
} from 'lucide-react';
import { Booking, UserProfile, ChatMessage, OperationType, Instructor } from '../types';
import { db, collection, doc, setDoc, onSnapshot, handleFirestoreError } from '../lib/firebase';
import { useLanguage } from '../lib/LanguageContext';

interface BookingChatModalProps {
  booking: Booking;
  currentUserProfile: UserProfile;
  onClose: () => void;
  usersList?: UserProfile[];
  instructors?: Instructor[];
}

export const BookingChatModal: React.FC<BookingChatModalProps> = ({
  booking,
  currentUserProfile,
  onClose,
  usersList = [],
  instructors = []
}) => {
  const { language } = useLanguage();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Translate labels helper
  const t = {
    chatTitle: language === 'en' ? 'Lesson Discussion' : 'Обсуждение занятия',
    instructor: language === 'en' ? 'Instructor' : 'Инструктор',
    client: language === 'en' ? 'Client' : 'Клиент',
    admin: language === 'en' ? 'Admin' : 'Администратор',
    placeholder: language === 'en' ? 'Type your message...' : 'Введите сообщение...',
    noMessages: language === 'en' ? 'No messages yet. Start the conversation!' : 'Сообщений пока нет. Начните диалог!',
    send: language === 'en' ? 'Send' : 'Отправить',
    lessonWith: language === 'en' ? 'Lesson with' : 'Занятие с',
    onDate: language === 'en' ? 'on' : 'дата',
    atTime: language === 'en' ? 'at' : 'время'
  };

  // Listen to messages in real-time
  useEffect(() => {
    const chatId = (booking as any).chatId || booking.id;
    const messagesPath = `bookings/${chatId}/messages`;
    setIsLoading(true);

    const unsubscribe = onSnapshot(
      collection(db, 'bookings', chatId, 'messages'),
      (snapshot) => {
        const list: ChatMessage[] = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as ChatMessage));
        list.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
        setMessages(list);
        setIsLoading(false);
      },
      (error) => {
        setIsLoading(false);
        handleFirestoreError(error, OperationType.GET, messagesPath);
      }
    );

    return () => unsubscribe();
  }, [booking.id, (booking as any).chatId]);

  // Auto scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || isSending) return;

    setIsSending(true);
    const chatId = (booking as any).chatId || booking.id;
    const messagesPath = `bookings/${chatId}/messages`;

    try {
      const msgRef = doc(collection(db, 'bookings', chatId, 'messages'));
      const newMessage: ChatMessage = {
        id: msgRef.id,
        bookingId: booking.id,
        senderId: currentUserProfile.uid,
        senderName: currentUserProfile.displayName || currentUserProfile.email,
        senderAvatar: currentUserProfile.avatarUrl || '',
        text: inputText.trim(),
        timestamp: new Date().toISOString()
      };

      await setDoc(msgRef, newMessage);
      setInputText('');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, messagesPath);
    } finally {
      setIsSending(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fade-in">
      <div className="bg-[var(--bg)] border border-[var(--border)] shadow-2xl w-full max-w-lg h-[550px] flex flex-col overflow-hidden rounded-none animate-scale-up">
        {/* Header */}
        <div className="flex justify-between items-center p-4 border-b border-[var(--border)] bg-black/15 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 bg-indigo-950/20 border border-indigo-500/20 text-indigo-400">
              <MessageSquare className="w-4.5 h-4.5" />
            </div>
            <div className="min-w-0">
              <h4 className="font-serif text-sm font-medium text-[var(--ink)] truncate">
                {t.chatTitle}
              </h4>
              <p className="text-[9px] font-mono uppercase tracking-wider text-[var(--ink-dim)] truncate mt-0.5">
                {t.lessonWith} {booking.instructorName} • {booking.date} @ {booking.time}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 border border-[var(--border)] bg-black/5 hover:border-[var(--ink)] hover:bg-black/10 text-[var(--ink-dim)] hover:text-[var(--ink)] transition cursor-pointer rounded-none"
            title={language === 'en' ? 'Close' : 'Закрыть'}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Message area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-black/5 flex flex-col min-w-0">
          {isLoading ? (
            <div className="flex-1 flex flex-col items-center justify-center text-[var(--ink-dim)] gap-2">
              <Loader2 className="w-6 h-6 animate-spin text-[var(--ink)]" />
              <span className="text-[10px] font-mono uppercase tracking-wider">Loading discussion...</span>
            </div>
          ) : messages.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center text-[var(--ink-dim)] p-8">
              <MessageSquare className="w-8 h-8 opacity-20 mb-2" />
              <p className="text-xs font-mono uppercase tracking-wider max-w-xs">{t.noMessages}</p>
            </div>
          ) : (
            messages.map((msg) => {
              const isMe = msg.senderId === currentUserProfile.uid;
              
              // Determine precise sender role
              const isSenderAdmin = msg.senderId === 'admin' || 
                                    msg.senderId.includes('admin') || 
                                    msg.senderName.toLowerCase().includes('admin') ||
                                    (isMe && currentUserProfile.role === 'admin') ||
                                    (usersList || []).some(u => u.uid === msg.senderId && (u.role === 'admin' || u.email === 'gerasimchuk.arseniy@gmail.com'));

              const isSenderInstructor = (isMe && (currentUserProfile.isInstructor || !!currentUserProfile.instructorId)) ||
                                         (usersList || []).some(u => u.uid === msg.senderId && (u.isInstructor || !!u.instructorId)) ||
                                         (instructors || []).some(ins => ins.name === msg.senderName);

              const isSenderClient = !isSenderAdmin && !isSenderInstructor;
              
              // Formatting time
              const dateObj = new Date(msg.timestamp);
              const formattedTime = dateObj.toLocaleTimeString(language === 'ru' ? 'ru-RU' : 'en-US', {
                hour: '2-digit',
                minute: '2-digit'
              });

              return (
                <div 
                  key={msg.id} 
                  className={`flex items-start gap-2.5 max-w-[85%] ${isMe ? 'self-end flex-row-reverse' : 'self-start'}`}
                >
                  {/* Sender Avatar */}
                  <div className="w-8 h-8 rounded-none border border-[var(--border)] bg-black/10 shrink-0 overflow-hidden flex items-center justify-center">
                    {msg.senderAvatar ? (
                      <img src={msg.senderAvatar} alt={msg.senderName} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      <User className="w-4 h-4 text-[var(--ink-dim)]" />
                    )}
                  </div>

                  {/* Bubble Content */}
                  <div className="space-y-1">
                    {/* Sender Name and Role Tag */}
                    <div className={`flex items-center gap-1.5 text-[9px] font-mono text-[var(--ink-dim)] uppercase tracking-wider ${isMe ? 'justify-end' : 'justify-start'}`}>
                      <span className="font-bold text-[var(--ink)] truncate max-w-[120px]">{msg.senderName}</span>
                      <span className={`px-1 py-0.5 text-[7px] border rounded-none font-bold ${
                        isSenderClient 
                          ? 'border-indigo-500/20 text-indigo-400 bg-indigo-950/20' 
                          : isSenderAdmin
                          ? 'border-amber-500/20 text-amber-400 bg-amber-950/20'
                          : 'border-emerald-500/20 text-emerald-400 bg-emerald-950/20'
                      }`}>
                        {isSenderClient ? t.client : isSenderAdmin ? t.admin : t.instructor}
                      </span>
                    </div>

                    {/* Chat Bubble text */}
                    <div className={`p-3 text-xs leading-relaxed border transition-all duration-300 ${
                      isMe 
                        ? 'bg-[var(--ink)] text-[var(--bg)] border-transparent' 
                        : 'bg-[var(--bg)] text-[var(--ink)] border-[var(--border)]'
                    }`}>
                      <p className="whitespace-pre-wrap break-words">{msg.text}</p>
                    </div>

                    {/* Time */}
                    <div className={`flex items-center gap-1 text-[8px] font-mono text-[var(--ink-dim)] ${isMe ? 'justify-end' : 'justify-start'}`}>
                      <Clock className="w-2.5 h-2.5" />
                      <span>{formattedTime}</span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input area */}
        <form 
          onSubmit={handleSendMessage} 
          className="p-3 border-t border-[var(--border)] bg-[var(--bg)] flex items-center gap-2 shrink-0"
        >
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder={t.placeholder}
            className="flex-1 px-3.5 py-2.5 bg-black/10 dark:bg-white/5 border border-[var(--border)] text-xs text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] transition rounded-none"
            maxLength={1000}
            disabled={isSending}
          />
          <button
            type="submit"
            disabled={!inputText.trim() || isSending}
            className="p-2.5 border border-[var(--border)] bg-transparent hover:border-[var(--ink)] hover:bg-black/5 disabled:opacity-50 disabled:cursor-not-allowed text-[var(--ink)] transition rounded-none cursor-pointer flex items-center justify-center"
            title={t.send}
          >
            {isSending ? (
              <Loader2 className="w-4.5 h-4.5 animate-spin" />
            ) : (
              <Send className="w-4.5 h-4.5" />
            )}
          </button>
        </form>
      </div>
    </div>,
    document.body
  );
};

