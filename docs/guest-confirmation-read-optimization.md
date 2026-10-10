# Phase 1: Guest confirmation reconciliation reads

Дата локальной проверки: 2026-10-10. Ветка: `perf/guest-reconciliation-read-optimization`.

## Verdict

DONE — локальная реализация и проверка. Deployment, удалённый backfill и cutover не выполнялись.
Есть несовместимый с текущей schema сценарий guest `withdrawn`; он остаётся blocked, а не обходится.

## Root cause и архитектура

Старый scheduler каждые 5 минут начинает discovery заново: guest `bookings`
(`pending`, `cancelled`) и `course_enrollments` (`pending`, `cancelled`, `withdrawn`),
сортировка по `updatedAt`, Payment lookup, затем lookup открытого AdminIssue.
Курсоры живут только в одном вызове. Даже когда финансовой работы нет, документы читаются снова.
Аудит staging в задании: 21 subject + 21 Payment × 288 запусков = 12 096 document reads/сутки.

Источники финансовой истины остаются `payments` и неизменяемые `monetary_events`;
lifecycle — canonical Booking/CourseEnrollment. Очередь и migration control являются служебными
проекциями, не редактируют финансы и не дают клиентам mutation authority.

Исследован текущий путь:

- `financeCommands.ts`: provider payment, administrator wallet payment, price adjustment
  уже вызывают `reconcileGuestConfirmationLifecycleMismatchAfterCommand` после успеха;
  funding/price paths используют `planGuestPaymentConfirmation` в canonical transaction.
- `financeCorrectionCommands.ts`: финансовая коррекция/rebuild также вызывают этот helper.
  Он повторно проверяет Payment/subject/AdminIssue в transaction и вызывает
  `record_audit_correction` с `operation: reconcile_payment`. Существующий idempotency key
  зависит от Payment, subject и issue revisions. Эти проверки и команды не изменены.
- `guestBookingCommands.ts`, `guestBookingCancellation.ts`, booking cancellation и
  `courseEnrollmentLifecycleCommands.ts` сохраняют canonical lifecycle и финансовые gates.
  Document triggers покрывают их committed writes, включая смешанный порядок доставки событий.
- `domain_outbox` обслуживает доставку уведомлений; Attendance/outcome work collections
  обслуживают другие факты и deadlines. Расширение их финансовым discovery создало бы
  смешанный lifecycle, поэтому новая очередь повторяет существующий server-side work pattern.
- Detector учитывает не только записи Payment/subject, но и expiry, service start, Course lifecycle/start.
  Сроки планируются в work; изменение Course без события subject обнаруживается recovery.

BEFORE: scheduler → повторный guest sweep → Payment/issue lookup → canonical helper.

AFTER, после явного cutover: committed subject/Payment write → sync текущих источников →
детерминированный work по Payment ID → bounded due worker → тот же canonical helper.
Отдельный bounded recovery постепенно покрывает все guest subjects, включая исторические.
До cutover scheduler продолжает BEFORE.

## Очередь и recovery

`guest_confirmation_reconciliation_work/{paymentId}` хранит fingerprint, generation,
`pending/complete/blocked`, attempts, `nextAttemptAtMs`, token и lease expiry.
Due query: `status in [pending, blocked]`, `nextAttemptAtMs <= now`,
`orderBy(nextAttemptAtMs)`, `limit(25)`. Complete не попадает в query.

Sync читает актуальные Payment и subject в transaction; event payload используется только для routing.
Повторные и устаревшие события не сбрасывают complete/backoff, если fingerprint не меняется.
Fingerprint покрывает canonical revisions, funding, lifecycle, сроки и зависимый Course.
Claim lease — 10 минут. Финализация проверяет token, generation и повторно читает источники:
изменение до доставки триггера тоже сохраняет pending work. Падение после команды повторяет
существующий идемпотентный command после истечения lease.

Retry: 30 секунд, 1, 2, 4, 8, 16, 32 минуты; после 8-й ошибки — blocked с дневной попыткой.
Scheduler остаётся каждые 5 минут, поэтому короткие задержки выполняются ближайшим запуском.
Новая source revision снимает backoff. Recovery и дубликаты не сбрасывают его.
Aligned funded pending work ожидает ближайшего срока, не опрашивается каждые 5 минут.
Already-open issue считается завершённым финансовым discovery; recovery может перепроверить
его, чтобы закрытие issue без изменения subject не скрывало старое несоответствие.

`migration_control/guest_confirmation_reconciliation_v1` хранит два независимых набора
курсоров (backfill/recovery), epoch, readiness evidence и recovery lease.
Recovery раз в 6 часов читает до 25 guest subjects из каждой коллекции,
сортируя по стабильному document ID. Курсор обновляется только после успешного sync всей страницы.
После полного прохода начинается следующий цикл. Нет ограничения возраста данных и full drain
в одном scheduled запуске. Изменение `updatedAt` не перемещает документ относительно курсора;
новые IDs позади курсора покрываются событием либо следующим полным циклом.
При большом объёме период полного покрытия растёт с количеством страниц — это явное ограничение.

Epoch/token CAS не позволяет старому recovery сдвинуть курсор после takeover/restart.
После сбоя страницы lease истекает, и предыдущий диапазон повторяется идемпотентно.
Runtime recovery failure логируется счётчиком и не мешает worker обработать due work.

Невалидный `paymentId` сохраняется в `guest_confirmation_reconciliation_quarantine`;
обход остальных диапазонов продолжается. Quarantine запрещает cutover. Исправленные markers
удаляются с transaction check актуального ID. Отдельный bounded repair с ID cursor поддерживает
исправленные/удалённые subjects; он изменяет только metadata. Invalid source/work и scope failures
остаются blocked с ограниченным retry, не вызывают финансовую команду и не блокируют весь batch.
LIVE queue не принимает TEST data. Доступ клиента к новым коллекциям запрещён существующим
Firestore default deny; Rules не менялись.

## Cutover и rollback

Миграция — отдельная операция с отдельным разрешением. Пустая очередь не доказывает readiness.

1. Развернуть индексы и дождаться READY/Enabled.
2. Развернуть три document triggers и обновлённый scheduler. Control ещё отсутствует/legacy:
   старый sweep продолжает работать, а triggers создают work.
3. Проверить реально развёрнутые версии, retry configuration и доставку событий Booking,
   CourseEnrollment, Payment. Зафиксировать deployment/index evidence вне логов с PII.
4. Выполнить bounded dry-run. Явно начать backfill; выполнять `page` до `backfillPass = 2`.
   Каждый вызов ограничен 25 + 25 subjects, курсоры сохранены между отдельными процессами.
   Два прохода материализуют и повторно сверяют work. Невалидные источники не считаются чистым переносом:
   blocked work/quarantine остаются gates даже при завершённых проходах.
5. Исправить найденные источники только через разрешённые canonical/repair workflows.
   Metadata repair не редактирует financial statuses. Повторить проверки доставки и counters.
6. Явный `cutover` требует epoch, два завершённых прохода, отсутствие активного migration lease,
   blocked work/quarantine и отдельное readiness evidence. Только он записывает mode=queue.
   Scheduler и events никогда автоматически не создают ready marker.
7. При проблеме `rollback` возвращает mode=legacy. Очередь, quarantine, epoch и курсоры сохраняются.
   Перед повторным переходом после rollback старого бинарного deployment использовать `restart`:
   новый epoch и два новых прохода, без удаления financial work. Старое доказательство не проходит gate.

Deployment evidence проверяет оператор; CLI не доказывает активность remote triggers через Cloud API.
Перед cutover это обязательный внешний gate, а не обещание, выведенное из пустой очереди.

Новый составной индекс нужен только очереди: `status ASC, nextAttemptAtMs ASC`.
Recovery использует автоматический ascending индекс `attribution.bookingOrigin`, который
уже сортирует равные значения по `__name__ ASC`; дополнительных составных индексов
для этого запроса не требуется согласно [правилам индексации Firestore](https://firebase.google.com/docs/firestore/query-data/index-overview#default_ordering_and_the_name_field).
Перед cutover проверить, что remote single-field exemptions не отключили индексацию
`attribution.bookingOrigin` (в репозитории таких exemptions нет).

Подготовленные PowerShell команды ниже **не выполнялись**. Использовать после отдельного разрешения:

```powershell
firebase deploy --project ski-school-staging --only firestore:indexes
# Дождаться READY/Enabled нового индекса очереди; проверить автоматические origin индексы.
firebase deploy --project ski-school-staging --only "functions:syncGuestBookingConfirmationWork,functions:syncGuestEnrollmentConfirmationWork,functions:syncGuestPaymentConfirmationWork,functions:scheduledReconcileGuestConfirmationMismatches"
npm run build:functions
node functions/scripts/guestConfirmationQueueMigration.cjs --project ski-school-staging --action dry-run
node functions/scripts/guestConfirmationQueueMigration.cjs --project ski-school-staging --action begin --apply --evidence "verified deployment and enabled indexes"
node functions/scripts/guestConfirmationQueueMigration.cjs --project ski-school-staging --action page --apply
# Повторять отдельные page вызовы до backfillPass=2; после сбоя продолжать сохранённые курсоры.
node functions/scripts/guestConfirmationQueueMigration.cjs --project ski-school-staging --action status
node functions/scripts/guestConfirmationQueueMigration.cjs --project ski-school-staging --action cutover --apply --epoch "epoch from status" --evidence "independent readiness verification"
# Rollback, если понадобится:
node functions/scripts/guestConfirmationQueueMigration.cjs --project ski-school-staging --action rollback --apply
node functions/scripts/guestConfirmationQueueMigration.cjs --project ski-school-staging --action restart --apply --evidence "verified redeployment after rollback"
```

Dry-run cursor: `--after-booking` / `--after-enrollment` из `nextCursors` предыдущей страницы.
Quarantine repair: `--action repair --apply`, затем `--after-quarantine` из `nextCursor`;
неисправленные первые markers не скрывают следующие страницы.

## Production rollout: отдельная операторская процедура

Подготовлено 2026-10-10 в `chore/guest-reconciliation-prod-rollout`. Следующие сведения предоставлены
владельцем и не являются новой remote-проверкой: staging завершил два прохода и cutover;
production `ski-school-8f3ca` имеет четыре Functions, provenance PASS для
`b335d934266c6e8641dca2f47304317c2cb40e3e`, scheduler работает в `legacy_sweep`.
Старая секция локального verdict выше описывает исходный implementation slice.
Production migration/deploy в этом подготовительном slice не выполнялись.

Пустота `payments` сообщена владельцем, отдельно здесь не проверялась. Она не доказывает отсутствие
исторических guest `bookings`/`course_enrollments`, blocked work или quarantine. Все gates обязательны
даже при пустых платежах. Dry-run проверяет subjects, а не доказывает пустоту коллекции `payments`.

### 1. Preflight и независимое deployment evidence

Работать из `D:\SkiAcademy_DB` в новой чистой операторской PowerShell-сессии с ADC и нужными IAM правами.
Перед любым подключением CLI проверяет точный `--project`, `--allow-production` и
`--confirm-project ski-school-8f3ca`. Любая мутация дополнительно требует `--apply`.
Это относится также к `repair`, `rollback`, `restart`; автоматического cutover/цикла страниц нет.
Не использовать aliases `prod`/`staging`, повторные, неизвестные аргументы или сокращённые project IDs.

Проверить переменные без вывода credentials:

```powershell
Set-Location D:\SkiAcademy_DB
Get-ChildItem Env: | Where-Object { $_.Name -match 'EMULATOR|^FIRESTORE_HOST$' } | Select-Object Name
# Результат должен быть пустым, включая переменные с пустым значением.
Get-Item Env:GCLOUD_PROJECT,Env:GOOGLE_CLOUD_PROJECT,Env:GCP_PROJECT -ErrorAction SilentlyContinue
# Каждый установленный project hint должен точно равняться ski-school-8f3ca.
# FIREBASE_CONFIG должен отсутствовать либо содержать inline JSON с соответствующим projectId.
# Пути к config-файлам в FIREBASE_CONFIG в production запрещены.
npm run build:functions
if ($LASTEXITCODE -ne 0) { throw 'Functions build failed' }
$prodArgs = @('--project', 'ski-school-8f3ca', '--allow-production', '--confirm-project', 'ski-school-8f3ca')
```

Не обходить отказ сменой target на staging/demo. Удалять конфликтующие переменные только после
проверки их назначения или открыть чистую сессию. CLI явно инициализирует отдельный Admin app
с project ID и проверяет project ID app и Firestore до первого запроса; `.firebaserc` не используется.
Project ID credential/quota project сам по себе не является target; права ADC проверяются сервером.

Вне CLI повторно проверить реально установленные версии
`syncGuestBookingConfirmationWork`, `syncGuestEnrollmentConfirmationWork`,
`syncGuestPaymentConfirmationWork`, `scheduledReconcileGuestConfirmationMismatches`;
provenance/commit, trigger bindings для правильного project/database, retry и доставку всех трёх
типов событий по staging evidence и доступным production logs. Проверить scheduler и отсутствие
ошибок индексов. Новый work index `status ASC, nextAttemptAtMs ASC` должен быть READY/Enabled;
origin ascending indexes для обеих subject-коллекций не должны быть выключены exemptions.
Пустая очередь и deploy success этого не доказывают. Evidence — ссылка на независимый проверяемый
отчёт/логи с временем и project ID, без PII; непустая строка CLI не заменяет проверку.

### 2. Read-only dry-run и status

```powershell
node functions/scripts/guestConfirmationQueueMigration.cjs @prodArgs --action status
node functions/scripts/guestConfirmationQueueMigration.cjs @prodArgs --action dry-run
# При необходимости посмотреть следующий диапазон отдельно:
node functions/scripts/guestConfirmationQueueMigration.cjs @prodArgs --action dry-run --after-booking '<nextCursors.bookings.after>' --after-enrollment '<nextCursors.course_enrollments.after>'
```

Использовать только непустые cursors для streams с `done=false`, опуская законченные/пустые параметры.
Dry-run не пишет control/work/quarantine и не продвигает durable cursors. Он ограничен 25 guest
subjects каждой коллекции, сообщает `quarantined` при невалидном Payment ID; финансовую полноту
и отсутствие blocked work не устанавливает. Если control уже существует, dry-run начинает с
его backfill cursors; завершённые streams без override не перечитывает.
`status` читает один control doc и две query с `limit(1)` — blocked work и quarantine;
показывает `backfillPass`, epoch, cursors, lease, evidence и точный project ID.
Поле `ready` означает только наличие сохранённого evidence и может оставаться true после rollback.

### 3. Явный begin, затем отдельные page-вызовы

Каждую следующую изменяющую команду запускать только после отдельного разрешения на production migration.
Команды ниже подготовлены и **не выполнялись**:

```powershell
node functions/scripts/guestConfirmationQueueMigration.cjs @prodArgs --action begin --apply --evidence '<deployment/index/trigger evidence reference>'
node functions/scripts/guestConfirmationQueueMigration.cjs @prodArgs --action page --apply
node functions/scripts/guestConfirmationQueueMigration.cjs @prodArgs --action status
# Повторять page вручную отдельным процессом, проверяя exit code и status, до backfillPass=2.
```

`begin` не перезаписывает существующий control. При существующем backfill продолжать `page`.
Страница ограничена 25 + 25 guest subjects с ID ordering и durable cursors: это полный обход
guest-диапазонов за несколько вызовов, не полный drain за один вызов. Два прохода обязательны.
Повторная `page` после двух проходов — no-op; она не включает queue. При ошибке остановить процедуру,
проверить status, дождаться истечения lease (10 минут) и продолжить сохранённый cursor.
Не удалять control, не сбрасывать lease вручную и не запускать параллельные операторы.
Backfill пишет только queue/quarantine/control metadata; финансовые документы не редактирует.

### 4. Проверки непосредственно перед cutover

- Точный production project ID во всех evidence/выводах, четыре Functions и provenance проверены;
  три triggers установлены с правильными bindings/retry, подтверждена доставка, индексы Enabled.
- Текущий epoch взят из свежего status; `backfillPass=2`, обе передачи завершены без скрытых ошибок.
- `leaseToken=null`, нет активного lease; `blockedWork=false`, `quarantine=false`.
  Исправление источников — только отдельно разрешёнными canonical workflows, без обхода финансовых gates.
- После разрешённого исправления источников при необходимости выполнить bounded metadata `repair`:
  `node functions/scripts/guestConfirmationQueueMigration.cjs @prodArgs --action repair --apply`;
  следующие страницы — отдельно с `--after-quarantine '<nextCursor>'`. Repair не исправляет financial statuses.
- Независимое актуальное readiness evidence отдельно от deployment evidence; проверены logs/counters,
  определены наблюдение после cutover, ответственный оператор и возможность rollback.

```powershell
$status = node functions/scripts/guestConfirmationQueueMigration.cjs @prodArgs --action status | ConvertFrom-Json
if ($LASTEXITCODE -ne 0) { throw 'Status failed' }
if ($status.projectId -ne 'ski-school-8f3ca' -or $status.backfillPass -ne 2 -or $status.leaseToken -or $status.leaseUntilMs -gt [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() -or $status.blockedWork -or $status.quarantine) { throw 'Not ready for cutover' }
# Только после независимой проверки и отдельного разрешения:
node functions/scripts/guestConfirmationQueueMigration.cjs @prodArgs --action cutover --apply --epoch $status.epoch --evidence '<independent readiness evidence reference>'
node functions/scripts/guestConfirmationQueueMigration.cjs @prodArgs --action status
```

Cutover повторно проверяет gates транзакционно, включая epoch, два прохода, lease token,
blocked work и quarantine. Старый epoch или пустое evidence не принимается.
После cutover проверить `mode=queue`, `candidateSource=queue` в следующем scheduler run
(каждые 5 минут), ошибки/retries/blocked work и финансовые reconciliation результаты.
Recovery — по одной bounded странице каждой коллекции раз в 6 часов. Не ждать no-op scheduler как
доказательства доставки событий и не генерировать реальные платежи только для проверки rollout.

### 5. Rollback и restart — отдельные команды

```powershell
# При подтверждённой проблеме queue:
node functions/scripts/guestConfirmationQueueMigration.cjs @prodArgs --action rollback --apply
node functions/scripts/guestConfirmationQueueMigration.cjs @prodArgs --action status
# Проверить mode=legacy и candidateSource=legacy_sweep на следующем scheduler run.
# После исправления/проверенного redeployment, legacy mode и отсутствия активного lease:
node functions/scripts/guestConfirmationQueueMigration.cjs @prodArgs --action restart --apply --evidence '<verified redeployment after rollback>'
node functions/scripts/guestConfirmationQueueMigration.cjs @prodArgs --action page --apply
node functions/scripts/guestConfirmationQueueMigration.cjs @prodArgs --action status
# Вручную завершить два НОВЫХ прохода; повторить все gates и cutover с НОВЫМ epoch/evidence.
```

Rollback сохраняет очередь, quarantine, cursors, epoch, evidence; financial effects уже выполненных
canonical commands не отменяет. Triggers продолжают работать, следующий scheduler выбирает legacy;
уже начатый queue run может завершиться. Restart создаёт новый epoch и обнуляет backfill readiness,
не удаляя work/финансовую историю. После возврата старого бинарного deployment повторный переход
обязательно проходит verified redeployment, restart и два новых прохода.
Не откатывать бинарный deployment с `mode=queue`; сначала control rollback и проверка scheduler.

Локальные повторяемые проверки (не production):

```powershell
node --test functions/scripts/guestConfirmationQueueMigration.test.cjs
npx firebase emulators:exec --project demo-ski-school-e2e --only firestore "node --test functions/scripts/guestConfirmationQueueMigration.emulator.test.cjs"
```

Этот slice не меняет Functions handlers, Rules, indexes, payment schemas или canonical commands;
deploy не нужен. При последующем rollout изменяется только metadata в трёх server-only collections.
Риски: исторические повреждённые subjects/отсутствующие Payment, потерянная доставка, незавершённый
lease и устаревшее evidence. Они не обходятся из-за пустых платежей; при проблеме — остановить
страницы/cutover, проверить sources/gates и при queue mode выполнить явный rollback.

## BEFORE / AFTER: измерения

Это счётчики запросов document reads и возвращённых query documents, включая transaction retries
в соответствующих counters; не точная стоимость биллинга. Пустые queries, index-entry reads,
доставка trigger snapshots, записи и RPC с ошибкой не оцениваются как billed document reads.
`canonicalDocsRead` отдельно считает операции существующей финансовой команды.
Числа ниже не суммируют один canonical read дважды.

| Сценарий | BEFORE | AFTER |
| --- | --- | --- |
| Пустой набор / пустая готовая очередь | 0 returned subject/Payment docs, 5 discovery queries | 1 control doc + 1 empty due query; 0 source docs |
| 21 неизменённый неоплаченный subject + 21 Payment, обычный запуск | 42 document reads | 1 control doc; 0 work/subject/Payment docs |
| Один новый funded cancelled Booking, fixture с 1 monetary event | Снова сканирование набора, затем issue/command reads | 3 sync reads + 7 worker orchestration + 11 canonical + 1 scheduler control = 22 |
| Recovery этих 21 неизменённых subjects | Те же 42 каждые 5 минут | 21 discovery + 21 work + 21 current subject + 21 Payment + 3 control = 87 раз в 6 часов |
| Дубликат event для complete Booking | Следующий sweep снова сканирует набор | 3 sync reads; 0 writes и 0 subsequent worker reads |
| Transient retry, mock команды | Нет отдельного work backoff | 7 orchestration reads на attempt; 0 до due, плюс фактические command reads |
| После успешного завершения | Subject/Payment снова читаются sweep | Complete исключён из due query; проверяется только bounded recovery |

Для 21 неизменённого неоплаченного Booking без новых событий и при четырёх recovery за сутки:
`288 × 1 + 4 × 86 = 632` инструментированных document-read операций/сутки вместо 12 096
(около 94,8% сокращения по этому счётчику). 86 — дополнительные recovery reads поверх обычного
control read. Это расчёт по измеренным fixture counters, не новый 24-часовой audit staging.
Empty query billing и index-entry billing в процент не входят. Backfill/trigger writes — отдельный расход.

**Верхняя граница discovery/orchestration, без callback retries и command history:**
обычный запуск ≤226 returned/requested docs (25 works, максимум Course-dependent source checks);
с recovery ≤478 без quarantine либо ≤578 при 50 repaired quarantine markers.
Recovery ограничен 50 subjects; worker — 25 payments. Это не глобальный scans/drain.
Firestore transaction callback retries повторяют чтения и отражаются в counters.

**Полная граница:** `orchestration + C`, где C измеряется `canonicalDocsRead`.
Существующий `loadMonetaryEventsInTransaction` читает Payment-specific `monetary_events` history
без фиксированного query limit. Поэтому абсолютного постоянного потолка всех reads нет;
размер C зависит от истории и retries. Финансовая история намеренно не обрезана ради экономии.
Её оптимизация требует отдельного canonical infrastructure slice. В проверенном single-event fixture C=11.

## Проверки и изменённые файлы

PASS: 23 Functions unit checks (queue policy, original sweep, finance correction),
17 index-contract checks, 24 new Firestore Emulator integration checks,
10 original sweep Emulator checks, 14 finance correction Emulator checks.
Firestore Emulator wrapper завершился с code 0 и остановил свои процессы.
PASS: Functions build/provenance, targeted lint, independent review после исправлений.
Lint: 0 errors; 1 существующее Prettier warning в неизменённой строке index-contract test.
PASS: `graphify update .` (14 789 nodes, 42 680 edges); product source остаётся authority.
Remote tests и migration: NOT RUN. Browser verification не требуется для backend-only изменения.

Новые source файлы: `guestConfirmationWork.ts`, `guestConfirmationRecovery.ts`,
`guestConfirmationScheduler.ts` в `functions/src/canonical/guestConfirmation/`.
Новые unit/Emulator tests рядом; migration CLI — `functions/scripts/guestConfirmationQueueMigration.cjs`.
Изменены `functions/src/index.ts`, `firestore.indexes.json`,
`tests/unit/firestoreIndexContracts.test.ts`; исходный sweep и canonical financial commands сохранены.
Эта документация содержит migration/deployment plan и локальные measurements.

Independent review выявил и закрыл invalid-source completion, poison-subject recovery starvation
и quarantine repair pagination. Повторно проверены только исправленные рискованные участки.

## Реальные ограничения и server impact

- Guest CourseEnrollment `withdrawn` запрещён текущей `CourseEnrollmentSchema`.
  Такой повреждённый документ остаётся blocked; cutover запрещён до исправления.
  Изменение этой product policy не реализовано. Valid `cancelled` проверен реальной canonical командой.
- Полное recovery покрытие большого набора занимает несколько 6-часовых страниц.
  Сроки work остаются независимыми от recovery; Course-only changes и полностью потерянные события
  зависят от этого покрытия. Recovery период и batch bound — явная конфигурация этой реализации.
- Полного постоянного read ceiling для canonical monetary history нет (см. C выше).
- Сохранённые complete fingerprints/metadata растут с processed funded subjects;
  destructive retention не добавлена, чтобы не терять deduplication/recovery evidence.

| Поверхность | Impact |
| --- | --- |
| Functions | Новые `syncGuestBookingConfirmationWork`, `syncGuestEnrollmentConfirmationWork`, `syncGuestPaymentConfirmationWork`; изменён `scheduledReconcileGuestConfirmationMismatches` |
| Hosting | NO |
| Firestore Rules | NO; новые server-only collections покрыты default deny |
| Firestore Indexes | YES: один новый составной индекс work status/time; recovery использует автоматические origin индексы |
| Migration/Data migration | YES: отдельный bounded metadata backfill/cutover; не выполнен |
| Settings/manual setup | YES: deployment evidence, control epoch, explicit readiness gate |
| Schedulers/triggers | Existing scheduler остаётся every 5 minutes; 3 новых document triggers; bounded recovery запускается внутри scheduler раз в 6 часов |

Следующее отдельное действие: разрешить staging deployment индексов/четырёх Functions,
проверить deployed triggers, затем отдельно разрешить bounded migration и ручной cutover.
