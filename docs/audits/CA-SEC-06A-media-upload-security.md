# CA-SEC-06A — Media Upload Security

> Дата: 2026-11-22, Asia/Qyzylorda. Ветка `fix/ca-sec-06a-media-upload-security`, созданная от `main` `1bcf971844f1d3b0bb8f69a1beb6224abc603d20` (включает CA-SEC-05B, PR #220). Рабочее дерево на старте было чистым. Деплой, коммиты, миграции и изменения реальных данных не выполнялись.

## VERDICT

**DONE** — подтверждённые уязвимости LIVE-путей загрузки/обработки медиа закрыты на серверной стороне, целевые и регрессионные проверки проходят, совместимость существующих файлов и URL сохранена. Остаточные ограничения перечислены в **NOT VERIFIED** и **NEXT STEPS**; они не являются блокирующими для LIVE и не требуют изменения формата хранения или URL-контракта.

Приоритеты ниже: P0 не подтверждён ни по одному LIVE-пути. Закрыты четыре находки P1–P2: активные типы в чате (F1), непроверенные байты защищённых изображений (F2), публично читаемая запись `avatars/{uid}` (F3), а также `javascript:`/`data:` в ссылках-вложениях чата (F8, найдено независимым review). Три P2 задокументированы, четыре P3 исправлены.

## MEDIA INVENTORY

Полный список путей Storage, писателей, читателей и проверок. «Server» — серверный обработчик/правило, «Client» — браузерная проверка (не считается защитой).

| # | Назначение | Storage path | Кто пишет | Кто читает | Форматы (факт) | Max size | Client-проверки | Server-проверки | Rules | Выдача URL | Отзыв доступа | Отображение |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Аватар участника (LIVE) | `participant-avatars/{participantId}/avatar.jpg` | только `protectedImages` (Cloud Function) | **публично** | jpeg/png/webp (после исправления — по байтам; GIF отклоняется) | 5 MB (функция) | `file.type.startsWith('image/')`, canvas → JPEG 200×200 | активный LIVE Account + `participant_management_active_owner` read model; scope-aware MIME allowlist; size; `ifGenerationMatch`; повторная авторизация после записи; **sharp-классификация байтов** | `read: true`, `write: false` | public URL `.../o/<path>?alt=media` (без download token) | запись отзывается вместе с полномочиями; публичное чтение — контракт продукта | `<img>` по публичному URL |
| 2 | Изображение инструктора | `instructors/{instructorId}.jpg` | только `protectedImages` (admin); удаление — серверный `bestEffortDeleteInstructorCatalogImage` после canonical-команды удаления | публично | jpeg/png/webp, проверка байтов | 5 MB | canvas 400×400 → JPEG | активный admin Account (`role=admin`, LIVE scope), MIME + bytes | `read: true`, `write: false` | `getDownloadURL()` (token URL) | новые загрузки — только актуальный admin; удаление — только canonical-команда | `<img>` |
| 3 | Обложка курса | `courses/{courseId}.webp` | только `protectedImages` (admin) | публично | WebP/JPEG (canvas), проверка байтов | 5 MB | canvas 800×600 → WebP 0.82 | активный admin Account, MIME + bytes | `read: true`, `write: false` | `getDownloadURL()` | как №2 | `<img>` |
| 4 | Логотип уровня | `lesson-levels/{levelId}/{uploaderId}/{assetId}` | прямой SDK (immutable create) | публично | png/jpeg/webp (metadata) | 2 MB | `LESSON_LEVEL_LOGO_MIME_TYPES` + size | Rules: активный admin, LIVE, `resource == null`, uuid v4 `assetId`, `levelId` шаблон | `get: true`, `create` admin-only, без update/delete | `getDownloadURL()` (token URL) | объекты immutable; отзыв прав не удаляет файл | `<img>` |
| 5 | Kaspi QR мерчанта | `kaspi-qr/{uploaderId}/{uuid}` | прямой SDK (immutable create) | admin + гостевой flow при совпадении `payment_configuration/kaspi_manual.qrStoragePath` | png/jpeg/webp (metadata) | 5 MB (Rules), клиент `KASPI_QR_MAX_BYTES` | MIME + size | Rules: `isOwner` + `isAdmin`, `resource == null`, uuid `[0-9a-f-]{36}` | `get` admin ИЛИ точное совпадение пути в конфиге; без list/update/delete | `getDownloadURL()` | привязка к конфигу платежей | `<img>` |
| 6 | Вложения чата (LIVE) | `chat/{threadId}/{fileName}` | только `bookingChatMedia` (chunked HTTP) | участники Booking/Course-чата, instructor, admin (fresh canonical checks) | после исправления: image/jpeg,png,webp; video/mp4,webm (по байтам) | image < 5 MB, video < 50 MB, чанк ≤ 8 MB, ≤ 7 частей | `MEDIA_LIMITS` (зеркало сервера, `Map` без prototype-ключей), canvas → JPEG / MediaRecorder → WebM | `authorizeChatMedia` (active Account, party/participant-owner guard, instructor assignment, course access, admin; LIVE/TEST scope), uploadId как capability, размер, повторная авторизация, **allowlist + классификация байтов**, `ifGenerationMatch: 0` | `read/write: false` (прямой SDK закрыт полностью) | непрозрачный маркер `chat-media:<path>`; байты — только с Bearer-токеном | каждое скачивание заново проверяет полномочия; отзыв — немедленный | Blob: `<video>` либо `<img>` после canvas-растеризации в `rasterizeChatImage` |
| 7 | Временные части чат-загрузки | `_chat-media-uploads/{uid}/{0..6}` | `bookingChatMedia` | никто (приватные) | `application/octet-stream` | 8 MB × 7 | — | uploadId/targetPath в metadata, очистка в `finally` | default deny | не выдаётся | — |
| 8 | Аватар аккаунта (legacy) | `avatars/{uid}` | **никто** (после исправления запись закрыта) | публично | существующие объекты — любые | n/a | нет (путь не используется клиентом) | Rules: `read: true`, `write: false` | `read: true`, `write: false` | public URL | только удалением объекта сервером | `<img>` |
| 9 | Кэш изображений | `image-cache/{sha256}_w{width}_q{quality}.webp` | `optimizeImage` (admin SDK) | публично | WebP | выход ограничен `width`/`quality` | — | source allowlist `storage.yandexcloud.net/carve/`, ≤ 8 MB, ширины 480/960/1280/1920, q 40–90, admission 120 miss/мин, `nosniff` | `read: true`, `write: false` | `GET /api/img?u=…&w=…&q=…` (Hosting rewrite) | источник — только публичный каталог | `<img src="/api/img…">` |
| 10 | Баннеры и видео сайта | внешние `https://storage.yandexcloud.net/carve/...` (текстовые URL в Firestore) | вне нашего стека | публично | jpg/png/webp/mp4 (внешние) | внешний хостинг | — | `/api/img` проксирует только `/carve/`; видео — прямая ссылка | n/a | `/api/img` для картинок, `.mp4` напрямую для видео | внешний | `<img>`, `<video>` |
| 11 | TEST actor/misc/course-assets | `test-actors/**`, `test-sessions/{id}/(misc|course-assets)/**` | `protectedImages` | члены TEST-сессии | jpeg/png/webp/gif + проверка байтов | 5 MB | — | `authorizeProtectedImage` (read scope, membership, ownership в `misc/`), MIME + bytes | `read/write: false` | только через функцию | каждое чтение | Blob `<img>` |

Таблица разрешённых операций (после исправления):

| Тип медиа | Загрузка | Чтение | Замена | Удаление | Разрешённые форматы | Max size |
|---|---|---|---|---|---|---|
| Аватар участника LIVE | владелец Account с активным management-guard | все | перезапись через функцию (generation precondition) | нет | jpeg, png, webp (по байтам) | 5 MB |
| Изображение инструктора / обложка курса | только admin | все | через функцию | нет для курсов; изображение инструктора — best-effort delete серверной canonical-командой | jpeg, png, webp (по байтам) | 5 MB |
| Логотип уровня | только admin (immutable create) | все | нет (новая версия = новый объект) | нет | png, jpeg, webp (метаданные Rules) | 2 MB |
| Kaspi QR | только admin (immutable create) | admin / гостевой flow по конфигу | нет | нет | png, jpeg, webp (метаданные Rules) | 5 MB |
| Вложение чата | участники чата (fresh authority) | участники чата (fresh authority) | нет (`ifGenerationMatch: 0`) | через отмену загрузки (temp chunks) | jpeg, png, webp, mp4, webm (по байтам) | 5 MB / 50 MB |
| Ссылка-вложение чата | участники чата | участники чата | нет | нет | только абсолютный `http(s)`; `javascript:`/`data:`/`blob:`/`file:` не рендерятся как ссылка | 2 000 симв. |
| Аватар аккаунта (legacy) | запрещено | все | запрещено | запрещено | существующие объекты любые | n/a |
| Кэш изображений | только `optimizeImage` | все | только функция | нет | webp | по ширине/качеству |
| TEST media | члены сессии | члены сессии | через функцию | нет | jpeg, png, webp, gif (по байтам) | 5 MB |

## FINDINGS

| ID | P | Проблема | Файлы / строки (до исправления) | Влияние |
|---|---|---|---|---|
| F1 | P1 | Chat-шлюз принимал **любое** объявление `image/*` (включая `image/svg+xml`, `image/gif`, `image/heic`, `image/avif`) и вообще не проверял фактические байты. Активный SVG/HTML-полиглот сохранялся по защищённому пути и затем отдавался обратно с `Content-Type` из metadata и без `Content-Disposition`. | `functions/src/chat/chatMediaAccess.ts:138-142` (`mediaSizeLimit` только по семейству), `functions/src/chat/chatMediaHttp.ts:112-118,163-171` | Активный контент, опубликованный авторизованным отправителем, отдавался любому участнику чата и админу; безопасность держалась только на клиентской растеризации (`ChatMedia.tsx`, `chatImageDisplay.ts`), то есть не на серверной границе. |
| F2 | P1 | `protectedImages` (публичные LIVE-аватары участников, обложки курсов, изображения инструкторов) проверял **только объявленный** `Content-Type` заголовка и размер; байты не классифицировались. | `functions/src/security/protectedImagesHttp.ts:75-83` | SVG/HTML/полиглот сохранялся под публичным URL с подменённым `image/png`. Публичный объект доступен по прямой ссылке Firebase Storage, а защитные заголовки прямых Storage-ответов мы не контролируем (тикет прямо запрещает на это рассчитывать), поэтому такой файл становится активным контентом, раздаваемым по нашей ссылке с подменённым типом. |
| F3 | P1 | Правило Storage для `avatars/{uid}` разрешало любому аутентифицированному LIVE-владельцу запись `contentType.matches('image/.*')`, включая `image/svg+xml` и `text/html`-полиглоты, при публичном чтении. | `storage.rules:63-79` | Любой вошедший пользователь мог разместить исполняемый SVG/HTML по публично читаемому пути и раздавать прямую ссылку; на прямые Storage-ответы нельзя добавить `nosniff`/`Content-Disposition`, поэтому единственная защита — не принимать такие типы. Путь legacy — текущий клиент в него не пишет. |
| F4 | P2 | Загрузки `lesson-levels/*` и `kaspi-qr/*` идут напрямую через клиентский SDK: Rules проверяют только `contentType` в metadata, байты не классифицируются. | `src/features/settings/lessonLevelLogo.ts:8-33`, `src/features/kaspi-payments/KaspiMerchantSettingsForm.tsx:83-87`, `storage.rules:107-115,91-102` | Администратор (скомпрометированный или ошибающийся) может сохранить SVG/HTML под `image/png` в публично читаемый логотип уровня. Требует изменения URL-контракта (маршрутизация через сервер) → вынесено в NEXT STEPS, не исправлялось в этом срезе. |
| F5 | P2 | Классификация изображений выполняется по заголовку (`sharp.metadata()`), а не полным декодированием: усечённое тело с валидным заголовком проходит. Для видео проверяется только контейнерный magic. | `functions/src/security/mediaTypePolicy.ts:73-103,105-118` | Остаточный риск: повреждённый файл будет сохранён (браузер просто не отрисует его в `<img>/<video>`), и «растровый полиглот» (валидный JPEG + HTML-хвост) сохраняется. Он не исполняется ни в одном используемом контексте отображения (`img`, `video`, Blob), а серверные ответы идут с `nosniff`/`attachment`; поведение зафиксировано тестом `accepts a raster payload with appended markup…`. Осознанный компромисс по CPU. |
| F6 | P3 | `GET /api/img` (прокси изображений) не выставлял `X-Content-Type-Options: nosniff`. | `functions/src/images/optimizeImageHttp.ts:22` | Ответ всегда `image/webp` фиксированного вида, поэтому практического обхода не было; заголовок добавлен для единообразия. |
| F7 | P3 | Поля `avatarUrl` / `bgImageUrl` / `promoVideoUrl` — свободные строки URL (до 2 000 символов) без ограничения на наш домен/path. | `packages/shared-domain/src/canonical/accountParticipantAccess.ts:224-231`, `identityAdministration.ts:39` | Не является исполняемым контентом (рендерится в `<img>/<video>`); даёт стороннее сетевое обращение (утечка реферера). Вне области загрузки файлов, не исправлялось. |
| F8 | P2 | `attachmentUrl` в сообщении чата — произвольная строка, которую пишет любой участник (и через callable, и напрямую через Rules), а `ChatMessageList.tsx` / `StudentCoachPanel.tsx` подставляли её прямо в `href`. | `src/features/bookings/components/booking_chat/ChatMessageList.tsx:179-196`, `src/features/student-cabinet/components/student/StudentCoachPanel.tsx:588-598`, `functions/src/chat/chatMessagesWrite.ts:44-57` | Хранимый `javascript:`/`data:` URL в LIVE-чате: содержимое активно, когда другой участник открывает вложение. Соседние поверхности уже использовали http(s)-allowlist (`InstructorHomeworkSection.tsx:21-28`), чат — нет. Блокировка `target="_blank"` в Chromium снижает эксплуатацию (инертно), но это не контракт; найдено независимым review, исправлено. |

Не подтверждено: обхода размера (5 MB / 50 MB / 8 MB × 7 частей), обхода авторизации через подмену `accountId`/`participantId`/пути, повторной публикации после отзыва полномочий. Эти инварианты уже закрыты серверной авторизацией CA-SEC-05/05B и подтверждены существующими emulator-тестами; новые проверки типов добавлены **после** этой авторизации, поэтому не создают обхода.

## ROOT CAUSE

- **Тип медиа брался из клиентских метаданных.** В `protectedImages` тип приходил из заголовка `Content-Type`, в `bookingChatMedia` — из query-параметра `type`, в Rules — из `request.resource.contentType`. Байты не классифицировались нигде, поэтому `image/png` c SVG-содержимым считался корректным.
- **Allow-by-prefix вместо deny-by-default.** Проверки были семейными: `contentType.matches('image/.*')` в Storage Rules и `type.startsWith('image/')` в `mediaSizeLimit`. Любой новый/активный подтип (`svg+xml`, `gif`, `heic`, `avif`) автоматически попадал в allowlist.
- **Защита от активного контента существовала только на клиенте.** `chatImageDisplay.rasterizeChatImage` + пассивный `<img>` + просмотрщик `about:blank` корректно нейтрализуют SVG в UI, но не ограничивают хранение и выдачу байтов: любой другой потребитель (новая поверхность, выгрузка «оригинала», прямой вызов шлюза с токеном) получал активный файл. Клиентская валидация по условиям тикета не является границей безопасности.
- **Метаданные Storage/имя файла не являются доказательством формата.** Правила Storage не могут проверять содержимое, поэтому прямой SDK-upload (логотипы уровней, Kaspi QR, legacy `avatars/`) в принципе ограничен только метаданными; серверные обработчики обязаны проверять байты сами — что и добавлено для двух путей, где это возможно без смены контракта.
- **Ссылки-вложения не нормализовались при отображении.** Для файлов существовала клиентская растеризация, а для «ссылочных» вложений чата — нет: `attachmentUrl` из Firestore попадал в `href` без проверки схемы, хотя на соседних поверхностях (домашние задания) такой allowlist уже был. Один и тот же дефект — «доверяем хранимому значению при рендеринге».

## FIX

1. **Новый серверный политик-модуль** `functions/src/security/mediaTypePolicy.ts`:
   - `LIVE_CHAT_IMAGE_TYPES = jpeg|png|webp`, `LIVE_CHAT_VIDEO_TYPES = mp4|webm` — deny-by-default allowlist;
   - `LIVE_PROTECTED_IMAGE_TYPES` (jpeg/png/webp для публичных LIVE-изображений) и `PROTECTED_IMAGE_TYPES` (+gif только для TEST) с scope-aware проверкой `isAllowedProtectedImageType(path, type)`;
   - `imageContentMatchesType`/`assertImageContentMatchesType` — классификация фактических байтов через `sharp(...).metadata()` в ограниченном окне `limitInputPixels = 40 000 000` (как в существующем `optimizeImage`), без полного декодирования и без переноса metadata;
   - `isChatVideoContainer`/`assertChatMediaContentMatchesType` — проверка контейнера по magic (`ftyp` для ISO-BMFF, `1A45DFA3` для EBML/WebM); тяжёлая обработка видео не добавлена;
   - `chatMediaUploadLimit` — границы 5 MB / 50 MB, привязанные к allowlist.
2. **Chat-шлюз** `functions/src/chat/chatMediaHttp.ts`: allowlist объявленного типа проверяется внутри `try/finally` (временные части удаляются и при отказе), байты классифицируются перед `file.save`; в GET добавлен `Content-Disposition: attachment` (файл всегда отображается из Blob).
3. **`protectedImages`** `functions/src/security/protectedImagesHttp.ts`: MIME allowlist вынесен в общий модуль (LIVE — без GIF), POST классифицирует байты через sharp до записи — закрывает F2 для аватаров участников, обложек курсов и изображений инструкторов.
4. **Storage Rules** `storage.rules`: запись `avatars/{uid}` полностью закрыта (`read: true`, `write: false`). Причина: Rules не видят байты, а ни текущий, ни исторический клиент этот путь не пишет (исторический писатель использовал `avatars/{uid}.jpg`, что уже не проходит `isOwner`). Публичное чтение существующих объектов сохранено.
5. **Прокси изображений** `functions/src/images/optimizeImageHttp.ts`: `X-Content-Type-Options: nosniff`.
6. **Клиент**: `src/features/chat/chatMediaClient.ts` дублирует серверный allowlist (`Map`, отказ до сети — без prototype-ключей), `chatCompression.ts` пропускает «как есть» только mp4/webm — иначе перекодирует в WebM, чтобы не отправлять непроверяемый контейнер.
7. **Ссылки-вложения чата** `src/features/chat/safeChatLink.ts` + применение в `ChatMessageList.tsx` и `StudentCoachPanel.tsx`: кликабельной становится только абсолютная `http(s)`-ссылка; `javascript:`/`data:`/`blob:`/`file:`/относительные значения не рендерятся как ссылка (текст сообщения сохраняется).
8. **Совместимость**: metadata существующих объектов не менялись, download-token URL не отзывались, файлы не мигрировали; уже опубликованные активные вложения остаются читаемыми, но выдаются как `attachment` с `nosniff`.

## FILES CHANGED

| Файл | Изменение |
|---|---|
| `functions/src/security/mediaTypePolicy.ts` | новый модуль политики типов, scope-aware allowlist и классификация байтов |
| `functions/src/security/mediaTypePolicy.test.ts` | новый unit-тест политики (30 тестов) |
| `functions/src/chat/chatMediaHttp.ts` | allowlist + классификация байтов на `finish`, `Content-Disposition` на GET |
| `functions/src/security/protectedImagesHttp.ts` | scope-aware allowlist через общий модуль + sharp-классификация байтов |
| `functions/src/images/optimizeImageHttp.ts` | `X-Content-Type-Options: nosniff` |
| `storage.rules` | `avatars/{uid}`: запись закрыта, публичное чтение сохранено |
| `src/features/chat/safeChatLink.ts` | новый http(s)-allowlist для ссылок-вложений |
| `src/features/chat/chatMediaClient.ts` | клиентское зеркало allowlist и лимитов (`Map`, `Object`-safe) |
| `src/features/bookings/components/booking_chat/chatCompression.ts` | passthrough только для mp4/webm |
| `src/features/bookings/components/booking_chat/ChatMessageList.tsx` | ссылка-вложение только http(s) |
| `src/features/student-cabinet/components/student/StudentCoachPanel.tsx` | ссылка-вложение только http(s) |
| `functions/src/chat/chatMedia.emulator.test.ts` | реальные байты в фикстурах + блок `CA-SEC-06A media upload security` (10 новых проверок, 30 параметризованных случаев) |
| `tests/storage.rules.test.ts` | `avatars/{uid}`: публичное чтение сохранено, любая запись (owner/чужой/аноним, любой MIME) запрещена |
| `tests/unit/chatMediaClient.test.ts` | allowlist клиента |
| `tests/unit/chatCompression.test.ts` | новый: passthrough только mp4/webm |
| `tests/unit/safeChatLink.test.ts` | новый: схемы ссылок чата |
| `e2e/booking-chat-media.spec.ts` | hostile SVG upload теперь ожидаемо `400`; legacy-объект сеется напрямую через Admin SDK (регрессия «инертного» SVG сохранена) |
| `scripts/testManifest.inventory.json` | регистрация трёх новых тестов (`functions-unit`, `app-unit`) |
| `docs/audits/CA-SEC-06A-media-upload-security.md` | этот отчёт |

## TESTS

| Проверка | Результат |
|---|---|
| `node scripts/runVitest.mjs src/security/mediaTypePolicy.test.ts` (новый) | **PASS** — 29 тестов |
| `npm run test:chat-media` (storage rules + bookingQueryContracts + chatMedia emulator, реальные эмуляторы firestore/storage/auth) | **PASS** — `chatMedia.emulator.test.ts` 60 тестов (критический минимум 32 в manifest не снижен) |
| `npm run test:storage-rules` | **PASS** — 37 тестов |
| `npm run test:functions` (unit, без эмуляторов) | **PASS** — 138 файлов, 1752 теста |
| Новые app-тесты напрямую (`chatCompression`, `safeChatLink`, `chatMediaClient`) | **PASS** — 29 тестов. В quick-профиль не попадают (селектор quick исключает файлы с browser-зависимостями), входят в PR/full `app-unit` |
| `npm run test:quick` (translations, app-unit, shared-domain, functions-unit, node-guards + `test:quick:types`) | **PASS** — translations 2, app-unit 644, shared-domain 454, functions-unit 1753 (на момент прогона), node-guards 59 |
| `npm run lint` (`tsc --noEmit && eslint .`) | **PASS** — 0 errors. Предупреждения `prettier/prettier Delete ␍` — известный baseline CRLF-шум рабочего дерева, не связан с изменением |
| `npx tsc -p functions/tsconfig.json --noEmit` | **PASS** |
| `npm run build:functions` (включая `syncSharedDomain` и проверку provenance) | **PASS** |
| `npm run build` (production, `tsc && vite build`) | **PASS** |
| `git diff --check` | **PASS** (пусто) |
| `node scripts/validateTestManifest.mjs` | **PASS** — 723 файла инвентаря, 10 suites, дубликатов нет |
| `npm run test:e2e` / Playwright `booking-chat-media.spec.ts` | **NOT RUN** — требует полного набора эмуляторов + Chromium в этом окружении; изменение теста проверено статически/типами |
| `graphify update .` | **NOT RUN** — по условиям тикета Graphify не обязателен; изменения сверены напрямую с исходниками |

Тестовое покрытие по требованиям тикета:

| Требование | Где проверено |
|---|---|
| Разрешённые типы | `mediaTypePolicy.test.ts` (jpeg/png/webp/mp4/webm, scope-aware protected allowlist), emulator: публикация каждого разрешённого типа |
| Подмена MIME | emulator: SVG→`image/png`, SVG→`image/jpeg`, HTML→`image/webp`, WebM→`video/mp4`, MP4→`video/webm`; отказ проверяется и по коду (`invalid-argument`), не только по HTTP-статусу |
| SVG/HTML под видом изображения | `mediaTypePolicy.test.ts`, emulator (отказ + отсутствие объекта + очистка chunks), protectedImages (`instructors/...`, `courses/...`), Storage Rules (`lesson-levels`, `avatars`) |
| Неправильное расширение | emulator: валидный JPEG с именем `payload.txt` публикуется, SVG с именем `.jpg` отклоняется |
| Повреждённый файл | `mediaTypePolicy.test.ts` (усечённый JPEG, пустой буфер), emulator (`truncated JPEG` → 400); полиглот JPEG+HTML зафиксирован тестом как инертный |
| Превышение размера | emulator: точная граница 5 MB / 50 MB, чанк ≤ 8 MB, 7 частей; Storage Rules: 2 MB логотип |
| Чужой Storage path | emulator: `chat/unknown/...`, `chat/../...`, `gs://foreign/...`, чужой `_chat-media-uploads`, чужой `lesson-levels/{admin}/...`, `participant-avatars/{foreign}` |
| Неавторизованный upload | emulator: аноним (`401`), чужой участник (`403`), отключённый Account, отозванный TestActor; Storage Rules: аноним/обычный пользователь/неактивный admin |
| Отзыв доступа | emulator: отключение Account, перенос management-guard, смена инструктора при переносе, отзыв admin/instructor-связей, повторная авторизация после чтения чанков, повторное скачивание |
| Разрешённый LIVE upload | emulator: image/jpeg, image/png, image/webp, video/mp4, video/webm от участника и от admin; отклонённая перезагрузка не портит ранее сохранённое изображение |
| Административный upload | emulator: `protectedImages` для `instructors/...` (admin `201`, обычный пользователь `403`, GIF `400`); Storage Rules: `lesson-levels`, `kaspi-qr` |
| Получение и отображение разрешённого файла | emulator: `GET` → `200`, `Content-Type` из metadata, `nosniff`, `Content-Disposition: attachment`, `Cache-Control: private, no-store`; legacy SVG остаётся читаемым и инертным |
| Активные ссылки-вложения | `safeChatLink.test.ts` (`javascript:`, `data:`, `blob:`, `file:`, относительные), `chatCompression.test.ts` (непроходимый контейнер не уходит в шлюз) |

## SECURITY REVIEW

Независимый review выполнен отдельным reviewer-агентом (не автором изменения): статический разбор всего diff, проверка всех путей Storage из `storage.rules` против реальных писателей, плюс адъюнктные проверки на `sharp 0.35.5` и Chromium (эмуляторы/e2e не запускались).

**Итог: APPROVE WITH FOLLOW-UPS, блокирующих проблем нет.**

Проверенные сценарии, которые reviewer признал неэксплуатируемыми: declared-type trust для `avatars/{uid}` (Chromium не исполняет HTML в документе с `Content-Type: image/png`; аватар рендерится только в `<img>`); legacy `image/svg+xml` в `chat/**` (Bearer-gated + растеризация + `<video>`); JPEG+HTML полиглот (заголовок классифицируется как jpeg, отдаётся с `nosniff`/`attachment`).

Найденные замечания и что сделано:

| Замечание review | Приоритет | Действие |
|---|---|---|
| Несанированные `href` в чате (`ChatMessageList`, `StudentCoachPanel`) — можно записать `javascript:` | P2 (pre-existing) | **Исправлено** (F8): `safeChatLink` + 2 вызова, тесты |
| `avatars/{uid}` проверяет только объявленный тип; предложено закрыть запись | P2 | **Исправлено**: `write: false` с обоснованием (исторический писатель использовал `avatars/{uid}.jpg`, что уже не проходит `isOwner`) |
| Prototype-ключи (`constructor`) в `MEDIA_LIMITS` обходят клиентскую проверку | P3 | **Исправлено**: `Map` + `has`/`get` |
| Комментарий «temporary parts are always cleaned up» преувеличен (bad `count` выходит до `try`) | P3 | **Исправлено**: комментарий уточнён |
| `MAX_IMAGE_PIXELS = 16M` мог отбрасывать легитимные крупные фото | P3 | **Исправлено**: 40M — как в существующем `optimizeImage` |
| GIF остаётся в allowlist публичных LIVE-изображений | P3 | **Исправлено**: LIVE — только jpeg/png/webp, GIF — только TEST (`isAllowedProtectedImageType`) |
| Видео классифицируется 4 magic-байтами; возможен `ftyp`+HTML | P3 | **Принято с обоснованием**: единственный потребитель — `<video src=blob:>`, GET — Bearer + `nosniff`/`attachment`; brand allowlist отложен (риск ложных отказов) |
| Тесты spoof проверяли только HTTP-статус | Test gap | **Исправлено**: проверяется `{ error: 'invalid-argument' }` |
| Нет проверки, что отклонённая перезагрузка не портит ранее сохранённый файл | Test gap | **Исправлено**: перечитывание объекта после отказа |
| Нет тестов на GIF-классификацию, полиглот, passthrough видео и схему ссылок | Test gaps | **Исправлено**: policy (gif/polyglot/LIVE-vs-TEST), `chatCompression.test.ts`, `safeChatLink.test.ts` |
| E2E теперь сеет hostile-объект через Admin SDK, «свежая загрузка» больше не покрывается e2e | Замечание | **Принято**: свежая загрузка покрыта emulator-тестами (upload → 400), inert-render остаётся в e2e |

## PERFORMANCE

- **CPU.** Chat `finish`: одно чтение заголовка изображения через `sharp.metadata()` (≤ 5 MB, `limitInputPixels = 40 000 000`, тот же бюджет, что в `optimizeImage`) — единицы–десятки миллисекунд; видео — сравнение 4–12 байт, транскодирования нет. `protectedImages` POST: тот же header-разбор на одну загрузку (пользователь и так уже отдал сжатое клиентским canvas изображение). Прокси `/api/img` не изменился по стоимости.
- **Память.** Chat `finish` уже собирал `Buffer.concat` — новый код переиспользует тот же буфер (дополнительная копия не создаётся; `bytes` — та же переменная, что уходит в `file.save`). `sharp.metadata()` не декодирует пиксели, поэтому нет пикового RGBA-буфера; `limitInputPixels` закрывает decompression-bomb по размерности.
- **Firestore reads.** Не добавлено ни одного чтения: `authorizeChatMedia` и `authorizeProtectedImage` не изменялись, классификация типов работает по уже загруженным байтам.
- **Storage.** Новых объектов не появляется. Очистка временных частей выполняется и при отказе из-за неподдерживаемого объявленного типа либо несовпадения байтов; при отказе из-за некорректного `count` временные части остаются в тех же 7 слотах на аккаунт, что и раньше (перезаписываются следующей загрузкой или удаляются клиентским `DELETE`).
- **Сеть/трафик.** Клиент отклоняет неподдерживаемые файлы до первого чанка — при типичных ошибках пользователя экономится до 50 MB трафика и вызовов функции; admission-лимиты (`chat_media_* 120/мин`, `image_global_misses 120/мин`) не менялись.

## COMPATIBILITY

- **Существующие файлы.** Не изменялись, не перемещались, не удалялись; metadata (включая `firebaseStorageDownloadTokens`) не трогались, ранее выданные download URL продолжают работать.
- **LIVE participant avatars публичны** — правило `read: true` сохранено; URL-контракт (`?alt=media`) не изменился. Защищённые медиа остались защищёнными (chat — только через шлюз; TEST — только через `protectedImages`).
- **Legacy-вложения с активным содержимым.** Уже опубликованные `image/svg+xml` в `chat/*` продолжают скачиваться (совместимость), но с `Content-Disposition: attachment` и `nosniff`; UI по-прежнему растеризует их в canvas и показывает только из Blob.
- **Новые загрузки в чат**: `svg`, `gif`, `heic/heif`, `avif`, `quicktime`, `text/html`, `pdf` теперь отклоняются с прежним пользовательским сообщением «Invalid chat media format or size». Обычный сценарий не затронут: composer всегда перекодирует изображения в JPEG/PNG (canvas) и видео в WebM (MediaRecorder). Единственное изменение UX для видео: небольшой `.mov`/`.avi` больше не проходит «как есть» — он перекодируется в WebM, а при отсутствии MediaRecorder показывается уже существующее локализованное сообщение `chatCompressionUnsupported`.
- **Ссылки-вложения чата.** Легитимные `http(s)`-ссылки отображаются как раньше; значение с другой схемой больше не рендерится как ссылка (текст сообщения и имя вложения остаются видимыми). Новый чат-клиент таких значений не создаёт (`handleLinkAttach` нормализует к `https://`).
- **Админ-загрузки.** Логотипы уровней и Kaspi QR не менялись. `avatars/{uid}` — запись закрыта (текущий клиент этот путь не пишет), чтение существующих объектов сохранено. Публичные LIVE-изображения (`participant-avatars`, `courses`, `instructors`) больше не принимают GIF; все клиентские загрузчики отдают JPEG/WebP.
- **Размер изображения.** Серверная классификация отклоняет изображения с числом пикселей > 40 MP (тот же предел, что у публичного прокси). Клиентские загрузчики сжимают до ≤ 800 px, поэтому для UI это не меняется.
- **TEST Session.** Логика не менялась; общий обработчик `protectedImages` теперь классифицирует байты и для TEST-путей, но allowlist типов (`jpeg/png/webp/gif`) остался прежним, поэтому поведение TEST-загрузок, проходящих через UI, не меняется.

## DEPLOY IMPACT

- **Functions: YES** — `bookingChatMedia`, `protectedImages`, `optimizeImage` (новый общий модуль `mediaTypePolicy` входит в тот же bundle). Деплой только этих трёх имён; порядок не важен, но все три должны выйти одним релизом, иначе политика будет несогласованной.
- **Hosting: YES** — изменился клиентский bundle (`chatMediaClient`, `chatCompression`, `safeChatLink`, `ChatMessageList`, `StudentCoachPanel`), нужен `vite build` и деплой `dist`.
- **Storage Rules: YES** — `avatars/{uid}`: запись закрыта.
- **Firestore Rules: NO.**
- **Firestore Indexes: NO.**
- **Migration / изменение данных: NO** — ни документы, ни объекты Storage, ни metadata не меняются.
- **Settings / секреты / IAM / Schedulers / триггеры: NO.**

## NOT VERIFIED

- Playwright `booking-chat-media.spec.ts` на реальных эмуляторах и Chromium: изменён, но не запускался в этом окружении. Изменение статически проверено типами и `eslint`; seeding через `getStorage()` использует тот же приём, что уже применяется в этом spec (`getStorage().bucket().file(...).getMetadata()`).
- Поведение прямых Firebase Storage URL с подменённым `Content-Type` в живом браузере (Chrome/Safari/Firefox) — проверялось reviewer-агентом в Chromium (HTML под `image/png` не исполняется), без Safari/Firefox.
- Наличие активного содержимого в уже существующих production-объектах `chat/*`, `avatars/*`, `lesson-levels/*`, `kaspi-qr/*` — доступа к production-данным не было и данные не запрашивались.
- Точное поведение iOS/Safari при passthrough видеофайлов (`video/quicktime`) после изменения `compressVideo` — проверено логикой и unit-тестом, без устройства.
- `image-cache`/`/api/img`: поведение CDN-кэша Hosting при добавлении `nosniff` (заголовок не участвует в ключе кэша).

## ROLLBACK

Все изменения аддитивно-ограничивающие и не меняют данные, поэтому откат безопасен в любом порядке и не требует миграции:

1. **Functions** — вернуть предыдущую ревизию `bookingChatMedia`, `protectedImages`, `optimizeImage` (`firebase deploy --only functions:bookingChatMedia,functions:protectedImages,functions:optimizeImage`). Это единственное изменение, которое может влиять на успешность новых загрузок; делать первым, чтобы старые клиенты не получали отказов.
2. **Storage Rules** — вернуть предыдущий `storage.rules` (при этом снова откроется запись `image/.*` по `avatars/{uid}` — делать только с признанием риска).
3. **Hosting** — вернуть предыдущий `dist`.
4. Данные/TEST-состояние восстанавливать не требуется.

## NEXT STEPS (для CA-SEC-06B)

1. **Маршрутизировать `lesson-levels/*` и `kaspi-qr/*` через серверную проверку** (через `protectedImages` или отдельный upload-handler) — требует согласования изменения URL-контракта: сейчас клиент получает token-URL из `getDownloadURL()`, а функция возвращала бы публичный URL/маркер.
2. **Серверная проверка полей сообщения чата**: `attachmentUrl`/`attachmentType`/`attachmentName` не валидируются ни в `chatMessagesWrite`, ни в `firestore.rules` (см. F8). Клиентский рендер закрыт в этом срезе; серверный allowlist схемы — в следующем.
3. **Решить судьбу `image/gif` для TEST-изображений** после подтверждения использования; при отсутствии — убрать из allowlist.
4. **Усилить классификацию**: полный `sharp.stats()`-decode (с бюджетом CPU) и brand/EBML DocType-проверка видео — только при появлении подтверждённого сценария атаки.
5. **CSP для медиа-маршрутов**: добавить `Content-Security-Policy: default-src 'none'; sandbox` на ответы `bookingChatMedia`/`protectedImages` как дополнительный барьер для legacy-активных файлов.
6. **Ограничить URL-поля** `avatarUrl` / `bgImageUrl` / `promoVideoUrl` (https + наши домены/Storage-пути) — в первую очередь как защита от сторонних запросов и контента.
7. **Наблюдаемость**: счётчик отказов по типам медиа (без логирования путей и URL) для раннего обнаружения попыток обхода.
