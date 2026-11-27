# CA-SEC-07C — Infrastructure & Data Lifecycle

Проверка 27 ноября 2026 года, Asia/Qyzylorda (UTC+5). Временные отметки облачных API ниже приведены в UTC. Ветка `audit/ca-sec-07c-infrastructure-lifecycle`, исходный SHA `20413eb008378ac35a285dfe80cfab3f9d83c83c`.

## 1. VERDICT

**PARTIAL. Production launch gate открыт.** Подтверждены расхождение production с уже проверяемым в staging набором защитных изменений и отсутствие действующего плана восстановления Firestore, подтверждённого облачной конфигурацией и проверкой восстановления. Доступ к списку бюджетов вернул HTTP 403. Офлайн-проверка публичной базы advisories выполнена. Запуск `npm audit` заблокировала автоматическая проверка разрешений из-за передачи метаданных lockfiles реестру. Проверка авторизованных пользовательских сценариев и восстановление данных потребуют отдельных разрешённых процедур.

## 2. EXECUTIVE SUMMARY

- Production Hosting, активные Rules и provenance labels всех Functions соответствуют `14695f71` от 17 ноября. Staging соответствует текущему `main`. В staging 67 функций, в production 55. У production Image Proxy concurrency 80, у staging 4. В production отсутствует функция отзыва административных сессий.
- В обеих базах Firestore включены одни и те же три TTL policy и готовы 69 одинаковых composite indexes. Три ранее отложенных TEST-only индекса остаются **DEFERRED**.
- В обеих базах отключены PITR и защита от удаления базы. Списки managed backups и backup schedules пусты. У production есть отдельный защищённый bucket и метаданные двух ручных экспортов от 25 и 28 октября. Их содержимое и возможность восстановления **NOT VERIFIED**.
- Все функции используют Node.js 22, Gen 2 и `minInstances=0`. Текущие агрегаты потребления невелики. При росте аудитории основной переменный расход в расчётной модели создаёт передача медиа. Изменение расписания по имеющимся данным не оправдано.

## 3. AUDIT SCOPE

- Git рабочее дерево до аудита чистое. `HEAD`, локальный `main`, `origin/main` и удалённый `refs/heads/main` совпали. Для удалённой сверки использовано доверенное хранилище сертификатов Windows. Graphify использован для навигации, выводы проверены по исходникам и указанным версиям Git.
- База для сопоставления — [CA-SEC-04](CA-SEC-04-command-policy-implementation.md), [CA-SEC-05](CA-SEC-05-security-consistency.md), [CA-SEC-05B](CA-SEC-05B-live-release-readiness.md), [CA-SEC-06A](CA-SEC-06A-media-upload-security.md), [CA-SEC-06B](CA-SEC-06B-media-upload-quotas.md), [CA-SEC-06C](CA-SEC-06C-image-proxy-cost-protection.md), [CA-SEC-07A](CA-SEC-07A-app-check.md), [CA-SEC-07B](CA-SEC-07B-administrator-security.md). Отдельного файла CA-SEC-03 в `docs/audits` нет. Связанные решения проверены по CA-SEC-04/05 и squash-коммиту `c88949d6`.
- Облако проверялось через команды list и HTTP GET. Использованы API Functions v1/v2, Firestore Admin, ограниченные GET с маской полей Firestore, Cloud Storage, Scheduler, Eventarc, Cloud Asset IAM, Secret Manager, Firebase Rules, Hosting, Auth, App Check и Cloud Monitoring. Значения секретов, содержимое Storage и пользовательские записи целиком не выгружались. Изоляция TEST Session и Starter Credit находятся вне работ CA-SEC-07C.
- **VERIFIED** применяется к конкретному облачному факту либо факту исходного кода. **NOT VERIFIED** применяется к непроверенной гипотезе или ограничению доступа. **NOT APPLICABLE** означает отсутствие применимого механизма. **DEFERRED** означает ранее согласованную отсрочку.

## 4. ENVIRONMENT INVENTORY

| Ресурс | Staging | Production |
| --- | --- | --- |
| Project / Hosting | `ski-school-staging`, один сайт | `ski-school-8f3ca`, сайты `ski-school-8f3ca` и `carveacademy` |
| Firestore | Единственная база `(default)`, Native, Europe multi-region `eur3` | То же, отдельный проект |
| Storage приложения | `ski-school-staging.firebasestorage.app`, `us-east1` | `ski-school-8f3ca.firebasestorage.app`, `us-east1` |
| Functions / Eventarc | 67 в `us-central1`, 14 Firestore triggers в `eur3` | 55 в `us-central1`, 8 Firestore triggers в `eur3` |
| Scheduler | 7 enabled в `us-central1` | Те же 7 enabled в `us-central1` |
| Rules | `cloud.firestore` и Storage app bucket, SHA-256 совпали с `20413eb0` | Оба активных Rules release совпали с `14695f71`. Также остался release с именем `cloud.firestore/null`. Отдельной базы в списке нет, назначение этой записи **NOT VERIFIED** |
| Auth / App Check | Firebase Auth, email включён, MFA отключена. Firestore, Storage и Auth `UNENFORCED` | То же, с отличиями в authorized domains |
| Локальные тесты | `demo-*` и loopback Firebase Emulators согласно [emulator-config.ts](../../e2e/emulator-config.ts), [сетевому guard](../../scripts/testFirestoreNetworkGuard.cjs) и [CI](../../.github/workflows/ci.yml). Запуск эмуляторов для этого аудита **NOT RUN** | **NOT APPLICABLE** |

## 5. FINDINGS — P0/P1/P2/P3

| ID | Severity / статус | Факт и доказательство | Риск и возможный ущерб | Предлагаемое действие, сложность, стоимость, согласование |
| --- | --- | --- | --- | --- |
| 07C-01 | P1 / VERIFIED, расхождение релиза | Production Hosting и Rules на `14695f71`, отсутствуют 12 Functions из текущего `main`, Image Proxy 80 против 4 по concurrency. Firebase Hosting/Rules и Functions v2 API, §4/8/17 | Продолжает действовать старый набор защит CA-SEC-05B–07B. В числе последствий выше риск расходов Image Proxy и недоступность серверного отзыва сессий администратора | Подтвердить текущий staging release авторизованной проверкой и согласовать выпуск связанного набора безопасности. Средняя сложность, обычный build/deploy, Functions, Firestore Rules, Storage Rules и оба Hosting sites. Требуется одобрение |
| 07C-02 | P1 / VERIFIED, DR gap | В production PITR и DB delete protection отключены, managed backups и schedules пусты, последний найденный export marker 28 октября. Firestore Admin и Storage metadata, §16 | Ошибочное изменение финансового или учебного состояния может потребовать ручного восстановления более чем за 29 дней либо привести к невосстановимым потерям. Доступность экспорта ещё требует подтверждения | Согласовать RPO/RTO, включить защиту базы от удаления по разрешению, выбрать резервную копию с проверкой восстановления в изолированной базе. Средняя сложность, тарифы в §16, настройки Firestore и отдельная операция восстановления. Требуется одобрение |
| 07C-03 | P2 / VERIFIED, широкие права | Default Compute SA — runtime всех 67/55 Functions и имеет project Editor. У Firebase Admin SDK SA project-level Storage Admin и Token Creator, прямых пользовательских ключей не обнаружено. Cloud Asset IAM, §11 | Компрометация одного runtime имеет большой радиус внутри соответствующего проекта, включая Firestore/Storage и прочие ресурсы, доступные роли. Отзыв роли без замены остановит записи, триггеры или Auth | Проверить фактические разрешения и зависимости; проверить отдельный runtime сначала в staging с минимальными правами. Средняя сложность, в основном инженерное время, IAM и конфигурация затронутых Functions. Требуется одобрение |
| 07C-04 | P2 / VERIFIED, потенциальные расходы и задержка | `scheduledPurgeExpiredNotifications` обрабатывает страницы по 500 до опустошения выборки, верхнего предела запуска нет. Outbox cleanup следует после неё. [Исходник](../../functions/src/purgeExpiredNotifications.ts), §9 | При крупном backlog один запуск может исчерпать 60 секунд и задержать outbox cleanup. Фактического инцидента не установлено | Сначала измерить backlog и длительность. Если предел проявляется, ограничить страницы за запуск и обеспечить независимый запуск terminal outbox cleanup в рамках существующего job. Небольшая/средняя сложность, без нового облачного сервиса. Требуется одобрение изменения функции |
| 07C-05 | P2 / VERIFIED, неоднородный retention | Три первых production `error_logs` в маскированной выборке не имеют `deleteAt`. TTL активна. Production Rules и код очистки также проверены, §6/10 | Старые строки могут пережить целевое окно хранения. Масштаб и состав исторических записей неизвестны | Сначала определить возраст и объём по согласованной ограниченной выборке, затем применить согласованную политику к историческим продуктовым логам. Небольшая сложность оценки, возможны платные reads/writes/deletes. Миграция или очистка требуют одобрения |
| 07C-06 | P2 / VERIFIED, потенциальный риск Auth | В production authorized domains остаются два прежних адреса, помимо действующих Hosting/Firebase доменов и localhost. Identity Toolkit config, §13 | Дополнительная поверхность OAuth redirect и зависимость от давних доменов. Сторонний контроль и фактическое использование не установлены | Подтвердить владельца и назначение каждого адреса. Удаление только после проверки Google/email flows. Небольшая сложность и стоимость, изменение Auth configuration требует одобрения |
| 07C-07 | P2 / VERIFIED в исходнике, рост хранения | В app buckets нет lifecycle rules. Image Proxy cache и временные/непривязанные media paths имеют разные контракты. Storage API и §7 | Накопление сгенерированных и незавершённых объектов возможно. Объём и экономия по префиксам **NOT VERIFIED** | Продолжить CA-SEC-06B dry run только по точным префиксам и поколениям после оценки объёма. Небольшая сложность диагностики, стоимость list и bounded reads. Любая очистка требует отдельного согласования |
| 07C-08 | P3 / VERIFIED, обычная оптимизация | `gcf-artifacts` без cleanup policy в обоих проектах, текущий размер 0,79/0,64 GiB. Artifact Registry metadata, §15 | Небольшой рост хранения после повторных сборок. Слишком агрессивная политика осложнит rollback | Оставить как есть при текущем объёме. При устойчивом росте согласовать сохранение rollback-образов и только тогда проверить dry run. Небольшая сложность, нынешний максимум экономии нескольких центов в месяц |
| 07C-09 | P2 / VERIFIED, затронутые lockfile версии | 12 публичных advisories совпали с текущими и release lockfiles. Из них три относятся к транзитивным Functions runtime пакетам. Необходимый атакуемый input по проверенным обработчикам не установлен. §14 | Возможное увеличение CPU или work после таймаута, если уязвимые API станут достижимы через SDK или будущий код. Остальные совпадения ограничены dev toolchain по найденным путям | Планово обновить совместимые upstream зависимости, проверить workload и regressions из §14. Средняя сложность из-за major ranges. Functions deploy для runtime lock, CI для dev-only. Требуется одобрение |

## 6. FIRESTORE TTL & DATA LIFECYCLE

Firestore удаляет документы асинхронно. Обычно задержка до 24 часов, жёсткого срока нет. Истёкший документ может читаться до удаления. TTL не удаляет subcollections, а TTL delete оплачивается и может вызвать Firestore triggers. Очереди и временные ключи сохраняют собственные проверки времени. [Firestore TTL](https://cloud.google.com/firestore/docs/ttl).

| Коллекция или сущность | Кто создаёт и как проверяется срок | Физическое хранение / решение |
| --- | --- | --- |
| `security_request_limits`, обычные счётчики | Callable wrapper и дополнительные admission checks. `resetAt` — число мс, проверяется до подсчёта. `deleteAt` JS Date записывается как Firestore Timestamp, 24 ч после reset | **ACTIVE** в обоих проектах. Staging 3/3 Timestamp в выборке. В production выборка пуста. Один документ на ключ защиты, повторные обращения переписывают документ. Сохранить механизм, без отдельной архивной обязанности. [requestAdmission.ts](../../functions/src/security/requestAdmission.ts) |
| `security_request_limits`, media quota и leases | Один документ на account+тип. Окна 10 мин для количества и 60 мин для байт. Lease 3 мин, ID и срок перепроверяются перед списанием, освобождение по ID. `deleteAt` Timestamp через JS Date, 24 ч от получения lease | Та же **ACTIVE** policy. Отдельной коллекции upload reservations нет. Выдача lease, списание и освобождение могут сформировать по записи. Досрочное удаление снимает защиту. [liveMediaUploadQuota.ts](../../functions/src/security/liveMediaUploadQuota.ts) |
| `security_request_limits/image_global_misses` | Один глобальный координационный документ. Deadline lease и reset — числовые мс, проверяются в транзакции. `deleteAt` Date → Timestamp по окончании окна/lease плюс 24 ч | Та же **ACTIVE** policy. Физическое удаление не участвует в выборе активного lease. Сам cache находится в Storage. [imageMissAdmission.ts](../../functions/src/images/imageMissAdmission.ts) |
| `guest_reservation_admission` | Канонический guest admission. По ключу субъекта перечитываются связанные активные бронирования и сроки; `deleteAt` JS Date привязан к максимальному сроку учтённых резервов | **ACTIVE** в обоих. В обеих выборках пусто. Сохранить контракт, исчерпание срока относится к admission budget, авторитетное бронирование остаётся. [guestReservationAdmission.ts](../../functions/src/canonical/commands/guestReservationAdmission.ts) |
| `error_logs` | Серверная запись в текущем коде добавляет Timestamp `deleteAt` через 30 дней, нормализует категории, исключает произвольный текст и stack. Есть отдельные админские операции очистки | **ACTIVE** в обоих. Staging выборка пуста. Production 3/3 без поля, TTL их не подберёт. Согласовать срок для исторических и security-related журналов, соблюсти нужное окно расследований. [reportClientErrors.ts](../../functions/src/security/reportClientErrors.ts), [manageErrorLogs.ts](../../functions/src/security/manageErrorLogs.ts) |
| `command_idempotency` | Канонический executor читает результат, ключ и fingerprint и сохраняет их в рамках транзакционного контракта. `createdAt` — map CanonicalTimestamp, выборка 3/3 map в обоих | Политики TTL нет. Удаление убирает запись о результате или отказе. Детерминированные MonetaryEvent/Payment IDs, проверки состояния и guards покрывают отдельные пути, для всех финансовых команд равнозначная защита при удалении ключа не доказана. Хранить. [idempotentCommandExecution.ts](../../functions/src/canonical/commands/idempotentCommandExecution.ts), [commandIdempotency.ts](../../packages/shared-domain/src/canonical/commandIdempotency.ts) |
| `function_idempotency` | Отдельный helper транзакционного replay. `createdAt` ISO string, `deleteAt` отсутствует. Текущие маскированные выборки пусты | Политики TTL нет. Reachability исторических deployed callers и необходимость хранения старых результатов **NOT VERIFIED**. Массовый TTL не предлагать. [idempotency.ts](../../functions/src/idempotency.ts) |
| Guest credentials, preview и временный access | Подписанные guest credentials связаны с назначением, субъектом и сроками бронирования или курса. Сервер проверяет подпись, срок и состояние. `instructor_relationships` использует CanonicalTimestamp и проверку при authorization | Самостоятельного TTL для токенов нет. Guest contacts, relationships и история доступа имеют продуктовые зависимости. Хранить до отдельного решения. [guestBookingAuthorization.ts](../../functions/src/canonical/bookings/guestBookingAuthorization.ts), [participantAccessAuthorization.ts](../../functions/src/canonical/participantAccess/participantAccessAuthorization.ts) |
| `bookings`, `course_enrollments`, `payment_requests` | `reservationExpiresAt` и `expiresAt` — canonical maps. Scheduled sweeps и команды применяют нужный переход, проверяя каноническое состояние | Политики TTL нет. Нужна история статусов, выплат и подтверждений. Под `bookings` существуют `messages`, под `payment_requests` — `actions`. Сохранить родителей и историю, включая guest bookings. [Firestore Rules](../../firestore.rules) |
| `availability_slots`, `availability_hour_locks`, ledger guards | Записи резервирования/защиты создаются в канонических транзакциях. Срок или состояние связанного субъекта определяют освобождение ресурса | Политики TTL нет. Не удалять как lease инфраструктуры. Преждевременная очистка может нарушить единственность резерва или денежной операции. [canonical paths](../../packages/shared-domain/src/canonical/paths.ts) |
| `domain_outbox` | Канонические команды создают obligations. Worker проверяет состояние, due time, 4-минутную lease при claims и до 5 попыток; поля сроков — canonical maps | Terminal cleanup — delivered 30 дней, dead letter 90 дней, по времени перехода. Pending/retry/configuration остаются доступны. Сохранить обязательства и аудит, подтвердить версию/провайдера перед изменением. [outboxDeliveryLifecycle.ts](../../packages/shared-domain/src/canonical/outboxDeliveryLifecycle.ts) |
| `notifications` | Outbox и другие продуктовые publishers. `timestamp` ISO string. Scheduled cutoff использует `settings/notification_retention.days`. Staging settings document отсутствует, default 14 дней. Production setting 5 дней. Выборки уведомлений пусты | TTL отсутствует. Штатная очистка работает с датой строки. Пользовательская и outbox семантика потребуют проверки при изменении срока. [purgeExpiredNotifications.ts](../../functions/src/purgeExpiredNotifications.ts) |
| `activity_logs`, canonical audit/events | Прогресс, уровни и команды создают историю, которую читают профиль и проекции. Записи для денег и доменного аудита требуют собственного контракта | TTL отсутствует. Не назначать общий retention поверх продуктовой/аудитной истории. [activityLog.ts](../../src/domain/activity/activityLog.ts), [financeAudit.ts](../../functions/src/canonical/finance/financeAudit.ts) |
| `booking_attendance_outcome_work`, `course_enrollment_outcome_work`, `guest_confirmation_reconciliation_work`, `guest_confirmation_reconciliation_quarantine`, `migration_control`, `system_migrations`, `client_read_runtime` | Триггеры, команды и workers. Рабочие записи привязаны к booking/enrollment/payment, due checks и транзакции предотвращают повтор эффекта. Migration marker и revision signals задают режим работы читающих поверхностей | Общего TTL нет. В work-очередях допустимость удаления терминальных документов зависит от повторной проекции, долгих retries, восстановления и backfill. Quarantine содержит блокирующее свидетельство. Markers и ревизии сохранять, пока на них опирается текущий код. [booking work](../../functions/src/canonical/bookings/bookingAttendanceOutcomeWork.ts), [course work](../../functions/src/canonical/courses/courseEnrollmentOutcomeWork.ts), [guest work](../../functions/src/canonical/guestConfirmation/guestConfirmationWork.ts) |

Инвентаризация покрывает source writers и активные collection-group policies. Каждая из трёх TTL-коллекций создаётся как плоский путь. Наличие исторических subcollections под произвольным документом и распределение типов по всей коллекции **NOT VERIFIED**. Проектные агрегаты не позволяют вывести темп роста каждой коллекции. Для оценки хранения нужны число записей в день, средний размер документа с индексами и фактический срок жизни. Для rate limits, admission и новых error logs окно сохраняется равным текущему контракту. 100 000 TTL deletes стоят около $0.02 по multi-region модели, без бесплатного TTL лимита. Затраты на проверку и поддержку политики при нынешнем объёме важнее цены отдельного delete.

## 7. CLOUD STORAGE

| Путь или bucket | Назначение и граница доступа | Lifecycle / наблюдение |
| --- | --- | --- |
| `participant-avatars/{participantId}/avatar.jpg`, `avatars/{uid}` | Канонический avatar slot участника и исторический путь. В текущем `main` protected upload проверяет данные и владельца, общий доступ к LIVE-публичным изображениям соответствует контракту UI | Есть стабильные имена, поэтому мягко удалённые поколения при перезаписях могут временно увеличить объём |
| `instructors/`, `courses/`, `lesson-levels/`, `kaspi-qr/` | Фото, обложки, логотипы, QR. У записи проверяются назначение и права. Публичные изображения и финансовый QR следует сверять в разных цепочках references. [Storage Rules](../../storage.rules), [protectedImagesHttp.ts](../../functions/src/security/protectedImagesHttp.ts) | Lifecycle отсутствует. Проверить версии, settings, исторические ссылки и активные ревизии до классификации orphan |
| Баннеры и видео | Каталог и hero media используют checked-in assets и разрешённые внешние источники, включая Yandex Object Storage `/carve/`. Firebase config promotion явно ограничивает переносимые ссылки | Yandex retention, IAM и расходы **NOT VERIFIED**, Firebase bucket policies на них не действуют. [configPromotionContract.ts](../../functions/src/staging/configPromotionContract.ts) |
| `chat/`, `_chat-media-uploads/` | Текущий HTTP path проверяет токен с revoke check и право на разговор/сообщение, префикс частей ограничен. Незавершённая multipart сборка может оставить части. Токены старых ссылок и формат маркеров проверять без вывода URL | Нет lifecycle. Есть согласуемая методика [CA-SEC-06B follow-up](CA-SEC-06B-media-retention-followup.md), сроки dry run и retention требуют одобрения. [chatMediaHttp.ts](../../functions/src/chat/chatMediaHttp.ts) |
| `image-cache/` | Производные Image Proxy, Storage Rules запрещают клиентский доступ, сервис использует Admin SDK и HTTP cache contract. Список разрешённых оригиналов ограничен в `main` | Cache-Control текущего кода задаёт 7 дней freshness и 1 день stale-while-revalidate. Для самих Storage objects lifecycle отсутствует. Сверить производные с текущими allowlist и долей miss до выделения срока. [optimizeImage.ts](../../functions/src/images/optimizeImage.ts) |
| App buckets в обоих проектах | `us-east1`, bucket default возвращён как `REGIONAL` (legacy Standard). Uniform access выключен, public access prevention наследуется. Публичных bucket IAM binding в Cloud Asset не найдено | Soft delete 7 дней, versioning выключен, lifecycle, retention и CORS config отсутствуют. Layout ACL и объектные download tokens не проверялись |
| Managed Functions source/upload buckets | `us-central1`, Standard, uniform access включён; CORS source GET и upload PUT для указанных Google console origins; inherited PAP | Source versioning включён, удаление noncurrent generation при наличии 3 новых. Upload lifecycle age 1d, versioning выключен. Soft delete 7 дней для обоих, retention lock отсутствует |
| Production Firestore export bucket | EU Standard, uniform access и PAP enforced, CORS отсутствует | Soft delete 7 дней, нет versioning/lifecycle/retention. В bounded metadata list обнаружены 2 корня экспорта с marker. Данные экспорта не читались |

**Методика orphan dry run.** Снять исходные агрегаты capacity по bucket и классу. Для одного согласованного префикса установить бюджет list/read и лимит страниц, остановку по времени и курсор. Собирать только префикс, размер, тип поколения, возраст и причину исключения. Сверять ссылки из активных и исторических сообщений, draft/reservations и active lease, канонических профилей, каталога, revisions/settings, старых opaque markers, hosting/assets и внешних источников. Неполная связь или неизвестный владелец исключают объект из списка кандидатов. Повторная сверка после согласованного интервала и проверка актуального поколения обязательны перед любым отдельно согласованным удалением. Soft-deleted/noncurrent/live объём учитывать независимо. URL с download token, значения токенов и тело объектов в отчёт не выносить.

## 8. CLOUD FUNCTIONS INVENTORY

**VERIFIED.** 67 экспортов в [functions/src/index.ts](../../functions/src/index.ts), 67 staging, 55 production. Все обнаруженные Functions ACTIVE, Gen 2, Node.js 22, `us-central1`, `minInstances=0`. Списки Gen 1 пусты. У всех функций текущий default Compute SA своего проекта. Сопоставление имён, ресурсов и trigger проверено через v2 list, IAM-политики сопоставлены с Cloud Run service names. Functions v2 `commit_sha` и `commit_dirty=false` совпали с соответствующими Hosting/Rules SHA для всех 67/55. Состав контейнеров и фактический runtime dependency tree по digest **NOT VERIFIED**. Массовое изменение max instances по текущему суточному трафику не обосновано.

В таблице параметры ресурса указаны как `RAM / vCPU / timeout s / min–max / concurrency`. Для callable App Check текущий исходник задаёт `enforceAppCheck:false`, deployed flag callable SDK из control plane напрямую не виден. У HTTP endpoints токен/role проверки реализованы внутри handler, App Check в коде не enforce. Scheduler и Eventarc используют service identity. `G` означает `GUEST_ACTION_TOKEN_SECRET@1` из соответствующего проекта. Источники — Functions v2, Cloud Run IAM, Scheduler, Eventarc и текущие декларации.

`P` — прямой allUsers Invoker. `P*` — проверка Invoker IAM отключена на Cloud Run. `S` — явный service account Invoker. `I` — проверка IAM включена, прямого публичного binding нет, project-level service identity Invoker описан в §11. `NV` — статус Cloud Run не установлен.

| Function | Назначение | Trigger | Staging | Production |
| --- | --- | --- | --- | --- |
| `optimizeImage` | Обработка и кеширование изображений | HTTP | 512Mi / 1 / 60 / 0–10 / 4 · P | 512Mi / 1 / 60 / 0–10 / 80 · P |
| `bookingChatMedia` | Чтение и upload медиа чата | HTTP | 512Mi / 1 / 120 / 0–10 / 1 · P | как staging |
| `protectedImages` | Проверка и upload protected images | HTTP | 256Mi / 1 / 60 / 0–10 / 80 · P | отсутствует |
| `chatMessagesStream` | SSE invalidation для чата | HTTP | 256Mi / 1 / 120 / 0–20 / 40 · P | отсутствует |
| `queryKaspiPayments` | Чтение ограниченных данных Kaspi | callable | 256Mi / 1 / 60 / 0–20 / 80 · P · G | как staging |
| `queryScopedClientDocuments` | Чтение клиентских документов в разрешённом scope | callable | 256Mi / 1 / 60 / 0–20 / 80 · P · G | отсутствует |
| `queryChatMessages` | Страница сообщений конкретного чата | callable | 256Mi / 1 / 60 / 0–20 / 80 · P · G | отсутствует |
| `mutateChatMessage` | Изменение сообщения в рамках прав на чат | callable | 256Mi / 1 / 60 / 0–20 / 80 · P · G | отсутствует |
| `syncClientInstructorSignal` | Ревизия справочника инструкторов | Eventarc written `instructors/{id}` | 256Mi / 1 / 60 / 0–10 / 80 · I | отсутствует |
| `syncClientCourseSignal` | Ревизия каталога курсов | Eventarc written `courses/{id}` | 256Mi / 1 / 60 / 0–10 / 80 · I | отсутствует |
| `syncClientCourseContentSignal` | Ревизия материалов каталога | Eventarc written `course_catalog_content/{id}` | 256Mi / 1 / 60 / 0–10 / 80 · I | отсутствует |
| `syncClientUserSignal` | Ревизия профиля аккаунта | Eventarc written `users/{id}` | 256Mi / 1 / 60 / 0–10 / 80 · I | отсутствует |
| `syncClientNotificationSignal` | Ревизия уведомлений аккаунта | Eventarc written `notifications/{id}` | 256Mi / 1 / 60 / 0–10 / 80 · I | отсутствует |
| `syncClientActivitySignal` | Ревизия пользовательской истории | Eventarc written `activity_logs/{id}` | 256Mi / 1 / 60 / 0–10 / 80 · I | отсутствует |
| `claimGuestProfile` | Привязка гостевого профиля | callable | 256Mi / 1 / 60 / 0–20 / 80 · P · G | как staging |
| `reportClientErrors` | Приём нормализованной client telemetry | callable | 256Mi / 1 / 60 / 0–20 / 80 · P · G | как staging |
| `deleteErrorLog` | Удаление отдельной записи лога администратором | callable | 256Mi / 1 / 60 / 0–20 / 80 · P · G | как staging |
| `clearErrorLogs` | Постраничная очистка error logs администратором | callable | 256Mi / 1 / 120 / 0–20 / 80 · P · G | как staging |
| `revokeOwnAdministratorSessions` | Отзыв собственных административных сессий | callable | 256Mi / 1 / 60 / 0–20 / 80 · P · G | отсутствует |
| `executeCanonicalCommand` | Серверный диспетчер canonical commands | callable | 256Mi / 1 / 60 / 0–20 / 80 · P · G | как staging |
| `executeGuestCanonicalCommand` | Диспетчер поддерживаемых guest-команд | callable | 256Mi / 1 / 60 / 0–20 / 80 · P · G | как staging |
| `queryLessonBookingReadModels` | Проекции бронирований уроков | callable | 256Mi / 1 / 60 / 0–20 / 80 · P · G | как staging |
| `queryManagedParticipantPickerReadModels` | Список доступных управляемых участников | callable | 256Mi / 1 / 60 / 0–20 / 80 · P · G | как staging |
| `queryBookingProposalReadModels` | Проекции предложений бронирований | callable | 256Mi / 1 / 60 / 0–20 / 80 · P · G | как staging |
| `queryBookingChangeRequestReadModels` | Проекции запросов изменения бронирования | callable | 256Mi / 1 / 60 / 0–20 / 80 · P · G | как staging |
| `queryParticipantInstructorAccessReadModels` | Проекция scope доступа инструктора | callable | 256Mi / 1 / 60 / 0–20 / 80 · P · G | как staging |
| `queryCourseEnrollmentReadModels` | Проекции зачислений на курсы | callable | 256Mi / 1 / 60 / 0–20 / 80 · P · G | как staging |
| `queryCourseCatalogReadModels` | Проекции каталога курсов | callable | 256Mi / 1 / 60 / 0–20 / 80 · P · G | как staging |
| `queryCourseAttendanceReadModels` | Фактическая Attendance по курсу | callable | 256Mi / 1 / 60 / 0–20 / 80 · P · G | как staging |
| `queryInstructorCourseAssignmentReadModels` | Назначения инструкторов на курсы | callable | 256Mi / 1 / 60 / 0–20 / 80 · P · G | как staging |
| `queryAdminIssueReadModels` | Проекции административных инцидентов | callable | 256Mi / 1 / 60 / 0–20 / 80 · P · G | как staging |
| `queryAdminFinanceReadModels` | Финансовые проекции для администратора | callable | 256Mi / 1 / 60 / 0–20 / 80 · P · G | как staging |
| `queryAccountWalletHistory` | Выписка Wallet аккаунта | callable | 256Mi / 1 / 60 / 0–20 / 80 · P · G | как staging |
| `resolveInstructorLessonRevenue` | Чтение вычисленного дохода инструктора | callable | 256Mi / 1 / 60 / 0–20 / 80 · P · G | как staging |
| `queryAdminCourseReadModels` | Административные проекции курсов | callable | 256Mi / 1 / 60 / 0–20 / 80 · P · G | как staging |
| `queryAdminCourseEnrollmentReadModels` | Административные проекции зачислений | callable | 256Mi / 1 / 60 / 0–20 / 80 · P · G | как staging |
| `queryAdminIdentityReadModels` | Административные проекции identity/accounts | callable | 256Mi / 1 / 60 / 0–20 / 80 · P · G | как staging |
| `queryAdminPlannerReadModels` | Область планирования администратора | callable | 256Mi / 1 / 60 / 0–20 / 80 · P · G | как staging |
| `queryInstructorOccupancyReadModels` | Занятость инструктора | callable | 256Mi / 1 / 60 / 0–20 / 80 · P · G | как staging |
| `queryParticipantOccupancyReadModels` | Занятость участника | callable | 256Mi / 1 / 60 / 0–20 / 80 · P · G | как staging |
| `queryBookingInstructorCatalogueReadModels` | Каталог инструкторов для бронирования | callable | 256Mi / 1 / 60 / 0–20 / 80 · P · G | как staging |
| `queryLessonPricingSettingsReadModel` | Чтение настроек расчёта цены урока | callable | 256Mi / 1 / 60 / 0–20 / 80 · P · G | как staging |
| `queryEmailDeliverySettingsReadModel` | Проекция email delivery settings | callable | 256Mi / 1 / 60 / 0–20 / 80 · P · G | как staging |
| `queryOutboxDeadLetterReadModel` | Административный список terminal failures | callable | 256Mi / 1 / 60 / 0–20 / 80 · P · G | как staging |
| `queryInstructorReviewReadModels` | Проекции отзывов об инструкторе | callable | 256Mi / 1 / 60 / 0–20 / 80 · P · G | как staging |
| `queryParticipantProgressReadModels` | Текущий прогресс участника | callable | 256Mi / 1 / 60 / 0–20 / 80 · P · G | как staging |
| `queryParticipantProgressHistoryReadModels` | История прогресса участника | callable | 256Mi / 1 / 60 / 0–20 / 80 · P · G | как staging |
| `queryInstructorParticipantRecommendationHistoryReadModels` | История рекомендаций участнику | callable | 256Mi / 1 / 60 / 0–20 / 80 · P · G | как staging |
| `queryParticipantAchievementsReadModels` | Достижения участника | callable | 256Mi / 1 / 60 / 0–20 / 80 · P · G | как staging |
| `queryParticipantLessonFeedbackReadModels` | Обратная связь по урокам участника | callable | 256Mi / 1 / 60 / 0–20 / 80 · P · G | как staging |
| `queryTestSessionReadModels` | Служебный callable, DEFERRED | callable | 256Mi / 1 / 60 / 0–20 / 80 · P · G | как staging |
| `executeTestSessionLifecycle` | Служебный callable, DEFERRED | callable | 256Mi / 1 / 60 / 0–20 / 80 · P · G | как staging |
| `deliverDomainOutboxOnCreate` | Немедленная доставка нового outbox item | Eventarc created `domain_outbox/{outboxId}` | 256Mi / 1 / 60 / 0–10 / 80 · I | как staging |
| `scheduledDeliverDomainOutbox` | Повторная обработка outbox, §9 | Scheduler HTTP | 256Mi / 0.1666 / 60 / 0–1 / 1 · S | как staging |
| `scheduledPurgeExpiredNotifications` | Очистка уведомлений и terminal outbox, §9 | Scheduler HTTP | 256Mi / 1 / 60 / 0–20 / 80 · S | как staging |
| `scheduledReconcileGuestConfirmationMismatches` | Сверка guest confirmations, §9 | Scheduler HTTP | 256Mi / 0.1666 / 60 / 0–1 / 1 · S | как staging |
| `syncInstructorLessonRevenueBooking` | Обновление дохода при изменении booking | Eventarc written `bookings/{bookingId}` | 256Mi / 1 / 60 / 0–10 / 80 · I | как staging |
| `syncInstructorLessonRevenuePayment` | Обновление дохода при изменении payment | Eventarc written `payments/{paymentId}` | 256Mi / 1 / 60 / 0–10 / 80 · I | как staging |
| `syncGuestBookingConfirmationWork` | Актуализация очереди guest booking | Eventarc written `bookings/{bookingId}` | 256Mi / 1 / 60 / 0–10 / 80 · I | как staging |
| `syncGuestEnrollmentConfirmationWork` | Актуализация очереди guest course enrollment | Eventarc written `course_enrollments/{enrollmentId}` | 256Mi / 1 / 60 / 0–10 / 80 · I | как staging |
| `syncGuestPaymentConfirmationWork` | Актуализация очереди guest payment | Eventarc written `payments/{paymentId}` | 256Mi / 1 / 60 / 0–10 / 80 · I | как staging |
| `scheduledExpireGuestLessonReservations` | Истечение гостевых резервов уроков, §9 | Scheduler HTTP | 256Mi / 0.1666 / 60 / 0–1 / 1 · S | как staging |
| `scheduledExpireGuestCourseReservations` | Истечение гостевых резервов курсов, §9 | Scheduler HTTP | 256Mi / 0.1666 / 60 / 0–1 / 1 · S | как staging |
| `scheduledResolveLessonBookingAttendanceOutcomes` | Attendance outcome worker, §9 | Scheduler HTTP | 256Mi / 0.1666 / 60 / 0–1 / 1 · S | как staging |
| `scheduledResolveCourseEnrollmentOutcomes` | Course outcome worker, §9 | Scheduler HTTP | 256Mi / 0.1666 / 60 / 0–1 / 1 · S | как staging |
| `syncLessonBookingAttendanceOutcomeWork` | Проекция работы по Attendance outcomes | Eventarc written `bookings/{bookingId}` | 256Mi / 1 / 60 / 0–10 / 80 · I | как staging |
| `syncCourseEnrollmentOutcomeWork` | Проекция работы по CourseEnrollment outcomes | Eventarc written `course_enrollments/{enrollmentId}` | 256Mi / 1 / 60 / 0–10 / 80 · I | как staging |

Основные источники расхода по типам функций:

- **Callable.** В текущем общем wrapper admission добавляет одну транзакцию Firestore уже до вызова handler, гостевая команда может добавить вторую. Последующие расходы определяются количеством command/read-model запросов и повторов транзакций. Для public callables staged limits действуют независимо от App Check enforcement. [Functions entry point](../../functions/src/index.ts).
- **HTTP media.** `optimizeImage` расходует CPU/память на обработку и сеть на чтение и отдачу. Staging использует ограничение miss и concurrency 4. `bookingChatMedia` и `protectedImages` читают или пишут Storage, проверяют токен и ресурс, текущие uploads используют lease и квоты. `chatMessagesStream` держит SSE и Firestore listeners до 110 секунд, использует admission и cleanup. Его нагрузка зависит от числа активных соединений и повторных подключений. [Image admission](../../functions/src/images/imageMissAdmission.ts), [Chat SSE](../../functions/src/chat/chatMessagesStream.ts).
- **Scheduler / Eventarc.** Основные переменные — количество fan-out событий при записи исходных коллекций, объём backlog и retries. Повторные чтения и пиковую нагрузку сравнивать на уровне конкретных job/trigger, см. §9.

## 9. SCHEDULED JOBS & TRIGGERS

Все семь jobs **ENABLED**, targets — одноимённые Functions в `us-central1`, OIDC использует default Compute SA соответствующего проекта. Deadline Cloud Scheduler 180 s. Настроенные retry-count отсутствуют в API ответах. Firestore event handlers отдельно имеют `RETRY_POLICY_RETRY`. Пять пятиминутных jobs, один 30-минутный и один суточный дают около 44 670 запусков за 30 дней на проект при штатном расписании. Частота scheduler billing не меняет, но влияет на Compute/Firestore. Срабатывания Scheduler и фактическая длительность каждого job отдельно не измерены.

| Job | Расписание и цель | Операции и ограничения |
| --- | --- | --- |
| `scheduledExpireGuestLessonReservations` | 5 мин UTC. Закрывает истёкшие guest lesson holds | Bounded state/deadline query, 25/page, максимум 100 кандидатов, cursor expiry+ID. На пустом наборе 1 query. Перечитывает и применяет канонический переход транзакционно |
| `scheduledExpireGuestCourseReservations` | 5 мин UTC. Закрывает истёкшие participant-scoped guest enrollments | 25/page, максимум 100, cursor expiry+ID, 1 query в idle. Команда и повторная проверка платежа/состояния защищают от двойного эффекта |
| `scheduledResolveLessonBookingAttendanceOutcomes` | 5 мин UTC. Разрешение deadline и эскалация пропущенных outcome | Читает marker, статус `ready` подтверждён в обоих проектах. Work path по due index: 25/page, до 100 candidates и 400 прочитанных work docs. Fallback по bookings с bounded paging и дополнительным lookup на кандидата. Retry work с backoff до часа, протокол idempotency и повторная eligibility проверка. Attendance остаётся доказательством факта |
| `scheduledResolveCourseEnrollmentOutcomes` | 5 мин UTC. Course outcomes и AdminIssue | Один due query с limit 26, до 25 work items за запуск. Остаток в следующем запуске. Transaction recheck/retry до часа, отдельный marker для курса не требуется |
| `scheduledReconcileGuestConfirmationMismatches` | 5 мин UTC. Guest confirmation reconciliation для booking/enrollment/payment | Сначала 1 control read. В обоих проектах mode `queue`, backfillPass 2 и присутствует ready evidence. До 25 due work items, повторное чтение item и проверка lease/ревизии. Каждые 6 ч bounded recovery с курсорами, до 25 строк на каждую из двух коллекций и точечные lookups. Без подтверждённой готовности выполняется legacy fallback, 25/page, до 100 candidates и 2 000 scanned subjects плюс lookups. [Scheduler handler](../../functions/src/canonical/guestConfirmation/guestConfirmationScheduler.ts) |
| `scheduledDeliverDomainOutbox` | 30 мин UTC. Recovery для due retries, pending и stale leases | До 25 обработок, max 100 scanned docs, узкие запросы по статусу/каналу/сроку. Транзакционный claim, стабильный notification ID. При пустом наборе несколько ограниченных запросов, без обхода истории. Репозиторный Outbox email adapter возвращает `not_configured`, внешний провайдер этим worker не вызывается. Встроенные Firebase Auth письма идут отдельным путём. [outboxDeliveryAdapters.ts](../../functions/src/canonical/auditOutbox/outboxDeliveryAdapters.ts) |
| `scheduledPurgeExpiredNotifications` | 24 ч Asia/Almaty. Чистит уведомления и terminal outbox | 1 settings read, 1 пустой query уведомлений, 2 пустых terminal queries для outbox. Уведомления drain по 500 без лимита количества страниц, outbox 100 × 5 на статус. Одновременный повтор удаляет тот же документ, суммарное потребление может удвоиться. См. 07C-04 |

Для каждого 5-минутного job 8 640 запусков за 30 дней, 1 пустой запрос на запуск даёт около $0.005 по gross read rate. При 0,5 s активного времени, 0,1666 vCPU и 256 MiB модель даёт около $0.023 за compute+requests на такой job, до free tier и без cold start. Для outbox recovery 1 440 запусков, порядка $0.004 compute по тем же допущениям, плюс его запросы. Для daily job 30 запусков, при 1 s и 1 vCPU около $0.001 compute без backlog. Цена определения каждого Scheduler job около $0.10 за 31 день, первые три на billing account бесплатны. Реальные event handlers имеют переменную стоимость по числу событий и повторов. [Cloud Scheduler pricing](https://cloud.google.com/scheduler/pricing), [Cloud Run pricing](https://cloud.google.com/run/pricing).

Триггеры и их пути приведены в §8. Запись `bookings` может вызвать три разных handler, `payments` и `course_enrollments` по два. Revenue проектирует в собственное дерево `instructor_lesson_revenue`, reconciliation и outcomes пишут work/projection paths. Outbox onCreate пишет delivery state и notification, staging notification signal пишет read-revision. Прямой цикл триггеров к своим input documents по проверенным путям не выявлен. Повторная доставка допускается, поэтому сохранены transaction rechecks, deduplication и ID. Achievements обрабатывает каноническая команда, отдельный Scheduler/Eventarc для неё не обнаружен.

## 10. FIRESTORE INDEXES

**VERIFIED.** В [manifest](../../firestore.indexes.json) 72 composite indexes и 5 field overrides. В обоих проектах 69 composite indexes, все READY. Сравнение по collection group, query scope и упорядоченным полям, implicit `__name__` нормализован. Дополнительных или дублирующихся определений в проверенных списках нет. По одному global single-field default, плюс те же 5 overrides.

- EXEMPT + TTL **ACTIVE** для `error_logs.deleteAt`, `guest_reservation_admission.deleteAt` и `security_request_limits.deleteAt` в обоих проектах.
- `days.actualInstructorIds`: collection-group array-contains. `days.interval.startsAt.seconds`: ascending для collection и collection group. Других field overrides не обнаружено. Длинные строки, maps и arrays по умолчанию могут создавать index fanout в зависимости от формы поля, а большие индексируемые строки подпадают под ограничения Firestore. Перед возможным исключением `result`, payload или длинных полей сверить все cloud/client queries и потребление.
- **DEFERRED.** `notifications(dataScope,testSessionId,userId,timestamp DESC)`, `notifications(dataScope,testSessionId,userId,timestamp ASC)`, `activity_logs(dataScope,testSessionId,userId,timestamp DESC)`. Эти три определения и есть всё локальное расхождение. Оснований для полного deploy индексов нет.
- Query Explain, исторические index usage и отдельный объём index bytes **NOT VERIFIED**. Удаление индексов и автоматическая правка single-field поведения не предлагаются. [Firestore pricing and index reads](https://cloud.google.com/firestore/pricing), [Firestore quotas](https://cloud.google.com/firestore/quotas).

## 11. IAM & SERVICE ACCOUNTS

| Проверка | VERIFIED | Зависимости и минимизация |
| --- | --- | --- |
| Project IAM | В обоих проектах один прямой Owner и три Editor service principals: default Compute, Google APIs Service Agent и App Engine default SA. Public project grants не обнаружены | Compute runtime активно используется. Проверить фактических пользователей App Engine SA по логам до изменения, а Google-managed service agent — по документации продукта. Наличие одного Owner делает проверку break-glass доступа частью DR |
| Runtime / Eventarc / Scheduler | Default Compute SA своего проекта у всех Functions, у всех Firestore Eventarc targets и у семи Scheduler OIDC jobs. Есть `roles/eventarc.eventReceiver` и project-wide `roles/run.invoker` для этой SA | Переход на узкий runtime требует отдельно предусмотреть Datastore read/write, Storage object scope, секрет, Firebase Auth и триггеры. Scheduler и Eventarc требуют Run invoke на нужных targets. Резко отзывать Editor нельзя: текущие операции Auth и часть CRUD зависят от него |
| Invoker | Cloud Run list: 67/55, `invokerIamDisabled` ни у одного. Cloud Asset показал `allUsers` на 46/40 сервисах соответственно, сводка для функций в §8. Project-level Cloud Functions Invoker grant в извлечённых политиках не найден | Gen 2 использует `run.routes.invoke`. Callables доступны браузеру, пользовательская авторизация находится в handler. У четырёх HTTP routes роль зависит от endpoint. См. §8. Снимать public grant как общую меру нельзя без проверки клиентских вызовов и Hosting rewrite |
| Firebase Admin SDK SA | Прямые project roles включают Firebase Admin SDK Service Agent, Firebase Auth Admin, Storage Admin и Service Account Token Creator. Staging дополнительно App Check Admin. Для Pub/Sub service agent найден Token Creator | SDK SA отличается от Compute runtime. Проверить потребителей, в том числе ops/auth tooling. Ограничивать выдачу токенов и Storage доступ на ресурс только после проверки текущих workflows. Pub/Sub grant сверять с Eventarc identities, поскольку отзыв может оборвать delivery |
| Secret Manager | Непубличный secret-level `roles/secretmanager.secretAccessor` выдан Compute SA в каждом проекте | Нужен 42 staging и 38 production Functions. Сохранять привязку к конкретному секрету и осторожно выделять runtime. Выпуск потребует доступных версий в каждом проекте |
| Buckets и Firestore | Public bucket grants не обнаружены. Firebase Rules сервисные роли присутствуют, серверные SDK используют IAM проекта и обходят клиентские Rules | Список IAM выданных прямо на project/resource проверен. Доступ из org/folder, policy deny, object ACL, IAM Conditions и effective access для каждого пользователя **NOT VERIFIED** |
| User-managed keys / impersonation | В обоих проектах по три user-managed accounts в списке IAM, на всех списки USER_MANAGED keys пусты. Project Token Creator grants описаны выше | Внешние проекты, наследуемые policy и фактические журналы impersonation за пределами проверки. Managed service identity предпочтительна для существующих workflows |

**CA-SEC-07B.** [administratorSession.ts](../../functions/src/security/administratorSession.ts) делает `getUser`, записывает cutoff в Account и выполняет `revokeRefreshTokens`. По `gcloud iam roles describe` для текущего Editor подтверждены `firebaseauth.users.get` и `firebaseauth.users.update`; обе входят и в `roles/firebaseauth.admin`. Сначала нужно подтвердить эти permissions и запись Account у любого нового runtime. Проверка живого отзыва сессии вне рамок audit read-only. [Firebase Authentication IAM](https://cloud.google.com/iam/docs/roles-permissions/firebaseauth), [Cloud Run invocation IAM](https://cloud.google.com/run/docs/securing/managing-access).

## 12. SECRETS & CONFIGURATION

- `GUEST_ACTION_TOKEN_SECRET` — единственный найденный Secret Manager secret обоих проектов. У каждого одна ENABLED version, automatic rotation и expiration отсутствуют. Cloud bindings ссылаются на версию 1 своего проекта. По коду используется для guest credentials, admission HMAC и некоторых защищённых cursor signatures. Совпадение значений между проектами **NOT VERIFIED**. Для проверки и будущей ротации учитывать действующие guest credentials, лимиты и курсоры. Подтвердить staging сценарии после смены версии до production и согласовать обработку текущих приглашений.
- Runtime Functions v2 имеет системные имена `FIREBASE_CONFIG`, `GCLOUD_PROJECT`, `FUNCTION_SIGNATURE_TYPE`, `FUNCTION_TARGET`, `FUNCTION_REGION`, `LOG_EXECUTION_ID`, `EVENTARC_CLOUD_EVENT_SOURCE`. Других plain environment variable names в инвентаризации нет. Provider secrets для Outbox email отсутствуют. Значения секретов не читались.
- `.env`, `.env.development`, `.env.staging` игнорируются Git, `.env.example` и `.env.e2e` отслеживаются. `functions/.secret.local` отслеживается с коммита `42910ea5`, содержит ровно ключ guest secret, значение совпадает с локальной emulator fixture из `firebase.json`. Это диагностическая заглушка. Firebase Functions deploy исключает `*.local`. Для `.env.production` отдельного правила в Git ignore нет, файл локально отсутствует. Никогда не помещать приватные credentials в `VITE_*`.
- История Git проверена сигнатурами private keys, GitHub tokens, AWS keys и Google API keys без раскрытия совпадений. Вне generated Graphify-копий совпадение для старого `firebase-applet-config.json` относилось к Firebase Web API config. Для CI, tracked PowerShell, local client/build artifacts и обычных логов выполнен выборочный статический просмотр. Логи GCP и GitHub Actions artifacts с данными пользователей, произвольные форматы credentials, полный набор исторических артефактов и hosted bundle по всем релизам **NOT VERIFIED**.
- Cloud Logging в обоих проектах: `_Default` 30 дней, `_Required` 400 дней и locked. Локально `firebase-debug.log` игнорируется. Source [reportClientErrors.ts](../../functions/src/security/reportClientErrors.ts) ограничивает данные клиента, а CA-SEC-07B пишет outcome корреляции отзыва без вывода токена. Политика логов GCP и Firestore `error_logs` независимы.

## 13. ENVIRONMENT ISOLATION

- `.firebaserc` задаёт явные `staging` и `prod`; `default` указывает в production. Release wrappers передают project alias, выбирают Vite mode и проверяют provenance. Production Hosting сначала проверяет primary, затем клонирует live на `carveacademy` с явным project. `full:prod` использует широкий Firebase deploy и может включить отложенный индексный manifest. Для CA-SEC-07C его применение не требуется. [release specs](../../scripts/deploymentProvenance.mjs), [закреплённая последовательность](../../scripts/deploymentRelease.mjs).
- Firebase web app config подтверждает собственные project ID, Auth domains и bucket каждого проекта. Публичный `build-info.json` на всех трёх сайтах подтвердил ожидаемые project ID и `dirty:false`. Guard проверяет сочетание hostname/project ID до инициализации Firebase. Staging/production Hosting rewrites ведут к локальной для проекта Function `optimizeimage` в `us-central1`. Authenticated network trace в браузере **NOT VERIFIED**, поэтому реальные session flows, новые credentials и использование legacy URL в пользовательских данных остаются за пределами проверки. [Firebase init](../../src/infrastructure/firebase/firebase.ts), [environment guard](../../src/infrastructure/firebase/firebaseEnvironmentGuard.ts).
- Emulator wiring использует отдельные `demo-*` project IDs, loopback hosts и сетевой guard. CI собирает и тестирует с Node.js 22, `npm ci` и изолированным проектом. Production credentials и cloud traffic в этих путях кодом не требуются. Фактические credentials на других рабочих станциях **NOT VERIFIED**.
- Settings promotion запускается вручную как отдельный staging export / prod promote, source/target проверяются, контракт allowlist отделяет бизнес-данные. Настройки/баннеры staging не переносятся автоматически при Firebase deployments. Ранее применённые configuration promotion и состав production data **NOT VERIFIED**. [guard](../../functions/src/staging/configPromotionProjectGuard.ts), [promotion contract](../../functions/src/staging/configPromotionContract.ts).
- **Auth.** Оба проекта используют `FIREBASE_AUTH`; email включён, MFA disabled. Production authorized domains дополнительно содержат `skiacademy-690504140775.asia-southeast1.run.app` и `carveacademy.ai.studio`. `localhost` присутствует в обоих. Владение, использование старых адресов, полный набор provider settings и учётных записей **NOT VERIFIED**.
- **App Check.** В обоих проектах Auth, Firestore и Storage `UNENFORCED`. Staging наблюдает assessments, production assessment series за окно отсутствуют. Текущий callable wrapper observe-only, его включение в enforce относится к прежнему согласованному плану. [CA-SEC-07A](CA-SEC-07A-app-check.md).

## 14. DEPENDENCY SECURITY

Проверены 4 npm manifests и 2 lockfiles. Root: 1 142 записи packages без root, из них 1 030 dev-marked. Functions: 300 записей, 1 dev-marked. `packages/shared-domain` и vendored `functions/shared-domain` поставляются как локальные зависимости, отдельного lockfile у них нет. Functions lock содержит также `file:..` link, но отметка `runtime` в lock показывает установку узла, а достижимость зависит от импорта и входящих данных. Текущий Node CLI 22.23.2, manifest Functions требует 22, deployed Functions nodejs22. CI использует `npm ci --ignore-scripts` на app и Functions. Примеры install-script entries — esbuild, protobufjs, re2, @firebase/util. Firebase predeploy выполняет сборку и sync shared-domain. Воспроизводимость реального cloud dependency graph по образу **NOT VERIFIED**. GitHub Actions `checkout`, `setup-node`, `setup-java`, `upload-artifact` используют version tags вместо SHA, отдельные CI permissions scoped по заданиям. Force-fix, installs и обновления в этом аудите не запускались.

Проверка `engines.node` на 22.23.2 охватила 745 root lock entries и 183 Functions lock entries с объявленным ограничением. Единственное несовпадение — optional `@img/sharp-win32-ia32` с `^20.9.0`, предназначенный для 32-битной Windows. Он **NOT APPLICABLE** к deployed Linux Functions. Эта проверка охватывает декларации движка. Чистая повторная установка и регрессионная сборка **NOT RUN**.

**Офлайн-скан.** Архив npm OSV скачан 27 ноября, 233 184 entries. Сопоставлены package+version, опубликованные affected versions и semver ranges локально, с исключением withdrawn advisories. Сравнивались `main` и lockfiles из release commit `14695f71`, результаты одинаковы. 12 совпадений, 10 MODERATE и 2 LOW. Команду `npm audit` авто-проверка отклонила из-за передачи списка имён и версий пакетов внешнему npm Registry. Отдельное разрешение потребуется, если нужна именно сверка с registry audit. [OSV data and offline matching](https://google.github.io/osv.dev/data/).

| GHSA / CVE | Severity, найдено, affected → fix | Reachability, риск, изменение и проверки |
| --- | --- | --- |
| [GHSA-3g3m-2fjr-6pw4](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4) / CVE-2026-118773 | MODERATE, glob 10.5.0, app dev + Functions runtime, `>=9 <14.0.2` → 14.0.2 | В app коде нет пользовательского glob path, транзитивный runtime traversal через AbortSignal не установлен. Затронут SDK/tooling. Major update через upstream, проверить Functions build/emulators и CI file discovery |
| [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249) / CVE-2026-118764 | MODERATE, minimatch 9.0.9/10.2.5 app dev и 9.0.9 Functions runtime, `>=7 <11.0.1` → 11.0.1 | Риск CPU при контролируемом шаблоне. У продуктовых обработчиков нет подтверждённого пути передачи такого шаблона. Проверить SDK/tooling совместимость, eslint и glob-driven тестовый отбор |
| [GHSA-474x-hrwr-fgx4](https://github.com/advisories/GHSA-474x-hrwr-fgx4) / CVE-2026-126066 | LOW, fast-xml-parser 5.11.2 Functions runtime, `<5.12.0` → 5.12.0 | Транзитивный XML parsing, нет подтверждённого приёма стороннего XML в приложении. Проверить Storage SDK операции чтения/записи и обработку ошибок после обновления |
| [GHSA-8988-4f7v-96qf](https://github.com/advisories/GHSA-8988-4f7v-96qf) / CVE-2026-54285 | MODERATE, @opentelemetry/core 1.30.1 app dev, `<2.8.0` → 2.8.0 | Telemetry tooling. Нет runtime reachability из app. Major update согласовать с upstream, проверить локальную сборку/CLI invocation |
| [GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq) / CVE-2026-41907, CVE-2026-41988 | MODERATE, uuid 9.0.1 app dev, `<11.1.1` → 11.1.1 | Не найден пользовательский control над output buffer в dev tooling. Проверить CLI Node 22 и unit/emulator suite при обновлении upstream |
| [GHSA-3gg2-335m-rxc6](https://github.com/advisories/GHSA-3gg2-335m-rxc6) / CVE-2026-126359 | LOW, hono 4.13.14 app dev, `>=3.12.0 <4.13.16` → 4.13.16 | Dev middleware, `css` helper не найден в продукте. Проверить dev CLI/emulator rendering |
| [GHSA-46wx-v44x-9hh2](https://github.com/advisories/GHSA-46wx-v44x-9hh2) / CVE-2026-126355 | MODERATE, hono 4.13.14 app dev, `<4.13.16` → 4.13.16 | Риск CSRF dev routes. Не найдено production handlers на Hono. Проверить loopback CLI и emulator auth |
| [GHSA-4h7h-rv7c-7m2v](https://github.com/advisories/GHSA-4h7h-rv7c-7m2v) / CVE-2026-126356 | MODERATE, hono 4.13.14 app dev, `>=4.5.1 <4.13.16` → 4.13.16 | Multipart validator в dev toolchain, приложение использует Functions HTTP handlers. Проверить CLI multipart/validation paths, если используемая версия их содержит |
| [GHSA-4m76-xfj5-7975](https://github.com/advisories/GHSA-4m76-xfj5-7975) / CVE-2026-126357 | MODERATE, hono 4.13.14 app dev, `<4.13.16` → 4.13.16 | Dev middleware на mounted routes. Production scope по lock не подтверждён. Проверить CI emulator и dev routes |
| [GHSA-h7mg-cq63-vhpq](https://github.com/advisories/GHSA-h7mg-cq63-vhpq) / CVE-2026-126358 | MODERATE, hono 4.13.14 app dev, `>=4.1.4 <4.13.16` → 4.13.16 | Dev routing. Прямых Hono routes в коде приложения не найдено. Проверить CLI routing и emulator smoke |
| [GHSA-jpvv-r467-5p4w](https://github.com/advisories/GHSA-jpvv-r467-5p4w) / CVE-2026-126210 | MODERATE, @hono/node-server 2.1.5 app dev, `>=2.0.0 <2.1.6` → 2.1.6 | Routing dev-server при наличии reverse proxy. Облачные ingress используют Firebase/Cloud Run. Проверить локальные CLI endpoints и compatibility с Hono patch |
| [GHSA-qv5m-9pm6-hqp3](https://github.com/advisories/GHSA-qv5m-9pm6-hqp3) / CVE-2026-126343 | MODERATE, @hono/node-server 2.1.5 app dev, `>=2.0.0 <2.1.6` → 2.1.6 | Возможная остановка helper процесса WebSocket. Product chat stream использует SSE. Проверить повторные подключения CLI и эмуляторов |

Для runtime обновлений проверить Node 22 build, Rules/emulator workflows, guest booking и money idempotency, Storage/Protected Images, Cloud Functions smoke. Для dev-only достаточно затронутых CI/static/emulator workflows. Актуальность всех npm latest tags и неподдерживаемых upstream веток отдельно **NOT VERIFIED**. Повышение major только ради снятия audit-флага не предлагается.

## 15. BILLING & COST MODEL

**Наблюдения, 28 октября — 27 ноября 2026 UTC.** Cloud Monitoring, суточные интервалы и sum по выгруженным series, capacity — среднее суточных значений. Это usage metrics. Billing enabled в обоих проектах. Budget list HTTP 403, суммы invoice, credits, alerts и платёжный аккаунт за пределами проверки. Budget alerts предупреждают о расходах и сами их не ограничивают. [Cloud Billing budgets](https://cloud.google.com/billing/docs/how-to/budgets).

| Показатель | Staging | Production |
| --- | ---: | ---: |
| Firestore document reads | 179 131 | 27 835 |
| Firestore document writes | 13 680 | 735 |
| Firestore document deletes | 1 519 | Нет точек |
| Firestore data + indexes, среднее | 12 606 382 B | 2 092 376 B |
| Cloud Run запросы | 66 293 | 45 873 |
| Cloud Run billed instance time | 86 185 s | 50 524 s |
| Cloud Run выделенное CPU-время | 147 852 vCPU-s | 63 806 vCPU-s |
| Cloud Run выделенное memory-время | 22 291 GiB-s | 12 192 GiB-s |
| Cloud Run network sent | 439 778 008 B | 256 556 106 B |
| Firestore TTL deletions, отдельная метрика | 944 | 348 |
| Storage API ops, агрегат | 1 841 | 1 227 |
| Storage network sent | 305 212 082 B | 623 919 582 B |
| Storage средний объём, базовая метрика без soft-deleted | 434 595 089 B | 563 313 524 B |
| Storage v2 средний объём, включая удерживаемые soft-deleted objects | 1 571 344 952 B | 838 760 076 B |
| Cloud Logging bytes ingested | 241 152 314 B | 190 227 097 B |
| reCAPTCHA assessments | 199 | Нет точек |
| Artifact Registry, snapshot 27 ноября | 848 603 826 B | 688 141 791 B |

Cloud Run requests включает serving targets, scheduled и event traffic в зависимости от метрики, поэтому не трактуется как число end-user действий. CPU и RAM показывают allocation, фактическая utilization и суммы списаний из них не выводятся. Дополнительные Firestore billable read/write series отсутствуют за это окно. TTL счётчик суммирован по returned series, общий document delete count не складывается с ним без проверки перекрытия. Отдельный billed egress по SKU и месту назначения, Secret Manager access counts, Auth MAU, Scheduler executions, build minutes и historical artifact bytes **NOT VERIFIED**. Текущие managed build buckets включены в Storage capacity. Нет точек означает отсутствие результата series за это окно. [Cloud Run monitoring](https://cloud.google.com/run/docs/monitoring), [Google Cloud Monitoring metrics](https://cloud.google.com/monitoring/api/metrics_gcp_p_z).

**Расчётная модель на 30 дней, один проект.** Для staging применима та же формула с его реальной тестовой нагрузкой и теми же семью Scheduler definitions. Общие free allowances нельзя вычитать дважды. Production сценарии показывают gross до free tiers и credits. Нагрузка растёт линейно в пределах указанных допущений. Операции массовой атаки, удаление данных и ретраи инцидента выходят за пределы этой модели.

| Допущение в месяц | 100 MAU | 1 000 MAU | 5 000 MAU |
| --- | ---: | ---: | ---: |
| Сессии, 20/MAU | 2 000 | 20 000 | 100 000 |
| Бронирования, 0,8/MAU | 80 | 800 | 4 000 |
| Сообщения, 8/MAU | 800 | 8 000 | 40 000 |
| Uploads, 0,4/MAU | 40 | 400 | 2 000 |
| Functions requests, 60/MAU + 44 670 scheduler | 50 670 | 104 670 | 344 670 |
| Firestore reads, 200/MAU + 100 000 фоновых | 120 000 | 300 000 | 1 100 000 |
| Firestore writes и deletes, 50 и 10/MAU | 5 000 / 1 000 | 50 000 / 10 000 | 250 000 / 50 000 |
| Firestore snapshot docs + indexes, 1 + 0,0005 GiB/MAU | 1,05 GiB | 1,5 GiB | 3,5 GiB |
| Storage Class A / B, 4 / 60 на MAU | 400 / 6 000 | 4 000 / 60 000 | 20 000 / 300 000 |
| Storage held, 1 + 0,005 GiB/MAU | 1,5 GiB | 6 GiB | 26 GiB |
| Billable media transfer inference, 0,1 GiB/MAU | 10 GiB | 100 GiB | 500 GiB |
| Hosting transfer, 0,02 GB/MAU | 2 GB | 20 GB | 100 GB |
| reCAPTCHA assessments при active provider, 8/MAU | 800 | 8 000 | 40 000 |

Тарифы проверены 27 ноября 2026. Firestore Standard `eur3`: $0.06/$0.18/$0.02 за 100 000 reads/writes/deletes, $0.18/GiB-month для docs+indexes. Read line моделирует тарифицируемые reads вместе с запросами. Query fanout может увеличить число единиц. Доля TTL deletes входит в число deletes, без бесплатной квоты для TTL. Cloud Run request-based `us-central1`: $0.000024/vCPU-s, $0.0000025/GiB-s, $0.40/млн requests. Допущение 0,25 s × 1 vCPU × 0,3 GiB на пользовательский запрос, 0,5 s на частый job и 1 s на daily. Фоновая CPU около 3 749 vCPU-s и RAM 5 588 GiB-s. [Firestore pricing](https://cloud.google.com/firestore/pricing), [Cloud Run pricing](https://cloud.google.com/run/pricing).

Storage Standard `us-east1`: около $0.020/GiB-month, $0.005 и $0.0004 за 1 000 Class A/B операций. Интернет transfer до 10 TiB по обычному тарифу для Казахстана принят $0.12/GiB, без назначения SKU отдельному объекту. Объём раздутого proxy/Runtime egress проверять отдельно, особенно при cross-region доступе. Hosting $0.15/GB по сверхлимиту, в gross посчитан весь объём. Scheduler семь jobs около $0.70/31 день до allowance. Один active secret $0.06/month до free tier, requests Secret Manager зависят от холодных стартов и не приравнены к каждому user request. Artifact Registry $0.10/GiB-month, модель использует production snapshot $0.064. [Storage pricing](https://cloud.google.com/storage/pricing), [Firebase Hosting and Auth pricing](https://firebase.google.com/pricing), [Scheduler pricing](https://cloud.google.com/scheduler/pricing), [Secret Manager pricing](https://cloud.google.com/secret-manager/pricing), [Artifact Registry pricing](https://cloud.google.com/artifact-registry/pricing).

| Модельная сумма, USD | 100 MAU | 1 000 MAU | 5 000 MAU |
| --- | ---: | ---: | ---: |
| Firestore операции + размер | 0,27 | 0,54 | 1,75 |
| Cloud Run compute + requests | 0,16 | 0,52 | 2,10 |
| Storage capacity + operations | 0,03 | 0,16 | 0,74 |
| Media egress + Hosting transfer | 1,50 | 15,00 | 75,00 |
| Scheduler + один secret + Artifact Registry | 0,82 | 0,82 | 0,82 |
| reCAPTCHA при Premium tier | 0 | 0 | 8,00 |
| **Сумма смоделированных статей** | **2,79** | **17,05** | **88,41** |

Для трёх сценариев логирование принято ниже 50 GiB/project/month по наблюдаемому масштабу и коротким structured logs. Сверх 50 GiB действует $0.50/GiB ingest, срок пользовательских логов 30 дней. В модель не включены Cloud Build minutes, Secret Manager access сверх квоты, отдельные межрегиональные и сторонние transfer, налоги, резервные копии и восстановление. Auth — существующий Firebase Auth email/OAuth без допущения SMS fees или Identity Platform. reCAPTCHA $8 для 10 001–100 000 на Premium применимо при превышении общей организационной бесплатной квоты и используемой политике оплаты. [Observability pricing](https://cloud.google.com/products/observability/pricing), [reCAPTCHA pricing](https://cloud.google.com/security/products/recaptcha).

Экономия при уменьшении платного transfer на 100 GiB составляет около $12 по допущению модели. Возможную экономию после выкладки Image Proxy правок вычислять по фактической разнице miss, bytes и billable time. Объём облачного бэкапа и аварийные скачки не следует оценивать на основе этой MAU-модели.

## 16. BACKUP & DISASTER RECOVERY

| Механизм | Состояние | Восстановление, RPO/RTO и цена |
| --- | --- | --- |
| Firestore managed backups | В обоих проектах успешно прочитаны пустые schedules и backups | Текущий managed RPO/RTO отсутствует. Daily schedule после согласования даёт целевой RPO около 24 ч при успешных snapshots. RTO зависит от restore в новую DB, проверки индексов, правил и согласования отката |
| Production ручной экспорт | В EU bucket обнаружены только два bounded top-level корня с `.overall_export_metadata`, 25 и 28 октября | Свежесть от последнего найденного marker около 29 суток 12 часов. Полнота и recoverability **NOT VERIFIED**. Это возможный нижний предел возраста доступного снимка, фактический RPO и RTO не установлены |
| Firestore PITR / delete protection | Оба disabled | Firestore описывает ограниченное окно версий около 1 часа при отключённом PITR. Его пригодность здесь не проверялась. После включения PITR окно нарастает до 7 дней, минутная гранулярность. Database delete protection отдельно защищает от удаления базы, не защищает каждую строку |
| Storage soft delete / versioning | 7 суток soft delete. App bucket versioning off. Managed Functions source bucket versioning on | Для удалённых или заменённых объектов проверить право restore и восстановление указателей на поколение. Восстановимость конкретных объектов, tokens и целевой RTO неизвестны |
| Firebase Auth и админский доступ | Firebase Auth работает отдельно от Firestore. MFA отключена, один прямой Owner в каждом проекте. CA-SEC-07B cutoff и revoke зависят от Auth+Account | Утверждённые Auth recovery/export, альтернативный оператор и SLA **NOT VERIFIED**. Для launch подтвердить сохранение UID/Account/Participant связей и возможность восстановления административного доступа. RPO/RTO неизвестны |
| Hosting rollback | Firebase API вернул 5 release entries для каждого сайта | Rollback для двух production sites должен вернуть совместимую пару версий. Операция и её фактическая длительность **NOT VERIFIED** |
| Functions rollback | Git revisions Node 22 доступны, managed source buckets хранят поколения, Artifact Registry содержит images, provenance для Hosting известна | Восстановить совместимую revision/целевой release, проверить bindings, triggers и pending jobs. Сохранность конкретного digest, право отката и время **NOT VERIFIED** |
| Rules и config | Хеши действующих Firestore/Storage Rules воспроизводятся из Git, исторические release и index manifest зафиксированы. Settings имеют отдельный scoped promotion workflow | Rules rollback должен быть совместим с Functions/Hosting и не открывать прежние закрытые пути. App Check/IAM/Auth config отдельно. DR rehearsal не выполнялся |

Managed backup не включает Security Rules и TTL policies. Для Firestore `eur3` хранение семи ежедневных копий по 1 GiB с retention 7 дней стоит около $0.21 за установившийся месяц при $0.03/GiB-month. Restore стоит $0.40/GiB плюс storage новой базы. PITR оплачивается отдельно по объёму PITR history по ставке $0.18/GiB-month. Для Storage soft-deleted bytes и restore операции тарифицируются отдельно. Текущие тарифы сверены 27 ноября. [Firestore Backup](https://cloud.google.com/firestore/docs/backups), [PITR overview](https://cloud.google.com/firestore/docs/pitr), [Firestore pricing](https://cloud.google.com/firestore/pricing), [Cloud Storage soft delete](https://cloud.google.com/storage/docs/soft-delete).

Минимальная приёмка DR после одобрения — восстановить утверждённый набор в отдельную базу/проект, измерить время и проверить целостность Booking ↔ Payment ↔ MonetaryEvent ↔ Wallet и Auth UID ↔ Account. Подтвердить повтор финансовой команды на восстановленном консистентном наборе без повторного settlement. До проверки целевой RPO и RTO остаются инженерными допущениями.

## 17. STAGING / PRODUCTION DIFFERENCES

| Область | Итог |
| --- | --- |
| Hosting provenance и Rules | Staging `20413eb0`, production `14695f71`. Оба production site отдают одинаковый HTML body digest, commit и проектный rewrite. Version IDs различны, `11beb5df338530da` и `c192bf56498d0e4a` |
| 12 Functions | Отсутствуют в production `protectedImages`, `chatMessagesStream`, `queryScopedClientDocuments`, `queryChatMessages`, `mutateChatMessage`, `syncClientInstructorSignal`, `syncClientCourseSignal`, `syncClientCourseContentSignal`, `syncClientUserSignal`, `syncClientNotificationSignal`, `syncClientActivitySignal`, `revokeOwnAdministratorSessions` |
| Existing Functions | `optimizeImage` concurrency 4 staging и 80 production. Все облачные Functions nodejs22/Gen2, в обоих проектах нет warm min instances |
| Scheduler, TTL, indexes | Совпадают установки семи Scheduler jobs, трёх ACTIVE TTL и 69 READY composites. Attendance work marker ready в обоих. Retention уведомлений 14 дней по default в staging, 5 настроено в production |
| App Check и Auth domains | App Check Auth/Firestore/Storage **UNENFORCED** в обоих. Staging имеет assessment points и собственный Auth domain. Два дополнительных production legacy domains требуют проверки назначения |
| Backup и IAM | Production имеет EU bucket с историческими экспортами. Managed backups/PITR отсутствуют в обоих. Runtime accounts разделены по проектам и имеют одинаковую широкую роль Editor. У staging Admin SDK SA дополнительно App Check Admin |

## 18. RECOMMENDED REMEDIATION PLAN

### MUST FIX BEFORE LAUNCH

1. **07C-01.** Подтвердить authenticated staging smoke для защищённых медиа и чата, guest booking и админской сессии, включая revoke. Согласовать точный release manifest и зависимую последовательность Functions → Rules → Hosting. Проверить оба production sites после релиза, отложенные индексы исключить. Scope — уже подготовленные изменения.
2. **07C-02.** Согласовать приемлемый RPO/RTO для финансов и админского доступа, выбрать минимальный механизм Firestore recovery и DB delete protection. Подтвердить восстановление в изолированной среде, проверить связи и финансовую идемпотентность, закрепить владельца процедуры и break-glass доступ. Отдельно подтвердить доступ к существующим budget alerts перед публичным трафиком.

### SHOULD FIX

- **07C-03.** Замерить точное использование Editor и широких Admin SDK ролей. Проверить узкий runtime в staging, включая CA-SEC-07B permissions.
- **07C-04/05.** Снять метрики backlog клиентских логов и daily purge. Работать с историческими error logs только после согласования retention и риска удаления.
- **07C-06/07.** Подтвердить необходимость старых OAuth authorized domains. Выполнить bounded media dry run после оценки операций и нужного окна восстановления.
- **07C-09.** Планово обновить транзитивные пакеты через upstream совместимые версии. При обнаружении контролируемого входа переоценить severity перед релизом.

### OPTIONAL / DEFERRED

- **07C-08.** Оставить краткосрочное хранение образов как есть. При устойчивом росте рассмотреть lifecycle и минимальный rollback window.
- Три TEST-only индекса, TEST Session, автоматическое изменение App Check/MFA, IAM Organization и сроки хранения постоянных доменных данных остаются **DEFERRED** или вне аудита.

## 19. DEPLOY IMPACT

| Surface | Текущий аудит | После отдельного согласования |
| --- | --- | --- |
| Functions | NO | 07C-01: точный approved diff включает отсутствующие 12 из §17 и уже существующие exports с изменениями общих admission, admin guards, upload и image proxy. В `functions/src/index.ts` shared callable wrapper меняет весь набор 42 callables. Совместимость отдельного partial deploy нужно оценить по фактическому release manifest |
| Hosting | NO | YES для двух production sites, staged verification и release provenance |
| Firestore Rules / Storage Rules | NO / NO | YES / YES по релизу CA-SEC-05B–07B |
| Firestore Indexes | NO | NO для текущих LIVE предложений |
| Migration/Data migration | NO | Отдельно, только при согласованном retention исторических error logs или изолированном restore drill |
| Settings/manual setup | NO | DR configuration, доступ к billing budget view и IAM решения согласуются отдельно |
| Schedulers/triggers | NO | Шесть staging-only signal triggers из §17 входят в release impact. Изменение расписаний не требуется. При 07C-04 меняется только `scheduledPurgeExpiredNotifications` после проверки нагрузки |

## 20. NOT VERIFIED

- Billing account budget/alerts HTTP 403, суммы invoices/credits, детализация SKU для egress и фоновых расходов, Secret Manager access counts, Auth MAU, Scheduler attempt history и Cloud Build minutes.
- Содержимое образов Functions по digest и deployed lockfile packages, callable App Check как отдельная характеристика deployed SDK, фактический авторизованный трафик по auth, media и legacy URLs. **AUTHENTICATED WORKFLOW: NOT VERIFIED.**
- Bucket object ACL/download tokens, объём и активные ссылки по media-префиксам, неклассифицированные перечисляемые объекты, исторические subcollections. Full Firestore и bucket scan не запускались.
- Фактическая полнота и восстановимость двух Firestore exports, Auth recovery, emergency admin access, RPO/RTO, rollback drills. PITR и backup schedules проверены по конфигурации.
- Наследуемый IAM и deny policy, действующие внешние credentials, секреты и журналы вне проверенного набора, полный анализ срока поддержки каждого upstream npm transitive dependency. Registry `npm audit` заблокирован авто-проверкой, выполнен офлайн-анализ OSV.

## 21. NEXT STEPS

**P0: 0 · P1: 2 · P2: 6 · P3: 1.** Необходимо закрыть путь выпуска проверенных staging защит в production и согласовать восстанавливаемую резервную копию. Существующие TTL, LIVE индексы, частоты Scheduler, Node.js 22/Gen 2 и нулевые min instances можно оставить. Экономия на текущих артефактах мала, существенный ресурс при росте — платный media transfer. Потенциальный ущерб перед запуском связан с более старой конфигурацией production, отсутствием подтверждённого восстановления и широкими правами runtime.

Следующее решение владельца — утвердить staged smoke/release manifest, DR цель и разрешённый restore drill. Бюджеты в режиме просмотра можно подтвердить существующим billing-администратором. До этого **CA-SEC-07D доступен для подготовки**, а запуск и инфраструктурные изменения остаются на согласовании. В репозитории добавлен только этот отчёт. Commit, push, PR, deploy и изменения облака не выполнялись.
