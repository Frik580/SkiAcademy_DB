# CA-SEC-05B — Firestore Rules & Legacy Account Consistency

> Актуальный release verdict от 2026-11-22: **BLOCKED**. При финальном независимом review найден обход LIVE error-log authorization для валидного TEST-admin без registry. См. [LIVE Release Readiness](CA-SEC-05B-live-release-readiness.md). Исторические результаты ниже сохранены; три TEST-индекса и T42B-8 остаются DEFERRED.

## Verdict

**Локальные проверки F7/F10 завершены. Три индекса нужны только для TEST Session и отложены. Их отсутствие не блокирует LIVE по части этих индексов.**

Результаты продолжения приведены в разделе «Завершение оставшихся замечаний». Таблицы первого этапа сохранены как история исходного diff и его проверок.

Дата: 2026-11-21, Asia/Qyzylorda. Ветка `fix/ca-sec-05b-firestore-rules-consistency` существовала до начала работы; рабочее дерево было чистым. HEAD, main и обновлённая origin/main совпадали: `c88949d630cabf0807f370aeb1f7b96755ee2c20`. Fetch выполнен через системные сертификаты Windows, без отключения TLS-проверки.

Изучены текущие Rules, canonical Account/command/read-scope policy, TestActor assignment, клиентские прямые чтения, отчёты CA-SEC-04 и CA-SEC-05. Отдельного отчёта CA-SEC-03 в текущем `docs/audits` и дереве этого коммита CA-SEC-03 не найдено; сведения о его проверках есть в CA-SEC-04. Отсутствие исторического CA-SEC-02 не трактуется как отсутствие выполненных проверок. Graphify использован для навигации, выводы сверены с source.

## Root cause и источники полномочий

- **F7:** часть клиентских чтений фильтрует TEST уже после получения документов. `allow read: if true` и проверки владельца/роли без области не ограничивают ни known-ID reads, ни коллекционные запросы. Фильтрация UI не является границей безопасности. Legacy LIVE без `dataScope` остаётся принятой серверной совместимостью; просто добавить `where(dataScope == live)` означает скрыть эти документы.
- **F10:** прежние Rules принимали отсутствие lifecycle за активность и включали owner-only в admin. Canonical `isAdministratorProfile` принимает только `role=admin`; административный callable дополнительно требует распарсенный активный Account с совпадающим Account ID (`functions/src/canonical/commands/resolveCallableAccountContext.ts:53`, `executeCanonicalCommandCallable.ts:160`).
- Account хранится в dual-purpose `/users/{accountId}`. `parseAccountDocument` выделяет canonical поля и проверяет lifecycle, metadata и хронологию (`packages/shared-domain/src/canonical/accountParticipantAccess.ts:130`). `role`/`systemRole` — серверные поля того же профиля, а не Firebase Auth claims. Top-level `status`/`disabled` не являются canonical lifecycle. Firebase Auth disabled отдельно влияет на вход и выдачу токенов; старый токен не заменяет проверку актуального документа.
- `systemRole=owner` защищает owner-specific операции/цели, в частности смену роли и отключение; это не универсальный grant capability administrator (`identityAdministration.ts:114`, `:169`). Инструктор определяется связанным Instructor ID и активным Account, а не ролью `instructor` или `isInstructor=true`.
- TestActor registry имеет приоритет над клиентским контекстом. TEST authority требует разрешённого актора, актуального `test_actor_assignments/{accountId}.activeTestSessionId` и активной сессии. Сами `accountId`, `dataScope`, `testSessionId` в запросе права не создают. Canonical admin может явно выбрать активную TEST-сессию; TestActor — только назначенную. Direct TEST chat по существующему контракту отложен, поэтому положительный TEST ALLOW проверяется на собственном Wallet, а не на вымышленном разрешении чата.

## Findings и выполненные исправления

| Finding / source | Результат текущего slice |
| --- | --- |
| Signup позволял передать произвольную область (`firestore.rules:187`) | Создание только explicit LIVE без `testSessionId`; зарегистрированному TestActor запрещён LIVE signup, включая `allowed=false`. |
| Legacy/owner-only principal расширял административный доступ (`firestore.rules:27`, `:68`; `storage.rules:13`, `:27`) | Требуются совпадающий `accountId`, известная роль user/admin и строго активный lifecycle. Admin требует `role=admin`. Firestore direct admin дополнительно ограничен LIVE principal без TestActor registry. Claims admin/owner не учитываются. |
| Own Wallet обходил отключение/назначение (`firestore.rules:240`, `:542`) | Проверяется активный principal; LIVE/TEST scope Wallet, registry, assignment и active session. Чужие Wallet, списки, finance evidence и все client writes остаются закрыты. Отсутствующий собственный Wallet возвращает отсутствие при действующем праве, сохраняя bootstrap Wallet UI. |
| Chat обходил область через родителя или admin-update (`firestore.rules:351`, `:357`, `:659`) | TEST/malformed parent scope закрыт, включая canonical party/instructor paths; Account TEST stamp закрывает LIVE chat. Update использует ту же авторизацию родительского thread. Повторные проверки shape и `exists/get` сокращены для сохранения party из восьми Participant. Registry inconsistency остаётся отдельным незакрытым случаем ниже. |
| Disabled/missing/unknown principal мог читать другие protected surfaces | Для Users, Bookings, Notifications, ActivityLog, WalletLedger и CourseChatAccess добавлена проверка текущего активного Account. Сохранено узкое exact own-UID bootstrap get для отсутствующего профиля/legacy LIVE user без lifecycle; это не даёт list/alias/Wallet/admin доступа. |
| Отозванный TestActor снова получал LIVE Storage write через `!allowed` | LIVE upload prefixes проверяют отсутствие записи registry, а не значение `allowed`. Отключённый actor не становится LIVE principal. Own account uploads требуют активного Account. |

Signup/bootstrap проверен по цепочке `src/features/auth/components/Auth.tsx` → `getUserProfileService` → создание presentation profile → `useCurrentUserProfileSync` → `useCanonicalAccountProvisioningSync`. Запрет всех own-profile get до provisioning создал бы deadlock; исключение оставлено только на этом read path. Protected Wallet и другие операции не используют это исключение.

## Замечания F7/F10 на момент первого ревью

| Область | Остаток и безопасное продолжение |
| --- | --- |
| Public catalog/availability | `instructors` (`firestore.rules:556`), `courses` (`:717`), `course_catalog_content` (`:727`), `availability_slots` (`:682`), `availability_hour_locks` (`:689`) всё ещё допускают прямые TEST reads, включая known ID и list. Нужны bounded server read surfaces/scoped client queries с сохранением legacy LIVE visibility и существующего UX. Простого изменения Rules недостаточно. |
| Приватные known-ID/list и некоторые mutations | Bookings (`:632`), Notifications (`:734`), ActivityLog (`:744`), WalletLedger (`:751`), CourseChatAccess (`:757`), admin Users directory, claimed profile aliases и admin runtime не получили полной проверки resource scope/active TestSession. Например, ownership/instructor совпадение всё ещё может разрешить TestActor LIVE Booking; LIVE admin может читать TEST Booking без active-session gate. Остались и unscoped прямые административные legacy writes Course/Catalog/Availability. Account lifecycle hardening не закрывает F7. |
| Canonical chat, несогласованный registry | LIVE-stamped Account с записью TestActor всё ещё может пройти parent chat path. Дополнительный registry lookup для всех родителей превышает Rules budget при восьми Participant. Нужен серверный chat path либо узкая серверная проекция с синхронным отзывом; payer/bookedBy не могут заменить participant-management authority. |
| Storage TEST namespaces | `canAccessTestSessionStorage` (`storage.rules:61`) всё ещё не сверяет текущее assignment; membership может устареть. `test-actors` (`:158`) всё ещё содержит общий read grant для allowed TestActor. Межсессионная изоляция здесь не закрыта. |
| Participant-avatar disable revocation | `canManageParticipantAvatar` (`storage.rules:80`) сохраняет registry + owner guard, в том числе в participant-путях `test-actors`. Добавление третьего Account lookup нарушает production Storage budget, поэтому оно не включено. Disabled Account с оставшимся guard требует серверного upload path/изменения серверной проекции. |
| Полная эквивалентность canonical Account parsing | Rules проверяют authorization поля, но не повторяют полную валидацию revision/audit/timestamp chronology в `parseAccountDocument`. Серверный malformed metadata record может быть отвергнут canonical authorization, но принят Rules при корректных authority полях. Это незакрытый F10, а не утверждение полной согласованности. |

Эти незакрытые пути не объявляются безопасными и не скрываются положительными тестами. Миграция данных сама по себе не закрывает их. Массовый перевод read surfaces и новые авторизационные проекции не включены в минимальный текущий diff.

## Migration Impact

**NOT REQUIRED для фактически прочитанных Account в обоих окружениях.** Это вывод о данных, а не разрешение rollout незавершённых Rules.

Read-only проверка выполнена 2026-11-21. Через существующий ADC с доверенными системными сертификатами прочитаны `/users` в `ski-school-staging` и `ski-school-8f3ca`: `orderBy(documentId)`, `limit(200)`, курсор, projection только canonical/authority полей. Это полный постраничный scan, без listeners/повторов. Известный singleton `school_global_stats` исключался бы отдельно; в обоих окружениях его нет. Проверены canonical `parseAccountDocument` и совпадение Account ID с document ID. Для оставшихся LIVE администраторов точечно проверено отсутствие TestActor registry и через Auth `getUsers` — наличие Auth record и `disabled=false`. Данные, идентификаторы и PII не сохранялись в отчёт/вывод.

| Агрегат | Staging | Production |
| --- | ---: | ---: |
| `/users` документов / Account profiles | 6 | 5 |
| Валидных canonical Account | 6 | 5 |
| `systemRole=owner` без `role=admin` | 0 | 0 |
| Без корректного lifecycle | 0 | 0 |
| Невалидный canonical Account / несовпадающий ID | 0 | 0 |
| Уже disabled Account | 0 | 1 |
| Потеряют административный доступ | 0 | 0 |
| Потеряют прежний обычный protected доступ | 0 | 1 |
| Потеряют любой из этих доступов, уникальных | 0 | 1 |
| Нуждаются в миграции, уникальных | 0 | 0 |
| Остаются canonical LIVE admin без TestActor registry | 2 | 2 |
| Из них существующий неотключённый Auth account | 2 | 2 |
| Вывод | **NOT REQUIRED** | **NOT REQUIRED** |

Единственная потеря доступа в production относится к уже disabled Account: закрывается ранее оставшийся прямой доступ; его нельзя автоматически реактивировать/мигрировать ради сохранения этого доступа. Уникальные потери считались объединением признаков на каждом документе, а не суммой столбцов. Migration candidates исключают уже disabled records. Таким образом, двойного подсчёта нет. По крайней мере один admin в каждом окружении сохраняется по проверенной модели Account + Auth. Фактический вход в UI и новая выдача токена не выполнялись.

Если до будущего rollout появятся legacy/owner-only документы, сначала повторить read-only inventory; отдельно согласовать права и точный список изменений, сохранить защищённые before-images, выполнить идемпотентную узкую миграцию с preconditions/revision, повторно проверить canonical parsing и минимум одного admin. Не присваивать owner-only автоматически `role=admin`, не активировать disabled, не менять Auth. Откат такой отдельно согласованной миграции должен восстанавливать только изменённые поля по before-images с проверкой отсутствия последующих изменений. Сейчас миграция не выполнялась и не требуется по snapshot.

## Validation первого этапа

| Проверка | Итог |
| --- | --- |
| Firestore Rules suite | **PASS — 161/161** в полном `npm run test:emulators` и в последнем отдельном `npm run test:rules` после дополнения fixture через `TestSessionSchema.parse`; оба wrapper exit 0. Проверены known-ID/list, Wallet assignment/revocation, invalid Account, роли/claims, bootstrap, canonical TEST chat, collectionGroup и восьмой Participant. |
| Storage Rules suite | **PASS — 33/33** в полном Emulator-наборе. Отдельный `npm run test:storage-rules` также PASS 33/33 после точечного исправления бюджета; последующий полный прогон подтвердил итоговый source/fixtures. |
| Связанные integration + Firebase Emulator tests | **PASS — всего 210/210, 7 файлов**, `npm run test:emulators`, wrapper exit 0. Включены homework history, real message subscription, booking query contracts, availability и instructor revenue. Финальный лог: `.scratch/ca-sec-05b/emulators-final.log`. |
| `npm run test:quick` | **PASS — 2 811 Vitest + 59 Node guard tests = 2 870**. Проверки Playwright discovery не считаются выполненными browser E2E. |
| Дополнительные целевые unit tests после исправлений | **PASS — 17/17, 3 файла**: firestoreRulesGuard, authService и canonicalAccountReadiness. |
| TypeScript | **PASS — `npm run test:quick:types`**, app/shared-domain/Functions; отдельно повторён после реализации. |
| ESLint | **PASS — `npm run lint`, 0 errors, 91 268 warnings** по репозиторию, преимущественно форматирование. Дополнительный ESLint изменённых fixtures после последней правки — 0 errors. Предупреждения не исправлялись массовым форматированием. |
| Production build | **PASS — `npm run build:prod`**; остаётся предупреждение Vite о крупных chunks. Functions build также прошёл внутри quick gate. |
| Test inventory | **PASS — `npm run test:manifest`**, 718 inventory files, 698 required, 10 suites, без дубликатов. |
| `git diff --check` | **PASS**. |
| Graphify | **PASS — `graphify update .`**, code graph обновлён; семантическое переименование communities отдельно не выполнялось. |

Первоначальные запуски Rules/Emulator suite падали на несовместимых fixtures, chat budgets и старом owner-only ALLOW. Эти результаты не скрыты и не считаются PASS: после исправлений выполнен успешный полный повтор. Самый первый sandbox-запуск не поднял loopback Emulator Hub; assertions не запускались. Повтор вне sandbox использовал только demo emulators. Одна попытка автоматического разрешения повторного Storage-запуска завершилась таймаутом; предусмотренная повторная попытка была разрешена и прошла. Egress ledger итогового Emulator-прогона содержит **0 попыток cloud Firestore**. Отдельного wrapper/shutdown failure после успешных assertions нет; SIGINT Firestore при штатном завершении wrapper — нормальная остановка эмулятора.

Новые тесты добавлены в существующие зарегистрированные файлы `tests/firestore.rules.test.ts` и `tests/storage.rules.test.ts`; обновлённые integration tests также уже присутствуют в test inventory. Новых test files нет. Положительные fixtures включают canonical Account metadata; family-group Booking проверяется через `BookingSchema.parse`, включая согласованный serviceParty, а положительная новая TestSession — через `TestSessionSchema.parse`.

## Files changed

- `firestore.rules`, `storage.rules`.
- `tests/firestore.rules.test.ts`, `tests/storage.rules.test.ts`.
- `tests/helpers/storageRulesFixtures.ts`.
- `tests/integration/helpers.ts`, `tests/integration/bookingQueryContracts.test.ts`, `tests/integration/homeworkHistory.test.ts`, `tests/integration/instructorLessonRevenue.rules.test.ts`.
- `docs/audits/CA-SEC-05B-firestore-rules-consistency.md`.

## Independent security review

Выполнен отдельным reviewer-агентом, не автором изменения. Найдены и исправлены новые регрессии Rules budgets: chat `exists/get`/повторная shape validation и третий Firestore lookup для Participant avatar upload. Проверены реальная валидность положительного family-group fixture, canonical TEST chat, collectionGroup и bootstrap. Повторное review изменённых рисковых участков не нашло новых P1/P2 и подтвердило корректность статуса PARTIAL. Остатки F7/F10 перечислены выше и блокируют deploy-ready verdict. Production Storage ограничивает cross-service access двумя Firestore документами на запрос: [Firebase Rules limits](https://firebase.google.com/docs/rules/rules-behavior#security_rules_limits). Эмуляторный PASS не заменяет эту проверку бюджета.

## Server resource impact

Новых product queries, polling, schedulers или сканирования в приложении нет. Rules добавляют bounded point lookups текущего Account/registry/assignment/session; общие чтения кешируются там, где это поддерживает Rules. TEST Wallet использует до четырёх документов authority плюс Wallet; списки Wallet запрещены. Chat сохраняет до восьми owner guards и требует отдельного контроля общего Rules budget. Own account Storage upload требует Account + registry; Participant avatar сохраняет registry + owner guard. Remote audit сделал один полный scan каждой маленькой users collection с page bound 200 и точечные registry/Auth reads для admin, без записи и без периодического запуска. Стоимость/задержка в production не замерялись.

## Deploy impact и rollback первого этапа

| Компонент | Фактический текущий diff |
| --- | --- |
| Firestore Rules | YES, локальный `firestore.rules`; **не deploy-ready** |
| Storage Rules | YES, локальный `storage.rules`; **не deploy-ready** |
| Functions | NO |
| Hosting | NO |
| Firestore Indexes | NO |
| Data migration / Firebase data | NO |
| Settings / IAM / project config | NO |
| Schedulers / triggers | NO |

Commit, push, PR, merge, deploy, reset и Firebase writes не выполнялись. Remote действия были только read-only. Внешнего изменения, требующего rollback, нет. Локальный rollback — адресно убрать только изменения этого slice по review diff, сохранив чужой WIP. Если впоследствии согласуют Rules deploy, предварительно архивировать реально развёрнутые ruleset sources/IDs; rollback к ним повторно открывает известные F7/F10, поэтому требует отдельной оценки и запрета эксплуатации незакрытых TEST путей. Исторический ruleset ID не подменяет актуальный production inventory.

## Состояние перед продолжением

- F7/F10 в целом не закрыты. Deploy и полное TEST/LIVE разделение не подтверждены.
- Authenticated UI workflow, вход/обновление токена после отзыва, существующие download-token URLs Storage и реальные production queries не запускались. **AUTHENTICATED WORKFLOW: NOT VERIFIED.**
- Не читались production business documents, memberships/assignments и содержимое Storage; Account inventory не доказывает отсутствие TEST business data.
- Следующий этап: согласованный scoped server read/upload contract для оставшихся прямых поверхностей и строгая Account/schema parity, затем emulator negative/positive matrix и независимое review перед отдельным разрешением deploy. Миграция существующих Account по текущему snapshot не требуется.

## Завершение оставшихся замечаний

Продолжение выполнено на `fix/ca-sec-05b-firestore-rules-consistency`. Исходный WIP сохранён. Статус PARTIAL действует до успешной проверки оставшихся серверных и клиентских сценариев.

| Замечание | Изменение и остаток |
| --- | --- |
| F7 — каталоги, availability, Users, Bookings, Notifications, ActivityLog, WalletLedger | Firestore SDK lists закрыты. Прямые точечные чтения ограничены scope. `queryScopedClientDocuments` определяет scope на сервере, сохраняет legacy LIVE и возвращает курсор после фильтрации. Тесты в `tests/integration/bookingQueryContracts.test.ts` проверяют legacy-пагинацию, отсутствие доступа TEST Account без registry и одинаковый ответ для отсутствующей и скрытой записи. |
| F7 — чат, legacy writes и вложенные записи | Rules теперь проверяют registry для LIVE chat. Для семейной группы, превышающей лимит Rules, серверная проверка использует текущие participant guards. Сохранены чтение, подписка и отправка сообщений. Live legacy writes Bookings/Course/Catalog/Availability проверяют старую и новую области. Проверка области защищает точечные чтения профилей и CourseChatAccess. Claim-ссылка из TEST-профиля не даёт доступа к LIVE Booking через legacy alias. |
| F7 — Storage TEST | Прямые SDK read/write закрыты для `test-sessions` и `test-actors`. `protectedImages` проверяет активный Account, текущее назначение, активную сессию, membership и принадлежность файла ресурсу. `bookingChatMedia` теперь использует распарсенный Account и роль admin. Для `misc` проверяется владелец файла, включая чтение. Storage Rules запрещают читать приватные LIVE QR зарегистрированному TestActor даже при старой LIVE-метке профиля. Старые токены проверены отдельно. |
| F10 — Participant avatar | LIVE-аватары остаются публичными по подтверждённому контракту. Запись использует серверный canonical management check. Защищённое TEST-чтение использует текущий management или инструкторское право, а также активность сессии. HTTP GET повторяет проверку перед выдачей байтов и требует совпадения разрешённого пути и сессии. Для постоянного TEST Participant запись в registry должна однозначно связывать его с текущим активным Account и назначением в той же сессии. |
| F10 — Account parity | Firestore и Storage проверяют UID, допустимую роль, lifecycle, revision, audit и порядок timestamps. Серверные маршруты используют `parseAccountDocument`. Сохранены exact own-UID bootstrap и узкие public reads до provisioning. Зарегистрированный TEST Actor не может использовать `claimGuestProfile` для LIVE. |

**Административный и операционный статус.** Подтверждённый ранее вывод по Account — **NOT REQUIRED**. Повторной миграции, изменения ролей, статусов, данных и настроек не было. Read-only metadata inventory прошёл в `ski-school-staging` и `ski-school-8f3ca`. В защищённых префиксах `test-actors/`, `test-sessions/`, `chat/` проверено 5 объектов staging и 2 production. Объектов с `firebaseStorageDownloadTokens` в обоих окружениях — 0. Изображения и значения токенов не читались.

**ESLint baseline.** Detached worktree того же HEAD дал 207 753 предупреждения, из них 207 455 — `prettier/prettier` с `Delete U+240D`. Исходный лог подтвердил 91 268 предупреждений: 90 970 CRLF и 298 остальных. Среди остальных были 135 `jsx-a11y/label-has-for`, 70 других сообщений Prettier, 19 react-refresh, 14 no-explicit-any и 14 exhaustive-deps. Разница с detached worktree объясняется настройками checkout и уже существующей смесью LF/CRLF в рабочей копии. Сопоставление по пути, правилу и сообщению исключает сдвиги строк. Промежуточный JSON показал 85 357 предупреждений и 0 ошибок, из них 85 054 CRLF. Новые предупреждения от форматирования добавленного теста и импорта исправлены точечным Prettier. Полный ESLint с повторной проверкой изменённых после него файлов дал 89 725 предупреждений, включая 89 427 CRLF и 298 существующих другого типа. Ошибок и новых предупреждений вне CRLF — 0.

**Нагрузка.** Серверный лист читает страницы 50–200 документов и ограничивает совместимый scan. Клиент запрашивает очередную страницу по cursor. Сигналы на шести коллекциях предоставляют обновление без polling. Прямые `get` остаются точечными. История чата получает до 101 сообщения, поток используется только при отказе прямой подписки и делится между потребителями одного чата. Совместимый scan ограничен 1 000 физическими чтениями на вызов. При достижении лимита сервер возвращает `resource-exhausted`. Instructor avatar fallback использует существующий поиск подходящего Booking страницами по 50 до первого совпадения, а проверка права выполняется до и после чтения файла.

**Deploy impact продолжения.** Firestore Rules — YES. Storage Rules — YES. Hosting — YES. Functions — `queryScopedClientDocuments`, `queryChatMessages`, `mutateChatMessage`, `chatMessagesStream`, `protectedImages`, `bookingChatMedia`, а также существующие canonical read-model/command exports, проходящие через изменённые общие проверки, `claimGuestProfile`, `deleteErrorLog` и `clearErrorLogs`. Triggers — `syncClientInstructorSignal`, `syncClientCourseSignal`, `syncClientCourseContentSignal`, `syncClientUserSignal`, `syncClientNotificationSignal`, `syncClientActivitySignal`. Schedulers — NO. Миграция, IAM и ручные настройки — NO. Indexes — YES, три новых индекса в `firestore.indexes.json`: `notifications` по `timestamp` ASC и DESC и `activity_logs` по `timestamp` DESC, с равенствами по `dataScope`, `testSessionId` и `userId`. Наличие этих трёх определений проверено read-only. Результат приведён ниже. Изменения не развёрнуты.



**Существующие Functions, затронутые общими проверками.** `executeCanonicalCommand`, `executeTestSessionLifecycle`, `queryAccountWalletHistory`, `queryAdminCourseEnrollmentReadModels`, `queryAdminCourseReadModels`, `queryAdminFinanceReadModels`, `queryAdminIdentityReadModels`, `queryAdminIssueReadModels`, `queryAdminPlannerReadModels`, `queryBookingChangeRequestReadModels`, `queryBookingInstructorCatalogueReadModels`, `queryBookingProposalReadModels`, `queryCourseAttendanceReadModels`, `queryCourseCatalogReadModels`, `queryCourseEnrollmentReadModels`, `queryEmailDeliverySettingsReadModel`, `queryInstructorCourseAssignmentReadModels`, `queryInstructorOccupancyReadModels`, `queryInstructorParticipantRecommendationHistoryReadModels`, `queryInstructorReviewReadModels`, `queryKaspiPayments`, `queryLessonBookingReadModels`, `queryManagedParticipantPickerReadModels`, `queryOutboxDeadLetterReadModel`, `queryParticipantAchievementsReadModels`, `queryParticipantInstructorAccessReadModels`, `queryParticipantLessonFeedbackReadModels`, `queryParticipantOccupancyReadModels`, `queryParticipantProgressHistoryReadModels`, `queryParticipantProgressReadModels`, `queryTestSessionReadModels`, `resolveInstructorLessonRevenue`.

### Повторное независимое ревью

Отдельный агент проверил current-role authorization, cursor visibility, несовпадающие scope/registry, подписки, выдачу защищённых изображений и назначение TestActor. После ревью сервер ограничивает совместимый scan 1 000 документами и связывает зашифрованный курсор с видимой записью, субъектом, scope и формой запроса. GET перед отправкой байтов сверяет неизменность пути и сессии, POST делает ту же сверку перед записью. Для целевого TestActor сервер требует совпадение `accountId` и ID registry-документа и отклоняет неоднозначные результаты. Старые клиентские URL в проверяемых TEST-префиксах переводятся в авторизованный fetch.

### Проверки продолжения

| Проверка | Итог |
| --- | --- |
| `test:quick` | PASS, 2 823 Vitest и 59 Node guard tests (2 882), повтор вне sandbox завершился с кодом 0. Первоначальный запуск блокировал локальные sparse clones для двух тестов Git provenance (`NtCreateDirectoryObject`, `0xC0000022`). В отдельном повторе provenance также прошёл 3/3. Playwright discovery не считается браузерным E2E. |
| `test:chat-media` | PASS, 37/37 Rules и интеграционных тестов и 33/33 серверных теста с Auth, Firestore и Storage Emulator, код завершения 0. HTTP-регрессия подтверждает TEST-загрузку владельцем, изоляцию файла другого участника, отзыв после отмены Booking, смены связи Instructor и блокировки сессии, а также отказ при несогласованном registry ID. |
| `test:emulators` | PASS, 215/215, 7 файлов, код завершения 0. До успешного повтора два запуска упирались в таймауты сценария на 50 источников и setup hook в homework history. Изолированный повтор двух затронутых файлов прошёл 10/10 после увеличения таймаутов для setup, сценария и ожидания подписки. |
| TypeScript | PASS, `npm run test:quick:types` для app, shared-domain и Functions. |
| ESLint | PASS, 0 ошибок. Baseline и причины предупреждений приведены выше. |
| Production build | PASS, `npm run build:prod`. Сохраняется предупреждение Vite о крупных chunks. |
| Inventory | PASS, 718 файлов, 698 required, 10 suites. |
| Graphify | PASS, `graphify update .`, 16 914 узлов, 49 744 ребра, 461 community. |
| `git diff --check` | PASS. |

### Остаточные блокеры и риски

- **Отдельная функциональность — сохранение нового TEST-аватара из Participant UI.** Клиент загружает файл через сервер, который сам выбирает защищённое место для TEST. Сохранение нового `avatarUrl` по-прежнему вызывает `update_participant_profile`, для которого действующая политика возвращает `T42B-8_DEFERRED` в TEST. Успешный HTTP upload сам по себе не подтверждает завершение этого потока.
- **Частично проверено в Chromium.** Актуальные результаты по входу, чату и аватару приведены ниже. Автоматическое переключение UI на чат-поток после отказа Firestore SDK и переподключение сигналов при смене TestActor assignment отдельно не проверялись.
- **DEFERRED — индексы TEST Session.** Все три определения отсутствуют в staging и production. LIVE-запросы используют существующие определения без полей TEST Session. Совместимость других форм запросов с реальными LIVE/TEST данными отдельно не проверялась. Ревизии invalidation signals вне активной сессии закрыты правилами; cleanup документов сигналов при завершении/сбросе сессии отдельно не проверен.
- Ревокация действует на последующие защищённые запросы. Уже переданные байты могут остаться в открытой вкладке или у получателя. В прочитанных защищённых префиксах счётчик download tokens равен нулю. LIVE Participant-аватары публичны по согласованному контракту.

**Migration Impact: NOT REQUIRED.** Агрегаты staging и production приведены выше. В существующей ветке нет commit, push, merge, deploy, миграций или записей в Firebase staging/production.


## Уточнение по аватарам и проверка целевых окружений

Storage SDK остаётся рабочим маршрутом для существующих публичных LIVE-аватаров Account (`avatars/{uid}`). Для LIVE Participant-аватаров чтение публичное, а запись сверяет активный Account, отсутствие TestActor registry и текущее право управления Participant. Даже упрощённый вариант через owner guard требует трёх независимых документов. Для TEST также нужны текущие assignment, активная Test Session, membership и подтверждение отношения к целевому Participant. Инструкторское право может зависеть от текущего Booking и состояния связи. Storage Rules допускают до двух документов Firestore за запрос. В имеющейся модели переход на прямую SDK-загрузку этих путей не сохраняет все условия доступа. [Лимит Storage Rules](https://firebase.google.com/docs/storage/security/rules-conditions#enhance_with_cloud_firestore)

`getBlob()` и `getBytes()` загружают байты через Storage Rules. В установленной версии Firebase Emulator Firebase upload API автоматически добавляет download token при загрузке с обычными metadata. Отказ от вызова `getDownloadURL()` в клиентском коде не исключает создание токена. Поэтому прямой SDK-доступ к защищённым TEST-объектам остаётся закрыт. Сохранили существующий `protectedImages` с авторизацией перед выдачей, приватным кешированием `no-store` и записью без download token. Маршруты для чата и остальных защищённых ресурсов сохранены. [Прямое получение байтов через Firebase SDK](https://firebase.google.com/docs/storage/web/download-files#download_data_directly_from_the_sdk)

### Закрытые проверки F7/F10 в рабочей ветке

| Finding | Подтверждение |
| --- | --- |
| F7 — Firestore, known ID и списки | Emulator 215/215 включает проверки отказа для прямых SDK-запросов, чужой TEST-сессии, legacy alias и серверных Admin SDK read models. |
| F7 — Storage и чат | Emulator 70/70 подтверждает отказ при прямом SDK-доступе к защищённым объектам, межсессионном чтении, устаревшем назначении, смене владельца и несовпадении registry ID. |
| F10 — Account и отзыв доступа | Emulator подтверждает проверку активного Account, обязательную роль admin, сохранение bootstrap и отзыв защищённого доступа после отмены занятия, изменения Instructor linkage или блокировки Test Session. |

### Три составных индекса

Firestore Admin API `ListIndexes` вернул HTTP 200 для обеих баз `(default)`. Сопоставлены точный набор и порядок полей, `queryScope=COLLECTION` и автоматически добавляемый `__name__` в направлении последнего поля. Данные коллекций и конфигурация не изменялись. [Описание Index API](https://docs.cloud.google.com/firestore/docs/reference/rest/Shared.Types#Index)

| Определение после равенств по `dataScope`, `testSessionId`, `userId` | Staging | Production |
| --- | --- | --- |
| `notifications`, `timestamp DESC` | ABSENT | ABSENT |
| `notifications`, `timestamp ASC` | ABSENT | ABSENT |
| `activity_logs`, `timestamp DESC` | ABSENT | ABSENT |

Связанные TEST-запросы и развёртывание этих трёх индексов отложены. Для LIVE их состояние не является условием rollout.

### Отдельная задача по TEST-аватару

Подготовлен локальный тикет `.scratch/canonical-booking-domain-rewrite/issues/test-participant-avatar-editing.md`. `T42B-8_DEFERRED` применяется к команде редактирования профиля, включая сохранение нового `avatarUrl`, и не отменяет действующую проверку чтения или загрузки объекта. Работа по изменению политики и сохранению ссылки вынесена в отдельную задачу.

### Браузерные проверки перед финальной проверкой подписок

Приложение и Functions собраны заново перед повтором Chromium E2E на локальных Auth, Firestore, Storage и Functions Emulator. Результаты по свежей сборке:

| Сценарий | Итог |
| --- | --- |
| Вход студента и открытие кабинета | PASS |
| Чат после входа студента, инструктора и администратора | PASS. Загрузка, повторное открытие и воспроизведение медиа, отказ при обращении из чужой области, отзыв после смены владельца или Instructor linkage. |
| Серверный чат-поток в браузере | PASS. Chromium получил начальный SSE frame, затем `event: denied` после отзыва владельца. |
| TEST-аватар через существующий обработчик | PASS. Авторизованная запись 201 и получение байтов 200 с `private, no-store`; чужой Account и прежний владелец после блокировки сессии получили 403. Новый объект без `firebaseStorageDownloadTokens`. |
| Вход администратора и открытие вкладки ролей | PASS в отдельном повторе (1/1). Первый прогон остановился при логине с `client is offline`; утверждения по каталогу тогда не выполнились. |

Наблюдение за автоматическим fallback Firestore SDK в UI и переподключением подписок при смене assignment находится за пределами перечисленных браузерных сценариев. Эти сценарии остаются NOT VERIFIED. Chromium подтвердил три сценария в двух прогонах на demo-проекте. Леджеры обоих прогонов зафиксировали ноль попыток обращения к облачному Firestore. Сборки `build:e2e` и `build:functions`, inventory, Prettier для изменённого сценария и `git diff --check` прошли. Commit, push, merge, deploy и изменения в облачных проектах не выполнялись.


## Финальная проверка подписок и план индексов staging

### Результаты Browser E2E на demo-эмуляторах

| Сценарий | Результат |
| --- | --- |
| Автоматический переход на чат-поток | **PASS.** Реальный UI открыл диалог и самостоятельно запустил авторизованный запрос `chatMessagesStream`. Chromium показал исходное сообщение и следующее обновление после записи в Firestore. Финальный прогон на Rules с явным fallback для восьми участников — 1/1, код 0. |
| Отзыв доступа к старому потоку и восстановление интерфейса | **PASS.** После смены owner guard обе строки исчезли из открытого чата. После восстановления права переоткрытый диалог снова показал разрешённый поток. Отдельная предыдущая проверка получила `event: denied` от сервера. |
| Смена TEST-назначения инструктора | **PASS.** Наблюдалась реальная Firestore-подписка на выручку. При переходе A → B на одном экране обновилась проекция B, а новое значение, записанное в старую A, осталось скрытым. |
| Переключение Participant | **PASS.** Реальные сессии студента и инструктора. При смене Participant guard наблюдал DOM на появление комментариев прежнего профиля, переходы между представлениями продолжили работать. Это отдельный сценарий от TEST-переключения проекции инструктора. |

Длинный медиа-тест при текущем повторе остановился на загрузке вложения до проверки переключения подписок. Его исторический PASS сохранён выше, текущее подтверждение fallback получено отдельным сфокусированным тестом сообщений. Леджеры прогона зафиксировали 0 попыток облачного Firestore. Проверены только локальные Auth, Firestore, Functions и Storage Emulator. Связанные проверки — Firebase Emulator 216/216, unit 50/50, TypeScript, E2E build, Graphify, inventory (719 файлов, 699 required), целевой ESLint и `git diff --check`. Независимое ревью подтвердило, что явный fallback не добавляет прав чтения.

**Ограничения.** Комбинированный переход активной TEST Session и выбранного Participant в одном браузерном действии отдельно не прогонялся. Возможное повторное открытие экрана после реактивации того же assignment ID описано ниже. Проверка этих индексов на READY понадобится только при возобновлении rollout TEST Session.

### Изменения подписок

Подписка чата отбрасывает кэш Firestore до подтверждения сервером. При отказе она сбрасывает строки потока, а серверный fallback использует существующий SSE. Рендер привязан к текущему UID и набору thread IDs, чтобы строки предыдущего диалога не попали в первый рендер после переключения. При групповой записи с восемью Participant Rules явно отправляют владельцев на server fallback, сохраняя прямую ветку для назначенного инструктора и администратора. В таком случае три обращения уходят на Account, Booking и TEST registry, а восемь owner-проверок превышают оставшийся бюджет. Для групп больше восьми сохранена прежняя ограниченная ветка прямого чтения. Текущий серверный путь владельца рассчитан на восемь участников.

Scoped reads получают уведомление об изменении собственного `test_actor_assignments/{uid}`. Rules разрешают точечное чтение активному TEST Account с подходящей записью TestActor. Чужие документы, list и клиентские записи закрыты. Перед показом нового набора клиент сверяет подтверждённое назначение, удаляет старую подписку и отбрасывает поздние ответы запроса из старой области. Панель выручки инструктора использует тот же сигнал для смены точного пути проекции.

Ограничение независимого ревью. Если TEST Session временно заблокирована или сброшена, а затем реактивирована с тем же assignment ID, текущие подписки могут потребовать повторного открытия экрана. Переход между разными assignment ID покрывается отдельно. Маршруты аватаров и политика T42B-8 в этом этапе не изменялись.

### Зависимость LIVE от трёх индексов

Три запроса проходят через `queryScopedClientDocuments`. Для TEST сервер добавляет `dataScope == 'test'` и `testSessionId == <действующее назначение>`. Для LIVE сервер отправляет запрос без этих двух условий и отбрасывает записи вне LIVE после чтения. Для всех трёх форм LIVE в `firestore.indexes.json` уже есть соответствующие определения `userId ASC, timestamp <направление>`. `__name__` дополняет порядок в направлении последнего поля.

| Индекс TEST с префиксом `dataScope ASC, testSessionId ASC, userId ASC` | Запрос по `userId == UID` | Нужен для LIVE | Последствие без deploy |
| --- | --- | --- | --- |
| `notifications`, `timestamp DESC, __name__ DESC` | `useNotificationsSync`, подписка на последние уведомления | Нет | TEST-список и его обновления — DEFERRED. LIVE-уведомления эти поля не используют. |
| `notifications`, `timestamp ASC, __name__ ASC` | `purgeExpiredNotificationsForUser`, условие `timestamp < cutoffIso`, постраничный обход от старых к новым | Нет | Клиентская очистка уведомлений в TEST — DEFERRED. LIVE-очистка и серверный scheduler не зависят от этого индекса. Scheduler фильтрует только по `timestamp`. |
| `activity_logs`, `timestamp DESC, __name__ DESC` | `useProfileActivitySync`, подписка на последние записи истории активности | Нет | TEST-история и её обновления — DEFERRED. LIVE-история эти поля не использует. |

Повторный read-only `ListIndexes` ранее подтвердил отсутствие всех трёх определений в обоих окружениях. В этой проверке сверены исходный код и манифест. Тесты и удалённая сверка состояния индексов повторно не запускались. Все три определения сохранены в JSON для будущей работы с TEST Session и исключены из минимального плана LIVE.

### DEFERRED — будущий порядок deploy индексов TEST только в staging

1. После разрешения на изменения проверить текущие определения командой `list` ниже. Если индекс уже создан, сверить точный состав и состояние.
2. Создать только недостающие определения. По одному индексу на команду. Этот способ не применяет весь манифест и не удаляет существующие индексы. [Параметры gcloud create](https://docs.cloud.google.com/sdk/gcloud/reference/firestore/indexes/composite/create)
3. Командой `list` проверить состояние `READY` всех трёх определений и точное направление `__name__`.
4. Только после READY и отдельного разрешения на приложение развернуть зависимые Functions и триггеры, затем Firestore и Storage Rules и вслед за ними Hosting. Проверить staging запросы на чтение уведомлений, очистку просроченных записей и историю активности. Этот этап не входит в команды создания индексов.

```powershell
# Только при будущем разрешении. Повторить list после create.
gcloud firestore indexes composite list --project=ski-school-staging --database='(default)' --format=json

gcloud firestore indexes composite create --project=ski-school-staging --database='(default)' --collection-group=notifications --query-scope=collection --field-config='field-path=dataScope,order=ascending' --field-config='field-path=testSessionId,order=ascending' --field-config='field-path=userId,order=ascending' --field-config='field-path=timestamp,order=descending'

gcloud firestore indexes composite create --project=ski-school-staging --database='(default)' --collection-group=notifications --query-scope=collection --field-config='field-path=dataScope,order=ascending' --field-config='field-path=testSessionId,order=ascending' --field-config='field-path=userId,order=ascending' --field-config='field-path=timestamp,order=ascending'

gcloud firestore indexes composite create --project=ski-school-staging --database='(default)' --collection-group=activity_logs --query-scope=collection --field-config='field-path=dataScope,order=ascending' --field-config='field-path=testSessionId,order=ascending' --field-config='field-path=userId,order=ascending' --field-config='field-path=timestamp,order=descending'
```

Проверка отсутствия выполнена через Firestore Admin API с текущими ADC. Попытка чтения через установленный `gcloud` на этой машине остановилась на TLS-проверке сертификата. Для будущих CLI-команд требуется доверенное подключение и учётные данные с правом создания индексов.

**Индексный этап LIVE в staging не требуется.** Развёртывание трёх TEST-индексов — DEFERRED. Команды выше не выполнялись.
