import React, { useState, useRef, useEffect } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { 
  X, Calendar, Clock, Users, Award, Play, Pause, 
  Volume2, VolumeX, ChevronDown, Star, HelpCircle, 
  Film, Image as ImageIcon, BookOpen, ShieldCheck, Heart, Layers
} from 'lucide-react';
import { Course, Instructor, UserProfile } from '../types';
import { useLanguage, translateInstructorName, splitCourseDates } from '../lib/LanguageContext';

interface CourseDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  rawCourse: Course | null;
  course: Course | null;
  instructors: Instructor[];
  userProfile: UserProfile | null;
  isEnrolled: boolean;
  onEnroll: (courseId: string) => void;
}

// Helper to generate custom rich content dynamically based on course attributes
const getCourseEnrichedData = (courseId: string, level: string, title: string, language: string) => {
  const isSnowboard = title.toLowerCase().includes('snowboard') || 
                      title.toLowerCase().includes('сноуборд') || 
                      title.toLowerCase().includes('board') || 
                      courseId.toLowerCase().includes('snowboard');

  const photos = isSnowboard 
    ? [
        'https://images.unsplash.com/photo-1522056690494-7b83f95415b9?auto=format&fit=crop&q=80&w=600',
        'https://images.unsplash.com/photo-1502126324834-38f8e02d7160?auto=format&fit=crop&q=80&w=600',
        'https://images.unsplash.com/photo-1482862549707-f63cb32c5fd9?auto=format&fit=crop&q=80&w=600'
      ]
    : [
        'https://images.unsplash.com/photo-1551698618-1ffdfe1d9772?auto=format&fit=crop&q=80&w=600',
        'https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?auto=format&fit=crop&q=80&w=600',
        'https://images.unsplash.com/photo-1517153295259-74eb0b416cee?auto=format&fit=crop&q=80&w=600'
      ];

  const videoUrl = isSnowboard
    ? 'https://assets.mixkit.co/videos/preview/mixkit-snowboarder-sliding-down-a-snowy-slope-34279-large.mp4'
    : 'https://assets.mixkit.co/videos/preview/mixkit-skier-sliding-fast-down-a-mountain-slope-34280-large.mp4';

  let benefitsEn: string[] = [];
  let benefitsRu: string[] = [];

  if (level === 'beginner') {
    benefitsEn = [
      'Master the basic safety rules on active ski slopes.',
      'Gain full control of your speed with confident snowplow turns.',
      'Learn how to use t-bars and chairlifts without stress.'
    ];
    benefitsRu = [
      'Освоите базовые правила безопасности на активных склонах.',
      'Получите полный контроль над скоростью благодаря уверенным поворотам.',
      'Научитесь пользоваться бугельными и кресельными подъемниками без стресса.'
    ];
  } else if (level === 'intermediate') {
    benefitsEn = [
      'Understand body positioning and dynamic weight distribution.',
      'Perform high-speed carving turns with clean edge transitions.',
      'Handle icy patches and moderate steeeps with solid control.'
    ];
    benefitsRu = [
      'Поймете правильное положение тела и динамическое распределение веса.',
      'Освоите карвинговые повороты на скорости с чистым ведением дуги.',
      'Сможете уверенно проходить обледенелые участки и склоны средней крутизны.'
    ];
  } else if (level === 'advanced') {
    benefitsEn = [
      'Tackle advanced mogul fields and steep off-piste terrain.',
      'Learn basic freestyle movements, small jumps, and box slides.',
      'Optimize edge grip for high-velocity racing and sharp slalom.'
    ];
    benefitsRu = [
      'Научитесь проходить бугры (могул) и крутые неподготовленные склоны.',
      'Освоите базовые элементы фристайла, небольшие прыжки и скольжение по боксам.',
      'Оптимизируете сцепление кантов для скоростных спусков и слалома.'
    ];
  } else {
    benefitsEn = [
      'Conquer deep powder fields and technical backcountry couloirs.',
      'Master safety protocols, avalanche awareness, and terrain assessment.',
      'Perfect your signature style for high-altitude competitive speeds.'
    ];
    benefitsRu = [
      'Покорите глубокий пухляк и техничные кулуары в бэккантри.',
      'Освоите протоколы лавинной безопасности и чтение сложного рельефа.',
      'Отточите фирменный стиль для спусков на предельных скоростях.'
    ];
  }

  let programEn = [
    { day: 'Day 1', title: 'Stance & Balance Foundation', desc: 'Equipment inspection, basic mechanics of edge engagement, and body alignment adjustments.' },
    { day: 'Day 2', title: 'Controlled Rotation Progression', desc: 'Initiating fluent turns, active compression/decompression, and speed control techniques.' },
    { day: 'Day 3', title: 'Dynamic Alpine Integration', desc: 'Applying techniques on steeper slopes, individualized video feedback, and style optimization.' }
  ];
  let programRu = [
    { day: 'День 1', title: 'Основа стойки и баланса', desc: 'Проверка снаряжения, базовая механика работы кантов и точная настройка положения тела.' },
    { day: 'День 2', title: 'Прогрессия контролируемого поворота', desc: 'Инициирование плавных дуг, активная работа ног (разгрузка-закантовка) и контроль скорости.' },
    { day: 'День 3', title: 'Динамическая интеграция на склоне', desc: 'Применение техники на крутых участках, индивидуальный видеоанализ вашей техники и шлифовка стиля.' }
  ];

  if (level === 'expert' || level === 'advanced') {
    programEn = [
      { day: 'Day 1', title: 'Tactical Terrain Assessment', desc: 'Advanced biomechanics, reading off-piste snow structure, and dynamic edge loading.' },
      { day: 'Day 2', title: 'Off-Piste & Steep Technical Maneuvers', desc: 'Mogul absorption, carving under extreme G-force, and drop-in tactics.' },
      { day: 'Day 3', title: 'Backcountry Expedition & Style Polish', desc: 'Finding natural features, freestyle jump integration, and full video analysis of speed runs.' }
    ];
    programRu = [
      { day: 'День 1', title: 'Тактический анализ рельефа', desc: 'Продвинутая биомеханика, чтение структуры снега вне трасс и динамическая закантовка.' },
      { day: 'День 2', title: 'Внетрассовые и крутые технические маневры', desc: 'Амортизация бугров, карвинг в условиях сильных перегрузок и техника входов в кулуары.' },
      { day: 'День 3', title: 'Бэккантри-экспедиция и шлифовка стиля', desc: 'Поиск естественного рельефа, интеграция прыжков с надувов и детальный разбор заездов на видео.' }
    ];
  }

  let reviewsEn = [
    { name: 'Alex Thompson', rating: 5, date: 'Feb 15, 2026', avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&q=80&w=150', comment: 'Absolutely transformed my confidence on steep slopes. The level of detail from instructors is amazing.' },
    { name: 'Emma Watson', rating: 5, date: 'Jan 10, 2026', avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&q=80&w=150', comment: 'Incredibly well structured. Worth every penny. Felt very safe yet challenged!' }
  ];
  let reviewsRu = [
    { name: 'Алексей Томпсон', rating: 5, date: '15 Фев 2026', avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&q=80&w=150', comment: 'Абсолютно изменило мою уверенность на крутых склонах. Уровень детализации от инструкторов поражает.' },
    { name: 'Эмма Ватсон', rating: 5, date: '10 Янв 2026', avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&q=80&w=150', comment: 'Невероятно хорошо спланировано. Стоит каждой копейки. Чувствовала себя в безопасности, но при этом был классный вызов!' }
  ];

  const faqEn = [
    { q: 'Is professional gear rental included in the price?', a: 'Rental equipment is not included in the course fee. However, our students get a 15% discount at the resort rental shop. We recommend arriving 45 minutes early if you need rental gear.' },
    { q: 'What happens in case of extreme weather or lift closure?', a: 'If resort lifts are completely closed due to weather conditions, we will reschedule the sessions or offer a full refund for the affected days.' },
    { q: 'Can I cancel or change dates?', a: 'Yes, you can cancel or reschedule free of charge up to 48 hours before the course starts. Within 48 hours, a 50% cancellation fee applies.' }
  ];
  const faqRu = [
    { q: 'Входит ли аренда профессионального снаряжения в стоимость?', a: 'Аренда снаряжения не входит в стоимость курса. Однако наши ученики получают скидку 15% в партнерском прокате курорта. Мы рекомендуем приезжать за 45 минут до начала, если вам нужен прокат.' },
    { q: 'Что происходит в случае экстремальной погоды или закрытия подъемников?', a: 'Если подъемники курорта полностью закрыты из-за погодных условий, мы перенесем занятие на другое время или вернем полную стоимость за отмененные дни.' },
    { q: 'Могу ли я отменить бронирование или изменить даты?', a: 'Да, вы можете бесплатно отменить или изменить даты курса за 48 часов до его начала. При отмене менее чем за 48 часов удерживается сбор в размере 50%.' }
  ];

  return {
    photos,
    videoUrl,
    benefits: language === 'ru' ? benefitsRu : benefitsEn,
    program: language === 'ru' ? programRu : programEn,
    reviews: language === 'ru' ? reviewsRu : reviewsEn,
    faq: language === 'ru' ? faqRu : faqEn
  };
};

export const CourseDetailsModal: React.FC<CourseDetailsModalProps> = ({
  isOpen,
  onClose,
  rawCourse,
  course,
  instructors,
  userProfile,
  isEnrolled,
  onEnroll,
}) => {
  const { language } = useLanguage();
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [videoProgress, setVideoProgress] = useState(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Auto reset video player state on course change or close
  useEffect(() => {
    setIsPlaying(false);
    setVideoProgress(0);
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
    }
  }, [course?.id, isOpen]);

  if (!isOpen || !course || !rawCourse) return null;

  const { datePart, timePart } = splitCourseDates(course.dates);
  const seatsPercentage = Math.round((course.availableSeats / course.totalSeats) * 100);

  const defaultEnriched = getCourseEnrichedData(
    course.id,
    course.level || 'beginner',
    course.title,
    language
  );

  const benefits = (language === 'ru' ? rawCourse.benefitsRu : rawCourse.benefits) || defaultEnriched.benefits;
  const program = (language === 'ru' ? rawCourse.programRu : rawCourse.program) || defaultEnriched.program;
  const faq = (language === 'ru' ? rawCourse.faqRu : rawCourse.faq) || defaultEnriched.faq;
  const photos = rawCourse.galleryPhotos || defaultEnriched.photos;
  const videoUrl = rawCourse.videoUrl || defaultEnriched.videoUrl;

  const enriched = {
    photos,
    videoUrl,
    benefits,
    program,
    faq,
    reviews: defaultEnriched.reviews
  };

  const handlePlayPause = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      videoRef.current.play()
        .then(() => setIsPlaying(true))
        .catch((e) => console.warn('Video failed to play:', e));
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
    setVideoProgress(isNaN(progress) ? 0 : progress);
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
        {/* Backdrop Overlay */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-black/85 backdrop-blur-md z-40"
        />

        {/* Content Container (Premium Wide Editorial Modal) */}
        <motion.div
          initial={{ opacity: 0, scale: 0.98, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.98, y: 20 }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          className="relative bg-[var(--bg)] border border-[var(--border)] shadow-2xl w-full max-w-4xl lg:max-w-5xl overflow-hidden transition-colors duration-300 rounded-none flex flex-col my-8 z-50 max-h-[90vh]"
        >
          {/* Hero Section */}
          <div className="relative h-40 sm:h-50 shrink-0 border-b border-[var(--border)] bg-black">
            <img
              src={course.bgImageUrl || 'https://images.unsplash.com/photo-1551698618-1ffdfe1d9772?auto=format&fit=crop&q=80&w=1200'}
              referrerPolicy="no-referrer"
              alt={course.title}
              className="w-full h-full object-cover object-[center_-200px] grayscale opacity-75 brightness-[0.7] scale-102 transition duration-700 hover:scale-100"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-black/20" />
            
            {/* Close button */}
            <button
              type="button"
              onClick={onClose}
              className="absolute top-4 right-4 p-2 border border-white/20 bg-black/50 hover:bg-black/90 text-white/80 hover:text-white transition cursor-pointer rounded-none z-30"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Badges */}
            <div className="absolute top-4 left-4 flex items-center gap-2 z-20">
              <span className="font-mono text-[9px] uppercase tracking-widest text-sky-400 bg-sky-950/80 border border-sky-800/60 px-3 py-1 font-bold">
                {course.duration}
              </span>
              {course.badge && (
                <>
                  {/^(https?:\/\/|\/|data:image\/)/.test(course.badge) || /\.(png|jpg|jpeg|svg|gif|webp)/i.test(course.badge) ? (
                    <img 
                      src={course.badge} 
                      referrerPolicy="no-referrer" 
                      alt="badge" 
                      className="h-7 w-auto object-contain max-w-[95px] drop-shadow-md" 
                    />
                  ) : (
                    <span className="font-mono text-[9px] font-bold uppercase tracking-widest text-white border border-white/40 bg-black/40 backdrop-blur-[2px] px-3 py-1 shadow-md">
                      {course.badge}
                    </span>
                  )}
                </>
              )}
            </div>

            {/* Editorial Title & Subtext inside Hero */}
            <div className="absolute bottom-0 inset-x-0 p-6 sm:p-8 flex flex-col justify-end">
              {course.levelLabel && (
                <div className={`text-[10px] font-mono uppercase tracking-widest font-extrabold mb-1.5 flex items-center gap-1.5 drop-shadow ${
                  course.level === 'beginner' ? 'text-emerald-400' :
                  course.level === 'intermediate' ? 'text-amber-400' :
                  course.level === 'advanced' ? 'text-rose-400' :
                  course.level === 'expert' ? 'text-stone-300' : 'text-white/90'
                }`}>
                  {course.levelLabel}
                </div>
              )}
              <h1 className="font-serif text-2xl sm:text-4xl lg:text-5xl font-extralight text-white leading-tight tracking-tight max-w-3xl drop-shadow-sm">
                {course.title}
              </h1>
            </div>
          </div>

          {/* Modal Main Body (2-Column bento grid on desktop) */}
          <div className="overflow-y-auto flex-1 bg-[var(--bg)]">
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-8 p-6 sm:p-8">
              
              {/* Left Column (Rich Content Flow) */}
              <div className="space-y-10">
                
                {/* 1. Description */}
                <section className="space-y-3">
                  <div className="flex items-center gap-2 border-b border-[var(--border)] pb-2">
                    <BookOpen className="w-4 h-4 text-sky-500" />
                    <h3 className="text-xs font-mono uppercase tracking-widest text-[var(--ink)] font-bold">
                      {language === 'ru' ? 'Описание курса' : 'Course Overview'}
                    </h3>
                  </div>
                  <p className="text-sm sm:text-base text-[var(--ink)] leading-relaxed font-sans font-light">
                    {course.detailedDescription || course.description}
                  </p>
                </section>

                {/* 2. Что вы получите (What you'll get) */}
                <section className="space-y-4">
                  <div className="flex items-center gap-2 border-b border-[var(--border)] pb-2">
                    <Award className="w-4 h-4 text-emerald-500" />
                    <h3 className="text-xs font-mono uppercase tracking-widest text-[var(--ink)] font-bold">
                      {language === 'ru' ? 'Что вы получите' : 'What You Will Master'}
                    </h3>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {enriched.benefits.map((benefit, idx) => (
                      <div 
                        key={idx} 
                        className="p-4 border border-[var(--border)] bg-black/5 dark:bg-white/5 flex flex-col gap-3 group transition hover:border-[var(--ink)] duration-300"
                      >
                        <div className="w-8 h-8 rounded-none border border-[var(--border)] flex items-center justify-center font-mono text-xs text-[var(--ink-dim)] bg-transparent">
                          0{idx + 1}
                        </div>
                        <p className="text-xs text-[var(--ink)] leading-relaxed font-sans font-medium">
                          {benefit}
                        </p>
                      </div>
                    ))}
                  </div>
                </section>

                {/* 3. Программа по дням (Curriculum / Program by days) */}
                <section className="space-y-4">
                  <div className="flex items-center gap-2 border-b border-[var(--border)] pb-2">
                    <Layers className="w-4 h-4 text-amber-500" />
                    <h3 className="text-xs font-mono uppercase tracking-widest text-[var(--ink)] font-bold">
                      {language === 'ru' ? 'Программа по дням' : 'Day-By-Day Program'}
                    </h3>
                  </div>
                  <div className="relative border-l border-[var(--border)]/70 pl-6 ml-3 space-y-6 py-1">
                    {enriched.program.map((step, idx) => (
                      <div key={idx} className="relative group">
                        {/* Bullet circle point */}
                        <div className="absolute -left-9.5 top-0.5 w-7 h-7 border border-[var(--border)] bg-[var(--bg)] flex items-center justify-center font-mono text-[9px] font-bold text-[var(--ink)] transition group-hover:border-[var(--ink)]">
                          {idx + 1}
                        </div>
                        <div className="space-y-1">
                          <span className="text-[9px] font-mono uppercase tracking-wider text-sky-500 font-bold">
                            {step.day}
                          </span>
                          <h4 className="text-sm font-bold text-[var(--ink)]">
                            {step.title}
                          </h4>
                          <p className="text-xs text-[var(--ink-dim)] leading-relaxed">
                            {step.desc}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                {/* 4. Фотогалерея (Photos) */}
                <section className="space-y-4">
                  <div className="flex items-center gap-2 border-b border-[var(--border)] pb-2">
                    <ImageIcon className="w-4 h-4 text-indigo-500" />
                    <h3 className="text-xs font-mono uppercase tracking-widest text-[var(--ink)] font-bold">
                      {language === 'ru' ? 'Галерея курса' : 'Course Gallery'}
                    </h3>
                  </div>
                  <div className="grid grid-cols-3 gap-2 sm:gap-3">
                    {enriched.photos.map((p, idx) => (
                      <div 
                        key={idx} 
                        className="aspect-[4/3] border border-[var(--border)] overflow-hidden bg-black/10 relative group cursor-crosshair"
                      >
                        <img
                          src={p}
                          referrerPolicy="no-referrer"
                          alt={`Course snapshot ${idx + 1}`}
                          className="w-full h-full object-cover grayscale transition duration-500 group-hover:scale-105 group-hover:grayscale-0"
                        />
                        <div className="absolute inset-0 bg-black/20 opacity-100 group-hover:opacity-0 transition duration-300" />
                      </div>
                    ))}
                  </div>
                </section>

                {/* 5. Видео (Video Showcase with Real Custom Interactive Player) */}
                <section className="space-y-4">
                  <div className="flex items-center gap-2 border-b border-[var(--border)] pb-2">
                    <Film className="w-4 h-4 text-rose-500" />
                    <h3 className="text-xs font-mono uppercase tracking-widest text-[var(--ink)] font-bold">
                      {language === 'ru' ? 'Видеообзор' : 'Video Teaser'}
                    </h3>
                  </div>
                  
                  {/* Interactive Video Box */}
                  <div className="relative aspect-video border border-[var(--border)] bg-black overflow-hidden group">
                    <video
                      ref={videoRef}
                      src={enriched.videoUrl}
                      className="w-full h-full object-cover"
                      loop
                      muted={isMuted}
                      onTimeUpdate={handleTimeUpdate}
                      playsInline
                    />

                    {/* Dark Vignette Overlay when paused */}
                    {!isPlaying && (
                      <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center p-4 transition-opacity duration-300 pointer-events-none">
                        <span className="text-[10px] font-mono tracking-widest uppercase text-white/70 mb-2">
                          {language === 'ru' ? 'Почувствуйте драйв' : 'Feel the adrenaline'}
                        </span>
                        <span className="text-xs font-serif italic text-white/50 text-center max-w-xs mb-4">
                          "{course.title}"
                        </span>
                      </div>
                    )}

                    {/* Video Controls Panel */}
                    <div className="absolute bottom-0 inset-x-0 p-3 bg-gradient-to-t from-black/90 via-black/60 to-transparent flex items-center justify-between gap-4 transition opacity-100 lg:opacity-0 lg:group-hover:opacity-100 duration-300 z-10">
                      
                      {/* Play/Pause */}
                      <button
                        onClick={handlePlayPause}
                        className="p-1.5 bg-white/10 hover:bg-white/20 border border-white/20 text-white transition cursor-pointer"
                        title={isPlaying ? 'Pause' : 'Play'}
                      >
                        {isPlaying ? <Pause className="w-3.5 h-3.5 fill-white" /> : <Play className="w-3.5 h-3.5 fill-white" />}
                      </button>

                      {/* Progress Line */}
                      <div className="flex-1 h-1 bg-white/20 relative rounded-none overflow-hidden cursor-pointer">
                        <div 
                          className="h-full bg-sky-400" 
                          style={{ width: `${videoProgress}%` }}
                        />
                      </div>

                      {/* Audio Controls */}
                      <button
                        onClick={handleToggleMute}
                        className="p-1.5 bg-white/10 hover:bg-white/20 border border-white/20 text-white transition cursor-pointer"
                        title={isMuted ? 'Unmute' : 'Mute'}
                      >
                        {isMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                      </button>
                    </div>

                    {/* Central Glowing Big Play Button (shows when not playing) */}
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

                {/* 6. Инструкторы (Instructors) */}
                {rawCourse.instructorIds && rawCourse.instructorIds.length > 0 && (
                  <section className="space-y-4">
                    <div className="flex items-center gap-2 border-b border-[var(--border)] pb-2">
                      <Users className="w-4 h-4 text-violet-500" />
                      <h3 className="text-xs font-mono uppercase tracking-widest text-[var(--ink)] font-bold">
                        {language === 'ru' ? 'Ваши инструкторы' : 'Your Instructors'}
                      </h3>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      {rawCourse.instructorIds.map((insId) => {
                        const ins = instructors.find((i) => i.id === insId);
                        if (!ins) return null;
                        return (
                          <div
                            key={insId}
                            className="flex items-center gap-3.5 bg-black/5 dark:bg-white/5 border border-[var(--border)] p-3 transition hover:border-[var(--ink)] duration-300"
                          >
                            <img
                              src={ins.avatarUrl}
                              referrerPolicy="no-referrer"
                              alt={ins.name}
                              className="w-14 h-14 object-cover border border-[var(--border)] grayscale shrink-0"
                            />
                            <div className="min-w-0 leading-tight">
                              <p className="text-xs font-extrabold text-[var(--ink)] truncate">
                                {translateInstructorName(ins.name, language)}
                              </p>
                              <p className="text-[10px] text-[var(--ink-dim)] mt-0.5 uppercase tracking-wide font-mono">
                                {ins.specialty === 'both'
                                  ? language === 'en' ? 'Ski & Snowboard' : 'Лыжи и Сноуборд'
                                  : ins.specialty === 'ski'
                                  ? language === 'en' ? 'Ski Specialist' : 'Инструктор по Лыжам'
                                  : language === 'en' ? 'Snowboard Specialist' : 'Инструктор по Сноуборду'}
                              </p>
                              <div className="flex items-center gap-2 mt-1.5">
                                <span className="text-[9px] font-mono text-sky-500 bg-sky-500/10 dark:bg-sky-500/20 px-1.5 py-0.5 font-bold">
                                  {language === 'en' ? `${ins.experienceYears}Y Exp` : `${ins.experienceYears} лет опыта`}
                                </span>
                                <span className="flex items-center gap-0.5 text-[9px] font-mono text-amber-500 font-bold">
                                  <Star className="w-2.5 h-2.5 fill-amber-500 text-transparent" />
                                  {ins.rating.toFixed(1)}
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                )}

                {/* 7. Отзывы (Reviews) */}
                <section className="space-y-4">
                  <div className="flex items-center gap-2 border-b border-[var(--border)] pb-2">
                    <Heart className="w-4 h-4 text-pink-500" />
                    <h3 className="text-xs font-mono uppercase tracking-widest text-[var(--ink)] font-bold">
                      {language === 'ru' ? 'Отзывы учеников' : 'Student Reviews'}
                    </h3>
                  </div>
                  <div className="space-y-4">
                    {enriched.reviews.map((rev, idx) => (
                      <div 
                        key={idx} 
                        className="p-4 border border-[var(--border)]/70 bg-black/5 dark:bg-white/5 space-y-2.5"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2.5">
                            <img
                              src={rev.avatar}
                              referrerPolicy="no-referrer"
                              alt={rev.name}
                              className="w-7 h-7 object-cover grayscale border border-[var(--border)]"
                            />
                            <div>
                              <p className="text-xs font-bold text-[var(--ink)]">
                                {rev.name}
                              </p>
                              <p className="text-[9px] font-mono text-[var(--ink-dim)]">
                                {rev.date}
                              </p>
                            </div>
                          </div>
                          
                          {/* Rating */}
                          <div className="flex gap-0.5">
                            {[...Array(rev.rating)].map((_, i) => (
                              <Star key={i} className="w-3 h-3 fill-amber-500 text-transparent" />
                            ))}
                          </div>
                        </div>
                        <p className="text-xs text-[var(--ink-dim)] italic leading-relaxed font-sans font-light">
                          "{rev.comment}"
                        </p>
                      </div>
                    ))}
                  </div>
                </section>

                {/* 8. FAQ */}
                <section className="space-y-4">
                  <div className="flex items-center gap-2 border-b border-[var(--border)] pb-2">
                    <HelpCircle className="w-4 h-4 text-teal-500" />
                    <h3 className="text-xs font-mono uppercase tracking-widest text-[var(--ink)] font-bold">
                      FAQ
                    </h3>
                  </div>
                  <div className="space-y-2 font-sans">
                    {enriched.faq.map((item, idx) => {
                      const isExpanded = expandedFaq === idx;
                      return (
                        <div 
                          key={idx} 
                          className="border border-[var(--border)]/80 bg-black/5 dark:bg-white/5 overflow-hidden transition-colors"
                        >
                          <button
                            onClick={() => setExpandedFaq(isExpanded ? null : idx)}
                            className="w-full px-4 py-3.5 text-left flex items-center justify-between gap-4 font-bold text-xs text-[var(--ink)] transition-colors hover:bg-black/10 dark:hover:bg-white/10 cursor-pointer"
                          >
                            <span>{item.q}</span>
                            <ChevronDown 
                              className={`w-4 h-4 text-[var(--ink-dim)] transition-transform duration-300 shrink-0 ${
                                isExpanded ? 'rotate-180' : ''
                              }`} 
                            />
                          </button>
                          
                          <AnimatePresence initial={false}>
                            {isExpanded && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.25, ease: 'easeInOut' }}
                              >
                                <div className="px-4 pb-4 pt-1 text-xs text-[var(--ink-dim)] leading-relaxed border-t border-[var(--border)]/30 font-light">
                                  {item.a}
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      );
                    })}
                  </div>
                </section>

              </div>

              {/* Right Column (Sticky Reservation/Pricing Card) */}
              <div className="relative">
                <div className="lg:sticky lg:top-8 border border-[var(--border)] bg-black/5 dark:bg-black/40 p-6 space-y-6">
                  
                  {/* Title & Level description */}
                  <div>
                    <span className="text-[9px] font-mono uppercase text-sky-500 tracking-widest font-bold">
                      {language === 'ru' ? 'БЛИЖАЙШИЙ НАБОР' : 'ACTIVE ENROLLMENT'}
                    </span>
                    <h3 className="text-lg font-serif font-light text-[var(--ink)] leading-snug mt-1">
                      {course.title}
                    </h3>
                  </div>

                  {/* 9. Ближайшие даты (Upcoming Dates Panel) */}
                  <div className="border border-[var(--border)]/60 bg-[var(--bg)] p-4 space-y-3">
                    <div className="flex items-start gap-2.5">
                      <Calendar className="w-4 h-4 text-sky-500 shrink-0 mt-0.5" />
                      <div>
                        <span className="text-[9px] font-mono uppercase text-[var(--ink-dim)] block leading-none mb-1">
                          {language === 'en' ? 'Dates' : 'Даты проведения'}
                        </span>
                        <span className="text-xs text-[var(--ink)] font-bold font-mono">
                          {datePart}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-start gap-2.5 border-t border-[var(--border)]/30 pt-3">
                      <Clock className="w-4 h-4 text-sky-500 shrink-0 mt-0.5" />
                      <div>
                        <span className="text-[9px] font-mono uppercase text-[var(--ink-dim)] block leading-none mb-1">
                          {language === 'en' ? 'Schedule' : 'Время занятий'}
                        </span>
                        <span className="text-xs text-[var(--ink)] font-bold font-mono">
                          {timePart}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Available Seats Progress Ratio */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-[9px] font-mono uppercase">
                      <span className="text-[var(--ink-dim)]">
                        {language === 'en' ? 'Group Space' : 'Места в группе'}
                      </span>
                      <span className={`font-bold ${course.availableSeats === 0 ? 'text-rose-500' : course.availableSeats <= 3 ? 'text-amber-500' : 'text-emerald-500'}`}>
                        {course.availableSeats === 0 ? (
                          language === 'en' ? 'SOLD OUT' : 'МЕСТ НЕТ'
                        ) : (
                          language === 'en' 
                            ? `${course.availableSeats} / ${course.totalSeats} LEFT` 
                            : `${course.availableSeats} из ${course.totalSeats} СВОБОДНО`
                        )}
                      </span>
                    </div>

                    <div className="w-full h-1.5 bg-black/10 dark:bg-white/5 border border-[var(--border)] overflow-hidden">
                      <div
                        className={`h-full transition-all duration-500 ${
                          course.availableSeats === 0 
                            ? 'bg-rose-500' 
                            : course.availableSeats <= 3 
                            ? 'bg-amber-500' 
                            : 'bg-emerald-500'
                        }`}
                        style={{ width: `${Math.max(0, Math.min(100, seatsPercentage))}%` }}
                      />
                    </div>
                  </div>

                  {/* Detailed Price */}
                  <div className="border-t border-b border-[var(--border)]/50 py-4 flex items-baseline justify-between">
                    <div>
                      <span className="text-[9px] font-mono uppercase text-[var(--ink-dim)] block">
                        {language === 'en' ? 'Total Tuition' : 'Стоимость за курс'}
                      </span>
                      <span className="text-[9px] text-[var(--ink-dim)] italic font-light">
                        {language === 'en' ? 'All days included' : 'Все дни включены'}
                      </span>
                    </div>
                    <span className="text-3xl font-serif text-[var(--ink)] font-light">
                      ${course.price}
                    </span>
                  </div>

                  {/* 10. Записаться (Enrollment Primary CTA Action) */}
                  <div className="space-y-3">
                    <button
                      onClick={() => {
                        onEnroll(course.id);
                        onClose();
                      }}
                      disabled={(course.availableSeats === 0 && !isEnrolled) || userProfile?.isClientActive === false}
                      className={`w-full py-3.5 border font-mono text-[10px] uppercase tracking-widest transition rounded-none font-bold ${
                        isEnrolled
                          ? 'bg-black/5 dark:bg-black/60 border-[var(--border)]/60 text-[var(--ink-dim)] cursor-default'
                          : userProfile?.isClientActive === false
                          ? 'border-rose-900/40 text-rose-500 cursor-not-allowed bg-rose-950/10'
                          : course.availableSeats === 0
                          ? 'border-[var(--border)] text-[var(--ink-dim)] cursor-not-allowed bg-black/5'
                          : 'border-[var(--ink)] bg-[var(--ink)] text-[var(--bg)] hover:bg-transparent hover:text-[var(--ink)] cursor-pointer shadow-md'
                      }`}
                    >
                      {isEnrolled ? (
                        <span className="flex items-center justify-center gap-1.5 normal-case font-sans text-xs">
                          <span className="text-emerald-500 font-bold text-sm">✔</span>{' '}
                          {language === 'en' ? 'Enrolled' : 'Вы записаны'}
                        </span>
                      ) : userProfile?.isClientActive === false ? (
                        language === 'en' ? 'Access Suspended' : 'Доступ приостановлен'
                      ) : course.availableSeats === 0 ? (
                        language === 'en' ? 'Sold Out' : 'Мест нет'
                      ) : (
                        language === 'en' ? 'Confirm Booking' : 'Подтвердить запись'
                      )}
                    </button>

                    <div className="flex items-center justify-center gap-2 text-[9px] text-[var(--ink-dim)] font-mono uppercase">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                      <span>{language === 'en' ? 'Free cancelation' : 'Свободная отмена за 48ч'}</span>
                    </div>
                  </div>

                </div>
              </div>

            </div>
          </div>

        </motion.div>
      </div>
    </AnimatePresence>
  );
};
