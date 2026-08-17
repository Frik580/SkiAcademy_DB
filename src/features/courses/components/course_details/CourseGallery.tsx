import React, { useState, useRef, useEffect } from 'react';
import { Film, Image as ImageIcon, Play, Pause, Volume2, VolumeX } from 'lucide-react';
import { useLanguage } from '../../../../app/providers/LanguageContext';
import { logger } from '../../../../lib/logger';

interface CourseGalleryProps {
  photos: string[];
  videoUrl: string;
  courseTitle: string;
}

export const CourseGallery: React.FC<CourseGalleryProps> = ({ photos, videoUrl, courseTitle }) => {
  const { t } = useLanguage();
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [videoProgress, setVideoProgress] = useState(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    setIsPlaying(false);
    setVideoProgress(0);
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
    }
  }, [videoUrl]);

  const handlePlayPause = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      videoRef.current
        .play()
        .then(() => setIsPlaying(true))
        .catch((e) => logger.warn('Video failed to play:', e));
    }
  };

  const handleToggleMute = () => {
    if (!videoRef.current) return;
    videoRef.current.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    const progress = (videoRef.current.currentTime / videoRef.current.duration) * 100;
    setVideoProgress(Number.isNaN(progress) ? 0 : progress);
  };

  return (
    <>
      <section className="space-y-4">
        <div className="flex items-center gap-2 border-b border-[var(--border)] pb-2">
          <ImageIcon className="w-4 h-4 text-accent" />
          <h3 className="text-xs font-mono uppercase tracking-widest text-[var(--ink)] font-bold">
            {t('courseGallery')}
          </h3>
        </div>
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          {photos.map((p, idx) => (
            <div
              key={idx}
              className="aspect-[4/3] border border-[var(--border)] overflow-hidden bg-black/10 relative group cursor-crosshair"
            >
              <img
                src={p}
                referrerPolicy="no-referrer"
                alt={`${t('courseSnapshot')} ${idx + 1}`}
                className="w-full h-full object-cover grayscale transition duration-500 group-hover:scale-105 group-hover:grayscale-0"
              />
              <div className="absolute inset-0 bg-black/20 opacity-100 group-hover:opacity-0 transition duration-300" />
            </div>
          ))}
        </div>
      </section>

      {videoUrl && (
        <section className="space-y-4">
          <div className="flex items-center gap-2 border-b border-[var(--border)] pb-2">
            <Film className="w-4 h-4 text-rose-500" />
            <h3 className="text-xs font-mono uppercase tracking-widest text-[var(--ink)] font-bold">
              {t('courseVideoTeaser')}
            </h3>
          </div>

          <div className="relative aspect-video border border-[var(--border)] bg-black overflow-hidden group">
            <video
              ref={videoRef}
              src={videoUrl}
              className="w-full h-full object-cover"
              loop
              muted={isMuted}
              onTimeUpdate={handleTimeUpdate}
              playsInline
            />

            {!isPlaying && (
              <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center p-4 transition-opacity duration-300 pointer-events-none">
                <span className="text-[10px] font-mono tracking-widest uppercase text-white/70 mb-2">
                  {t('courseFeelAdrenaline')}
                </span>
                <span className="text-xs font-serif italic text-white/50 text-center max-w-xs mb-4">
                  {'"'}
                  {courseTitle}
                  {'"'}
                </span>
              </div>
            )}

            <div className="absolute bottom-0 inset-x-0 p-3 bg-gradient-to-t from-black/90 via-black/60 to-transparent flex items-center justify-between gap-4 transition opacity-100 lg:opacity-0 lg:group-hover:opacity-100 duration-300 z-10">
              <button
                onClick={handlePlayPause}
                className="p-1.5 bg-white/10 hover:bg-white/20 border border-white/20 text-white transition cursor-pointer"
                title={isPlaying ? t('pauseVideo') : t('playVideo')}
              >
                {isPlaying ? (
                  <Pause className="w-3.5 h-3.5 fill-white" />
                ) : (
                  <Play className="w-3.5 h-3.5 fill-white" />
                )}
              </button>

              <div className="flex-1 h-1 bg-white/20 relative rounded-none overflow-hidden cursor-pointer">
                <div className="h-full bg-sky-400" style={{ width: `${videoProgress}%` }} />
              </div>

              <button
                onClick={handleToggleMute}
                className="p-1.5 bg-white/10 hover:bg-white/20 border border-white/20 text-white transition cursor-pointer"
                title={isMuted ? t('unmuteVideo') : t('muteVideo')}
              >
                {isMuted ? (
                  <VolumeX className="w-3.5 h-3.5" />
                ) : (
                  <Volume2 className="w-3.5 h-3.5" />
                )}
              </button>
            </div>

            {!isPlaying && (
              <button
                onClick={handlePlayPause}
                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-14 h-14 bg-white/15 hover:bg-white/30 text-white flex items-center justify-center border border-white/30 backdrop-blur-md transition-all duration-300 hover:scale-105 z-20 cursor-pointer shadow-lg"
              >
                <Play className="w-6 h-6 fill-white ml-0.5" />
              </button>
            )}
          </div>
        </section>
      )}
    </>
  );
};
