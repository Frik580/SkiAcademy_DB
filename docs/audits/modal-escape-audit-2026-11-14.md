# Аудит Escape и доступности модальных окон — 14 ноября 2026

Статус реализации: DONE. Commit, push, merge и deploy не выполнялись.

## Причины

1. После CA-05 общий механизм применялся к AdminModal и части публичных окон. Остальные порталы/оверлеи использовали только BodyScrollLock либо вообще не регистрировали модальную поверхность: Escape, focus trap и inert отсутствовали.
2. InstructorBlockAction имел отдельный keyboard trap и восстановление фокуса, не участвовал в общем стеке.
3. BookingAppleSelect/BookingAppleDatePicker слушали document без поглощения Escape. Родительский обработчик мог сработать раньше. WheelPicker использовал отдельный capture listener.
4. DisabledOptionTooltip поглощал Escape даже после скрытия подсказки.
5. Изоляция фона учитывала только прямых детей body; этого недостаточно для мобильной панели Admin Issues внутри страницы.
6. При одновременном монтировании вложенных окон child-first layout effects инвертировали стек. После исправления порядка также потребовалось сохранять исходный opener цепочки для родителя.

## Реестр поверхностей

Все пути ниже относятся к `src/`. «Проверено исходниками» означает инвентаризацию и проверку используемой оболочки; это не утверждение об E2E каждой административной операции.

### Уже использовали AdminModal — проверено исходниками

| Компонент / файл | Поверхность | Механизм после аудита |
| --- | --- | --- |
| features/admin/components/AdminPanel.tsx | Редактор инструктора | AdminModal → useModalAccessibility |
| features/admin/components/useAdminDialog.tsx | Общие confirm/alert/prompt приложения | AdminModal → useModalAccessibility |
| features/admin/components/bookings/LinkGuestBookingModal.tsx | Привязка гостевого бронирования | AdminModal |
| features/admin/components/schedule/ScheduleSlotActionModal.tsx | Действия со слотом, вложенное подтверждение | AdminModal |
| features/admin/lesson-bookings/AdminLessonBookingPanel.tsx | Создание бронирования администратором | AdminModal |
| features/admin/lesson-bookings/AdminLessonBookingDetail.tsx | Подтверждения действий с бронированием | AdminModal |
| features/admin/course-enrollments/AdminCourseEnrollmentPanel.tsx | Подтверждение команды | AdminModal |
| features/admin/training-records/AdminTrainingRecordsPanel.tsx | Операции с учебными записями | AdminModal |
| features/admin/testing/TestSessionResetSection.tsx | Подтверждение сброса | AdminModal |
| features/kaspi-payments/KaspiPaymentsAdmin.tsx | Платёж, вложенное подтверждение | AdminModal |
| features/kaspi-payments/KaspiMerchantSettingsForm.tsx | Подтверждение настроек мерчанта | AdminModal |
| features/kaspi-payments/KaspiConfigurationAdmin.tsx | Подтверждение конфигурации | AdminModal |
| features/instructor-workspace/InstructorWorkspace.tsx | Подтверждение уровня | AdminModal |
| features/instructor-workspace/components/InstructorLessonContextDialog.tsx | Контекст занятия | AdminModal |
| features/profile/components/StudentSkillEvaluationModal.tsx | Оценка навыков | AdminModal |
| features/bookings/components/booking_chat/ChatWindow.tsx | Административный вариант чата | AdminModal |

### Уже использовали ModalLayer — проверено исходниками и общим browser fixture

| Компонент / файл | Поверхность |
| --- | --- |
| features/auth/components/AuthModal.tsx | Авторизация, регистрация, восстановление |
| features/bookings/components/BookingModal.tsx | Бронирование, в том числе BookingAuthShell |
| features/courses/components/CourseDetailsModal.tsx | Подробности курса |
| features/courses/components/CourseEnrollmentModal.tsx | Запись на курс, авторизация внутри записи |
| features/profile/components/InstructorReviewsModal.tsx | Отзывы об инструкторе |
| features/shell/ModalHost.tsx | Модальный lazy-loading fallback (закрытие запрещено) |

BookingAuthShell — содержимое BookingModal, а не самостоятельный слой; повторная регистрация не добавлена. InstructorLessonContextDialog и StudentSkillEvaluationModal сохраняют существующие ограничения закрытия.

### Собственная реализация — исправлена

| Компонент / файл | До | После / блокировка Escape |
| --- | --- | --- |
| features/student-cabinet/components/LevelUpModal.tsx | Портал + scroll lock | ModalLayer |
| features/student-cabinet/components/ReviewModal.tsx | Портал + scroll lock | ModalLayer; isSubmitting |
| features/student-cabinet/components/LessonDetailsModal.tsx | Портал + scroll lock | ModalLayer |
| features/student-cabinet/components/ConfirmActionModal.tsx | Портал + scroll lock | ModalLayer; Escape = onCancel |
| features/student-cabinet/components/student/BookInstructorPickerModal.tsx | Анимированный портал + scroll lock | ModalLayer, внутри AnimatePresence |
| features/student-cabinet/components/PersonalCabinetModals.tsx | Загрузка чата поверх страницы | ModalLayer; closeDisabled до загрузки |
| features/bookings/components/booking_chat/ChatWindow.tsx | Публичный чат без focus trap | ModalLayer; BookingChatModal остаётся контейнером |
| features/bookings/components/PaymentGateway.tsx | Оверлей + scroll lock | ModalLayer; isPaying или isSuccess |
| features/booking-collaboration/components/RescheduleBookingModal.tsx | Оверлей внутри страницы | ModalLayer; submitting |
| features/booking-collaboration/components/CreateProposalModal.tsx | Оверлей внутри страницы | ModalLayer; submitting |
| features/booking-collaboration/components/InstructorBlockAction.tsx | Собственный trap/restore и портал | ModalLayer; loading |
| features/instructor-workspace/components/InstructorParticipantLessonFeedbackEditor.tsx | Портал + scroll lock | ModalLayer; savePending |
| features/notifications/PushNotificationHub.tsx | NotificationHubModal + scroll lock | ModalLayer |
| features/notifications/service.tsx | Совместимый NotificationHubModal | ModalLayer; существующая реализация сохранена |
| features/admin/course-enrollments/AdminCourseEnrollmentPanel.tsx | Фиксированная панель деталей | ModalLayer; mutationPending |
| features/admin/issues/AdminIssueCenter.tsx | Мобильный полноэкранный aside | useModalAccessibility + useBodyScrollLock только при открытии и ширине < 1024px; attendance.pending |

### Вложенные элементы и исключения

- BookingAppleSelect, BookingAppleDatePicker, BookingAppleWheelPicker: локальный onKeyDown поглощает Escape, закрывает раскрытый элемент и возвращает фокус к его trigger. Собственные document keydown listeners удалены. Escape вне области элемента относится к активному диалогу; в browser-тесте календаря Shift+Tab переводит фокус с trigger в колонки, расположенные перед ним в DOM.
- DisabledOptionTooltip поглощает Escape только при видимой подсказке; следующий Escape доступен диалогу.
- Native select и системные prompt/alert/confirm принадлежат браузеру. Найдены в CanonicalCoursesManager, BookingChatModal и dev/T31bCoursePilotPage; их жизненный цикл и клавиатуру приложение не переопределяет.
- Navbar: раскрываемая навигация/меню, не модальный диалог. Toast-уведомления, StudentBookNextFab, нижняя панель StudentCabinetUI, порталы плиток StudentDashboardColumns и EmailVerificationReturnPage не являются модальными оверлеями. На них focus trap/inert не добавлены.

## Реализация

Общий hook остаётся владельцем клавиатурной логики и изоляции. Новых глобальных keyboard listeners вне него не добавлено. Общий контекст ModalParent учитывает вложенность при регистрации; z-index соответствует порядку стека, включая удаление нижнего слоя. Escape обрабатывает только верхний слой, учитывая closeDisabled, defaultPrevented и остановку всплытия вложенными элементами. Существующий BodyScrollLock сохраняет счётчик владельцев и восстанавливает прокрутку после последнего окна.

Классы оформления, motion-параметры, тексты и доменные операции сохранены. Для ранее несемантических окон добавлены role=dialog, aria-modal и локализованное имя. Для отправки отзыва, рекомендаций и платежа крестик также заблокирован тем же pending-флагом.

## Проверки

| Проверка | Результат |
| --- | --- |
| Unit: 9 затронутых наборов | PASS — 99 тестов |
| RU/EN, каждый перенесённый тип окна | PASS — modalEscapeAudit; отдельный тест InstructorBlockAction в обеих локализациях |
| Escape, Tab, Shift+Tab, верхний слой, StrictMode, удаление нижнего окна/trigger, пустой диалог | PASS — ModalLayer/AdminModal |
| Одновременное открытие parent+child, два Escape, исходный opener | PASS — unit и browser |
| submitting/loading: отзыв, редактор, перенос, предложение, блокировка, платёж, мобильная Admin Issues | PASS — unit; отзыв также browser |
| Административная панель зачисления и мобильная Admin Issues | PASS — unit |
| Browser Chromium: реальные публичные компоненты, смешанный AdminModal/ModalLayer, вложенные select/calendar, прокрутка, RU/EN, light/dark, 375/390/768/1440px | PASS — окончательный прогон: 43 теста |
| Browser admin fixtures: native schedule payload, booking fields, guest linking, chat composer/attachments, вложенное подтверждение, visual viewport | PASS — 6 тестов |
| TypeScript + полный ESLint (`npm run lint`) | PASS; предупреждения форматирования/существующих правил репозитория, без ошибок |
| Production build (`npm run build:prod`) | PASS; предупреждение Vite о размере chunks |
| Независимое code review | Замечания по порядку слоёв и сохранению opener исправлены, регрессии проверены тестами |
| `git diff --check` | PASS |
| `graphify update .` | PASS — 16595 nodes, 48550 edges; последнее локальное уточнение возврата фокуса проверено непосредственно исходниками/тестами |

Полные локальные логи: `.scratch/modal-audit-admin-browser.log`, `.scratch/modal-audit-final-unit.log`, `.scratch/modal-audit-final-browser.log`, `.scratch/modal-audit-final-lint.log`, `.scratch/modal-audit-final-build.log`, `.scratch/modal-audit-graphify.log`. Административный тест вложенности обновлён: оба диалога остаются в DOM, только верхний доступен через accessibility tree. Первый browser-прогон выявил неверное направление Tab в тесте календаря и timeout при пересборке fixture; тест исправлен, финальный fixture больше не пересобирался во время проверки.

## Непроверенные сценарии и ограничения

- AUTHENTICATED WORKFLOW: NOT VERIFIED — нет подтверждённой авторизованной сессии ученика, инструктора и администратора. Защищённые маршруты не открывались. Browser fixture использует реальные компоненты с локальными данными, а не полные серверные операции.
- Не выполнялись реальные платежи, отправки отзывов/рекомендаций, reset, Firebase writes и другие административные команды в браузере. Pending проверен unit-тестами с управляемыми Promise/флагами.
- Не проверены Firefox, WebKit, физические мобильные устройства и screen reader. Native browser prompt/alert/confirm инвентаризированы, но не автоматизировались.
- Отдельная существующая проблема вне Escape: отсутствие defaultSelectedParticipantIds у CreateProposalModal создаёт новый default-массив на каждом render при зависимом effect. В production-вызове InstructorWorkspace передаёт этот prop; в новых тестах он тоже задан явно. Изменение этой логики в срез не включено.

## Server impact

Functions: NO. Hosting: YES (изменён клиентский bundle, deploy не выполнялся). Rules: NO. Indexes: NO. Migration: NO. Settings: NO. Schedulers/triggers: NO. Query shape, число чтений, polling и серверные записи не менялись.

## Изменённые файлы

- `docs/audits/modal-escape-audit-2026-11-14.md`
- `src/features/admin/components/AdminModal.tsx`
- `src/features/admin/course-enrollments/AdminCourseEnrollmentPanel.tsx`
- `src/features/admin/issues/AdminIssueCenter.tsx`
- `src/features/booking-collaboration/components/CreateProposalModal.tsx`
- `src/features/booking-collaboration/components/InstructorBlockAction.tsx`
- `src/features/booking-collaboration/components/RescheduleBookingModal.tsx`
- `src/features/bookings/components/PaymentGateway.tsx`
- `src/features/bookings/components/booking_chat/ChatWindow.tsx`
- `src/features/bookings/components/booking_modal/BookingAppleDatePicker.tsx`
- `src/features/bookings/components/booking_modal/BookingAppleSelect.tsx`
- `src/features/bookings/components/booking_modal/BookingAppleWheelPicker.tsx`
- `src/features/instructor-workspace/components/InstructorParticipantLessonFeedbackEditor.tsx`
- `src/features/notifications/PushNotificationHub.tsx`
- `src/features/notifications/service.tsx`
- `src/features/student-cabinet/components/ConfirmActionModal.tsx`
- `src/features/student-cabinet/components/LessonDetailsModal.tsx`
- `src/features/student-cabinet/components/LevelUpModal.tsx`
- `src/features/student-cabinet/components/PersonalCabinetModals.tsx`
- `src/features/student-cabinet/components/ReviewModal.tsx`
- `src/features/student-cabinet/components/student/BookInstructorPickerModal.tsx`
- `src/ui/DisabledOptionTooltip.tsx`
- `src/ui/ModalLayer.tsx`
- `src/ui/useModalAccessibility.ts`
- `tests/browser/admin-modals/admin-modals.spec.ts`
- `tests/browser/public-modals/escape-audit.spec.ts`
- `tests/browser/public-modals/fixture.tsx`
- `tests/unit/AdminCourseEnrollmentPanel.test.tsx`
- `tests/unit/AdminIssueCenter.test.tsx`
- `tests/unit/ModalLayer.test.tsx`
- `tests/unit/PaymentGateway.test.tsx`
- `tests/unit/modalEscapeAudit.test.tsx`
