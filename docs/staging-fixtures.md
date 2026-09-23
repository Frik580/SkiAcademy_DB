# Staging fixtures

The local staging fixture commands target only the physically separate Firebase project
`ski-school-staging`. They do not read the active Firebase CLI alias. The command exits before any
Auth or Firestore access when the explicit project, Admin SDK project, `FIREBASE_CONFIG`,
`GOOGLE_CLOUD_PROJECT`, or `GCLOUD_PROJECT` disagree, when the project is missing, or when an
emulator host is configured.

## Authentication

Use Application Default Credentials for an identity that has permission to manage Firebase Auth
users and Firestore data in `ski-school-staging`:

```powershell
gcloud auth application-default login
gcloud auth application-default set-quota-project ski-school-staging
```

Do not set `GOOGLE_CLOUD_PROJECT` or `GCLOUD_PROJECT` to another project while running these
commands. No Firebase deployment is required.

## Promote the real staging owner

For a Google account that has already signed into staging and has an active canonical Account, set
its email and promote the existing staging Auth UID:

```powershell
$env:STAGING_OWNER_EMAIL = 'owner@example.com'
npm run staging:grant-owner
```

The command requires an existing Firebase Auth user linked to `google.com`. It updates that user's
existing `/users/{uid}` Account/profile document to `role: admin` and `systemRole: owner`, preserving
the Auth provider linkage and any self Participant or instructor linkage. It never creates an Auth
user, Account, or Participant. `staging:reset` does not own or delete this real owner account.

## Seed

Passwords are intentionally not stored in Git or printed by the command. Set all three variables in
the current PowerShell process, then run the seed:

```powershell
$env:STAGING_ADMIN_PASSWORD = '<local secret, at least 8 characters>'
$env:STAGING_INSTRUCTOR_PASSWORD = '<local secret, at least 8 characters>'
$env:STAGING_PARENT_PASSWORD = '<local secret, at least 8 characters>'
npm run staging:seed
```

The seed is idempotent. A dedicated `staging_fixture_manifests/carve_academy_staging_v1` document
records the exact owned Auth UIDs, Firestore document paths, resource-claim guard entries, and the
future course schedule anchor. Ordinary canonical records use LIVE scope and never use
`testSessionId` or the TestSession/TestActor lifecycle.

## Reset

```powershell
npm run staging:reset
```

Reset validates the manifest against the deterministic ownership plan before deleting anything. It
deletes only the three fixture Auth users and exact fixture documents, removes only the fixture's
entries from shared resource-claim guards, bumps affected admin read-model revision documents, and
then removes the manifest. It does not wipe unrelated staging data or Firebase infrastructure.

The current fixture set creates no Storage objects, so its owned Storage prefix list is empty.

The seeded `staging-admin@carveacademy.local` remains a synthetic fallback owner/admin fixture. The
seed still uses that account as its deterministic administrator command actor, and the reset
manifest owns its Auth UID and fixture documents. Keep it until a later seed revision changes those
actor references and updates the fixture ownership/reset contract; the real staging owner no longer
depends on it for school administration.
