# CA-SEC-07D — Production Release Plan

**Статус: ПЛАН НА СОГЛАСОВАНИЕ. Не выполнен.** Основание: [CA-SEC-07D-final-security-audit.md](CA-SEC-07D-final-security-audit.md). Каждый раздел ниже выполняется только после явного разрешения владельца. Все команды — PowerShell из корня `D:\SkiAcademy_DB`, Firebase project указан явно.

## 1. Состав релиза

| Поверхность | Было (production) | Станет |
| --- | --- | --- |
| Commit | `14695f71ef93c95d7131493d5c002c9fc323a16d` | `<RELEASE_SHA>` = `main` после исправления 07D-03 (или `20413eb0`, если владелец явно принимает риск 07D-03) |
| Functions | 55, все `14695f71` | 67: +12 новых, 55 обновлённых, удалений нет |
| Новые Functions | — | `protectedImages`, `chatMessagesStream` (HTTP); `queryScopedClientDocuments`, `queryChatMessages`, `mutateChatMessage`, `revokeOwnAdministratorSessions` (callable); `syncClientInstructorSignal`, `syncClientCourseSignal`, `syncClientCourseContentSignal`, `syncClientUserSignal`, `syncClientNotificationSignal`, `syncClientActivitySignal` (Firestore triggers, `eur3`) |
| Изменение ресурсов | `optimizeImage` concurrency 80 | 4 (из кода) |
| Firestore Rules | sha256 `67b3f515…` (ruleset `621b219b-01bd-4a23-abfa-e19d9e8718e1`) | sha256 `firestore.rules` из `<RELEASE_SHA>` |
| Storage Rules | sha256 `b9c73ee6…` (ruleset `cef9700f-a71a-4994-bfe9-67219d6fae00`) | sha256 `storage.rules` из `<RELEASE_SHA>` |
| Hosting `ski-school-8f3ca` | version `11beb5df338530da` | новая сборка `build:prod` |
| Hosting `carveacademy` | version `c192bf56498d0e4a` | clone primary |
| Indexes / TTL / Schedulers | — | **Без изменений.** Три TEST-only индекса DEFERRED |
| Secrets / IAM | `GUEST_ACTION_TOKEN_SECRET@1`; Compute SA Editor | Без изменений |
| Settings / data | `settings/starter_credit.amountKzt=0` | Без изменений. Staging settings и banners не переносить, `prod:promote-config` не запускать |

**Запрещено в этом релизе:** `npm run deploy:prod:full` и `firebase deploy` без `--only` (включает indexes), `--only firestore` (включает indexes), удаление функций, изменение App Check enforcement, MFA, IAM, секретов.

## 2. Предварительные условия (stop, если не выполнено)

1. Закрыт B1 (07D-03) — исправление влито в `main`, тесты PASS — либо есть письменное принятие риска владельцем.
2. Staging развёрнут из `<RELEASE_SHA>`, staging smoke (аудит §24) PASS, включая S13 (реальный Google step-up) и S15 (отзыв сессий).
3. B3 частично: включены delete protection и PITR, создан ручной backup или export непосредственно перед релизом (раздел A). Полный drill может идти параллельно, но до публичного запуска.
4. B6: хеш production `GUEST_ACTION_TOKEN_SECRET` не совпадает с хешем `functions/.secret.local` (сравнение выполняет владелец, значения не выводятся).
5. Рабочее дерево чистое, `HEAD == origin/main == <RELEASE_SHA>`.
6. Окно низкой активности; второй администратор доступен.

```powershell
git status --short
```
```powershell
git rev-parse HEAD
```
```powershell
gh api repos/Frik580/SkiAcademy_DB/commits/main --jq .sha
```
```powershell
npm ci --ignore-scripts; npm --prefix functions ci --ignore-scripts
```
```powershell
npm run test:quick
```
```powershell
npm run build:functions
```
```powershell
npm run test:manifest
```

Если окружение не доверяет TLS-цепочке (как в аудите), использовать системное хранилище сертификатов: `$env:NODE_OPTIONS='--use-system-ca'` для Firebase CLI и `CLOUDSDK_CORE_CUSTOM_CA_CERTS_FILE` для gcloud. Проверку не отключать.

## A. Резервная копия до релиза (отдельное разрешение)

```powershell
gcloud firestore databases update --database="(default)" --delete-protection --project ski-school-8f3ca
```
```powershell
gcloud firestore databases update --database="(default)" --enable-pitr --project ski-school-8f3ca
```
```powershell
gcloud firestore backups schedules create --database="(default)" --recurrence=daily --retention=14d --project ski-school-8f3ca
```
```powershell
gcloud firestore export gs://carveacademy-firestore-backups-782358732601/prod-before-ca-sec-07d-release-$((Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ')) --database="(default)" --project ski-school-8f3ca
```

Проверка: `gcloud firestore databases describe --database="(default)" --project ski-school-8f3ca --format="value(pointInTimeRecoveryEnablement,deleteProtectionState)"` → `POINT_IN_TIME_RECOVERY_ENABLED DELETE_PROTECTION_ENABLED`. Export завершился `SUCCESSFUL` (`gcloud firestore operations list --project ski-school-8f3ca`).

Также сохранить идентификаторы текущих rulesets и Hosting versions (уже зафиксированы в §1).

## 3. Последовательность deployment

Порядок: **Functions → Firestore Rules → Storage Rules → Hosting primary → проверка → clone carveacademy.** Шаги 3.2–3.4 выполняются сразу друг за другом.

Обоснование:

- Новый клиент требует новых Functions (`queryScopedClientDocuments`, `queryChatMessages`, `protectedImages`, `chatMessagesStream`). Поэтому Hosting идёт только после Functions.
- Новые Rules закрывают прямые пути, которыми пользуется старый клиент (например, `avatars/{uid}`, прямое удаление `error_logs`). Поэтому промежуток между Rules и Hosting должен быть минимальным.
- Старый клиент с новыми Functions работает в пределах прежних контрактов. Ужесточённые политики CA-SEC-03/04 могут отклонять отдельные некорректные вызовы старого клиента — это ожидаемо.
- Альтернатива (Functions → Hosting → Rules) оставляет старые разрешительные Rules на минуты при новом клиенте. Её выбирают, только если staging-репетиция покажет, что новый клиент работает со старыми Rules. Без репетиции не использовать.

Оставшийся риск: открытые вкладки старого клиента до перезагрузки. `index.html` отдаётся с `no-cache`, поэтому достаточно перезагрузки страницы.

### 3.1 Functions

```powershell
npm run deploy:functions:prod
```

Эквивалент: `firebase deploy --project prod --only functions` с проверкой provenance (`scripts/runReleaseCommand.mjs functions:prod`). На вопрос CLI об удалении функций отвечать **No**. Удалений по manifest быть не должно.

Проверка:

```powershell
gcloud functions list --project ski-school-8f3ca --v2 --format="csv[no-heading](name.basename(),labels.commit_sha,state)" | Sort-Object
```

Ожидается 67 строк, все `<RELEASE_SHA>`, `ACTIVE`. `optimizeImage` concurrency 4:

```powershell
gcloud run services describe optimizeimage --region us-central1 --project ski-school-8f3ca --format="value(spec.template.spec.containerConcurrency)"
```

Стоп-условия: любая функция не `ACTIVE`; ошибки Eventarc при создании шести новых triggers; рост 5xx в Cloud Logging за 5 минут. Действие: не продолжать к Rules, разобрать или откатить Functions (раздел 5).

### 3.2 Firestore Rules

```powershell
npm run deploy:rules:prod
```

(`firebase deploy --project prod --only firestore:rules` — без indexes.)

### 3.3 Storage Rules

```powershell
npx firebase deploy --project prod --only storage
```

Проверка 3.2–3.3: активные rulesets совпадают с файлами `<RELEASE_SHA>` (тот же метод хеширования, что в аудите, §5), в Console нет compile warnings.

### 3.4 Hosting

```powershell
npm run deploy:prod
```

Скрипт выполняет `build:prod`, deploy на `ski-school-8f3ca`, проверку provenance и `firebase hosting:clone ski-school-8f3ca:live carveacademy:live --project ski-school-8f3ca`. При сообщении «Partial production release» — стоп: `carveacademy` остаётся на старой версии, разобрать до повторной попытки.

Опционально до сборки (07D-07): добавить `VITE_APPCHECK_RECAPTCHA_ENTERPRISE_SITE_KEY` production в `.env.production.local` (не коммитить) после регистрации Web App в App Check. Enforcement не включать.

Проверка:

```powershell
foreach ($u in 'https://ski-school-8f3ca.web.app/build-info.json','https://carveacademy.web.app/build-info.json') { Invoke-RestMethod $u | ConvertTo-Json -Compress }
```

Ожидается `commitSha=<RELEASE_SHA>`, `dirty=false`, `firebaseProjectId=ski-school-8f3ca` на обоих сайтах.

```powershell
npm run deploy:verify
```

## 4. Production smoke (после 3.4, без изменения чужих данных)

Выполняют владелец или QA собственными тестовыми аккаунтами в production. Сценарии, создающие записи, — по согласованию.

1. Публичные страницы и каталог курсов и инструкторов на обоих доменах, RU/EN, mobile и desktop.
2. Вход email/password и Google тестовым учеником; кабинет ученика; выход; вход другим аккаунтом — данных первого нет.
3. Кабинет инструктора (тестовый): уроки, чат.
4. Админ-кабинет: каталоги без step-up; одна критическая операция на тестовом аккаунте (например, проверка Kaspi review в режиме no-op, если доступна) с Google и password step-up.
5. Чат: сообщение и изображение; SSE обновляет.
6. `/api/img` для одного публичного изображения: `image/webp`, `nosniff`.
7. Cloud Logging, 30 минут: нет всплеска `permission-denied`/5xx у callables; schedulers выполняются.
8. Firestore Console: `settings/starter_credit.amountKzt` = 0.

Стоп-условие: массовые отказы легитимных путей или ошибки денег → раздел 5.

## 5. План отката

Правила: откатывать в обратном порядке (Hosting → Rules → Functions). Серверную авторизацию не отключать. Данные откатом кода не восстанавливаются — только через PITR/backup (раздел A). Отозванные refresh tokens не восстанавливаются.

**Hosting (оба сайта):**

```powershell
npx firebase hosting:clone ski-school-8f3ca@11beb5df338530da ski-school-8f3ca:live --project ski-school-8f3ca
```
```powershell
npx firebase hosting:clone carveacademy@c192bf56498d0e4a carveacademy:live --project ski-school-8f3ca
```

Либо Firebase Console → Hosting → Release history → Rollback для каждого сайта. Проверка: `build-info.json` = `14695f71`.

**Firestore и Storage Rules:** Firebase Console → Rules → History → выбрать ruleset `621b219b-…` (Firestore) и `cef9700f-…` (Storage) → Publish. Либо из worktree:

```powershell
git worktree add ..\SkiAcademy_rollback 14695f71
```
```powershell
Set-Location ..\SkiAcademy_rollback; npx firebase deploy --project ski-school-8f3ca --only firestore:rules,storage
```

Внимание: это вновь открывает исправленные P1 (06A, 05B). Применять только при массовом отказе легитимных путей.

**Functions:** из того же worktree после `npm ci`:

```powershell
npx firebase deploy --project ski-school-8f3ca --only functions
```

На вопрос CLI об удалении 12 новых функций отвечать **No**: они не мешают старому клиенту. Проверка: `commit_sha` = `14695f71` у 55 функций.

**Данные:** при ошибочных финансовых изменениях — компенсирующие канонические команды; при повреждении — PITR clone в `restore-drill-*` и точечный перенос (аудит §18).

## 6. Журнал релиза (заполнить)

| Шаг | Время UTC | Исполнитель | Результат | Примечание |
| --- | --- | --- | --- | --- |
| Предусловия 1–6 | | | | |
| A. Backup/PITR/export | | | | |
| 3.1 Functions | | | | |
| 3.2 Firestore Rules | | | | |
| 3.3 Storage Rules | | | | |
| 3.4 Hosting ×2 | | | | |
| 4. Smoke | | | | |
