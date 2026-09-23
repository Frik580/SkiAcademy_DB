# Staging configuration promotion

Staging (`ski-school-staging`) is the configuration authoring environment. Production (`ski-school-8f3ca`) receives reviewed, selected configuration through a local manifest. Export and dry-run are read-only. Applying requires `--apply`, fresh source data, a conflict-free plan, an active production administrator Account, and per-operation target preconditions.

## Commands

```powershell
npm run staging:export-config
# Review .staging-export/config-manifest.json. Set selected=false for entries that should not move.
# Fill productionInstructorId and productionAccountId for every selected instructor mapping.
# Fill productionCourseId only when a Course must use a different production ID.
$env:CONFIG_PROMOTION_ADMIN_ACCOUNT_ID = '<production-admin-account-id>'
npm run prod:promote-config -- --manifest .staging-export/config-manifest.json --dry-run
npm run prod:promote-config -- --manifest .staging-export/config-manifest.json --apply
```

The export writes only to `.staging-export/`, which is ignored by Git. Do not edit source payloads or hashes to force a promotion: promotion re-exports staging and rejects a stale or altered payload. Operator-controlled logical keys, selection flags, and destination mappings are editable. The exporter creates an instructor slot as `stagingInstructorId -> productionInstructorId + productionAccountId` and a Course slot as `stagingCourseId -> optional productionCourseId`.

The source and target project IDs are pinned in code and checked against the explicit CLI project, Admin app project, and ambient Firebase project settings. Conflicting IDs and emulator routing are rejected. When selected Firebase media exists, configure `CONFIG_PROMOTION_STAGING_STORAGE_BUCKET` and `CONFIG_PROMOTION_PRODUCTION_STORAGE_BUCKET` to that project's default Firebase Storage bucket (`<project>.appspot.com` or `<project>.firebasestorage.app`). No Firebase Auth API is created or called.

## Promotable configuration

Only the following payload fields can enter the manifest:

- `instructors/{id}` public catalog profile: `name`, `specialty`, `languages`, `experienceYears`, `bio`, `avatarUrl`, `pricePerHourKZT`.
- A selected active `courses/{id}` and its `days` form a provisioning input: title, KZT price, total seats, instructor roster, time zone, local day/date/time/duration, and CourseDay IDs. `availableSeats`, enrollments, and runtime metadata are excluded. A new production Course uses `seed_full` capacity.
- `course_catalog_content/{id}` presentation: `duration`, `description`, `dates`, `bgImageUrl`, `isHidden`, `order`, `titleRu`, `shortDescription`, `shortDescriptionRu`, `detailedDescription`, `detailedDescriptionRu`, `badge`, `badgeRu`, `level`, `levelLabel`, `videoUrl`, `benefits`, `benefitsRu`, `program`, `programRu`, `faq`, `faqRu`, and `galleryPhotos`.
- `lesson_pricing_settings/lesson_booking`: `additionalParticipantSurchargePerHourKzt`, `maxParticipantsPerLesson`.
- `settings/skill_config`: `passPercentage` and the explicitly shaped catalog `items`.
- `settings/achievements_config`: the explicitly shaped achievement `items`.
- `settings/instructor_filters`: `enabled`.
- `resort_data/config`: `slides`, `slideIntervalSeconds`, and `slidesRandomOrder` only.

An existing production Course is never updated by this pipeline. Any core Course or CourseDay difference, including schedule, capacity, CourseDay addition/removal, or instructor assignment, is `CONFLICT`; use the separate future Course-change workflow. Presentation content remains independent in `course_catalog_content` and may be created or updated when its production Course exists or is planned for canonical creation. Absence from staging never deletes production data.

## Identity and canonical writes

Instructor mappings are mandatory. The target Instructor and production Account must already exist, be active, parse as their canonical records, and be compatible with each other. Missing mappings or missing production identity bootstrap are `CONFLICT`. A supplied production Account ID is rejected if that document exists in staging or equals the staging Instructor's linked Account ID.

The manifest does not export `linkedAccountId`, any Account ID/Auth UID from staging, ratings, review counters, revisions, or audit fields. Instructor linkage is performed only by canonical `link_account_instructor_catalog`; the public profile is changed only by canonical `update_instructor_catalog_profile`. Course presentation, lesson pricing, and new Courses use their canonical commands. There is no Auth creation.

New Courses use canonical `apply_canonical_course_provisioning_manifest` with a transactional `createOnly` precondition. The command creates production CourseDays and derives resource claims/guards in production. Existing Course resources are never copied. Canonical commands may create their own production audit/outbox/idempotency and admin revision effects; those are newly derived production effects, not imported staging runtime documents.

The settings documents without a canonical write command are written through a Firestore transaction that rechecks the exact target document hash and merges only the allowlisted fields. Unknown fields are preserved.

## Media

Validated public `https://storage.yandexcloud.net/carve/...` URLs are preserved as URL references, without query strings or fragments. Firebase binaries are eligible only for:

- `courses/{stagingCourseId}.webp` used as the course catalog cover;
- `instructors/{stagingInstructorId}.jpg` used as the Instructor avatar;
- flat `banners/{filename}.{png|jpg|jpeg|webp}` references in resort slides.

The source bucket and object path, content hash, and content type are recorded; Firebase download tokens are never put in the manifest. During apply, bytes are re-read and hash-checked, then written with a Storage generation precondition. Course and Instructor media are rewritten to their production ID paths. Banner media uses a content-addressed production path. `image-cache`, `resort_data/cache`, customer/private media, and any unrecognized Storage path are excluded or reported as `CONFLICT`.

## Never promoted

The exporter never reads payload documents from Accounts/users, Participants, bookings, proposals/change requests, enrollments, Attendance, payments, wallets, monetary events, provider receipts, reviews, notifications, chats/messages, AdminIssues, activity logs, domain outbox, command idempotency, test sessions/actors, admin runtime revisions, availability blocks, resource claims/guards, or derived caches. It emits aggregate counts for explicit excluded collections and reads no excluded payloads. `settings/starter_credit` is outside the exporter and requires a separate financial/business-policy workflow.

Staging fixture ownership is honored by exact `ownedFirestorePaths`; TEST scope and `testSessionId` records are excluded. The fixture seed model itself is unchanged in this implementation. Existing synthetic admin/instructor/parent/participant/wallet/Course fixtures remain owned by the current reset manifest and are not promoted. A later seed-model migration should first separate smoke-test actor dependencies from operator-managed live configuration, then update the ownership manifest and verify reset behavior before removing any fixture.

## Dry-run and apply safety

Dry-run prints deterministic `CREATE`, `UPDATE`, `UNCHANGED`, `CONFLICT`, and `SKIP` operations with paths, changed field names, source hashes, and current target hashes. It makes no writes. Apply requires `--apply`, rejects any `CONFLICT` before starting, re-exports staging to detect stale input, and rechecks target preconditions before each mutation group. Canonical commands additionally enforce aggregate revisions; direct config writes compare target hashes inside their transactions; Storage writes use generation preconditions. No delete operation exists. TEST and transactional records are never inputs, and no deploy is part of this workflow.

There is no automatic rollback. Canonical audit history and production state support operator investigation, but recovery is a reviewed forward correction using this workflow or a dedicated Course-change workflow. Do not restore production from the staging manifest.
