export interface CourseProgramStep {
  day: string;
  title: string;
  desc: string;
}

export interface CourseReview {
  name: string;
  rating: number;
  date: string;
  avatar: string;
  comment: string;
}

export interface CourseFaqItem {
  q: string;
  a: string;
}

export interface CourseEnrichedData {
  photos: string[];
  videoUrl: string;
  benefits: string[];
  program: CourseProgramStep[];
  reviews: CourseReview[];
  faq: CourseFaqItem[];
}

export const getCourseEnrichedData = (
  courseId: string,
  level: string,
  title: string,
  language: string
): CourseEnrichedData => {
  const isSnowboard =
    title.toLowerCase().includes('snowboard') ||
    title.toLowerCase().includes('сноуборд') ||
    title.toLowerCase().includes('board') ||
    courseId.toLowerCase().includes('snowboard');

  const photos = isSnowboard
    ? [
        'https://images.unsplash.com/photo-1522056690494-7b83f95415b9?auto=format&fit=crop&q=80&w=600',
        'https://images.unsplash.com/photo-1502126324834-38f8e02d7160?auto=format&fit=crop&q=80&w=600',
        'https://images.unsplash.com/photo-1482862549707-f63cb32c5fd9?auto=format&fit=crop&q=80&w=600',
      ]
    : [
        'https://images.unsplash.com/photo-1551698618-1ffdfe1d9772?auto=format&fit=crop&q=80&w=600',
        'https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?auto=format&fit=crop&q=80&w=600',
        'https://images.unsplash.com/photo-1517153295259-74eb0b416cee?auto=format&fit=crop&q=80&w=600',
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
      'Learn how to use t-bars and chairlifts without stress.',
    ];
    benefitsRu = [
      'Освоите базовые правила безопасности на активных склонах.',
      'Получите полный контроль над скоростью благодаря уверенным поворотам.',
      'Научитесь пользоваться бугельными и кресельными подъемниками без стресса.',
    ];
  } else if (level === 'intermediate') {
    benefitsEn = [
      'Understand body positioning and dynamic weight distribution.',
      'Perform high-speed carving turns with clean edge transitions.',
      'Handle icy patches and moderate steeeps with solid control.',
    ];
    benefitsRu = [
      'Поймете правильное положение тела и динамическое распределение веса.',
      'Освоите карвинговые повороты на скорости с чистым ведением дуги.',
      'Сможете уверенно проходить обледенелые участки и склоны средней крутизны.',
    ];
  } else if (level === 'advanced') {
    benefitsEn = [
      'Tackle advanced mogul fields and steep off-piste terrain.',
      'Learn basic freestyle movements, small jumps, and box slides.',
      'Optimize edge grip for high-velocity racing and sharp slalom.',
    ];
    benefitsRu = [
      'Научитесь проходить бугры (могул) и крутые неподготовленные склоны.',
      'Освоите базовые элементы фристайла, небольшие прыжки и скольжение по боксам.',
      'Оптимизируете сцепление кантов для скоростных спусков и слалома.',
    ];
  } else {
    benefitsEn = [
      'Conquer deep powder fields and technical backcountry couloirs.',
      'Master safety protocols, avalanche awareness, and terrain assessment.',
      'Perfect your signature style for high-altitude competitive speeds.',
    ];
    benefitsRu = [
      'Покорите глубокий пухляк и техничные кулуары в бэккантри.',
      'Освоите протоколы лавинной безопасности и чтение сложного рельефа.',
      'Отточите фирменный стиль для спусков на предельных скоростях.',
    ];
  }

  let programEn: CourseProgramStep[] = [
    {
      day: 'Day 1',
      title: 'Stance & Balance Foundation',
      desc: 'Equipment inspection, basic mechanics of edge engagement, and body alignment adjustments.',
    },
    {
      day: 'Day 2',
      title: 'Controlled Rotation Progression',
      desc: 'Initiating fluent turns, active compression/decompression, and speed control techniques.',
    },
    {
      day: 'Day 3',
      title: 'Dynamic Alpine Integration',
      desc: 'Applying techniques on steeper slopes, individualized video feedback, and style optimization.',
    },
  ];
  let programRu: CourseProgramStep[] = [
    {
      day: 'День 1',
      title: 'Основа стойки и баланса',
      desc: 'Проверка снаряжения, базовая механика работы кантов и точная настройка положения тела.',
    },
    {
      day: 'День 2',
      title: 'Прогрессия контролируемого поворота',
      desc: 'Инициирование плавных дуг, активная работа ног (разгрузка-закантовка) и контроль скорости.',
    },
    {
      day: 'День 3',
      title: 'Динамическая интеграция на склоне',
      desc: 'Применение техники на крутых участках, индивидуальный видеоанализ вашей техники и шлифовка стиля.',
    },
  ];

  if (level === 'expert' || level === 'advanced') {
    programEn = [
      {
        day: 'Day 1',
        title: 'Tactical Terrain Assessment',
        desc: 'Advanced biomechanics, reading off-piste snow structure, and dynamic edge loading.',
      },
      {
        day: 'Day 2',
        title: 'Off-Piste & Steep Technical Maneuvers',
        desc: 'Mogul absorption, carving under extreme G-force, and drop-in tactics.',
      },
      {
        day: 'Day 3',
        title: 'Backcountry Expedition & Style Polish',
        desc: 'Finding natural features, freestyle jump integration, and full video analysis of speed runs.',
      },
    ];
    programRu = [
      {
        day: 'День 1',
        title: 'Тактический анализ рельефа',
        desc: 'Продвинутая биомеханика, чтение структуры снега вне трасс и динамическая закантовка.',
      },
      {
        day: 'День 2',
        title: 'Внетрассовые и крутые технические маневры',
        desc: 'Амортизация бугров, карвинг в условиях сильных перегрузок и техника входов в кулуары.',
      },
      {
        day: 'День 3',
        title: 'Бэккантри-экспедиция и шлифовка стиля',
        desc: 'Поиск естественного рельефа, интеграция прыжков с надувов и детальный разбор заездов на видео.',
      },
    ];
  }

  const reviewsEn: CourseReview[] = [
    {
      name: 'Alex Thompson',
      rating: 5,
      date: 'Feb 15, 2026',
      avatar:
        'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&q=80&w=150',
      comment:
        'Absolutely transformed my confidence on steep slopes. The level of detail from instructors is amazing.',
    },
    {
      name: 'Emma Watson',
      rating: 5,
      date: 'Jan 10, 2026',
      avatar:
        'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&q=80&w=150',
      comment: 'Incredibly well structured. Worth every penny. Felt very safe yet challenged!',
    },
  ];
  const reviewsRu: CourseReview[] = [
    {
      name: 'Алексей Томпсон',
      rating: 5,
      date: '15 Фев 2026',
      avatar:
        'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&q=80&w=150',
      comment:
        'Абсолютно изменило мою уверенность на крутых склонах. Уровень детализации от инструкторов поражает.',
    },
    {
      name: 'Эмма Ватсон',
      rating: 5,
      date: '10 Янв 2026',
      avatar:
        'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&q=80&w=150',
      comment:
        'Невероятно хорошо спланировано. Стоит каждой копейки. Чувствовала себя в безопасности, но при этом был классный вызов!',
    },
  ];

  const faqEn: CourseFaqItem[] = [
    {
      q: 'Is professional gear rental included in the price?',
      a: 'Rental equipment is not included in the course fee. However, our students get a 15% discount at the resort rental shop. We recommend arriving 45 minutes early if you need rental gear.',
    },
    {
      q: 'What happens in case of extreme weather or lift closure?',
      a: 'If resort lifts are completely closed due to weather conditions, we will reschedule the sessions or offer a full refund for the affected days.',
    },
    {
      q: 'Can I cancel or change dates?',
      a: 'Yes, you can cancel or reschedule free of charge up to 48 hours before the course starts. Within 48 hours, a 50% cancellation fee applies.',
    },
  ];
  const faqRu: CourseFaqItem[] = [
    {
      q: 'Входит ли аренда профессионального снаряжения в стоимость?',
      a: 'Аренда снаряжения не входит в стоимость курса. Однако наши ученики получают скидку 15% в партнерском прокате курорта. Мы рекомендуем приезжать за 45 минут до начала, если вам нужен прокат.',
    },
    {
      q: 'Что происходит в случае экстремальной погоды или закрытия подъемников?',
      a: 'Если подъемники курорта полностью закрыты из-за погодных условий, мы перенесем занятие на другое время или вернем полную стоимость за отмененные дни.',
    },
    {
      q: 'Могу ли я отменить бронирование или изменить даты?',
      a: 'Да, вы можете бесплатно отменить или изменить даты курса за 48 часов до его начала. При отмене менее чем за 48 часов удерживается сбор в размере 50%.',
    },
  ];

  return {
    photos,
    videoUrl,
    benefits: language === 'ru' ? benefitsRu : benefitsEn,
    program: language === 'ru' ? programRu : programEn,
    reviews: language === 'ru' ? reviewsRu : reviewsEn,
    faq: language === 'ru' ? faqRu : faqEn,
  };
};
