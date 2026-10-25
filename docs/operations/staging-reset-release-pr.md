Staging contains disposable business fixtures with LIVE scope. This change prepares
an exact-manifest reset that preserves Auth identities, canonical Accounts, access,
profiles and configuration without relabeling LIVE records or weakening canonical
scope checks. Staging apply/bootstrap require verified actual SDK ADC, read-only preflight, separate exact terminal owner confirmations and a transactional lease. Production remains hard-denied.

The reviewed snapshot contains 2476 documents: 1845 delete, 21 narrowly patch and 610
unchanged. All five Auth users remain; 18 pre-start Enrollments allow capacity rebuild.
Started Courses block deletion. Starter grant tombstones prevent duplicate credit;
all 20 image-cache objects remain. Typed recovery exports and checkpoint/resume
checks support local recovery rehearsals; unknown ownership or drift fails closed.

Delayed Enrollment/Guest events could recreate work after deletion. Current-source
transactional checks prevent that, while existing obligations retain their handling.
The five affected staging exports are syncCourseEnrollmentOutcomeWork,
syncGuestBookingConfirmationWork, syncGuestEnrollmentConfirmationWork,
syncGuestPaymentConfirmationWork and scheduledReconcileGuestConfirmationMismatches.
The latter reaches the changed helper through recovery. No runtime/SA/invoker/caps,
Rules, indexes, Hosting, production deployment or new Scheduler job is intended.

CI now requires Auth/Firestore/Storage reset rehearsals with no skipped tests;
read-only release comparison checks revisions, traffic, provenance, IAM and saved
operational configuration. The Functions emulator job budget increases to 35 minutes.
Local validation: **56/56 emulator scenarios PASS in one complete invocation**
after the final fix, zero skipped, wrapper exit 0. All 41 unit and 19
comparator/network tests PASS. Functions build, app TypeScript, lint (zero errors),
targeted lint, Graphify and independent review PASS. Production CLI apply/bootstrap
reject before manifest/ADC access; cloud automatic test-IO injection is denied.
Human identity remains an explicit terminal attestation. Prior actual read-only
SDK ADC verification PASS; this Git release performs no cloud operations.

CI checks out the exact PR head SHA in all 8 source jobs. Functions build precedes
unit tests requiring compiled canonical adapters. All 9 jobs, including `quality`,
must pass on the exact PR head after publication. The active repository ruleset explicitly requires `Playwright E2E` and `quality`; merge is not authorized.

Risks: reset is a Firestore checkpoint/Storage saga, not an atomic whole-operation
transaction; delayed writers and external credentials remain operational risks.
Snapshot exports are not managed cross-service backups. Existing LIVE Guest work
is unsupported and blocks planning. The one-use approval expires within 15 minutes and is bound to project/database/bucket, operation, manifest and plan. Every transaction reads the lease; checkpoints bind content hashes and update times. Resume needs fresh confirmation of the original manifest. Merging/deploying never grants operational permission. No reset/migration marker is written here.

Rollback: revert PR for source only; separately redeploy the five previous handlers
only before reset starts. After reset starts, keep protected handlers/window and
use the immutable journal/reviewed recovery plan; source rollback does not restore
data and old handlers may recreate work. No automatic rollback/unpause.

Approval packages, exact commands, retained-state verification and stop conditions:
[staging reset release plan](staging-reset-release.md). Git, targeted staging deploy,
reset and empty Attendance bootstrap require separate approvals. Historical Attendance
WIP is excluded. Git commit/push/PR is separately authorized after local PASS; merge, deploy, cloud mutations and Scheduler operations remain prohibited.

Authorization adapter source passed the complete local publication gate; operational execution still needs separate permissions and fresh window evidence. The exact
release scope is the original 30 paths plus six adapter paths; the three historical
Attendance WIP paths remain excluded. Cloud Storage deletion is deliberately
unsupported by this adapter; the LIVE plan preserves all objects. Bounded audit
history retains reset and bootstrap approvals without personal data. Human owner
identity is a terminal attestation, not cryptographically authenticated; Google
operator identity is checked against actual tokens of all SDK clients.
