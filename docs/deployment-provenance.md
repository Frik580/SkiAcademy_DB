# Deployment provenance

Hosting and Functions builds record the Git commit that produced the artifact. The commit SHA is the identity. Branch names are not.

A clean artifact can be mapped back to `git rev-parse HEAD`. A dirty working tree is recorded as `dirty: true` and is not treated as that commit. Release deploy commands refuse a dirty tree.

Current production and staging deployments that predate this change have no provenance file or function label. Their source commit stays unverified until the next deploy of that artifact.

## Fields

Public Hosting file `dist/build-info.json`:

| Field               | Meaning                                                                                                 |
| ------------------- | ------------------------------------------------------------------------------------------------------- |
| `commitSha`         | Full Git commit from `git rev-parse HEAD`, or `CARVE_COMMIT_SHA` / `GITHUB_SHA` when Git is unavailable |
| `buildTimestamp`    | UTC time the provenance was generated                                                                   |
| `environment`       | `production`, `staging`, `development`, or `e2e`                                                        |
| `dirty`             | `true` when the build included uncommitted changes, or when cleanliness could not be proven             |
| `firebaseProjectId` | Expected Firebase project for that environment. Public project ids only                                 |

Functions bake `commitSha`, `buildTimestamp`, and `dirty` into the compiled source. The running environment comes from the Firebase project (or the emulator), not from the baked file, because one Functions build can be deployed to staging or production.

These fields do not include secrets, credentials, filesystem paths, usernames, or machine names.

## How it is generated

Hosting: `vite build` writes `dist/build-info.json` through the build plugin. Vite clears `dist` first, so an older manifest is not reused. Firebase Hosting serves that file with `Cache-Control: no-cache, no-store, must-revalidate`. The SPA rewrite does not replace an existing file.

Functions: `npm run build:functions` writes `functions/src/generated/deploymentProvenance.ts` before `tsc`, then checks that the commit and dirty flag did not change during the compile. The file is gitignored. Every function in that build receives the same `commit_sha` and `commit_dirty` Cloud Run labels. A later selective deploy updates only the functions included in that deploy.

SHA lookup order:

1. `git rev-parse HEAD` of the checked-out tree
2. `CARVE_COMMIT_SHA`
3. `GITHUB_SHA`

`git rev-parse HEAD` wins when both Git and `GITHUB_SHA` exist. On GitHub Actions, `actions/checkout` checks out the commit that is built. For `pull_request`, that default checkout is the merge commit, and `GITHUB_SHA` is the same merge commit. A workflow that checks out the PR head instead records that head, because the checked-out commit is the source that was compiled.

If none of the three sources is a full 40-character SHA, the build fails. It does not write `unknown`.

`CARVE_RELEASE=1` also fails when `git status --porcelain` is not empty. `npm run deploy:prod`, `npm run deploy:staging`, `npm run deploy:functions:prod`, and `npm run deploy:functions:staging` set that flag. Ordinary `npm run build` and `npm run build:functions` still succeed on a dirty tree and set `dirty: true`.

| Build                               | Environment | Project               |
| ----------------------------------- | ----------- | --------------------- |
| `vite build` / `npm run build:prod` | production  | `ski-school-8f3ca`    |
| `npm run build:staging`             | staging     | `ski-school-staging`  |
| Vite mode `e2e` or `test`           | e2e         | `demo-ski-school-e2e` |
| Vite mode `development`             | development | none                  |
| Functions on `ski-school-8f3ca`     | production  | `ski-school-8f3ca`    |
| Functions on `ski-school-staging`   | staging     | `ski-school-staging`  |
| Functions emulator                  | e2e         | the emulator project  |

## Automatic verification after release deploys

`npm run deploy:staging`, `npm run deploy:prod`, `npm run deploy:functions:staging`, and `npm run deploy:functions:prod` run provenance verification automatically after a successful Firebase deploy. If the deploy command fails, verification does not run. If the deploy succeeds but verification fails, the release command exits non-zero and prints `Deployment completed, but provenance verification failed.` The deploy is not rolled back.

Hosting release commands verify Hosting only. Functions release commands verify Functions only, so a Functions deploy is not failed by Hosting that legitimately remains on another commit.

Post-deploy verification retries briefly when Cloud Run or Hosting metadata may still show the previous revision. Manual `deploy:verify` stays read-only and does not retry.

## Manual verification (diagnostics)

All verify commands are read-only. They do not deploy or mutate Firebase.

### Hosting only

From a clean checkout:

```text
npm run deploy:verify -- --environment production
npm run deploy:verify -- --environment staging
```

Exit `0` means the live Hosting manifest matches local `HEAD`, is clean, names the requested environment and project, and is served with a revalidation cache header. Any other result exits non-zero.

The command runs Node with `--use-system-ca`, which adds the operating system trust store to Node's bundled certificate authorities. Certificate validation stays enabled. Application runtime TLS is unchanged.

`Functions NOT CHECKED` means Functions were not part of this command. Hosting MATCH is not Functions MATCH.

A mismatch can mean a different commit, a dirty build, staging content on the production host, or a response that can be cached.

### Functions only

```text
npm run deploy:verify -- --environment production --functions-only
npm run deploy:verify -- --environment staging --functions-only
```

Optional selective scope after a single-function deploy:

```text
npm run deploy:verify -- --environment production --functions-only --function executeCanonicalCommand
npm run deploy:verify -- --environment production --functions-only --function foo,bar
```

This lists Cloud Run services for the Firebase project in `us-central1` and reads each service's `commit_sha` and `commit_dirty` labels. It requires `gcloud` authentication. Hosting is not checked.

### Full environment audit (Hosting + Functions)

```text
npm run deploy:verify -- --environment production --functions
npm run deploy:verify -- --environment staging --functions
```

Functions MATCH in this mode means every discovered function service has the same clean SHA as local `HEAD`. A selective deploy can leave functions on different commits. The command prints one line per service and does not hide that split behind a single match.

Services deployed before this change have no commit label and are reported as `UNVERIFIED`.

`K_REVISION` is the Cloud Run revision name. It is not the Git commit.

## Local artifacts

After `npm run build`, `dist/build-info.json` is the Hosting manifest.

After `npm run build:functions`, `functions/src/generated/deploymentProvenance.ts` is the Functions manifest. Neither file is tracked.
