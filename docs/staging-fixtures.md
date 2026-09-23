# Staging fixtures

The local staging fixture commands target only the physically separate Firebase project
`ski-school-staging`. They do not read the active Firebase CLI alias. The command exits before any
Auth or Firestore mutation when the explicit project, Admin SDK project, `GOOGLE_CLOUD_PROJECT`, or
`GCLOUD_PROJECT` disagree, when the project is missing, or when an emulator host is configured.

## Authentication

Use Application Default Credentials for an identity that has permission to manage Firebase Auth
users and Firestore data in `ski-school-staging`:

```powershell
gcloud auth application-default login
gcloud auth application-default set-quota-project ski-school-staging
```

Do not set `GOOGLE_CLOUD_PROJECT` or `GCLOUD_PROJECT` to another project while running these
commands. No Firebase deployment is required.

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
