# CA-SEC-07B — Administrator Security

## VERDICT

**LOCAL READY** для проверенных LIVE-сценариев и рассмотрения staging-выпуска. Покрытие отзыва вне приложения ограничено. Staging и облачная MFA остаются непроверенными. Сведения о первом срезе сохранены ниже как история.

| Готовность | Статус |
| --- | --- |
| LOCAL READY | PASS для проверенных сценариев, включая браузерный step-up с demo Firebase Auth. Исходники готовы к рассмотрению staging-выпуска с MFA по умолчанию выключенной. |
| STAGING VERIFIED | NOT VERIFIED. Развёртывание и облачная конфигурация требуют согласования. |
| MFA ENFORCEMENT READY | NOT VERIFIED. Требуются настоящая TOTP, репетиция восстановления и подтверждение совместимости провайдеров на staging. |

## COMPLETION

### Единая политика и покрытие

Серверный отзыв пишет в `users/{uid}` целочисленную UTC-отметку `adminSessionsRevokedThrough`. Этот же Account остаётся источником роли и lifecycle. При отзыве сначала записывается отметка, затем Firebase Admin SDK отзывает refresh tokens. Если вызов пересёк границу секунды, подтверждённая отметка продвигается в транзакции. Старый `auth_time`, включая ровно секунду отметки, теряет административный доступ при следующей проверке. При сбое Firebase Auth запись Account остаётся защитой административных путей, результат отзыва журналируется как неподтверждённый.

Серверный флаг первого среза `CARVE_ADMIN_TOTP_REQUIRED` заменён на поле `adminTotpRequired` того же Account. Оно выключено при отсутствии значения и доступно для изменения только через доверенный Admin SDK с IAM. Firestore Rules запрещают ввод полей сессии при обычной регистрации, а браузерный self-update ограничен разрешённым списком существующих полей. Functions, Firestore и Storage проверяют одинаковый подписанный признак `firebase.sign_in_second_factor == 'totp'`. `VITE_ADMIN_TOTP_ENROLLMENT` остаётся выключенным по умолчанию. Настройки облачных окружений не менялись.

| Граница | Проверка |
| --- | --- |
| LIVE canonical commands | Текущие role/lifecycle, Account cutoff/TOTP, проверка Firebase Auth disabled/revocation. Транзакционный исполнитель повторяет проверку Account на существующем чтении. Step-up только для ранее согласованных видов. |
| LIVE административные callable read models | Существующие scoped резолверы проверяют cutoff/TOTP по уже прочитанному Account. В смешанных маршрутах проверка административной ветки применяется после определения LIVE scope. У публичных каталогов обычные LIVE-контракты. |
| `queryScopedClientDocuments` | Непубличный LIVE admin доступ проверяет cutoff/TOTP до запроса и по свежему Account перед выдачей. |
| `clearErrorLogs`, `deleteErrorLog`, `revokeOwnAdministratorSessions` | Проверки Account и Firebase Auth перед действием. Удаления проверяют Account ещё раз внутри транзакции. Возобновление очистки сохраняет подписанный курсор. |
| Чат callable и HTTP | Общее разрешение LIVE административного доступа проверяет Account cutoff/TOTP. HTTP уже проверяет Firebase revoke через Admin SDK. SSE передаёт проверенный токен во вложенный запрос и повторяет проверку при следующем событии. |
| `protectedImages`, `bookingChatMedia` | LIVE административные действия проверяют cutoff/TOTP в существующих разрешениях. HTTP проверяет отзыв через `verifyIdToken(..., true)`. Публичный Image Proxy имеет отдельную публичную политику. |
| Прямой Firestore и Storage SDK | LIVE административные ветки проверяют тот же Account и подписанные claims. Права за счёт владения и другие обычные роли сохраняют существующие правила. |
| Прямой Admin SDK вне HTTP/callable | Доверенные задачи, триггеры, операционные скрипты и ручные действия под IAM обходят Rules. Они не используют браузерную административную сессию. |

Прямой отзыв через Firebase Console или Admin SDK без записи Account не виден Rules и callable, опирающимся только на отметку. Такие пути могут принять ранее выданный ID-токен до истечения срока. Для критической серверной мутации и HTTP проверяется также Firebase timestamp. Данные, которые уже были загружены, не удаляются из памяти чужого клиента. Открытый поток завершается при перепроверке сессии, а момент пересмотра прав действующей Firebase подписки зависит от сервиса.

### Встроенное подтверждение личности

Типизированный серверный отказ `ADMIN_RECENT_AUTH_REQUIRED` открывает общее окно на существующем `AdminModal`. Поддерживаются пароль и Google popup, при необходимости используется Firebase resolver для TOTP. После успешного подтверждения обновляется ID-токен. Повтор возможен один раз с исходным payload и тем же idempotency key. Канонический сервер привязывает повтор к UID и требует, чтобы источник по-прежнему был LIVE административным. Для удаления логов повтор привязан к тому же UID и курсору. Escape, явная отмена, смена Auth generation или закрытие административного интерфейса прекращают ожидание. Пароль и код очищаются из полей сразу после отправки и не журналируются.

### Производительность

Дополнительных чтений в обычных запросах учеников и инструкторов нет. Административные проекции используют уже прочитанный Account. Проверки Firebase Auth в canonical, HTTP и удалении логов используют имеющиеся вызовы. Фактическое удаление логов добавляет одно чтение Account внутри каждой транзакции. Самоотзыв добавляет одну транзакционную запись cutoff и иногда вторую при переходе секунды. Каждая запись может запустить существующий `syncClientUserSignal` и инвалидировать LIVE-проекцию пользователей. Step-up добавляет запросы reauth, обновление ID-токена и один повтор исходного вызова только при истечении окна. Задержка в staging не измерена.

### Deploy impact и откат

- Functions — `executeCanonicalCommand`, `deleteErrorLog`, `clearErrorLogs`, `revokeOwnAdministratorSessions`, `queryScopedClientDocuments`, `queryAdminIdentityReadModels`, `queryAdminCourseReadModels`, `queryAdminCourseEnrollmentReadModels`, `queryAdminFinanceReadModels`, `queryAdminIssueReadModels`, `queryAdminPlannerReadModels`, `queryEmailDeliverySettingsReadModel`, `queryOutboxDeadLetterReadModel`, `queryKaspiPayments`, `queryBookingChangeRequestReadModels`, `queryLessonBookingReadModels`, `queryManagedParticipantPickerReadModels`, `queryParticipantProgressReadModels`, `queryChatMessages`, `mutateChatMessage`, `chatMessagesStream`, `bookingChatMedia`, `protectedImages`.
- Hosting, Firestore Rules, Storage Rules — YES. Индексы, миграции, новые секреты, требования IAM, новые schedulers и triggers — NO. Identity Platform и включение MFA требуют отдельного разрешения.
- Для отката координировать Rules, Functions и Hosting. Сначала убрать требование MFA для пилотного Account при сохранённом рабочем входе. Не удалять cutoff и зарегистрированные факторы при обычном откате приложения. Отозванные refresh tokens не восстанавливаются. Старые сборки, не читающие cutoff, допускают остаточный период старых ID-токенов, поэтому при инциденте сохранить действующие ограничения ролей и подтвердить истечение ранее выданных токенов.

### Проверки Completion

| Проверка | Результат |
| --- | --- |
| Step-up UI | PASS. Пять unit-сценариев проверяют обычный успешный запрос, Escape и неверный пароль, подставной TOTP, смену пользователя, отсутствие второго повтора. |
| Functions unit | PASS. 90 тестов. Проверены TOTP claim, cutoff, свежесть, привязка повтора к UID и инвентарь экспортов. |
| Auth UI и ошибки | PASS. Совместный прогон Auth, step-up, переводов и сервиса логов прошёл до добавления пятого отдельного сценария. |
| Firestore и Storage Rules | PASS. Целевые тесты проверили границу cutoff, отсутствие нужного фактора и допуск свежего TOTP claim. |
| Integration | PASS. 40 целевых тестов в трёх наборах, включая финансовую идемпотентность и удаление логов. Внешний Firebase CLI завершился с ошибкой проверки обновлений после того, как все assertions прошли и эмуляторы остановились. |
| Git provenance | FAIL в песочнице, PASS вне её. `git clone --shared --no-checkout` завершался кодом 128 до проверки `core.autocrlf`. Оба режима и контрольный тест прошли в штатном файле без изменений теста. |
| TypeScript, ESLint для затронутых файлов, Functions и production builds, test inventory, Graphify, `git diff --check` | PASS. Зарегистрирован `tests/unit/administratorStepUp.test.tsx`. |
| Browser E2E | PASS. В одном прогоне прошли вход ученика и административный каталог, а отдельный повтор завершил step-up сценарий с demo Firebase Auth и Functions. Проверены удаление при свежем входе, Escape, неверный пароль, подтверждение и один повтор без выхода со страницы. Истечение окна моделируется типизированным ответом callable. Само окно проверяется серверными unit-тестами. TOTP в браузере не проверялся. |
| Независимое security review | Замечания к транзакционным проверкам, выдаче scoped reads, SSE и смешанным областям чтения исправлены и точечно перепроверены. Ограничение отзыва вне приложения описано в таблице покрытия. |

Результаты подставных TOTP claims в Rules и моков SDK в unit не доказывают облачную TOTP. Подготовленная процедура восстановления из раздела RECOVERY требует репетиции на двух независимых административных входах.

### Дополнение Google OAuth

Step-up определяет доступные способы по `user.providerData`. Аккаунт только с Google получает кнопку **Подтвердить через Google**, аккаунт с паролем получает поле пароля, а при двух привязанных провайдерах доступны оба способа. Вызов `reauthenticateWithPopup` получает текущего Firebase User и общий `GoogleAuthProvider`. Firebase сравнивает UID пользователя с UID подтверждённой учётной записи, а приложение проверяет исходную сессию перед повтором. После подтверждения обновляется ID-токен, и canonical callable получает тот же ключ идемпотентности и ожидаемый UID. Серверное окно в 10 минут по `auth_time` сохраняется.

Локальные регрессии с моками SDK покрывают Google-only, несколько провайдеров, неверный Google-аккаунт, блокировку и закрытие popup, отказ OAuth, смену пользователя, отмену окна во время popup и переход от Google к TOTP. Прошли 32 клиентских теста, включая RU/EN, и 21 серверный тест. Общий AdminModal прошёл три компонентные проверки Chromium на размерах 1440×900 и 320×568 и при уменьшении области просмотра экранной клавиатурой. [Firebase Auth API](https://firebase.google.com/docs/reference/js/auth#reauthenticatewithpopup)

**STAGING VERIFIED — NOT VERIFIED.** На staging требуется реальный Google OAuth в desktop и mobile браузерах. Проверить авторизованный домен, успешный выбор исходного аккаунта и обновление `auth_time`, отказ для другого Google-аккаунта, закрытие и блокировку popup и единственный повтор согласованной операции на тестовых данных. Реальный Google + TOTP проверяется отдельно после согласования MFA-пилота.

## История первого среза

Исходная ветка `feat/ca-sec-07b-administrator-security` была чистой, базовый коммит `958c3fcb` совпадает с GitHub `main` по сравнению через GitHub API. Проверены исправления CA-SEC-03 (`87366601`), CA-SEC-04 (`2dbe3837`), CA-SEC-05B (`c88949d6`, `725d082d`), CA-SEC-06A/B/C (`c27c5a83`, `0fb99073`, `d610b556`) и CA-SEC-07A (`958c3fcb`). Фактический статус развёртывания предыдущих исправлений не проверялся. [CA-SEC-04](CA-SEC-04-command-policy-implementation.md) · [CA-SEC-05B](CA-SEC-05B-live-release-readiness.md) · [CA-SEC-07A](CA-SEC-07A-app-check.md)

## CURRENT STATE

Состояние до изменений по текущим исходникам.

| Направление | Статус | Фактический контракт |
| --- | --- | --- |
| Вход | IMPLEMENTED | Общая форма использует Firebase email/password и Google popup. Административная роль разрешается после входа. Фактическая настройка providers в облаке не проверялась. |
| Роль и активность Account | IMPLEMENTED | LIVE canonical callable получает UID от Firebase, определяет capability по `commandPolicies.ts` и текущему `users/{uid}`. Runtime повторно проверяет административный Account в транзакции. Firestore и Storage Rules используют серверный профиль. |
| Custom claims | NOT IMPLEMENTED | Установка `admin` custom claim в коде отсутствует. Источник роли — Account. Подписанные стандартные Firebase claims используются для аутентификации. |
| Email verification | PARTIAL | Проверка есть для регистрации и подтверждения совместимого профиля. Вход в существующий Account не требует повторной проверки email. Общего требования `email_verified` для администрирования не было. |
| ID и refresh tokens, срок сессий | IMPLEMENTED | Firebase обновляет ID token с номинальным сроком до часа. Отдельного абсолютного срока или idle timeout у административной сессии в приложении нет. |
| `auth_time` | PARTIAL | `claimGuestProfile` сверяет с `tokensValidAfterTime`. Общей проверки свежести администрирования не было. |
| Отозванные токены | PARTIAL | `bookingChatMedia`, `protectedImages`, `chatMessagesStream` используют `verifyIdToken(..., true)`. Поток чата перепроверяет токен. Обычная проверка callable не включает проверку отзыва, а Rules не сверяют Auth revocation time. |
| Смена роли и отключение Account | IMPLEMENTED | Административные права определяются при новом запросе по актуальному Account. Транзакционные проверки защищают мутации от устаревшего снимка. Отдельной гарантии прекращения уже открытой подписки сразу после изменения этих полей нет. |
| Принудительное завершение | NOT IMPLEMENTED | До среза был обычный клиентский выход и доступная операторам Firebase Admin SDK возможность отзыва. Действие в админке отсутствовало. |
| Сброс пароля | IMPLEMENTED | Firebase `sendPasswordResetEmail` с локалью. Сброс пароля и восстановление TOTP — разные процедуры. |
| MFA | NOT IMPLEMENTED | В приложении отсутствовали TOTP enrollment, challenge и проверка фактора при административном доступе. |
| Административный аудит | PARTIAL | Canonical ActivityLog и доменные события покрывают ряд административных изменений. Покрытие прямых операций и вызовов вне канонического пути неполное. |

[Auth service](../../src/features/auth/authService.ts) · [Callable](../../functions/src/canonical/commands/executeCanonicalCommandCallable.ts) · [Firestore Rules](../../firestore.rules) · [Storage Rules](../../storage.rules) · [Firebase session management](https://firebase.google.com/docs/auth/admin/manage-sessions)

## FINDINGS

- **P1.** Скомпрометированный первичный вход администратора получает административные права без доказательства второго фактора.
- **P1.** Критические существующие мутации доступны со старым `auth_time`. Нужна единая серверная политика на каждом доверенном входе к этим мутациям.
- **P1.** Отзыв refresh tokens ограничивает получение новых ID tokens. Нужен отдельный контроль действующих ID tokens на всех административных API и Rules. Остаток после среза описан в SESSION REVOCATION.
- **P2.** Удаление логов, прямые настройки и MFA recovery не имеют общего расследуемого аудита. Данные и трассировки могут оставаться в облачном журнале только при подходящих правах и политике хранения.

## MFA

Firebase Authentication with Identity Platform и конфигурация TOTP уровня проекта обязательны. Web SDK 12.16.0 и Admin SDK 14.4.0 превышают минимальные версии 9.19.1 и 11.6.0. Email/password и Google поддерживаются при подтверждённом email. Custom-token, anonymous и phone как первый фактор для TOTP непригодны. Для нынешних способов входа обновление зависимостей не требуется. Документация Auth Emulator описывает SMS MFA. Настоящую облачную TOTP enrollment/challenge следует проверять отдельной сессией в staging после согласования. [Firebase TOTP Web](https://firebase.google.com/docs/auth/web/totp-mfa) · [Identity Platform TOTP](https://docs.cloud.google.com/identity-platform/docs/admin/enabling-totp-mfa) · [Auth Emulator](https://firebase.google.com/docs/emulator-suite/connect_auth)

При сборке с `VITE_ADMIN_TOTP_ENROLLMENT=true` секция администратора открывает enrollment для текущего UID с верифицированным email. Firebase SDK создаёт секрет и проверяет код. Администратор добавляет ключ вручную в приложение-аутентификатор. Секрет и код хранятся в памяти формы и очищаются при отмене или успешной регистрации. Обработчик `auth/multi-factor-auth-required` для password и Google даёт выбрать TOTP-фактор и завершает Firebase challenge до загрузки Account. Ошибки MFA не передаются в существующий logger. Встроенная повторная аутентификация и удаление фактора из интерфейса ещё не реализованы.

При локальном включении `CARVE_ADMIN_TOTP_REQUIRED=true` проверка сессии принимает `firebase.sign_in_second_factor === 'totp'` из проверенного Firebase ID token. Наличие `enrolledFactors` не даёт допуск. Защищены LIVE административные canonical-команды, удаление логов и отзыв собственных сессий. Остальные административные API и Rules требуют единого охвата до согласования обязательной политики в облаке. Значение claim нужно подтвердить реальным staging challenge. Поддержка TOTP в Identity Platform доступна на уровне проекта. Интерфейс показывает enrollment только администраторам, но владельцы других Firebase-аккаунтов технически могут сами выбрать фактор через API провайдера, и уже зарегистрированные факторы сохраняются при смене роли. [Firebase ID token claims](https://firebase.google.com/docs/reference/admin/node/firebase-admin.auth.decodedidtoken)

## STEP-UP AUTHORIZATION

Владелец подтвердил окно **10 минут** и набор критических операций. Окно позволяет подтвердить личность один раз для короткой административной серии и ограничивает полезность старой сессии. Используется `auth_time`, новый `iat` после refresh окно не обновляет. При устаревшем входе текущий UI отзыва и очистки объясняет, как заново войти, в RU/EN. Встроенная reauthentication с TOTP ещё не реализована.

| Риск | Операции и доверенные входы | Предложение |
| --- | --- | --- |
| Критический | `change_account_role`, `disable_account` | Проверяется до dispatch LIVE canonical command. |
| Критический | `record_manual_wallet_funding`, `pay_service_from_wallet_as_administrator`, `review_kaspi_payment`, `record_financial_correction`, `record_audit_correction`, `record_provider_payment_event`, возвраты при `resolve_booking_cancellation`, `resolve_course_enrollment_cancellation` и `resolve_booking_change_request` | Проверяются LIVE административные денежные переходы. Для решений по отмене и изменению проверка требуется при положительном `refundAmount`. |
| Критический | `save_kaspi_configuration`, `set_kaspi_payment_enabled`, загрузка артефакта `kaspi-qr/{uploaderId}/{assetId}` | Применение реквизитов защищено в callable. Общий MFA/revocation охват Storage отложен. |
| Высокий | `clearErrorLogs`, `deleteErrorLog` и прямой delete в `error_logs` | Проверяются каждый запрос и каждая страница bulk cleanup. Прямой delete закрыт, удаление через действующие callable сохранено. Аудит вне коллекции. |
| Высокий | Другие массовые удаления, платежные настройки, `update_lesson_pricing_settings`, прямые записи `settings/{settingId}` и `resort_data/{resortId}` | Изменения финансовой конфигурации и массовые операции инвентаризировать до включения. Для обычных операционных настроек и чтений свежесть входа не нужна. |

Проверка свежести идёт после определения текущей capability и до dispatch, включая повтор canonical command. Системные источники работают со своим доверенным контекстом. Денежная транзакция и расчёты остаются у доменных обработчиков. Для будущей встроенной reauth сохранять исходные idempotency key, correlation ID, revision и payload и продолжать только после успешного подтверждения.

## SESSION REVOCATION

`revokeOwnAdministratorSessions` проверяет соответствие подтверждённого UID Firebase UID, активный LIVE Account с ролью admin, `auth_time` и текущее состояние Firebase Auth. Цель операции всегда берётся из доверенной идентичности. Admin SDK отзывает все refresh tokens владельца. При подтверждении вызывающий клиент запускает существующий sign-out, сбрасывающий локальное состояние. Автоматических повторов нет. Если результат неопределён, новую попытку выполняют осознанно после проверки сессии, поскольку она может затронуть входы, созданные после предыдущего запроса.

LIVE `executeCanonicalCommand` для административной capability проверяет Firebase Auth user record и сравнивает подписанный `auth_time` с `tokensValidAfterTime` до dispatch. Проверяются также disabled и отсутствующий Firebase principal. Политика сравнения совпадает с Admin SDK и использует секунды. Для входа и отзыва в одну секунду требуется отдельная проверка на staging. Действующий запрос может завершиться параллельно с отзывом. Приостановка аккаунта даёт отдельное ограничение по текущему Account.

Прямые административные операции Firestore и Storage, часть административных чтений и отдельные вызываемые Functions ещё могут принимать ранее выданный ID token до истечения срока, обычно до часа. На другом устройстве полный сброс приложения происходит по событию Firebase sign-out, мгновенное завершение подписок не гарантировано. Следующий шаг — согласовать один серверный cutoff для проверок Rules и общего слоя API, включая HTTP и долгоживущие потоки. При внедрении обрабатывать типизированный отказ только для того principal, чей запрос был отправлен. Проверить, что активность и роль продолжают применяться при смене полномочий. [Firebase revocation semantics](https://firebase.google.com/docs/reference/admin/node/firebase-admin.auth.baseauth)

## ADMIN AUDIT

| Операции | Покрытие и возможность расследования |
| --- | --- |
| Смена роли и lifecycle | Canonical identity ActivityLog фиксирует actor, affected Account, совершённое изменение, correlation ID и версию. Transaction audit связывает запись с успешной командой. |
| Wallet и возвраты | Finance/cancellation ActivityLog связывает актор и затронутые Wallet, Payment или Booking/Enrollment с correlation ID и MonetaryEvent IDs. |
| Kaspi | Review сохраняет действие в истории запроса с доменным событием. Сохранение реквизитов записывает актор, время, ревизию и факт замены. Документ реквизитов и запись действия помогают найти целевой ресурс. |
| Отзыв сессий | Структурированные Cloud Functions logs содержат Server timestamp, SHA-256 UID, одинаковый ID корреляции для запроса и исхода `revoked` или `unconfirmed`. Вид действия указывает, что актор и ресурс — один Account. Сбой между внешним Auth API и финальным логом может оставить только запись запроса. |
| Критические удаления | `clearErrorLogs` и `deleteErrorLog` пишут в Cloud Logging хеш UID, время, результат коммита, число удалений и ID корреляции. Число отражает фактический коммит страницы. Записи страниц одной очистки используют общий ID. Прямой delete закрыт. Сбой между коммитом и записью в Cloud Logging может оставить пробел. |
| MFA enrollment/removal | Локального события нет. Для облачной проверки изучить Identity Platform Data Access и семантику MFA endpoints. Поддержку событий конкретного метода, доступ, стоимость и хранение нужно подтвердить перед использованием как доказательства. |

[Identity administration](../../functions/src/canonical/identity/identityAdministrationCommands.ts) · [Finance audit](../../functions/src/canonical/finance/financeAudit.ts) · [Kaspi configuration](../../functions/src/canonical/finance/kaspiMerchantSettingsCommands.ts) · [Identity Platform Audit Logs](https://docs.cloud.google.com/identity-platform/docs/audit-logging)

## RECOVERY

1. До обязательной MFA подтвердить двух действующих администраторов с независимо проверенными факторами и отдельно проверить доступ уполномоченного оператора к Firebase/Google Cloud через действующий IAM. На staging пройти восстановление одной пилотной учётной записи, пока второй администратор сохраняет доступ.
2. Первичная регистрация — подтверждённый email и свежий вход. Добавить ключ непосредственно в аутентификатор, подтвердить код и проверить вход с TOTP. Для замены устройства сначала добавить новый фактор и проверить вход с ним, затем убрать старый по операторской процедуре. После удаления фактора может потребоваться новый вход.
3. При потере устройства оператор проверяет личность вне скомпрометированного канала, открывает инцидент и проверяет конкретный Firebase UID и фактор. После согласования удаляет потерянный фактор через поддерживаемый Admin SDK, отзывает сессии, завершает переоформление основного входа при компрометации и сопровождает регистрацию нового фактора. Записать актора, UID, время, причину, результат и номер инцидента, без секретов. Для повторной регистрации нужна отдельная узкая возможность bootstrap с ограниченным сроком и подтверждённой личностью до включения обязательного MFA. До проверки этого потока обязательную MFA включать нельзя.
4. При компрометации активной сессии администратор может отозвать свои сессии только из свежего сеанса. При утрате входа оператор использует согласованную процедуру инцидента. При необходимости временно отключить фактический Account по текущему каноническому процессу. Дождаться истечения старых токенов либо получить подтверждение отказа на всех административных путях перед восстановлением полномочий.
5. При ошибке конфигурации дежурный оператор восстанавливает последнюю проверенную политику enforcement. Выполнить smoke с обоими администраторами и зарегистрировать причину отката. Постоянное исключение для конкретного UID не предусматривается. [Manage MFA users](https://firebase.google.com/docs/auth/admin/manage-mfa-users)

## FILES CHANGED

- `functions/src/security/administratorSession.ts`, `functions/src/index.ts` — проверка сессии, отзыв и аудит.
- `functions/src/canonical/commands/executeCanonicalCommandCallable.ts`, `functions/src/canonical/commands/securityCommandLogging.ts` — проверка актуальности и свежести на LIVE административном входе и журналирование отказов.
- `functions/src/security/manageErrorLogs.ts`, `firestore.rules` — проверка и аудит удаления через callable, запрет прямого удаления.
- `src/features/admin/adminService.ts`, `src/features/admin/components/AdminPanel.tsx`, `src/features/admin/components/settings/ErrorLogsPanel.tsx`, `src/lib/i18n/translations.ts` — подтверждение, сообщения и инициирование выхода.
- `src/features/auth/authService.ts`, `src/features/auth/index.ts`, `src/features/auth/components/Auth.tsx`, `src/features/admin/components/settings/AdminTotpEnrollment.tsx`, `tests/unit/Auth.test.tsx` — пилотный enrollment и challenge, тесты с моками SDK.
- `functions/src/security/administratorSession.test.ts`, `functions/src/canonical/commands/executeCanonicalCommandCallable.test.ts` — тесты серверной политики и маршрутизации.
- `functions/src/canonical/availability/adminPlannerMutations.emulator.test.ts`, `functions/src/canonical/identity/identityAdministrationCommands.emulator.test.ts` — синтетическая Auth-проверка в существующих интеграционных сценариях Firestore.
- `functions/src/security/manageErrorLogs.emulator.test.ts`, `tests/firestore.rules.test.ts` — сценарии callable и прямой записи. `functions/src/deploymentRuntimeOptions.test.ts` — инвентарь callable в манифесте Functions. `scripts/testManifest.inventory.json` — реестр тестов.
- Этот отчёт и `docs/operations/error-log-retention.md` — условия административной очистки и порядок выпуска.

## TESTS

| Проверка | Результат |
| --- | --- |
| Целевые Functions unit и deployment manifest | PASS. 88 тестов. Моки проверяют текущий Account, отзыв, `auth_time`, прямой canonical dispatch и требование подписанного TOTP claim. |
| Auth UI и локализация | PASS. `Auth.test.tsx` — 15 тестов. Enrollment, отклонение неверного кода и успешный challenge моделируют Firebase SDK. Отдельный целевой прогон Auth, логов и переводов — 23 теста. |
| TypeScript, Functions build, production build | PASS. |
| ESLint | PASS. 0 ошибок. Вывод содержит предупреждения Prettier о CRLF в рабочем дереве Windows. |
| Test inventory, `git diff --check`, Graphify | PASS. Инвентарь обновлён и валидирован. Граф обновлён. |
| Целевые Firestore integration | PASS. 52 теста в четырёх наборах с увеличенными локальными тайм-аутами. Проверены identity, planner, финансовая идемпотентность и удаление логов. В Firestore fixtures подставлена проверка сессии. Вызовы Firebase Auth для отзыва проверены с моками. |
| Firestore Rules для `error_logs` | PASS. Целевой тест подтвердил административное чтение и запрет прямого удаления. Vitest завершился с кодом 0. Внешний Firebase CLI затем завершился с кодом 2 из-за сбоя проверки обновлений при остановке. |
| `test:quick` | FAIL в песочнице. Прошли 642 теста приложения, 454 shared-domain, 1768 Functions и 35 проверок браузерных fixtures. Две Git provenance проверки завершились ошибкой локального `git clone --shared`; отдельный запуск `syncSharedDomain.test.mjs` с разрешённым доступом прошёл 3 из 3. |
| Browser E2E smoke | FAIL при инициализации. Functions discovery превысил 10 секунд, Playwright global setup не дождался `optimizeImage`. После освобождения портов и увеличения тайм-аута Functions Emulator загрузился, но повтор входа остановлен после зависания подготовки Playwright без выполнения браузерных assertions. |
| Облачная TOTP MFA | NOT RUN. Проверка требует одобренного облачного пилота. |

## PERFORMANCE

- Каждый LIVE административный canonical command выполняет один дополнительный вызов Firebase Auth `getUser`. Дополнительных Firestore reads/writes для этого пути нет. Вызов находится перед доменной транзакцией. Задержка зависит от Auth backend и требует измерения на staging.
- Единичный отзыв выполняет один вызов Functions через существующий admission, до двух точечных чтений Firestore по ID без запросов по коллекции, один Auth read, один Auth update и две структурированные записи журнала при нормальном завершении. Дополнительного сканирования, polling или scheduler нет.
- Удаление логов добавляет один Auth read на допустимый вызов и одну запись в Cloud Logging после коммита. Первичная выборка ограничена одним документом. Полная очистка по-прежнему обходит коллекцию по курсору, максимум 200 документов на страницу. При обычном входе и запросах ученика или инструктора новый Auth lookup отсутствует. MFA challenge требует дополнительного обмена с Firebase Auth при входе или повторном подтверждении.

## COST IMPACT

Проверено **26 ноября 2026**, валюта тарифа USD. Firebase Auth email/password и Google относятся к Identity Platform Tier 1. На Blaze первые 50 000 MAU бесплатны, следующие до 100 000 тарифицируются по $0.0055 за MAU, далее тариф снижается по опубликованным ступеням. Например, при 60 000 Tier 1 MAU грубая оценка $55 в месяц за MAU при отсутствии других SKU. Считаются все активные пользователи проекта, включая обычных учеников и инструкторов. У Spark действует отдельная квота Tier 1 в 3 000 DAU. TOTP генерирует код локально, SMS отсутствуют. В опубликованной таблице отдельная тарификация за TOTP challenge не указана, а цена за сообщение относится к отправляемым сообщениям. До согласования сверить MAU, DAU, план, SKU, и резерв квот в конкретных проектах. Базовая стоимость нового callable, Auth backend и Cloud Logging зависит от реальной активности. Фактическое потребление и latency ещё не измерены. [Firebase pricing](https://firebase.google.com/pricing) · [Firebase Auth limits](https://firebase.google.com/docs/auth/limits) · [Identity Platform pricing](https://cloud.google.com/identity-platform/pricing)

## SECURITY REVIEW

Независимое ревью подтвердило ограничение охвата отзыва и проверило привязку подтверждения к UID и совместимость существующих Firestore fixtures после исправления. Точечная проверка step-up выявила пропущенную `record_financial_correction`. Команда добавлена, регрессия покрыта тестом. Для интерфейса исправлены одинаковые подписи факторов и сброс истёкшей enrollment-сессии. Остаются два блокера READY. Токены без MFA ещё принимают часть административных Rules и API. Другие вкладки могут сохранять доступ после отзыва до перепроверки или истечения токена.

## MANUAL SETUP

На согласование: сначала staging upgrade Authentication to Identity Platform после проверки тарифа и DAU/MAU, затем включение TOTP provider через документированную настройку проекта Admin SDK или config API и сборка пилотного Hosting с `VITE_ADMIN_TOTP_ENROLLMENT=true`. В Firebase Console предварительно сверить провайдеры, authorized domains, verified email пилотных администраторов и статус биллинга. В Firebase/GCP проверить действующие runtime permissions `firebaseauth.users.get` и `firebaseauth.users.update` и доступ оператора восстановления. Изменения IAM требуют отдельного решения. [Firebase Authentication upgrade](https://firebase.google.com/docs/auth) · [TOTP project configuration](https://firebase.google.com/docs/auth/web/totp-mfa)

## DEPLOY IMPACT

| Поверхность | Текущий diff |
| --- | --- |
| Functions | `executeCanonicalCommand`, `revokeOwnAdministratorSessions`, `clearErrorLogs`, `deleteErrorLog`. Используется текущий callable admission и та же политика App Check. |
| Hosting | YES. Обновление административного UI. |
| Firestore Rules / Storage Rules / Indexes | YES для Firestore Rules, NO для Storage Rules и индексов. Полный revocation/MFA охват потребует изменения обеих Rules. |
| Config / IAM / Secrets | `VITE_ADMIN_TOTP_ENROLLMENT` и `CARVE_ADMIN_TOTP_REQUIRED` выключены по умолчанию. Новых секретов и IAM изменений нет. Есть зависимость от существующего `GUEST_ACTION_TOKEN_SECRET` в callable admission. Требуемые Auth permissions runtime подлежат preflight. Identity Platform и TOTP — отдельная будущая настройка. |
| Migration / Schedulers / Triggers | NO. |

## ROLLOUT

После закрытия блокирующего охвата и отдельного разрешения сначала проверить IAM и рабочий вход двух администраторов в staging. Обновить Functions, проверить существующие callable удаления, затем выпустить Firestore Rules и Hosting с выключенными MFA-флагами. После отдельного согласования включить поддержку TOTP в Identity Platform для staging и дать пилотным администраторам зарегистрировать факторы. Проверить реальные password/Google challenge, удаление и замену, отказ старому токену, штатный вход обычных пользователей и восстановление. Перед обязательной MFA сопоставить Firestore/Storage Rules, канонические команды, прочие callable и HTTP с одной серверной политикой. Отдельное согласование нужно и для staging enforcement, и для production.

## ROLLBACK

Откатить UI и серверные проверки к последнему согласованному совместимому состоянию вместе с Rules, если они были изменены более поздним выпуском. Отозванные refresh tokens не восстанавливать, пользователи входят заново. Откат app enforcement следует отделить от удаления зарегистрированных факторов и перехода Identity Platform. Если Identity Platform уже обновлён, не планировать откат тарифа или отключение TOTP как автоматическую часть выпуска. Учётные записи с факторами должны сохранять рабочий challenge и поддерживаемый путь восстановления.

## NOT VERIFIED

**AUTHENTICATED WORKFLOW: NOT VERIFIED.** Облачные IAM, MAU/DAU, фактический состав администраторов и конфигурация Firebase Auth. Настоящая TOTP MFA, отказ при неверном TOTP, второй фактор при reauth, доступность Account recovery и прекращение всех активных административных подписок. Сквозной ретест финансового повтора после смены сессии не выполнен.

## NEXT STEPS

Согласовать проект, тариф и лимиты для пилота Identity Platform. Завершить MFA и reauth в клиенте и единую серверную проверку на административных границах. Инвентаризировать прямые записи Rules, закрыть пробелы отзыва и аудита, затем репетировать восстановление на двух пилотных администраторах.
