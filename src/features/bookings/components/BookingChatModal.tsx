import { useAdminDialog } from '../../admin/components/useAdminDialog';
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Booking, UserProfile, Instructor, Course } from '../../../types';
import { uploadChatMedia } from '../../chat/chatMediaClient';
import { formatMediaUploadLimit } from '../../../lib/mediaUploadError';
import { useLanguage } from '../../../app/providers/LanguageContext';
import { logger } from '../../../shared';
import { resolveChatId, getCourseChatThreadIds } from '../../../domain/chat';
import { buildHomeworkForParticipantIds } from '../../../domain/chat';
import {
  createChatMessage,
  setChatMessageHomework,
  subscribeToChatMessages,
  resolveBookingChatAttachmentStoragePath,
} from '../../../features/chat';
import { ChatWindow } from './booking_chat/ChatWindow';
import { ChatMessageList, type ChatMessageRow } from './booking_chat/ChatMessageList';
import { MediaUploader } from './booking_chat/MediaUploader';
import { HomeworkPanel } from './booking_chat/HomeworkPanel';
import { ChatInput } from './booking_chat/ChatInput';
import {
  compressImage,
  compressVideo,
  formatCompressionError,
  LocalizedCompressionError,
  type PendingAttachment,
} from './booking_chat/chatCompression';

const EMPTY_CHAT: ChatMessageRow[] = [];

type CourseChatClient = { participantId: string; name: string; bookingId: string };
type ChatAttachmentUpload = {
  threadKey: string;
  file: File;
  type: 'image' | 'video';
  uploadId: string;
  path: string;
  result: { blob: Blob; name: string; size: number };
};

async function isSameSelectedFile(left: File, right: File): Promise<boolean> {
  if (left === right) return true;
  if (
    left.name !== right.name ||
    left.size !== right.size ||
    left.type !== right.type ||
    left.lastModified !== right.lastModified
  )
    return false;
  // File pickers hand out new File instances. Compare only on a possible retry,
  // using bounded buffers even for videos.
  const blockSize = 1024 * 1024;
  for (let offset = 0; offset < left.size; offset += blockSize) {
    const [first, second] = await Promise.all([
      left.slice(offset, offset + blockSize).arrayBuffer(),
      right.slice(offset, offset + blockSize).arrayBuffer(),
    ]);
    const other = new Uint8Array(second);
    if (!new Uint8Array(first).every((byte, index) => byte === other[index])) return false;
  }
  return true;
}

interface BookingChatModalProps {
  booking: Booking & {
    chatId?: string;
    participantBookingIds?: string[];
    isCourse?: boolean;
    courseId?: string;
    clients?: CourseChatClient[];
    participantIds?: readonly string[];
    participants?: readonly {
      participantId: string;
      clientName: string;
    }[];
  };
  currentUserProfile: UserProfile;
  onClose: () => void;
  usersList?: UserProfile[];
  instructors?: Instructor[];
  courses?: Course[];
  fromInstructorPanel?: boolean;
  fromAdminPanel?: boolean;
}

export const BookingChatModal: React.FC<BookingChatModalProps> = ({
  booking,
  currentUserProfile,
  onClose,
  fromInstructorPanel = false,
  fromAdminPanel = false,
}) => {
  const { t, language } = useLanguage();
  const { alert: alertAdminDialog, dialog: adminDialog } = useAdminDialog();
  const threadKey = JSON.stringify([currentUserProfile.uid, getCourseChatThreadIds(booking)]);
  const [chatHistory, setChatHistory] = useState<{ key: string; rows: ChatMessageRow[] }>();
  const messages = chatHistory?.key === threadKey ? chatHistory.rows : EMPTY_CHAT;
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [sendAsHomework, setSendAsHomework] = useState(false);
  const [homeworkAllStudents, setHomeworkAllStudents] = useState(true);
  const [homeworkTargetParticipantIds, setHomeworkTargetParticipantIds] = useState<string[]>([]);
  const [homeworkTogglingId, setHomeworkTogglingId] = useState<string | null>(null);

  const [attachment, setAttachment] = useState<PendingAttachment | null>(null);
  const [isCompressing, setIsCompressing] = useState<boolean>(false);
  const [compressionProgress, setCompressionProgress] = useState<string>('');
  const [linkInputVisible, setLinkInputVisible] = useState(false);
  const [linkInputVal, setLinkInputVal] = useState('');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const pendingUpload = useRef<ChatAttachmentUpload>();

  const courseParticipants = useMemo(() => {
    if (!fromInstructorPanel) return [] as CourseChatClient[];
    if (booking.participants?.length) {
      return booking.participants
        .filter((participant) => Boolean(participant.participantId))
        .map((participant) => ({
          participantId: participant.participantId,
          name: participant.clientName,
          bookingId: booking.id,
        }));
    }
    if (booking.participantIds?.length) {
      return booking.participantIds.filter(Boolean).map((participantId) => ({
        participantId,
        name: participantId,
        bookingId: booking.id,
      }));
    }
    return [];
  }, [booking, fromInstructorPanel]);

  const showHomeworkTargetPicker =
    fromInstructorPanel && sendAsHomework && courseParticipants.length > 1;

  const courseParticipantIds = useMemo(
    () => courseParticipants.map((p) => p.participantId),
    [courseParticipants]
  );

  const resetHomeworkTargets = () => {
    setHomeworkAllStudents(true);
    setHomeworkTargetParticipantIds([]);
  };

  const setHomeworkAll = (checked: boolean) => {
    setHomeworkAllStudents(checked);
    if (checked) setHomeworkTargetParticipantIds([]);
  };

  const toggleHomeworkTargetParticipantId = (participantId: string, checked: boolean) => {
    setHomeworkAllStudents(false);
    setHomeworkTargetParticipantIds((prev) => {
      if (checked) return prev.includes(participantId) ? prev : [...prev, participantId];
      return prev.filter((id) => id !== participantId);
    });
  };

  useEffect(() => {
    const chatIds = getCourseChatThreadIds(booking);
    setChatHistory(undefined);
    setIsLoading(true);

    const messageMap = new Map<string, ChatMessageRow>();
    const loadedThreads = new Set<string>();

    const unsubscribes = chatIds.map((threadId) =>
      subscribeToChatMessages(
        threadId,
        (threadMessages) => {
          const threadPrefix = `${threadId}:`;
          for (const key of messageMap.keys()) {
            if (key.startsWith(threadPrefix)) {
              messageMap.delete(key);
            }
          }
          threadMessages.forEach((message) => {
            messageMap.set(`${threadId}:${message.id}`, {
              ...message,
              threadId,
            } as ChatMessageRow);
          });
          loadedThreads.add(threadId);
          const list = Array.from(messageMap.values());
          list.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
          setChatHistory({ key: threadKey, rows: list });
          if (loadedThreads.size >= chatIds.length) setIsLoading(false);
        },
        () => {
          loadedThreads.add(threadId);
          if (loadedThreads.size >= chatIds.length) setIsLoading(false);
        }
      )
    );

    return () => unsubscribes.forEach((unsub) => unsub());
  }, [
    threadKey,
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

  const attachMedia = async (file: File, type: 'image' | 'video') => {
    let attempt = pendingUpload.current;
    let resume = true;
    if (
      attempt?.threadKey !== threadKey ||
      attempt.type !== type ||
      !(await isSameSelectedFile(attempt.file, file))
    ) {
      resume = false;
      pendingUpload.current = undefined;
      const result = await (type === 'image' ? compressImage(file) : compressVideo(file));
      if (type === 'video' && result.size > 800 * 1024)
        throw new LocalizedCompressionError('chatOptimizedVideoTooLarge');
      const name = type === 'image' ? file.name : result.name;
      const sanitizedName = name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const chatId = resolveChatId(booking);
      const uploadId = crypto.randomUUID();
      const scopedPath = resolveBookingChatAttachmentStoragePath(
        { ...booking, chatId },
        `${Date.now()}_${sanitizedName}`
      );
      attempt = {
        threadKey,
        file,
        type,
        uploadId,
        path: scopedPath.startsWith('chat/') ? scopedPath.replace(/[^/]+$/, uploadId) : scopedPath,
        result,
      };
      if (attempt.path.startsWith('chat/')) pendingUpload.current = attempt;
    }
    const { path, result, uploadId } = attempt;
    const url = await uploadChatMedia(result.blob, path, uploadId, resume);
    if (pendingUpload.current === attempt) pendingUpload.current = undefined;
    setAttachment({ type, url, name: result.name, size: result.size });
  };

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsCompressing(true);
    setCompressionProgress(t('chatOptimizingImage'));
    try {
      await attachMedia(file, 'image');
    } catch (err: unknown) {
      logger.error(err);
      const message =
        formatMediaUploadLimit(err, language) ??
        formatCompressionError(err, t, 'chatImageProcessingFailed');
      if (fromAdminPanel) void alertAdminDialog(message);
      else alert(message);
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
      if (fromAdminPanel) void alertAdminDialog(t('chatVideoTooLarge'));
      else alert(t('chatVideoTooLarge'));
      return;
    }

    setIsCompressing(true);
    setCompressionProgress(t('chatOptimizingVideo'));
    try {
      await attachMedia(file, 'video');
    } catch (err: unknown) {
      logger.error(err);
      const message =
        formatMediaUploadLimit(err, language) ??
        formatCompressionError(err, t, 'chatVideoProcessingFailed');
      if (fromAdminPanel) void alertAdminDialog(message);
      else alert(message);
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
      if (fromAdminPanel) void alertAdminDialog(t('chatInvalidLink'));
      else alert(t('chatInvalidLink'));
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!inputText.trim() && !attachment) || isSending || isCompressing) return;

    setIsSending(true);
    const chatId = resolveChatId(booking);
    try {
      const context = fromInstructorPanel
        ? 'instructor'
        : fromAdminPanel
          ? 'administration'
          : 'participant';
      const message = {
        text: inputText.trim(),
        ...(attachment
          ? {
              attachmentType: attachment.type,
              attachmentUrl: attachment.url,
              attachmentName: attachment.name,
              ...(attachment.size === undefined ? {} : { attachmentSize: attachment.size }),
            }
          : {}),
      };

      const assignHomework = sendAsHomework && fromInstructorPanel;
      const targets = assignHomework
        ? buildHomeworkForParticipantIds(
            homeworkAllStudents ? null : homeworkTargetParticipantIds,
            courseParticipants.length,
            courseParticipantIds
          )
        : undefined;

      await createChatMessage(
        chatId,
        currentUserProfile.uid,
        message,
        context,
        assignHomework ? (targets ? { participantIds: targets } : {}) : undefined
      );
      setInputText('');
      setSendAsHomework(false);
      resetHomeworkTargets();
      setAttachment(null);
    } finally {
      setIsSending(false);
    }
  };

  const handleToggleHomework = async (msg: ChatMessageRow, checked: boolean) => {
    const threadId = msg.threadId ?? resolveChatId(booking);
    setHomeworkTogglingId(msg.id);
    try {
      if (checked) {
        const targets = buildHomeworkForParticipantIds(null, courseParticipants.length);
        await setChatMessageHomework(threadId, msg.id, currentUserProfile.uid, true, targets);
      } else {
        await setChatMessageHomework(threadId, msg.id, currentUserProfile.uid, false);
      }
    } finally {
      setHomeworkTogglingId(null);
    }
  };

  return createPortal(
    <ChatWindow booking={booking} onClose={onClose} fromAdminPanel={fromAdminPanel}>
      {adminDialog}
      <ChatMessageList
        messages={messages}
        isLoading={isLoading}
        currentUserId={currentUserProfile.uid}
        fromInstructorPanel={fromInstructorPanel}
        homeworkTogglingId={homeworkTogglingId}
        onToggleHomework={handleToggleHomework}
        messagesEndRef={messagesEndRef}
      />

      <MediaUploader
        fromAdminPanel={fromAdminPanel}
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
        homeworkTargetParticipantIds={homeworkTargetParticipantIds}
        courseParticipants={courseParticipants}
        isSending={isSending}
        isCompressing={isCompressing}
        onSendAsHomeworkChange={(checked) => {
          setSendAsHomework(checked);
          if (!checked) resetHomeworkTargets();
        }}
        onHomeworkAllChange={setHomeworkAll}
        onToggleHomeworkTargetParticipantId={toggleHomeworkTargetParticipantId}
      />

      <ChatInput
        fromAdminPanel={fromAdminPanel}
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
