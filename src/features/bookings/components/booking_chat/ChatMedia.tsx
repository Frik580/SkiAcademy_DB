import { useEffect, useState } from 'react';
import { downloadChatMedia } from '../../../chat/chatMediaClient';
import { rasterizeChatImage } from '../../../chat/chatImageDisplay';

/** Only local blob URLs reach media elements; Firebase bearer URLs never do. */
export function ChatMedia({
  value,
  type,
  name,
  openImage = false,
  className,
}: {
  value: string;
  type: 'image' | 'video';
  name: string;
  openImage?: boolean;
  className?: string;
}) {
  const [url, setUrl] = useState<string>();
  const [requested, setRequested] = useState(type === 'image');
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | undefined;
    const controller = new AbortController();
    setUrl(undefined);
    setFailed(false);
    if (!requested) return;
    void downloadChatMedia(value, controller.signal)
      .then(async (blob) => {
        if (type === 'video' && !blob.type.startsWith('video/')) {
          throw new Error('Invalid video media type');
        }
        const displayBlob =
          type === 'image' ? await rasterizeChatImage(blob, controller.signal) : blob;
        if (!cancelled) {
          objectUrl = URL.createObjectURL(displayBlob);
          setUrl(objectUrl);
        }
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [value, type, requested, attempt]);
  if (failed)
    return (
      <button type="button" onClick={() => setAttempt((value) => value + 1)} aria-label={name}>
        ↻ {name}
      </button>
    );
  if (!requested)
    return (
      <button type="button" onClick={() => setRequested(true)} aria-label={name}>
        ▶ {name}
      </button>
    );
  if (!url) return <span role="status">{name}</span>;
  if (type === 'image') {
    const image = (
      <img
        src={url}
        alt={name}
        className={className ?? 'max-h-[220px] w-auto max-w-full object-contain mx-auto'}
      />
    );
    return openImage ? (
      <button
        type="button"
        title={name}
        onClick={() => {
          // Never navigate to the raw image Blob: SVG is passive in <img> but
          // can execute scripts when opened as a document in the app's origin.
          const viewer = window.open('about:blank', '_blank');
          if (!viewer) return;
          viewer.opener = null;
          viewer.document.title = name;
          const fullImage = viewer.document.createElement('img');
          fullImage.src = url;
          fullImage.alt = name;
          fullImage.style.maxWidth = '100%';
          viewer.document.body.replaceChildren(fullImage);
        }}
      >
        {image}
      </button>
    ) : (
      image
    );
  }
  return (
    <video
      src={url}
      controls
      playsInline
      className={className ?? 'max-h-[220px] w-auto max-w-full object-contain mx-auto'}
    />
  );
}
