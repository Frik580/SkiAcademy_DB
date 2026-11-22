# CA-SEC-05B — LIVE Release Readiness

Дата: 2026-11-22, Asia/Qyzylorda. Ветка: `fix/ca-sec-05b-firestore-rules-consistency`, HEAD: `c88949d630cabf0807f370aeb1f7b96755ee2c20`.

## VERDICT: BLOCKED

Проверен существующий незакоммиченный CA-SEC-05B diff, включая новые untracked server/client modules. Большинство исправлений F7/F10 реализовано и имеет сохранённые успешные проверки. Однако утверждение «неиспользуемый TEST не позволяет обходить LIVE authorization» для всего diff неверно: обнаружен оставшийся destructive server path. Отсутствие трёх TEST-индексов не является причиной BLOCKED.

Продуктовый код и существующие проверенные исправления в этом аудите не изменялись. Commit, push, merge, deploy, изменение Firebase, индексов, IAM и данных не выполнялись.

## Блокирующее замечание LIVE

**P1 — `deleteErrorLog` / `clearErrorLogs` допускают TEST Account без registry к LIVE error logs.**

`functions/src/security/manageErrorLogs.ts:15–20` вызывает `requireActiveAccount`, проверяет `role=admin` и отсутствие `test_actors/{uid}`, но не требует LIVE scope профиля. Валидный постоянный TEST Account с `dataScope=test` и без registry проходит canonical parsing и этот guard. `index.ts` оборачивает handlers в admission, но не добавляет LIVE authorization. Admin SDK обходит Firestore Rules. Профиль с `dataScope=live` и остаточным `testSessionId` canonical parser отклоняет: это не подтверждённый bypass.

Независимый reviewer воспроизвёл удаление на локальном fake Firestore: canonical Account валиден, `documentMatchesReadScope(LIVE, profile) == false`, handler возвращает `{deleted:true}` и вызывает delete. Скрипт `.scratch/ca-sec-05b/live-readiness-authorization-repro.cjs` транспилирует текущие TS sources. Сеть, Firebase и реальные данные не использовались. Не утверждается, что такой admin сейчас существует в staging/production: обход требует TEST Account с ролью admin и без registry, обычный пользователь так admin не получает. TEST deferred и отсутствие registry не доказывают LIVE identity.

Перед выпуском требуется узкое исправление LIVE guard: canonical active admin + LIVE-compatible scope + отсутствие registry; legacy LIVE без `dataScope` сохранить. Добавить негативные проверки TEST без registry, LIVE с `testSessionId`, registered TEST со старой LIVE-меткой, disabled/malformed Account; позитивные — canonical LIVE admin и owner с `role=admin`. Owner-only не должен получать admin.

**Пробел проверки:** `functions/src/security/manageErrorLogs.emulator.test.ts` сохраняет старые fixtures без canonical Account metadata и ожидает ALLOW для owner-only (`role=user, systemRole=owner`). Этот suite не подтверждает новую модель и по текущему source имеет заведомо несовместимые ожидания. Исторические PASS других suites не закрывают этот путь. Его обновление и целевой запуск входят в release gate после исправления.

## Что закрыто и что подтверждено

| Область | Текущее состояние |
| --- | --- |
| F7 Firestore known-ID/list | Scoped server reads определяют область на сервере; SDK lists приватных поверхностей закрыты; legacy LIVE совместимость сохранена. Курсор связан с UID, scope и запросом. |
| F10 Rules / Account | Firestore и Storage сверяют canonical UID, active lifecycle, допустимую роль, revision, audit и chronology. `systemRole=owner` без `role=admin` не является administrator. |
| Регистрация/bootstrap | Сохранены exact own-UID bootstrap и ограниченные public catalog reads до provisioning. `claimGuestProfile` требует verified актуальную Auth identity и не допускает TEST claim LIVE. Сохранённые Rules/auth проверки PASS; реальный новый staging signup ещё не проверен. |
| Wallet / Participant / Booking / Course | Rules и scoped read models ограничивают Account/Participant/scope; canonical mutation authority не перенесена на клиент. Серверный scoped Account validator применяется через общие resolvers. |
| Чаты и Storage | Прямой SDK-доступ к защищённым media/TEST prefixes закрыт. Server chat/image paths проверяют текущие права; LIVE публичные изображения сохраняют принятый публичный контракт. |
| Отзыв инструктора/владельца | Сохранённые HTTP/emulator/browser проверки отмены Booking, смены Instructor linkage, owner guard и server stream denial PASS. Уже полученные байты отозвать невозможно. |
| TEST → LIVE | Большинство путей отклоняет registry/scope mismatch. Исключение в error log administration выше блокирует общий verdict F7/F10 CLOSED. |

Классификация takeover: существующие scoped reads/chat/images/Rules — DONE в пределах указанного покрытия; error-log guard — BROKEN; его актуальная authorization test matrix — MISSING. TEST functionality — DEFERRED. Существующий WIP сохранён.

## DEFERRED

- TEST Session как поддерживаемый релизный workflow; её завершение и дополнительное end-to-end покрытие не входят в LIVE release.
- TEST-аватары, включая сохранение `avatarUrl` и политику `T42B-8_DEFERRED`.
- TEST-чаты и дальнейшая доработка TEST подписок. Реактивация той же assignment ID может требовать повторного открытия экрана; совмещённый переход Session + Participant отдельно не проверен.
- TEST notifications/history/cleanup, которым нужны три составных индекса ниже.
- Создание трёх TEST-индексов и ожидание READY. Определения остаются в `firestore.indexes.json` для будущей задачи; **этот файл не входит в LIVE deploy**.

Существующие security guards TEST сохраняются и должны поставляться с общими authorization modules: откладывание feature не означает разрешение обходов LIVE. Не создавать новые TEST Sessions/назначения в рамках LIVE smoke.

## Индексы LIVE

Все три добавления diff имеют equality prefix `dataScope ASC, testSessionId ASC, userId ASC`:

| Collection / tail | LIVE dependency | Без deploy |
| --- | --- | --- |
| notifications / timestamp DESC | NO | TEST notifications DEFERRED |
| notifications / timestamp ASC | NO | TEST client cleanup DEFERRED |
| activity_logs / timestamp DESC | NO | TEST activity DEFERRED |

LIVE `queryScopedClientDocuments` не добавляет первые два фильтра. Существующие определения `userId ASC, timestamp DESC/ASC` остаются в манифесте. Новый индекс для LIVE этим diff не требуется. Предыдущий read-only inventory показал ABSENT для трёх TEST-индексов в обоих окружениях; он не является свежей проверкой READY уже существующих LIVE-индексов. Перед rollout сверить LIVE index health read-only, без применения всего JSON. Ни `firebase deploy --only firestore`, ни `firestore:indexes`, ни общий `firebase deploy` в этот план не входят.

## Состав staging release после снятия BLOCKED

| Компонент | YES/NO | Причина |
| --- | --- | --- |
| Firestore Rules | YES | Canonical active Account, scope, private reads, chat ACL, runtime signal reads. Только selector `firestore:rules`. |
| Storage Rules | YES | Закрытие прямых защищённых путей, запись публичных LIVE изображений через сервер. Selector `storage`. |
| Cloud Functions | YES | Новые server read/chat/image endpoints и изменённые общие authorization dependencies существующих exports; точный список ниже. |
| Hosting | YES | Клиент использует новые callables, SSE, protected uploads и scoped subscriptions; старый bundle с новыми Rules теряет часть SDK reads/writes. |
| Indexes | NO | Изменения индексов исключительно TEST; существующие LIVE definitions не изменены. |
| Конфигурация — изменения | NO | `.firebaserc`, `firebase.json`, env schema, secret definitions и shared dependencies не изменены этим diff. |
| Конфигурация — preflight | YES | Явный staging project, staging bundle, существующий `GUEST_ACTION_TOKEN_SECRET`, runtime SA Firestore/Storage/secret access и browser HTTP endpoints должны быть доступны. Не создавать/менять их автоматически. |
| Migration / data backfill | NO | По предыдущему Account inventory NOT REQUIRED; disabled Accounts не реактивировать. Snapshot перед rollout перепроверить, если данные менялись. |
| Schedulers | NO | Ни один scheduled export не зависит от изменённых authorization modules по проверенной import reachability. |
| Triggers | YES | Шесть новых invalidation triggers ниже; существующие revenue/outcome/outbox triggers не меняются. |

### Точные Functions selectors

Новые HTTP exports: `protectedImages`, `chatMessagesStream`. Существующий изменённый HTTP export: `bookingChatMedia`.

Новые callables: `queryScopedClientDocuments`, `queryChatMessages`, `mutateChatMessage`.

Новые triggers: `syncClientInstructorSignal`, `syncClientCourseSignal`, `syncClientCourseContentSignal`, `syncClientUserSignal`, `syncClientNotificationSignal`, `syncClientActivitySignal`.

Существующие затронутые callables (проверены по текущим относительным imports от handlers в `functions/src/index.ts`):

```text
claimGuestProfile
deleteErrorLog
clearErrorLogs
executeCanonicalCommand
executeGuestCanonicalCommand
executeTestSessionLifecycle
queryKaspiPayments
queryLessonBookingReadModels
queryManagedParticipantPickerReadModels
queryBookingProposalReadModels
queryBookingChangeRequestReadModels
queryParticipantInstructorAccessReadModels
queryCourseEnrollmentReadModels
queryCourseCatalogReadModels
queryCourseAttendanceReadModels
queryInstructorCourseAssignmentReadModels
queryAdminIssueReadModels
queryAdminFinanceReadModels
queryAccountWalletHistory
resolveInstructorLessonRevenue
queryAdminCourseReadModels
queryAdminCourseEnrollmentReadModels
queryAdminIdentityReadModels
queryAdminPlannerReadModels
queryInstructorOccupancyReadModels
queryParticipantOccupancyReadModels
queryBookingInstructorCatalogueReadModels
queryEmailDeliverySettingsReadModel
queryOutboxDeadLetterReadModel
queryInstructorReviewReadModels
queryParticipantProgressReadModels
queryParticipantProgressHistoryReadModels
queryInstructorParticipantRecommendationHistoryReadModels
queryParticipantAchievementsReadModels
queryParticipantLessonFeedbackReadModels
queryTestSessionReadModels
```

Всего 48 exports: 6 endpoints + 6 triggers + 36 существующих callables. `executeGuestCanonicalCommand` также достигает изменённого execution resolver и не должен быть пропущен. `queryLessonPricingSettingsReadModel` не достигает изменённых modules и в набор не входит. TEST-named exports здесь получают security fixes общих guards, а не готовность TEST feature. При изменении product source после аудита пересчитать набор. Полный `--only functions` не нужен: использовать точные `functions:<name>` selectors из этого раздела, с кавычками в PowerShell и `--project ski-school-staging`.

## Проверки и границы доказательств

Использованы сохранённые результаты, полный набор повторно не запускался:

| Проверка | Результат / источник |
| --- | --- |
| Rules + integration | PASS, 216/216, 7 files, wrapper exit 0: `.scratch/ca-sec-05b/deterministic-rules.log` и `subscriptions-emulator-final.log`. Штатный SIGINT при shutdown не является failure assertions. |
| Subscription unit | PASS, 50/50, 2 files: `subscriptions-unit-last.log`. Предыдущий `subscriptions-unit-final.log` содержит 2 FAIL и не является финальным успешным результатом. |
| Quick gate | Сохранённый PASS 2 823 Vitest + 59 Node guards; это результат предыдущей стадии, не новый прогон текущего release audit. |
| Chat/media | Сохранённый PASS 37/37 Rules/integration + 33/33 server; локальный Auth/Firestore/Storage. |
| Browser | Сохранённые PASS входа ролей, media access/revocation, focused chat fallback/row clearing и Participant switch. Не все попытки были успешны: media timeout и ранний focused-chat timeout сохранены в исторических логах. |
| TypeScript / Functions build / production build / lint / manifest | Сохранённые PASS описаны в предыдущем audit; 719 inventory files / 699 required после добавления subscription E2E. |
| Новая security reproduction | FAIL authorization isolation: TEST admin без registry удаляет LIVE error log на fake DB. Это воспроизведённый дефект, а не сбой инфраструктуры тестирования. |
| Актуальная error-log suite | NOT RUN; текущие fixtures/owner expectation несовместимы с новым guard. Требуется целевой repair + rerun перед release. |
| Staging authenticated workflow | AUTHENTICATED WORKFLOW: NOT VERIFIED. Локальные browser PASS не заменяют staging smoke. |

Новый staging build и `git diff --check` фиксируются в финальном дополнении ниже. Graphify query использован как навигация; import dependencies и findings сверены с source. Graph refresh не требуется: в этом аудите меняется только release documentation.

## Порядок staging rollout — только после исправления blocker и отдельного разрешения

1. Исправить LIVE error-log guard и обновить его тесты; прогнать только затронутый authorization suite и typecheck/build по необходимости. Независимо перепроверить этот риск. Пока это не выполнено — STOP.
2. Зафиксировать проверенный release artifact/diff без commit по умолчанию. Read-only preflight: staging project `ski-school-staging`, canonical active admin/owner с `role=admin`, нужные LIVE indexes READY, существующий secret и доступы сервисного аккаунта. Сохранить реально deployed Rules sources/IDs, Hosting release ID и исходники/конфигурацию прежних затронутых Functions для rollback. Не считать HEAD доказательством deployed версии.
3. Подготовить staging bundle `npm run build:staging` (не production/e2e bundle); Functions build из того же source. Проверить project/region и отсутствие включённых emulators в rollout environment.
4. Сначала развернуть только 48 Functions exports выше, включая шесть signals. Они добавляют серверные пути до переключения клиента; индексы TEST не создавать. Проверить readiness новых endpoints и authorization negative checks. При отказе остановить rollout до Rules/Hosting.
5. В согласованное короткое окно ограничить пользовательский staging доступ. Развернуть `firebase deploy --project ski-school-staging --only "firestore:rules"`, затем `firebase deploy --project ski-school-staging --only "storage"`, затем немедленно `firebase deploy --project ski-school-staging --only "hosting"` со staging bundle. Эти команды приведены как план и не выполнялись. Firebase не делает три компонента атомарными: старые вкладки между Rules и reload могут получать permission denied. Попросить reload после публикации. Новый клиент до закрытия старых Rules тоже не считается безопасным cutover.
6. Authenticated staging smoke с реальными свежими токенами: новая регистрация → provisioning, user own Wallet/Participant/Booking/Course; чужие IDs/list deny; admin и owner+admin allow, owner-only deny; инструкция revoke linkage/Booking/owner guard → protected media/chat deny и очищение строк; notifications/activity/history/cleanup LIVE без TEST indexes; LIVE avatar upload, course/instructor images, chat create/homework/media, family party fallback. Проверить прямой вызов от TEST/mismatched identity не создавая новый TEST workflow. Проверить error-log guard исправлен. До успешного smoke не открывать обычный staging доступ и не считать production release разрешённым.

## Откат

- Сейчас внешних изменений нет; откатывать Firebase нечего. Существующий WIP не reset/clean/checkout.
- При неуспешном Functions этапе не переключать Rules/Hosting; новые endpoints можно оставить закрытыми авторизацией до исправления либо адресно убрать только по отдельному разрешению. Signals не содержат payload; массово удалять runtime documents не требуется.
- После cutover предпочтителен исправляющий rollout с текущими строгими Rules. Откат только Hosting на прежний клиент с новыми Rules ломает SDK reads/uploads; откат только Functions ломает новые client endpoints.
- Если нужен полный rollback, закрыть staging доступ, восстановить согласованный комплект из сохранённых deployed Functions artifacts/config + Firestore/Storage Rules + Hosting release, проверить работоспособность и права до открытия доступа. Прежние Rules могут вновь открыть F7/F10: такой rollback требует отдельного разрешения и оценки риска, а не автоматического применения.
- Новые индексы и миграции отсутствуют: data/index rollback не нужен. Не удалять historical data, медиа или TEST records в рамках отката.

## Нагрузка и оставшиеся эксплуатационные риски

Server scoped query: страницы 50–200, до 1 000 физических документов на вызов; лимит возвращает `resource-exhausted`, а не делает полный scan. Subscription refresh событийный через шесть triggers, без периодического polling. SSE слушает последние 100 сообщений и точечные authority dependencies; соединение ограничено 110 секундами, затем клиент переподключается. История читает до 101 сообщения.

Есть явные пользовательские drains: purge notifications обходит все подходящие страницы по cursor, dismiss review notification — все notifications данного пользователя страницами по 200. Это не scheduler/full-collection background scan, но общий объём операции растёт с историей пользователя. В этом audit не оптимизировалось. Существующий instructor avatar permission fallback ищет Booking страницами по 50 до подходящего доказательства. Реальные staging latency/cost и точный межкомпонентный cutover ещё не проверены; численные оценки стоимости не делались.

## Changed files

Полный manifest текущего CA-SEC-05B WIP приведён ниже. В данном audit дополнительно изменены только этот отчёт и ссылка на его verdict в прежнем отчёте; product source сохранён.

```text
docs/audits/CA-SEC-05B-firestore-rules-consistency.md
docs/audits/CA-SEC-05B-live-release-readiness.md
e2e/booking-chat-media.spec.ts
e2e/booking-chat-subscription.spec.ts
e2e/instructor-revenue.spec.ts
firestore.indexes.json
firestore.rules
functions/src/canonical/commands/resolveCallableAccountContext.ts
functions/src/canonical/readModels/adminCourseEnrollmentReadModels.test.ts
functions/src/canonical/readModels/instructorCourseAssignmentReadModelsCallable.test.ts
functions/src/canonical/readModels/instructorCourseRosterReadModelsCallable.test.ts
functions/src/canonical/readModels/participantInstructorAccessReadModels.ts
functions/src/canonical/readModels/queryAdminFinanceReadModelsCallable.test.ts
functions/src/canonical/readModels/queryAdminIssueReadModelsCallable.test.ts
functions/src/canonical/readModels/queryBookingChangeRequestReadModelsCallable.test.ts
functions/src/canonical/readModels/queryCourseCatalogReadModelsCallable.ts
functions/src/canonical/readModels/queryLessonBookingReadModelsCallable.test.ts
functions/src/canonical/readModels/resolveCallableAdministrator.ts
functions/src/canonical/testSessions/canonicalExecutionScopeResolver.ts
functions/src/canonical/testSessions/canonicalReadScopeResolver.test.ts
functions/src/canonical/testSessions/canonicalReadScopeResolver.ts
functions/src/canonical/testSessions/executeTestSessionLifecycleCallable.ts
functions/src/chat/chatMedia.emulator.test.ts
functions/src/chat/chatMediaAccess.ts
functions/src/chat/chatMessagesRead.ts
functions/src/chat/chatMessagesStream.ts
functions/src/chat/chatMessagesWrite.ts
functions/src/deploymentRuntimeOptions.test.ts
functions/src/index.ts
functions/src/security/activeAccount.ts
functions/src/security/claimGuestProfile.ts
functions/src/security/manageErrorLogs.ts
functions/src/security/protectedImageAccess.ts
functions/src/security/protectedImagesHttp.ts
functions/src/security/scopedClientReads.ts
scripts/testManifest.inventory.json
src/domain/notifications/notificationCleanup.ts
src/features/admin/components/bookings/LinkGuestBookingModal.tsx
src/features/admin/components/courses/CanonicalCoursesManager.tsx
src/features/admin/components/courses/form/CourseInstructorSelection.tsx
src/features/admin/components/schedule/ScheduleBookingCell.tsx
src/features/admin/components/schedule/ScheduleCalendar.tsx
src/features/admin/components/schedule/ScheduleInstructorCell.tsx
src/features/admin/issues/AdminLevelRequests.tsx
src/features/admin/people/AdminInstructorDetail.tsx
src/features/admin/people/AdminInstructorProfileEditor.tsx
src/features/auth/components/Auth.tsx
src/features/bookings/bookingHistoryService.ts
src/features/bookings/components/BookingChatModal.tsx
src/features/bookings/components/booking_chat/ChatMessageList.tsx
src/features/bookings/components/booking_modal/BookingModalHeader.tsx
src/features/bookings/sync/useBookingsSync.ts
src/features/chat/chatMessagesStreamClient.ts
src/features/chat/chatService.ts
src/features/chat/homeworkHistory.ts
src/features/courses/components/CourseDetailsModal.tsx
src/features/courses/components/GroupCourseCard.tsx
src/features/courses/sync/useCoursesSync.ts
src/features/instructor-workspace/components/InstructorBookingCard.tsx
src/features/instructor-workspace/components/InstructorDashboardHeader.tsx
src/features/instructor-workspace/components/InstructorLessonContextDialog.tsx
src/features/instructor-workspace/components/InstructorReviews.tsx
src/features/instructor-workspace/components/InstructorStudents.tsx
src/features/instructor-workspace/useInstructorLessonRevenue.ts
src/features/journey/components/YourJourneySection.tsx
src/features/media/ProtectedImage.tsx
src/features/notifications/PushNotificationHub.tsx
src/features/notifications/service.tsx
src/features/notifications/sync/useNotificationsSync.ts
src/features/participants/components/ParticipantManagementPanel.tsx
src/features/participants/components/ParticipantPicker.tsx
src/features/profile/components/InstructorCard.tsx
src/features/profile/components/InstructorReviewsModal.tsx
src/features/profile/profileService.ts
src/features/profile/sync/useProfileActivitySync.ts
src/features/profile/sync/useUsersSync.ts
src/features/student-cabinet/components/CabinetParticipantAvatarSwitcher.tsx
src/features/student-cabinet/components/ClientBookingsList.tsx
src/features/student-cabinet/components/UnreviewedCompletedBookingsNotice.tsx
src/features/student-cabinet/components/UpcomingSessionsStrip.tsx
src/features/student-cabinet/components/student/BookInstructorPickerModal.tsx
src/infrastructure/firebase/index.ts
src/infrastructure/firebase/protectedImageClient.ts
src/infrastructure/firebase/storage.ts
src/lib/canonical/scopedClientDocuments.ts
storage.rules
tests/firestore.rules.test.ts
tests/helpers/storageRulesFixtures.ts
tests/integration/bookingQueryContracts.test.ts
tests/integration/helpers.ts
tests/integration/homeworkHistory.test.ts
tests/integration/instructorLessonRevenue.rules.test.ts
tests/integration/studentCoachMessages.test.ts
tests/storage.rules.test.ts
tests/unit/instructorLessonRevenue.test.tsx
```

## Финальное дополнение проверки

- PASS: `npm run build:staging`, exit 0; лог `.scratch/ca-sec-05b/live-readiness-build-staging.log`. Сохраняется Vite warning о крупных chunks.
- FAIL security isolation / reproduction confirmed: `node .scratch/ca-sec-05b/live-readiness-authorization-repro.cjs`, скрипт exit 0; TEST admin без registry вызвал delete. LIVE admin positive и registered TEST negative controls совпали с ожидаемым поведением.
- Независимый review: один подтверждённый P1, других подтверждённых blockers в проверенных Rules/scoped reads/images/chat/resolvers не найдено.
- PASS: `git diff --check`; финальный status/diff проверен, новых product source изменений в этом audit нет.
