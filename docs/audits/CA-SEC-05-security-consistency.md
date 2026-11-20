# CA-SEC-05. Согласованность серверной авторизации

Ветка `fix/ca-sec-05-security-consistency` начинается с `2dbe3837` (CA-SEC-04) и включает `87366601` (CA-SEC-03). Исторический файл `CA-SEC-02-authorization-audit-2026-11-17.md` отсутствует в рабочем дереве и доступной локальной истории Git. Сверка опирается на формулировки задания, текущие исходники, тесты и [отчёт CA-SEC-04](CA-SEC-04-command-policy-implementation.md).

## Результаты проверки

| ID | Подтверждение и результат |
| --- | --- |
| F4 | Подтверждено для создания Lesson Booking с существующим `unmanaged_guest`. Повторное использование требует подписанного полномочия на привязку существующего Booking и совпадения Participant, гостевого субъекта и атрибуции создания в LIVE. Создание нового Participant сохраняется. |
| F5 | Подтверждено. Атомарные операции canonical callable повторно проверяют роль и активность Account в том же снимке Firestore, который используется для записи. Проверка применяется и перед возвратом ранее сохранённого административного результата. Ограничения `systemRole=owner` в обработчиках `change_account_role` и `disable_account` сохранены. Создание TEST-сессии и начало reset/delete также проверяют роль и TestActor при резервировании или выдаче lease. |
| F6 | Подтверждена граница эксплуатационного контроля. Общий reset проверяет среду и ADC, требует краткоживущего подтверждения в TTY, ведёт транзакционные lease, checkpoint и историю. Изоляция writers требует внешнего подтверждения. Отдельная очистка staging fixtures имеет более узкую область по манифесту и полагается на staging IAM. |
| F7 | Подтверждено расхождение административных TEST-поверхностей. TEST lifecycle и запросы списка/каталога применяют явный запрет для зарегистрированных TestActor. Логическая поддержка TEST внутри production-проекта закреплена в ADR. Гостевой callable остаётся LIVE. Прямые клиентские чтения, где Rules пока не обеспечивают полную изоляцию TEST, требуют отдельного этапа. |
| F8 | **RESOLVED — VERIFIED.** 103 политики для 103 видов команд. Политика вызывается до обработчика, два вида явно недоступны, неизвестный вид получает отказ. Проверены сочетания доверенного источника, capability и TEST/LIVE, проверки ресурсов в обработчиках и применение политики к внутренней финансовой сверке. |
| F9 | Подтверждён недостаток диагностики отказов. Canonical callable и TEST lifecycle записывают структурированные события с типом актора, хешированной ссылкой, видом операции, кодом и областью. Корреляция включается при валидном идентификаторе. Записи обрезаются после 30 событий за минуту на экземпляр Functions. Успешные административные мутации используют существующий доменный аудит. |
| F10 | Подтверждено расхождение контрактов. Rules сохраняют совместимость с legacy-профилями без lifecycle и допускают `systemRole=owner` на отдельных поверхностях. Canonical callable требует `role=admin` и совпадающий активный Account. Изменение требует согласования owner-only политики и миграции. |
| F11 | Подтверждено для результатов гостевого создания, содержащих credentials. Авторизация выдачи теперь отделена от сохранённых доменных эффектов. Повтор с приватным ключом той же попытки проверяет подпись, срок действия и текущую принадлежность ресурса. Эквивалентная попытка с другим ключом получает отказ в выдаче credentials для существующего CourseEnrollment. |

## Границы и решения перед production

### F6. Staging reset

`functions/scripts/data-reset/cli.cjs` блокирует production apply/bootstrap до открытия Admin SDK и привязывает staging apply к проверенному ADC principal. `adcIdentity.cjs` сверяет идентичность с выданным токеном. `authorization.cjs` подтверждает проект, операцию и источник плана, ведёт lease и checkpoint и ограничивает историю 100 записями. Recovery привязан к исходному плану. Lease координирует процессы reset, а независимые writers останавливаются внешней процедурой. Общий reset и fixture reset имеют разные границы эксплуатации. [Staging reset authorization](../operations/staging-reset-authorization.md)

Варианты на согласование. Сохранить действующее окно остановки/дренирования writers и зафиксировать доказательства его прохождения, либо утвердить внешний запрет записи на время обслуживания и независимо проверяемое подтверждение оператора. Для `stagingFixturesCli.ts` отдельно выбрать действующий доступ узкой роли с Cloud Audit Logs или общий процесс подтверждения и lease.

### F7 и F10. TEST/LIVE и Rules

Сервер допускает TEST для активной сессии, назначенной TestActor или явно выбранной активным администратором. TestActor ограничен назначенной сессией. Гости и публичные сценарии используют LIVE. Конфигурация проектов в `.firebaserc` и server-side scope policy допускают логическую изоляцию в production-проекте без отдельного флага TEST. План T42B-8 фиксирует исходный rollout, отложенное включение Firestore Rules и совместимость `missingDataScope=legacy_live`. Фактическая текущая конфигурация production отдельно не проверялась. [План T42B-8](../T42B8_PRODUCTION_CUTOVER_PLAN.md)

Для выравнивания Firestore/Storage Rules и canonical Account нужна согласованная инвентаризация профилей без lifecycle, owner-only аккаунтов и потребителей прямых публичных чтений. Затем нужно определить эффективные полномочия owner-only, сохранить совместимость signup, обновить scoped-запросы и проверить Rules в эмуляторе перед поэтапным включением. Storage-проверка TEST registry и ограничения текущего назначения также входят в этот этап. Дополнительный project-level gate для TEST lifecycle требует отдельного согласования с архитектурой T42B.

Отсутствующий lifecycle допустим при существующем signup. `disabled` закрывает административный доступ в обоих Rules. Часть прямых чтений `courses`, `instructors` и availability ещё опирается на публичный контракт, а проверка TEST-пути Storage подтверждает `allowed` в реестре без чтения текущего назначения canonical read resolver. [Firestore Rules](../../firestore.rules) [Storage Rules](../../storage.rules)

В TEST lifecycle новая транзакционная проверка выполняется при резервировании новой сессии, публикации preview, первом изменении close, явном retry provisioning и получении lease на reset/delete. Ошибка до успешного допуска retry не меняет статус сессии. Уже принятые операции продолжаются под lease с действующим recovery. Изменение политики отзыва для уже принятой многофазной операции требует отдельного решения.

### F11. Совместимость повторов

Текущий Course UI хранит приватный ключ в рамках одной открытой попытки. Для старой вкладки с предсказуемым ключом первый успешный запрос сохраняет существующий контракт. Повтор такого запроса после потери ответа больше не возвращает защищённые данные. Браузер без Web Crypto останавливает новую попытку CourseEnrollment до отправки. При выпуске новый клиент следует доставить до включения серверного ограничения на выдачу данных при повторе. TTL существующих записей идемпотентности и lifecycle остаётся действующим.

Повторы гостевой отмены сохраняют существующий минимальный ответ о результате без credentials. Отдельный контракт общего Participant для гостевых курсов проверен в существующих тестах и оставлен для продуктового решения о правилах владения и восстановления между курсами.

## Стоимость Firestore

- F4 добавляет точечное чтение исходного Booking только на ветке повторного использования Participant. Привязка проверяется в той же транзакции.
- F5 использует одно точечное чтение `users/{uid}` внутри каждой защищённой транзакции. Когда обработчик уже читает этот Account, используется тот же снимок. Маршрутизация callable и её предварительное чтение остаются необходимыми для выбора режима и scope.
- F7 добавляет точечное чтение `test_actors/{uid}` для списка/каталога и проверки lifecycle на входе. Проверки в reserve/lease транзакциях читают два документа, canonical Account и TestActor.
- F9 пишет в существующее структурированное логирование Functions. Firestore-записей, новых scheduler, периодического чтения или сканирования для исправлений нет.
- F11 добавляет одно точечное чтение Booking или CourseEnrollment при повторе защищённого результата с валидным приватным ключом и credentials. Обычные повторы команд сохраняют существующую форму доступа.
- Staging reset сохраняет существующие ограничения. Предел манифеста 10 000 ссылок на документы и 5 000 записей metadata, страница 100, конкуренция 4. Полный план сканируется в рамках заданных пределов. [Операционный регламент](../operations/staging-reset-authorization.md)

## Проверки и независимое ревью

| Проверка | Результат |
| --- | --- |
| Целевые Functions unit | PASS, 219 тестов в 10 файлах. Повтор CA-SEC-03 и гостевых регрессий после обновления фикстур — PASS, 193 теста в шести файлах. Выборки пересекаются. |
| Firebase Emulator, демо-проект | PASS, 95 тестов из 95 в семи файлах. Проверены Lesson/Course гости, роль администратора, TEST lifecycle, TEST/LIVE, финансовая сверка и идемпотентность. Ноль попыток исходящего доступа к Cloud Firestore. |
| E2E smoke, Chromium и демо-эмуляторы | PASS, 19 из 19, 0 пропусков и 0 попыток исходящего доступа к Cloud Firestore. Первый прогон был прерван после таймаутов инициализации Functions Emulator. Повтор прошёл с `FUNCTIONS_DISCOVERY_TIMEOUT=60`. |
| TypeScript, shared-domain, приложение и Functions | PASS, стадия типов в итоговом `test:quick`. |
| `test:quick` | PASS, 2 870 тестов, 0 падений. |
| ESLint | PASS, `eslint . --quiet`. |
| Functions build | PASS, `npm run build:functions` после финального изменения. |
| Production build | PASS, `npm run build:prod`. |
| Test inventory | PASS, 718 файлов, 698 обязательных, без дубликатов. |
| Graphify | PASS, `graphify update .`. |
| `git diff --check` | PASS. |

Независимое ревью обнаружило, что отказы F4/F11 попадали в транспортный `unauthenticated` и пропускались структурированным логированием. Проверка доверенного canonical кода добавлена. Ревью также потребовало проверить текущий Booking или CourseEnrollment перед выдачей сохранённых credentials и закрыть первую запись при повторном provisioning, включая ошибки до допуска. Все три изменения перепроверены. Регрессии покрывают отзыв роли до начала `disable_account`, `change_account_role` и операций TEST lifecycle, исчезновение или привязку гостевого ресурса, истечение и смену ключа подписи, а также отсутствие повторных эффектов.

## Изменённые файлы

- Canonical Commands и транзакции. `canonicalCommandRuntime.ts`, `executeCanonicalCommandCallable.ts`, `executeGuestCanonicalCommandCallable.ts`, `idempotentCommandExecution.ts`, `securityCommandLogging.ts`, `firestoreTransactionExecutor.ts`.
- Booking и CourseEnrollment. `guestBookingAuthorization.ts`, `guestBookingCommands.ts`, `courseEnrollmentCommands.ts`.
- TEST. `canonicalReadScopeResolver.ts`, `queryTestSessionReadModelsCallable.ts`, `executeTestSessionLifecycleCallable.ts`, `testSessionLifecycleEngine.ts`.
- Общие контракты и клиент. `commandIntents.ts`, `guestCredential.ts`, `deriveEnrollmentIds.ts`, `useCourseEnrollmentCommands.ts`, `CourseEnrollmentModal.tsx`, `deriveBookingIds.ts`.
- Booking-тесты. `adminGuestBookingLinkCommands.test.ts`, `bookingRescheduleCommands.test.ts`, `guestBookingCommands.test.ts`, `guestBookingCommands.emulator.test.ts`.
- Course-тесты. `courseEnrollmentCommands.test.ts`, `guestCourseEnrollmentLinkCommands.test.ts`, `guestCourseEnrollmentTransport.emulator.test.ts`.
- Авторизация и TEST. `executeCanonicalCommandCallable.test.ts`, `identityAdministrationCommands.emulator.test.ts`, `queryTestSessionReadModelsCallable.test.ts`, `executeTestSessionLifecycleCallable.test.ts`, `testSessionLifecycleEngine.emulator.test.ts`, `scripts/testManifest.inventory.json`.
- Отчёт. `docs/audits/CA-SEC-05-security-consistency.md`.

## Deploy impact

| Компонент | Влияние |
| --- | --- |
| Functions | `executeCanonicalCommand`, `executeGuestCanonicalCommand`, `executeTestSessionLifecycle`, `queryTestSessionReadModels`. |
| Hosting | YES, приватный ключ повторов гостевого CourseEnrollment создаётся клиентом. |
| Firestore Rules, Storage Rules, Firestore Indexes | NO для текущего diff. |
| Миграция, настройки среды, IAM | NO для текущего diff. Вопросы отдельного rollout перечислены выше. |
| Schedulers / triggers | Изменения поведения отсутствуют. Общие модули используют `scheduledExpireGuestLessonReservations`, `scheduledExpireGuestCourseReservations`, `scheduledResolveLessonBookingAttendanceOutcomes`, `scheduledResolveCourseEnrollmentOutcomes`, `scheduledReconcileGuestConfirmationMismatches`, `syncGuestBookingConfirmationWork`, `syncGuestEnrollmentConfirmationWork`, `syncGuestPaymentConfirmationWork`. |
