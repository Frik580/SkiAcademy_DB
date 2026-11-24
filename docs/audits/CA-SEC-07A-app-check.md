# CA-SEC-07A — Firebase App Check

**VERDICT** — MONITORING READY. Владелец подтвердил конфигурацию и исходные метрики staging в Google Cloud Console и Firebase Console. Фактическая аттестация новой сборки после выпуска в staging — NOT VERIFIED.

## CURRENT STATE

Аудит начат на `feat/ca-sec-07a-app-check` от `d610b556`. Локальная и удалённая `main` совпадали. В истории присутствуют CA-SEC-05B (#219–220), CA-SEC-06A (#222), CA-SEC-06B (#228) и CA-SEC-06C (#229). [Предыдущие аудиты](.)

| Компонент | Статус до изменений | Что установлено по исходникам |
| --- | --- | --- |
| Web bootstrap и provider | IMPLEMENTED | `initializeWebAppCheck(app)` вызывается сразу после `initializeApp`, перед Firestore, Auth и Functions. Lazy Storage использует тот же app. Provider — `ReCaptchaEnterpriseProvider`. |
| reCAPTCHA Enterprise в облаке | IMPLEMENTED (staging) | Владелец подтвердил существующий ключ Website · Score, включённую проверку доменов, оба staging-домена и регистрацию Firebase Web App. |
| Переменные среды | PARTIAL | Использовалась необязательная `VITE_APPCHECK_RECAPTCHA_ENTERPRISE_SITE_KEY`. В примере переменной и инструкции не было. |
| Автообновление | IMPLEMENTED | SDK получает `isTokenAutoRefreshEnabled: true` и управляет кешем, дедупликацией и обновлением. |
| Debug tokens | PARTIAL | Код не настраивал debug, но Firebase SDK считывает глобальный флаг и в debug печатает credential. Регистрация debug tokens в проектах — NOT VERIFIED. |
| Emulator, CI и Playwright | PARTIAL | Режим test и флаг эмуляторов пропускали App Check. Playwright использует режим e2e, demo-проект и эмуляторы. Новая проверка режима не зависит от наличия ключа. |
| Callable Functions и `enforceAppCheck` | PARTIAL | Общие options задают `false`, SDK проверяет присланный токен и пишет структурированную диагностику. Клиентская интеграция предусмотрена. Развёрнутая конфигурация и метрики — NOT VERIFIED. |
| `consumeAppCheckToken` | NOT IMPLEMENTED | Потребление токена и limited-use на клиенте не заданы. |
| HTTP Functions | NOT IMPLEMENTED | Собственные fetch и HTML media не передают App Check. HTTP-обработчики не проверяют App Check. |
| Firestore | IMPLEMENTED (staging Monitoring) | Клиент SDK поддерживает App Check. Исходная доля verified requests — 65%. |
| Cloud Storage | IMPLEMENTED (staging Monitoring) | Исходная доля verified requests — 32%. Прямые публичные URL остаются отдельным путём. |
| Firebase Auth | IMPLEMENTED (staging Monitoring) | Исходная доля verified requests — 83%. |
| Ошибка инициализации и получения токена | PARTIAL | Обмен, кеш и backoff выполнял SDK. Bootstrap не перехватывал синхронный сбой. Блокировка загрузки скрипта могла оставить promise provider в ожидании. |
| Triggers, schedulers, Admin SDK и внутренние вызовы | NOT APPLICABLE | Серверная идентичность и IAM. |

## FINDINGS

- Для активированного provider SDK 12.16.0 мог ждать заблокированный скрипт без тайм-аута. Callable получает App Check в SDK до отправки HTTP-запроса, поэтому отсутствие enforcement само по себе не гарантировало доступность.
- Прямой публичный Firebase Storage media URL для LIVE-аватара используется браузером без SDK. Включение Storage enforcement требует проверки каждого публичного пути и фактического результата для прямого URL и Image Proxy.
- Режим сборки и project ID можно связать в коде. Проверка принадлежности site key конкретному Firebase Web App требует сверки ключа с Console.

## FIX

- Инициализация выполняется один раз на Firebase app для согласованной пары release mode / project ID. Vite dev, loopback preview, test, e2e и emulator обходятся без аттестации. Пустой ключ отключает интеграцию, формат проверяется локально, регистрация и домен проверяются облачным сервисом.
- Если SDK debug-флаг присутствует до bootstrap и равен `true` или строке, интеграция пропускает активацию SDK. Код не печатает значение. Синхронный сбой фиксируется общим сообщением и не вызывает повторную инициализацию.
- Ожидание обычного обмена ограничено 5 секундами без повторного запуска уже ожидающей операции. Поздний успешный результат используется при следующем запросе SDK, если токен ещё действителен. При сбое callable продолжает без заголовка, Auth и Storage могут отправить служебный dummy token. Серверные операции продолжают зависеть от фактического режима enforcement.
- Ограничение ожидания использует внутренний hook provider в зафиксированной версии Firebase 12.16.0. Тест с установленным SDK проверяет транспорт, автоматическое обновление и поведение при зависании. Серверные изменения в этот этап не входят. [Bootstrap App Check](../../src/infrastructure/firebase/webAppCheck.ts) · [SDK-тест](../../tests/unit/webAppCheckSdk.test.ts)

## APP CHECK COVERAGE

Все 41 browser callables ниже проходят через Firebase Functions SDK. Основной клиент — `src/lib/functions/functionsClient.ts`. Прямые вызовы в bootstrap и `adminService.ts` также используют `httpsCallable`. Общий wrapper прикладывает `enforceAppCheck: false`, включая guest options и расширения отдельных routes. `consumeAppCheckToken` отсутствует. Гостевая аттестация может работать до входа, поскольку App Check использует Web App identity. [Серверные экспорты и параметры](../../functions/src/index.ts) · [Клиент callables](../../src/lib/functions/functionsClient.ts)

| Семейство и маршруты | Интеграция, риск и подход к enforcement |
| --- | --- |
| Команды `executeCanonicalCommand`, `executeGuestCanonicalCommand` | SDK. Обе точки охватывают разные операции. Первая включает бронирования, курсы, Wallet, платежи, профили и административные действия. Вторая критична для гостевых бронирований и восстановления до входа. Включать по endpoint после отдельных сценариев и оценки отказов. |
| Учётные записи, логирование и администрирование `claimGuestProfile`, `reportClientErrors`, `deleteErrorLog`, `clearErrorLogs` | SDK. Claim требует прогона регистрации, верификации email и связывания. Для диагностики ошибок нужен отдельный план доступности при сбое аттестации. |
| Финансы `queryKaspiPayments`, `queryAccountWalletHistory`, `queryAdminFinanceReadModels`, `resolveInstructorLessonRevenue` | SDK. Проверять кабинет ученика, финансовый раздел администратора, кабинет инструктора и переключение участника. Потребление токена для массовых чтений не планируется. |
| Бронирования и участники `queryLessonBookingReadModels`, `queryManagedParticipantPickerReadModels`, `queryBookingProposalReadModels`, `queryBookingChangeRequestReadModels`, `queryParticipantInstructorAccessReadModels`, `queryInstructorOccupancyReadModels`, `queryParticipantOccupancyReadModels`, `queryBookingInstructorCatalogueReadModels`, `queryLessonPricingSettingsReadModel` | SDK. Публичный каталог и цены требуют отдельной проверки без входа. Приватные чтения — проверка роли и участника. |
| Курсы `queryCourseEnrollmentReadModels`, `queryCourseCatalogReadModels`, `queryCourseAttendanceReadModels`, `queryInstructorCourseAssignmentReadModels`, `queryAdminCourseReadModels`, `queryAdminCourseEnrollmentReadModels` | SDK. Проверять публичный каталог, зачисление и проекции каждого участника, инструктора и администратора. |
| Доменные проекции `queryScopedClientDocuments`, `queryChatMessages`, `mutateChatMessage`, `queryInstructorReviewReadModels`, `queryParticipantProgressReadModels`, `queryParticipantProgressHistoryReadModels`, `queryInstructorParticipantRecommendationHistoryReadModels`, `queryParticipantAchievementsReadModels`, `queryParticipantLessonFeedbackReadModels` | SDK. Разграничить опубликованные и приватные документы, проверить восстановление чтений и записи чата. SSE имеет отдельный транспорт. |
| Админские проекции `queryAdminIssueReadModels`, `queryAdminIdentityReadModels`, `queryAdminPlannerReadModels`, `queryEmailDeliverySettingsReadModel`, `queryOutboxDeadLetterReadModel` | SDK. Кандидат для постепенного включения после ролевого smoke и проверки ошибки App Check. |
| `queryTestSessionReadModels`, `executeTestSessionLifecycle` | SDK по общим options. Функциональность этого раздела вне scope CA-SEC-07A. |
| HTTP `bookingChatMedia` | Fetch с Firebase Auth. Для отдельного этапа — App Check header на чтении, chunks, status, finish и cleanup. Использовать кеш SDK, проверить CORS, повтор/возобновление и длинные загрузки. Сохранить ACL и квоты. |
| HTTP `protectedImages` | Fetch с Firebase Auth на protected read и server-controlled uploads. Кандидат для отдельного этапа с header, CORS и проверкой разрешённых загрузок аватаров, курсов и инструкторов. HTML-отображение публичного URL оставить независимым от attestation. |
| HTTP `chatMessagesStream` | SSE поверх `fetch` уже передаёт Auth header. App Check возможен на открытии и переподключении, без запроса токена на каждое событие. Native EventSource не поддерживает произвольные заголовки. Проверить CORS, abort, восстановление и ответ при истекшем токене. |
| HTTP `optimizeImage`, Hosting `/api/img` | Публичный GET для браузерных изображений и CDN. Enforcement не планируется. Ключ кеша, источники и квоты CA-SEC-06C не меняются. |
| Firestore SDK | Автоматический header/credentials SDK. Кандидат для первого сервисного gate, когда подтверждены публичные чтения, подписки, роли, переключение участников и восстановление. |
| Storage SDK и прямые media URL | SDK uploads и `getDownloadURL` поддерживают App Check. Запрос браузера по URL является отдельной операцией. Gate отложить до проверки публичных изображений, LIVE-аватаров, download URL, загрузок и Image Proxy. HTTP upload к Functions — отдельная категория. |
| Firebase Auth | SDK. Оценивать отдельно при наличии Identity Platform. Проверить вход, регистрацию, email verification, восстановление, Google popup/redirect, обновление токена и гостевые сценарии. |
| Triggers, scheduled Functions, Admin SDK и серверные запросы | Применимость отсутствует. Сохраняются IAM и существующий серверный контроль. |

За границами Firebase backend присутствуют статические Hosting-ресурсы, сторонние media и погодный API. App Check приложения на них не отправляется. [HTTP-клиенты](../../src/infrastructure/firebase/protectedImageClient.ts) · [Chat media](../../src/features/chat/chatMediaClient.ts) · [SSE](../../src/features/chat/chatMessagesStreamClient.ts) · [Storage](../../src/infrastructure/firebase/storage.ts) · [Hosting rewrite/CSP](../../firebase.json)

## PROVIDER

Web использует score-based reCAPTCHA Enterprise без интерактивного CAPTCHA. Нужны отдельные ключи и отдельные Firebase Web App ID для staging и production. По умолчанию TTL 1 час, допустимый диапазон от 30 минут до 7 дней. Порог 0,5. Score ниже порога приводит к отсутствию валидного App Check токена. Оставить исходные значения на этапе наблюдения. Staging score может отличаться от production. [Firebase provider](https://firebase.google.com/docs/app-check/web/recaptcha-enterprise-provider) · [Google Cloud Web keys](https://docs.cloud.google.com/recaptcha/docs/create-key-website)

Проверить Chrome, Edge, Firefox, Safari и мобильные браузеры, включая приватные окна, ограничения IndexedDB, блокировщики и корпоративные сети. Поставщик требует доступ к внешнему скрипту, iframe и API. Для блокировки сети или скрипта важна проверка первого запроса и восстановления. Действующий Cloud Hosting CSP задан в режиме Report-Only. Сверить нарушения CSP перед любым будущим изменением политики, отдельно проверить, что выбранный score-based key не показывает challenge в целевых сценариях. [Google Cloud FAQ и CSP](https://docs.cloud.google.com/recaptcha/docs/faq)

## CONFIGURATION

| Контур | Настройка |
| --- | --- |
| Local dev, staging preview на loopback, emulator, CI, Playwright | App Check пропускается. Эмуляторы и CI используют demo-проект и прежние переменные. Для проверки attestation нужен зарегистрированный staging-домен. |
| Staging | `npm run build:staging` выбирает режим `staging`. Vite берёт существующий `VITE_APPCHECK_RECAPTCHA_ENTERPRISE_SITE_KEY` из игнорируемого `.env.staging`. Эффективный `VITE_FIREBASE_PROJECT_ID` — `ski-school-staging`, `VITE_FIREBASE_AUTH_DOMAIN` — `ski-school-staging.firebaseapp.com`, Web App ID совпадает с `.env.staging` и его номер проекта совпадает с `VITE_FIREBASE_MESSAGING_SENDER_ID`. Эмуляторы выключены. |
| Production | `npm run build:prod`, project `ski-school-8f3ca`, production Web App ID. Установить ключ в игнорируемый `.env.production.local` или в окружение только этой сборки. |

Перед выпуском сверить тройку project ID / app ID / site key с выбранным Firebase App. Проверить, что общий `.env` и унаследованная shell/CI-переменная не подменяют mode-specific ключ. Site key находится в публичном JS по назначению. Debug credentials и приватные ключи не должны попадать в `VITE_*`, сборки или логи. Для текущих задач debug-токены не нужны. [Пример env](../../.env.example) · [Firebase debug provider](https://firebase.google.com/docs/app-check/web/debug-provider)

## MANUAL SETUP

Для staging регистрация уже завершена. Ключ reCAPTCHA Enterprise — Website · Score. Domain verification включена, `ski-school-staging.web.app` и `ski-school-staging.firebaseapp.com` разрешены, Web App зарегистрирован в App Check. Для выпуска используется существующая переменная `VITE_APPCHECK_RECAPTCHA_ENTERPRISE_SITE_KEY`. Прямую сверку её значения с Key ID в Console отделяем от проверки локальной сборки.

Из корня репозитория в PowerShell команда отдельной staging-сборки выглядит так:

```powershell
npm run build:staging
```

После отдельного разрешения на выпуск из чистого рабочего дерева запустить штатную Hosting-команду:

```powershell
npm run deploy:staging
```

Runner сам выполняет `npm run build:staging && firebase deploy --project staging --only hosting` и проверку provenance. Alias `staging` указывает на `ski-school-staging`. Сейчас изменения CA-SEC-07A находятся в рабочем дереве. Штатный runner блокирует release build из dirty tree.

Справочные шаги для будущей регистрации App Check после отдельного согласования.

1. В Firebase Console открыть нужный проект → Project settings → General → Your apps. Сверить Project ID и Web App ID с переменными сборки. Если web app отсутствует, зарегистрировать через Add app → Web после согласования.
2. В Google Cloud Console выбрать тот же проект → Fraud Defense (reCAPTCHA) → Keys. Проверить имеющийся Website score-based key. Если его нет, после согласования создать Website key, выбрать score-based без challenge и сохранить включённую проверку доменов. Добавить только обслуживаемые домены. Для staging исходный allowlist — `ski-school-staging.web.app`, `ski-school-staging.firebaseapp.com`. Для production — фактически обслуживаемые из `ski-school-8f3ca.web.app`, `ski-school-8f3ca.firebaseapp.com`, `carveacademy.web.app`, `carveacademy.firebaseapp.com`. Проверить реальные custom domains в Firebase Hosting. Loopback в allowlist не включать. При запросе включить API или изменить billing остановиться до согласования.
3. В Firebase Console → Security → App Check → Apps → нужный Web App → Register → reCAPTCHA Enterprise. Ввести **публичный Key ID**, оставить TTL 1 час и threshold 0,5, сохранить после согласования. Проверить наличие других Web Apps с трафиком в этом проекте.
4. В App Check → APIs проверить, что Firestore, Storage и применимая Authentication допускают наблюдение. Включение Enforce относится к последующим этапам. Для callables сверить source/release provenance и structured verification logs.
5. Собрать Hosting с соответствующими параметрами по таблице. После отдельно согласованного выпуска открыть staging в чистом браузере, проверить успешный обмен и рост verified requests. Для проверки сохранять только статус и агрегаты. Заголовки с токенами и HAR с credentials не экспортировать.

Read-only проверка конфигурации возможна через Firebase Console и Google Cloud Keys. Для автоматизированной сверки регистрацию можно читать через App Check REST `recaptchaEnterpriseConfig.get`, настройки сервисов через `services.get/list`. `list` возвращает явно настроенные сервисы. [Регистрация Firebase](https://firebase.google.com/docs/app-check/web/recaptcha-enterprise-provider) · [Google Cloud Keys](https://docs.cloud.google.com/recaptcha/docs/create-key-website) · [REST App Check](https://firebase.google.com/docs/reference/appcheck/rest)

## TESTS

| Проверка | Результат |
| --- | --- |
| App Check unit и SDK contract | PASS, 20 App Check-тестов. Сопутствующий запуск с chat media client — 30 тестов. |
| Auth UI и guards окружения | PASS, 33 теста в совместном запуске Auth UI и App Check, включая регистрацию и вход. Ещё 30 тестов проверили Firestore/Auth/Functions Emulator и соответствие host/project. |
| Firestore integration | PASS, 19 тестов и выход wrapper 0. Первый запуск прошёл assertions, но wrapper завершился ошибкой записи configstore. Повтор с отдельным локальным configstore завершился штатно. |
| Storage Rules и chat media | PASS, 41 приложение/Rules и 67 серверных тестов, wrapper 0. Проверены авторизация, загрузки, ограничения и квоты. |
| TypeScript, Functions build, production build | PASS. Build Functions прошёл в подготовке E2E. Production bundle собран с project ID `ski-school-8f3ca`. |
| Staging build и Hosting runner | PASS. Локальная сборка в отдельный каталог указала `staging` и `ski-school-staging` в `build-info.json`. В одном JS bundle подтверждены точное значение ключа из `.env.staging` и эффективный Web App ID. План штатного runner проверен с подставными исполнителями, без сетевого вызова deploy. |
| `test:quick` | PASS, 642 app-unit, 454 shared-domain, 1 756 functions-unit, 66 Node и 2 translation tests. Исходный sandbox-run заблокировал создание временных Git-клонов, полный повтор вне sandbox прошёл. |
| ESLint, test inventory, `git diff --check` | PASS. ESLint сообщил предупреждения, преимущественно из-за CRLF в рабочем дереве. Inventory актуален, 728 записей. |
| Browser E2E | PASS, 14 целевых Chromium-сценариев. Первый запуск в Chromium зафиксировал 8 успешных сценариев до общего тайм-аута Playwright. Остальные 6 прошли в отдельном запуске с выходом 0. Покрыты вход, кабинеты трёх ролей, бронирования, Wallet, chat media, SSE, авторизация и квоты. Полный manifest E2E в sandbox остановился на готовности Functions Emulator. Покрытие восстановлено целевыми запусками с установленным Chromium вне sandbox. |
| Hosting Emulator | PASS, 2 сценария и выход wrapper 0. Проверены security headers, публичный `/api/img`, CDN/cache-control, браузерное получение кешированной картинки и лимиты uncached transforms. |
| Graphify | PASS, обновлён граф source code. |

Новые сценарии — в уже зарегистрированном `webAppCheck.test.ts` и зарегистрированном `webAppCheckSdk.test.ts`. В SDK-тестах реальный пакет Firebase получает синтетические ответы в локальном jsdom. Они проверяют кеширование, автоматическое обновление, передачу App Check header и деградацию callable при недоступном скрипте. Auth, клиенты без токена, гостевое и авторизованное бронирование, Wallet, кабинеты, загрузки, chat media, SSE, Image Proxy и квоты проверяются профильными существующими suites. Результаты разделены по выполненным suites. Настоящий reCAPTCHA Exchange и поведение конкретного enrolled проекта остаются NOT VERIFIED.

## PERFORMANCE

Bootstrap выполняется синхронно до создания Firebase SDK services, без ожидания сетевого обмена для первого рендера. SDK асинхронно подгружает script и начинает обмен или использует действующий токен из IndexedDB. Cold path добавляет загрузку/исполнение script, attestation и exchange; точный TTFB/LCP и разница p95 первых callable/SDK-запросов требуют замера на staging. 5 секунд ограничивают ожидание provider на активной вкладке, браузер может отложить таймер в фоне. SDK самостоятельно повторяет неудачные обмены с backoff. Постоянно ожидающий обмен в одном app не порождает новые сетевые попытки от wrapper. Если SDK так и не получает событие загрузки скрипта, новая попытка возможна при новом bootstrap страницы. Открытие новой вкладки или reload влияет на in-flight состояние и кеш.

В норме один обмен при отсутствии валидного кеша, затем около одного на цикл обновления. В установленной версии интервал при часовом TTL составляет около 35 минут. Кешированные токены прикладываются к нескольким запросам. App Check не добавляет Firestore reads/writes и отдельных Functions invocations к обычному запросу. У callables есть проверка заголовка библиотекой, а на холодном клиенте возможна задержка до получения токена. Replay protection добавляет отдельную серверную операцию и новые client attestations.

## COST IMPACT

Тарифы проверены 24.11.2026, USD за календарный месяц. Первые 10 000 assessments бесплатны суммарно по организации, включая другие проекты и ключи. При привязанном billing Premium стоит $8 за диапазон 10 001–100 000 и дополнительно $0,001 за каждую проверку сверх 100 000. При Essentials без billing при исчерпании общей квоты дальнейшие assessments возвращают 429. Название provider reCAPTCHA Enterprise не означает выбор Enterprise subscription. [Google Cloud billing](https://docs.cloud.google.com/recaptcha/docs/billing-information) · [Сравнение тарифов](https://docs.cloud.google.com/recaptcha/docs/compare-tiers)

Модель при TTL 1 час считает визиты с холодным кешем. В колонке «Типичный» шесть визитов на пользователя в месяц. Четыре по 15 минут и два по 50 минут дают восемь обменов. «Короткий» — три визита по 15 минут. «Длительный» — пять по 15 минут и пять по 75 минут, до 20 обменов. Длительный визит включает обновления примерно на 35-й и 70-й минутах. Расходы рассчитаны при свободной общей квоте и активном Premium для превышения.

| MAU | Короткий, assessments / USD | Типичный, assessments / USD | Длительный, assessments / USD |
| ---: | ---: | ---: | ---: |
| 100 | 300 / $0 | 800 / $0 | 2 000 / $0 |
| 1 000 | 3 000 / $0 | 8 000 / $0 | 20 000 / $8 |
| 5 000 | 15 000 / $8 | 40 000 / $8 | 100 000 / $8 |
| 10 000 | 30 000 / $8 | 80 000 / $8 | 200 000 / $108 |

Реальный объём зависит от браузеров и устройств, времени между визитами, фоновых вкладок, доступности и разделения IndexedDB, TTL, блокировщиков, повторов и трафика без входа. Кеш может уменьшать число обменов. Гостевой трафик сверх MAU и другие ключи увеличивают потребление. Оценка предполагает один assessment на успешный Enterprise-обмен и исключает дополнительный трафик неуспешных и limited-use exchanges, который следует измерять отдельно.

## SECURITY REVIEW

Независимая проверка исходников выявила потерю позднего успешного токена и риск аттестации в staging preview на loopback. Оба исправлены. Повторная проверка этих участков не выявила блокирующих замечаний. Принадлежность реальных site keys проверяется при выпуске. Blobs, URL, кеш, Auth, Rules, canonical authorization и rate limits продолжают использовать существующие механизмы.

**Replay protection.** Firebase JS 12.16.0 поддерживает `httpsCallable(..., { limitedUseAppCheckTokens: true })`. Functions 7.3.0 поддерживает `consumeAppCheckToken`, Admin 14.4.0 — `verifyToken(token, { consume: true })`. Для Node.js это beta, требуется фактическому runtime service account роль Firebase App Check Token Verifier, `roles/firebaseappcheck.tokenVerifier`. Действительно чувствительный handler должен обработать `request.app.alreadyConsumed`. Потребление добавляет серверный round trip и обычно требует новую клиентскую аттестацию на обращение. Измерять p95 и assessments на операцию. Переносить в отдельный этап только после определения подходящего выделенного low-volume endpoint и безопасного поведения повторов. Кандидаты — подтверждение платежа, изменение админских полномочий, необратимое удаление. Мультиплексированные команды Wallet, бронирования и чтения остаются с обычными токенами. Существующая идемпотентность сохраняет роль защиты бизнес-операций. [Callable enforcement и replay](https://firebase.google.com/docs/app-check/cloud-functions) · [Custom backend replay](https://firebase.google.com/docs/app-check/custom-resource-backend)

## MONITORING PLAN

Исходные метрики staging подтверждены владельцем до выпуска CA-SEC-07A. Период выборки и число запросов не указаны.

| Сервис | Режим | Verified requests |
| --- | --- | ---: |
| Storage | Monitoring | 32% |
| Firestore | Monitoring | 65% |
| Authentication | Monitoring | 83% |

После отдельно согласованного Hosting-релиза сравнить доли и объёмы запросов по каждому сервису за одинаковые периоды. Проверить получение токена новой сборкой на обоих staging-доменах и разобрать долю unverified. Исходные метрики служат точкой отсчёта для наблюдения.

1. **Preparation.** Сверить cloud config, домены, quota, приложения, предыдущую версию Hosting и существующие токены CI. Без реального ключа локально проверять транспорт и graceful degradation, с ключом — только утверждённый staging.
2. **Monitoring.** В Firebase App Check → APIs смотреть verified, invalid, outdated и unknown по Firestore, Storage и применимой Auth. Сопоставлять с Google Cloud assessments, score distribution и отказами обмена. Для callables использовать Cloud Logging по метке `firebase-log-type=callable-request-verification` и `jsonPayload.verifications.app`, группируя по функции и release. Сопоставлять с ошибками, p95 и позитивными сценариями гостя и ролей. [Firebase metrics](https://firebase.google.com/docs/app-check/monitor-metrics) · [Callable wrapper SDK](../../functions/src/index.ts)
3. Для custom HTTP в отдельном предложении проверить возможность sampling in observation mode: сначала на клиенте добавить `X-Firebase-AppCheck` только для выбранных fetch, затем классифицировать `missing/valid/invalid/error` на сервере через Admin SDK, без consume и без изменения ответа. Логировать только имя endpoint, результат, версию и агрегированные задержки. Исключить значения токенов, headers, URL query, UID и содержимое media. Учесть CORS, диапазоны media и дополнительную проверку на open/reconnect SSE. Для CDN оставить существующие метрики запросов, cache hit ratio и лимиты.
4. Условие перехода — согласованные бюджет и SLO, репрезентативные окна трафика, практически весь поддерживаемый клиентский трафик verified, разобраны invalid/outdated/unknown, стабильны успешность сценариев и p95, проведён контрольный откат. Предлагаемый стартовый критерий — не менее 99,9% verified среди подтверждённого поддерживаемого трафика за семь дней и отсутствие блокировки критических позитивных сценариев. Это критерий для согласования после получения baseline.

## ENFORCEMENT PLAN

| Порядок после согласования | Критерий готовности в staging | Откат |
| --- | --- | --- |
| 1. Firestore | SDK reads/listeners с валидным токеном, ожидаемый отказ без токена, гостевой каталог и кабинеты по ролям, восстановление сессии и отсутствие регрессии Rules. | Вернуть режим наблюдения Firestore в App Check → APIs, дождаться распространения, проверить те же сценарии. |
| 2. Callable pilot | Выбрать один low-impact endpoint по телеметрии, протестировать valid/missing/invalid и прежний authorization. Остальные подключать по одному. `executeGuestCanonicalCommand` и `executeCanonicalCommand` выделить в отдельные волны после гостевого, платёжного и ролевого smoke. | Вернуть option на конкретном endpoint и развернуть его предыдущую версию с учётом shared-source зависимости. |
| 3. Storage | Подтвердить обычный SDK upload/download и все публичные media пути. Если прямой LIVE-аватар перестаёт открываться, gate отложить до согласованного решения с сохранением публичности и кеша. | Вернуть режим наблюдения Cloud Storage, перепроверить публичный GET, SDK и Image Proxy. |
| 4. Собственные HTTP | Отдельно согласовать fetch observation и по одному маршруту. Сначала защищённые операции upload/read, затем chat и SSE после проверки reconnect, CORS, chunks и resume. Публичный CDN исключён. | Вернуть observation конфигурацию verifier или предыдущий релиз только затронутых endpoints. |
| Отдельная волна Auth | Подтверждённая Identity Platform, покрытие браузеров и проверка всех sign-in/guest путей. | Вернуть режим наблюдения Auth, проверить sign-in, refresh и подтверждение email. |

Production использует собственные ключи, мониторинг и gates. Повторить порядок только после staging soak, сверки текущих API режимов, согласования release/rollback и оценки доли старых сборок. Между волнами наблюдать успешность сценариев, p95, трафик и расходы. Firebase предупреждает о задержке распространения изменений enforcement, поэтому откат проверять с чистым браузером и существующей сессией. [Настройки enforcement Firebase](https://firebase.google.com/docs/app-check/enable-enforcement) · [Callable options](https://firebase.google.com/docs/app-check/cloud-functions)

## DEPLOY IMPACT

| Область | CA-SEC-07A |
| --- | --- |
| Functions | NO |
| Hosting | YES, обновлён web bundle при будущем выпуске |
| Firestore Rules / Storage Rules / Indexes | NO / NO / NO |
| Config | NO для staging Hosting-релиза, сборка использует существующий site key и зарегистрированный Web App |
| IAM / Secrets | NO / NO |
| Data migration / Schedulers / Triggers | NO / NO / NO |

## ROLLBACK

В режиме наблюдения удалить site key из настроек сборки и выпустить предыдущий Hosting release или сборку с пустым ключом после согласования. Проверить холодную загрузку и гостевой/авторизованный сценарий. Если к тому моменту включён enforcement, сперва вернуть наблюдение для соответствующих сервисов и снять требование на затронутых callables/custom routes. После распространения и проверки доступности можно откатить клиент. Регистрацию ключа сохранять на время диагностики.

## NOT VERIFIED

- Staging — прямая сверка значения локального site key с Key ID в Console, TTL и risk threshold, deployed options callables, фактический reCAPTCHA Enterprise exchange новой сборки, профиль браузеров с расширениями, latency и число assessments. Публичный staging bundle из текущего окружения не удалось прочитать из-за ошибки DNS.
- Production — облачная конфигурация и фактическая аттестация остаются NOT VERIFIED.
- Staging и production — AUTHENTICATED WORKFLOW: NOT VERIFIED. Локальные роли проверяются в demo emulator suites в пределах результатов выше.

## NEXT STEPS

После согласованного Hosting-релиза staging сверить версию по `build-info.json`, проверить аттестацию на разрешённых доменах и сравнить метрики с зафиксированным baseline. Для CA-SEC-07B собрать baseline callables, проверить публичные Storage URL до Storage gate и согласовать отдельный HTTP-пилот для защищённых fetch. Отдельно выбрать sensitive endpoint для оценки replay protection. Enforcement готовить по результатам мониторинга.
