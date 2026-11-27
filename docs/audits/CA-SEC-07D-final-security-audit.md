# CA-SEC-07D — Final Security Audit & Launch Readiness

Аудит 27 ноября 2026 года, Asia/Qyzylorda (UTC+5). Облачные отметки времени — UTC. Режим: FINAL AUDIT / READ-ONLY / INDEPENDENT VERIFICATION. Отдельный план выпуска: [CA-SEC-07D-production-release-plan.md](CA-SEC-07D-production-release-plan.md).

## 1. VERDICT

| Статус | Значение | Основание |
| --- | --- | --- |
| AUDIT STATUS | **COMPLETE** (в пределах read-only полномочий) | Источник, локальная регрессия и облачная конфигурация проверены. Авторизованные облачные сценарии, реальный OAuth/TOTP и восстановление данных требуют отдельного разрешения и перечислены в §27 |
| SOURCE SECURITY READINESS | **CONDITIONAL READY** | P0 нет. Один новый P1 в исходниках (07D-03, перехват гостевого Participant через гостевую запись на курс; подтверждён существующим emulator-тестом) требует решения владельца и исправления |
| STAGING READINESS | **PARTIALLY VERIFIED** | Staging совпадает с `main` по Hosting, Rules и всем 67 Functions. Авторизованный smoke, Google step-up и отзыв сессий на staging не выполнялись |
| PRODUCTION RELEASE READINESS | **NOT READY** | Production отстаёт на 22 коммита и содержит уязвимости, уже исправленные в исходниках. Выпуск возможен после закрытия 07D-03 (или явного принятия риска), backup-предусловий и staging smoke по [release plan](CA-SEC-07D-production-release-plan.md) |
| PUBLIC LAUNCH READINESS | **NOT READY** | Открыты P1: 07D-01 (расхождение production), 07D-02 (нет проверенного восстановления Firestore), 07D-03 (новый перехват Participant). Не закрыт бизнес-гейт Starter Credit по тексту интерфейса |

**P0: 0 · P1: 3 · P2: 12 · P3: 26.**

## 2. EXECUTIVE SUMMARY

- **Production работает на `14695f71` от 17 ноября.** Это подтверждено provenance labels всех 55 Functions, хешами активных Firestore и Storage Rules и `build-info.json` обоих сайтов. В production отсутствуют все исправления CA-SEC-03…07B. Среди них ранее подтверждённые P1: CA-SEC-02 F1–F3 (гостевая привязка без доказательства владения, клиентский выбор роли инструктора, инструкторское чтение без допуска), CA-SEC-06A F1–F3 (SVG/HTML в чате и аватарах) и CA-SEC-05B P1 (TEST Account удаляет LIVE error logs).
- **Репозиторий GitHub публичный.** Отчёты с описанием этих уязвимостей и сами исправления лежат в публичном `main`. Риск для текущего production выше, чем на момент CA-SEC-07C.
- **Исходники `main`.** Централизованная deny-by-default политика (103 CommandKind, 103 политики, 101 обработчик), финансовые инварианты (20 из 20 сценариев защищены), гостевые HMAC credentials, CA-SEC-07B step-up и cutoff, image proxy и media pipeline выдержали независимую проверку.
- **Новые подтверждённые дефекты в исходниках:**
  - **07D-03, P1.** Гостевая запись на курс принимает чужой `unmanaged_guest` Participant без доказательства и выдаёт link credential. Через `promote_guest` его затем можно присвоить своему Account.
  - **07D-04, P2.** Клиент задаёт `senderRole` и отображение сообщений чата, что позволяет фишинг от имени администратора.
  - **07D-05, P2.** Канонические курсы теряют защиту Rules от прямой административной записи после любой правки.
- **DR.** PITR, защита от удаления базы и managed backups выключены в обоих проектах. Последний экспорт production — 28 октября (около 250 КБ), восстановление никогда не проверялось. Размер production Firestore около 2 МБ, поэтому стоимость полноценной защиты практически нулевая.
- **Starter Credit.** Новые начисления в production уже выключены серверной настройкой: `settings/starter_credit.amountKzt = 0` с 19 сентября. Интерфейс RU/EN по-прежнему обещает стартовый бонус. Это требует изменения текста и согласования.
- **Регрессия.** Полный локальный набор `test:full`: результат в §20.

## 3. AUDIT SCOPE & LIMITATIONS

| Параметр | Значение |
| --- | --- |
| HEAD / ветка | `20413eb008378ac35a285dfe80cfab3f9d83c83c`, `feat/audit-ca-sec-07d-final-security-review`. В задаче указано имя `audit/ca-sec-07d-final-security-review`, фактическая локальная ветка имеет префикс `feat/` |
| Working tree | Чистое до аудита. В результате аудита добавлены только два отчёта |
| GitHub `main` | `20413eb0…`, по `gh api`. `git fetch` из песочницы завершился ошибкой TLS-цепочки |
| CA-SEC-07C | Отчёт существует только в открытом PR #232 (ветка `audit/ca-sec-07c-infrastructure-lifecycle`, `66a15347`) и не влит в `main`. Использован как база через `git show` |
| CA-SEC-02 | Отсутствует в `main`, найден в `stash@{0}` (untracked). Прочитан только для сверки F1–F3 |
| Инструменты | Read/Grep по исходникам. Пять независимых read-only review-агентов (финансы; авторизация; auth и гостевые бронирования; медиа, proxy и приватность; клиент и App Check). Каждый P1/P2 агента перепроверен вручную по исходникам. gcloud 583 и Firebase REST только GET (TLS через выгрузку доверенного хранилища Windows во временный PEM), `npm ls` локально, `npm run test:full` в изолированных `demo-*` эмуляторах |
| Graphify | Не использовался. Выводы сделаны непосредственно по исходникам, графовый контекст не требовался. `graphify update` не нужен: изменены только документы |
| Облако | Только чтение: Functions v2 list, Hosting releases, Rules releases и rulesets, Firestore database/backup metadata, bucket listing метаданных экспорта, Identity Toolkit config, App Check services, один masked GET `settings/starter_credit` |
| Не выполнялось | Deploy, изменения данных, активные тесты в облаке, backup/export/restore, `npm audit` (передача метаданных зависимостей во внешний registry требует отдельного разрешения), чтение значений секретов |
| Ограничения доступа | Billing Budget API: `SERVICE_DISABLED` на quota project, ранее HTTP 403. App Check API в production: HTTP 403 (в CA-SEC-07C читался как `UNENFORCED`). Авторизованные сессии staging/production недоступны |

Метки результата: **SOURCE VERIFIED**, **LOCAL VERIFIED**, **STAGING VERIFIED**, **PRODUCTION VERIFIED**, **NOT VERIFIED**, **DEFERRED**. Исправление в исходниках не считается развёрнутым.

## 4. THREAT MODEL

Граница доверия одна: браузер и любые данные payload недоверенные. Доверенные — Firebase Auth ID token (подпись, `uid`, `auth_time`, `email_verified`), серверный Account `users/{uid}` (роль, lifecycle, cutoff), канонические транзакции Functions и Security Rules. Admin SDK (Functions, скрипты, Console) обходит Rules.

| Субъект | Точки входа | Доступ и пути повышения | Финансы / ПДн / расходы | Состояние защиты (`main`) |
| --- | --- | --- | --- | --- |
| Неавторизованный посетитель | Hosting, `/api/img`, публичные read models, `executeGuestCanonicalCommand` | Публичный каталог. Повышение только через гостевые credentials | Нет прямого финансового пути. Расходы через proxy и гостевые резервы | Proxy allowlist + глобальный miss quota; guest admission 30/мин и 3/2 активных резерва на IP-HMAC. App Check не enforced |
| Гость с бронированием | Гостевые команды с HMAC credential, guest status read, link | Свой booking/enrollment по credential. **07D-03**: гостевая запись на курс может переиспользовать чужой гостевой Participant | Kaspi QR гостевого платежа; стоимость задаёт сервер | HMAC-SHA256, constant-time, привязка purpose/subject/срок. Lesson-путь защищён (CA-SEC-05 F4), course-путь нет |
| Ученик | Callables, Firestore/Storage SDK, HTTP chat/media/SSE | Свои Participants через `participant_management`. Self-update `users` только по allowlist | Списание Wallet по серверной цене | Deny-by-default, проверка Participant, транзакции |
| Владелец семейного аккаунта | То же | Управляемые Participants | Оплата за управляемых | Active management record на каждую команду и read model |
| Participant (зависимый) | Через владельца | Нет собственного входа | — | Независимый avatar и identity |
| Инструктор | Instructor read models, attendance, progress, chat | Доступ по booking/relationship/roster. Политика доступа к будущим и отменённым урокам — §11 | Revenue projection только чтение | CA-SEC-02 F2/F3 исправлены в `main`, в production нет |
| Администратор | Admin callables, прямые записи Rules в отдельные коллекции | Всё в LIVE в пределах команд. Прямые Rules-пути обходят step-up (07D-05, P3-02) | Ручное пополнение, Kaspi review, корректировки, возвраты | 10-минутный step-up, cutoff, Auth revocation на критических командах |
| Отключённый Account | Любые | Должен быть отклонён везде | — | Rules `canonicalActiveAccount`, callables `requireActiveAccount`, HTTP lifecycle. Живые listeners до переоценки — P3-14 |
| Отозванные полномочия (роль снята) | Старые токены | Роль читается из Account на каждом запросе | — | Транзакционная перепроверка роли |
| Ранее выданный ID token | Все API до часа | После `revokeOwnAdministratorSessions` admin-пути закрыты cutoff. Owner-пути и TEST-пути — нет (P3-14, P3-22) | — | Cutoff в Rules/Storage/callables/HTTP/SSE для LIVE admin |
| Украденная сессия | Как у владельца | Критические admin-мутации требуют свежего `auth_time` | Step-up ограничивает admin-деньги | TOTP подготовлена, не включена |
| Бот | Регистрация, guest, proxy, chat | Массовые регистрации ограничены `email_verified` при создании Account | Starter Credit = 0 в production; гостевые резервы ограничены | Admission limits; App Check только monitoring |
| Скомпрометированный администратор | Все admin-пути | Полный операционный контроль LIVE | Перевод средств на любой Wallet (это уже возможность `record_manual_wallet_funding`) | Step-up, audit ActivityLog, отзыв сессий. MFA не обязательна |

OWASP API Top 10. API1 BOLA — 07D-03. API3 Property-level authorization — 07D-04 и P3-19. API5 Function-level authorization — CA-SEC-04 подтверждён. API4 Unrestricted resource consumption — P3-07/10/11. API8 Misconfiguration — 07D-08 (CSP). API9 Inventory — 07D-01.

## 5. ENVIRONMENT STATUS

| Ресурс | Staging (`ski-school-staging`) | Production (`ski-school-8f3ca`) | Метка |
| --- | --- | --- | --- |
| Hosting | `a8434df6761d8067`, 2026-11-26T19:42Z, `build-info` = `20413eb0`, dirty=false | `ski-school-8f3ca`: `11beb5df338530da`; `carveacademy`: `c192bf56498d0e4a`; оба 2026-11-17, `build-info` = `14695f71`, dirty=false | PRODUCTION VERIFIED |
| Functions | 67, все `commit_sha=20413eb0` | 55, все `commit_sha=14695f71` | PRODUCTION VERIFIED |
| Firestore Rules | sha256 `d2c76569…` = `main` | sha256 `67b3f515…` = `14695f71` (≠ `main`). Остаётся исторический release `cloud.firestore/null` от 2026-07-26 | PRODUCTION VERIFIED |
| Storage Rules | sha256 `a18a2b71…` = `main` | sha256 `b9c73ee6…` = `14695f71` (≠ `main`) | PRODUCTION VERIFIED |
| Indexes | 69 READY (по 07C), различие с manifest — 3 TEST-only, DEFERRED | То же | 07C, не перепроверялось |
| Firestore DR | PITR off, delete protection off, schedules/backups пусты | То же; bucket `carveacademy-firestore-backups-…` с экспортами 2026-10-25 и 2026-10-28 (последний 254 736 B) | PRODUCTION VERIFIED |
| Auth | MFA DISABLED; домены staging + localhost | MFA DISABLED; дополнительно `skiacademy-690504140775.asia-southeast1.run.app`, `carveacademy.ai.studio` (07C-06) | PRODUCTION VERIFIED |
| App Check | Firestore/Storage/Auth `UNENFORCED` | API 403 сегодня. Production bundle (`14695f71`) предшествует CA-SEC-07A и App Check не инициализирует | PARTIAL |
| Starter Credit | Документ отсутствует, значит default **250 KZT** | `amountKzt = 0`, обновлено 2026-09-19 | PRODUCTION VERIFIED |
| Локально | `demo-*` emulators, loopback | — | LOCAL VERIFIED |

Разница `14695f71..main`: 22 коммита, 132 файла серверного кода (+7152/−1250), Firestore Rules (+309 строк), Storage Rules (+149), `firestore.indexes.json` (+3 TEST-only, DEFERRED). `firebase.json` и `functions/package-lock.json` не менялись.

## 6. PREVIOUS SECURITY FINDINGS VERIFICATION

| Источник | Замечание | SOURCE (`main`) | PRODUCTION |
| --- | --- | --- | --- |
| CA-SEC-02 F1 (P1) | Привязка гостевого урока без доказательства | Закрыто для lesson-пути (link proof + attribution). Обходной course-путь — новый 07D-03 | **ОТКРЫТО** |
| CA-SEC-02 F2 (P1) | Клиентский выбор capability инструктора | Закрыто (`resolveCallableInstructorId`, серверный InstructorId) | **ОТКРЫТО** |
| CA-SEC-02 F3 (P1) | Инструкторская проекция без допуска | Закрыто (relationship/topology evaluator) | **ОТКРЫТО** |
| CA-SEC-04 F8 | Централизованная политика | Подтверждено: 103/103/101, unknown → deny, `server_only` недостижим из callable | **ОТКРЫТО** |
| CA-SEC-05 F4/F5/F11 | Guest Participant reuse, транзакционная перепроверка роли, replay credentials | Подтверждено | **ОТКРЫТО** |
| CA-SEC-05 F7/F10 | TEST/LIVE, legacy-профили | Подтверждено с остатком: legacy Course (05B) расширился до canonical — 07D-05 | **ОТКРЫТО** |
| CA-SEC-05B P1 | TEST Account → LIVE error logs | Закрыто | **ОТКРЫТО** |
| CA-SEC-06A F1–F3 (P1) | SVG/HTML в чате, protected images, `avatars/{uid}` | Закрыто: magic bytes, sharp format, `avatars` write false | **ОТКРЫТО** |
| CA-SEC-06A F4–F8 | Admin direct uploads, header-only decode, nosniff, URL, `attachmentUrl` | F6–F8 закрыты; F4/F5 DEFERRED (P3-09/P3-26) | Частично |
| CA-SEC-06B | Квоты по trusted uid | Подтверждено, без двойного учёта | **ОТКРЫТО** |
| CA-SEC-06C F1–F6 | Варианты, глобальный quota, дубли, SSRF | Подтверждено. Остаток — P3-10 | **ОТКРЫТО** (concurrency 80) |
| CA-SEC-07A | App Check monitoring | Monitoring-only во всех вызовах | **НЕ РАЗВЁРНУТО**, ключа production нет (07D-07) |
| CA-SEC-07B P1 ×3 | MFA, step-up, отзыв ID token | Step-up и cutoff подтверждены. MFA подготовлена и выключена (принятое решение) | **ОТКРЫТО** |
| CA-SEC-07C 01–09 | Инфраструктура | Статусы в §17/§21 | — |

Итого в исходниках закрыто 23 ранее подтверждённых замечания (CA-SEC-02 ×3, 04 ×1, 05 ×3, 05B ×1, 06A ×6, 06B ×1, 06C ×6, 07B ×2). **В production не закрыто ни одно.**

## 7. AUTHENTICATION & ACCOUNT LIFECYCLE

| Проверка | Результат | Доказательство |
| --- | --- | --- |
| Регистрация и bootstrap | Клиент создаёт только свой `users/{uid}`. Обязательны `role=='user'`, LIVE, `email_verified` и совпадение email токена. Запрещены lifecycle, cutoff, TOTP, `instructorId`, `systemRole`, денежные поля. Остаток: denylist вместо allowlist (P3-19) | `firestore.rules:193-253` · SOURCE VERIFIED |
| Self-escalation | Update по `hasOnly` allowlist | `firestore.rules:574-592` · SOURCE VERIFIED |
| Custom claims | Не используются. Роль берётся из Account | grep `setCustomUserClaims` пуст · SOURCE VERIFIED |
| Email verification | Требуется для создания Account и `claimGuestProfile` | `claimGuestProfile.ts:23-76` |
| Password reset | Firebase `sendPasswordResetEmail`. UI различает «user not found» (P3-21, зависит от email enumeration protection) | `Auth.tsx:384-387` |
| Guest linking | Verified email + совпадение + `auth_time ≥ tokensValidAfterTime` + not disabled; повторное присвоение отклоняется | SOURCE VERIFIED |
| Отключение Account | Rules, Storage, callables, HTTP и SSE отклоняют. Firebase refresh tokens не отзываются (P3-14) | SOURCE VERIFIED |
| Смена роли | Только owner; transactional re-check | `identityAdministration.ts:114-131` |
| Выход и смена Account | Синхронный сброс user stores и каталогов; Firestore memory cache; нет service worker. Гостевые credentials остаются в `localStorage` (P3-17) | `authStore.ts:25-65` · LOCAL VERIFIED (unit `useUsersSync` и связанные) |
| Совместимость с CA-SEC-07B | Обычный вход ученика и инструктора не затронут: проверки cutoff/TOTP только на LIVE admin-ветках | SOURCE VERIFIED, E2E admin+student PASS (§20) |

## 8. AUTHORIZATION & ACCESS CONTROL

- **Inventory.** 103 `CommandKind` (`packages/shared-domain/src/canonical/commands/commandKinds.ts`), 103 политики (`commandPolicies.ts`, `satisfies Record<CommandKind, CommandPolicy>`), 101 обработчик. Без обработчика `complete_booking` и `record_booking_no_show`, обе `unavailable`. Guest transport: 8 видов, 7 с guest policy, всегда LIVE. Exports: 42 callable, 4 HTTP, 7 scheduler, 14 Firestore trigger (67 Functions).
- **Deny-by-default.** Неизвестный kind отклоняется на transport и policy. Policy без обработчика даёт `unavailable`. Admin `server_only` недостижим из callable. SOURCE VERIFIED, тесты `commandPolicies.test.ts` PASS.
- **IDOR/BOLA в read models.** Не обнаружено. Principal всегда `request.auth.uid`. Поля `accountId` принимаются только в admin-ветках. Participant, booking и enrollment проверяются через active management, roster или relationship. Пагинация ограничена (≤200 docs, ≤1000 scanned, Kaspi 21).
- **Mass assignment.** Командный context формируется сервером. `dataScope`, `testSessionId` и `exercisedCapability: administrator` из payload отклоняются.
- **Idempotency replay.** Ключ содержит actor scope (`account:<uid>`), fingerprint покрывает intent. Перед replay выполняются policy и проверки Account. Чужой результат получить нельзя.
- **Rules ↔ Functions.** Деньги, платежи, idempotency и ledger клиенту недоступны. Расхождения: 07D-04 (сообщения чата), 07D-05 (canonical Course), P3-02 (`settings/starter_credit`), P3-05 (canonical Booking защищён неявно).
- **TOCTOU.** Admin-мутации перепроверяют роль, lifecycle и cutoff в транзакции. Для отдельных клиентских путей lifecycle проверяется до транзакции (P3-23, окно миллисекунд).
- **LIVE/TEST.** Не-администратор не создаёт и не читает TEST. LIVE-чтения фильтруются по `documentMatchesReadScope`. TEST admin-пути не применяют cutoff/TOTP (P3-22). TEST Session не развивалась.
- **Triggers.** Привилегированных записей по клиентским полям нет. Client-signal triggers пишут только ревизии.

## 9. FINANCIAL SECURITY

Все 20 сценариев защищены в `main` (SOURCE VERIFIED, финансовые emulator-тесты — §20):

| # | Сценарий | Механизм |
| --- | --- | --- |
| 1–3 | Сумма, цена урока, цена курса | Intent не содержит цены. Урок: каталог инструктора + длительность + `lesson_pricing_settings`. Курс: `courseRecord.price`. Kaspi: пополнение зачисляется только при совпадении суммы банковской квитанции |
| 4–6 | Participant, плательщик, получатель возврата | Active management; `payer == actor` для клиента; получатель возврата берётся из Booking/Payment |
| 7–10 | Двойное подтверждение Kaspi, двойное начисление, списание, возврат | `receipt` no-op, bank reference guard, `expectedRevision`, детерминированные MonetaryEvent ID через `tx.create`, cap `paid − refunded` |
| 11, 14, 15 | Конкурентность, race, атомарность | Одна `runTransaction`, фаза reads→writes принудительна (`firestoreTransactionExecutor.ts:187-196`) |
| 12–13 | Недостаточный и отрицательный баланс | `KztMinorUnitsSchema` ≥ 0, `debitWalletBalance`, `assertWalletCorrectionDoesNotOverdraw` |
| 16–17 | Изменённый payload, потеря ответа | Fingerprint → `idempotency_conflict`; replay сохранённого результата, retryable ошибки не сохраняются |
| 18–20 | Повтор после reauth, смены Account, со старыми полномочиями | Ключ привязан к UID, `expectedAdministratorUid`, перед replay заново проверяются роль, lifecycle, session и step-up |

Остатки (P3, инсайдерский риск администратора): P3-01 (redirect admin refund/compensating event), P3-03 (ручное пополнение без обязательного `expectedRevision`), P3-04 (replay без object-level reauth), P3-06 (step-up не покрывает admin-списания при reschedule и `create_confirmed_booking`, transfer refunds, pricing). Комиссий в коде нет. Instructor revenue — идемпотентная проекция, только чтение. Финансовая архитектура не менялась, новые сущности не предлагаются.

## 10. GUEST BOOKING SECURITY

| Проверка | Результат |
| --- | --- |
| Credentials | HMAC-SHA256 канонического JSON {version, subjectKind, id, guestSubjectId, purpose, expiresAt, nonce}, constant-time compare. Срок отмены берётся с сервера. `guestSubjectId` выводится сервером |
| Просмотр, отмена, Kaspi, профиль | Только с валидным credential соответствующего назначения |
| ID | `booking_<randomUUID>`, не угадываются |
| Replay (CA-SEC-05 F11) | Credentials возвращаются только при 128-bit private key и текущем состоянии ресурса |
| Lesson Participant reuse (CA-SEC-05 F4) | Требует link proof и совпадения атрибуции |
| Rate limits | 30/мин на сеть, лимит endpoint на principal, 3 активных урока / 2 курса на IP-HMAC. Multi-hop XFF fail-closed. IPv6 по полному адресу (P3-20) |
| **Course Participant reuse** | **07D-03 (P1).** `create_course_enrollments` в guest mode принимает любой существующий `unmanaged_guest` Participant из `intent.participantIds`. Без instructor relationship перезаписывает его профиль, всегда выдаёт `link_guest_course_enrollment` credential; `promote_guest` пропускает проверку eligibility при отсутствии `initialManagementEligibleAccountId`. ID lesson-гостя — публичный детерминированный хеш `bookingId` (`src/features/lesson-bookings/deriveBookingIds.ts:20-24`) |

## 11. INSTRUCTOR & PARTICIPANT PRIVACY

| Область | Состояние |
| --- | --- |
| Owner/dependent scoping | Серверное (`participant_management` + topology evaluator) |
| Прогресс и оценки | Чтение инструктором по любому `confirmed` (включая будущие) или `completed` booking без срока давности, включая записи других инструкторов. Запись — только после начала урока. Блок инструктора ограничивает новую активность и не снимает чтение по booking. **Требует подтверждения политики владельцем (P3-12)** |
| Чат бронирования | Нет проверки статуса и блока. Отменённые и завершённые bookings сохраняют чтение и запись для инструктора и владельцев (P3-12) |
| SSE | Перепроверка ACL и токена на каждом изменении сообщения или зависимости, лимит 110 с |
| Прямые Firestore listeners | Возможно сохранение доставки после изменения `get()`-зависимостей до переподписки или обновления токена (P3-14, нужна проверка в эмуляторе и облаке) |
| Аватары Participant | Публичны по URL, секретом служит только participantId; EXIF не удаляется сервером (P3-09) |
| Смена активного Participant | Клиентская валидация homework-источников (`1bcf9718`), серверная авторизация на каждом запросе |
| Смешанные LIVE/TEST | Изоляция подтверждена §8, функциональность TEST Session не развивалась |

## 12. ADMINISTRATOR SECURITY

- **Step-up, 10 минут по `auth_time`.** SOURCE VERIFIED для `change_account_role`, `disable_account`, `record_manual_wallet_funding`, `pay_service_from_wallet_as_administrator`, `review_kaspi_payment`, `record_financial_correction`, `record_audit_correction`, `record_provider_payment_event`, возвратов в `resolve_*` при `refundAmount > 0`, `save_kaspi_configuration`, `set_kaspi_payment_enabled`, `clearErrorLogs`/`deleteErrorLog` и `revokeOwnAdministratorSessions` (`executeCanonicalCommandCallable.ts:110-134`). Обычные admin-операции не требуют повторного входа. Прямая запись Kaspi QR в Storage и `settings/starter_credit` идёт мимо step-up (P3-02, CA-SEC-07B зафиксировал Storage как отложенный).
- **Клиентский step-up.** Один повтор только на `ADMIN_RECENT_AUTH_REQUIRED`, проверка неизменности `currentUser`, `expectedAdministratorUid`, тот же payload и idempotency key, `maxAttempts: 1`. Способы выбираются по `providerData` (пароль, Google или оба), TOTP resolver поддержан. LOCAL VERIFIED (unit + E2E с demo Auth). Реальный Google popup и обновление `auth_time` — **NOT VERIFIED**. Остаток: отрицательный clock skew (P3-18).
- **Отзыв сессий.** Cutoff `adminSessionsRevokedThrough` записывается до `revokeRefreshTokens` и монотонен. Проверяется в Rules, Storage Rules, callables, read models, HTTP и SSE для LIVE admin. Остаток: owner-пути и TEST-пути со старым ID token до часа (P3-14/P3-22). Отзыв через Firebase Console/Admin SDK без cutoff виден только путям с `verifyIdToken(…, true)` или Auth user record; Rules и часть callables принимают старый ID token до истечения (≈1 ч). Митигация при инциденте: отключить Account через `disable_account` и вызвать `revokeOwnAdministratorSessions` из свежей сессии либо записать cutoff тем же серверным путём.
- **Audit.** ActivityLog для роли, lifecycle и денег; Cloud Logging для отзыва и удаления логов с hash UID и correlation ID.
- **MFA.** `adminTotpRequired` отсутствует → выключено; non-boolean → fail closed; клиент не может записать; серверного пути очистки нет. `VITE_ADMIN_TOTP_ENROLLMENT` выключен. Ученики и инструкторы не затронуты. Используется подписанный `firebase.sign_in_second_factor`. Реальная облачная TOTP **NOT VERIFIED** (требует Identity Platform, не включалась). MFA не объявляется блокером запуска; остаётся принятым риском (§26) с рекомендацией пилота после запуска.

## 13. MEDIA & STORAGE SECURITY

PASS в `main`: MIME allowlist до чтения тела; sharp-формат обязан совпасть с заявленным типом, поэтому SVG/HTML отклоняются; размер 5 МБ (изображения) / 50 МБ (видео); 40 MP; квоты по uid из `verifyIdToken`; повтор того же digest не списывает квоту; `Content-Disposition: attachment` + `nosniff`; транзакционная ACL на каждом GET/chunk/finish; `ifGenerationMatch`; `chat/` и `test-*` закрыты для клиента; `safeChatLink` http/https.

Остатки: header-only проверка изображений без полного декодирования и без удаления EXIF (P3-09); `allow read` включает `list` на `avatars/`, `courses/`, `instructors/`, `image-cache/` (P3-08, нужен emulator-тест); admin direct uploads `kaspi-qr/`, `lesson-levels/` проверяют только contentType и создают download tokens (P3-26, **DEFERRED**, XSS на app origin невозможен); `_chat-media-uploads/` без lifecycle (07C-07, DEFERRED). **В production действуют старые Storage Rules с `avatars/{uid}` `image/.*`, включая SVG (07D-01).**

## 14. IMAGE PROXY & ABUSE PROTECTION

PASS в `main`: единственный origin `https://storage.yandexcloud.net/carve/`, без query/credentials, `..` отклоняется после декодирования; до 3 redirect с повторной канонизацией; DNS lookup с блокировкой private/loopback/link-local/metadata, используемый самим сокетом; 8 МБ, 10 с fetch, 8 с sharp; magic bytes до libvips, `limitInputPixels` 40 MP, первый кадр; ширины {480, 960, 1280, 1920}, качество фиксировано; Firestore lease на ключ и глобальный лимит 120 miss/мин; `ifGenerationMatch: 0`; fallback 307 только на канонический источник; ответ `image/webp` + `nosniff`. Protected media (Firebase Storage) через proxy недостижимы.

Остаток P3-10: неканонические `w`/`q`/`u` создают разные CDN-ключи для одного объекта; случайные несуществующие ключи расходуют глобальную miss-квоту и деградируют оптимизацию для всех. Общий расход ограничен `maxInstances 10 × concurrency 4`. **В production concurrency 80 и старый код без CA-SEC-06C (07D-01).**

## 15. APP CHECK

| Проверка | Результат |
| --- | --- |
| Инициализация | Один раз после `initializeApp`, до Firestore/Auth/Functions; reCAPTCHA Enterprise с 5 с timeout; auto-refresh true; пропуск в DEV, emulator и loopback; проверка соответствия mode/project |
| Debug token | При наличии global инициализация пропускается; токены не логируются и не попадают в URL |
| Callables | 42 из 42 `enforceAppCheck: false`. Limited-use tokens не используются |
| HTTP | Заголовок App Check не отправляется и не проверяется |
| Staging | `UNENFORCED`. Verified rates по CA-SEC-07A: Firestore 65%, Storage 32%, Auth 83% — недостаточно для enforcement |
| Production | Bundle без App Check (`14695f71`). Production-сборка с этой машины тоже не включит его: в `.env` нет `VITE_APPCHECK_RECAPTCHA_ENTERPRISE_SITE_KEY`, `.env.production(.local)` отсутствует. App Check API отвечает 403 (**07D-07**) |

Рекомендация по поэтапному включению: (0) завести production reCAPTCHA Enterprise key и регистрацию Web App, собрать ≥2 недели метрик; (1) enforce по одной функции, начиная с низкочастотных admin read models, критерий — verified share около 99% и role E2E; (2) guest и денежные команды, при необходимости limited-use tokens; (3) Firestore; (4) HTTP в режиме log-only, затем enforce (`optimizeImage` остаётся публичным); (5) Storage последним или никогда: прямые `<img>` URL не несут заголовок. App Check не заменяет auth, authorization и rate limits. Включение enforcement не выполнялось.

## 16. CLIENT-SIDE SECURITY

PASS: единственный `dangerouslySetInnerHTML` выводит числовой countdown; markdown/HTML-рендереров нет; ссылки пользователя только http/https и `rel="noopener noreferrer"`; open redirect не найден; `postMessage` listeners нет; image viewer не навигирует к blob; токенов в URL нет; console logging только в DEV; reportClientErrors заменяет message/stack fingerprint и whitelist; секретов в bundle нет (только публичный Firebase config и site key); sourcemaps в `dist/` нет; service worker нет; `X-Frame-Options: DENY`, `nosniff`, Referrer-Policy и Permissions-Policy заданы.

Остатки: **07D-04** (подмена отправителя в чате, отображается в UI), **07D-08** (CSP Report-Only без `report-uri`/`report-to`; enforcement блокируют inline theme script, inline `onload` и отсутствие `api.open-meteo.com` в `connect-src`), P3-15 (COOP нет, HSTS не проверен на доменах), P3-16 (`cors: true` на HTTP без credentials), P3-17 (гостевые credentials в `localStorage`). CSP не менялась.

## 17. INFRASTRUCTURE & DEPENDENCIES

| 07C | Статус сейчас |
| --- | --- |
| 07C-01 P1 | **OPEN** без изменений → 07D-01 (Functions/Rules/Hosting перепроверены сегодня) |
| 07C-02 P1 | **OPEN** → 07D-02 (PITR, delete protection, schedules/backups перепроверены сегодня) |
| 07C-03 P2 IAM Editor | OPEN, не перепроверялось. Сохранить до отдельной работы. Не блокер |
| 07C-04 P2 purge без лимита страниц | OPEN, не блокер при нынешнем объёме |
| 07C-05 P2 `error_logs` без `deleteAt` | OPEN |
| 07C-06 P2 legacy authorized domains | OPEN, подтверждено сегодня (два домена). Рекомендовано проверить до запуска |
| 07C-07 P2 lifecycle buckets | OPEN, DEFERRED по согласованной методике |
| 07C-08 P3 artifacts | OPEN, без действий |
| 07C-09 P2 dependencies | **Переоценено в P3 (P3-25)** — см. ниже |

**Supply chain.** 12 совпадений OSV из 07C: достижимость.

| Пакет | Где | Достижимость | Приоритет |
| --- | --- | --- | --- |
| fast-xml-parser 5.11.2 (LOW) | Functions runtime ← `@google-cloud/storage` 8.4.0 | Используется только `TransferManager` (XML multipart). В `functions/src` TransferManager и XMLParser не используются | P3, обновить вместе с SDK |
| glob 10.5.0, minimatch 9.0.9 (MODERATE) | Functions runtime ← `rimraf` 5.0.10 ← `google-gax` 5.0.8 | Утилита сборки protos; в runtime-обработчиках с пользовательским вводом не вызывается | P3 |
| minimatch / glob (app dev) | ESLint, firebase-tools | Только CI и dev, без недоверенного шаблона | P3 |
| hono 4.13.14 ×5, @hono/node-server 2.1.5 ×2 | dev ← `@modelcontextprotocol/sdk` ← firebase-tools | Локальный MCP-сервер CLI на loopback; в deploy pipeline не участвует | P3 |
| uuid 9.0.1, @opentelemetry/core 1.30.1 | dev ← firebase-tools | Не в production | P3 |

Примечание: `functions/package.json` содержит `"alpine-glide-bookings": "file:.."`, поэтому локальное дерево Functions подтягивает dev-зависимости root. Фактический состав облачного образа (Cloud Build `npm install` из `functions/`) **NOT VERIFIED**. Полный `npm audit` не выполнялся: требуется отдельное разрешение на передачу списка зависимостей в npm registry. `npm audit fix --force` и обновления не выполнялись.

**Secrets.** `GUEST_ACTION_TOKEN_SECRET@1` в обоих проектах. В публичном репозитории отслеживается `functions/.secret.local` с emulator-значением (совпадает с `firebase.json`), из deploy исключён `*.local`. **Совпадение production-секрета с публичным fixture NOT VERIFIED** — обязательная ручная проверка до запуска (§22). При совпадении риск становится P0: подделка гостевых credentials.

**Billing.** Budget API `SERVICE_DISABLED` на quota project; наличие budget alerts **NOT VERIFIED** (07D-11).

## 18. BACKUP & DISASTER RECOVERY

Фактический размер production Firestore около 2 МБ (data + indexes, среднее по 07C). Последний экспорт 254 736 B. Тарифы `eur3` по сверке 07C от 27.11.2026: backup storage $0.03/GiB-month, restore $0.40/GiB, PITR $0.18/GiB-month ([Firestore pricing](https://cloud.google.com/firestore/pricing), [Backups](https://cloud.google.com/firestore/docs/backups), [PITR](https://cloud.google.com/firestore/docs/pitr)).

| Механизм | Доступность сейчас | Стоимость при 2 МБ (при 1 GiB) | Retention | RPO | RTO | Ограничения |
| --- | --- | --- | --- | --- | --- | --- |
| Scheduled backups (daily, 14 д) | Не настроено | < $0.01/мес (≈ $0.42/мес) | 14 дней (daily до 14 недель) | ≤ 24 ч | Минуты–часы: restore в новую БД + проверка + переключение/перенос данных | Не включает Rules, TTL, индексы-определения, Auth, Storage. Restore только в новую БД того же проекта |
| PITR | Выключено (сейчас окно версий 1 ч) | < $0.01/мес (≈ $0.18/мес) | 7 дней, минутная гранулярность | ≈ 1 мин | Clone/чтение на момент времени в новую БД, точечный перенос | Тот же состав, что backup. Лучший инструмент против ошибочного финансового изменения |
| Managed export (`gcloud firestore export`) | Ручной, 2 экспорта (25.10, 28.10) | Storage + чтения документов | Пока лежит в bucket (soft delete 7 д) | Время последнего экспорта (сейчас ≈ 30 дней) | Import в новую БД | Не атомарный снимок при параллельных записях; восстановимость не проверена |
| Октябрьские экспорты | Есть метаданные | — | — | ≈ 30 дней | Неизвестно | Содержимое не проверялось; устарели относительно финансовых данных |
| Delete protection | Выключено | Бесплатно | — | — | — | Защищает только от удаления базы |

**Рекомендация (на согласование, не утверждено):** включить delete protection и PITR, создать daily backup schedule с retention 14 дней. При нынешнем объёме суммарная стоимость меньше цента в месяц. Права: `roles/datastore.owner` (или `datastore.backupSchedulesAdmin` + `datastore.databases.update`); restore требует `datastore.databases.create`/`restore`. Команды — в [release plan, раздел A](CA-SEC-07D-production-release-plan.md).

**Процедура проверки восстановления (на согласование).**

1. Восстановить последний backup (или PITR clone) в новую БД того же проекта `restore-drill-YYYYMMDD`. Triggers в коде не указывают `database` и привязаны к `(default)`; schedulers тоже читают `(default)`. Поэтому восстановленная БД не запускает фоновые процессы. Клиент и Hosting на неё не переключаются.
2. Read-only скриптом Admin SDK с явным `databaseId` проверить:
   - Account ↔ Participant ↔ `participant_management` (активный owner у каждого managed Participant);
   - сумму MonetaryEvent по каждому Wallet против `balance` и `revision`;
   - Payment ↔ Booking/CourseEnrollment (ссылки, `paid − refunded`);
   - уникальность `bank_receipt_guards`;
   - присутствие `command_idempotency`;
   - `availability_*` locks против активных Booking;
   - `domain_outbox` pending.
3. Сравнить количество документов по ключевым коллекциям с `(default)` на момент снимка.
4. Выполнить локальный emulator-повтор одной финансовой команды по экспортированной копии и подтвердить, что повтор не создаёт второе списание.
5. Измерить RTO и удалить drill-БД (отдельное разрешение).
6. Отдельно: Firebase Auth (`firebase auth:export` в защищённое место), Storage (soft delete 7 дней, versioning выключен), Secrets, IAM и Hosting не входят в backup Firestore.

Launch blocker 07D-02 остаётся открытым до успешного drill.

## 19. STARTER CREDIT LAUNCH GATE

| Вопрос | Ответ |
| --- | --- |
| Где начисляется | Только канонической командой `grant_starter_credit` (`functions/src/canonical/finance/starterCreditCommands.ts:53-231`): canonical Wallet + MonetaryEvent `wallet_credit`, однократно через marker `users/{uid}/wallet/starter_credit_grant` |
| Кто инициирует | Клиент при каждом bootstrap после `provision_self_participant`, ключ `grant-starter-credit-v1` (`src/lib/canonical/canonicalAccountProvisioningClient.ts:23-28`). Policy: owner, TEST — no-op |
| Существующий выключатель | `settings/starter_credit.amountKzt` читается в транзакции. При 0 пишется только нулевой marker, Wallet не меняется. **Production = 0 с 2026-09-19 (PRODUCTION VERIFIED)** |
| Ловушка | Отсутствие документа или поля даёт default **250 KZT** (`packages/shared-domain/src/canonical/starterCredit.ts:15-23`). В staging документа нет. Документ в production нельзя удалять; клиентское удаление Rules запрещают, Admin SDK/Console — нет |
| Последствие | Аккаунты, зарегистрированные при 0, получают постоянный нулевой marker и при повторном включении не получат бонус |
| Интерфейс | Обещания бонуса остаются: `signUpSub`, `authRegisteredCredits`, `authGoogleLinkedCredits`, `heroDesc`, `starterCredits*`, admin-тексты (`src/lib/i18n/translations.ts` EN 146/162-163/170/208/244/1802-1808/2082, RU 2887/2904-2906/2914/2951/2987/4552/4833) |
| Изменение кода | Для отключения начислений не нужно. Для снятия обещаний нужно изменение текста (код, согласование) |

Минимальный план: (1) подтвердить сохранение `amountKzt = 0` в production и запрет удаления документа операционным регламентом; (2) согласовать и выпустить замену текстов RU/EN без изменения финансовой логики; (3) решить, нужен ли `amountKzt = 0` в staging для соответствия production. Существующие записи не трогать, бонусы не списывать, abuse protection не реализовывать.

## 20. SECURITY REGRESSION TESTS

<<TEST_RESULTS>>

## 21. FINDINGS P0/P1/P2/P3

### P0

Нет. Условие эскалации: совпадение production `GUEST_ACTION_TOKEN_SECRET` с публичным fixture.

### P1

**07D-01 — Production работает с известными исправленными уязвимостями.** Статус: OPEN, PRODUCTION VERIFIED. Заменяет 07C-01.

- **Факт:** все 55 Functions, Rules и оба сайта на `14695f71`; отсутствуют 12 Functions; `optimizeImage` concurrency 80; репозиторий публичный.
- **Доказательство:** §5, §6.
- **Окружения:** production.
- **Предпосылки эксплуатации:** аккаунт ученика (самостоятельная регистрация) или знание bookingId — для CA-SEC-02 F1; роль инструктора — для F2/F3; любой аккаунт — для SVG в `avatars/{uid}` (XSS на домене firebasestorage, не app origin).
- **Ущерб:** присвоение гостевого бронирования/Participant, чтение данных участников инструктором без допуска, хранение активного контента, удаление LIVE логов TEST-аккаунтом, повышенный расход proxy.
- **Существующие меры:** ограниченный трафик, UUID booking IDs.
- **Минимальное исправление:** выпуск `main` (после 07D-03) по release plan.
- **Тесты:** staging smoke §24, production smoke.
- **Deploy:** Functions (все), Firestore Rules, Storage Rules, Hosting ×2.
- **Согласование:** да. **Launch blocker:** да. Рекомендуется выпустить независимо от даты публичного запуска.

**07D-02 — Нет проверенного восстановления Firestore.** Статус: OPEN, PRODUCTION VERIFIED. Заменяет 07C-02.

- **Факт:** PITR off, delete protection off, нет schedules/backups, последний экспорт 28.10, restore не проверялся.
- **Ущерб:** невосстановимая потеря Wallet/Payment/Booking при ошибке, баге или компрометации админа.
- **Минимальное исправление:** §18 + drill.
- **Тесты:** drill-проверки §18.
- **Deploy:** нет, настройки Firestore.
- **Согласование:** да. **Launch blocker:** да.

**07D-03 — Перехват гостевого Participant через гостевую запись на курс.** Статус: NEW. Reuse без доказательства, перезапись профиля и выдача link credential — **LOCAL VERIFIED** существующим emulator-тестом `guestCourseEnrollmentTransport.emulator.test.ts:342` («synchronizes a reused browser guest profile»): второе гостевое создание только с известным `participantId` успешно, меняет displayName/age/skill и возвращает `guestLinkCredentials`. Шаг `promote_guest` к чужому Account — SOURCE VERIFIED. Тест задуман как «браузер переиспользует свой профиль», но сервер не проверяет, что браузер владеет этим Participant. Присутствие в production вероятно, не проверялось.

- **Доказательство:**
  - `functions/src/canonical/courses/courseEnrollmentCommands.ts:656` — participantIds из intent;
  - `:779-816` — reuse и перезапись профиля без доказательства;
  - `:1358-1375` — выдача link credential;
  - `guestCourseEnrollmentAuthorization.ts:83-102` — только `unmanaged_guest` + active;
  - `guestCourseEnrollmentLinkCommands.ts:366-369` — eligibility проверяется только при наличии `initialManagementEligibleAccountId`;
  - `src/features/lesson-bookings/deriveBookingIds.ts:20-24` — детерминированный participantId lesson-гостя.
- **Предпосылки:** известен bookingId или participantId жертвы (доступен инструктору, администратору, на экране или в URL гостя); существует курс с гостевой записью той же дисциплины; жертва ещё не привязала Participant. При наличии instructor relationship атакующему нужны точные displayName и discipline, которые инструктор знает.
- **Ущерб:** атакующий Account получает управление чужим, возможно детским, Participant: профиль, история, прогресс и будущие чтения. Законная привязка жертвы блокируется owner guard. Перезапись профиля возможна и без привязки. Обходит закрытый CA-SEC-05 F4 через course-путь.
- **Существующие меры:** UUID, guest admission.
- **Минимальное исправление (на согласование):** при reuse существующего гостевого Participant в guest course mode требовать серверно проверяемое доказательство, как в lesson F4; либо при reuse не выдавать link credential и не менять профиль, а в `promote_guest` требовать, чтобы Participant был создан командой этого enrollment.
- **Тесты:** emulator — reuse participantId lesson-гостя в guest course create отклоняется или не получает link credential; unit — `promote_guest` для чужого Participant отклоняется.
- **Deploy:** `executeGuestCanonicalCommand`, `executeCanonicalCommand`.
- **Согласование:** да, продуктовое решение (вопрос ниже). **Launch blocker:** да.

### P2

| ID | Факт и доказательство | Ущерб | Минимальное исправление | Deploy | Блокер |
| --- | --- | --- | --- | --- | --- |
| 07D-04 NEW | Сообщение чата принимает клиентские `senderRole`, `senderName`, `senderAvatar`, `timestamp`, `isHomework` (`firestore.rules:714-717`, `chatMessagesWrite.ts:45-57`); UI показывает `senderRole`, а также роль admin при «admin» в имени (`src/domain/chat/chatSenderRole.ts:68-80`). SOURCE VERIFIED | Фишинг от имени администратора («оплатите на этот Kaspi»), поддельные домашние задания, закрепление сообщения, tracking pixel | `keys().hasOnly` allowlist в Rules и callable; `senderRole`/`senderInstructorId` выводить с сервера; `timestamp` = request.time; `isHomework` только инструктор/админ; убрать эвристику имени | Rules, `mutateChatMessage`, Hosting | Рекомендовано до запуска |
| 07D-05 NEW | Защита canonical Course от прямой admin-записи зависит от marker или `hasOnly`-формы без `dataScope`/`lifecycle`; правки курса удаляют marker (`firestore.rules:131-177, 783-786`; `courseAdministrationCommands.ts:174,194`; `courseDayCommands.ts:302`). Тестовый fixture не содержит этих полей. SOURCE VERIFIED | Админ-клиент меняет цену, roster, удаляет курс мимо команд, audit и step-up | Признавать canonical по `courseId+revision+audit`/`scheduleProjection` и проверять `request.resource.data`; тест с реалистичным fixture | Firestore Rules | Нет |
| 07D-06 | Starter Credit: интерфейс обещает бонус при `amountKzt = 0` (§19) | Вводящее в заблуждение обещание денег | Замена текстов RU/EN | Hosting | Бизнес-гейт |
| 07D-07 | App Check в production не инициализируется и не может включиться при текущих env (§15) | Нет базы для enforcement | Ключ reCAPTCHA Enterprise production + env + Web App registration | Hosting, настройки | Нет |
| 07D-08 | CSP Report-Only без reporting endpoint; блокеры enforcement (§16) | Нет defense-in-depth от XSS, нет данных о нарушениях | Reporting endpoint, hash inline-скрипта, `api.open-meteo.com` | Hosting (+1 Function при endpoint) | Нет |
| 07D-09 | = 07C-03 Editor на runtime SA | Радиус компрометации | См. 07C | IAM | Нет |
| 07D-10 | = 07C-04 purge без лимита страниц | Задержка outbox cleanup | См. 07C | 1 Function | Нет |
| 07D-11 | Budget alerts не подтверждены (Budget API disabled/403); = часть 07C-02 | Незамеченный рост расходов | Владелец billing подтверждает budget + alerts | Нет | Рекомендовано до запуска |
| 07D-12 | = 07C-05 исторические `error_logs` без `deleteAt` | Retention | См. 07C | Миграция | Нет |
| 07D-13 | = 07C-06 legacy authorized domains (`*.run.app`, `carveacademy.ai.studio`) | OAuth redirect surface | Подтвердить владельца, затем удалить | Auth config | Рекомендовано до запуска |
| 07D-14 | = 07C-07 lifecycle buckets | Рост хранения | DEFERRED методика | Нет | Нет |
| 07D-15 NEW | Процесс: отчёты с деталями уязвимостей публикуются в публичном `main` до выкладки исправлений | Окно эксплуатации production | Выкладывать исправления до публикации деталей либо хранить отчёты приватно до deploy (решение владельца) | Нет | Нет |

### P3

| ID | Кратко | Источник |
| --- | --- | --- |
| P3-01 | Admin refund/compensating event на произвольный Wallet; `record_provider_payment_event` переписывает payer | `financeCorrectionCommands.ts:188-218`, `financeCommands.ts:328` |
| P3-02 | `settings/starter_credit` пишется admin-клиентом напрямую, без step-up и canonical audit | `firestore.rules:255-261, 765-773` |
| P3-03 | Ручное пополнение не требует `expectedRevision` | `financeCommands.ts:252-255` |
| P3-04 | Replay без object-level reauth (кроме guest create) | `idempotentCommandExecution.ts` |
| P3-05 | Admin update canonical Booking запрещён неявно (ошибкой вычисления правила) | `firestore.rules:694-700` |
| P3-06 | Step-up не охватывает admin-списания при reschedule/`create_confirmed_booking`, transfer refunds, `enable_account`, pricing | `commandIntents.ts:410-455`, `bookingCommands.ts:414-422` |
| P3-07 | Нет лимита размера сообщения чата; SSE пересылает окно целиком | `chatMessagesStream.ts:56-64` |
| P3-08 | `list` на публичных Storage-префиксах (UID в именах avatars) — нужен emulator-тест | `storage.rules:87-147` |
| P3-09 | Avatars публичны по URL; без серверного re-encode и удаления EXIF; header-only decode | `storage.rules:93-96`, `mediaTypePolicy.ts:85-100` |
| P3-10 | Неканонические proxy-параметры и голодание глобальной miss-квоты | `optimizeImage.ts:32-58`, `imageMissAdmission.ts:3` |
| P3-11 | Ёмкость chat-media (concurrency 1) и SSE исчерпывается одним аккаунтом | `chatMediaHttp.ts:276-278` |
| P3-12 | Политика доступа инструктора: история других инструкторов, будущие и отменённые уроки, чат после отмены — подтвердить | `participantProgressHistoryReadModels.ts:166-186`, `chatMediaAccess.ts:114-127` |
| P3-13 | `readScope` не передаётся в `instructorHasProgressAccess` | `participantProgressReadModels.ts:380` |
| P3-14 | Остаточный доступ после отзыва или отключения: listeners до переоценки, owner-пути со старым ID token, `disable_account` не отзывает refresh tokens, admin reads без Auth revocation | CA-SEC-07B §SESSION REVOCATION |
| P3-15 | COOP отсутствует; HSTS не проверен на доменах | `firebase.json` |
| P3-16 | HTTP Functions `cors: true` (без credentials) | `chatMediaHttp.ts:279` и др. |
| P3-17 | Гостевые bearer credentials в `localStorage` переживают выход | `guestCredentialStorage.ts` |
| P3-18 | `auth_time` с отрицательным skew отклоняется | `administratorSession.ts:87` |
| P3-19 | Создание `users` по denylist, лишние поля без лимита | `firestore.rules:227-253` |
| P3-20 | Guest admission по полному IPv6 | `guestReservationAdmission.ts:46-53` |
| P3-21 | Сброс пароля раскрывает существование email (зависит от enumeration protection) | `Auth.tsx:384-387` |
| P3-22 | TEST admin-пути без cutoff/TOTP | `executeCanonicalCommandCallable.ts:219-225` |
| P3-23 | Lifecycle клиентских команд проверяется до транзакции; отмена не перепроверяет | `bookingCancellationCommands.ts:118-129` |
| P3-24 | = 07C-08 artifacts | 07C |
| P3-25 | = 07C-09 OSV, переоценено (runtime недостижимо) | §17 |
| P3-26 | Admin direct uploads kaspi-qr/lesson-levels: contentType без magic bytes, download tokens; TEST uploads без квот — **DEFERRED** | `storage.rules:105-129` |

## 22. PUBLIC LAUNCH BLOCKERS

| # | Блокер | Владелец действия | Закрывается |
| --- | --- | --- | --- |
| B1 | 07D-03: решение и исправление гостевого course reuse | Владелец (решение) → разработка | Тесты + staging smoke |
| B2 | 07D-01: production release `main` + fix B1 | Владелец (deploy) | Production smoke §release plan |
| B3 | 07D-02: delete protection + PITR + daily backup + успешный restore drill | Владелец (IAM/настройки) | Drill-отчёт |
| B4 | Staging smoke авторизованных сценариев, включая реальный Google step-up и отзыв сессий | Владелец/QA | Чек-лист §24 |
| B5 | Starter Credit: тексты интерфейса без обещаний бонуса; `amountKzt = 0` закреплён | Владелец (решение) → разработка | Hosting |
| B6 | Ручная проверка: production `GUEST_ACTION_TOKEN_SECRET` ≠ публичный fixture (сравнить хеши, не выводя значения) | Владелец | Запись в журнал релиза |
| B7 | Подтвердить budget alerts на billing account | Владелец billing | Скриншот или запись |

Рекомендовано до запуска, но не блокирует: 07D-04 (чат), 07D-13 (authorized domains), 07D-07 (App Check production key).

## 23. PRODUCTION RELEASE MANIFEST

Подробно — в [release plan](CA-SEC-07D-production-release-plan.md).

| Поверхность | Изменение |
| --- | --- |
| Functions — добавить (12) | `protectedImages`, `chatMessagesStream`, `queryScopedClientDocuments`, `queryChatMessages`, `mutateChatMessage`, `revokeOwnAdministratorSessions`, `syncClientInstructorSignal`, `syncClientCourseSignal`, `syncClientCourseContentSignal`, `syncClientUserSignal`, `syncClientNotificationSignal`, `syncClientActivitySignal` |
| Functions — обновить (55) | Все существующие: изменены общие wrapper/admission (`functions/src/index.ts`), canonical commands, read models, shared-domain (132 файла). `optimizeImage` concurrency 80 → 4 |
| Functions — без изменений / устаревшие / удаление | 0 / 0 / не удалять |
| Firestore Rules | YES (`67b3f515…` → `d2c76569…`) |
| Storage Rules | YES (`b9c73ee6…` → `a18a2b71…`) |
| Indexes | NO. Три TEST-only индекса DEFERRED; не использовать `full:prod` и `--only firestore` |
| TTL | NO |
| Secrets | Существующий `GUEST_ACTION_TOKEN_SECRET@1`; новые привязки у `queryScopedClientDocuments` и `queryCourseCatalogReadModels` (secret-level accessor уже у Compute SA) |
| IAM | Новые HTTP/callable требуют public invoker (назначает deploy; нужен Owner deployer). `revokeOwnAdministratorSessions` — `firebaseauth.users.update` (есть через Editor) |
| Triggers | +6 Firestore triggers (`eur3`, Eventarc). Schedulers без изменений |
| Configuration | Опционально: App Check production key (07D-07). Settings/banners из staging не переносить |
| Migration | Не выявлено обязательных миграций |
| Hosting | Оба сайта: deploy primary → verify → `hosting:clone` на `carveacademy` (существующий release script) |
| Последовательность | Functions → Firestore + Storage Rules → Hosting, последовательно и без пауз |

## 24. STAGING SMOKE CHECKLIST

Все сценарии выполняются на `ski-school-staging` тестовыми аккаунтами. Сценарии, изменяющие данные (✎), требуют разрешения владельца на изменение staging; при необходимости используется `npm run staging:seed` (тоже изменение данных, требует разрешения). Подтверждение — UI, плюс Firestore Console (read-only) и Cloud Logging.

| # | Сценарий | Предусловия / данные | Действие | Ожидаемый результат | ✎ |
| --- | --- | --- | --- | --- | --- |
| S1 | Регистрация + email verification | Новый email | Sign up → письмо → verify → вход | Account `role=user`, LIVE; бонус не начислен при `amountKzt=0` (выставить в staging заранее) | ✎ |
| S2 | Email/password вход | Существующий ученик | Вход/выход/вход другим | Данные первого не видны второму | — |
| S3 | Google вход | Google-аккаунт | Popup | Account создан/найден, без дублей | ✎ |
| S4 | Guest booking | Слот инструктора | Гостевое бронирование → статус → отмена | Credential работает только для своего booking; чужой bookingId → отказ | ✎ |
| S5 | Guest course enrollment | Курс с гостевой записью | Запись → Kaspi → отмена | Корректный статус; reuse чужого participantId отклоняется (после fix 07D-03) | ✎ |
| S6 | Привязка гостя | S4 с тем же verified email | `claimGuestProfile` / link | Привязано; повторно другим аккаунтом — отказ | ✎ |
| S7 | Student cabinet | Ученик с историей | Прогресс, homework, чат, смена Participant | Только свои Participants | — |
| S8 | Instructor cabinet | Инструктор с уроками | Будущие/прошлые/отменённые уроки, attendance, progress | Доступ соответствует политике §11 | ✎ (attendance) |
| S9 | Admin cabinet | Администратор | Каталоги, finance, issues | Загружается без step-up | — |
| S10 | Wallet + Kaspi | Ученик, админ | Kaspi QR → admin review | Одно начисление; повторный review — no-op | ✎ |
| S11 | Booking/курс из Wallet | Баланс ≥ цены | Бронирование | Цена с сервера, одно списание | ✎ |
| S12 | Отмена и возврат | S11 | Отмена → admin resolve с возвратом | Step-up при `refundAmount>0`; один возврат | ✎ |
| S13 | **Google OAuth step-up (особо)** | Google-only админ; админ с паролем и Google | Через >10 мин после входа: ручное пополнение | Модал → Google popup → `auth_time` обновлён → один повтор с тем же ключом; другой Google-аккаунт → отказ; закрытие popup и Escape → отмена без повтора; desktop + mobile | ✎ |
| S14 | Password step-up | Админ с паролем | То же | Неверный пароль → ошибка, верный → один повтор | ✎ |
| S15 | Отзыв сессий | Админ в двух браузерах | `revokeOwnAdministratorSessions` в A | A выходит; B: admin-callables и Rules отказывают, обычные пути работают до истечения токена | ✎ |
| S16 | Media | Ученик, админ | Аватар Participant, chat image/video, cover, фото инструктора; SVG/HTML переименованный | Валидные приняты, SVG/HTML/битые отклонены, квота срабатывает | ✎ |
| S17 | Protected Images / proxy | Публичные изображения | `/api/img` с разными `w` | Только 4 ширины, webp, nosniff | — |
| S18 | Chat + SSE | Booking с двумя сторонами | Сообщение, вложение, SSE | Доставка; посторонний — отказ | ✎ |
| S19 | Scheduled processes | — | Cloud Logging последних запусков 7 jobs | Без ошибок | — |
| S20 | App Check Monitoring | Staging key | Метрики Console | Рост verified share | — |
| S21 | RU/EN, mobile/desktop | — | Ключевые экраны | Без регрессий, тексты бонуса удалены | — |

## 25. ROLLBACK & INCIDENT RESPONSE

| Компонент | Механизм | Нужный артефакт | Совместимость / необратимое | Риск | Подтверждение |
| --- | --- | --- | --- | --- | --- |
| Functions | Повторный deploy из worktree `14695f71` | Git `14695f71` | 12 новых функций останутся (не удалять автоматически); старый код со старыми Rules. Повторно откроет закрытые P1 | Средний | `commit_sha` labels |
| Firestore Rules | Release предыдущего ruleset `621b219b-…` (Console → Rules → History) или deploy файла `14695f71` | ruleset ID | Откроет P1 06A/05B; только при массовом отказе легитимных путей | Средний | Хеш активного ruleset |
| Storage Rules | Ruleset `cef9700f-…` | ruleset ID | Аналогично | Средний | Хеш |
| Hosting | `hosting:clone` предыдущих версий `11beb5df338530da` / `c192bf56498d0e4a` или Console Rollback | version IDs | Новый клиент без новых Functions сломан — откатывать Hosting до Functions | Низкий | `build-info.json` обоих сайтов |
| Auth config | Не меняется релизом | — | Отозванные refresh tokens не восстанавливаются | — | — |
| App Check | Не меняется релизом (enforcement не включать) | — | — | — | Console |
| IAM / Secrets | Не меняются релизом | — | Ротация секрета инвалидирует действующие guest credentials и курсоры | — | — |
| Firestore data | **Только backup/PITR** (сейчас отсутствуют) | — | Откат кода не восстанавливает данные | Высокий до B3 | Drill |

Серверная авторизация как средство устранения ошибок релиза не отключается.

**Инциденты (минимум):**

- **Компрометация администратора.**
  1. Другой администратор выполняет `disable_account` компрометированному Account (или owner через Console).
  2. Затем `revokeOwnAdministratorSessions` из свежей сессии жертвы либо `revokeRefreshTokens` через Admin SDK вместе с записью cutoff.
  3. Проверить ActivityLog финансовых команд за период и, при необходимости, сделать компенсирующие корректировки каноническими командами.
  4. Сменить пароль и Google-доступ.
- **Утечка секрета.** Создать новую версию `GUEST_ACTION_TOKEN_SECRET`, обновить binding и выполнить deploy затронутых функций (сначала staging). Принять инвалидацию активных гостевых credentials. При утечке SA key отключить ключ, проверить IAM.
- **Рост расходов.**
  1. Budget alert или метрики.
  2. Уменьшить `maxInstances` нужной функции повторным deploy с изменённой опцией или временно закрыть отдельный endpoint.
  3. Найти источник по Cloud Run логам.
  4. Proxy и guest admission уже имеют лимиты.
- **Ошибочное начисление.** Компенсирующая `record_financial_correction` (step-up, audit). Не удалять MonetaryEvent. При массовой ошибке — PITR-чтение на момент до ошибки для сверки.
- **Потеря доступа администратора.** Owner проекта через IAM/Console восстанавливает роль в `users/{uid}` (Admin SDK) по процедуре CA-SEC-07B RECOVERY; держать минимум двух действующих администраторов.
- **Ошибочное удаление данных.** Остановить писателей (схему не трогать), восстановить из PITR/backup в новую БД, точечно перенести документы Admin SDK-скриптом после сверки. До B3 восстановление невозможно или возможно только из экспорта 28.10.

## 26. ACCEPTED & RESIDUAL RISKS

- MFA для администраторов подготовлена, не обязательна. Компенсирующие меры: step-up на критических операциях, отзыв сессий. Пилот TOTP — после запуска по отдельному согласованию.
- App Check только monitoring; в production пока отсутствует.
- Отзыв через Console/Admin SDK без cutoff и TEST-пути со старым ID token (до ≈1 ч).
- Инсайдерский риск администратора в финансовых командах (P3-01/03/06); полностью аудируется.
- Публичные по URL аватары Participant (P3-09) — подтвердить продуктовую допустимость.
- DEFERRED: TEST-only индексы, TEST Session, admin direct uploads, orphan cleanup, lifecycle buckets.

## 27. NOT VERIFIED

- Авторизованные облачные сценарии staging/production. **AUTHENTICATED WORKFLOW: NOT VERIFIED** (локально с demo Auth — PASS).
- Реальный Google OAuth step-up и обновление `auth_time`; реальная TOTP; поведение Firestore listeners после смены прав в облаке; email enumeration protection; single-hop XFF в production ingress.
- Совпадение production-секрета с fixture; budget alerts; App Check production (403); фактический dependency tree облачного образа; полный `npm audit`.
- Восстановимость экспортов 25/28.10; любой restore; RTO.
- 07D-03 в runtime (emulator) и его наличие в production-коде `14695f71`.
- HSTS и COOP на доменах; CSP нарушения при реальном трафике.
- IAM (07C-03) и индексы не перепроверялись сегодня, опора на 07C от этой же даты.

## 28. FINAL RECOMMENDATIONS

Конечный список обязательных действий до публичного запуска — B1–B7 (§22). Новых security-этапов не требуется. После B1–B7 — повторная короткая сверка production (Functions SHA, Rules hash, `build-info`), а не новый аудит.

После запуска (по приоритету): 07D-04 (если не сделано до запуска), 07D-13, 07D-07 → поэтапный App Check, 07D-08 CSP reporting, 07D-05, 07D-09 IAM, 07D-10/12/14, P3 по мере касания кода.

Продуктовые вопросы владельцу:

1. «Может ли гостевая запись на курс переиспользовать существующего гостевого участника без подписанного доказательства, и кому разрешено затем привязать его к аккаунту?» (07D-03)
2. «Сохраняет ли инструктор доступ к истории прогресса и чату участника после отмены, завершения урока или блокировки, и в течение какого срока?» (P3-12)
3. «Допустимо ли, что аватары участников, включая детей, публично доступны по прямой ссылке?» (P3-09)
4. «Публиковать ли отчёты аудита с деталями уязвимостей в публичном репозитории до развёртывания исправлений?» (07D-15)

В репозитории добавлены только этот отчёт и release plan. Commit, push, PR, deploy и изменения облака не выполнялись.
