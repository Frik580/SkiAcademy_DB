import React, { useRef, useState } from 'react';
import { ChatInput } from '../../../src/features/bookings/components/booking_chat/ChatInput';
import { MediaUploader } from '../../../src/features/bookings/components/booking_chat/MediaUploader';

export function ChatFixture({ onSend }: { onSend: () => void }) {
  const [text, setText] = useState('');
  const [link, setLink] = useState('');
  const [linkVisible, setLinkVisible] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">Сообщения занятия</div>
      <MediaUploader
        fromAdminPanel
        isSending={false}
        isCompressing={false}
        compressionProgress=""
        linkInputVisible={linkVisible}
        linkInputVal={link}
        attachment={null}
        fileInputRef={fileInputRef}
        videoInputRef={videoInputRef}
        onImageSelect={() => {}}
        onVideoSelect={() => {}}
        onToggleLinkInput={() => setLinkVisible((v) => !v)}
        onLinkInputChange={setLink}
        onLinkAttach={() => setLinkVisible(false)}
        onClearAttachment={() => {}}
      />
      <ChatInput
        fromAdminPanel
        inputText={text}
        onInputChange={setText}
        onSubmit={(e) => {
          e.preventDefault();
          onSend();
        }}
        isSending={false}
        isCompressing={false}
        hasAttachment={false}
      />
    </>
  );
}
