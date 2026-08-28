# Known infrastructure blocker — canonical read-model callables

**Status:** open (infrastructure / IAM)  
**Blocks:** production browser smoke for canonical lesson-booking and collaboration read sync  
**Does not block:** T30A/T30B code completion (tracked separately)

## Summary

`queryLessonBookingReadModels` is currently blocked in production by Cloud Run invocation permissions.

The same `CANONICAL_CALLABLE_OPTIONS` (`invoker: 'public'`) applies to all browser-facing canonical callables in `functions/src/index.ts`:

- `executeCanonicalCommand`
- `executeGuestCanonicalCommand`
- `queryLessonBookingReadModels`
- `queryManagedParticipantPickerReadModels`
- `queryBookingProposalReadModels`
- `queryBookingChangeRequestReadModels`
- `queryParticipantInstructorAccessReadModels`

## Observed behavior

- Browser origin: `http://localhost:3000`
- Preflight `OPTIONS` → `403 Forbidden`
- No `Access-Control-Allow-Origin` header
- Browser consequently reports `POST ... net::ERR_FAILED`

This is an infrastructure/IAM blocker occurring **before** the Firebase callable handler executes.

## Frontend policy (do not work around)

Frontend code must not work around this failure. In particular:

- do not add Firestore fallback reads;
- do not modify `functionsClient.ts` to bypass the callable;
- do not introduce legacy read paths;
- do not weaken canonical authorization.

## Code expectation

`functions/src/index.ts` already declares browser callables with public Cloud Run invoker; auth is enforced inside each handler. Production Cloud Run services must match this deployment configuration.

## Required follow-up

1. Correct Cloud Run invocation access for the canonical callable services (region: `us-central1`).
2. Redeploy functions if the deployed revision predates `invoker: 'public'` on canonical callables.
3. Rerun browser smoke tests for:
   - `/cabinet/calendar` (customer lesson bookings + collaboration reads)
   - `/instructor` (instructor_hot + proposal/change-request reads)
   - coach participant-access panel (participant/instructor access read model)

## Verification

After IAM fix, confirm in browser devtools:

- `OPTIONS` preflight returns `204`/`200` with `Access-Control-Allow-Origin`
- `POST` to the callable succeeds (or returns an application-level auth/error, not `403` at the edge)
