import { useEffect, useState, type ImgHTMLAttributes } from 'react';
import { useAuthStore } from '../auth/authStore';
import { protectedImageStoragePath, readProtectedImage } from '../../infrastructure/firebase';

/** Public URLs pass through unchanged. Protected objects never use bearer-token URLs. */
export function ProtectedImage({ src, ...props }: ImgHTMLAttributes<HTMLImageElement>) {
  const uid = useAuthStore((state) => state.firebaseUser?.uid);
  const generation = useAuthStore((state) => state.authGeneration);
  const privatePath = src ? protectedImageStoragePath(src) : undefined;
  const [loaded, setLoaded] = useState<{ key: string; url: string }>();
  const key = `${uid}:${generation}:${src}`;
  useEffect(() => {
    if (!privatePath || !src) return;
    const abort = new AbortController();
    let url: string | undefined;
    void readProtectedImage(src, abort.signal)
      .then((blob) => {
        if (abort.signal.aborted) return;
        url = URL.createObjectURL(blob);
        setLoaded({ key, url });
      })
      .catch(() => {
        if (!abort.signal.aborted) setLoaded({ key, url: 'data:image/invalid,' });
      });
    return () => {
      abort.abort();
      if (url) URL.revokeObjectURL(url);
    };
  }, [key, privatePath, src]);
  return (
    <img
      {...props}
      alt={props.alt ?? ''}
      srcSet={privatePath ? undefined : props.srcSet}
      src={privatePath ? (loaded?.key === key ? loaded.url : undefined) : src}
    />
  );
}
