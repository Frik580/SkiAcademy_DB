import { Instructor, Course } from '../../types';
import { translations, type Language, type TranslationKey } from './translations';
import { parseCourseDates, formatCourseDates } from './courseDates';

export function translateInstructorName(name: string, language: Language): string {
  const namesMap: Record<string, { en: string; ru: string }> = {
    'Dimitri Romanov': { en: 'Dimitri Romanov', ru: 'Дмитрий Романов' },
    'Дмитрий Романов': { en: 'Dimitri Romanov', ru: 'Дмитрий Романов' },
    'Sophia Laurent': { en: 'Sophia Laurent', ru: 'София Лоран' },
    'София Лоран': { en: 'Sophia Laurent', ru: 'София Лоран' },
    'Marcus Kael': { en: 'Marcus Kael', ru: 'Маркус Каэль' },
    'Маркус Каэль': { en: 'Marcus Kael', ru: 'Маркус Каэль' },
    'Elena Rostova': { en: 'Elena Rostova', ru: 'Елена Ростова' },
    'Елена Ростова': { en: 'Elena Rostova', ru: 'Елена Ростова' },
    'Arsenii Gerasimchuk': { en: 'Arsenii Gerasimchuk', ru: 'Арсений Герасимчук' },
    'Арсений Герасимчук': { en: 'Arsenii Gerasimchuk', ru: 'Арсений Герасимчук' },
  };

  const match = namesMap[name] || namesMap[name.trim()];
  if (match) {
    return match[language];
  }

  // Fallback fuzzy matching
  const lower = name.toLowerCase();
  if (lower.includes('arsenii') || lower.includes('арсений')) {
    return language === 'ru' ? 'Арсений Герасимчук' : 'Arsenii Gerasimchuk';
  } else if (lower.includes('dimitri') || lower.includes('дмитрий')) {
    return language === 'ru' ? 'Дмитрий Романов' : 'Dimitri Romanov';
  } else if (lower.includes('sophia') || lower.includes('софия')) {
    return language === 'ru' ? 'София Лоран' : 'Sophia Laurent';
  } else if (lower.includes('marcus') || lower.includes('маркус')) {
    return language === 'ru' ? 'Маркус Каэль' : 'Marcus Kael';
  } else if (lower.includes('elena') || lower.includes('елена')) {
    return language === 'ru' ? 'Елена Ростова' : 'Elena Rostova';
  }

  return name;
}

export function translateInstructor(ins: Instructor, language: Language): Instructor {
  const biosMap: Record<string, { en: string; ru: string }> = {
    'Certified alpine ski coach with over 10 years of experience in the Alps. Specializes in advanced carving, speed refinement, and race techniques. Friendly but highly precise in adjusting your stance.':
      {
        en: 'Certified alpine ski coach with over 10 years of experience in the Alps. Specializes in advanced carving, speed refinement, and race techniques. Friendly but highly precise in adjusting your stance.',
        ru: 'Сертифицированный тренер по горным лыжам с более чем 10-летним опытом работы в Альпах. Специализируется на продвинутом карвинге, совершенствовании скорости и гоночной технике. Дружелюбный, но очень точный в настройке вашей стойки.',
      },
    'Сертифицированный тренер по горным лыжам с более чем 10-летним опытом работы в Альпах. Специализируется на продвинутом карвинге, совершенствовании скорости и гоночной технике. Дружелюбный, но очень точный в настройке вашей стойки.':
      {
        en: 'Certified alpine ski coach with over 10 years of experience in the Alps. Specializes in advanced carving, speed refinement, and race techniques. Friendly but highly precise in adjusting your stance.',
        ru: 'Сертифицированный тренер по горным лыжам с более чем 10-летним опытом работы в Альпах. Специализируется на продвинутом карвинге, совершенствовании скорости и гоночной технике. Дружелюбный, но очень точный в настройке вашей стойки.',
      },
    'Former competitive snowboard athlete. Sophia specializes in modern freeriding, snowboard park freestyle, and teaching advanced turns in deep powder. Focused on flow and core stability.':
      {
        en: 'Former competitive snowboard athlete. Sophia specializes in modern freeriding, snowboard park freestyle, and teaching advanced turns in deep powder. Focused on flow and core stability.',
        ru: 'Бывшая профессиональная сноубордистка. София специализируется на современном фрирайде, сноуборд-парк фристайле и обучении продвинутым поворотам в глубоком пухляке. Особое внимание уделяет плавности и балансу.',
      },
    'Бывшая профессиональная сноубордистка. София специализируется на современном фрирайде, сноуборд-парк фристайле и обучении продвинутым поворотам в глубоком пухляке. Особое внимание уделяет плавности и балансу.':
      {
        en: 'Former competitive snowboard athlete. Sophia specializes in modern freeriding, snowboard park freestyle, and teaching advanced turns in deep powder. Focused on flow and core stability.',
        ru: 'Бывшая профессиональная сноубордистка. София специализируется на современном фрирайде, сноуборд-парк фристайле и обучении продвинутым поворотам в глубоком пухляке. Особое внимание уделяет плавности и балансу.',
      },
    'Legendary Austrian resort guide. Marcus has 15+ years of experience training both ski and snowboard students from absolute beginners to professional instructors. Known for his patience and deep snow knowledge.':
      {
        en: 'Legendary Austrian resort guide. Marcus has 15+ years of experience training both ski and snowboard students from absolute beginners to professional instructors. Known for his patience and deep snow knowledge.',
        ru: 'Легендарный австрийский курортный гид. Маркус имеет более 15 лет опыта обучения катанию на лыжах и сноуборде — от абсолютных новичков до профессиональных инструкторов. Известен своим терпением и глубокими знаниями заснеженных трасс.',
      },
    'Легендарный австрийский курортный гид. Маркус имеет более 15 лет опыта обучения катанию на лыжах и сноуборде — от абсолютных новичков до профессиональных инструкторов. Известен своим терпением и глубокими знаниями заснеженных трасс.':
      {
        en: 'Legendary Austrian resort guide. Marcus has 15+ years of experience training both ski and snowboard students from absolute beginners to professional instructors. Known for his patience and deep snow knowledge.',
        ru: 'Легендарный австрийский курортный гид. Маркус имеет более 15 лет опыта обучения катанию на лыжах и сноуборде — от абсолютных новичков до профессиональных инструкторов. Известен своим терпением и глубокими знаниями заснеженных трасс.',
      },
    'Certified ski instructor specializing in children, families, and adult beginner-to-intermediate transformations. Her lessons are highly engaging, focusing on safety, rhythm, and building massive self-confidence.':
      {
        en: 'Certified ski instructor specializing in children, families, and adult beginner-to-intermediate transformations. Her lessons are highly engaging, focusing on safety, rhythm, and building massive self-confidence.',
        ru: 'Сертифицированный инструктор по лыжам, специализирующийся на детях, семьях и подготовке взрослых с нуля до среднего уровня. Ее уроки очень увлекательны, с акцентом на безопасность, ритм и обретение уверенности в себе.',
      },
    'Сертифицированный инструктор по лыжам, специализирующийся на детях, семьях и подготовке взрослых с нуля до среднего уровня. Ее уроки очень увлекательны, с акцентом на безопасность, ритм и обретение уверенности в себе.':
      {
        en: 'Certified ski instructor specializing in children, families, and adult beginner-to-intermediate transformations. Her lessons are highly engaging, focusing on safety, rhythm, and building massive self-confidence.',
        ru: 'Сертифицированный инструктор по лыжам, специализирующийся на детях, семьях и подготовке взрослых с нуля до среднего уровня. Ее уроки очень увлекательны, с акцентом на безопасность, ритм и обретение уверенности в себе.',
      },
    'TOP school instructor': {
      en: 'TOP school instructor',
      ru: 'ТОП инструктор школы',
    },
    'ТОП инструктор школы': {
      en: 'TOP school instructor',
      ru: 'ТОП инструктор школы',
    },
  };

  const name = translateInstructorName(ins.name, language);

  const bioTranslation = biosMap[ins.bio] || biosMap[ins.bio.trim()];
  let bio = ins.bio;
  if (bioTranslation) {
    bio = bioTranslation[language];
  } else {
    // try fuzzy substring match for bio
    const lowerBio = ins.bio.toLowerCase();
    if (lowerBio.includes('top school') || lowerBio.includes('топ инструктор')) {
      bio = language === 'ru' ? 'ТОП инструктор школы' : 'TOP school instructor';
    } else if (lowerBio.includes('alpine ski coach') || lowerBio.includes('горным лыжам')) {
      bio =
        language === 'ru'
          ? 'Сертифицированный тренер по горным лыжам с более чем 10-летним опытом работы в Альпах. Специализируется на продвинутом карвинге, совершенствовании скорости и гоночной технике. Дружелюбный, но очень точный в настройке вашей стойки.'
          : 'Certified alpine ski coach with over 10 years of experience in the Alps. Specializes in advanced carving, speed refinement, and race techniques. Friendly but highly precise in adjusting your stance.';
    } else if (lowerBio.includes('competitive snowboard') || lowerBio.includes('сноубордистка')) {
      bio =
        language === 'ru'
          ? 'Бывшая профессиональная сноубордистка. София специализируется на современном фрирайде, сноуборд-парк фристайле и обучении продвинутым поворотам в глубоком пухляке. Особое внимание уделяет плавности и балансу.'
          : 'Former competitive snowboard athlete. Sophia specializes in modern freeriding, snowboard park freestyle, and teaching advanced turns in deep powder. Focused on flow and core stability.';
    } else if (
      lowerBio.includes('austrian resort guide') ||
      lowerBio.includes('австрийский курортный')
    ) {
      bio =
        language === 'ru'
          ? 'Легендарный австрийский курортный гид. Маркус имеет более 15 лет опыта обучения катанию на лыжах и сноуборде — от абсолютных новичков до профессиональных инструкторов. Известен своим терпением и глубокими знаниями заснеженных трасс.'
          : 'Legendary Austrian resort guide. Marcus has 15+ years of experience training both ski and snowboard students from absolute beginners to professional instructors. Known for his patience and deep snow knowledge.';
    } else if (
      lowerBio.includes('children, families') ||
      lowerBio.includes('инструктор по лыжам, специализирующийся')
    ) {
      bio =
        language === 'ru'
          ? 'Сертифицированный инструктор по лыжам, специализирующийся на детях, семьях и подготовке взрослых с нуля до среднего уровня. Ее уроки очень увлекательны, с акцентом на безопасность, ритм и обретение уверенности в себе.'
          : 'Certified ski instructor specializing in children, families, and adult beginner-to-intermediate transformations. Her lessons are highly engaging, focusing on safety, rhythm, and building massive self-confidence.';
    }
  }

  return {
    ...ins,
    name,
    bio,
  };
}

export function translateCourse(course: Course, language: Language): Course {
  const titlesMap: Record<string, { en: string; ru: string }> = {
    'Carving Mastery Pro': { en: 'Carving Mastery Pro', ru: 'Мастерство Карвинга Pro' },
    'Мастерство Карвинга Pro': { en: 'Carving Mastery Pro', ru: 'Мастерство Карвинга Pro' },
    'Freeride & Powder Foundations': {
      en: 'Freeride & Powder Foundations',
      ru: 'Основы Фрирайда и Катания по Пухляку',
    },
    'Основы Фрирайда и Катания по Пухляку': {
      en: 'Freeride & Powder Foundations',
      ru: 'Основы Фрирайда и Катания по Пухляку',
    },
    'Snowboard Park & Freestyle Basics': {
      en: 'Snowboard Park & Freestyle Basics',
      ru: 'Сноуборд-Парк и Основы Фристайла',
    },
    'Сноуборд-Парк и Основы Фристайла': {
      en: 'Snowboard Park & Freestyle Basics',
      ru: 'Сноуборд-Парк и Основы Фристайла',
    },
    Начинающие: { en: 'Beginners', ru: 'Начинающие' },
    Beginners: { en: 'Beginners', ru: 'Начинающие' },
    'Совершенствование техники катания': {
      en: 'Technique Improvement',
      ru: 'Совершенствование техники катания',
    },
    'Technique Improvement': {
      en: 'Technique Improvement',
      ru: 'Совершенствование техники катания',
    },
  };

  const durationsMap: Record<string, { en: string; ru: string }> = {
    '3 Days (12 Hours)': { en: '3 Days (12 Hours)', ru: '3 дня (12 часов)' },
    '3 дня (12 часов)': { en: '3 Days (12 Hours)', ru: '3 дня (12 часов)' },
    '2 Days (8 Hours)': { en: '2 Days (8 Hours)', ru: '2 дня (8 часов)' },
    '2 дня (8 часов)': { en: '2 Days (8 Hours)', ru: '2 дня (8 часов)' },
    '4 Days (16 Hours)': { en: '4 Days (16 Hours)', ru: '4 дня (16 часов)' },
    '4 дня (16 часов)': { en: '4 Days (16 Hours)', ru: '4 дня (16 часов)' },
    '5 Days (20 Hours)': { en: '5 Days (20 Hours)', ru: '5 дней (20 часов)' },
    '5 дней (20 часов)': { en: '5 Days (20 Hours)', ru: '5 дней (20 часов)' },
    '5 дней (20 ч.)': { en: '5 Days (20 Hours)', ru: '5 дней (20 часов)' },
    '2 Days (14 Hours)': { en: '2 Days (14 Hours)', ru: '2 дня (14 часов)' },
    '2 дня (14 часов)': { en: '2 Days (14 Hours)', ru: '2 дня (14 часов)' },
    '2 дня (14 ч.)': { en: '2 Days (14 Hours)', ru: '2 дня (14 часов)' },
    '4 дня (16 ч.)': { en: '4 Days (16 Hours)', ru: '4 дня (16 часов)' },
  };

  const descriptionsMap: Record<string, { en: string; ru: string }> = {
    'Unlock maximum speed and perfect edge control on high-velocity slopes. Designed for advanced skiers.':
      {
        en: 'Unlock maximum speed and perfect edge control on high-velocity slopes. Designed for advanced skiers.',
        ru: 'Освойте максимальную скорость и идеальный контроль канта на высоких скоростях. Разработано для продвинутых лыжников.',
      },
    'Освойте максимальную скорость и идеальный контроль канта на высоких скоростях. Разработано для продвинутых лыжников.':
      {
        en: 'Unlock maximum speed and perfect edge control on high-velocity slopes. Designed for advanced skiers.',
        ru: 'Освойте максимальную скорость и идеальный контроль канта на высоких скоростях. Разработано для продвинутых лыжников.',
      },
    'Learn to navigate deep powder, select safe mountain lines, and master avalanche safety basics. Ski or Snowboard.':
      {
        en: 'Learn to navigate deep powder, select safe mountain lines, and master avalanche safety basics. Ski or Snowboard.',
        ru: 'Научитесь кататься по глубокому пухляку, выбирать безопасные маршруты и освойте основы лавинной безопасности. Лыжи или сноуборд.',
      },
    'Научитесь кататься по глубокому пухляку, выбирать безопасные маршруты и освойте основы лавинной безопасности. Лыжи или сноуборд.':
      {
        en: 'Learn to navigate deep powder, select safe mountain lines, and master avalanche safety basics. Ski or Snowboard.',
        ru: 'Научитесь кататься по глубокому пухляку, выбирать безопасные маршруты и освойте основы лавинной безопасности. Лыжи или сноуборд.',
      },
    'Master jumps, rails, grabs, and spins in our specialized terrain park under the guidance of former athletes.':
      {
        en: 'Master jumps, rails, grabs, and spins in our specialized terrain park under the guidance of former athletes.',
        ru: 'Освойте прыжки, перила, грэбы и вращения в нашем специализированном сноупарке под руководством бывших профессиональных спортсменов.',
      },
    'Освойте прыжки, перила, грэбы и вращения в нашем специализированном сноупарке под руководством бывших профессиональных спортсменов.':
      {
        en: 'Master jumps, rails, grabs, and spins in our specialized terrain park under the guidance of former athletes.',
        ru: 'Освойте прыжки, перила, грэбы и вращения в нашем специализированном сноупарке под руководством бывших профессиональных спортсменов.',
      },
    'Освойте с нуля уверенное, безопасное и техничное катание. Вы научитесь правильной стойке, балансу, торможению, поворотам и постепенно перейдёте к катанию на параллельных лыжах на более крутых склонах.':
      {
        en: 'Master confident, safe, and technical skiing from scratch. Learn proper stance, balance, braking, turns, and gradually transition to parallel skiing on steeper slopes.',
        ru: 'Освойте с нуля уверенное, безопасное и техничное катание. Вы научитесь правильной стойке, балансу, торможению, поворотам и постепенно перейдёте к катанию на параллельных лыжах на более крутых склонах.',
      },
    'Освоите с нуля уверенное, безопасное и техничное катание. Вы научитесь правильной стойке, балансу, торможению, поворотам и постепенно перейдёте к катанию на параллельных лыжах на более крутых склонах.':
      {
        en: 'Master confident, safe, and technical skiing from scratch. Learn proper stance, balance, braking, turns, and gradually transition to parallel skiing on steeper slopes.',
        ru: 'Освойте с нуля уверенное, безопасное и техничное катание. Вы научитесь правильной стойке, балансу, торможению, поворотам и постепенно перейдёте к катанию на параллельных лыжах на более крутых склонах.',
      },
    'Master confident, safe, and technical skiing from scratch. Learn proper stance, balance, braking, turns, and gradually transition to parallel skiing on steeper slopes.':
      {
        en: 'Master confident, safe, and technical skiing from scratch. Learn proper stance, balance, braking, turns, and gradually transition to parallel skiing on steeper slopes.',
        ru: 'Освойте с нуля уверенное, безопасное и техничное катание. Вы научитесь правильной стойке, балансу, торможению, поворотам и постепенно перейдёте к катанию на параллельных лыжах на более крутых склонах.',
      },
    'Курс поможет уверенным лыжникам сделать катание более техничным, стабильным и эффективным. Вы освоите современные техники карвинга, улучшите контроль лыж, баланс, работу стоп и уверенность на склонах любой сложности.':
      {
        en: 'This course will help confident skiers make their skiing more technical, stable, and efficient. Master modern carving techniques, improve ski control, balance, footwork, and confidence on any slope.',
        ru: 'Курс поможет уверенным лыжникам сделать катание более техничным, стабильным и эффективным. Вы освоите современные техники карвинга, улучшите контроль лыж, баланс, работу стоп и уверенность на склонах любой сложности.',
      },
    'This course will help confident skiers make their skiing more technical, stable, and efficient. Master modern carving techniques, improve ski control, balance, footwork, and confidence on any slope.':
      {
        en: 'This course will help confident skiers make their skiing more technical, stable, and efficient. Master modern carving techniques, improve ski control, balance, footwork, and confidence on any slope.',
        ru: 'Курс поможет уверенным лыжникам сделать катание более техничным, стабильным и эффективным. Вы освоите современные техники карвинга, улучшите контроль лыж, баланс, работу стоп и уверенность на склонах любой сложности.',
      },
  };

  const datesMap: Record<string, { en: string; ru: string }> = {
    'July 15 - July 17, 2026': { en: 'July 15 - July 17, 2026', ru: '15 июля - 17 июля 2026' },
    '15 июля - 17 июля 2026': { en: 'July 15 - July 17, 2026', ru: '15 июля - 17 июля 2026' },
    'July 20 - July 21, 2026': { en: 'July 20 - July 21, 2026', ru: '20 июля - 21 июля 2026' },
    '20 июля - 21 июля 2026': { en: 'July 20 - July 21, 2026', ru: '20 июля - 21 июля 2026' },
    'July 24 - July 27, 2026': { en: 'July 24 - July 27, 2026', ru: '24 июля - 27 июля 2026' },
    '24 июля - 27 июля 2026': { en: 'July 24 - July 27, 2026', ru: '24 июля - 27 июля 2026' },
    '1 - 5 Декабря 2026, 09:00 - 13:00': {
      en: 'December 1 - 5, 2026, 09:00 - 13:00',
      ru: '1 - 5 Декабря 2026, 09:00 - 13:00',
    },
    'December 1 - 5, 2026, 09:00 - 13:00': {
      en: 'December 1 - 5, 2026, 09:00 - 13:00',
      ru: '1 - 5 Декабря 2026, 09:00 - 13:00',
    },
    '1 - 5 Декабря 2026': { en: 'December 1 - 5, 2026', ru: '1 - 5 Декабря 2026' },
    'December 1 - 5, 2026': { en: 'December 1 - 5, 2026', ru: '1 - 5 Декабря 2026' },
    '23 - 27 Декабря 2026, 09:00 - 13:00': {
      en: 'December 23 - 27, 2026, 09:00 - 13:00',
      ru: '23 - 27 Декабря 2026, 09:00 - 13:00',
    },
    'December 23 - 27, 2026, 09:00 - 13:00': {
      en: 'December 23 - 27, 2026, 09:00 - 13:00',
      ru: '23 - 27 Декабря 2026, 09:00 - 13:00',
    },
    '23 - 27 Декабря 2026': { en: 'December 23 - 27, 2026', ru: '23 - 27 Декабря 2026' },
    'December 23 - 27, 2026': { en: 'December 23 - 27, 2026', ru: '23 - 27 Декабря 2026' },
    '19 - 20 Июля 2026, 09:00 - 16:00': {
      en: 'July 19 - 20, 2026, 09:00 - 16:00',
      ru: '19 - 20 Июля 2026, 09:00 - 16:00',
    },
    'July 19 - 20, 2026, 09:00 - 16:00': {
      en: 'July 19 - 20, 2026, 09:00 - 16:00',
      ru: '19 - 20 Июля 2026, 09:00 - 16:00',
    },
    '20 - 23 Июля 2026, 09:00 - 13:00': {
      en: 'July 20 - 23, 2026, 09:00 - 13:00',
      ru: '20 - 23 Июля 2026, 09:00 - 13:00',
    },
    'July 20 - 23, 2026, 09:00 - 13:00': {
      en: 'July 20 - 23, 2026, 09:00 - 13:00',
      ru: '20 - 23 Июля 2026, 09:00 - 13:00',
    },
    '3 - 7 Августа 2026, 09:00 - 13:00': {
      en: 'August 3 - 7, 2026, 09:00 - 13:00',
      ru: '3 - 7 Августа 2026, 09:00 - 13:00',
    },
    'August 3 - 7, 2026, 09:00 - 13:00': {
      en: 'August 3 - 7, 2026, 09:00 - 13:00',
      ru: '3 - 7 Августа 2026, 09:00 - 13:00',
    },
  };

  let title = course.title;
  let duration = course.duration;
  let description = course.description;
  let dates = course.dates;

  const tMap = titlesMap[course.title] || titlesMap[course.title.trim()];
  if (tMap) {
    title = tMap[language];
  } else {
    const lowerTitle = course.title.toLowerCase();
    if (lowerTitle.includes('carving') || lowerTitle.includes('карвинг')) {
      title = language === 'ru' ? 'Мастерство Карвинга Pro' : 'Carving Mastery Pro';
    } else if (lowerTitle.includes('freeride') || lowerTitle.includes('фрирайд')) {
      title =
        language === 'ru'
          ? 'Основы Фрирайда и Катания по Пухляку'
          : 'Freeride & Powder Foundations';
    } else if (lowerTitle.includes('park') || lowerTitle.includes('сноуборд-парк')) {
      title =
        language === 'ru'
          ? 'Сноуборд-Парк и Основы Фристайла'
          : 'Snowboard Park & Freestyle Basics';
    } else if (lowerTitle.includes('начинающие') || lowerTitle.includes('beginners')) {
      title = language === 'ru' ? 'Начинающие' : 'Beginners';
    } else if (
      lowerTitle.includes('техники катания') ||
      lowerTitle.includes('technique improvement')
    ) {
      title = language === 'ru' ? 'Совершенствование техники катания' : 'Technique Improvement';
    }
  }

  const durMap = durationsMap[course.duration] || durationsMap[course.duration.trim()];
  if (durMap) duration = durMap[language];

  const descMap = descriptionsMap[course.description] || descriptionsMap[course.description.trim()];
  if (descMap) {
    description = descMap[language];
  } else {
    const lowerDesc = course.description.toLowerCase();
    if (
      lowerDesc.includes('освойте с нуля') ||
      lowerDesc.includes('освоите с нуля') ||
      lowerDesc.includes('confident, safe, and technical skiing from scratch')
    ) {
      description =
        language === 'ru'
          ? 'Освойте с нуля уверенное, безопасное и техничное катание. Вы научитесь правильной стойке, балансу, торможению, поворотам и постепенно перейдёте к катанию на параллельных лыжах на более крутых склонах.'
          : 'Master confident, safe, and technical skiing from scratch. Learn proper stance, balance, braking, turns, and gradually transition to parallel skiing on steeper slopes.';
    } else if (
      lowerDesc.includes('курс поможет уверенным') ||
      lowerDesc.includes('this course will help confident')
    ) {
      description =
        language === 'ru'
          ? 'Курс поможет уверенным лыжникам сделать катание более техничным, стабильным и эффективным. Вы освоите современные техники карвинга, улучшите контроль лыж, баланс, работу стоп и уверенность на склонах любой сложности.'
          : 'This course will help confident skiers make their skiing more technical, stable, and efficient. Master modern carving techniques, improve ski control, balance, footwork, and confidence on any slope.';
    } else if (
      lowerDesc.includes('unlock maximum speed') ||
      lowerDesc.includes('освойте максимальную скорость')
    ) {
      description =
        language === 'ru'
          ? 'Освойте максимальную скорость и идеальный контроль канта на высоких скоростях. Разработано для продвинутых лыжников.'
          : 'Unlock maximum speed and perfect edge control on high-velocity slopes. Designed for advanced skiers.';
    } else if (
      lowerDesc.includes('learn to navigate deep') ||
      lowerDesc.includes('научитесь кататься по глубокому')
    ) {
      description =
        language === 'ru'
          ? 'Научитесь кататься по глубокому пухляку, выбирать безопасные маршруты и освойте основы лавинной безопасности. Лыжи или сноуборд.'
          : 'Learn to navigate deep powder, select safe mountain lines, and master avalanche safety basics. Ski or Snowboard.';
    } else if (
      lowerDesc.includes('master jumps, rails') ||
      lowerDesc.includes('освойте прыжки, перила')
    ) {
      description =
        language === 'ru'
          ? 'Освойте прыжки, перила, грэбы и вращения в нашем специализированном сноупарке под руководством бывших профессиональных спортсменов.'
          : 'Master jumps, rails, grabs, and spins in our specialized terrain park under the guidance of former athletes.';
    }
  }

  const dMap = datesMap[course.dates] || datesMap[course.dates.trim()];
  if (dMap) {
    dates = dMap[language];
  } else if (course.dates) {
    const parsed = parseCourseDates(course.dates);
    dates = formatCourseDates(parsed.start, parsed.end, parsed.startTime, parsed.endTime, language);
  }

  if (language === 'ru') {
    const matchesEn = duration.match(/^(\d+)\s*Days?\s*\((\d+)\s*Hours?\)$/i);
    if (matchesEn) {
      const daysNum = Number(matchesEn[1]);
      const hoursNum = Number(matchesEn[2]);

      let dayWord = 'дней';
      if (daysNum % 10 === 1 && daysNum % 100 !== 11) {
        dayWord = 'день';
      } else if (
        daysNum % 10 >= 2 &&
        daysNum % 10 <= 4 &&
        (daysNum % 100 < 10 || daysNum % 100 >= 20)
      ) {
        dayWord = 'дня';
      }

      let hourWord = 'часов';
      if (hoursNum % 10 === 1 && hoursNum % 100 !== 11) {
        hourWord = 'час';
      } else if (
        hoursNum % 10 >= 2 &&
        hoursNum % 10 <= 4 &&
        (hoursNum % 100 < 10 || hoursNum % 100 >= 20)
      ) {
        hourWord = 'часа';
      }

      duration = `${daysNum} ${dayWord} (${hoursNum} ${hourWord})`;
    }
  } else {
    const matchesRu = duration.match(
      /^(\d+)\s*(день|дня|дней)\s*\((\d+)\s*(час|часа|часов|ч\.?)\)$/i
    );
    if (matchesRu) {
      const daysNum = matchesRu[1];
      const hoursNum = matchesRu[3];
      duration = `${daysNum} Day${Number(daysNum) > 1 ? 's' : ''} (${hoursNum} Hour${Number(hoursNum) > 1 ? 's' : ''})`;
    }
  }

  const shortDescription =
    language === 'ru'
      ? course.shortDescriptionRu || course.shortDescription
      : course.shortDescription || course.shortDescriptionRu;

  const detailedDescription =
    language === 'ru'
      ? course.detailedDescriptionRu || course.detailedDescription
      : course.detailedDescription || course.detailedDescriptionRu;

  const badge = language === 'ru' ? course.badgeRu || course.badge : course.badge || course.badgeRu;

  const levelLabelKeys: Partial<Record<NonNullable<Course['level']>, TranslationKey>> = {
    beginner: 'courseLevelBeginner',
    intermediate: 'courseLevelIntermediate',
    advanced: 'courseLevelAdvanced',
    expert: 'courseLevelExpert',
  };
  const levelLabel =
    course.level && levelLabelKeys[course.level]
      ? translations[language][levelLabelKeys[course.level]!]
      : '';

  return {
    ...course,
    title,
    duration,
    description,
    dates,
    shortDescription,
    detailedDescription,
    badge,
    levelLabel,
  };
}
