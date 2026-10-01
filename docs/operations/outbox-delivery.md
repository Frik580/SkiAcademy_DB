# Outbox delivery

Canonical commands commit `domain_outbox` obligations in the same transaction as the business mutation. Delivery happens after that commit. The worker does not send email or SMS from inside the command transaction.

## Primary path

```text
canonical command
→ business mutation + domain_outbox intent
→ Firestore commit
→ Firestore onCreate (deliverDomainOutboxOnCreate)
→ exact-job claim of that outboxId
→ channel adapter
→ delivered / retry / dead_letter
```

`deliverDomainOutboxOnCreate` runs on `domain_outbox/{outboxId}` **created** events in `us-central1`. It calls `deliverCreatedDomainOutbox`, which calls the same `deliverOutboxObligation` engine as recovery. It does not query the queue.

Create events are not exactly-once. The transactional claim is the duplicate guard: a second trigger invocation, or a trigger racing the recovery scheduler, gets one lease and one send. Updates written by delivery itself do not re-enter this trigger.

A function failure before a successful claim throws `outbox_exact_delivery_failed` so the platform can retry. A crash after the claim leaves the lease. The lease lasts 4 minutes and is not stolen early.

## Recovery

`scheduledDeliverDomainOutbox` keeps its deployed name and is recovery-only. Cadence is every 30 minutes (`OUTBOX_RECOVERY_INTERVAL_MINUTES`). That is 48 executions per day when the queue is empty. The handler still reads at most 100 documents and claims at most 25 due transactional jobs:

- pending jobs the create trigger missed
- pending retries whose `nextAttemptAt` has passed
- leased jobs whose lease has expired

Terminal rows are not candidates. A due retry can wait until the next recovery run, so the extra delay is at most 30 minutes on top of `nextAttemptAt`. A crashed trigger is reclaimable after the 4-minute lease expires, then on the next recovery run. Cloud Tasks are not used: notification retry does not need second-level scheduling, and the happy path does not wait for the scheduler.

## Retention

`scheduledPurgeExpiredNotifications` still runs every 24 hours (1 execution per day) and also deletes terminal outbox rows:

| Status | Retention | Reason |
| --- | --- | --- |
| `delivered` | 30 days | Longer than the 14-day notification default, so delivery evidence outlives the in-app notification. |
| `dead_letter` | 90 days | Operators need the failure record after the successful-delivery window. |

`pending`, `leased`, and `suppressed` rows are never deleted. Each status is deleted in at most 5 batches of 100 documents per run. The query is status plus the terminal timestamp, then `isOutboxRetentionEligible` checks the row again before delete.

## What creates a notification

Each command's audit plan chooses the recipient reference, channel, template, and render inputs. The outbox id is `hash("outbox:v1", commandId, deliveryEffectOrdinal)`, so a replayed command does not create a second logical job.

Authenticated customer events use channel `in_app`. Guest booking and guest course events that must leave the product use channel `email`. Operational obligations, including instructor catalog image cleanup, use `deliverySemantics: operational` and are not claimed by this worker.

## What the worker sends

- `in_app` writes one `notifications/{hash("notification:v1", outboxId)}` document with Russian and English text, then marks the obligation `delivered`. A duplicate event hits the same notification id and does not create a second document.
- `email` calls the email adapter only when effective delivery is on. Otherwise the job stays `pending` and is not claimed, including from the create trigger.
- `sms` and `push` have no adapter and become `dead_letter` with `UNSUPPORTED_CHANNEL`.

Guest email is read from `guest_contacts` at send time. It is not copied onto the outbox document and is not written to worker logs. Account documents do not store an email address.

## Locale

Guest lesson booking and guest course enrollment already know the active app locale (`ru` or `en`) in the browser. That value is sent as `notificationLocale` and stored only when it is exactly `ru` or `en`:

- on the creating command's outbox `renderInputs.locale`
- on the server-only `guest_contacts.notificationLocale` document, so a later confirmation email can use it

The worker uses `renderInputs.locale` first, then the stored guest-contact locale, then bilingual text. It does not infer a language from name, phone, country, or email address. In-app notifications stay bilingual because the product stores both languages on the notification document. Authenticated commands do not have a separate persisted notification locale.

## Claim, retry, and failure

```text
email + effective delivery off -> pending (no claim, no write)
pending -> leased -> delivered
                 \-> pending       retry, with nextAttemptAt
                 \-> dead_letter   permanent failure or 5 failed send attempts
```

A claim is a transaction that sets `delivery.leaseToken` and a 4-minute lease. A second worker cannot send that job until the lease expires. After a successful provider accept, a crash before the local `delivered` write can lease the job again. The adapter must treat `outboxId` as the idempotency key. Network exactly-once delivery is not guaranteed unless the provider honors that key. This repository's unconfigured email adapter never accepts a send. The test adapter records the key and does not count a second customer message.

Retryable failures wait with bounded exponential backoff and deterministic jitter, from about one minute up to one hour, then wait for the next 30-minute recovery run. A missing guest email, unknown template, or permanent provider error becomes `dead_letter` and is not retried. An email job is not claimed, not dead-lettered, and does not consume a send attempt while effective email delivery is off. A missing provider is the same idle path: the job stays `pending` and is not marked `delivered`.

## Dead letters

Admin Issue kinds are attendance, payment, and reconciliation subjects (`booking` or `course_enrollment`) and every kind requires a coupled domain command to resolve. An outbox failure is not that subject, so the worker does not open Admin Issues.

The operational record is the `dead_letter` outbox row itself. Admin → System → Delivery failures reads at most 25 newest rows through `queryOutboxDeadLetterReadModel`. The projection is `outboxId`, template, channel, attempt count, error code, and timestamps. It does not include email, phone, message body, guest token, or credentials. One outbox id is one signal; repeating the worker does not create another row.

## Email delivery control

Admin → System → Email delivery is unchanged. The control has two independent facts:

```text
effectiveEmailDelivery = providerConfigured && emailDeliveryEnabled
```

| Provider configured | Admin enabled | Effective delivery |
| --- | --- | --- |
| no | off | off |
| no | on | off, and the enable command is rejected |
| yes | off | off |
| yes | on | on |

`providerConfigured` is derived on the server by `emailDeliveryProviderConfigured()`. It is not an admin-editable value and it is not stored in Firestore. The browser receives only the boolean. The switch does not contain credentials, and the read model does not return API keys, SMTP passwords, or secret names.

`emailDeliveryEnabled` is the admin permission to send external email. It is stored in `email_delivery_settings/email` and changes only through the admin command `set_email_delivery_enabled`. A missing document means `false`. Instructors, students, and guests cannot change it. Client Firestore writes are denied by the default rules.

While effective delivery is off, `in_app` notifications still deliver immediately. External email jobs stay `pending`. They are left out of recovery queries and the create trigger returns without a write, so a later run does not rewrite them or increase `attemptCount`. Turning delivery on does not create a second intent: the same pending job becomes eligible and the existing lease plus `outboxId` idempotency key still prevent a duplicate send.

No email provider is configured in this repository, so `providerConfigured` is false and effective delivery stays off even if a caller asks to enable it.

```text
Provider: not configured
External email delivery: off
External SMS delivery: not available
```

A future email adapter must implement `EmailDeliveryAdapter` (`isConfigured`, `send`). `send` receives `idempotencyKey` (the outbox id), `to`, `locale` (`ru`, `en`, or `bilingual`), `templateId`, `subject`, and `text`. It returns `sent` (optional `providerMessageId`), `retryable`, `permanent`, or `not_configured`. `emailDeliveryProviderConfigured()` must use that adapter without returning secret values. Do not mark `delivered` unless `send` returns `sent`. Do not put API keys in source or Firestore.

## Indexes

Recovery still needs the pending, retry, lease, and channel-filtered composites. Retention and the dead-letter list add:

- `delivery.status` + `delivery.deliveredAt.seconds` ascending
- `delivery.status` + `delivery.deadLetteredAt.seconds` ascending
- `delivery.status` + `delivery.deadLetteredAt.seconds` descending

## Access and logs

`domain_outbox` is denied to every client in Firestore Rules. Delivery runs with the Admin SDK. Worker logs may include outbox id, template, channel, attempt count, and result class. They must not include email, phone, message body, guest token, or credentials.

## Idle cost

No new outbox documents means no create-trigger executions. Remaining background work is the recovery scheduler (48 times per day) and the daily retention pass (1 time per day). A normal new event reads that one document by id.

## Local tests

```powershell
npx vitest run --config functions/vitest.config.ts functions/src/canonical/auditOutbox/outboxDeliveryWorker.test.ts functions/src/canonical/auditOutbox/outboxDeliveryTrigger.test.ts
```

Tests use an in-memory store and a fake email adapter. They do not send external messages.
