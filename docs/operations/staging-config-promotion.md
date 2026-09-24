# Staging configuration promotion

Staging (`ski-school-staging`) is a pre-production test environment. Production (`ski-school-8f3ca`) is where real business entities are created.

Real Accounts, Auth users, Instructors, Courses, CourseDays, and schedules are created directly in production through the normal Admin and canonical workflows. They are not copied between Firebase projects. Cross-project Auth identity, independent entity lifecycles, and the risk of mutating production identity or schedules are why those records stay out of promotion.

Use staging to test new code, synthetic or temporary Instructors and Courses, and booking, payment, attendance, and admin workflows. Smoke fixtures and the real staging Google owner are not configuration-promotion inputs.

## Commands

```powershell
npm run staging:export-config
# Review .staging-export/config-manifest.json. Set selected=false for a global document that should not move.
npm run prod:promote-config -- --manifest .staging-export/config-manifest.json --dry-run
$env:CONFIG_PROMOTION_ADMIN_ACCOUNT_ID = '<production-admin-account-id>'
npm run prod:promote-config -- --manifest .staging-export/config-manifest.json --apply
```

The export writes only to `.staging-export/`, which is ignored by Git. Manifest `schemaVersion` is `2`. Older business-entity manifests are rejected; re-export instead of editing one. Do not edit source payloads or hashes. `selected` may be changed before dry-run. Promotion re-exports staging and rejects a stale or altered payload.

The source and target project IDs are pinned in code and checked against the explicit CLI project, Admin app project, and ambient Firebase project settings. Conflicting IDs and emulator routing are rejected. When selected banner media exists, configure `CONFIG_PROMOTION_STAGING_STORAGE_BUCKET` and `CONFIG_PROMOTION_PRODUCTION_STORAGE_BUCKET` to that project's default Firebase Storage bucket (`<project>.appspot.com` or `<project>.firebasestorage.app`). No Firebase Auth API is created or called.

## Promotable configuration

Only these project-global documents can enter the manifest:

- `lesson_pricing_settings/lesson_booking`: `additionalParticipantSurchargePerHourKzt`, `maxParticipantsPerLesson`.
- `settings/skill_config`: `passPercentage` and the explicitly shaped catalog `items`.
- `settings/achievements_config`: the explicitly shaped achievement `items`.
- `settings/instructor_filters`: `enabled`.
- `resort_data/config`: `slides`, `slideIntervalSeconds`, and `slidesRandomOrder` only.

Resort geography, names, lift status, currency, and `resort_data/cache` are not promoted. `settings/starter_credit` and `settings/notification_retention` are real global documents and stay outside this pipeline: starter credit is a financial policy, and notification retention was not added to the allowlist.

Absence of a staging document never deletes the production document. Unknown production fields on an allowlisted document are preserved. Lesson pricing is written by canonical `update_lesson_pricing_settings`. The other allowlisted documents are merged in a transaction that rechecks the target document hash.

## Not promoted

The exporter does not read Instructors, Courses, CourseDays, or `course_catalog_content`. Their presence or absence does not change the manifest. It also never reads payload documents from Accounts/users, Participants, bookings, proposals/change requests, enrollments, Attendance, payments, wallets, monetary events, provider receipts, reviews, notifications, chats/messages, AdminIssues, activity logs, domain outbox, command idempotency, test sessions/actors, admin runtime revisions, availability blocks, resource claims/guards, or derived caches. It emits aggregate counts for those excluded collections and reads no excluded payloads.

There is no Instructor or Course ID mapping, no `productionAccountId`, and no canonical Instructor link or Course provisioning in this pipeline. `createOnly` was removed from `apply_canonical_course_provisioning_manifest` because nothing but Course promotion used it.

`link_account_instructor_catalog` still checks that the target Account matches the execution scope. `users` is outside the transaction scope stamp, so this is the canonical check that a non-LIVE Account cannot be bound to an Instructor. TEST execution of that command remains deferred. The check is independent of promotion.

## Media

Validated public `https://storage.yandexcloud.net/carve/...` URLs on resort slides are preserved, without query strings or fragments. Firebase binaries are eligible only for flat `banners/{filename}.{png|jpg|jpeg|webp}` references in resort slides. The source bucket, object path, content hash, and content type are recorded. Firebase download tokens are never put in the manifest. During apply, bytes are re-read and hash-checked, then written with a Storage generation precondition to a content-addressed `promotion-assets/config/` path. The slide reference is rewritten to that production object.

Course images, Instructor avatars, `image-cache`, customer/private media, and any other Storage path are not copied.

## Dry-run and apply safety

Dry-run is read-only. It prints deterministic `CREATE`, `UPDATE`, `UNCHANGED`, `CONFLICT`, and `SKIP` operations for global configuration and banner media, with paths, changed field names, source hashes, and current target hashes. It does not print field values, and it does not scan production Instructors or Courses.

Apply requires `--apply`, rejects any `CONFLICT` before starting, re-exports staging to detect stale input, and rechecks target preconditions before each mutation. Canonical lesson-pricing commands enforce aggregate revisions. Direct config writes compare target hashes inside their transactions. Storage writes use generation preconditions. No delete operation exists.

There is no automatic rollback. Recovery is a reviewed forward correction. Do not restore production from the staging manifest.
