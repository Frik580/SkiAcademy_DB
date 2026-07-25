import fs from 'fs';

const adminPath = 'src/components/AdminPanel.tsx';
const lines = fs.readFileSync(adminPath, 'utf8').split(/\r?\n/);

function applyTReplacements(content) {
  const pairs = [
    [
      /language === 'en' \? 'Active Bookings Monitor' : 'Монитор активных бронирований'/g,
      "t('activeBookingsMonitor')",
    ],
    [
      /language === 'en' \? 'Monitor and control individual skier bookings' : 'Контролируйте и управляйте бронированиями индивидуальных лыжников'/g,
      "t('bookingsLogsSub')",
    ],
    [
      /placeholder=\{language === 'en' \? 'Search bookings\.\.\.' : 'Поиск бронирований\.\.\.'\}/g,
      "placeholder={t('searchBookingsPlaceholder')}",
    ],
    [/language === 'en' \? 'All Statuses' : 'Все статусы'/g, "t('allStatuses')"],
    [/language === 'en' \? 'Pending' : 'Ожидающие'/g, "t('pendingStatus')"],
    [
      /language === 'en' \? 'Pending Cancellation' : 'Ожидающие отмены'/g,
      "t('pendingCancellationStatus')",
    ],
    [/language === 'en' \? 'Confirmed' : 'Подтвержденные'/g, "t('confirmedStatus')"],
    [/language === 'en' \? 'Completed' : 'Завершенные'/g, "t('completedStatus')"],
    [/language === 'en' \? 'Cancelled' : 'Отмененные'/g, "t('cancelledStatus')"],
    [/language === 'en' \? 'All Instructors' : 'Все инструкторы'/g, "t('allInstructorsFilter')"],
    [/language === 'en' \? 'All Clients' : 'Все клиенты'/g, "t('allClientsFilter')"],
    [/language === 'en' \? 'Date: Newest' : 'Дата: сначала новые'/g, "t('sortDateNewest')"],
    [/language === 'en' \? 'Date: Oldest' : 'Дата: сначала старые'/g, "t('sortDateOldest')"],
    [/language === 'en' \? 'Client: A-Z' : 'Имя: А-Я'/g, "t('sortClientAZ')"],
    [/language === 'en' \? 'Client: Z-A' : 'Имя: Я-А'/g, "t('sortClientZA')"],
    [/language === 'en' \? 'Reset Filters' : 'Сбросить фильтры'/g, "t('resetFilters')"],
    [/language === 'en' \? 'Booking ID' : 'ID Бронирования'/g, "t('bookingId')"],
    [/language === 'en' \? 'Client' : 'Клиент'/g, "t('skierLabel')"],
    [/language === 'en' \? 'Instructor' : 'Инструктор'/g, "t('coachLabel')"],
    [/language === 'en' \? 'Date\/Time' : 'Дата\/Время'/g, "t('dateTimeColumn')"],
    [/language === 'en' \? 'Fee' : 'Стоимость'/g, "t('feeColumn')"],
    [/language === 'en' \? 'Status' : 'Статус'/g, "t('statusLabel')"],
    [/language === 'en' \? 'Approval Actions' : 'Одобрение'/g, "t('approvalActions')"],
    [
      /language === 'en' \? 'No scheduled sessions recorded\.' : 'Запланированных уроков пока нет\.'/g,
      "t('noScheduledSessions')",
    ],
    [
      /language === 'en' \? 'No bookings match your filter criteria\.' : 'Занятий по выбранным фильтрам не найдено\.'/g,
      "t('noBookingsMatchFilter')",
    ],
    [/language === 'en' \? 'Reason: ' : 'Причина: '/g, "t('reasonPrefix') "],
    [/language === 'en' \? 'Approve Cancellation' : 'Одобрить отмену'/g, "t('approveCancel')"],
    [/language === 'en' \? 'Reject Request' : 'Отклонить запрос'/g, "t('rejectRequest')"],
    [/language === 'en' \? 'Approve Cancel' : 'Одобрить отмену'/g, "t('approveCancel')"],
    [/language === 'en' \? 'Decline' : 'Отклонить'/g, "t('decline')"],
    [/language === 'en' \? 'Complete' : 'Завершить'/g, "t('completeBtn')"],
    [/language === 'en' \? 'Cancel' : 'Отменить'/g, "t('cancel')"],
    [/language === 'en' \? 'Cancelled' : 'Отменено'/g, "t('cancelledLabel')"],
    [/language === 'en' \? 'Finished' : 'Завершено'/g, "t('finishedLabel')"],
    [
      /language === 'en' \? 'Client Database Management' : 'Управление базой клиентов'/g,
      "t('clientDatabaseTitle')",
    ],
    [
      /language === 'en' \? 'View and update client profiles, adjust user wallet balances' : 'Просмотр и редактирование профилей клиентов, управление балансом кошельков'/g,
      "t('clientDatabaseSub')",
    ],
    [/language === 'en' \? 'Close Form' : 'Закрыть форму'/g, "t('closeForm')"],
    [
      /language === 'en' \? 'Register New Client' : 'Зарегистрировать нового клиента'/g,
      "t('registerNewClient')",
    ],
    [
      /placeholder=\{language === 'en' \? 'Search clients\.\.\.' : 'Поиск клиентов\.\.\.'\}/g,
      "placeholder={t('searchClientsPlaceholder')}",
    ],
    [/language === 'en' \? 'Contact details' : 'Контактные данные'/g, "t('contactDetails')"],
    [/language === 'en' \? 'Wallet Balance' : 'Баланс счета'/g, "t('walletBalance')"],
    [/language === 'en' \? 'Role' : 'Роль'/g, "t('roleLabel')"],
    [/language === 'en' \? 'Actions' : 'Действия'/g, "t('actions')"],
    [/language === 'en' \? 'You' : 'Вы'/g, "t('youBadge')"],
    [/language === 'en' \? 'No phone specified' : 'Телефон не указан'/g, "t('noPhoneSpecified')"],
    [/language === 'en' \? 'Admin' : 'Администратор'/g, "t('adminRole')"],
    [/language === 'en' \? 'User' : 'Пользователь'/g, "t('userRole')"],
    [/language === 'en' \? 'Instructor' : 'Инструктор'/g, "t('coachLabel')"],
    [/language === 'en' \? 'Edit client' : 'Редактировать клиента'/g, "t('editClient')"],
    [/language === 'en' \? 'Delete client' : 'Удалить клиента'/g, "t('deleteClient')"],
    [/language === 'en' \? 'Cannot delete self' : 'Нельзя удалить себя'/g, "t('cannotDeleteSelf')"],
    [
      /language === 'en' \? 'No clients found in the database\.' : 'Клиенты в базе данных не найдены\.'/g,
      "t('noClientsFound')",
    ],
    [/language === 'en' \? 'Edit Profile' : 'Редактирование профиля'/g, "t('editProfile')"],
    [/language === 'en' \? 'New Client' : 'Регистрация клиента'/g, "t('newClientRegistration')"],
    [/language === 'en' \? 'Display Name' : 'Имя пользователя'/g, "t('fullName')"],
    [/language === 'en' \? 'Email Address' : 'Электронная почта'/g, "t('emailAddress')"],
    [
      /language === 'en' \? 'Phone Number \(Optional\)' : 'Номер телефона \(Необязательно\)'/g,
      "t('phoneOptional')",
    ],
    [
      /language === 'en' \? 'Starting Balance \(USD\)' : 'Стартовый баланс \(USD\)'/g,
      "t('startingBalance')",
    ],
    [/language === 'en' \? 'Access Role' : 'Роль доступа'/g, "t('accessRole')"],
    [
      /language === 'en' \? 'User \(Regular Client\)' : 'Пользователь \(Обычный клиент\)'/g,
      "t('userRegularClient')",
    ],
    [
      /language === 'en' \? 'Admin \(Resort Manager\)' : 'Администратор \(Менеджер курорта\)'/g,
      "t('adminResortManager')",
    ],
    [
      /language === 'en' \? 'Instructor Status \(Grants panel access\)' : 'Статус инструктора \(Доступ к панели\)'/g,
      "t('instructorStatusGrant')",
    ],
    [
      /language === 'en' \? 'Cabinet Access Enabled' : 'Доступ к кабинету включен'/g,
      "t('cabinetAccessEnabled')",
    ],
    [/language === 'en' \? 'Update Profile' : 'Обновить профиль'/g, "t('updateProfile')"],
    [/language === 'en' \? 'Create Client' : 'Создать клиента'/g, "t('createClient')"],
    [
      /language === 'en' \? 'Please enter name and email\.' : 'Пожалуйста, укажите имя и email\.'/g,
      "t('enterNameAndEmail')",
    ],
    [
      /language === 'en' \? 'Failed to save client profile\.' : 'Не удалось сохранить профиль клиента\.'/g,
      "t('saveClientFailed')",
    ],
    [/language === 'en' \? 'Deletion Failed' : 'Ошибка удаления'/g, "t('deletionFailed')"],
    [
      /language === 'en' \? 'Failed to remove client\.' : 'Не удалось удалить клиента\.'/g,
      "t('deleteClientFailed')",
    ],
    [/language === 'en' \? 'Administrator' : 'Администратор'/g, "t('administratorLabel')"],
    [/language === 'en' \? ' English' : 'Русский'/g, "t('englishLang')"],
  ];
  let out = content;
  for (const [re, rep] of pairs) out = out.replace(re, rep);
  out = out.replace(
    /language === 'en'\s*\n\s*\? `Found \$\{filteredBookings\.length\} matching entries`\s*\n\s*: `Найдено \$\{filteredBookings\.length\} совпадений`/g,
    "`${t('foundMatchingPrefix')} ${filteredBookings.length} ${t('foundMatchingSuffix')}`"
  );
  out = out.replace(
    /language === 'en'\s*\n\s*\? `Page \$\{monitorPage\} of \$\{monitorTotalPages\} \(\$\{filteredBookings\.length\} total\)`\s*\n\s*: `Страница \$\{monitorPage\} из \$\{monitorTotalPages\} \(всего \$\{filteredBookings\.length\}\)`/g,
    "`${t('pagePrefix')} ${monitorPage} ${t('pageOf')} ${monitorTotalPages} (${filteredBookings.length} ${t('totalSuffix')})`"
  );
  out = out.replace(
    /language === 'en'\s*\n\s*\? 'Approve client cancellation request and process the full refund\?'\s*\n\s*: 'Одобрить запрос клиента на отмену занятия и вернуть полную стоимость\?'/g,
    "t('approveCancelConfirm')"
  );
  out = out.replace(
    /language === 'en'\s*\n\s*\? 'Decline client cancellation request and keep the booking confirmed\?'\s*\n\s*: 'Отклонить запрос на отмену и оставить бронирование подтвержденным\?'/g,
    "t('declineCancelConfirm')"
  );
  out = out.replace(
    /const confirmMsg = language === 'en'\s*\n\s*\? `Are you absolutely sure you want to delete client \$\{u\.displayName\} \(\$\{u\.email\}\)\?`\s*\n\s*: `Вы абсолютно уверены, что хотите удалить клиента \$\{u\.displayName\} \(\$\{u\.email\}\)\?`;/g,
    "const confirmMsg = `${t('deleteClientConfirmPrefix')} ${u.displayName} (${u.email})?`;"
  );
  out = out.replace(/'Unnamed client'/g, "t('unnamedClient')");
  out = out.replace(
    /title=\{language === 'en' \? 'Previous Page' : 'Предыдущая страница'\}/g,
    "title={t('previousPage')}"
  );
  out = out.replace(
    /title=\{language === 'en' \? 'Next Page' : 'Следующая страница'\}/g,
    "title={t('nextPage')}"
  );
  out = out.replace(
    /client\?\.displayName \|\| \(language === 'en' \? 'Client' : 'Клиент'\)/g,
    "client?.displayName || t('skierLabel')"
  );
  out = out.replace(/onRequestConfirm/g, 'onRequestConfirm');
  out = out.replace(/setConfirmModal\(\{/g, 'onRequestConfirm(');
  out = out.replace(/message: (t\('[^']+'\)|`[^`]+`|t\([^)]+\)),\s*\n\s*onConfirm:/g, '$1, ');
  // Fix setConfirmModal -> onRequestConfirm pattern manually in post-process
  return out;
}

// --- BookingsLog ---
const bookingsHeader = `import React, { useState, useMemo, useEffect } from 'react';
import { Search, Check, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { Booking, UserProfile, Instructor } from '../../types';
import { useLanguage, getBookingStatusLabel } from '../../lib/LanguageContext';

interface BookingsLogProps {
  bookings: Booking[];
  usersList: UserProfile[];
  instructors: Instructor[];
  onConfirmBooking: (id: string) => Promise<void>;
  onCompleteBooking?: (id: string) => Promise<void>;
  onCancelBooking: (id: string) => Promise<void>;
  onRequestConfirm: (message: string, onConfirm: () => void | Promise<void>) => void;
}

export const BookingsLog: React.FC<BookingsLogProps> = ({
  bookings,
  usersList,
  instructors,
  onConfirmBooking,
  onCompleteBooking,
  onCancelBooking,
  onRequestConfirm,
}) => {
  const { t, language } = useLanguage();

  const [monitorSearch, setMonitorSearch] = useState('');
  const [monitorStatusFilter, setMonitorStatusFilter] = useState<'all' | 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'pending_cancellation'>('all');
  const [monitorInstructorFilter, setMonitorInstructorFilter] = useState('all');
  const [monitorClientFilter, setMonitorClientFilter] = useState('all');
  const [monitorSortBy, setMonitorSortBy] = useState<'date_desc' | 'date_asc' | 'client_asc' | 'client_desc'>('date_desc');
  const [monitorPage, setMonitorPage] = useState(1);

  useEffect(() => {
    setMonitorPage(1);
  }, [monitorSearch, monitorStatusFilter, monitorInstructorFilter, monitorClientFilter, monitorSortBy]);

`;

const bookingsLogic = lines.slice(1208, 1255).join('\n');
const bookingsJsx = lines
  .slice(1560, 1842)
  .join('\n')
  .replace(/setConfirmModal\(\{\s*\n\s*message: /g, 'onRequestConfirm(')
  .replace(/,\s*\n\s*onConfirm: async \(\) => \{/g, ', async () => {')
  .replace(/\}\s*\n\s*\}\);/g, '});\n                                });')
  .replace(/\}\);\s*\n\s*\}\);/g, '});');

let bookingsContent =
  bookingsHeader + bookingsLogic + '\n  return (\n' + bookingsJsx + '\n  );\n};\n';
bookingsContent = applyTReplacements(bookingsContent);
// Fix broken onRequestConfirm from replace
bookingsContent = bookingsContent.replace(
  /onRequestConfirm\(\s*\n\s*(t\('[^']+'\)|`[^`]+`),\s*\n\s*async \(\) => \{/g,
  'onRequestConfirm($1, async () => {'
);
bookingsContent = bookingsContent.replace(/\}\);\s*\n\s*\}\);/g, '});');

fs.writeFileSync('src/components/admin/BookingsLog.tsx', bookingsContent);

// --- ClientsManager ---
const clientsHeader = `import React, { useState } from 'react';
import { Search, Plus, X, Edit2, Trash2, DollarSign, Check, Loader2 } from 'lucide-react';
import { UserProfile, Instructor } from '../../types';
import { useLanguage } from '../../lib/LanguageContext';
import { useNotifications } from '../PushNotificationHub';

interface ClientsManagerProps {
  usersList: UserProfile[];
  instructors: Instructor[];
  currentUserEmail: string;
  onAddUser?: (user: UserProfile) => Promise<void>;
  onUpdateUser?: (user: UserProfile) => Promise<void>;
  onDeleteUser?: (uid: string) => Promise<void>;
  onAddInstructor: (ins: Instructor) => Promise<void>;
  onUpdateInstructor: (ins: Instructor) => Promise<void>;
  onDeleteInstructor: (id: string) => Promise<void>;
  onRequestConfirm: (message: string, onConfirm: () => void | Promise<void>) => void;
}

export const ClientsManager: React.FC<ClientsManagerProps> = ({
  usersList,
  instructors,
  currentUserEmail,
  onAddUser,
  onUpdateUser,
  onDeleteUser,
  onAddInstructor,
  onUpdateInstructor,
  onDeleteInstructor,
  onRequestConfirm,
}) => {
  const { t, language } = useLanguage();
  const { addNotification } = useNotifications();

`;

const clientsState = lines.slice(515, 528).join('\n');
let clientsHandlers = lines.slice(610, 713).join('\n') + '\n' + lines.slice(1049, 1082).join('\n');
clientsHandlers = clientsHandlers.replace(/setConfirmModal\(\{/g, 'onRequestConfirm(');
clientsHandlers = clientsHandlers.replace(/message: /g, '');
clientsHandlers = clientsHandlers.replace(/onConfirm: async \(\) => \{/g, 'async () => {');
clientsHandlers = clientsHandlers.replace(/\}\s*\n\s*\}\);/g, '});');

const isSuperAdminLine =
  "  const isSuperAdmin = currentUserEmail.toLowerCase() === 'gerasimchuk.arseniy@gmail.com';\n";
const clientsJsx = lines.slice(1843, 2155).join('\n');

let clientsContent =
  clientsHeader +
  clientsState +
  '\n' +
  isSuperAdminLine +
  '\n' +
  clientsHandlers +
  '\n  return (\n' +
  clientsJsx +
  '\n  );\n};\n';
clientsContent = applyTReplacements(clientsContent);
clientsContent = clientsContent.replace(/onRequestConfirm\(\s*\n\s*`/g, 'onRequestConfirm(`');
clientsContent = clientsContent.replace(/onRequestConfirm\(\s*\n\s*t\('/g, "onRequestConfirm(t('");
clientsContent = clientsContent.replace(
  /languages: \[language === 'en' \? 'English' : 'Русский'\]/g,
  "languages: [language === 'en' ? 'English' : 'Russian']"
);
clientsContent = clientsContent.replace(
  /bio: language === 'en'[\s\S]*?: `Профессиональный инструктор по лыжам и сноуборду, сертифицированный тренер\.`,/g,
  "bio: t('defaultInstructorBio'),"
);

fs.writeFileSync('src/components/admin/ClientsManager.tsx', clientsContent);

// --- Patch AdminPanel ---
const partBeforeBookings = lines.slice(0, 530);
const partBetween = lines.slice(540, 1208);
const partAfterClients = lines.slice(2155);

const bookingsComponent = `      <BookingsLog
        bookings={bookings}
        usersList={usersList}
        instructors={instructors}
        onConfirmBooking={onConfirmBooking}
        onCompleteBooking={onCompleteBooking}
        onCancelBooking={onCancelBooking}
        onRequestConfirm={(message, onConfirm) => setConfirmModal({ message, onConfirm })}
      />`;

const clientsComponent = `      <ClientsManager
        usersList={usersList}
        instructors={instructors}
        currentUserEmail={currentUserEmail}
        onAddUser={onAddUser}
        onUpdateUser={onUpdateUser}
        onDeleteUser={onDeleteUser}
        onAddInstructor={onAddInstructor}
        onUpdateInstructor={onUpdateInstructor}
        onDeleteInstructor={onDeleteInstructor}
        onRequestConfirm={(message, onConfirm) => setConfirmModal({ message, onConfirm })}
      />`;

let newAdmin = [
  ...partBeforeBookings,
  ...partBetween,
  bookingsComponent,
  clientsComponent,
  ...partAfterClients,
].join('\n');

newAdmin = newAdmin.replace(
  "import { ScheduleCalendar } from './admin/ScheduleCalendar';",
  "import { ScheduleCalendar } from './admin/ScheduleCalendar';\nimport { BookingsLog } from './admin/BookingsLog';\nimport { ClientsManager } from './admin/ClientsManager';"
);

newAdmin = applyTReplacements(newAdmin);
newAdmin = newAdmin.replace(
  /displayName: language === 'en' \? 'Administrator' : 'Администратор'/g,
  "displayName: t('administratorLabel')"
);
newAdmin = newAdmin.replace(
  /language === 'en' \? 'Confirm Action' : 'Подтверждение'/g,
  "t('confirmAction')"
);
newAdmin = newAdmin.replace(/language === 'en' \? 'Confirm' : 'Подтвердить'/g, "t('confirm')");

fs.writeFileSync(adminPath, newAdmin);
console.log('Extracted BookingsLog and ClientsManager, patched AdminPanel');
