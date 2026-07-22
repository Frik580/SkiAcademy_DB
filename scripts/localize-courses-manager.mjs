import fs from 'fs';

const path = 'src/components/admin/CoursesManager.tsx';
let content = fs.readFileSync(path, 'utf8');

const pairs = [
  [/language === 'en' \? 'Courses Database Management' : 'Управление базой курсов'/g, "t('coursesDatabaseTitle')"],
  [/language === 'en'\s*\n\s*\? 'Create, edit, and delete intensive group courses, track seat availability, and manage prices'\s*\n\s*: 'Создание, редактирование и удаление интенсивных групповых курсов, отслеживание свободных мест и цен'/g, "t('coursesDatabaseSub')"],
  [/language === 'en' \? 'Add Course' : 'Добавить курс'/g, "t('addCourse')"],
  [/language === 'en' \? 'Image' : 'Фон'/g, "t('courseImageColumn')"],
  [/language === 'en' \? 'Course Title' : 'Название'/g, "t('courseTitleColumn')"],
  [/language === 'en' \? 'Duration' : 'Продолжительность'/g, "t('durationColumn')"],
  [/language === 'en' \? 'Dates' : 'Даты проведения'/g, "t('datesColumn')"],
  [/language === 'en' \? 'Seats' : 'Места'/g, "t('seatsColumn')"],
  [/language === 'en' \? 'Price' : 'Цена'/g, "t('priceColumn')"],
  [/language === 'en' \? 'Order' : 'Порядок'/g, "t('orderColumn')"],
  [/language === 'en' \? 'Hidden' : 'Скрыт'/g, "t('hiddenLabel')"],
  [/language === 'en' \? 'Instructors:' : 'Инструкторы:'/g, "t('instructorsColon')"],
  [/language === 'en' \? 'Enrolled:' : 'Записаны:'/g, "t('enrolledColon')"],
  [/language === 'en' \? 'Move Up' : 'Переместить вверх'/g, "t('moveUp')"],
  [/language === 'en' \? 'Move Down' : 'Переместить вниз'/g, "t('moveDown')"],
  [/language === 'en' \? 'Course Updated' : 'Курс обновлен'/g, "t('courseVisibilityUpdated')"],
  [/language === 'en' \? 'Show course' : 'Показать курс'/g, "t('showCourse')"],
  [/language === 'en' \? 'Hide course' : 'Скрыть курс'/g, "t('hideCourse')"],
  [/language === 'en' \? 'Edit course' : 'Редактировать курс'/g, "t('editCourse')"],
  [/language === 'en' \? 'Delete course' : 'Удалить курс'/g, "t('deleteCourse')"],
  [/language === 'en' \? 'No intensive courses found\.' : 'Интенсивные курсы не найдены\.'/g, "t('noCoursesFound')"],
  [/language === 'en' \? 'Edit Course' : 'Редактирование курса'/g, "t('editCourseForm')"],
  [/language === 'en' \? 'New Course' : 'Создать новый курс'/g, "t('newCourseForm')"],
  [/language === 'en' \? 'Название курса'/g, "t('courseTitleField')"],
  [/language === 'en' \? 'Course Title' : 'Название курса'/g, "t('courseTitleField')"],
  [/placeholder=\{language === 'en' \? 'e\.g\. Carving Mastery Pro' : 'Например, Искусство карвинга'\}/g, "placeholder={t('courseTitlePlaceholder')}"],
  [/language === 'en' \? 'Duration Description' : 'Продолжительность'/g, "t('durationDescription')"],
  [/placeholder=\{language === 'en' \? 'e\.g\. 3 Days \(12 Hours\)' : 'Например, 3 дня \(12 часов\)'\}/g, "placeholder={t('durationPlaceholder')}"],
  [/language === 'en' \? 'Dates & Time of Course' : 'Даты и время проведения курса'/g, "t('datesTimeOfCourse')"],
  [/placeholder=\{language === 'en' \? 'Click to open calendar' : 'Нажмите для выбора дат'\}/g, "placeholder={t('openCalendarPlaceholder')}"],
  [/language === 'en' \? 'Invalid File' : 'Неверный файл'/g, "t('invalidFile')"],
  [/language === 'en' \? 'Please select an image file\.' : 'Пожалуйста, выберите изображение\.'/g, "t('invalidFileDesc')"],
  [/language === 'en' \? 'Background Image Attached' : 'Фон загружен'/g, "t('courseBgAttached')"],
  [/language === 'en' \? 'Course background image was successfully optimized\.' : 'Фоновая картинка курса была успешно оптимизирована\.'/g, "t('courseBgAttachedDesc')"],
  [/language === 'en' \? 'Optimization Failed' : 'Ошибка оптимизации'/g, "t('uploadFailed')"],
  [/language === 'en' \? 'Failed to process the background image\.' : 'Не удалось обработать изображение фона\.'/g, "t('courseBgFailedDesc')"],
  [/language === 'en' \? 'Missing Details' : 'Не все поля заполнены'/g, "t('missingDetails')"],
  [/language === 'en' \? 'Please fill in all course details\.' : 'Пожалуйста, заполните все данные о курсе\.'/g, "t('fillCourseDetails')"],
  [/language === 'en' \? 'Instructors Required' : 'Инструкторы обязательны'/g, "t('instructorsRequired')"],
  [/language === 'en'\s*\n\s*\? 'Please select 1 or 2 instructors for this course\.'\s*\n\s*: 'Пожалуйста, выберите 1 или 2 инструкторов для этого курса\.'/g, "t('selectOneTwoInstructors')"],
  [/language === 'en' \? 'Success' : 'Успешно'/g, "t('successTitle')"],
  [/language === 'en' \? 'Course updated successfully\.' : 'Курс успешно обновлен\.'/g, "t('courseUpdated')"],
  [/language === 'en' \? 'Course added successfully\.' : 'Курс успешно добавлен\.'/g, "t('courseAdded')"],
  [/language === 'en' \? 'Error' : 'Ошибка'/g, "t('errorTitle')"],
  [/language === 'en' \? 'Failed to save course\.' : 'Не удалось сохранить курс\.'/g, "t('saveCourseFailed')"],
  [/language === 'en' \? 'Order Changed' : 'Порядок изменен'/g, "t('orderChanged')"],
  [/language === 'en' \? 'Course order updated successfully\.' : 'Порядок курсов успешно изменен\.'/g, "t('courseOrderUpdated')"],
  [/language === 'en' \? 'Failed to update course order\.' : 'Не удалось изменить порядок курсов\.'/g, "t('courseOrderFailed')"],
  [/language === 'en' \? 'Update Course' : 'Обновить курс'/g, "t('updateCourse')"],
  [/language === 'en' \? 'Create Course' : 'Создать курс'/g, "t('createCourse')"],
  [/language === 'en' \? 'Hide course from users' : 'Скрыть курс от пользователей'/g, "t('hideCourseFromUsers')"],
  [/language === 'en' \? 'Total Seats' : 'Всего мест'/g, "t('totalSeats')"],
  [/language === 'en' \? 'Course Price \(\$\)' : 'Цена курса \(\$\)'/g, "t('coursePrice')"],
  [/language === 'en' \? 'Short Description \(EN\)' : 'Краткое описание \(EN\)'/g, "t('shortDescEn')"],
  [/language === 'en' \? 'Short Description \(RU\)' : 'Краткое описание \(RU\)'/g, "t('shortDescRu')"],
  [/language === 'en' \? 'Full Description \(EN\)' : 'Полное описание \(EN\)'/g, "t('fullDescEn')"],
  [/language === 'en' \? 'Full Description \(RU\)' : 'Полное описание \(RU\)'/g, "t('fullDescRu')"],
  [/language === 'en' \? 'Badge Label \(EN\)' : 'Бейдж \(EN\)'/g, "t('badgeEn')"],
  [/language === 'en' \? 'Badge Label \(RU\)' : 'Бейдж \(RU\)'/g, "t('badgeRu')"],
  [/language === 'en' \? 'Skill Level' : 'Уровень подготовки'/g, "t('skillLevel')"],
  [/language === 'en' \? 'Not specified' : 'Не указан'/g, "t('notSpecified')"],
  [/language === 'en' \? 'Beginner' : 'Начальный'/g, "t('beginnerLevel')"],
  [/language === 'en' \? 'Intermediate' : 'Средний'/g, "t('intermediateLevel')"],
  [/language === 'en' \? 'Advanced' : 'Продвинутый'/g, "t('advancedLevel')"],
  [/language === 'en' \? 'Expert' : 'Эксперт'/g, "t('expertLevel')"],
  [/language === 'en' \? 'Assign Instructors \(1-2\)' : 'Назначить инструкторов \(1-2\)'/g, "t('assignInstructors')"],
  [/language === 'en' \? 'Background Image' : 'Фоновое изображение'/g, "t('backgroundImage')"],
  [/language === 'en' \? 'Optimizing\.\.\.' : 'Оптимизация\.\.\.'/g, "t('optimizing')"],
  [/language === 'en' \? 'Click or drag image here' : 'Нажмите или перетащите изображение'/g, "t('dragCourseImage')"],
  [/language === 'en' \? 'JPEG\/PNG will be auto-optimized' : 'JPEG\/PNG будут авто-оптимизированы'/g, "t('jpegAutoOptimized')"],
  [/language === 'en' \? 'Rich Course Page Details' : 'Расширенные детали страницы курса'/g, "t('richCourseDetails')"],
  [/language === 'en' \? 'Hide course from users' : 'Скрыть курс от пользователей'/g, "t('hideCourseFromUsers')"],
  [/showCalendarPopover \? \(language === 'en' \? 'Close' : 'Закрыть'\) : \(language === 'en' \? 'Calendar' : 'Календарь'\)/g, "showCalendarPopover ? t('closeCalendar') : t('openCalendar')"],
  [/language === 'en' \? 'Daily Hours' : 'Ежедневные часы занятий'/g, "t('dailyHours')"],
  [/language === 'en' \? 'Start' : 'Начало'/g, "t('startTime')"],
  [/language === 'en' \? 'End' : 'Окончание'/g, "t('endTime')"],
  [/language === 'en' \? 'Fallback Description \(EN\)' : 'Описание по умолчанию \(EN\)'/g, "t('fallbackDescEn')"],
  [/placeholder=\{language === 'en' \? 'What will students learn\?' : 'Чему научатся студенты\?'\}/g, "placeholder={t('fallbackDescPlaceholder')}"],
  [/language === 'en' \? 'Course Difficulty Level' : 'Сложность курса \(Уровень\)'/g, "t('courseDifficultyLevel')"],
  [/language === 'en' \? '-- Select level \(None\) --' : '-- Выберите уровень \(Нет\) --'/g, "t('selectLevelNone')"],
  [/language === 'en' \? 'Badge, Descriptions & Translations' : 'Бейдж, описания и переводы'/g, "t('badgeDescriptionsSection')"],
  [/language === 'en' \? 'Card Badge \(EN\) \(text like "PRO" or image URL\)' : 'Бейдж на карточке \(EN\) \(текст вроде "PRO" или URL картинки\)'/g, "t('cardBadgeEn')"],
  [/language === 'en' \? 'Card Badge \(RU\) \(text like "ПРО" or image URL\)' : 'Бейдж на карточке \(RU\) \(текст вроде "ПРО" или URL картинки\)'/g, "t('cardBadgeRu')"],
  [/language === 'en' \? 'Short Description \(EN\) - for Card' : 'Краткое описание \(EN\) - для карточки'/g, "t('shortDescEnCard')"],
  [/language === 'en' \? 'Short Description \(RU\) - for Card' : 'Краткое описание \(RU\) - для карточки'/g, "t('shortDescRuCard')"],
  [/language === 'en' \? 'Detailed Description \(EN\) - for Modal' : 'Подробное описание \(EN\) - для окна деталей'/g, "t('detailedDescEnModal')"],
  [/language === 'en' \? 'Detailed Description \(RU\) - for Modal' : 'Подробное описание \(RU\) - для окна деталей'/g, "t('detailedDescRuModal')"],
  [/language === 'en' \? 'Price \(USD\)' : 'Стоимость \(USD\)'/g, "t('priceUsd')"],
  [/language === 'en' \? 'Background Image URL' : 'Ссылка на картинку фона'/g, "t('backgroundImageUrl')"],
  [/language === 'en' \? 'Drag and drop or Click to upload background photo' : 'Перетащите или нажмите для загрузки фона'/g, "t('dragUploadBgPhoto')"],
  [/language === 'en' \? 'Assigned Instructors \(Choose 1 or 2\)' : 'Закрепленные инструкторы \(Выберите 1 или 2\)'/g, "t('assignedInstructors')"],
  [/ins\.specialty === 'both' \? \(language === 'en' \? 'Ski\/Snb' : 'Лыжи\/Снб'\) : \(ins\.specialty === 'ski' \? \(language === 'en' \? 'Ski' : 'Лыжи'\) : \(language === 'en' \? 'Snb' : 'Сноуборд'\)\)/g, "getSpecialtyLabel(ins.specialty, language)"],
  [/language === 'en' \? 'Edit Course Page Details' : 'Редактировать детали страницы курса'/g, "t('editCoursePageDetails')"],
  [/language === 'en' \? 'Course Details Page Overrides' : 'Настройки страницы деталей курса'/g, "t('courseDetailsOverrides')"],
  [/language === 'en' \? 'Promo Video URL \(Direct Video File \/ \.mp4 \/ Unsplash URL\)' : 'Ссылка на промо-видео \(Прямая ссылка \/ \.mp4 \/ Unsplash URL\)'/g, "t('promoVideoUrl')"],
  [/language === 'en' \? 'Benefits \(EN\) - One per line' : 'Преимущества \(EN\) - По одному на строке'/g, "t('benefitsEn')"],
  [/language === 'en' \? 'Benefits \(RU\) - One per line' : 'Преимущества \(RU\) - По одному на строке'/g, "t('benefitsRu')"],
  [/language === 'en' \? 'Day-by-Day Program' : 'Подневная программа курса'/g, "t('dayByDayProgram')"],
  [/language === 'en' \? '− Remove Day' : '− Уменьшить дни'/g, "t('removeDay')"],
  [/language === 'en' \? '\+ Add Day' : '\+ Увеличить дни'/g, "t('addDay')"],
  [/language === 'en' \? `Day \$\{idx \+ 1\}` : `День \$\{idx \+ 1\}`/g, "`${t('dayPrefix')} ${idx + 1}`"],
  [/language === 'en' \? 'FAQ Section \(Up to 3 Questions\)' : 'Раздел часто задаваемых вопросов \(До 3 вопросов\)'/g, "t('faqSection')"],
  [/language === 'en' \? 'FAQ 1' : 'Вопрос 1'/g, "t('faq1')"],
  [/language === 'en' \? 'FAQ 2' : 'Вопрос 2'/g, "t('faq2')"],
  [/language === 'en' \? 'FAQ 3' : 'Вопрос 3'/g, "t('faq3')"],
  [/language === 'en' \? 'Gallery Photos \(Unsplash\/Image URLs\) - One per line' : 'Фотогалерея \(Ссылки на Unsplash\/Картинки\) - По одной на строке'/g, "t('galleryPhotos')"],
];

for (const [re, rep] of pairs) {
  content = content.replace(re, rep);
}

// Dynamic delete confirm
content = content.replace(
  /const confirmMsg = language === 'en'\s*\n\s*\? `Are you absolutely sure you want to delete course "\$\{course\.title\}"\?`\s*\n\s*: `Вы абсолютно уверены, что хотите удалить курс «\$\{course\.title\}»\?`;/g,
  "const confirmMsg = `${t('deleteCourseConfirmPrefix')} \"${course.title}\"?`;"
);

// Visibility notification
content = content.replace(
  /language === 'en'\s*\n\s*\? `Course "\$\{translatedCourse\.title\}" is now \$\{!course\.isHidden \? 'hidden' : 'visible'\}\.`\s*\n\s*: `Курс «\$\{translatedCourse\.title\}» теперь \$\{!course\.isHidden \? 'скрыт' : 'виден всем'\}\.`/g,
  "`${t('courseNowPrefix')} \"${translatedCourse.title}\" ${t('courseNowSuffix')} ${!course.isHidden ? t('hiddenWord') : t('visibleWord')}.`"
);

// Duration auto-calc - keep language branch but could use keys later

fs.writeFileSync(path, content);
const remaining = (content.match(/language === 'en'/g) || []).length;
console.log('Localized CoursesManager, remaining language checks:', remaining);
