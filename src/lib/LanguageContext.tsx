import React, { createContext, useContext, useState } from 'react';
import { Instructor, Course } from '../types';

export type Language = 'en' | 'ru';

export function parseCourseDates(datesStr: string) {
  const today = new Date();
  let start = new Date(today);
  let end = new Date(today);
  let startTime = "09:00";
  let endTime = "13:00";

  if (!datesStr) {
    return { start, end, startTime, endTime };
  }

  try {
    // Check if there is a time in the string, e.g., "09:00 - 13:00" or similar
    const timeMatch = datesStr.match(/(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})/);
    if (timeMatch) {
      startTime = timeMatch[1];
      endTime = timeMatch[2];
    }

    // Remove any time part to parse the dates
    let cleanDatesStr = datesStr.replace(/,?\s*\d{2}:\d{2}\s*-\s*\d{2}:\d{2}/, '').trim();

    // Convert Russian months to English first so JS Date constructor can parse it
    const ruMonthMap: { [key: string]: string } = {
      'января': 'January', 'февраля': 'February', 'марта': 'March', 'апреля': 'April',
      'мая': 'May', 'июня': 'June', 'июля': 'July', 'августа': 'August',
      'сентября': 'September', 'октября': 'October', 'ноября': 'November', 'декабря': 'December',
      'январь': 'January', 'февраль': 'February', 'март': 'March', 'апрель': 'April',
      'май': 'May', 'июнь': 'June', 'июль': 'July', 'август': 'August',
      'сентябрь': 'September', 'октябрь': 'October', 'ноябрь': 'November', 'декабрь': 'December'
    };

    Object.keys(ruMonthMap).forEach(ruMonth => {
      const regex = new RegExp(ruMonth, 'gi');
      cleanDatesStr = cleanDatesStr.replace(regex, ruMonthMap[ruMonth]);
    });

    // Split by "-" or "to"
    const parts = cleanDatesStr.split(/[-–]|to/);
    if (parts.length === 1) {
      const parsedDate = new Date(parts[0].trim());
      if (!isNaN(parsedDate.getTime())) {
        start = parsedDate;
        end = parsedDate;
      }
    } else if (parts.length === 2) {
      let startPart = parts[0].trim();
      let endPart = parts[1].trim();

      // Copy month from endPart if startPart does not contain any English alphabetical characters
      const hasMonth = /[a-zA-Z]/.test(startPart);
      if (!hasMonth) {
        const monthMatch = endPart.match(/([a-zA-Z]+)/);
        if (monthMatch) {
          startPart = `${monthMatch[1]} ${startPart}`;
        }
      }

      // Copy year from endPart if endPart contains a 4-digit number and startPart does not
      const yearMatch = endPart.match(/(\d{4})/);
      if (yearMatch && !startPart.includes(yearMatch[1])) {
        startPart = `${startPart}, ${yearMatch[1]}`;
      }

      const parsedStart = new Date(startPart);
      const parsedEnd = new Date(endPart);

      if (!isNaN(parsedStart.getTime())) start = parsedStart;
      if (!isNaN(parsedEnd.getTime())) end = parsedEnd;
    }
  } catch (e) {
    console.warn("Failed to parse course dates:", e);
  }

  return { start, end, startTime, endTime };
}

export function parseDurationHours(durationStr: string, fallback: number = 1): number {
  if (!durationStr) return fallback;
  // Match specifically hours inside parentheses or before hour keywords
  const hoursMatch = durationStr.match(/\((\d+)\s*(?:Hours?|часов|часа|час|ч|hours?|hrs?)\)/i) || 
                     durationStr.match(/(\d+)\s*(?:Hours?|часов|часа|час|ч|hours?|hrs?)/i);
  if (hoursMatch) {
    return Number(hoursMatch[1]);
  }
  // Fallback to checking all numbers in the string
  const numbers = durationStr.match(/\d+/g);
  if (numbers && numbers.length > 0) {
    // If we have "X Days (Y Hours)", the second number is hours
    return Number(numbers.length > 1 ? numbers[1] : numbers[0]);
  }
  return fallback;
}

export function formatCourseDates(start: Date, end: Date, startTime: string, endTime: string, lang: 'en' | 'ru') {
  const monthsEn = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const monthsRu = ['Января', 'Февраля', 'Марта', 'Апреля', 'Мая', 'Июня', 'Июля', 'Августа', 'Сентября', 'Октября', 'Ноября', 'Декабря'];
  
  const startDay = start.getDate();
  const startMonth = start.getMonth();
  const startYear = start.getFullYear();
  
  const endDay = end.getDate();
  const endMonth = end.getMonth();
  const endYear = end.getFullYear();
  
  let formattedDates = "";
  
  if (start.toDateString() === end.toDateString()) {
    if (lang === 'en') {
      formattedDates = `${monthsEn[startMonth]} ${startDay}, ${startYear}`;
    } else {
      formattedDates = `${startDay} ${monthsRu[startMonth]} ${startYear}`;
    }
  } else if (startMonth === endMonth && startYear === endYear) {
    if (lang === 'en') {
      formattedDates = `${monthsEn[startMonth]} ${startDay} - ${endDay}, ${startYear}`;
    } else {
      formattedDates = `${startDay} - ${endDay} ${monthsRu[startMonth]} ${startYear}`;
    }
  } else if (startYear === endYear) {
    if (lang === 'en') {
      formattedDates = `${monthsEn[startMonth]} ${startDay} - ${monthsEn[endMonth]} ${endDay}, ${startYear}`;
    } else {
      formattedDates = `${startDay} ${monthsRu[startMonth]} - ${endDay} ${monthsRu[endMonth]} ${startYear}`;
    }
  } else {
    if (lang === 'en') {
      formattedDates = `${monthsEn[startMonth]} ${startDay}, ${startYear} - ${monthsEn[endMonth]} ${endDay}, ${endYear}`;
    } else {
      formattedDates = `${startDay} ${monthsRu[startMonth]} ${startYear} - ${endDay} ${monthsRu[endMonth]} ${endYear}`;
    }
  }

  if (startTime && endTime) {
    formattedDates += `, ${startTime} - ${endTime}`;
  }

  return formattedDates;
}

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
    'Certified alpine ski coach with over 10 years of experience in the Alps. Specializes in advanced carving, speed refinement, and race techniques. Friendly but highly precise in adjusting your stance.': {
      en: 'Certified alpine ski coach with over 10 years of experience in the Alps. Specializes in advanced carving, speed refinement, and race techniques. Friendly but highly precise in adjusting your stance.',
      ru: 'Сертифицированный тренер по горным лыжам с более чем 10-летним опытом работы в Альпах. Специализируется на продвинутом карвинге, совершенствовании скорости и гоночной технике. Дружелюбный, но очень точный в настройке вашей стойки.'
    },
    'Сертифицированный тренер по горным лыжам с более чем 10-летним опытом работы в Альпах. Специализируется на продвинутом карвинге, совершенствовании скорости и гоночной технике. Дружелюбный, но очень точный в настройке вашей стойки.': {
      en: 'Certified alpine ski coach with over 10 years of experience in the Alps. Specializes in advanced carving, speed refinement, and race techniques. Friendly but highly precise in adjusting your stance.',
      ru: 'Сертифицированный тренер по горным лыжам с более чем 10-летним опытом работы в Альпах. Специализируется на продвинутом карвинге, совершенствовании скорости и гоночной технике. Дружелюбный, но очень точный в настройке вашей стойки.'
    },
    'Former competitive snowboard athlete. Sophia specializes in modern freeriding, snowboard park freestyle, and teaching advanced turns in deep powder. Focused on flow and core stability.': {
      en: 'Former competitive snowboard athlete. Sophia specializes in modern freeriding, snowboard park freestyle, and teaching advanced turns in deep powder. Focused on flow and core stability.',
      ru: 'Бывшая профессиональная сноубордистка. София специализируется на современном фрирайде, сноуборд-парк фристайле и обучении продвинутым поворотам в глубоком пухляке. Особое внимание уделяет плавности и балансу.'
    },
    'Бывшая профессиональная сноубордистка. София специализируется на современном фрирайде, сноуборд-парк фристайле и обучении продвинутым поворотам в глубоком пухляке. Особое внимание уделяет плавности и балансу.': {
      en: 'Former competitive snowboard athlete. Sophia specializes in modern freeriding, snowboard park freestyle, and teaching advanced turns in deep powder. Focused on flow and core stability.',
      ru: 'Бывшая профессиональная сноубордистка. София специализируется на современном фрирайде, сноуборд-парк фристайле и обучении продвинутым поворотам в глубоком пухляке. Особое внимание уделяет плавности и балансу.'
    },
    'Legendary Austrian resort guide. Marcus has 15+ years of experience training both ski and snowboard students from absolute beginners to professional instructors. Known for his patience and deep snow knowledge.': {
      en: 'Legendary Austrian resort guide. Marcus has 15+ years of experience training both ski and snowboard students from absolute beginners to professional instructors. Known for his patience and deep snow knowledge.',
      ru: 'Легендарный австрийский курортный гид. Маркус имеет более 15 лет опыта обучения катанию на лыжах и сноуборде — от абсолютных новичков до профессиональных инструкторов. Известен своим терпением и глубокими знаниями заснеженных трасс.'
    },
    'Легендарный австрийский курортный гид. Маркус имеет более 15 лет опыта обучения катанию на лыжах и сноуборде — от абсолютных новичков до профессиональных инструкторов. Известен своим терпением и глубокими знаниями заснеженных трасс.': {
      en: 'Legendary Austrian resort guide. Marcus has 15+ years of experience training both ski and snowboard students from absolute beginners to professional instructors. Known for his patience and deep snow knowledge.',
      ru: 'Легендарный австрийский курортный гид. Маркус имеет более 15 лет опыта обучения катанию на лыжах и сноуборде — от абсолютных новичков до профессиональных инструкторов. Известен своим терпением и глубокими знаниями заснеженных трасс.'
    },
    'Certified ski instructor specializing in children, families, and adult beginner-to-intermediate transformations. Her lessons are highly engaging, focusing on safety, rhythm, and building massive self-confidence.': {
      en: 'Certified ski instructor specializing in children, families, and adult beginner-to-intermediate transformations. Her lessons are highly engaging, focusing on safety, rhythm, and building massive self-confidence.',
      ru: 'Сертифицированный инструктор по лыжам, специализирующийся на детях, семьях и подготовке взрослых с нуля до среднего уровня. Ее уроки очень увлекательны, с акцентом на безопасность, ритм и обретение уверенности в себе.'
    },
    'Сертифицированный инструктор по лыжам, специализирующийся на детях, семьях и подготовке взрослых с нуля до среднего уровня. Ее уроки очень увлекательны, с акцентом на безопасность, ритм и обретение уверенности в себе.': {
      en: 'Certified ski instructor specializing in children, families, and adult beginner-to-intermediate transformations. Her lessons are highly engaging, focusing on safety, rhythm, and building massive self-confidence.',
      ru: 'Сертифицированный инструктор по лыжам, специализирующийся на детях, семьях и подготовке взрослых с нуля до среднего уровня. Ее уроки очень увлекательны, с акцентом на безопасность, ритм и обретение уверенности в себе.'
    },
    'TOP school instructor': {
      en: 'TOP school instructor',
      ru: 'ТОП инструктор школы'
    },
    'ТОП инструктор школы': {
      en: 'TOP school instructor',
      ru: 'ТОП инструктор школы'
    }
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
      bio = language === 'ru' 
        ? 'Сертифицированный тренер по горным лыжам с более чем 10-летним опытом работы в Альпах. Специализируется на продвинутом карвинге, совершенствовании скорости и гоночной технике. Дружелюбный, но очень точный в настройке вашей стойки.' 
        : 'Certified alpine ski coach with over 10 years of experience in the Alps. Specializes in advanced carving, speed refinement, and race techniques. Friendly but highly precise in adjusting your stance.';
    } else if (lowerBio.includes('competitive snowboard') || lowerBio.includes('сноубордистка')) {
      bio = language === 'ru'
        ? 'Бывшая профессиональная сноубордистка. София специализируется на современном фрирайде, сноуборд-парк фристайле и обучении продвинутым поворотам в глубоком пухляке. Особое внимание уделяет плавности и балансу.'
        : 'Former competitive snowboard athlete. Sophia specializes in modern freeriding, snowboard park freestyle, and teaching advanced turns in deep powder. Focused on flow and core stability.';
    } else if (lowerBio.includes('austrian resort guide') || lowerBio.includes('австрийский курортный')) {
      bio = language === 'ru'
        ? 'Легендарный австрийский курортный гид. Маркус имеет более 15 лет опыта обучения катанию на лыжах и сноуборде — от абсолютных новичков до профессиональных инструкторов. Известен своим терпением и глубокими знаниями заснеженных трасс.'
        : 'Legendary Austrian resort guide. Marcus has 15+ years of experience training both ski and snowboard students from absolute beginners to professional instructors. Known for his patience and deep snow knowledge.';
    } else if (lowerBio.includes('children, families') || lowerBio.includes('инструктор по лыжам, специализирующийся')) {
      bio = language === 'ru'
        ? 'Сертифицированный инструктор по лыжам, специализирующийся на детях, семьях и подготовке взрослых с нуля до среднего уровня. Ее уроки очень увлекательны, с акцентом на безопасность, ритм и обретение уверенности в себе.'
        : 'Certified ski instructor specializing in children, families, and adult beginner-to-intermediate transformations. Her lessons are highly engaging, focusing on safety, rhythm, and building massive self-confidence.';
    }
  }

  return {
    ...ins,
    name,
    bio
  };
}

export function translateCourse(course: Course, language: Language): Course {
  const titlesMap: Record<string, { en: string; ru: string }> = {
    'Carving Mastery Pro': { en: 'Carving Mastery Pro', ru: 'Мастерство Карвинга Pro' },
    'Мастерство Карвинга Pro': { en: 'Carving Mastery Pro', ru: 'Мастерство Карвинга Pro' },
    'Freeride & Powder Foundations': { en: 'Freeride & Powder Foundations', ru: 'Основы Фрирайда и Катания по Пухляку' },
    'Основы Фрирайда и Катания по Пухляку': { en: 'Freeride & Powder Foundations', ru: 'Основы Фрирайда и Катания по Пухляку' },
    'Snowboard Park & Freestyle Basics': { en: 'Snowboard Park & Freestyle Basics', ru: 'Сноуборд-Парк и Основы Фристайла' },
    'Сноуборд-Парк и Основы Фристайла': { en: 'Snowboard Park & Freestyle Basics', ru: 'Сноуборд-Парк и Основы Фристайла' }
  };

  const durationsMap: Record<string, { en: string; ru: string }> = {
    '3 Days (12 Hours)': { en: '3 Days (12 Hours)', ru: '3 дня (12 часов)' },
    '3 дня (12 часов)': { en: '3 Days (12 Hours)', ru: '3 дня (12 часов)' },
    '2 Days (8 Hours)': { en: '2 Days (8 Hours)', ru: '2 дня (8 часов)' },
    '2 дня (8 часов)': { en: '2 Days (8 Hours)', ru: '2 дня (8 часов)' },
    '4 Days (16 Hours)': { en: '4 Days (16 Hours)', ru: '4 дня (16 часов)' },
    '4 дня (16 часов)': { en: '4 Days (16 Hours)', ru: '4 дня (16 часов)' }
  };

  const descriptionsMap: Record<string, { en: string; ru: string }> = {
    'Unlock maximum speed and perfect edge control on high-velocity slopes. Designed for advanced skiers.': {
      en: 'Unlock maximum speed and perfect edge control on high-velocity slopes. Designed for advanced skiers.',
      ru: 'Освойте максимальную скорость и идеальный контроль канта на высоких скоростях. Разработано для продвинутых лыжников.'
    },
    'Освойте максимальную скорость и идеальный контроль канта на высоких скоростях. Разработано для продвинутых лыжников.': {
      en: 'Unlock maximum speed and perfect edge control on high-velocity slopes. Designed for advanced skiers.',
      ru: 'Освойте максимальную скорость и идеальный контроль канта на высоких скоростях. Разработано для продвинутых лыжников.'
    },
    'Learn to navigate deep powder, select safe mountain lines, and master avalanche safety basics. Ski or Snowboard.': {
      en: 'Learn to navigate deep powder, select safe mountain lines, and master avalanche safety basics. Ski or Snowboard.',
      ru: 'Научитесь кататься по глубокому пухляку, выбирать безопасные маршруты и освойте основы лавинной безопасности. Лыжи или сноуборд.'
    },
    'Научитесь кататься по глубокому пухляку, выбирать безопасные маршруты и освойте основы лавинной безопасности. Лыжи или сноуборд.': {
      en: 'Learn to navigate deep powder, select safe mountain lines, and master avalanche safety basics. Ski or Snowboard.',
      ru: 'Научитесь кататься по глубокому пухляку, выбирать безопасные маршруты и освойте основы лавинной безопасности. Лыжи или сноуборд.'
    },
    'Master jumps, rails, grabs, and spins in our specialized terrain park under the guidance of former athletes.': {
      en: 'Master jumps, rails, grabs, and spins in our specialized terrain park under the guidance of former athletes.',
      ru: 'Освойте прыжки, перила, грэбы и вращения в нашем специализированном сноупарке под руководством бывших профессиональных спортсменов.'
    },
    'Освойте прыжки, перила, грэбы и вращения в нашем специализированном сноупарке под руководством бывших профессиональных спортсменов.': {
      en: 'Master jumps, rails, grabs, and spins in our specialized terrain park under the guidance of former athletes.',
      ru: 'Освойте прыжки, перила, грэбы и вращения в нашем специализированном сноупарке под руководством бывших профессиональных спортсменов.'
    }
  };

  const datesMap: Record<string, { en: string; ru: string }> = {
    'July 15 - July 17, 2026': { en: 'July 15 - July 17, 2026', ru: '15 июля - 17 июля 2026' },
    '15 июля - 17 июля 2026': { en: 'July 15 - July 17, 2026', ru: '15 июля - 17 июля 2026' },
    'July 20 - July 21, 2026': { en: 'July 20 - July 21, 2026', ru: '20 июля - 21 июля 2026' },
    '20 июля - 21 июля 2026': { en: 'July 20 - July 21, 2026', ru: '20 июля - 21 июля 2026' },
    'July 24 - July 27, 2026': { en: 'July 24 - July 27, 2026', ru: '24 июля - 27 июля 2026' },
    '24 июля - 27 июля 2026': { en: 'July 24 - July 27, 2026', ru: '24 июля - 27 июля 2026' }
  };

  let title = course.title;
  let duration = course.duration;
  let description = course.description;
  let dates = course.dates;

  const tMap = titlesMap[course.title] || titlesMap[course.title.trim()];
  if (tMap) title = tMap[language];

  const durMap = durationsMap[course.duration] || durationsMap[course.duration.trim()];
  if (durMap) duration = durMap[language];

  const descMap = descriptionsMap[course.description] || descriptionsMap[course.description.trim()];
  if (descMap) description = descMap[language];

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
      } else if (daysNum % 10 >= 2 && daysNum % 10 <= 4 && (daysNum % 100 < 10 || daysNum % 100 >= 20)) {
        dayWord = 'дня';
      }

      let hourWord = 'часов';
      if (hoursNum % 10 === 1 && hoursNum % 100 !== 11) {
        hourWord = 'час';
      } else if (hoursNum % 10 >= 2 && hoursNum % 10 <= 4 && (hoursNum % 100 < 10 || hoursNum % 100 >= 20)) {
        hourWord = 'часа';
      }

      duration = `${daysNum} ${dayWord} (${hoursNum} ${hourWord})`;
    }
  } else {
    const matchesRu = duration.match(/^(\d+)\s*(день|дня|дней)\s*\((\d+)\s*(час|часа|часов)\)$/i);
    if (matchesRu) {
      const daysNum = matchesRu[1];
      const hoursNum = matchesRu[3];
      duration = `${daysNum} Day${Number(daysNum) > 1 ? 's' : ''} (${hoursNum} Hour${Number(hoursNum) > 1 ? 's' : ''})`;
    }
  }

  return {
    ...course,
    title,
    duration,
    description,
    dates
  };
}

export const translations = {
  en: {
    // Navbar
    brandSub: "Ski & Snowboard Bookings",
    browseSlopes: "⛷️ Browse Slopes",
    manageResort: "🛡️ Manage Resort",
    balance: "Balance",
    signOut: "Sign Out",
    manager: "Manager",
    skier: "Skier",
    topUpSimulated: "Top up simulated USD",

    // Auth
    welcomeTitle: "Welcome to Carve Academy",
    welcomeSub: "Sign in to schedule your next powder session",
    signUpTitle: "Create your account",
    signUpSub: "Join today and receive a $250 booking credit!",
    fullName: "Full Name",
    phoneOptional: "Phone Number (Optional)",
    emailAddress: "Email Address",
    password: "Password",
    signInBtn: "Sign In",
    signUpBtn: "Sign Up",
    orContinueWith: "Or continue with",
    googleSignIn: "Sign in with Google",
    haveAccount: "Already have an account? Sign In",
    noAccount: "Don't have an account? Sign Up",
    sandboxLogins: "Sandbox Auto-Fill Accounts",
    guestSkier: "Guest Skier",
    adminMgr: "Admin Manager",
    topCoaching: "Top Resort Coaching",
    topCoachingDesc: "Learn from high-level, multi-lingual FIS certified instructors.",
    starterCredits: "Starter Gift Credits",
    starterCreditsDesc: "Every new sign-up instantly receives $250 mock balance to explore.",
    seamlessDash: "Seamless Dashboard",
    seamlessDashDesc: "Book, reschedule, cancel, or leave rating reviews directly from your cabinet.",

    // Hero / Welcome
    freshPowder: "Fresh Powder Alert",
    heroTitle: "Excel Your Stance with Carve Academy",
    heroDesc: "Schedule private, fully customized lessons with resort pro ski and snowboard coaches. Starting balance: $250.",
    viewInstructors: "View Instructors",
    topUpWallet: "Top Up Wallet",

    // Weather / Slopes Widget
    resortConditions: "Resort Conditions",
    slopeOperations: "Slope Operations",
    activeCoaches: "Active Coaches",
    powderSnow: "Powder Snow",
    windSpeed: "Wind Speed",
    visibility: "Visibility",
    temp: "Temp",
    statusOpen: "Open",
    statusClosed: "Closed",
    slopesStatus: "Slopes & Lifts",

    // Personal Cabinet
    activeCabinet: "Your Active Cabinet",
    noBookings: "No lessons booked yet.",
    bookGuideBelow: "Find and book a professional guide in the roster below!",
    lessonWith: "Lesson with",
    hoursShort: "hrs",
    rescheduleBtn: "Reschedule",
    cancelBtn: "Cancel",
    writeReviewBtn: "Write Review",
    reviewSubmitted: "Review submitted successfully!",
    cancelled: "Cancelled",
    confirmed: "Confirmed",
    completed: "Completed",
    pending: "Pending",
    editBooking: "Edit Booking Time",
    newDate: "New Date",
    newTime: "New Time",
    submitting: "Submitting...",
    saveChanges: "Save Changes",
    reviewTitle: "How was your experience?",
    ratingLabel: "Rating",
    commentLabel: "Comment / Feedback",
    commentPlaceholder: "Share how your coaching went...",
    submitReview: "Submit Review",

    // Filters
    meetGuides: "Meet Our Professional Guides",
    meetGuidesSub: "Book professional guides by hourly rates and discipline specialties",
    searchPlaceholder: "Search guides by name or bio...",
    discipline: "Discipline",
    allDisciplines: "All Disciplines",
    skiOnly: "Skiing Only",
    snowboardOnly: "Snowboarding Only",
    bothSpecialties: "Ski & Snowboard",
    coachLanguage: "Coach Language",
    allLanguages: "All Languages",
    sortBy: "Sort By",
    ratingHighToLow: "Rating: High to Low",
    priceLowToHigh: "Price: Low to High",
    priceHighToLow: "Price: High to Low",
    experienceYears: "Years of Experience",
    resetFilters: "Reset All Filters",
    noCoachesMatch: "No coaches match your search filters.",

    // Instructor Card
    hr: "hr",
    experience: "experience",
    rating: "rating",
    languages: "Languages",
    availableNow: "Available",
    bookedFully: "Booked / Busy",
    bookNow: "Book Lesson",

    // Booking Modal
    bookLessonWith: "Book Lesson with",
    howManyHours: "How many hours of training?",
    hoursLabel: "Hours",
    selectDate: "Select Date",
    selectTime: "Select Time",
    estimatedCost: "Estimated Cost",
    hourlyRate: "Hourly rate",
    totalPrice: "Total price",
    confirmBooking: "Confirm & Book",
    insufficientFunds: "Insufficient Funds",
    addCreditsFirst: "Please top up your wallet in the payment gateway to finalize this booking.",
    safetyAssurance: "Safety & Gear Assurance",
    safetyDesc: "Standard ski helmet and resort lift passes are included inside every booking reservation at no auxiliary cost.",
    processing: "Processing...",

    // Payment Gateway
    simulatedTopUp: "Simulated Payment Gateway",
    topUpWalletTitle: "Top Up Your Wallet",
    topUpWalletSub: "Add secure mock funds to make lesson bookings",
    selectAmount: "Select Mock Top Up Amount",
    customAmount: "Or enter custom amount ($)",
    cardHolder: "Cardholder Name",
    cardNumber: "Card Number (Simulated)",
    expiry: "Expiry",
    cvv: "CVV",
    simulatePayment: "Simulate Secure Payment",
    thankYou: "Thank you!",
    refreshedWallet: "Your sandbox wallet has been successfully credited with",
    closeBtn: "Close",

    // Admin Panel
    resortManagerConsole: "Resort Manager Console",
    resortConsoleSub: "Monitor lessons, configure guide availabilities, and add/delete instructors",
    financialOverview: "Financial Overview",
    totalRevenue: "Total Revenue",
    activeLessons: "Active Lessons",
    completedLessons: "Completed Lessons",
    allGuidesCount: "All Guides",
    addNewInstructor: "Add New Instructor",
    guideAvailabilities: "Guide Availabilities & Rosters",
    bookingsLogs: "Lessons Booking Logs",
    bookingsLogsSub: "Monitor and control individual skier bookings",
    noBookingsLogged: "No lesson bookings logged yet.",
    bookingId: "Booking ID",
    skierLabel: "Skier",
    coachLabel: "Coach",
    dateAndTime: "Date & Time",
    hoursLabelLong: "Hours",
    revenue: "Revenue",
    statusLabel: "Status",
    actions: "Actions",
    confirmBtn: "Confirm",
    avatarUrl: "Avatar URL",
    bio: "Bio",
    specialty: "Specialty",
    experienceYearsLabel: "Experience (Years)",
    pricePerHourLabel: "Price Per Hour ($)",
    addInstructorSubmit: "Add Instructor",
    saving: "Saving...",

    // System status / fallback
    dbRestricted: "Database sync restricted. Using active sandboxed state.",
    checkingCredentials: "Checking Lift Credentials...",
    loading: "Loading..."
  },
  ru: {
    // Navbar
    brandSub: "Бронирование Лыж и Сноубордов",
    browseSlopes: "⛷️ Перейти к склонам",
    manageResort: "🛡️ Управление курортом",
    balance: "Баланс",
    signOut: "Выйти",
    manager: "Менеджер",
    skier: "Лыжник",
    topUpSimulated: "Пополнить учебный баланс USD",

    // Auth
    welcomeTitle: "Добро пожаловать в Carve Academy",
    welcomeSub: "Войдите, чтобы запланировать следующее катание",
    signUpTitle: "Создать аккаунт",
    signUpSub: "Зарегистрируйтесь сегодня и получите $250 на бронирование!",
    fullName: "Полное имя",
    phoneOptional: "Номер телефона (необязательно)",
    emailAddress: "Электронная почта",
    password: "Пароль",
    signInBtn: "Войти",
    signUpBtn: "Зарегистрироваться",
    orContinueWith: "Или войти с помощью",
    googleSignIn: "Войти через Google",
    haveAccount: "Уже есть аккаунт? Войти",
    noAccount: "Нет аккаунта? Зарегистрироваться",
    sandboxLogins: "Аккаунты для автозаполнения в песочнице",
    guestSkier: "Тестовый лыжник",
    adminMgr: "Администратор курорта",
    topCoaching: "Лучшие инструкторы курорта",
    topCoachingDesc: "Обучайтесь у высококлассных многоязычных инструкторов, сертифицированных FIS.",
    starterCredits: "Стартовые подарочные кредиты",
    starterCreditsDesc: "Каждый новый зарегистрированный пользователь мгновенно получает $250 для ознакомления.",
    seamlessDash: "Удобная панель управления",
    seamlessDashDesc: "Бронируйте, переносите, отменяйте занятия или оставляйте отзывы прямо из личного кабинета.",

    // Hero / Welcome
    freshPowder: "Внимание: Свежий пухляк!",
    heroTitle: "Оттачивайте технику в Академии карвинга Carve Academy",
    heroDesc: "Запланируйте индивидуальные уроки с профессиональными тренерами курорта по лыжам и сноуборду. Стартовый баланс: $250.",
    viewInstructors: "Посмотреть инструкторов",
    topUpWallet: "Пополнить баланс",

    // Weather / Slopes Widget
    resortConditions: "Состояние курорта",
    slopeOperations: "Работа склонов",
    activeCoaches: "Активные тренеры",
    powderSnow: "Свежий снег (пухляк)",
    windSpeed: "Скорость ветра",
    visibility: "Видимость",
    temp: "Температура",
    statusOpen: "Открыто",
    statusClosed: "Закрыто",
    slopesStatus: "Склоны и подъемники",

    // Personal Cabinet
    activeCabinet: "Ваш личный кабинет",
    noBookings: "У вас пока нет забронированных уроков.",
    bookGuideBelow: "Найдите и забронируйте профессионального гида в списке ниже!",
    lessonWith: "Урок с",
    hoursShort: "ч.",
    rescheduleBtn: "Перенести",
    cancelBtn: "Отменить",
    writeReviewBtn: "Оставить отзыв",
    reviewSubmitted: "Отзыв успешно отправлен!",
    cancelled: "Отменено",
    confirmed: "Подтверждено",
    completed: "Завершено",
    pending: "Ожидает",
    editBooking: "Изменить время бронирования",
    newDate: "Новая дата",
    newTime: "Новое время",
    submitting: "Отправка...",
    saveChanges: "Сохранить изменения",
    reviewTitle: "Как прошло ваше занятие?",
    ratingLabel: "Оценка",
    commentLabel: "Комментарий / Отзыв",
    commentPlaceholder: "Поделитесь впечатлениями о тренировке...",
    submitReview: "Отправить отзыв",

    // Filters
    meetGuides: "Наши профессиональные гиды",
    meetGuidesSub: "Бронируйте профессиональных гидов по часовой ставке и спортивным дисциплинам",
    searchPlaceholder: "Поиск гидов по имени или описанию...",
    discipline: "Дисциплина",
    allDisciplines: "Все дисциплины",
    skiOnly: "Только лыжи",
    snowboardOnly: "Только сноуборд",
    bothSpecialties: "Лыжи и сноуборд",
    coachLanguage: "Язык инструктора",
    allLanguages: "Все языки",
    sortBy: "Сортировка",
    ratingHighToLow: "Рейтинг: по убыванию",
    priceLowToHigh: "Цена: сначала дешевле",
    priceHighToLow: "Цена: сначала дороже",
    experienceYears: "Опыт работы (лет)",
    resetFilters: "Сбросить все фильтры",
    noCoachesMatch: "Инструкторы по вашему запросу не найдены.",

    // Instructor Card
    hr: "ч",
    experience: "опыт",
    rating: "рейтинг",
    languages: "Языки",
    availableNow: "Свободен",
    bookedFully: "Занят / Забронирован",
    bookNow: "Забронировать",

    // Booking Modal
    bookLessonWith: "Забронировать урок с",
    howManyHours: "Сколько часов тренировки?",
    hoursLabel: "Часы",
    selectDate: "Выберите дату",
    selectTime: "Выберите время",
    estimatedCost: "Расчет стоимости",
    hourlyRate: "Почасовая ставка",
    totalPrice: "Итоговая цена",
    confirmBooking: "Подтвердить и забронировать",
    insufficientFunds: "Недостаточно средств",
    addCreditsFirst: "Пожалуйста, пополните баланс в платежном шлюзе, чтобы завершить бронирование.",
    safetyAssurance: "Безопасность и экипировка включены",
    safetyDesc: "Стандартный лыжный шлем и ски-пасс курорта включены в каждое бронирование без дополнительной платы.",
    processing: "Оформление...",

    // Payment Gateway
    simulatedTopUp: "Имитация платежного шлюза",
    topUpWalletTitle: "Пополнение баланса",
    topUpWalletSub: "Добавьте тестовые средства для бронирования уроков",
    selectAmount: "Выберите сумму пополнения",
    customAmount: "Или введите свою сумму ($)",
    cardHolder: "Имя владельца карты",
    cardNumber: "Номер карты (симуляция)",
    expiry: "Срок действия",
    cvv: "Код CVV",
    simulatePayment: "Произвести тестовый платеж",
    thankYou: "Спасибо!",
    refreshedWallet: "Баланс вашего кошелька был успешно пополнен на сумму",
    closeBtn: "Закрыть",

    // Admin Panel
    resortManagerConsole: "Консоль управления курортом",
    resortConsoleSub: "Мониторинг уроков, управление доступностью гидов, добавление и удаление инструкторов",
    financialOverview: "Финансовый обзор",
    totalRevenue: "Общая выручка",
    activeLessons: "Активные уроки",
    completedLessons: "Завершенные уроки",
    allGuidesCount: "Всего гидов",
    addNewInstructor: "Добавить нового инструктора",
    guideAvailabilities: "Управление гидами и расписанием",
    bookingsLogs: "Логи бронирования уроков",
    bookingsLogsSub: "Мониторинг и управление бронированиями лыжников",
    noBookingsLogged: "Пока нет записей о бронировании.",
    bookingId: "ID Бронирования",
    skierLabel: "Лыжник",
    coachLabel: "Инструктор",
    dateAndTime: "Дата и время",
    hoursLabelLong: "Часы",
    revenue: "Выручка",
    statusLabel: "Статус",
    actions: "Действия",
    confirmBtn: "Подтвердить",
    avatarUrl: "Ссылка на аватар",
    bio: "О себе / Биография",
    specialty: "Специальность",
    experienceYearsLabel: "Опыт работы (лет)",
    pricePerHourLabel: "Цена за час ($)",
    addInstructorSubmit: "Добавить инструктора",
    saving: "Сохранение...",

    // System status / fallback
    dbRestricted: "Синхронизация БД ограничена. Используется локальное состояние песочницы.",
    checkingCredentials: "Проверка пропусков на подъемники...",
    loading: "Загрузка..."
  }
} as const;

type TranslationKey = keyof typeof translations['en'];

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: TranslationKey) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>(() => {
    const saved = localStorage.getItem('alpine_glide_lang');
    if (saved === 'ru' || saved === 'en') return saved;
    // Autodetect browser language if possible
    const browserLang = navigator.language.toLowerCase();
    return browserLang.startsWith('ru') ? 'ru' : 'en';
  });

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem('alpine_glide_lang', lang);
  };

  const t = (key: TranslationKey): string => {
    const translationSet = translations[language];
    return translationSet[key] || translations['en'][key] || String(key);
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};
