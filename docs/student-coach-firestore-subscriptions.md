# Подписки «Связь с инструктором»: аудит и результат

Дата: 2026-11-06. Ветка: `feat/perf-student-coach-firestore-subscriptions`.

## Методика и baseline

До изменения production-кода выполнен `studentCoachSubscriptions.test.tsx`:
9 тестов PASS с исходными ожиданиями 0/3/3/3/0/3. Стенд монтирует настоящий
`StudentCoachPanel` и настоящий `useInstructorBookingMessages`, подменяя
`subscribeToChatMessages` счётчиком регистрации/отписки. Три разрешённых занятия
одного инструктора дают три разных thread ID. Общие stores, доступ и история
заданий подменены; это измерение добавочных подписок панели, а не всего кабинета.
После исправления тот же стенд проверяет новые ожидания и lifecycle.

| Сценарий                                | Активные listeners панели до → после | Регистрации message query при открытии до → после | Полученные документы / оплачиваемые reads                |
| --------------------------------------- | -----------------------------------: | ------------------------------------------------: | -------------------------------------------------------- |
| Список инструкторов                     |                                0 → 0 |                                             0 → 0 | Не измерялись для всего кабинета                         |
| Чат, список занятий                     |                                3 → 0 |                                             3 → 0 | После: 0 результатов сообщений панели                    |
| Видео                                   |                                3 → 3 |                                             3 → 3 | Окно до 100 документов на thread, без изменения          |
| Комментарии                             |                                3 → 0 |                                             3 → 0 | После: 0 результатов сообщений панели                    |
| Домашние задания                        |                                0 → 0 |                                             0 → 0 | Отдельные `getDocs`, до 20 документов на страницу/thread |
| Рекомендации                            |                                3 → 0 |                                             3 → 0 | После: 0 результатов сообщений панели                    |
| Выход из видео в любой другой подраздел |                                3 → 0 |                                                 — | После cleanup: 0 активных listeners панели               |
| Размонтирование                         |                  0 → 0 после cleanup |                                                 — | Запоздалые callbacks игнорируются                        |

Количество регистрации listeners не равно оплачиваемым reads. До оптимизации
документы на настоящем пользовательском аккаунте не измерялись; экономия в reads
или процентах не заявляется. Для N уникальных доступных threads устраняется N
добавочных message queries в чате/комментариях/рекомендациях. Верхняя граница
первого окна — 100N результатов; это оценка по query, а не измерение billing.

Отдельный Firestore Emulator тест использует настоящий `chatService`, настоящий
`onSnapshot` и клиент с Rules-аутентификацией. Из 105 сообщений возвращается ровно
100; новая запись появляется realtime в том же окне. После отписки контрольный
активный listener подтверждает получение следующей записи, старый callback не
вызывается. Чужой аккаунт и неавторизованный клиент получают отказ. Это измерение
результатов сервиса, не браузерного UX или стоимости production Firestore.

## Источники и владельцы данных

- `StudentCoachPanel` использует уже переданные бронирования, курсы, инструкторов
  и выбранный Participant. `getInstructorMessageThreadIds` включает lesson threads
  и оба совместимых course thread ID, дедуплицирует их. Эти пути не изменены.
- `useInstructorBookingMessages` раньше включался во всех подразделах кроме списка
  и заданий. Реальный потребитель — `getInstructorVideoMessages`. Список чатов
  использует бронирования; `onChat` передаёт выбранное занятие обратно контейнеру.
- `subscribeToChatMessages`: `bookings/{threadId}/messages`,
  `orderBy(timestamp, desc)`, `limit(100)`, один `onSnapshot` на thread; `getDocs`
  и общий кеш здесь отсутствуют. Возвращённую отписку вызывает владелец хука.
- `BookingChatModal` самостоятельно подписывается через тот же сервис на
  `getCourseChatThreadIds(booking)`. Его realtime, выбор занятия и cleanup не изменены.
- Внешний `PersonalCabinet/useBookingChatUnread` сохраняет подписку на каждый
  уникальный thread незавершённого отменой watch plan ради индикатора непрочитанного.
  Его владелец — кабинет; он не размонтируется при смене подраздела. Если B — число
  этих listeners, суммарная message-нагрузка без открытого модального чата равна
  B плюс значение панели из таблицы. У модального чата собственные listeners.
  Это существующее совместное потребление; глобальный менеджер не добавлялся.
- `CoachParticipantAccessPanel` в списке обеспечивает авторизованный доступ и
  блокировки через `ensureParticipantAccessRead` для пары Participant/Instructor.
  Cached query status и in-flight coordination предотвращают повторные загрузки;
  `useManagedParticipants` разделяет account-scoped store/in-flight bootstrap.
  Это canonical callable reads, а не подписки на сообщения.
- `useSelectedParticipantLessonStats` — селектор общего account store, без
  Firestore-подписок. Внешний sync использует TTL 30 секунд при активации и общий
  in-flight запрос; это не периодический polling. Существующий drain `account_hot`
  и `account_history` проходит всю историю страницами по 25 (server lookahead +1).
  Этот drain остаётся за рамками локального исправления.
- Комментарии: shell включает `useCoachParticipantProgress` только на открытой
  comments surface; canonical `queryManagedParticipantProgressReadModels` запрашивает
  выбранный Participant, store даёт текущие `skillComments/skillScores`, есть
  loading/error/retry. `getUnattributedSkillComments` честно не приписывает автора.
  Текущий источник не содержит историю отдельных комментариев, дат и подтверждённых
  авторов. Добавление истории — отдельная domain-задача, здесь модель не менялась.
- Задания: `useInstructorHomeworkHistory/createHomeworkHistory/getHomeworkPage`:
  `where(isHomework == true)`, timestamp + document ID descending, cursor,
  `limit(20)`. K-way merge читает головы всех threads для правильного порядка,
  максимум четыре параллельных запроса; выдаёт до 20 записей за шаг. При исчерпании
  buffer возможны дополнительные page reads в том же шаге. Кеш/buffers живут в
  текущей сессии pager; при повторном открытии загрузка начинается заново.
  Listeners и фонового drain всей истории нет. Механизм не изменён.
- Рекомендации: `usePresentedParticipantLessonFeedback` читает store без Firestore.
  Shell `useSelectedParticipantLessonFeedback` загружает canonical feedback при
  смене account/Participant; managed history ограничена 50 записями. Completion
  остаётся canonical command с последующим refresh/reconciliation и pending state.
  При переключении подразделов новый message consumer здесь не появляется.
- `ChatMedia` загружает видео по запросу пользователя через авторизованный
  `bookingChatMedia`, очищает Blob URL и отменяет запрос при cleanup. Это не
  `onSnapshot/getDocs`; поведение вложений не менялось.

## Минимальное исправление и lifecycle

Подписки панели включены только для `videos`. Query/лимит и фильтрация видео
сохранены: инструктор, text, attachment, booking/thread, исключение homework.
Индекса по `attachmentType + timestamp` в репозитории нет. Отдельная выборка
потребовала бы нового индекса и поменяла бы семантику существующего окна;
для этого slice достаточно устранить подтверждённые лишние queries.
Существующее ограничение: видео старше последних 100 сообщений thread может
не отображаться. Оно не устранено и не ухудшено; полнота архивного видео здесь
не заявляется.

Хук сохраняет однопараметрический вызов и `{ messages, loading }`, дополнительно
принимает scope account/Participant/Instructor и возвращает error/retry.
JSON key содержит отсортированные уникальные ID, scope и номер попытки; равные
массивы не пересоздают listeners. Смена key скрывает старые данные уже на render,
затем cleanup отменяет старую сессию и все её подписки. Поздние success/error
callbacks игнорируются, включая возврат к прежнему scope и StrictMode.
Входящие массивы не мутируются. Ошибка отмечает завершение загрузки thread,
показывает локализованный alert/retry; удачные результаты других threads сохраняются.
Retry очищает прежние listeners и повторно подписывает текущий набор.

Participant scoping бронирований остаётся в shell (`isolatedLegacyBookings` и
Participant-keyed remount). Дополнительный scope защищает и одинаковые shared
thread IDs при смене Participant. Клиентский gate не заменяет серверные Rules;
источники авторизации, ownership, блокировки и storage paths не менялись.

## Проверки и ограничения

- PASS: 211 unit-тестов в 9 затронутых/связанных файлах; новый стенд содержит
  18 сценариев, включая 200 занятий, несколько threads, быстрые переключения,
  возврат, reopen/unmount, scope, stale callbacks, error/retry, StrictMode, RU/EN.
- PASS: 4 integration-теста в Firestore Emulator: message realtime/window/denial/
  unsubscribe и существующая homework pagination/authorization.
- PASS: TypeScript (`npx tsc --noEmit`), targeted ESLint и Prettier.
- PASS: итоговый `git diff --check`; посторонних изменений нет.
- PASS: `graphify update .` — 16154 nodes, 46785 edges. CLI сообщил о смене
  communities и автоматически переименовал 218 групп по hub; LLM-переразметка
  имён не выполнялась. Код остаётся источником истины.
- PASS: `npm run test:manifest`, `npm run test:manifest:unit` (28 tests).
- PASS: независимое ревью production diff; замечание о синхронизации теста
  unsubscribe исправлено, emulator-проверки повторены успешно.
- Браузерный сценарий с авторизованным учеником не запускался:
  `AUTHENTICATED WORKFLOW: NOT VERIFIED`. Переход в чат проверен компонентным
  тестом, его message service — эмулятором; полный UI переписки не проверялся E2E.
- Первый sandbox-запуск emulator завершился timeout hub port 4400 до тестов.
  Повторный запуск вне sandbox прошёл; assertions PASS и wrapper exit code 0.

Deploy impact: Hosting YES; Functions NO; Rules NO; Indexes NO; Migration NO;
Settings NO; Schedulers/triggers NO. Commit/push/merge/deploy не выполнялись.
