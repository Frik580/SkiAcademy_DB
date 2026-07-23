import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { 
  Send, 
  X, 
  MessageSquare, 
  Clock, 
  User, 
  Loader2,
  Image,
  Video,
  Link as LinkIcon,
  ExternalLink,
  Trash2
} from 'lucide-react';
import { Booking, UserProfile, ChatMessage, OperationType, Instructor } from '../types';
import { db, collection, doc, setDoc, onSnapshot, handleFirestoreError } from '../lib/firebase';
import { useLanguage, type TranslationKey } from '../lib/LanguageContext';

class LocalizedCompressionError extends Error {
  i18nKey: TranslationKey;
  constructor(key: TranslationKey) {
    super(key);
    this.i18nKey = key;
    this.name = 'LocalizedCompressionError';
  }
}

function formatCompressionError(
  err: unknown,
  t: (key: TranslationKey) => string,
  fallbackKey: TranslationKey
): string {
  if (err instanceof LocalizedCompressionError) {
    return t(err.i18nKey);
  }
  return `${t(fallbackKey)}: ${err instanceof Error ? err.message : String(err)}`;
}

interface BookingChatModalProps {
  booking: Booking;
  currentUserProfile: UserProfile;
  onClose: () => void;
  usersList?: UserProfile[];
  instructors?: Instructor[];
}

// Client-side image optimization / compression
const compressImage = (file: File): Promise<{ url: string; name: string; size: number }> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new window.Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;
        const maxDim = 800; // Optimum dimension for rich visual chat bubble previews
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new LocalizedCompressionError('chatCompressionCanvasError'));
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        // Compress to high-efficiency Jpeg at 0.7 quality
        const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
        
        // Compute approximate compressed payload size
        const stringLength = dataUrl.length - 'data:image/jpeg;base64,'.length;
        const actualSize = Math.round(stringLength * 0.75);

        resolve({
          url: dataUrl,
          name: file.name,
          size: actualSize
        });
      };
      img.onerror = () => reject(new LocalizedCompressionError('chatCompressionImageLoadFailed'));
      img.src = e.target?.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

// Client-side video optimization / compression using Canvas and low-bitrate MediaRecorder
const compressVideo = (file: File): Promise<{ url: string; name: string; size: number }> => {
  // If video file is already small (under 400 KB), directly encode without lossy transcoding
  if (file.size < 400 * 1024) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve({ url: reader.result as string, name: file.name, size: file.size });
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  const hasCapture = 'captureStream' in HTMLCanvasElement.prototype || 'mozCaptureStream' in HTMLCanvasElement.prototype;
  if (!window.MediaRecorder || !hasCapture) {
    // If not supported by browser, fall back to base64 directly if size permits, otherwise reject
    if (file.size < 900 * 1024) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve({ url: reader.result as string, name: file.name, size: file.size });
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
    } else {
      return Promise.reject(new LocalizedCompressionError('chatCompressionUnsupported'));
    }
  }

  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.src = URL.createObjectURL(file);
    video.muted = true;
    video.playsInline = true;
    video.crossOrigin = 'anonymous';

    // Maximum 12 seconds wait time for compression
    const timeoutId = setTimeout(() => {
      reject(new LocalizedCompressionError('chatCompressionTimeout'));
    }, 12000);

    video.onloadedmetadata = () => {
      clearTimeout(timeoutId);
      let width = video.videoWidth;
      let height = video.videoHeight;
      const maxDim = 400; // Downscale video resolution to max 400px for space efficiency
      if (width > maxDim || height > maxDim) {
        if (width > height) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new LocalizedCompressionError('chatCompressionCanvasError'));
        return;
      }

      const canvasStream = (canvas as any).captureStream ? (canvas as any).captureStream(12) : (canvas as any).mozCaptureStream ? (canvas as any).mozCaptureStream(12) : null;
      if (!canvasStream) {
        reject(new LocalizedCompressionError('chatCompressionStreamFailed'));
        return;
      }

      // Encode WebM at ultra-low 150kbps bitrate for optimized storage
      let options = { mimeType: 'video/webm;codecs=vp8', videoBitsPerSecond: 150000 };
      if (!MediaRecorder.isTypeSupported(options.mimeType)) {
        options = { mimeType: 'video/webm', videoBitsPerSecond: 150000 };
      }
      if (!MediaRecorder.isTypeSupported(options.mimeType)) {
        options = { mimeType: '', videoBitsPerSecond: 150000 };
      }

      try {
        const mediaRecorder = new MediaRecorder(canvasStream, options);
        const chunks: Blob[] = [];
        mediaRecorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) {
            chunks.push(e.data);
          }
        };

        mediaRecorder.onstop = () => {
          const compressedBlob = new Blob(chunks, { type: 'video/webm' });
          const reader = new FileReader();
          reader.onload = () => {
            resolve({
              url: reader.result as string,
              name: file.name.replace(/\.[^/.]+$/, "") + "_optimized.webm",
              size: compressedBlob.size
            });
          };
          reader.onerror = reject;
          reader.readAsDataURL(compressedBlob);
          URL.revokeObjectURL(video.src);
        };

        // Stream fast playback rate to shorten processing latency
        video.playbackRate = 2.5;
        video.play();
        mediaRecorder.start();

        const drawFrame = () => {
          if (video.paused || video.ended) {
            if (mediaRecorder.state !== 'inactive') {
              mediaRecorder.stop();
            }
            return;
          }
          ctx.drawImage(video, 0, 0, width, height);
          if ('requestVideoFrameCallback' in video) {
            (video as any).requestVideoFrameCallback(drawFrame);
          } else {
            setTimeout(drawFrame, 1000 / 12);
          }
        };

        if ('requestVideoFrameCallback' in video) {
          (video as any).requestVideoFrameCallback(drawFrame);
        } else {
          setTimeout(drawFrame, 1000 / 12);
        }

        video.onended = () => {
          if (mediaRecorder.state !== 'inactive') {
            mediaRecorder.stop();
          }
        };
      } catch (err) {
        reject(err);
      }
    };

    video.onerror = () => {
      clearTimeout(timeoutId);
      reject(new LocalizedCompressionError('chatCompressionVideoParseFailed'));
    };
  });
};

export const BookingChatModal: React.FC<BookingChatModalProps> = ({
  booking,
  currentUserProfile,
  onClose,
  usersList = [],
  instructors = []
}) => {
  const { language, t } = useLanguage();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  
  // Attachments State
  const [attachmentType, setAttachmentType] = useState<'image' | 'video' | 'link' | null>(null);
  const [attachmentUrl, setAttachmentUrl] = useState<string>('');
  const [attachmentName, setAttachmentName] = useState<string>('');
  const [attachmentSize, setAttachmentSize] = useState<number | undefined>(undefined);
  const [isCompressing, setIsCompressing] = useState<boolean>(false);
  const [compressionProgress, setCompressionProgress] = useState<string>('');
  const [linkInputVisible, setLinkInputVisible] = useState(false);
  const [linkInputVal, setLinkInputVal] = useState('');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

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

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsCompressing(true);
    setCompressionProgress(t('chatOptimizingImage'));
    try {
      const result = await compressImage(file);
      setAttachmentType('image');
      setAttachmentUrl(result.url);
      setAttachmentName(result.name);
      setAttachmentSize(result.size);
    } catch (err: any) {
      console.error(err);
      alert(formatCompressionError(err, t, 'chatImageProcessingFailed'));
    } finally {
      setIsCompressing(false);
      setCompressionProgress('');
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleVideoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reject raw files over 40MB
    if (file.size > 40 * 1024 * 1024) {
      alert(t('chatVideoTooLarge'));
      return;
    }

    setIsCompressing(true);
    setCompressionProgress(t('chatOptimizingVideo'));
    try {
      const result = await compressVideo(file);
      
      // Strict limit for Firestore documents (which has 1MB total size limit)
      if (result.size > 800 * 1024) {
        alert(t('chatOptimizedVideoTooLarge'));
        return;
      }

      setAttachmentType('video');
      setAttachmentUrl(result.url);
      setAttachmentName(result.name);
      setAttachmentSize(result.size);
    } catch (err: any) {
      console.error(err);
      alert(formatCompressionError(err, t, 'chatVideoProcessingFailed'));
    } finally {
      setIsCompressing(false);
      setCompressionProgress('');
      if (videoInputRef.current) videoInputRef.current.value = '';
    }
  };

  const handleLinkAttach = () => {
    if (!linkInputVal.trim()) return;
    let url = linkInputVal.trim();
    if (!/^https?:\/\//i.test(url)) {
      url = 'https://' + url;
    }

    try {
      const urlObj = new URL(url);
      setAttachmentType('link');
      setAttachmentUrl(url);
      setAttachmentName(urlObj.hostname);
      setAttachmentSize(undefined);
      setLinkInputVal('');
      setLinkInputVisible(false);
    } catch (e) {
      alert(t('chatInvalidLink'));
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!inputText.trim() && !attachmentUrl) || isSending || isCompressing) return;

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

      if (attachmentUrl && attachmentType) {
        newMessage.attachmentType = attachmentType;
        newMessage.attachmentUrl = attachmentUrl;
        newMessage.attachmentName = attachmentName;
        if (attachmentSize !== undefined) {
          newMessage.attachmentSize = attachmentSize;
        }
      }

      await setDoc(msgRef, newMessage);
      setInputText('');
      setAttachmentType(null);
      setAttachmentUrl('');
      setAttachmentName('');
      setAttachmentSize(undefined);
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
                {t('chatDiscussionTitle')}
              </h4>
              <p className="text-[9px] font-mono uppercase tracking-wider text-[var(--ink-dim)] truncate mt-0.5">
                {t('lessonWith')} {booking.instructorName} • {booking.date} @ {booking.time}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 border border-[var(--border)] bg-black/5 hover:border-[var(--ink)] hover:bg-black/10 text-[var(--ink-dim)] hover:text-[var(--ink)] transition cursor-pointer rounded-none"
            title={t('closeBtn')}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Message area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-black/5 flex flex-col min-w-0">
          {isLoading ? (
            <div className="flex-1 flex flex-col items-center justify-center text-[var(--ink-dim)] gap-2">
              <Loader2 className="w-6 h-6 animate-spin text-[var(--ink)]" />
              <span className="text-[10px] font-mono uppercase tracking-wider">{t('chatLoadingDiscussion')}</span>
            </div>
          ) : messages.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center text-[var(--ink-dim)] p-8">
              <MessageSquare className="w-8 h-8 opacity-20 mb-2" />
              <p className="text-xs font-mono uppercase tracking-wider max-w-xs">{t('chatNoMessages')}</p>
            </div>
          ) : (
            messages.map((msg) => {
              const isMe = msg.senderId === currentUserProfile.uid;
              
              // Determine precise sender role
              const isSenderAdmin = msg.senderId === 'admin' || 
                                    msg.senderId.includes('admin') || 
                                    msg.senderName.toLowerCase().includes('admin') ||
                                    (isMe && currentUserProfile.role === 'admin') ||
                                    (usersList || []).some(u => u.uid === msg.senderId && u.role === 'admin');

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
                        {isSenderClient ? t('clientFallback') : isSenderAdmin ? t('administratorLabel') : t('instructorColumn')}
                      </span>
                    </div>

                    {/* Chat Bubble text */}
                    <div className={`p-3 text-xs leading-relaxed border transition-all duration-300 ${
                      isMe 
                        ? 'bg-[var(--ink)] text-[var(--bg)] border-transparent' 
                        : 'bg-[var(--bg)] text-[var(--ink)] border-[var(--border)]'
                    }`}>
                      {msg.text && <p className="whitespace-pre-wrap break-words">{msg.text}</p>}
                      
                      {/* Media Attachments */}
                      {msg.attachmentType === 'image' && msg.attachmentUrl && (
                        <div className={`overflow-hidden border border-black/10 bg-black/5 max-w-full ${msg.text ? 'mt-2.5' : ''}`}>
                          <img 
                            src={msg.attachmentUrl} 
                            alt={msg.attachmentName || t('chatAttachedPhotoAlt')}
                            className="max-h-[220px] w-auto max-w-full object-contain mx-auto hover:scale-[1.02] transition-transform duration-300"
                            referrerPolicy="no-referrer"
                          />
                          <div className="p-1 px-2 text-[8px] font-mono text-[var(--ink-dim)] bg-black/15 flex items-center justify-between gap-2 border-t border-black/10">
                            <span className="truncate max-w-[150px]">{msg.attachmentName}</span>
                            {msg.attachmentSize && <span>{(msg.attachmentSize / 1024).toFixed(1)} KB</span>}
                          </div>
                        </div>
                      )}

                      {msg.attachmentType === 'video' && msg.attachmentUrl && (
                        <div className={`overflow-hidden border border-black/10 bg-black/5 max-w-full ${msg.text ? 'mt-2.5' : ''}`}>
                          <video 
                            src={msg.attachmentUrl} 
                            controls 
                            playsInline
                            className="max-h-[220px] w-auto max-w-full object-contain mx-auto"
                          />
                          <div className="p-1 px-2 text-[8px] font-mono text-[var(--ink-dim)] bg-black/15 flex items-center justify-between gap-2 border-t border-black/10">
                            <span className="truncate max-w-[150px]">{msg.attachmentName}</span>
                            {msg.attachmentSize && <span>{(msg.attachmentSize / 1024).toFixed(1)} KB</span>}
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
                                : 'border-[var(--border)] text-indigo-400 hover:border-indigo-400 bg-black/5'
                            }`}
                          >
                            <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                            <span className="truncate max-w-[180px]">{msg.attachmentName || msg.attachmentUrl}</span>
                          </a>
                        </div>
                      )}
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

        {/* Attachment Options Toolbar */}
        <div className="px-4 py-1.5 border-t border-[var(--border)] bg-black/10 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleImageSelect} 
              accept="image/*" 
              className="hidden" 
            />
            <input 
              type="file" 
              ref={videoInputRef} 
              onChange={handleVideoSelect} 
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
              onClick={() => setLinkInputVisible(!linkInputVisible)}
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
            <div className="flex items-center gap-1.5 text-[9px] font-mono text-indigo-400 uppercase tracking-widest animate-pulse font-bold">
              <Loader2 className="w-3 h-3 animate-spin" />
              <span>{compressionProgress}</span>
            </div>
          )}
        </div>

        {/* Link Input Sub-panel */}
        {linkInputVisible && (
          <div className="p-3 border-t border-[var(--border)] bg-black/15 flex items-center gap-2 shrink-0 animate-fade-in">
            <input
              type="text"
              value={linkInputVal}
              onChange={(e) => setLinkInputVal(e.target.value)}
              placeholder={t('chatLinkPlaceholder')}
              className="flex-1 px-3 py-1.5 bg-[var(--bg)] border border-[var(--border)] text-xs text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] transition rounded-none font-mono"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleLinkAttach();
                }
              }}
            />
            <button
              type="button"
              onClick={handleLinkAttach}
              className="px-3 py-1.5 border border-[var(--ink)] bg-[var(--ink)] text-[var(--bg)] hover:bg-transparent hover:text-[var(--ink)] transition text-[10px] font-mono uppercase tracking-wider rounded-none cursor-pointer"
            >
              {t('chatAdd')}
            </button>
          </div>
        )}

        {/* Pending Attachment Preview Bar */}
        {attachmentType && attachmentUrl && (
          <div className="p-3 border-t border-[var(--border)] bg-black/15 flex items-center justify-between gap-3 shrink-0 animate-fade-in">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-12 h-12 border border-[var(--border)] bg-black/20 overflow-hidden flex items-center justify-center shrink-0">
                {attachmentType === 'image' ? (
                  <img src={attachmentUrl} alt={t('chatPreviewAlt')} className="w-full h-full object-cover" />
                ) : attachmentType === 'video' ? (
                  <div className="relative w-full h-full flex items-center justify-center bg-black">
                    <Video className="w-5 h-5 text-indigo-400" />
                    <span className="absolute bottom-0 right-0 text-[6px] font-mono bg-black/75 px-0.5 text-indigo-400">VM</span>
                  </div>
                ) : (
                  <LinkIcon className="w-5 h-5 text-indigo-400" />
                )}
              </div>
              <div className="min-w-0">
                <span className="text-[8px] font-mono uppercase tracking-wider text-indigo-400 font-bold block">
                  {attachmentType === 'image' 
                    ? t('chatImageReady')
                    : attachmentType === 'video' 
                    ? t('chatOptimizedVideo')
                    : t('chatLinkAttachment')}
                </span>
                <span className="text-[10px] font-mono text-[var(--ink)] truncate block">
                  {attachmentName || t('chatAttachment')}
                </span>
                {attachmentSize && (
                  <span className="text-[8px] font-mono text-[var(--ink-dim)] block">
                    {t('chatSize')}: {(attachmentSize / 1024).toFixed(1)} KB
                  </span>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setAttachmentType(null);
                setAttachmentUrl('');
                setAttachmentName('');
                setAttachmentSize(undefined);
              }}
              className="p-1 border border-rose-500/30 text-rose-400 hover:text-rose-300 bg-rose-950/10 hover:border-rose-500 transition rounded-none cursor-pointer"
              title={t('chatRemoveAttachment')}
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Input area */}
        <form 
          onSubmit={handleSendMessage} 
          className="p-3 border-t border-[var(--border)] bg-[var(--bg)] flex items-center gap-2 shrink-0"
        >
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder={t('chatMessagePlaceholder')}
            className="flex-1 px-3.5 py-2.5 bg-black/10 dark:bg-white/5 border border-[var(--border)] text-xs text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] transition rounded-none"
            maxLength={1000}
            disabled={isSending || isCompressing}
          />
          <button
            type="submit"
            disabled={(!inputText.trim() && !attachmentUrl) || isSending || isCompressing}
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
      </div>
    </div>,
    document.body
  );
};

