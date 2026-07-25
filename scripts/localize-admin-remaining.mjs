import fs from 'fs';

const path = 'src/components/AdminPanel.tsx';
let content = fs.readFileSync(path, 'utf8');

const pairs = [
  [/language === 'en' \? 'Invalid File' : 'Неверный файл'/g, "t('invalidFile')"],
  [
    /language === 'en' \? 'Please select an image file\.' : 'Пожалуйста, выберите изображение\.'/g,
    "t('invalidFileDesc')",
  ],
  [/language === 'en' \? 'Photo Attached' : 'Фотография прикреплена'/g, "t('photoAttached')"],
  [
    /language === 'en' \? 'Instructor photo was successfully optimized and loaded\.' : 'Фото инструктора было успешно оптимизировано и загружено\.'/g,
    "t('photoAttachedDesc')",
  ],
  [/language === 'en' \? 'Optimization Failed' : 'Ошибка оптимизации'/g, "t('uploadFailed')"],
  [
    /language === 'en' \? 'Could not optimize the selected image\.' : 'Не удалось обработать выбранное изображение\.'/g,
    "t('couldNotOptimizeImage')",
  ],
  [
    /language === 'en' \? 'Coaches Directory Management' : 'Управление базой инструкторов'/g,
    "t('coachesDirectoryTitle')",
  ],
  [
    /language === 'en' \? 'Toggle availability, edit rates, add\/remove staff' : 'Управление доступностью, тарифами, добавление и удаление тренеров'/g,
    "t('coachesDirectorySub')",
  ],
  [/language === 'en' \? 'Add Coach' : 'Добавить'/g, "t('addCoachShort')"],
  [/language === 'en' \? 'Instructor' : 'Инструктор'/g, "t('instructorColumn')"],
  [/language === 'en' \? 'Discipline' : 'Дисциплина'/g, "t('discipline')"],
  [/language === 'en' \? 'Rate\/hr' : 'Ставка\/ч'/g, "t('ratePerHourShort')"],
  [/language === 'en' \? 'Availability' : 'Доступность'/g, "t('availabilityLabel')"],
  [/language === 'en' \? 'Actions' : 'Действия'/g, "t('actions')"],
  [
    /language === 'en' \? `Exp: \$\{ins\.experienceYears\} Years` : `Опыт: \$\{ins\.experienceYears\} л\.`/g,
    "`${t('expYearsPrefix')} ${ins.experienceYears} ${t('expYearsSuffix')}`",
  ],
  [/title=\{language === 'en' \? 'Edit Details' : 'Редактировать'\}/g, "title={t('editDetails')}"],
  [
    /title=\{language === 'en' \? 'Delete Instructor' : 'Удалить'\}/g,
    "title={t('deleteInstructor')}",
  ],
  [
    /language === 'en' \? 'Register New Coach' : 'Зарегистрировать тренера'/g,
    "t('registerNewCoach')",
  ],
  [
    /language === 'en' \? 'Define specialty levels, rate limits, and language tags' : 'Укажите специальность, стоимость и языки'/g,
    "t('coachFormSub')",
  ],
  [/language === 'en' \? 'Coach Full Name' : 'Имя тренера'/g, "t('coachFullName')"],
  [/language === 'en' \? 'Ski' : 'Лыжи'/g, "t('specialtySki')"],
  [/language === 'en' \? 'Snowboard' : 'Сноуборд'/g, "t('specialtySnowboard')"],
  [/language === 'en' \? 'Both' : 'Оба'/g, "t('specialtyBoth')"],
  [/language === 'en' \? 'Rate \/ Hour \(\$\)' : 'Ставка в час \(\$\)'/g, "t('ratePerHourLabel')"],
  [/language === 'en' \? 'Experience \(Yrs\)' : 'Опыт \(лет\)'/g, "t('experienceYrsShort')"],
  [/language === 'en' \? 'Languages \(CSV\)' : 'Языки \(через запятую\)'/g, "t('languagesCsv')"],
  [/language === 'en' \? 'Bio Statement' : 'Биография \/ О себе'/g, "t('bioStatement')"],
  [
    /placeholder=\{language === 'en' \? 'Tell students about lessons style\.\.\.' : 'Расскажите ученикам о вашем стиле обучения\.\.\.'\}/g,
    "placeholder={t('bioPlaceholder')}",
  ],
  [
    /language === 'en' \? 'Coach Photo \/ Avatar' : 'Фотография тренера \/ Аватар'/g,
    "t('coachPhoto')",
  ],
  [/language === 'en' \? 'Optimizing\.\.\.' : 'Оптимизация\.\.\.'/g, "t('optimizing')"],
  [
    /language === 'en' \? 'Click or drag photo here' : 'Нажмите или перетащите фото сюда'/g,
    "t('clickOrDragPhoto')",
  ],
  [
    /language === 'en' \? 'JPEG\/PNG will be auto-optimized' : 'JPEG\/PNG будут авто-оптимизированы'/g,
    "t('autoOptimizeHint')",
  ],
  [
    /language === 'en' \? 'Or paste an Image URL' : 'Или вставьте прямую ссылку на фото'/g,
    "t('orPasteImageUrl')",
  ],
  [
    /editingIns \? \(language === 'en' \? 'Save Updates' : 'Сохранить'\) : \(language === 'en' \? 'Add Coach' : 'Добавить'\)/g,
    "editingIns ? t('saveUpdates') : t('addCoachShort')",
  ],
  [/language === 'en' \? 'Cancel' : 'Отмена'/g, "t('cancel')"],
  [
    /language === 'en' \? 'Administrator Role Management' : 'Управление администраторами курорта'/g,
    "t('adminRoleManagementTitle')",
  ],
  [
    /language === 'en' \? 'Add, search, and remove administrative privileges for personnel' : 'Добавление, поиск и удаление административных прав сотрудников'/g,
    "t('adminRoleManagementSub')",
  ],
  [
    /language === 'en' \? 'Super Administrator Access Required' : 'Требуется доступ Главного Администратора'/g,
    "t('superAdminRequired')",
  ],
  [
    /language === 'en'\s*\n\s*\? 'Only the system owner \(gerasimchuk\.arseniy@gmail\.com\) is authorized to promote or demote other administrators\.'\s*\n\s*: 'Только владелец системы \(gerasimchuk\.arseniy@gmail\.com\) имеет право назначать и снимать других администраторов\.'/g,
    "t('superAdminRequiredDesc')",
  ],
  [
    /language === 'en' \? 'Current Administrators' : 'Действующие администраторы'/g,
    "t('currentAdministrators')",
  ],
  [
    /language === 'en' \? 'No other administrators found\.' : 'Другие администраторы не найдены\.'/g,
    "t('noAdministratorsFound')",
  ],
  [
    /title=\{language === 'en' \? 'Revoke Admin' : 'Снять статус админа'\}/g,
    "title={t('revokeAdmin')}",
  ],
  [
    /language === 'en' \? 'Appoint New Administrator' : 'Назначить нового администратора'/g,
    "t('appointNewAdmin')",
  ],
  [
    /language === 'en' \? 'Search for any registered user to promote them to admin\.' : 'Найдите любого зарегистрированного пользователя, чтобы повысить его до администратора\.'/g,
    "t('appointNewAdminSub')",
  ],
  [/language === 'en' \? 'User Not Found' : 'Пользователь не найден'/g, "t('userNotFound')"],
  [
    /language === 'en'\s*\n\s*\? 'The user with this email must be registered and have signed in at least once\.'\s*\n\s*: 'Пользователь с такой почтой должен зарегистрироваться и зайти в систему хотя бы раз\.'/g,
    "t('userNotFoundDesc')",
  ],
  [
    /placeholder=\{language === 'en' \? "Enter user's email address" : "Введите email пользователя"\}/g,
    "placeholder={t('enterUserEmail')}",
  ],
  [/language === 'en' \? 'Promote' : 'Назначить'/g, "t('promoteBtn')"],
  [
    /language === 'en' \? 'Quick Search & Select' : 'Быстрый поиск и выбор'/g,
    "t('quickSearchSelect')",
  ],
  [
    /placeholder=\{language === 'en' \? 'Filter by name or email\.\.\.' : 'Поиск по имени или почте\.\.\.'\}/g,
    "placeholder={t('filterNameEmail')}",
  ],
  [/language === 'en' \? 'Make Admin' : 'Сделать админом'/g, "t('makeAdmin')"],
  [
    /language === 'en' \? 'No registered regular users\.' : 'Нет зарегистрированных обычных пользователей\.'/g,
    "t('noRegularUsers')",
  ],
  [
    /language === 'en' \? 'System Error Logs' : 'Логи системных ошибок'/g,
    "t('systemErrorLogsTitle')",
  ],
  [
    /language === 'en'\s*\n\s*\? 'Review unhandled rejections, window exceptions, and Firestore permission errors'\s*\n\s*: 'Просмотр необработанных отклонений промисов, исключений и ошибок доступа Firestore'/g,
    "t('systemErrorLogsSub')",
  ],
  [/language === 'en' \? 'Clear All Logs' : 'Очистить все логи'/g, "t('clearAllLogs')"],
  [
    /placeholder=\{language === 'en' \? 'Search logs by message, email, url\.\.\.' : 'Поиск по сообщению, email, url\.\.\.'\}/g,
    "placeholder={t('searchLogsPlaceholder')}",
  ],
  [/language === 'en' \? 'All Sources' : 'Все источники'/g, "t('allSources')"],
  [/language === 'en' \? 'Global Window Error' : 'Глобальная ошибка'/g, "t('globalWindowError')"],
  [
    /language === 'en' \? 'Unhandled Promise Rejection' : 'Необработанный промис'/g,
    "t('unhandledRejection')",
  ],
  [
    /language === 'en' \? 'Loading error logs\.\.\.' : 'Загрузка логов ошибок\.\.\.'/g,
    "t('loadingErrorLogs')",
  ],
  [
    /language === 'en' \? 'No error logs found matching filters\.' : 'Логи ошибок по заданным фильтрам не найдены\.'/g,
    "t('noErrorLogsMatch')",
  ],
  [/title=\{language === 'en' \? 'Delete log' : 'Удалить лог'\}/g, "title={t('deleteLog')}"],
  [/language === 'en' \? 'User:' : 'Пользователь:'/g, "t('userLabelColon')"],
  [/language === 'en' \? 'Op:' : 'Оп:'/g, "t('opLabelColon')"],
  [/language === 'en' \? 'Path:' : 'Путь:'/g, "t('pathLabelColon')"],
  [/language === 'en' \? 'Stack Trace:' : 'Трассировка стека:'/g, "t('stackTraceLabel')"],
  [
    /language === 'en' \? 'Client Environment details:' : 'Детали окружения клиента:'/g,
    "t('clientEnvDetails')",
  ],
];

for (const [re, rep] of pairs) {
  content = content.replace(re, rep);
}

// Dynamic / notification handlers
content = content.replace(
  /addNotification\('success', language === 'en' \? 'Log Deleted' : 'Лог удален', language === 'en' \? 'The error log has been removed\.' : 'Запись об ошибке удалена\.'\);/g,
  "addNotification('success', t('logDeleted'), t('logDeletedDesc'));"
);

content = content.replace(
  /const confirmMsg = language === 'en'\s*\n\s*\? 'Are you sure you want to clear all error logs\?'\s*\n\s*: 'Вы уверены, что хотите удалить все логи ошибок\?';/g,
  "const confirmMsg = t('clearLogsConfirm');"
);

content = content.replace(
  /addNotification\('success', language === 'en' \? 'Logs Cleared' : 'Логи очищены', language === 'en' \? 'All error logs have been deleted\.' : 'Все логи ошибок успешно удалены\.'\);/g,
  "addNotification('success', t('logsCleared'), t('logsClearedDesc'));"
);

content = content.replace(
  /addNotification\('warning', language === 'en' \? 'Missing Details' : 'Не все поля заполнены', language === 'en' \? 'Please complete the instructor profile form\.' : 'Пожалуйста, заполните всю форму профиля инструктора\.'\);/g,
  "addNotification('warning', t('missingDetails'), t('completeInstructorForm'));"
);

content = content.replace(
  /addNotification\('success', language === 'en' \? 'Coach Profile Updated' : 'Профиль тренера обновлен', language === 'en' \? `\$\{name\}'s information has been fully synced\.` : `Информация о \$\{name\} успешно синхронизирована\.`\);/g,
  "addNotification('success', t('coachProfileUpdated'), `${name} ${t('coachInfoSyncedSuffix')}`);"
);

content = content.replace(
  /addNotification\('success', language === 'en' \? 'New Coach Added' : 'Добавлен новый тренер', language === 'en' \? `\$\{name\} joined Carve Academy team!` : `\$\{name\} добавлен в команду Академии Карвинга!`\);/g,
  "addNotification('success', t('newCoachAdded'), `${name} ${t('coachJoinedSuffix')}`);"
);

content = content.replace(
  /addNotification\('error', 'Sync Failed', language === 'en' \? 'An error occurred while updating instructors directory\.' : 'Произошла ошибка при обновлении каталога\.'\);/g,
  "addNotification('error', t('syncFailed'), t('syncFailedDesc'));"
);

content = content.replace(
  /language === 'en' \? 'Cannot Make Unavailable' : 'Невозможно сделать недоступным'/g,
  "t('cannotMakeUnavailable')"
);

content = content.replace(
  /const isAvailStr = updated\.isAvailable \? \(language === 'en' \? 'available' : 'доступен'\) : \(language === 'en' \? 'unavailable' : 'недоступен'\);\s*\n\s*addNotification\('info', language === 'en' \? 'Status Updated' : 'Статус обновлен', `\$\{ins\.name\} \$\{language === 'en' \? 'is now' : 'теперь'\} \$\{isAvailStr\}\.`\);/g,
  "const isAvailStr = updated.isAvailable ? t('availableWord') : t('unavailableWord');\n      addNotification('info', t('statusUpdated'), `${ins.name} ${t('isNowWord')} ${isAvailStr}.`);"
);

content = content.replace(
  /addNotification\('error', language === 'en' \? 'Status Toggle Failed' : 'Ошибка изменения статуса', language === 'en' \? 'Could not sync availability status\.' : 'Не удалось синхронизировать статус\.'\);/g,
  "addNotification('error', t('statusToggleFailed'), t('couldNotSyncAvailability'));"
);

content = content.replace(
  /const confirmMsg = language === 'en' \s*\n\s*\? `Are you absolutely sure you want to remove \$\{ins\.name\} from Carve Academy roster\?`\s*\n\s*: `Вы абсолютно уверены, что хотите удалить \$\{ins\.name\} из команды Академии Карвинга\?`;/g,
  "const confirmMsg = `${t('deleteInstructorConfirmPrefix')} ${ins.name} ${t('deleteInstructorConfirmSuffix')}`;"
);

content = content.replace(
  /addNotification\('success', language === 'en' \? 'Instructor Deleted' : 'Инструктор удален', language === 'en' \? `\$\{ins\.name\} removed successfully\.` : `\$\{ins\.name\} успешно удален\.`\);/g,
  "addNotification('success', t('instructorDeleted'), `${ins.name} ${t('instructorRemovedSuffix')}`);"
);

content = content.replace(
  /addNotification\('error', 'Deletion Failed', language === 'en' \? 'Failed to remove instructor\.' : 'Не удалось удалить инструктора\.'\);/g,
  "addNotification('error', t('deletionFailed'), t('deleteInstructorFailed'));"
);

content = content.replace(
  /\? \(language === 'en' \? `Edit Profile: \$\{editingIns\.name\}` : `Редактирование: \$\{editingIns\.name\}`\) \s*\n\s*: \(language === 'en' \? 'Register New Coach' : 'Зарегистрировать тренера'\)/g,
  "? `${t('editProfilePrefix')} ${editingIns.name}`\n                    : t('registerNewCoach')"
);

content = content.replace(
  /const confirmMsg = language === 'en'\s*\n\s*\? `Are you sure you want to remove admin privileges from \$\{u\.email\}\?`\s*\n\s*: `Вы уверены, что хотите снять права администратора с \$\{u\.email\}\?`;/g,
  "const confirmMsg = `${t('revokeAdminConfirmPrefix')} ${u.email}?`;"
);

content = content.replace(
  /language === 'en' \s*\n\s*\? `Showing \$\{filteredLogs\.length\} of \$\{errorLogs\.length\} logs` \s*\n\s*: `Показано \$\{filteredLogs\.length\} из \$\{errorLogs\.length\} логов`/g,
  "`${t('logsShowingPrefix')} ${filteredLogs.length} ${t('logsShowingOf')} ${errorLogs.length} ${t('logsShowingSuffix')}`"
);

content = content.replace(/\|\| 'Unnamed User'/g, "|| t('unnamedUser')");
content = content.replace(/\|\| 'User'/g, "|| t('userRole')");

fs.writeFileSync(path, content);
const remaining = (content.match(/language === 'en'/g) || []).length;
console.log('Localized AdminPanel, remaining language checks:', remaining);
