import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Booking, UserProfile, ChatMessage, OperationType, Instructor, Course } from '../types';
import {
  db,
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteField,
  onSnapshot,
  handleFirestoreError,
  limit,
  orderBy,
  query,
} from '../lib/firebase';
import { uploadImage } from '../lib/storage';
import { QUERY_LIMITS } from '../lib/queryLimits';
import { useLanguage } from '../lib/LanguageContext';
import { logger } from '../lib/logger';
import { resolveChatId, getCourseChatThreadIds } from '../lib/resolveChatId';
import { resolveProfileSenderRole } from '../lib/chatSenderRole';
import { buildHomeworkForUserIds } from '../lib/chatHomework';
import { ChatWindow } from './booking_chat/ChatWindow';
import { ChatMessageList, type ChatMessageRow } from './booking_chat/ChatMessageList';
import { MediaUploader } from './booking_chat/MediaUploader';
import { HomeworkPanel } from './booking_chat/HomeworkPanel';
import { ChatInput } from './booking_chat/ChatInput';
import {
  compressImage,
  compressVideo,
  formatCompressionError,
  type PendingAttachment,
} from './booking_chat/chatCompression';

type CourseChatClient = { uid: string; name: string; bookingId: string };

interface BookingChatModalProps {
  booking: Booking & {
    chatId?: string;
    participantBookingIds?: string[];
    isCourse?: boolean;
    courseId?: string;
    clients?: CourseChatClient[];
  };
  currentUserProfile: UserProfile;
  onClose: () => void;
  usersList?: UserProfile[];
  instructors?: Instructor[];
  courses?: Course[];
  fromInstructorPanel?: boolean;
  onToggleRecommendation?: (bookingId: string, recommendationId: string, checked: boolean) => void;
}

export const BookingChatModal: React.FC<BookingChatModalProps> = ({
  booking,
  currentUserProfile,
  onClose,
  usersList = [],
  instructors = [],
  courses = [],
  fromInstructorPanel = false,
  onToggleRecommendation,
}) => {
  const { t } = useLanguage();
  const [messages, setMessages] = useState<ChatMessageRow[]>([]);
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [sendAsHomework, setSendAsHomework] = useState(false);
  const [homeworkAllStudents, setHomeworkAllStudents] = useState(true);
  const [homeworkTargetUids, setHomeworkTargetUids] = useState<string[]>([]);
  const [homeworkTogglingId, setHomeworkTogglingId] = useState<string | null>(null);

  const [attachment, setAttachment] = useState<PendingAttachment | null>(null);
  const [isCompressing, setIsCompressing] = useState<boolean>(false);
  const [compressionProgress, setCompressionProgress] = useState<string>('');
  const [linkInputVisible, setLinkInputVisible] = useState(false);
  const [linkInputVal, setLinkInputVal] = useState('');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  const courseParticipants = useMemo(() => {
    if (!fromInstructorPanel) return [] as CourseChatClient[];
    if (booking.clients?.length) {
      return booking.clients.filter((c) => Boolean(c.uid));
    }
    if (booking.userId && !booking.instructorId.startsWith('course_')) {
      return [
        {
          uid: booking.userId,
          name: booking.guestName || booking.instructorName,
          bookingId: booking.id,
        },
      ];
    }
    return [];
  }, [booking, fromInstructorPanel]);

  const showHomeworkTargetPicker =
    fromInstructorPanel && sendAsHomework && courseParticipants.length > 1;

  const courseParticipantUids = useMemo(
    () => courseParticipants.map((p) => p.uid),
    [courseParticipants]
  );

  const resetHomeworkTargets = () => {
    setHomeworkAllStudents(true);
    setHomeworkTargetUids([]);
  };

  const setHomeworkAll = (checked: boolean) => {
    setHomeworkAllStudents(checked);
    if (checked) setHomeworkTargetUids([]);
  };

  const toggleHomeworkTargetUid = (uid: string, checked: boolean) => {
    setHomeworkAllStudents(false);
    setHomeworkTargetUids((prev) => {
      if (checked) return prev.includes(uid) ? prev : [...prev, uid];
      return prev.filter((id) => id !== uid);
    });
  };

  useEffect(() => {
    const chatId = resolveChatId(booking);
    const chatIds = getCourseChatThreadIds(booking);
    const messagesPath = `bookings/${chatId}/messages`;
    setIsLoading(true);

    const messageMap = new Map<string, ChatMessageRow>();
    const loadedThreads = new Set<string>();

    const unsubscribes = chatIds.map((threadId) =>
      onSnapshot(
        query(
          collection(db, 'bookings', threadId, 'messages'),
          orderBy('timestamp', 'desc'),
          limit(QUERY_LIMITS.chatMessages)
        ),
        (snapshot) => {
          const threadPrefix = `${threadId}:`;
          for (const key of messageMap.keys()) {
            if (key.startsWith(threadPrefix)) {
              messageMap.delete(key);
            }
          }
          snapshot.docs.forEach((d) => {
            messageMap.set(`${threadId}:${d.id}`, {
              id: d.id,
              ...d.data(),
              threadId,
            } as ChatMessageRow);
          });
          loadedThreads.add(threadId);
          const list = Array.from(messageMap.values());
          list.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
          setMessages(list);
          if (loadedThreads.size >= chatIds.length) setIsLoading(false);
        },
        (error) => {
          loadedThreads.add(threadId);
          if (loadedThreads.size >= chatIds.length) setIsLoading(false);
          handleFirestoreError(error, OperationType.GET, messagesPath);
        }
      )
    );

    return () => unsubscribes.forEach((unsub) => unsub());
  }, [
    booking.id,
    booking.instructorId,
    booking.chatId,
    booking.courseId,
    booking.isCourse,
    (booking.participantBookingIds ?? []).join(','),
  ]);

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
      const chatId = resolveChatId(booking);
      const sanitizedName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
      const path = `chat/${chatId}/${Date.now()}_${sanitizedName}`;
      const downloadUrl = await uploadImage(result.blob, path);
      setAttachment({
        type: 'image',
        url: downloadUrl,
        name: result.name,
        size: result.size,
      });
    } catch (err: unknown) {
      logger.error(err);
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

    if (file.size > 40 * 1024 * 1024) {
      alert(t('chatVideoTooLarge'));
      return;
    }

    setIsCompressing(true);
    setCompressionProgress(t('chatOptimizingVideo'));
    try {
      const result = await compressVideo(file);

      if (result.size > 800 * 1024) {
        alert(t('chatOptimizedVideoTooLarge'));
        return;
      }

      const chatId = resolveChatId(booking);
      const sanitizedName = result.name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
      const path = `chat/${chatId}/${Date.now()}_${sanitizedName}`;
      const downloadUrl = await uploadImage(result.blob, path);
      setAttachment({
        type: 'video',
        url: downloadUrl,
        name: result.name,
        size: result.size,
      });
    } catch (err: unknown) {
      logger.error(err);
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
      setAttachment({
        type: 'link',
        url,
        name: urlObj.hostname,
      });
      setLinkInputVal('');
      setLinkInputVisible(false);
    } catch {
      alert(t('chatInvalidLink'));
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!inputText.trim() && !attachment) || isSending || isCompressing) return;

    setIsSending(true);
    const chatId = resolveChatId(booking);
    const messagesPath = `bookings/${chatId}/messages`;

    try {
      const msgRef = doc(collection(db, 'bookings', chatId, 'messages'));
      const outgoingRole = fromInstructorPanel
        ? 'instructor'
        : resolveProfileSenderRole(currentUserProfile);

      const newMessage: ChatMessage = {
        id: msgRef.id,
        bookingId: booking.id,
        senderId: currentUserProfile.uid,
        senderName: currentUserProfile.displayName || currentUserProfile.email,
        senderAvatar: currentUserProfile.avatarUrl || '',
        senderRole: outgoingRole,
        text: inputText.trim(),
        timestamp: new Date().toISOString(),
      };

      if (
        currentUserProfile.instructorId &&
        (fromInstructorPanel || outgoingRole === 'instructor')
      ) {
        newMessage.senderInstructorId = currentUserProfile.instructorId;
      }

      if (attachment) {
        newMessage.attachmentType = attachment.type;
        newMessage.attachmentUrl = attachment.url;
        newMessage.attachmentName = attachment.name;
        if (attachment.size !== undefined) {
          newMessage.attachmentSize = attachment.size;
        }
      }

      if (sendAsHomework && fromInstructorPanel) {
        newMessage.isHomework = true;
        const targets = buildHomeworkForUserIds(
          homeworkAllStudents ? null : homeworkTargetUids,
          courseParticipants.length,
          courseParticipantUids
        );
        if (targets) {
          newMessage.homeworkForUserIds = targets;
        }
      }

      await setDoc(msgRef, newMessage);
      setInputText('');
      setSendAsHomework(false);
      resetHomeworkTargets();
      setAttachment(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, messagesPath);
    } finally {
      setIsSending(false);
    }
  };

  const handleToggleHomework = async (msg: ChatMessageRow, checked: boolean) => {
    const threadId = msg.threadId ?? resolveChatId(booking);
    const messagesPath = `bookings/${threadId}/messages/${msg.id}`;
    setHomeworkTogglingId(msg.id);
    try {
      const msgRef = doc(db, 'bookings', threadId, 'messages', msg.id);
      if (checked) {
        const targets = buildHomeworkForUserIds(null, courseParticipants.length);
        await updateDoc(msgRef, {
          isHomework: true,
          ...(targets ? { homeworkForUserIds: targets } : {}),
        });
      } else {
        await updateDoc(msgRef, {
          isHomework: false,
          homeworkForUserIds: deleteField(),
        });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, messagesPath);
    } finally {
      setHomeworkTogglingId(null);
    }
  };

  return createPortal(
    <ChatWindow booking={booking} onClose={onClose} onToggleRecommendation={onToggleRecommendation}>
      <ChatMessageList
        messages={messages}
        isLoading={isLoading}
        booking={booking}
        currentUserProfile={currentUserProfile}
        usersList={usersList}
        instructors={instructors}
        courses={courses}
        fromInstructorPanel={fromInstructorPanel}
        homeworkTogglingId={homeworkTogglingId}
        onToggleHomework={handleToggleHomework}
        messagesEndRef={messagesEndRef}
      />

      <MediaUploader
        isSending={isSending}
        isCompressing={isCompressing}
        compressionProgress={compressionProgress}
        linkInputVisible={linkInputVisible}
        linkInputVal={linkInputVal}
        attachment={attachment}
        fileInputRef={fileInputRef}
        videoInputRef={videoInputRef}
        onImageSelect={handleImageSelect}
        onVideoSelect={handleVideoSelect}
        onToggleLinkInput={() => setLinkInputVisible(!linkInputVisible)}
        onLinkInputChange={setLinkInputVal}
        onLinkAttach={handleLinkAttach}
        onClearAttachment={() => setAttachment(null)}
      />

      <HomeworkPanel
        fromInstructorPanel={fromInstructorPanel}
        sendAsHomework={sendAsHomework}
        showHomeworkTargetPicker={showHomeworkTargetPicker}
        homeworkAllStudents={homeworkAllStudents}
        homeworkTargetUids={homeworkTargetUids}
        courseParticipants={courseParticipants}
        isSending={isSending}
        isCompressing={isCompressing}
        onSendAsHomeworkChange={(checked) => {
          setSendAsHomework(checked);
          if (!checked) resetHomeworkTargets();
        }}
        onHomeworkAllChange={setHomeworkAll}
        onToggleHomeworkTargetUid={toggleHomeworkTargetUid}
      />

      <ChatInput
        inputText={inputText}
        onInputChange={setInputText}
        onSubmit={handleSendMessage}
        isSending={isSending}
        isCompressing={isCompressing}
        hasAttachment={Boolean(attachment)}
      />
    </ChatWindow>,
    document.body
  );
};
