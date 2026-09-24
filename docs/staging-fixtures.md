# Staging configuration and smoke fixtures

`ski-school-staging` is the pre-production environment for authoring real school configuration.
Operator configuration is created through staging Admin and may later be promoted through the
reviewed configuration promotion flow.

## Operator configuration

The staging owner, real instructors, courses, CourseDays, banners, catalog content, pricing, and
other school settings are operator-owned. Create and verify them manually in staging Admin. They
survive `staging:reset` and may be eligible for production promotion under the existing promotion
allowlist and safety checks.

The real Google owner is provisioned separately. For a Google account that has already signed into
staging and has an active canonical Account, set its email and promote the existing staging Auth UID:

```powershell
$env:STAGING_OWNER_EMAIL = 'owner@example.com'
npm run staging:grant-owner
```

The command requires an existing Firebase Auth user linked to `google.com`. It updates that user's
existing `/users/{uid}` Account/profile document to `role: admin` and `systemRole: owner`, preserving
the Auth provider linkage and any self Participant or instructor linkage. Neither fixture seed nor
fixture reset owns this Google account or its data.

## Smoke/E2E fixtures

The fixture seed creates only synthetic client smoke data:

- a synthetic parent Account and parent self Participant;
- Alex Staging and Mia Staging with their participant-management ownership records;
- a canonical parent Wallet funded with 1,000,000 KZT and its canonical monetary event;
- the deterministic command and audit/idempotency records produced by those canonical commands.

The seed creates no synthetic Instructor catalog entry, Course, CourseDay, course catalog content,
course scheduling claim, or resource claim guard. These smoke fixtures are fixture-owned, resettable,
and never eligible for promotion.

`staging-admin@carveacademy.local` remains an internal fixture command actor because canonical
dependent-participant creation and manual wallet funding require an administrator actor. Its Account
and Auth identity are fixture-owned and resettable. It is not the real school owner, is not assigned
`systemRole: owner`, and has no self Participant. It is not a school configuration or promotion
mapping.

The local fixture commands target only the physically separate Firebase project `ski-school-staging`.
They do not read the active Firebase CLI alias. The command exits before any Auth or Firestore access
when the explicit project, Admin SDK project, `FIREBASE_CONFIG`, `GOOGLE_CLOUD_PROJECT`, or
`GCLOUD_PROJECT` disagree, when the project is missing, or when an emulator host is configured.

Use Application Default Credentials for an identity that has permission to manage Firebase Auth
users and Firestore data in `ski-school-staging`:

```powershell
gcloud auth application-default login
gcloud auth application-default set-quota-project ski-school-staging
```

Do not set `GOOGLE_CLOUD_PROJECT` or `GCLOUD_PROJECT` to another project while running these
commands. No Firebase deployment is required.

Set the two local passwords in the current PowerShell process, then run the seed:

```powershell
$env:STAGING_ADMIN_PASSWORD = '<local secret, at least 8 characters>'
$env:STAGING_PARENT_PASSWORD = '<local secret, at least 8 characters>'
npm run staging:seed
```

The seed is idempotent. Its v2 manifest is stored at
`staging_fixture_manifests/carve_academy_staging_v2` and records the exact owned Auth UIDs and
Firestore paths. Canonical records use LIVE scope and never use `testSessionId` or the
TestSession/TestActor lifecycle.

## Reset and v1 migration

```powershell
npm run staging:reset
```

Reset validates the stored manifest against its exact definition version before deleting anything.
It deletes only the listed fixture Auth users and Firestore documents, removes only listed fixture
claim entries from shared resource-claim guards, bumps affected admin read-model revision documents,
and removes that manifest. It does not wipe unrelated staging data or Firebase infrastructure.

Reset recognizes the deployed v1 manifest and its deterministic ownership plan, including its
synthetic instructor, two courses, catalog content, CourseDays, claims, and guard entries. Seed refuses
to create v2 while a v1 manifest still exists. For the one-time fixture migration, run:

```powershell
npm run staging:reset
npm run staging:seed
```

After reset, manually authored instructors, courses, CourseDays, course catalog content, banners,
pricing/settings, resort slides, skills configuration, achievements configuration, manually created
Accounts, and the real Google owner remain untouched. No transactional smoke-test data is deleted
unless it is listed in a validated fixture manifest.

The current fixture set creates no Storage objects, so its owned Storage prefix list is empty.
