import { useEffect, useState } from 'react';
import { getLessonLevelLogoUrl } from './lessonLevelLogo';

export interface LessonLevelMarkerInput {
  marker: string;
  markerColor?: string;
  logoStoragePath?: string;
  previewUrl?: string;
}

export function LessonLevelMarker({
  marker,
  markerColor,
  logoStoragePath,
  previewUrl,
}: LessonLevelMarkerInput) {
  const [image, setImage] = useState<{ path: string; url: string }>();
  const [failedUrl, setFailedUrl] = useState<string>();
  useEffect(() => {
    let active = true;
    if (logoStoragePath && !previewUrl) {
      void getLessonLevelLogoUrl(logoStoragePath)
        .then((url) => {
          if (active) setImage({ path: logoStoragePath, url });
        })
        .catch(() => undefined);
    }
    return () => {
      active = false;
    };
  }, [logoStoragePath, previewUrl]);
  const url = previewUrl ?? (image?.path === logoStoragePath ? image?.url : undefined);
  return (
    <span
      aria-hidden="true"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        verticalAlign: 'middle',
        gap: '0.2em',
      }}
    >
      {markerColor && (
        <span
          data-lesson-marker-color={markerColor}
          style={{
            display: 'inline-block',
            width: '0.65em',
            height: '0.65em',
            borderRadius: '50%',
            backgroundColor: markerColor,
            border: '1px solid var(--ink-dim)',
            boxShadow: '0 0 0 1px var(--surface)',
          }}
        />
      )}
      {url && url !== failedUrl ? (
        <img
          src={url}
          alt=""
          onError={() => setFailedUrl(url)}
          style={{ width: '1.2em', height: '1.2em', objectFit: 'contain' }}
        />
      ) : (
        marker
      )}
    </span>
  );
}
